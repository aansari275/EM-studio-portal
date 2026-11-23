/**
 * How big a PNG cutout may be when it is stored, and how to get it there.
 * Pure, so the decision is unit tested; the pixels are done in `pngFit.ts`.
 *
 * The owner's rule (23 Nov 2026): a PNG cutout is stored at 3 MB at most and
 * 2000px on the long side at most. One that already fits goes up as it is,
 * byte for byte. One that does not is resized once to an estimated scale,
 * with one or two corrective passes if the estimate was short, never an open
 * loop. `browser-image-compression` used to do this by shrinking a PNG step by
 * step (PNG has no quality setting), which took 17 s on one photo and stored
 * it far smaller than needed.
 */

export const MB = 1024 * 1024;
/** Hard cap per stored PNG. */
export const MAX_PNG_BYTES = 3 * MB;
/** Long side cap, the same as every other upload in the portal. */
export const MAX_SIDE = 2000;
/** At most this many encodes per file. */
export const MAX_PASSES = 3;
/** Aim this far under the cap, per pass, because PNG size does not follow pixel count exactly. */
const MARGINS = [0.9, 0.85, 0.7];

export type PngFitPlan =
  | { keep: true }
  | { keep: false; width: number; height: number; scale: number };

const dims = (width: number, height: number, scale: number) => ({
  width: Math.max(1, Math.round(width * scale)),
  height: Math.max(1, Math.round(height * scale)),
});

/**
 * First decision for a PNG of `bytes` at `width` x `height`: keep it, or the
 * size to resize it to. The scale is the smaller of what the long side needs
 * and what the bytes need, assuming bytes scale with pixel count.
 */
export function planPngFit(bytes: number, width: number, height: number): PngFitPlan {
  const long = Math.max(width, height);
  const sideScale = long > MAX_SIDE ? MAX_SIDE / long : 1;
  if (bytes <= MAX_PNG_BYTES && sideScale === 1) return { keep: true };
  const byteScale = bytes > MAX_PNG_BYTES * MARGINS[0]
    ? Math.sqrt((MAX_PNG_BYTES * MARGINS[0]) / bytes) : 1;
  const scale = Math.min(sideScale, byteScale);
  return { keep: false, scale, ...dims(width, height, scale) };
}

/**
 * After pass `pass` (1 based) at `scale` came out at `outBytes`: null when it
 * fits or the passes are used up, else the next, smaller size. The scale is
 * always relative to the source photo, so passes never compound blur.
 */
export function nextPngPass(
  pass: number, scale: number, outBytes: number, width: number, height: number
): { width: number; height: number; scale: number } | null {
  if (outBytes <= MAX_PNG_BYTES || pass >= MAX_PASSES) return null;
  const margin = MARGINS[Math.min(pass, MARGINS.length - 1)];
  const next = scale * Math.sqrt((MAX_PNG_BYTES * margin) / outBytes);
  return { scale: next, ...dims(width, height, next) };
}

/**
 * Width and height from a PNG's IHDR chunk, without decoding the image.
 * Null when the bytes are not a PNG.
 */
export function pngSize(head: Uint8Array): { width: number; height: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (head.length < 24 || sig.some((b, i) => head[i] !== b)) return null;
  // IHDR is always the first chunk: length(4) "IHDR"(4) width(4) height(4)
  if (String.fromCharCode(head[12], head[13], head[14], head[15]) !== 'IHDR') return null;
  const u32 = (o: number) => ((head[o] << 24) | (head[o + 1] << 16) | (head[o + 2] << 8) | head[o + 3]) >>> 0;
  const width = u32(16), height = u32(20);
  return width && height ? { width, height } : null;
}

/** 5.1 MB, 870 KB. */
export function formatBytes(n: number): string {
  if (n >= MB) return `${(n / MB).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** "5.1 MB to 2.8 MB" for a file that was reduced, else "". */
export function sizeNote(from: number, to: number): string {
  return to < from ? `${formatBytes(from)} to ${formatBytes(to)}` : '';
}
