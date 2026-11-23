import * as ort from 'onnxruntime-web';
import type { CutStage } from './jobStatus';
import { cropBox, cutoutWarning, finishCutout, maskStats, touchesEdge, type Box, type MaskStats } from './maskRefine';

/**
 * Background removal, in the browser.
 *
 * Licence drove the choice. @imgly/background-removal is the obvious package
 * but it is AGPL-3.0, which would oblige us to publish this portal's source to
 * anyone who loads it. briaai/RMBG-1.4 is non-commercial. U^2-Net is Apache-2.0
 * and onnxruntime-web is MIT, so this combination is clean for commercial use.
 *
 * The model is served from our own bucket rather than a CDN, so nothing
 * third-party sits in the path of the studio's daily work.
 *
 * Tested on real product photography 2026-10-01: clean cutouts on full-rug and
 * cushion shots, but a pale low-contrast piece lost almost all of itself, and
 * full-bleed texture crops have no background to find at all. So every result
 * must be shown to a human before it is kept — this never runs blind.
 */

const MODEL =
  'https://storage.googleapis.com/easternmillscom.firebasestorage.app/studio-portal/models/u2netp.onnx';
const SIZE = 320; // what u2netp was trained on
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let sessionPromise: Promise<ort.InferenceSession> | null = null;
/** The model is in memory, so the first-time download step is skipped. */
let loaded = false;

function loadSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    ort.env.wasm.numThreads = 1; // no cross-origin isolation headers on the site
    sessionPromise = ort.InferenceSession.create(MODEL, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    }).catch((e) => {
      sessionPromise = null; // let a later attempt retry rather than fail forever
      throw e;
    });
  }
  return sessionPromise;
}

/**
 * The onnx runtime is ~6.7 MB gzipped and the model another 4.4 MB, so nothing
 * is fetched until someone actually asks for a cut-out. Exported for a future
 * caller that wants to prefetch; deliberately not called on mount.
 */
export function warmUp() {
  loadSession().catch(() => {});
}

/** The model's input: a region of the image squeezed to SIZE x SIZE. */
function draw(img: ImageBitmap, sx: number, sy: number, sw: number, sh: number): ImageData {
  const c = document.createElement('canvas');
  c.width = SIZE; c.height = SIZE;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, SIZE, SIZE);
  return ctx.getImageData(0, 0, SIZE, SIZE);
}

/** Runs the model on a region of the image; the mask comes back as a SIZE x SIZE canvas, 0..255 grey. */
async function runModel(session: ort.InferenceSession, img: ImageBitmap, sx: number, sy: number, sw: number, sh: number): Promise<HTMLCanvasElement> {
  const small = draw(img, sx, sy, sw, sh);
  const input = new Float32Array(3 * SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    for (let c = 0; c < 3; c++) {
      input[c * SIZE * SIZE + i] = (small.data[i * 4 + c] / 255 - MEAN[c]) / STD[c];
    }
  }
  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]) });
  const raw = out[session.outputNames[0]].data as Float32Array;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < SIZE * SIZE; i++) { const v = raw[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = hi - lo || 1;
  const mc = document.createElement('canvas');
  mc.width = SIZE; mc.height = SIZE;
  const mctx = mc.getContext('2d')!;
  const mimg = mctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const v = Math.round(((raw[i] - lo) / span) * 255);
    mimg.data[i * 4] = v; mimg.data[i * 4 + 1] = v; mimg.data[i * 4 + 2] = v; mimg.data[i * 4 + 3] = 255;
  }
  mctx.putImageData(mimg, 0, 0);
  return mc;
}

/** A SIZE x SIZE mask stretched (bilinear) onto box `b` of a w x h frame, zero elsewhere. */
function placeMask(mask: HTMLCanvasElement, w: number, h: number, b: Box): Uint8Array {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(mask, 0, 0, SIZE, SIZE, b.x, b.y, b.w, b.h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4];
  return out;
}

/**
 * The clean-up (guided filter, alpha, edge colour) in a worker, or here if a
 * worker cannot start. Takes the photo's pixels and gives back the cutout's.
 */
