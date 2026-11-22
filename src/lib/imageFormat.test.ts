import { describe, expect, it } from 'vitest';
import { findEmbeddedJpegs, jpegFocal35, jpegOrientation, sniffFormat, tiffOrientation } from './imageFormat';

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const ftyp = (major: string, ...compat: string[]) =>
  bytes(be32(16 + compat.length * 4), 'ftyp', major, [0, 0, 0, 0], ...compat);

describe('sniffFormat', () => {
  it('reads the common signatures', () => {
    expect(sniffFormat(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(sniffFormat(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(sniffFormat(bytes('GIF89a'))).toBe('gif');
    expect(sniffFormat(bytes('RIFF', [1, 2, 3, 4], 'WEBPVP8 '))).toBe('webp');
    expect(sniffFormat(bytes('BM', [0x36, 0, 0, 0], [0, 0, 0, 0], [0x36, 0, 0, 0]))).toBe('bmp');
  });

  it('ignores the name and MIME type for real images', () => {
    expect(sniffFormat(bytes([0xff, 0xd8, 0xff, 0xe1]), 'IMG_1234.HEIC')).toBe('jpeg');
  });

  it('tells HEIC from AVIF and from video by the ftyp brands', () => {
    expect(sniffFormat(ftyp('heic', 'mif1', 'heic'))).toBe('heic');
    expect(sniffFormat(ftyp('mif1', 'mif1', 'heic'))).toBe('heic');
    expect(sniffFormat(ftyp('avif', 'mif1', 'avif'))).toBe('avif');
    expect(sniffFormat(ftyp('mif1', 'mif1', 'avif', 'miaf'))).toBe('avif');
    expect(sniffFormat(ftyp('crx ', 'crx '))).toBe('cr3');
    expect(sniffFormat(ftyp('isom', 'mp41'))).toBe('unknown');
  });

  it('tells TIFF from TIFF-structured RAW', () => {
    expect(sniffFormat(bytes('II*\0', [8, 0, 0, 0]), 'scan.tif')).toBe('tiff');
    expect(sniffFormat(bytes([0x4d, 0x4d, 0, 0x2a], [0, 0, 0, 8]), 'scan')).toBe('tiff');
    expect(sniffFormat(bytes('II*\0', [16, 0, 0, 0], 'CR', [2, 0]), 'x.tif')).toBe('cr2');
    expect(sniffFormat(bytes('II*\0', [8, 0, 0, 0]), 'DSC01139.ARW')).toBe('arw');
    expect(sniffFormat(bytes([0x4d, 0x4d, 0, 0x2a], [0, 0, 0, 8]), 'D85_0001.nef')).toBe('nef');
    expect(sniffFormat(bytes('II*\0', [8, 0, 0, 0]), 'photo.DNG')).toBe('dng');
    expect(sniffFormat(bytes('FUJIFILMCCD-RAW 0201'))).toBe('raf');
    expect(sniffFormat(bytes('IIRO', [8, 0, 0, 0]))).toBe('orf');
    expect(sniffFormat(bytes([0x49, 0x49, 0x55, 0x00]))).toBe('rw2');
  });

  it('catches the .jpg files that are really HTML, and other non-photos', () => {
    expect(sniffFormat(bytes('<!DOCTYPE html><html>'), 'image-5.jpg')).toBe('html');
    expect(sniffFormat(bytes('\n  <html lang="en">'), 'image-5.jpg')).toBe('html');
    expect(sniffFormat(bytes('<?xml version="1.0"?><svg xmlns=""/>'))).toBe('svg');
    expect(sniffFormat(bytes('%PDF-1.7'))).toBe('pdf');
    expect(sniffFormat(bytes(''))).toBe('unknown');
    expect(sniffFormat(bytes([0, 1, 2, 3, 4, 5]))).toBe('unknown');
  });
});

/** A little-endian TIFF header whose IFD0 has one Orientation entry. */
const tiffWith = (orientation: number) =>
  [0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0, 0, 0, 0, 0, 0];

describe('orientation', () => {
  it('reads it from a TIFF header, both byte orders', () => {
    expect(tiffOrientation(new Uint8Array(tiffWith(6)))).toBe(6);
    const mm = [0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 8, 0, 0, 0, 0, 0, 0];
    expect(tiffOrientation(new Uint8Array(mm))).toBe(8);
    expect(tiffOrientation(new Uint8Array([1, 2, 3]))).toBe(1);
  });

  it('reads it from a JPEG APP1 Exif block', () => {
    const tiff = tiffWith(6);
    const app1 = [0xff, 0xe1, ...[(tiff.length + 8) >> 8, (tiff.length + 8) & 255], ...'Exif\0\0'.split('').map((c) => c.charCodeAt(0)), ...tiff];
    expect(jpegOrientation(new Uint8Array([0xff, 0xd8, ...app1, 0xff, 0xda, 0, 2]))).toBe(6);
    expect(jpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xda, 0, 2]))).toBe(1);
  });
});

/** A minimal JPEG stream: SOI, SOFn with the given size, SOS, a few data bytes, EOI. */
const jpeg = (w: number, h: number, sof = 0xc0) => [
  0xff, 0xd8,
  0xff, sof, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0,
  0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0,
  0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56,
  0xff, 0xd9,
];

describe('findEmbeddedJpegs', () => {
  it('finds every picture JPEG inside a RAW, largest first, and skips lossless sensor data', () => {
    const thumb = jpeg(160, 120);
    const big = jpeg(4240, 2832, 0xc2);
    const sensor = jpeg(6000, 4000, 0xc3);
    const file = new Uint8Array([...tiffWith(8), 0, 0, ...thumb, 9, 9, ...sensor, 7, ...big, 1, 2, 3]);
    const found = findEmbeddedJpegs(file);
    expect(found.map((j) => [j.width, j.height])).toEqual([[4240, 2832], [160, 120]]);
    const first = found[0];
    expect([...file.subarray(first.start, first.end)]).toEqual(big);
  });

  it('ignores a truncated JPEG', () => {
    expect(findEmbeddedJpegs(new Uint8Array(jpeg(100, 100).slice(0, -2)))).toEqual([]);
  });
});

describe('jpegFocal35', () => {
  // II*\0, IFD0 at 8 with one entry (ExifIFD pointer -> 26), Exif IFD with FocalLengthIn35mmFilm = 28
  const tiff = [
    0x49, 0x49, 0x2a, 0, 8, 0, 0, 0,
    1, 0, 0x69, 0x87, 4, 0, 1, 0, 0, 0, 26, 0, 0, 0, 0, 0, 0, 0,
    1, 0, 0x05, 0xa4, 3, 0, 1, 0, 0, 0, 28, 0, 0, 0, 0, 0, 0, 0,
  ];
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const app1 = [0xff, 0xe1, 0, exif.length + 2, ...exif];

  it('reads the 35mm-equivalent focal length', () => {
    expect(jpegFocal35(new Uint8Array([0xff, 0xd8, ...app1, 0xff, 0xda, 0, 2]))).toBe(28);
  });

  it('is null without EXIF, or for a PNG', () => {
    expect(jpegFocal35(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBeNull();
    expect(jpegFocal35(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });
});
