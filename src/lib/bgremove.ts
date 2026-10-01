import * as ort from 'onnxruntime-web';

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

function draw(img: HTMLImageElement | ImageBitmap, w: number, h: number): ImageData {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img as CanvasImageSource, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

async function decode(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

/**
 * Returns a PNG with the background knocked out, plus how much of the frame
 * survived. A very low or very high share is the signal that it went wrong.
 */
export async function removeBackground(
  file: File,
  maxSide = 2000
): Promise<{ file: File; keptPct: number }> {
  const session = await loadSession();
  const bmp = await decode(file);

  // full-size canvas we will composite onto
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));

  // model input, always square
  const small = draw(bmp, SIZE, SIZE);
  const input = new Float32Array(3 * SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    for (let c = 0; c < 3; c++) {
      input[c * SIZE * SIZE + i] = (small.data[i * 4 + c] / 255 - MEAN[c]) / STD[c];
    }
  }

  const feeds: Record<string, ort.Tensor> = {
    [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]),
  };
  const out = await session.run(feeds);
  const raw = out[session.outputNames[0]].data as Float32Array;

  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < SIZE * SIZE; i++) { const v = raw[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = hi - lo || 1;

  // mask back up to full size, bilinear via canvas
  const mc = document.createElement('canvas');
  mc.width = SIZE; mc.height = SIZE;
  const mctx = mc.getContext('2d')!;
  const mimg = mctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const v = Math.round(((raw[i] - lo) / span) * 255);
    mimg.data[i * 4] = v; mimg.data[i * 4 + 1] = v; mimg.data[i * 4 + 2] = v; mimg.data[i * 4 + 3] = 255;
  }
  mctx.putImageData(mimg, 0, 0);

  const full = document.createElement('canvas');
  full.width = w; full.height = h;
  const fctx = full.getContext('2d', { willReadFrequently: true })!;
  fctx.drawImage(bmp as CanvasImageSource, 0, 0, w, h);
  const colour = fctx.getImageData(0, 0, w, h);

  fctx.clearRect(0, 0, w, h);
  fctx.drawImage(mc, 0, 0, w, h);
  const maskUp = fctx.getImageData(0, 0, w, h);

  let kept = 0;
  for (let i = 0; i < w * h; i++) {
    const a = maskUp.data[i * 4];
    colour.data[i * 4 + 3] = a;
    if (a > 128) kept++;
  }
  fctx.putImageData(colour, 0, 0);
  bmp.close?.();

  const blob: Blob = await new Promise((res, rej) =>
    full.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode the cut-out.'))), 'image/png')
  );
  const name = file.name.replace(/\.[^.]+$/, '') + '-cutout.png';
  return {
    file: new File([blob], name, { type: 'image/png' }),
    keptPct: Math.round((100 * kept) / (w * h)),
  };
}
