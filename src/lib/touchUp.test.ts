import { describe, it, expect } from 'vitest';
import {
  alignment, toOriginal, contentMismatch, falloff, stampSegment, strokeCover, floorOf, floorMap, smartAlpha, unmix,
  touchSource, renderStrokes, compositeStroke, pushStroke, undoStroke, redoStroke, stepBrush,
  EMPTY_HISTORY, NO_ORIGINAL, NOT_DIRECT, MISALIGNED, BRUSH_MAX, BRUSH_MIN, MISMATCH_LIMIT, type Stroke,
} from './touchUp';
import type { Px } from './photoEdit';

const W = 100, H = 60;
const FLOOR: [number, number, number] = [214, 226, 240]; // pale blue white floor
const CREAM: [number, number, number] = [226, 220, 204]; // cream fringe
const RED: [number, number, number] = [150, 50, 40];

/**
 * A photo: pale blue floor, a red rug from y = 20 to 45, and cream fringe
 * strands (every 6th column, 2px wide) hanging from y = 8 to 20.
 */
function photo(): Px {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = ((x * 7 + y * 13) % 5) - 2;
    const c = y >= 20 && y < 45 && x >= 10 && x < 90 ? RED
      : y >= 8 && y < 20 && x >= 10 && x < 90 && x % 6 < 2 ? CREAM : FLOOR;
    d.set([c[0] + n, c[1] + n, c[2] + n, 255], (y * W + x) * 4);
  }
  return { width: W, height: H, data: d };
}
/** The auto cutout: the rug kept, the fringe and floor gone. */
function cutout(p: Px): Px {
  const d = new Uint8ClampedArray(p.data);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    d[(y * W + x) * 4 + 3] = y >= 20 && y < 45 && x >= 10 && x < 90 ? 255 : 0;
  }
  return { width: W, height: H, data: d };
}
const alphaAt = (p: Px, x: number, y: number) => p.data[(y * W + x) * 4 + 3];
const line = (y: number, mode: Stroke['mode'] = 'restore', smart = true, size = 6 / W): Stroke =>
  ({ mode, smart, size, points: [{ x: 0.12, y: y / H }, { x: 0.88, y: y / H }] });

describe('alignment', () => {
  it('lines up a cutout made at 2000px from a bigger original, and maps pixels back', () => {
    const a = alignment({ width: 2000, height: 1334 }, { width: 6000, height: 4000 }, true);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.scaleX).toBeCloseTo(3, 1);
    const p = toOriginal(a, 1000, 667);
    expect(p.x).toBeCloseTo(3001, 0);
    expect(p.y).toBeCloseTo(2000.9, 0);
  });
  it('lines up a cutout at the original size (a small original is never enlarged)', () => {
    expect(alignment({ width: 1208, height: 1900 }, { width: 1208, height: 1900 }, true).ok).toBe(true);
  });
  it('says why Bring back is off', () => {
    expect(alignment({ width: 2000, height: 1334 }, null, true)).toEqual({ ok: false, reason: NO_ORIGINAL });
    expect(alignment({ width: 2000, height: 1334 }, { width: 6000, height: 4000 }, false)).toEqual({ ok: false, reason: NOT_DIRECT });
    // cropped after the cut: proportions differ
    expect(alignment({ width: 2000, height: 1500 }, { width: 6000, height: 4000 }, true)).toEqual({ ok: false, reason: MISALIGNED });
    // turned a quarter
    expect(alignment({ width: 1334, height: 2000 }, { width: 6000, height: 4000 }, true)).toEqual({ ok: false, reason: MISALIGNED });
  });
  it('content check: same photo is near 0, a mirrored one is far off', () => {
    const p = photo(), c = cutout(p);
    expect(contentMismatch(c, p, 2)).toBeLessThan(1);
    const flipped = new Uint8ClampedArray(p.data.length);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) flipped.set(p.data.subarray((y * W + x) * 4, (y * W + x) * 4 + 4), ((H - 1 - y) * W + x) * 4);
    expect(contentMismatch(c, { width: W, height: H, data: flipped }, 2)).toBeGreaterThan(MISMATCH_LIMIT);
    expect(contentMismatch(c, { width: W + 1, height: H, data: p.data }, 2)).toBe(255);
  });
});

