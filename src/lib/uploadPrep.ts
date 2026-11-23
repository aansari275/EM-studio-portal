import { uploadBytesResumable, type StorageReference, type UploadMetadata } from 'firebase/storage';
import { nextPngPass, planPngFit, pngSize, sizeNote } from './cutoutSize';

/**
 * Getting a photo ready for Storage, with a status for the tile at each step.
 *
 * PNG (in this portal a PNG is a cutout with transparency, see photo intake):
 * the 3 MB / 2000px rule in `cutoutSize.ts`. Already within it = the bytes go
 * up untouched. Otherwise one resize in a worker, plus at most two corrective
 * passes. JPEG: `browser-image-compression` exactly as before (2000px, 2 MB).
 */

export type UploadStatus =
  | { stage: 'reducing' }
  | { stage: 'uploading'; pct: number; note?: string };

export interface Prepared {
  body: Blob;
  type: string;
  width: number;
  height: number;
  /** "5.1 MB to 2.8 MB" when the file was reduced. */
  note: string;
  /** Encodes run on a PNG (0 = uploaded as it was). */
  passes: number;
}

/** Let the browser paint the status before heavy work starts. */
export const nextPaint = () => new Promise<void>((ok) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(ok, 0));
  else setTimeout(ok, 0);
});

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, (r: { ok: boolean; blob?: Blob; error?: string }) => void>();

function resizeInWorker(file: Blob, width: number, height: number): Promise<Blob> {
  if (!worker) {
    worker = new Worker(new URL('./pngFit.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const done = waiting.get(e.data.id); waiting.delete(e.data.id); done?.(e.data); };
    worker.onerror = () => { const all = [...waiting.values()]; waiting.clear(); worker = null; all.forEach((d) => d({ ok: false, error: 'worker failed' })); };
  }
  const id = seq++;
  return new Promise((resolve, reject) => {
    waiting.set(id, (r) => (r.ok && r.blob ? resolve(r.blob) : reject(new Error(r.error || 'Could not resize the photo.'))));
    worker!.postMessage({ id, file, width, height });
  });
}

async function resizeOnPage(file: Blob, width: number, height: number): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('Could not encode the photo.'))), 'image/png'));
}

const canUseWorker = () => typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';

async function resizePng(file: Blob, width: number, height: number): Promise<Blob> {
  if (canUseWorker()) {
    try { return await resizeInWorker(file, width, height); } catch { /* fall back to the page */ }
  }
  return resizeOnPage(file, width, height);
}

async function decodedSize(b: Blob): Promise<{ width: number; height: number }> {
  try {
    const bmp = await createImageBitmap(b);
    const s = { width: bmp.width, height: bmp.height };
    bmp.close();
    return s;
  } catch {
    return { width: 0, height: 0 };
  }
}

/** The PNG rule. Exported for the harness and tests in the browser. */
export async function fitPng(file: Blob, onStatus?: (s: UploadStatus) => void): Promise<Prepared> {
  const head = new Uint8Array(await file.slice(0, 33).arrayBuffer());
  const src = pngSize(head) || await decodedSize(file);
  const plan = src.width ? planPngFit(file.size, src.width, src.height) : { keep: true as const };
  if (plan.keep) return { body: file, type: 'image/png', ...src, note: '', passes: 0 };

  onStatus?.({ stage: 'reducing' });
  await nextPaint();
  let step = { width: plan.width, height: plan.height, scale: plan.scale };
  let out = await resizePng(file, step.width, step.height);
  let passes = 1;
  for (let n = nextPngPass(passes, step.scale, out.size, src.width, src.height); n;
    n = nextPngPass(passes, step.scale, out.size, src.width, src.height)) {
    step = n;
    out = await resizePng(file, step.width, step.height);
    passes++;
  }
  return { body: out, type: 'image/png', width: step.width, height: step.height, note: sizeNote(file.size, out.size), passes };
}

/**
 * Any photo for upload. `jpegType` passes `fileType` to the JPEG compressor
 * (entries did, Library did not; the result is the same type either way).
 */
export async function prepareUpload(
  file: File, onStatus?: (s: UploadStatus) => void, opts: { jpegType?: boolean } = {}
): Promise<Prepared> {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  if (isPng || file.type === 'image/png') {
    try {
      return await fitPng(file, onStatus);
    } catch {
      const s = await decodedSize(file);
      return { body: file, type: 'image/png', ...s, note: '', passes: 0 };
    }
  }
  const type = file.type || 'image/jpeg';
  let body: Blob = file;
  onStatus?.({ stage: 'reducing' });
  await nextPaint();
  try {
    const imageCompression = (await import('browser-image-compression')).default;
    body = await imageCompression(file, {
      maxWidthOrHeight: 2000, maxSizeMB: 2, useWebWorker: true, ...(opts.jpegType ? { fileType: type } : {}),
    });
  } catch {
    /* compression is a nicety; upload the original rather than fail */
  }
  const s = await decodedSize(body);
  return { body, type: body.type || type, ...s, note: sizeNote(file.size, body.size), passes: 0 };
}

/** uploadBytes with progress for the tile. */
export function uploadWithProgress(
  sref: StorageReference, body: Blob, meta: UploadMetadata,
  onStatus?: (s: UploadStatus) => void, note = ''
): Promise<void> {
  onStatus?.({ stage: 'uploading', pct: 0, ...(note ? { note } : {}) });
  return new Promise((ok, no) => {
    const task = uploadBytesResumable(sref, body, meta);
    task.on('state_changed',
      (snap) => onStatus?.({ stage: 'uploading', pct: snap.totalBytes ? snap.bytesTransferred / snap.totalBytes : 0, ...(note ? { note } : {}) }),
      no,
      () => ok());
  });
}