function refine(rgba: Uint8ClampedArray, mask: Uint8Array, w: number, h: number): Promise<Uint8ClampedArray> {
  return new Promise((resolve) => {
    const here = () => resolve(finishCutout(rgba, mask, w, h));
    let worker: Worker;
    try {
      worker = new Worker(new URL('./maskRefine.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      here();
      return;
    }
    worker.onmessage = (e: MessageEvent<Uint8ClampedArray>) => { worker.terminate(); resolve(e.data); };
    worker.onerror = () => { worker.terminate(); here(); };
    // a copy goes to the worker, so the fallback still has the original pixels
    worker.postMessage({ rgba, mask, w, h });
  });
}

export interface Cutout {
  file: File;
  /** Share of the frame kept, percent. */
  keptPct: number;
  /** Why the cutout needs a human look, or null. */
  warning: string | null;
  stats: MaskStats;
  /** Whether the model was run a second time on the rug's own crop. */
  cropRerun: boolean;
}

/**
 * Returns a PNG with the background knocked out, at up to `maxSide`.
 *
 * 1. The model on the whole photo (320 x 320), stretched to the output size.
 * 2. Unless that mask touches the edge of the frame (a full-bleed or cut-off
 *    shot, where it made things worse in testing), the model again on a crop
 *    around the rug, taken from the full-resolution photo, so the rug fills
 *    the model's input and the edge is sharper.
 * 3. A guided filter against the photo at the output size snaps the mask to
 *    the rug's real edge, and the part see-through edge pixels take the rug's
 *    colour instead of the floor's, so no pale halo is left (`maskRefine.ts`).
 * The mask stats then decide the tile's "Check this" note.
 */
export async function removeBackground(
  file: File, maxSide = 2000, onStage?: (s: CutStage) => void
): Promise<Cutout> {
  const t0 = performance.now();
  // Each step is named on the tile, and the browser gets a frame to paint
  // it before the model (which runs on this thread) takes over.
  const stage = async (s: CutStage) => {
    if (!onStage) return;
    onStage(s);
    await new Promise<void>((ok) => requestAnimationFrame(() => setTimeout(ok, 0)));
  };
  if (!loaded) await stage('model');
  const session = await loadSession();
  loaded = true;
  await stage('finding');
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const whole: Box = { x: 0, y: 0, w, h };

  let mask = placeMask(await runModel(session, bmp, 0, 0, bmp.width, bmp.height), w, h, whole);
  const t1 = performance.now();
  let cropRerun = false;
  const box = touchesEdge(mask, w, h) ? null : cropBox(mask, w, h);
  if (box && (box.w < w || box.h < h)) {
    await stage('edge');
    const k = bmp.width / w;
    mask = placeMask(await runModel(session, bmp, box.x * k, box.y * k, box.w * k, box.h * k), w, h, box);
    cropRerun = true;
  }
  const t2 = performance.now();
  await stage('cleanup');

  const full = document.createElement('canvas');
  full.width = w; full.height = h;
  const fctx = full.getContext('2d', { willReadFrequently: true })!;
  fctx.imageSmoothingQuality = 'high';
  fctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const colour = fctx.getImageData(0, 0, w, h);
  const done = await refine(colour.data, mask, w, h);
  const t3 = performance.now();
  fctx.putImageData(new ImageData(new Uint8ClampedArray(done), w, h), 0, 0);
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = done[i * 4 + 3];

  await stage('saving');
  const blob: Blob = await new Promise((res, rej) =>
    full.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode the cut-out.'))), 'image/png')
  );
  const stats = maskStats(alpha, w, h);
  // Timings for checking speed on a real build (Performance panel); no UI.
  try {
    performance.measure('bgremove:model', { start: t0, end: t1 });
    performance.measure('bgremove:crop-rerun', { start: t1, end: t2 });
    performance.measure('bgremove:refine', { start: t2, end: t3 });
    performance.measure('bgremove:total', { start: t0, end: performance.now() });
  } catch { /* older browsers */ }
  const name = file.name.replace(/\.[^.]+$/, '') + '-cutout.png';
  return {
    file: new File([blob], name, { type: 'image/png' }),
    keptPct: stats.keptPct,
    warning: cutoutWarning(stats),
    stats,
    cropRerun,
  };
}