describe('brush', () => {
  it('is full strength inside, soft at the edge, zero outside', () => {
    expect(falloff(0, 10)).toBe(1);
    expect(falloff(7, 10)).toBe(1);
    const mid = falloff(8.5, 10);
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(0.8);
    expect(falloff(10, 10)).toBe(0);
  });
  it('rasterises a segment as a capsule and never builds up over itself', () => {
    const cov = new Float32Array(W * H);
    const box = stampSegment(cov, W, H, { x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }, 5 / W);
    expect(box).toEqual({ x0: 15, y0: 25, x1: 85, y1: 35 });
    expect(cov[30 * W + 50]).toBe(1);
    expect(cov[30 * W + 10]).toBe(0);
    expect(cov[22 * W + 50]).toBe(0);
    stampSegment(cov, W, H, { x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }, 5 / W);
    expect(Math.max(...cov)).toBe(1);
  });
  it('a single tap is a round dab', () => {
    const { cov, box } = strokeCover({ mode: 'erase', smart: false, size: 4 / W, points: [{ x: 0.5, y: 0.5 }] }, W, H);
    expect(box).not.toBeNull();
    expect(cov[30 * W + 50]).toBe(1);
    expect(cov[30 * W + 56]).toBe(0);
  });
  it('size steps stay in range', () => {
    expect(stepBrush(BRUSH_MAX, 1)).toBe(BRUSH_MAX);
    expect(stepBrush(BRUSH_MIN, -1)).toBe(BRUSH_MIN);
    expect(stepBrush(0.02, 1)).toBeCloseTo(0.023, 3);
  });
});

describe('floor colour', () => {
  it('finds the floor even when strands cover a third of the samples', () => {
    const s: number[] = [];
    for (let i = 0; i < 200; i++) s.push(...(i % 3 === 0 ? CREAM : FLOOR).map((v, k) => v + ((i + k) % 3) - 1));
    const f = floorOf(s)!;
    expect(Math.abs(f.r - FLOOR[0])).toBeLessThan(3);
    expect(Math.abs(f.b - FLOOR[2])).toBeLessThan(3);
    expect(f.spread).toBeLessThan(4);
  });
  it('needs enough samples', () => {
    expect(floorOf([1, 2, 3])).toBeNull();
  });
  it('falls back to the frame border inside a big lost part of the rug', () => {
    // a lilac band the mask lost entirely: locally the commonest "background" is lilac
    const p = photo(), c = cutout(p);
    for (let y = 20; y < 45; y++) for (let x = 10; x < 90; x++) {
      p.data.set([186, 186, 228], (y * W + x) * 4);
      c.data[(y * W + x) * 4 + 3] = 0;
    }
    const at = floorMap(p, touchSource(c, null).baseAlpha);
    const f = at(50, 32)!;
    expect(Math.abs(f.b - FLOOR[2])).toBeLessThan(6);
    expect(Math.abs(f.r - FLOOR[0])).toBeLessThan(6);
  });
});

describe('smart restore alpha', () => {
  const floor = { r: FLOOR[0], g: FLOOR[1], b: FLOOR[2], spread: 1.5 };
  it('skips the floor, keeps cream and red, soft in between', () => {
    expect(smartAlpha(...FLOOR, floor)).toBe(0);
    expect(smartAlpha(FLOOR[0] + 2, FLOOR[1] - 1, FLOOR[2] + 1, floor)).toBe(0);
    expect(smartAlpha(...CREAM, floor)).toBe(1);
    expect(smartAlpha(...RED, floor)).toBe(1);
    const half = smartAlpha(218, 225, 232, floor);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(1);
  });
  it('a darker patch of the same floor counts as floor more readily than a hue change', () => {
    const darker = smartAlpha(FLOOR[0] - 14, FLOOR[1] - 14, FLOOR[2] - 14, floor);
    const hue = smartAlpha(FLOOR[0] + 6, FLOOR[1], FLOOR[2] - 10, floor);
    expect(darker).toBeLessThan(hue);
  });
  it('unmixing takes the floor back out of a part covered pixel, gently', () => {
    expect(unmix(220, 240, 0.5)).toBe(200);
    expect(unmix(220, 240, 0.1)).toBe(200); // never more than doubled
    expect(unmix(220, 240, 1)).toBe(220);
  });
});

