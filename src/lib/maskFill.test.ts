import { describe, it, expect } from 'vitest';
import { fillInterior, chamferDistance, hullRows } from './maskFill';

const W = 120, H = 80;
const OPTS = { depth: 3, channel: 4 };
const blank = () => new Uint8Array(W * H);
const rect = (m: Uint8Array, x0: number, y0: number, x1: number, y1: number, v: number) => {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * W + x] = v;
};
/** A rug from (20,15) to (100,65) with a 2px soft rim, like a stretched model mask. */
function rug(): Uint8Array {
  const m = blank();
  rect(m, 18, 13, 102, 67, 70);
  rect(m, 19, 14, 101, 66, 160);
  rect(m, 20, 15, 100, 65, 255);
  return m;
}
const outsideUnchanged = (before: Uint8Array, after: Uint8Array, x0 = 18, y0 = 13, x1 = 102, y1 = 67) => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x >= x0 && x < x1 && y >= y0 && y < y1) continue;
    if (after[y * W + x] !== before[y * W + x]) return false;
  }
  return true;
};

describe('fillInterior', () => {
  it('fills a see-through hole enclosed by the rug and leaves the rim and the floor alone', () => {
    const m = rug();
    rect(m, 50, 30, 62, 40, 40); // the white band read as floor
    const r = fillInterior(m, W, H, OPTS);
    expect(r.holes).toBe(12 * 10);
    for (let y = 30; y < 40; y++) for (let x = 50; x < 62; x++) expect(r.mask[y * W + x]).toBe(255);
    expect(outsideUnchanged(m, r.mask)).toBe(true);
    // the soft rim on the outline is kept for the guided filter
    expect(r.mask[40 * W + 18]).toBe(70);
    expect(r.mask[40 * W + 19]).toBe(160);
  });

  it('makes a weak patch deep inside fully opaque', () => {
    const m = rug();
    rect(m, 40, 30, 70, 50, 170);
    const r = fillInterior(m, W, H, OPTS);
    expect(r.weak).toBe(30 * 20);
    expect(r.holes).toBe(0);
    expect(r.mask[40 * W + 55]).toBe(255);
  });

  it('fills a soft bay reached only through a thin channel, but only with bays on', () => {
    const m = rug();
    rect(m, 58, 13, 61, 32, 0); // 3px channel from the top edge
    rect(m, 52, 32, 70, 48, 90); // the soft dent
    const plain = fillInterior(m, W, H, OPTS);
    expect(plain.mask[40 * W + 60]).toBe(90);
    const r = fillInterior(m, W, H, { ...OPTS, bays: true });
    expect(r.bays).toBe(1);
    expect(r.mask[40 * W + 60]).toBe(255);
    expect(outsideUnchanged(m, r.mask)).toBe(true);
  });

  it('does not fill a pocket the model was sure is floor', () => {
    const m = rug();
    rect(m, 58, 13, 61, 32, 0);
    rect(m, 52, 32, 70, 48, 3);
    const r = fillInterior(m, W, H, { ...OPTS, bays: true });
    expect(r.bays).toBe(0);
    expect(r.mask[40 * W + 60]).toBe(3);
  });

  it('keeps a genuine concave shape (a U with a wide mouth) as it is', () => {
    const m = rug();
    rect(m, 45, 13, 75, 50, 0); // wide notch from the top
    rect(m, 44, 13, 45, 50, 120); rect(m, 75, 13, 76, 50, 120); // soft sides
    const r = fillInterior(m, W, H, { ...OPTS, bays: true });
    expect(r.bays).toBe(0);
    for (let y = 13; y < 50; y++) for (let x = 44; x < 76; x++) expect(r.mask[y * W + x]).toBe(m[y * W + x]);
  });

  it('never joins two separate rugs across the floor between them', () => {
    const m = blank();
    rect(m, 10, 10, 58, 70, 255);
    rect(m, 62, 10, 110, 70, 255); // a 4px gap of floor
    rect(m, 58, 10, 62, 70, 20);
    const r = fillInterior(m, W, H, { ...OPTS, bays: true });
    for (let y = 0; y < H; y++) for (let x = 58; x < 62; x++) expect(r.mask[y * W + x]).toBe(m[y * W + x]);
    expect(r.holes).toBe(0);
    expect(r.bays).toBe(0);
    // and a hole inside one of them is still filled
    rect(m, 30, 30, 40, 40, 0);
    expect(fillInterior(m, W, H, OPTS).mask[35 * W + 35]).toBe(255);
  });

  it('does not treat a strip of floor along the frame edge as a bay', () => {
    const m = blank();
    rect(m, 3, 3, W - 3, H - 3, 255); // rug almost fills the frame
    rect(m, 0, 0, W, 3, 60);
    const r = fillInterior(m, W, H, { ...OPTS, bays: true });
    expect(r.bays).toBe(0);
    expect(r.mask[1 * W + 50]).toBe(60);
  });

  it('leaves an empty mask and a clean rug as they are', () => {
    expect([...fillInterior(blank(), W, H, OPTS).mask].every((v) => v === 0)).toBe(true);
    const m = rug();
    const r = fillInterior(m, W, H, { ...OPTS, bays: true });
    expect(r.holes + r.weak + r.bays).toBe(0);
    expect([...r.mask]).toEqual([...m]);
  });
});

describe('helpers', () => {
  it('measures distance to the nearest source pixel', () => {
    const s = blank();
    s[40 * W + 60] = 1;
    const d = chamferDistance(s, W, H);
    expect(d[40 * W + 60]).toBe(0);
    expect(d[40 * W + 70]).toBeCloseTo(10, 5);
    expect(d[50 * W + 70]).toBeGreaterThan(13);
    expect(d[50 * W + 70]).toBeLessThan(15);
  });

  it('gives each row the x range of the convex outline', () => {
    const s = blank();
    rect(s, 10, 10, 11, 11, 1); rect(s, 50, 10, 51, 11, 1); rect(s, 30, 50, 31, 51, 1); // a triangle
    const { lo, hi } = hullRows(s, W, H);
    expect(lo[10]).toBe(10); expect(hi[10]).toBe(50);
    expect(lo[30]).toBeCloseTo(20, 5); expect(hi[30]).toBeCloseTo(40, 5);
    expect(lo[5] > hi[5]).toBe(true);
  });
});
