import { describe, expect, it } from 'vitest';
import {
  MAX_PASSES, MAX_PNG_BYTES, MAX_SIDE, MB, formatBytes, nextPngPass, planPngFit, pngSize, sizeNote,
} from './cutoutSize';

describe('planPngFit', () => {
  it('keeps a PNG within 3 MB and 2000px as it is', () => {
    expect(planPngFit(2.9 * MB, 1250, 2000)).toEqual({ keep: true });
    expect(planPngFit(MAX_PNG_BYTES, 2000, 2000)).toEqual({ keep: true });
  });

  it('resizes a PNG over 3 MB once, by the square root of the byte ratio with a margin', () => {
    const p = planPngFit(5.4 * MB, 1250, 2000);
    expect(p.keep).toBe(false);
    if (p.keep) return;
    expect(p.scale).toBeCloseTo(Math.sqrt((3 * 0.9) / 5.4), 6);
    expect(p.height).toBe(Math.round(2000 * p.scale));
    expect(p.width).toBe(Math.round(1250 * p.scale));
  });

  it('brings a small but too large PNG down to 2000px on the long side only', () => {
    const p = planPngFit(1 * MB, 4000, 3000);
    expect(p).toEqual({ keep: false, scale: 0.5, width: 2000, height: 1500 });
  });

  it('takes the smaller of the side and byte scales', () => {
    const p = planPngFit(40 * MB, 4000, 3000);
    if (p.keep) throw new Error('should resize');
    expect(p.scale).toBeLessThan(0.5);
    expect(Math.max(p.width, p.height)).toBeLessThanOrEqual(MAX_SIDE);
  });

  it('does not shrink for bytes just over the margin but under the cap', () => {
    // 2.95 MB at 2500px: only the long side is the problem
    const p = planPngFit(2.95 * MB, 2500, 1000);
    expect(p).toEqual({ keep: false, scale: 0.8, width: 2000, height: 800 });
  });

  it('never returns a zero size', () => {
    const p = planPngFit(500 * MB, 3, 1);
    if (p.keep) throw new Error('should resize');
    expect(p.width).toBeGreaterThanOrEqual(1);
    expect(p.height).toBeGreaterThanOrEqual(1);
  });
});

describe('nextPngPass', () => {
  it('stops when the result fits', () => {
    expect(nextPngPass(1, 0.7, 2.9 * MB, 1250, 2000)).toBeNull();
  });

  it('corrects once from the source size with a smaller scale', () => {
    const n = nextPngPass(1, 0.7, 3.3 * MB, 1250, 2000);
    expect(n).not.toBeNull();
    expect(n!.scale).toBeLessThan(0.7);
    expect(n!.scale).toBeCloseTo(0.7 * Math.sqrt((3 * 0.85) / 3.3), 6);
    expect(n!.height).toBe(Math.round(2000 * n!.scale));
  });

  it('is bounded: no pass after the last', () => {
    expect(nextPngPass(MAX_PASSES, 0.5, 10 * MB, 1000, 1000)).toBeNull();
  });

  it('runs at most MAX_PASSES encodes even if every estimate is short', () => {
    let scale = 1, passes = 1;
    // a pathological encoder: bytes never drop
    for (let n = nextPngPass(passes, scale, 9 * MB, 2000, 2000); n; n = nextPngPass(passes, scale, 9 * MB, 2000, 2000)) {
      scale = n.scale; passes++;
    }
    expect(passes).toBe(MAX_PASSES);
  });
});

describe('pngSize', () => {
  const png = (w: number, h: number) => {
    const b = new Uint8Array(33);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(b.buffer).setUint32(16, w);
    new DataView(b.buffer).setUint32(20, h);
    return b;
  };
  it('reads width and height from IHDR', () => {
    expect(pngSize(png(1250, 2000))).toEqual({ width: 1250, height: 2000 });
    expect(pngSize(png(70000, 3))).toEqual({ width: 70000, height: 3 });
  });
  it('rejects anything that is not a PNG', () => {
    expect(pngSize(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(30).fill(0)]))).toBeNull();
    expect(pngSize(new Uint8Array(10))).toBeNull();
  });
});

describe('sizeNote', () => {
  it('says the change in plain words', () => {
    expect(sizeNote(5.1 * MB, 2.8 * MB)).toBe('5.1 MB to 2.8 MB');
    expect(formatBytes(870 * 1024)).toBe('870 KB');
  });
  it('is empty when nothing was saved', () => {
    expect(sizeNote(2 * MB, 2 * MB)).toBe('');
  });
});