describe('applying strokes', () => {
  it('smart Bring back over the fringe restores the strands, not the floor between them', () => {
    const p = photo(), c = cutout(p);
    const out = renderStrokes(c, touchSource(c, p), [line(14, 'restore', true, 8 / W)]);
    expect(alphaAt(out, 30, 14)).toBe(255); // strand (30 % 6 = 0)
    expect(alphaAt(out, 33, 14)).toBe(0); // floor between strands
    // the restored strand has the original's colour
    const j = (14 * W + 30) * 4;
    expect(Math.abs(out.data[j] - p.data[j])).toBeLessThan(2);
  });
  it('plain Bring back restores exactly what is painted, floor too', () => {
    const p = photo(), c = cutout(p);
    const out = renderStrokes(c, touchSource(c, p), [line(14, 'restore', false, 8 / W)]);
    expect(alphaAt(out, 30, 14)).toBe(255);
    expect(alphaAt(out, 33, 14)).toBe(255);
    expect(alphaAt(out, 33, 2)).toBe(0); // outside the brush
  });
  it('Erase makes painted pixels clear, Bring back after it puts them back', () => {
    const p = photo(), c = cutout(p);
    const src = touchSource(c, p);
    const erased = renderStrokes(c, src, [line(30, 'erase')]);
    expect(alphaAt(erased, 50, 30)).toBe(0);
    expect(alphaAt(erased, 50, 40)).toBe(255);
    const back = renderStrokes(c, src, [line(30, 'erase'), line(30, 'restore', false)]);
    expect(alphaAt(back, 50, 30)).toBe(255);
  });
  it('without an original, Bring back does nothing and Erase still works', () => {
    const p = photo(), c = cutout(p);
    const src = touchSource(c, null);
    expect(renderStrokes(c, src, [line(14, 'restore', false)]).data).toEqual(c.data);
    expect(alphaAt(renderStrokes(c, src, [line(30, 'erase')]), 50, 30)).toBe(0);
  });
  it('painting bit by bit gives the same pixels as replaying the stroke whole', () => {
    const p = photo(), c = cutout(p);
    const src = touchSource(c, p);
    const s: Stroke = { mode: 'restore', smart: true, size: 7 / W, points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.25 }, { x: 0.45, y: 0.22 }, { x: 0.85, y: 0.2 }] };
    const whole = renderStrokes(c, src, [s]);
    const before = new Uint8ClampedArray(c.data), live = new Uint8ClampedArray(c.data), cov = new Float32Array(W * H);
    for (let i = 0; i < s.points.length; i++) {
      const box = stampSegment(cov, W, H, s.points[Math.max(0, i - 1)], s.points[i], s.size);
      if (box) compositeStroke(before, live, cov, W, box, s, src);
    }
    expect(live).toEqual(whole.data);
  });
  it('the same strokes give the same result at preview size and at full size', () => {
    // full size is the preview scaled 2x, so the share of restored strand pixels should match
    const p = photo(), c = cutout(p);
    const big = (img: Px): Px => {
      const d = new Uint8ClampedArray(W * H * 16);
      for (let y = 0; y < H * 2; y++) for (let x = 0; x < W * 2; x++) d.set(img.data.subarray(((y >> 1) * W + (x >> 1)) * 4, ((y >> 1) * W + (x >> 1)) * 4 + 4), (y * W * 2 + x) * 4);
      return { width: W * 2, height: H * 2, data: d };
    };
    const s = [line(14, 'restore', true, 8 / W)];
    const small = renderStrokes(c, touchSource(c, p), s);
    const large = renderStrokes(big(c), touchSource(big(c), big(p)), s);
    // share of the fringe rows (8..20) restored; the 3x3 smoothing is in pixels, so thin strands differ a little
    const share = (img: Px, k: number) => {
      let n = 0, all = 0;
      for (let y = 8 * k; y < 20 * k; y++) for (let x = 10 * k; x < 90 * k; x++) { all++; if (img.data[(y * img.width + x) * 4 + 3] > 128) n++; }
      return n / all;
    };
    expect(share(small, 1)).toBeGreaterThan(0.25);
    expect(Math.abs(share(small, 1) - share(large, 2))).toBeLessThan(0.08);
  });
});

describe('undo stack', () => {
  const a = line(10), b = line(20), c = line(30);
  it('undoes, redoes, and a new stroke clears redo', () => {
    let h = pushStroke(pushStroke(EMPTY_HISTORY, a), b);
    h = undoStroke(h);
    expect(h).toEqual({ done: [a], undone: [b] });
    h = redoStroke(h);
    expect(h).toEqual({ done: [a, b], undone: [] });
    h = pushStroke(undoStroke(h), c);
    expect(h).toEqual({ done: [a, c], undone: [] });
  });
  it('undo and redo on empty stacks change nothing; an empty stroke is not recorded', () => {
    expect(undoStroke(EMPTY_HISTORY)).toBe(EMPTY_HISTORY);
    expect(redoStroke(EMPTY_HISTORY)).toBe(EMPTY_HISTORY);
    expect(pushStroke(EMPTY_HISTORY, { ...a, points: [] })).toBe(EMPTY_HISTORY);
  });
});
