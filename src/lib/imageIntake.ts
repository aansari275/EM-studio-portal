import {
  FORMAT_LABEL, NATIVE, RAW, SNIFF_BYTES, findEmbeddedJpegs, jpegOrientation, sniffFormat, tiffOrientation,
  type ImageFormat,
} from './imageFormat';

/**
 * Photo intake: every photo the studio adds goes through `normaliseImage`
 * first, so format is never the reason a photo fails. What comes out is a
 * JPEG, or a PNG when the picture has transparency, upright and at full
 * resolution, which the rest of the pipeline (background removal, editor,
 * compression, upload, decks) uses unchanged.
 *
 * - JPG and PNG pass through untouched, except a JPG whose EXIF says it is
 *   turned, which is redrawn upright (phone photos).
 * - WebP, GIF (first frame), BMP and AVIF are decoded by the browser.
 * - HEIC/HEIF: the browser where it can (Safari), otherwise libheif in wasm
 *   (`heic-to`, LGPL-3.0, loaded only when a HEIC arrives).
 * - TIFF: `utif2` (MIT, loaded only when a TIFF arrives).
 * - Camera RAW: the camera's own full-size JPEG preview inside the file, when
 *   it has one of at least MIN_RAW_PREVIEW on the long side. No RAW
 *   development is attempted.
 */

export class IntakeError extends Error {}

const MIN_RAW_PREVIEW = 1500;

export function cannotOpen(name: string, format: ImageFormat | null): IntakeError {
  const why = format === 'html' ? ' It is a web page, not a photo.'
    : format === 'pdf' || format === 'svg' ? ` It is a ${FORMAT_LABEL[format]} file.` : '';
  return new IntakeError(`Could not open ${name}.${why} Export it as JPG and add it again.`);
}

/** Things worth offering to the file picker beyond image/*: RAW and HEIC often lack a MIME type. */
export const ACCEPT =
  'image/*,.heic,.heif,.avif,.tif,.tiff,.webp,.bmp,.gif,.cr2,.cr3,.nef,.nrw,.arw,.dng,.raf,.orf,.rw2,.pef,.srw';

export async function sniffFile(file: Blob & { name?: string }): Promise<ImageFormat> {
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  return sniffFormat(head, file.name || '');
}

function renamed(name: string, ext: string): string {
  const base = name.replace(/\.[^./\\]+$/, '') || 'photo';
  return `${base}.${ext}`;
}

/** Whether any pixel of a canvas is not fully opaque (sampled on a coarse grid for big images). */
function hasAlpha(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const d = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] !== 255) return true;
  return false;
}

/** Draws a source onto a canvas applying an EXIF orientation (1..8). */
function drawOriented(src: CanvasImageSource, w: number, h: number, orientation: number): HTMLCanvasElement {
  const swap = orientation >= 5;
  const c = document.createElement('canvas');
  c.width = swap ? h : w;
  c.height = swap ? w : h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('This browser cannot read photos.');
  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, w, 0); break;
    case 3: ctx.transform(-1, 0, 0, -1, w, h); break;
    case 4: ctx.transform(1, 0, 0, -1, 0, h); break;
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
    case 6: ctx.transform(0, 1, -1, 0, h, 0); break;
    case 7: ctx.transform(0, -1, -1, 0, h, w); break;
    case 8: ctx.transform(0, -1, 1, 0, 0, w); break;
  }
  ctx.drawImage(src, 0, 0, w, h);
  return c;
}

async function encodeCanvas(c: HTMLCanvasElement, name: string, forceJpeg = false): Promise<File> {
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const png = !forceJpeg && hasAlpha(ctx, c.width, c.height);
  const type = png ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, type, png ? undefined : 0.92));
  if (!blob) throw new Error('Could not convert the photo.');
  return new File([blob], renamed(name, png ? 'png' : 'jpg'), { type, lastModified: Date.now() });
}

async function bitmapToFile(bmp: ImageBitmap, name: string, orientation = 1, forceJpeg = false): Promise<File> {
  try {
    return await encodeCanvas(drawOriented(bmp, bmp.width, bmp.height, orientation), name, forceJpeg);
  } finally {
    bmp.close();
  }
}

const MIME: Partial<Record<ImageFormat, string>> = {
  jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
  avif: 'image/avif', heic: 'image/heic',
};

/**
 * Turns any supported photo into an upright JPEG or PNG the browser can
 * decode. Throws an IntakeError with a message for the studio when it cannot.
 */
