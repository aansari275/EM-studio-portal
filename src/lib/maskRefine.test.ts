import { describe, it, expect } from 'vitest';
import { refineMask, touchesEdge, cropBox, maskStats, cutoutWarning, finishCutout, unsureShare, rerunKeepsRug, FILLED_WARNING, UNSURE_WARNING } from './maskRefine';

const W = 120, H = 60;
/** A photo: dark floor on the left, a brown rug from x = 60 to the right, both with a little noise. */
function photo(edge = 60): Uint8ClampedArray {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = ((x * 7 + y * 13) % 5) - 2;
    const [r, g, b] = x >= edge ? [120, 80, 50] : [225, 228, 232];
    d.set([r + n, g + n, b + n, 255], (y * W + x) * 4);
  }
  return d;
}
const maskOf = (f: (x: number) => number) => {
  const m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m[y * W + x] = Math.round(Math.max(0, Math.min(1, f(x))) * 255);
  return m;
};
/** Pixels in the middle row that are neither (almost) clear nor (almost) solid. */
const band = (m: Uint8Array) => {
  let n = 0;
  for (let x = 0; x < W; x++) { const a = m[30 * W + x]; if (a > 10 && a < 245) n++; }
  return n;
};

describe('refineMask (guided filter)', () => {
  it('snaps a blurred mask edge to the sharp edge in the photo', () => {
    // a 12px soft band centred on the true edge at x = 60, like a 320px mask stretched to 2000px
    const soft = maskOf((x) => (x - 54) / 12);
    expect(band(soft)).toBeGreaterThanOrEqual(10);
    const out = refineMask(photo(), soft, W, H);
    expect(band(out)).toBeLessThanOrEqual(band(soft) / 2);
    // and it is on the right side of the edge
    expect(out[30 * W + 55]).toBeLessThan(20);
    expect(out[30 * W + 65]).toBeGreaterThan(235);
  });

  it('leaves a mask that already matches the photo essentially unchanged', () => {
    const exact = maskOf((x) => (x >= 60 ? 1 : 0));
    const out = refineMask(photo(), exact, W, H);
    let diff = 0;
    for (let i = 0; i < exact.length; i++) diff = Math.max(diff, Math.abs(out[i] - exact[i]));
    expect(diff).toBeLessThanOrEqual(8);
  });

  it('keeps fully clear and fully solid areas exactly 0 and 255', () => {
    const half = maskOf((x) => (x - 50) / 20);
    const out = refineMask(photo(), half, W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < 30; x++) expect(out[y * W + x]).toBe(0);
      for (let x = 90; x < W; x++) expect(out[y * W + x]).toBe(255);
    }
    expect([...refineMask(photo(), maskOf(() => 0), W, H)].every((v) => v === 0)).toBe(true);
    expect([...refineMask(photo(), maskOf(() => 1), W, H)].every((v) => v === 255)).toBe(true);
  });

  it('gives the same answer in strips as in one pass', () => {
    const soft = maskOf((x) => (x - 45) / 30);
    const whole = refineMask(photo(), soft, W, H, 5, 0.0016, 1.6, 1000);
    const strips = refineMask(photo(), soft, W, H, 5, 0.0016, 1.6, 7);
    let diff = 0;
    for (let i = 0; i < whole.length; i++) diff = Math.max(diff, Math.abs(whole[i] - strips[i]));
    expect(diff).toBeLessThanOrEqual(1);
  });
});

describe('mask checks', () => {
  it('knows when the rug touches the frame edge', () => {
    const inside = maskOf((x) => (x >= 40 && x < 100 ? 1 : 0));
    for (let y = 0; y < H; y++) if (y < 4 || y >= H - 4) for (let x = 0; x < W; x++) inside[y * W + x] = 0;
    expect(touchesEdge(inside, W, H, 128, 4)).toBe(false);
    expect(touchesEdge(maskOf((x) => (x >= 60 ? 1 : 0)), W, H, 128, 4)).toBe(true);
    // one corner grazing the frame is not a full-bleed shot
    const corner = inside.slice();
    corner[(H - 1) * W + 99] = 255;
    expect(touchesEdge(corner, W, H, 128, 4)).toBe(false);
  });

  it('pads the crop box around the rug and keeps it in the frame', () => {
    const m = new Uint8Array(W * H);
    for (let y = 20; y < 40; y++) for (let x = 50; x < 70; x++) m[y * W + x] = 255;
    expect(cropBox(m, W, H, 128, 0.05)).toEqual({ x: 44, y: 14, w: 32, h: 32 });
    expect(cropBox(new Uint8Array(W * H), W, H)).toBeNull();
  });

  it('flags a see-through rug and one cut off by the frame, with wording she can act on', () => {
    const solid = new Uint8Array(W * H);
    for (let y = 10; y < 50; y++) for (let x = 20; x < 100; x++) solid[y * W + x] = 255;
    expect(cutoutWarning(maskStats(solid, W, H))).toBeNull();
    const seeThrough = solid.map((v, i) => (v && i % 3 === 0 ? 140 : v));
    expect(cutoutWarning(maskStats(seeThrough, W, H))).toBe('Parts of the rug look see-through. Check the cutout.');
    const bleed = maskOf((x) => (x >= 30 ? 1 : 0));
    expect(cutoutWarning(maskStats(bleed, W, H))).toBe('Rug touches the edge of the photo. Check the cutout.');
  });
});

