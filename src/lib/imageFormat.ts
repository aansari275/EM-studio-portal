/**
 * Image formats by file signature (magic bytes), plus the two byte-level
 * helpers intake needs: the EXIF orientation of a JPEG or TIFF-structured file,
 * and the embedded JPEG previews inside a camera RAW file.
 *
 * Pure functions over bytes, no DOM, so they are unit tested directly.
 * Never trust `file.type` or the extension alone: iPhone and WhatsApp files
 * often arrive with an empty or wrong MIME type, and this bucket already holds
 * `.jpg` files that are really HTML.
 */

export type ImageFormat =
  | 'jpeg' | 'png' | 'gif' | 'webp' | 'bmp' | 'avif' | 'heic' | 'tiff'
  | 'cr2' | 'cr3' | 'nef' | 'arw' | 'dng' | 'raf' | 'orf' | 'rw2' | 'raw'
  | 'svg' | 'html' | 'pdf' | 'unknown';

/** Formats the browser decodes by itself (Chrome, Safari, Firefox current). */
export const NATIVE: ReadonlySet<ImageFormat> = new Set(['jpeg', 'png', 'gif', 'webp', 'bmp', 'avif']);

export const RAW: ReadonlySet<ImageFormat> = new Set(['cr2', 'cr3', 'nef', 'arw', 'dng', 'raf', 'orf', 'rw2', 'raw']);

/** A name for the format in messages to the studio. */
export const FORMAT_LABEL: Record<ImageFormat, string> = {
  jpeg: 'JPG', png: 'PNG', gif: 'GIF', webp: 'WebP', bmp: 'BMP', avif: 'AVIF', heic: 'HEIC', tiff: 'TIFF',
  cr2: 'Canon RAW (CR2)', cr3: 'Canon RAW (CR3)', nef: 'Nikon RAW (NEF)', arw: 'Sony RAW (ARW)',
  dng: 'DNG', raf: 'Fujifilm RAW (RAF)', orf: 'Olympus RAW (ORF)', rw2: 'Panasonic RAW (RW2)', raw: 'camera RAW',
  svg: 'SVG', html: 'a web page, not a photo', pdf: 'PDF', unknown: 'an unknown format',
};

/** How many leading bytes `sniffFormat` wants (ftyp brand lists can run long). */
export const SNIFF_BYTES = 4096;

const ascii = (b: Uint8Array, at: number, n: number) =>
  at + n <= b.length ? String.fromCharCode(...b.subarray(at, at + n)) : '';

const startsWith = (b: Uint8Array, sig: number[], at = 0) =>
  b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1', 'mif2']);
const AVIF_BRANDS = new Set(['avif', 'avis']);

const RAW_BY_EXT: Record<string, ImageFormat> = {
  nef: 'nef', nrw: 'nef', arw: 'arw', srf: 'arw', sr2: 'arw', dng: 'dng', cr2: 'cr2',
  pef: 'raw', srw: 'raw', erf: 'raw', kdc: 'raw', '3fr': 'raw', iiq: 'raw', mos: 'raw', rwl: 'raw',
};

