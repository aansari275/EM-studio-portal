import { describe, it, expect } from 'vitest';
import { carryOriginal, keepCutout, originalOf, parsePhotoOriginals, replaceAt, restoreOriginal } from './photoOriginals';
import { heroImage, orderedImages } from './img';

const meta = { at: '2026-11-23T10:00:00.000Z', by: 'studio@x' };

describe('replaceAt', () => {
  it('swaps in the same position', () => {
    expect(replaceAt(['a', 'b', 'c'], 'b', 'B')).toEqual(['a', 'B', 'c']);
    expect(replaceAt(['a', 'b', 'c'], 'a', 'A')).toEqual(['A', 'b', 'c']);
  });
  it('refuses a photo that is gone', () => {
    expect(() => replaceAt(['a'], 'z', 'Z')).toThrow(/no longer/);
  });
  it('never leaves the same photo twice', () => {
    expect(replaceAt(['a', 'b', 'c'], 'b', 'c')).toEqual(['a', 'c']);
  });
});

describe('keepCutout', () => {
  it('keeps the main photo main and the order unchanged', () => {
    const before = ['main', 'two', 'three'];
    const r = keepCutout(before, [], 'main', 'cut.png', meta);
    expect(r.photos).toEqual(['cut.png', 'two', 'three']);
    expect(r.originals).toEqual([{ url: 'cut.png', originalUrl: 'main', ...meta }]);
    // what heroImage() picks after the write (heroPinned is set by the save)
    const p = { firebaseUrl: r.photos[0], additionalImages: r.photos.slice(1), heroPinned: true };
    expect(heroImage(p)).toBe('cut.png');
    expect(orderedImages(p)).toEqual(r.photos);
  });

  it('a cutout of a cutout points at the first original', () => {
    const a = keepCutout(['x', 'y'], [], 'y', 'y1.png', meta);
    const b = keepCutout(a.photos, a.originals, 'y1.png', 'y2.png', meta);
    expect(b.photos).toEqual(['x', 'y2.png']);
    expect(b.originals).toEqual([{ url: 'y2.png', originalUrl: 'y', ...meta }]);
  });

  it('a cutout made elsewhere, with no original kept, is its own original', () => {
    const r = keepCutout(['old-cut.png'], [], 'old-cut.png', 'new-cut.png', meta);
    expect(originalOf(r.originals, 'new-cut.png')).toBe('old-cut.png');
  });

  it('leaves other entries alone', () => {
    const others = [{ url: 'z.png', originalUrl: 'z', at: '' }];
    const r = keepCutout(['z.png', 'q'], others, 'q', 'q.png', meta);
    expect(r.originals.map((e) => e.url)).toEqual(['z.png', 'q.png']);
  });
});

describe('restoreOriginal', () => {
  it('puts the original back in the same position', () => {
    const k = keepCutout(['a', 'b', 'c'], [], 'b', 'b.png', meta);
    const r = restoreOriginal(k.photos, k.originals, 'b.png');
    expect(r.photos).toEqual(['a', 'b', 'c']);
    expect(r.originals).toEqual([]);
  });
  it('restores a main photo as main', () => {
    const k = keepCutout(['a', 'b'], [], 'a', 'a.png', meta);
    expect(restoreOriginal(k.photos, k.originals, 'a.png').photos[0]).toBe('a');
  });
  it('refuses a photo with no original', () => {
    expect(() => restoreOriginal(['a'], [], 'a')).toThrow();
  });
});

describe('stored list', () => {
  it('drops malformed entries and heals public bucket links', () => {
    const pub = 'https://storage.googleapis.com/easternmillscom.firebasestorage.app/heimtextil/a.jpg';
    const list = parsePhotoOriginals([null, { url: 'u' }, { url: 'c.png', originalUrl: pub, at: 't' }, 'x']);
    expect(list).toHaveLength(1);
    expect(list[0].originalUrl).toMatch(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\//);
    expect(parsePhotoOriginals(undefined)).toEqual([]);
  });
  it('newest entry wins', () => {
    expect(originalOf([{ url: 'c', originalUrl: 'o1', at: '' }, { url: 'c', originalUrl: 'o2', at: '' }], 'c')).toBe('o2');
  });
  it('follows a turned cutout', () => {
    const list = [{ url: 'c.png', originalUrl: 'o', at: '' }];
    expect(carryOriginal(list, 'c.png', 'c-r1.png')).toEqual([{ url: 'c-r1.png', originalUrl: 'o', at: '' }]);
    expect(carryOriginal(list, 'other', 'x')).toBeNull();
  });
});