describe('decontaminate (edge colour)', () => {
  it('gives part see-through edge pixels the rug colour, not the floor, and leaves the rest alone', async () => {
    const { decontaminate } = await import('./maskRefine');
    const px = photo();
    // alpha: solid rug from 62, a soft edge 58..61 sitting on floor-coloured pixels, clear before
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      px[(y * W + x) * 4 + 3] = x >= 62 ? 255 : x >= 58 ? 50 * (x - 57) : 0;
      if (x >= 58 && x < 62) px.set([225, 228, 232], (y * W + x) * 4); // floor colour under the edge
    }
    const before = px.slice();
    decontaminate(px, W, H);
    const i = (30 * W + 60) * 4;
    expect(px[i]).toBeLessThan(130); // brown, not white
    expect(px[i + 3]).toBe(before[i + 3]);
    for (let x = 0; x < W; x++) {
      const j = (30 * W + x) * 4;
      if (x < 58 || x >= 62) expect([...px.slice(j, j + 4)]).toEqual([...before.slice(j, j + 4)]);
    }
  });
});

describe('a rug is one solid object', () => {
  /** The test photo with a pale band inside the rug (x 80..95, y 20..40), the colour of the floor. */
  function striped(): Uint8ClampedArray {
    const d = photo();
    for (let y = 20; y < 40; y++) for (let x = 80; x < 96; x++) d.set([226, 229, 233, 255], (y * W + x) * 4);
    return d;
  }
  /** What the model gives: the rug from x = 60 to 115 (rows 5..55), with the pale band read as floor. */
  function modelMask(): Uint8Array {
    const m = new Uint8Array(W * H);
    for (let y = 5; y < 55; y++) for (let x = 60; x < 115; x++) m[y * W + x] = 255;
    for (let y = 20; y < 40; y++) for (let x = 80; x < 96; x++) m[y * W + x] = 30;
    return m;
  }

  it('fills the see-through band and keeps the photo\'s own colours there', () => {
    const px = striped();
    const { rgba, filledPct } = finishCutout(px.slice(), modelMask(), W, H);
    for (let y = 20; y < 40; y++) for (let x = 80; x < 96; x++) {
      const j = (y * W + x) * 4;
      expect(rgba[j + 3]).toBe(255);
      // not recoloured by the edge colour step: still the pale band, not brown
      expect([rgba[j], rgba[j + 1], rgba[j + 2]]).toEqual([226, 229, 233]);
    }
    expect(filledPct).toBeGreaterThan(5);
  });

  it('says so on the tile when a meaningful part was filled', () => {
    const { rgba, ...info } = finishCutout(striped(), modelMask(), W, H);
    const a = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) a[i] = rgba[i * 4 + 3];
    expect(cutoutWarning(maskStats(a, W, H, info))).toBe(FILLED_WARNING);
    // a clean rug says nothing
    const c = finishCutout(photo(), maskOf((x) => (x >= 60 ? 1 : 0)), W, H);
    expect(c.filledPct).toBe(0);
    const ca = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) ca[i] = c.rgba[i * 4 + 3];
    expect(cutoutWarning({ ...maskStats(ca, W, H, c), touchesEdge: false })).toBeNull();
  });

  it('flags a mask the model was unsure about over a large part of the rug', () => {
    const m = modelMask().map((v) => (v ? 255 : 0));
    expect(unsureShare(m)).toBe(0);
    const unsure = m.map((v, i) => (v && (i % W) < 90 ? 120 : v));
    expect(unsureShare(unsure)).toBeGreaterThan(15);
    const solid = new Uint8Array(W * H);
    for (let y = 10; y < 50; y++) for (let x = 20; x < 100; x++) solid[y * W + x] = 255;
    expect(cutoutWarning({ ...maskStats(solid, W, H), unsurePct: 55 })).toBe(UNSURE_WARNING);
    expect(cutoutWarning({ ...maskStats(solid, W, H), unsurePct: 7 })).toBeNull();
    expect(cutoutWarning({ ...maskStats(solid, W, H), filledPct: 0.4 })).toBeNull();
    expect(cutoutWarning({ ...maskStats(solid, W, H), filledPct: 4.8 })).toBe(FILLED_WARNING);
  });
});

describe('crop re-run guard', () => {
  it('keeps the re-run only when it does not drop a large part of the rug', () => {
    const first = new Uint8Array(W * H), same = new Uint8Array(W * H), half = new Uint8Array(W * H);
    for (let y = 10; y < 50; y++) for (let x = 20; x < 100; x++) {
      first[y * W + x] = 200; // unsure but kept
      same[y * W + x] = 255;
      if (y >= 30) half[y * W + x] = 255;
    }
    expect(rerunKeepsRug(first, same)).toBe(true);
    expect(rerunKeepsRug(first, half)).toBe(false);
    expect(rerunKeepsRug(new Uint8Array(W * H), half)).toBe(true);
  });
});