export async function normaliseImage(file: File): Promise<File> {
  let format: ImageFormat = 'unknown';
  try {
    format = await sniffFile(file);
    const typed = (t: ImageFormat) => new Blob([file], { type: MIME[t] || '' });

    if (format === 'png') {
      return file.type === 'image/png' ? file : new File([file], renamed(file.name, 'png'), { type: 'image/png', lastModified: file.lastModified });
    }
    if (format === 'jpeg') {
      const head = new Uint8Array(await file.slice(0, 128 * 1024).arrayBuffer());
      if (jpegOrientation(head) === 1) {
        return file.type === 'image/jpeg' ? file : new File([file], renamed(file.name, 'jpg'), { type: 'image/jpeg', lastModified: file.lastModified });
      }
      // Turned by EXIF (phone photos): the browser's decoder applies EXIF
      // orientation itself, so drawing its bitmap as is gives the upright photo.
      return await bitmapToFile(await createImageBitmap(typed('jpeg')), file.name, 1, true);
    }
    if (NATIVE.has(format)) {
      // WebP, GIF (first frame), BMP, AVIF. These rarely carry EXIF orientation; the browser applies what they do carry.
      return await bitmapToFile(await createImageBitmap(typed(format)), file.name);
    }
    if (format === 'heic') {
      try {
        // Safari decodes HEIC natively and applies its rotation.
        return await bitmapToFile(await createImageBitmap(typed('heic')), file.name);
      } catch {
        const { heicTo } = await import('heic-to');
        const bmp = await heicTo({ blob: file, type: 'bitmap' });
        return await bitmapToFile(bmp, file.name);
      }
    }
    if (format === 'tiff') {
      return await decodeTiff(file);
    }
    if (RAW.has(format)) {
      return await rawPreview(file, format);
    }
  } catch (e) {
    if (e instanceof IntakeError) throw e;
    console.warn('intake failed', file.name, e);
  }
  throw cannotOpen(file.name, format);
}

async function decodeTiff(file: File): Promise<File> {
  const UTIF = (await import('utif2')).default;
  const buf = await file.arrayBuffer();
  const ifds = UTIF.decode(buf);
  // the biggest image in the file (some TIFFs carry a thumbnail first)
  const tag = (f: (typeof ifds)[number], t: string) => Number((f[t] as ArrayLike<number> | undefined)?.[0]) || 0;
  const area = (f: (typeof ifds)[number]) => tag(f, 't256') * tag(f, 't257');
  const page = ifds.filter((f) => area(f) > 0).sort((a, b) => area(b) - area(a))[0];
  if (!page) throw new Error('no image in TIFF');
  UTIF.decodeImage(buf, page);
  const rgba = UTIF.toRGBA8(page);
  const w = page.width as number, h = page.height as number;
  const src = document.createElement('canvas');
  src.width = w; src.height = h;
  src.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba.subarray(0, w * h * 4)), w, h), 0, 0);
  const o = tag(page, 't274') || 1;
  return await encodeCanvas(o === 1 ? src : drawOriented(src, w, h, o), file.name);
}

async function rawPreview(file: File, format: ImageFormat): Promise<File> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const best = findEmbeddedJpegs(bytes).find((j) => Math.max(j.width, j.height) >= MIN_RAW_PREVIEW);
  if (!best) throw cannotOpen(file.name, format);
  const jpeg = bytes.subarray(best.start, best.end);
  // When the preview carries its own EXIF orientation the browser applies it
  // while decoding. Otherwise the orientation is in the RAW's TIFF header
  // (CR2, NEF, ARW, DNG), and we apply that ourselves. Never both.
  const o = jpegOrientation(jpeg) === 1 && (bytes[0] === 0x49 || bytes[0] === 0x4d) ? tiffOrientation(bytes, 0) : 1;
  const bmp = await createImageBitmap(new Blob([jpeg], { type: 'image/jpeg' }));
  return await bitmapToFile(bmp, file.name, o, true);
}

export type IntakeResult = { ok: true; file: File } | { ok: false; error: string };

/**
 * Normalises many files, `concurrency` at a time, reporting each as it
 * finishes so the grid fills in and shows progress. One bad file never stops
 * the others.
 */
export async function normaliseAll(
  files: File[],
  onEach: (index: number, r: IntakeResult) => void,
  concurrency = 2,
  onStart?: (index: number) => void,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const i = next++;
      onStart?.(i);
      try {
        onEach(i, { ok: true, file: await normaliseImage(files[i]) });
      } catch (e) {
        onEach(i, { ok: false, error: e instanceof IntakeError ? e.message : cannotOpen(files[i].name, null).message });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
}