function ext(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

/**
 * The format of a file from its first bytes (`SNIFF_BYTES` is plenty). The
 * name is only used to tell TIFF-structured RAW files (NEF, ARW, DNG...) from
 * a plain TIFF, because they share the TIFF signature.
 */
export function sniffFormat(b: Uint8Array, name = ''): ImageFormat {
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (ascii(b, 0, 4) === 'GIF8') return 'gif';
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  if (ascii(b, 0, 15) === 'FUJIFILMCCD-RAW') return 'raf';

  if (ascii(b, 4, 4) === 'ftyp') {
    const size = Math.min(b.length, ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0 || b.length);
    const major = ascii(b, 8, 4);
    const brands = [major];
    for (let at = 16; at + 4 <= size; at += 4) brands.push(ascii(b, at, 4));
    if (major === 'crx ') return 'cr3';
    if (brands.some((x) => AVIF_BRANDS.has(x))) return 'avif';
    if (brands.some((x) => HEIF_BRANDS.has(x))) return 'heic';
    return 'unknown'; // mp4, mov and friends
  }

  const le = ascii(b, 0, 4) === 'II*\0';
  const be = startsWith(b, [0x4d, 0x4d, 0x00, 0x2a]);
  if (ascii(b, 0, 4) === 'IIRO' || ascii(b, 0, 4) === 'IIRS' || ascii(b, 0, 4) === 'MMOR') return 'orf';
  if (startsWith(b, [0x49, 0x49, 0x55, 0x00])) return 'rw2';
  if (le || be) {
    if (le && ascii(b, 8, 2) === 'CR') return 'cr2';
    return RAW_BY_EXT[ext(name)] || 'tiff';
  }

  // BMP: "BM", then the two reserved words must be zero
  if (ascii(b, 0, 2) === 'BM' && b.length >= 14 && b[6] === 0 && b[7] === 0 && b[8] === 0 && b[9] === 0) return 'bmp';

  if (ascii(b, 0, 5) === '%PDF-') return 'pdf';
  const bom = startsWith(b, [0xef, 0xbb, 0xbf]) ? 3 : 0; // UTF-8 byte order mark
  const head = ascii(b, bom, Math.min(b.length - bom, 512)).trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'svg';
  if (head.startsWith('<!doctype html') || head.startsWith('<html') || head.startsWith('<head') || head.startsWith('<?xml')) return 'html';
  return 'unknown';
}

/* ---------------------------------------------------------------- EXIF -- */

/** The Orientation tag (1..8) from a TIFF structure starting at `at`, or 1. */
export function tiffOrientation(b: Uint8Array, at = 0): number {
  if (at + 8 > b.length) return 1;
  const le = b[at] === 0x49 && b[at + 1] === 0x49;
  if (!le && !(b[at] === 0x4d && b[at + 1] === 0x4d)) return 1;
  const u16 = (o: number) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const u32 = (o: number) => (le
    ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
    : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);
  const ifd = at + u32(at + 4);
  if (ifd + 2 > b.length) return 1;
  const n = u16(ifd);
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > b.length) break;
    if (u16(e) === 0x0112) {
      const v = u16(e + 8);
      return v >= 1 && v <= 8 ? v : 1;
    }
  }
  return 1;
}

/** The EXIF orientation of a JPEG (1..8), 1 when it has none. */
export function jpegOrientation(b: Uint8Array): number {
  if (!startsWith(b, [0xff, 0xd8])) return 1;
  let o = 2;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) return 1;
    const m = b[o + 1];
    if (m === 0xda || m === 0xd9) return 1; // image data starts: no EXIF before it
    const len = (b[o + 2] << 8) | b[o + 3];
    if (m === 0xe1 && ascii(b, o + 4, 6) === 'Exif\0\0') return tiffOrientation(b, o + 10);
    o += 2 + len;
  }
  return 1;
}

/* ----------------------------------------------------- RAW previews -- */

export type EmbeddedJpeg = { start: number; end: number; width: number; height: number };

/**
 * Every complete baseline or progressive JPEG embedded in a file, largest
 * first. Camera RAW files carry a camera-rendered JPEG preview, on most bodies
 * at full size (a Sony ARW: 160x120, 1616x1080 and 4240x2832). The RAW sensor
 * data itself is lossless JPEG (SOF3) in some formats and is skipped.
 */
export function findEmbeddedJpegs(b: Uint8Array): EmbeddedJpeg[] {
  const out: EmbeddedJpeg[] = [];
  let i = 0;
  while ((i = indexOf3(b, i)) >= 0) {
    const found = parseJpegAt(b, i);
    if (found) out.push(found);
    i += 3;
  }
  return out.sort((x, y) => y.width * y.height - x.width * x.height);
}

function indexOf3(b: Uint8Array, from: number): number {
  for (let i = from; i + 2 < b.length; i++) {
    if (b[i] === 0xff && b[i + 1] === 0xd8 && b[i + 2] === 0xff) return i;
  }
  return -1;
}

function parseJpegAt(b: Uint8Array, start: number): EmbeddedJpeg | null {
  let o = start + 2;
  let width = 0, height = 0, ok = false;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) return null;
    const m = b[o + 1];
    if (m === 0xff) { o += 1; continue; } // fill byte
    const len = (b[o + 2] << 8) | b[o + 3];
    if (len < 2) return null;
    if (m === 0xc0 || m === 0xc1 || m === 0xc2) {
      height = (b[o + 5] << 8) | b[o + 6];
      width = (b[o + 7] << 8) | b[o + 8];
      ok = true;
    } else if (m >= 0xc3 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return null; // lossless or arithmetic: sensor data, not a picture a browser can show
    }
    if (m === 0xda) {
      if (!ok || !width || !height) return null;
      // entropy-coded data: FF is always followed by 00 or a restart marker,
      // so the first FF D9 is the end of this image
      for (let k = o + 2 + len; k + 1 < b.length; k++) {
        if (b[k] === 0xff && b[k + 1] === 0xd9) return { start, end: k + 2, width, height };
      }
      return null;
    }
    o += 2 + len;
  }
  return null;
}
