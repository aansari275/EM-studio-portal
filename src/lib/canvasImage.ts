import { encodingFor, type Px } from './photoEdit';

/**
 * The thin canvas layer between files and the pure pixel maths in photoEdit.
 * Decoding, drawing, and encoding back to a file live here so photoEdit stays
 * free of the DOM.
 */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('This browser cannot edit photos.');
  return [c, ctx];
}

/** Size that fits `maxSide` on the long side, never enlarging. */
export function fitSize(w: number, h: number, maxSide: number): [number, number] {
  const k = Math.min(1, maxSide / Math.max(w, h));
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
}

/** Draws an image into a fresh pixel buffer, scaled to fit `maxSide`. */
export function pixelsOf(img: ImageBitmap | HTMLImageElement, maxSide: number): Px {
  const iw = 'naturalWidth' in img ? img.naturalWidth : img.width;
  const ih = 'naturalHeight' in img ? img.naturalHeight : img.height;
  const [w, h] = fitSize(iw, ih, maxSide);
  const [, ctx] = canvas(w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: d.data };
}

/** Draws an image into a fresh pixel buffer of exactly w x h (it may be stretched to fit). */
export function pixelsAt(img: ImageBitmap | HTMLImageElement, w: number, h: number): Px {
  const [, ctx] = canvas(w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return { width: w, height: h, data: ctx.getImageData(0, 0, w, h).data };
}

/**
 * Copies the transparency of `mask` (drawn at px's size, smoothly scaled) into
 * px, in place. Used to put a cutout's mask onto the full-resolution photo it
 * was cut from.
 */
export function takeAlpha(px: Px, mask: ImageBitmap | HTMLImageElement): void {
  const [, ctx] = canvas(px.width, px.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(mask, 0, 0, px.width, px.height);
  const m = ctx.getImageData(0, 0, px.width, px.height).data;
  const d = px.data;
  for (let i = 3; i < d.length; i += 4) d[i] = m[i];
}

/** The first `n` bytes of a file, for reading its EXIF. */
export async function headOf(file: Blob, n = 256 * 1024): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, n).arrayBuffer());
}

export function decode(blob: Blob): Promise<ImageBitmap> {
  // premultiplyAlpha 'none' keeps the colour under semi-transparent cutout edges
  return createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'default' })
    .catch(() => createImageBitmap(blob));
}

export function paint(target: HTMLCanvasElement, px: Px) {
  target.width = px.width;
  target.height = px.height;
  const ctx = target.getContext('2d');
  if (!ctx) return;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(px.data), px.width, px.height), 0, 0);
}

/** Encodes pixels as PNG when anything is transparent, otherwise JPEG at 0.92. */
export async function encode(px: Px): Promise<{ blob: Blob; type: string; ext: string }> {
  const enc = encodingFor(px);
  const [c, ctx] = canvas(px.width, px.height);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(px.data), px.width, px.height), 0, 0);
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, enc.type, enc.quality));
  if (!blob) throw new Error('Could not save the photo.');
  return { blob, type: enc.type, ext: enc.ext };
}

/**
 * Turns an image by quarter turns (1 = 90 degrees clockwise), capped at
 * `maxSide`. A photo with any transparency comes back as PNG with the
 * transparency kept; before this, every turn was re-encoded as JPEG with no
 * fill, which turned a cutout's background black.
 */
export async function rotateBlob(
  blob: Blob,
  quarterTurns: number,
  maxSide = 2000
): Promise<{ blob: Blob; type: string; ext: string }> {
  const turns = ((quarterTurns % 4) + 4) % 4;
  const bmp = await decode(blob);
  const [w, h] = fitSize(bmp.width, bmp.height, maxSide);
  const side = turns % 2 === 1;
  const [c, ctx] = canvas(side ? h : w, side ? w : h);
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((turns * Math.PI) / 2);
  ctx.drawImage(bmp, -w / 2, -h / 2, w, h);
  bmp.close();
  const d = ctx.getImageData(0, 0, c.width, c.height);
  return encode({ width: c.width, height: c.height, data: d.data });
}
