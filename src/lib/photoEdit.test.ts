import { describe, it, expect } from 'vitest';
import {
  homography, apply, plan, warp, render, applyTone, autoLevels, buildLuts, startQuad,
  hasAlpha, encodingFor, newPx, straightenShrink, insetQuad, estimateAspect, rescalePlan, sampleSteps,
  isDefaultSettings, TYPICAL_FOCAL, DEFAULT_SETTINGS, NEUTRAL_TONE, type Quad, type Px,
} from './photoEdit';

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

/** A w x h image filled by f(x, y) -> [r, g, b, a]. */
function img(w: number, h: number, f: (x: number, y: number) => [number, number, number, number]): Px {
  const p = newPx(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) p.data.set(f(x, y), (y * w + x) * 4);
  return p;
}

const noisy = (w: number, h: number, alpha = 255) =>
  img(w, h, (x, y) => [(x * 37 + y * 11) % 256, (x * 5 + y * 71) % 256, (x * y) % 256, alpha]);

describe('homography', () => {
  it('maps the four source corners onto the rectangle corners', () => {
    const from: Quad = [{ x: 12, y: 30 }, { x: 410, y: 4 }, { x: 380, y: 290 }, { x: 40, y: 260 }];
    const to: Quad = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 280 }, { x: 0, y: 280 }];
    const H = homography(from, to);
    from.forEach((p, i) => {
      const q = apply(H, p);
      close(q.x, to[i].x);
      close(q.y, to[i].y);
    });
  });

  it('is the identity for identical quads', () => {
    const q: Quad = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 7 }, { x: 0, y: 7 }];
    homography(q, q).forEach((v, i) => close(v, [1, 0, 0, 0, 1, 0, 0, 0, 1][i]));
  });

  it('rejects corners in a line', () => {
    const bad: Quad = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }];
    expect(() => homography(bad, insetQuad(0))).toThrow();
  });
});

describe('plan', () => {
  it('sends the output corners to the quad corners in the source', () => {
    const quad: Quad = [{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.1 }, { x: 0.85, y: 0.9 }, { x: 0.05, y: 0.8 }];
    const p = plan(1000, 800, { quad, angle: 0, crop: null });
    const corners = [{ x: 0, y: 0 }, { x: p.outW, y: 0 }, { x: p.outW, y: p.outH }, { x: 0, y: p.outH }];
    corners.forEach((c, i) => {
      const s = apply(p.toSource, c);
      close(s.x, quad[i].x * 1000, 1e-6);
      close(s.y, quad[i].y * 800, 1e-6);
    });
  });

  it('takes the output shape from the perspective estimate and its area from the quad', () => {
    const quad: Quad = [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.6, y: 1 }, { x: 0, y: 1 }];
    const p = plan(1000, 1000, { quad, angle: 0, crop: null });
    const est = estimateAspect(quad.map((q) => ({ x: q.x * 1000, y: q.y * 1000 })) as Quad, 1000, 1000);
    close(p.outW / p.outH, est.ratio, 0.01);
    const area = 550 * (1000 + Math.hypot(100, 1000)) / 2;
    close(p.outW * p.outH, area, area * 0.01);
    expect(p.info.estimate).toEqual(est);
  });

  it('a flat-on rectangle keeps its side lengths exactly', () => {
    const quad: Quad = [{ x: 0.1, y: 0.2 }, { x: 0.7, y: 0.2 }, { x: 0.7, y: 0.6 }, { x: 0.1, y: 0.6 }];
    const p = plan(1000, 1000, { quad, angle: 0, crop: null });
    expect([p.outW, p.outH]).toEqual([600, 400]);
    expect(p.info.estimate?.method).toBe('sides');
  });

  it('caps the long side', () => {
    const p = plan(4000, 3000, DEFAULT_SETTINGS, 2000);
    expect([p.outW, p.outH]).toEqual([2000, 1500]);
  });

  it('straighten leaves no empty corners', () => {
    const p = plan(1200, 800, { quad: null, angle: 10, crop: null });
    const k = straightenShrink(1200, 800, (10 * Math.PI) / 180);
    expect(p.outW).toBe(Math.round(1200 / k));
    for (const c of [{ x: 0, y: 0 }, { x: p.outW, y: 0 }, { x: p.outW, y: p.outH }, { x: 0, y: p.outH }]) {
      const s = apply(p.toSource, c);
      expect(s.x).toBeGreaterThanOrEqual(-1e-6);
      expect(s.x).toBeLessThanOrEqual(1200 + 1e-6);
      expect(s.y).toBeGreaterThanOrEqual(-1e-6);
      expect(s.y).toBeLessThanOrEqual(800 + 1e-6);
    }
  });

  it('crop is a window onto the frame', () => {
    const p = plan(1000, 500, { quad: null, angle: 0, crop: { x: 0.25, y: 0.2, w: 0.5, h: 0.6 } });
    expect([p.outW, p.outH]).toEqual([500, 300]);
    const s = apply(p.toSource, { x: 0, y: 0 });
    close(s.x, 250); close(s.y, 100);
  });
});

describe('identity', () => {
  it('neutral settings leave every pixel unchanged', () => {
    const src = noisy(37, 23);
    const out = render(src, DEFAULT_SETTINGS);
    expect(out.width).toBe(37);
    expect(out.height).toBe(23);
    expect([...out.data]).toEqual([...src.data]);
    expect(out.data).not.toBe(src.data); // a copy, never the same buffer
  });

  it('neutral tone luts are the identity', () => {
    for (const lut of buildLuts(NEUTRAL_TONE)) lut.forEach((v, i) => expect(v).toBe(i));
  });

  it('a full-frame quad is a pixel-exact copy', () => {
    const src = noisy(40, 30);
    const out = warp(src, plan(40, 30, { quad: insetQuad(0), angle: 0, crop: null }));
    expect([...out.data]).toEqual([...src.data]);
  });
});

describe('alpha', () => {
  // opaque red square in the middle of a transparent BLACK frame, like a cutout
  const cutout = () => img(60, 60, (x, y) =>
    x >= 15 && x < 45 && y >= 15 && y < 45 ? [220, 40, 30, 255] : [0, 0, 0, 0]);

  it('levels and tone never touch alpha', () => {
    const src = cutout();
    const out = applyTone(src, { ...NEUTRAL_TONE, black: 30, white: 200, gamma: 1.4, brightness: 20, contrast: 30, saturation: -40, warmth: 50 });
    for (let i = 3; i < src.data.length; i += 4) expect(out.data[i]).toBe(src.data[i]);
  });

  it('warp keeps transparency and leaves no dark halo on the edge', () => {
    const src = cutout();
    const out = warp(src, plan(60, 60, { quad: null, angle: 7, crop: null }));
    expect(hasAlpha(out)).toBe(true);
    let edges = 0;
    for (let i = 0; i < out.data.length; i += 4) {
      const a = out.data[i + 3];
      if (a > 0 && a < 255) {
        edges++;
        // premultiplied sampling: the edge is still red, not darkened towards black
        expect(out.data[i]).toBeGreaterThanOrEqual(219);
        expect(out.data[i + 1]).toBeLessThanOrEqual(41);
      }
    }
    expect(edges).toBeGreaterThan(0);
    // the corner of the output stays transparent
    expect(out.data[3]).toBe(0);
  });

  it('a fully opaque photo stays opaque through warp, so it saves as JPEG', () => {
    const src = noisy(80, 60);
    const quad: Quad = [{ x: 0.1, y: 0.05 }, { x: 0.95, y: 0.1 }, { x: 0.9, y: 0.95 }, { x: 0.02, y: 0.9 }];
    const out = render(src, { ...DEFAULT_SETTINGS, quad, angle: -4, crop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } });
    expect(hasAlpha(out)).toBe(false);
    expect(encodingFor(out)).toEqual({ type: 'image/jpeg', ext: 'jpg', quality: 0.92 });
    expect(encodingFor(cutout()).type).toBe('image/png');
  });
});

describe('autoLevels', () => {
  it('ignores transparent pixels', () => {
    // rug pixels range 60..180, the transparent surround is pure black and white noise
    const src = img(100, 100, (x, y) => {
      if (x < 50) return (x + y) % 2 ? [0, 0, 0, 0] : [255, 255, 255, 0];
      const v = 60 + Math.round(((x - 50) / 49) * 120);
      return [v, v, v, 255];
    });
    const { black, white } = autoLevels(src);
    expect(black).toBeGreaterThanOrEqual(60);
    expect(black).toBeLessThanOrEqual(62);
    expect(white).toBeGreaterThanOrEqual(178);
    expect(white).toBeLessThanOrEqual(180);
  });

  it('falls back to the full range on a flat image', () => {
    expect(autoLevels(img(10, 10, () => [128, 128, 128, 255]))).toEqual({ black: 0, white: 255 });
  });
});

describe('startQuad', () => {
  it('starts inset 5% on a normal photo', () => {
    expect(startQuad(noisy(20, 20))).toEqual(insetQuad(0.05));
  });

  it('finds the corners of a tilted cutout from its alpha mask', () => {
    // a diamond-ish quad: corners at known pixels
    const corners: Quad = [{ x: 20, y: 10 }, { x: 90, y: 20 }, { x: 80, y: 90 }, { x: 10, y: 80 }];
    const inside = (x: number, y: number) => {
      // point in convex polygon
      for (let i = 0; i < 4; i++) {
        const a = corners[i], b = corners[(i + 1) % 4];
        if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < 0) return false;
      }
      return true;
    };
    const src = img(100, 100, (x, y) => (inside(x + 0.5, y + 0.5) ? [200, 200, 200, 255] : [0, 0, 0, 0]));
    const q = startQuad(src);
    q.forEach((p, i) => {
      expect(Math.abs(p.x * 100 - corners[i].x)).toBeLessThan(3);
      expect(Math.abs(p.y * 100 - corners[i].y)).toBeLessThan(3);
    });
  });
});

// ─── True proportions under perspective ─────────────────────────────────────

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: V): V => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
const crossV = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dotV = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Photographs a W x L rug lying on the floor (z = 0, its length along y, far
 * end at +y) with a pinhole camera at `eye` looking at `target`, focal length
 * `fd` in frame diagonals, `roll` in degrees. Returns the corners as seen,
 * top left, top right, bottom right, bottom left, in a w x h frame.
 */
function photograph(Wr: number, Lr: number, eye: V, target: V, fd: number, roll = 0, w = 6000, h = 4000): Quad {
  const fwd = norm(sub(target, eye));
  const right = norm(crossV(fwd, [0, 0, 1]));
  const down = crossV(fwd, right);
  const f = fd * Math.hypot(w, h);
  const r = (roll * Math.PI) / 180;
  const corners: V[] = [[-Wr / 2, Lr / 2, 0], [Wr / 2, Lr / 2, 0], [Wr / 2, -Lr / 2, 0], [-Wr / 2, -Lr / 2, 0]];
  return corners.map((P) => {
    const d = sub(P, eye);
    const x = dotV(d, right), y = dotV(d, down), z = dotV(d, fwd);
    const u = (f * x) / z, v = (f * y) / z;
    return { x: w / 2 + u * Math.cos(r) - v * Math.sin(r), y: h / 2 + u * Math.sin(r) + v * Math.cos(r) };
  }) as Quad;
}

const ratioOk = (got: number, want: number, pct: number) =>
  expect(Math.abs(got / want - 1) * 100).toBeLessThan(pct);

describe('estimateAspect', () => {
  const RUGS: [string, number, number][] = [['1:1', 1, 1], ['2:3', 2, 3], ['5:8', 5, 8], ['1:3', 1, 3]];

  it('recovers the true ratio from an oblique view, focal length unknown', () => {
    for (const [, Wr, Lr] of RUGS) {
      // standing off one corner, looking down at the rug: both pairs of sides converge
      const q = photograph(Wr, Lr, [Wr * 1.1 + 1, -Lr * 1.2 - 1, 2.2], [0, 0, 0], 0.65, 3);
      const e = estimateAspect(q, 6000, 4000);
      expect(e.method).toBe('perspective');
      ratioOk(e.ratio, Wr / Lr, 2);
      ratioOk(e.focal!, 0.65, 3);
    }
  });

  it('recovers the true ratio from a steep end-on view, with the focal length from EXIF', () => {
    // like DSC04675: shot from the short end, the long sides converge hard and
    // the near and far edges are parallel in the photo
    for (const [, Wr, Lr] of RUGS) {
      for (const fd of [0.65, 1.0]) {
        const q = photograph(Wr, Lr, [0, -Lr / 2 - 1.2, 1.7], [0, 0.1, 0], fd);
        // the classic side-length average gets this badly wrong
        const sides = (Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y) + Math.hypot(q[2].x - q[3].x, q[2].y - q[3].y))
          / (Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y) + Math.hypot(q[2].x - q[1].x, q[2].y - q[1].y));
        expect(Math.abs(sides / (Wr / Lr) - 1)).toBeGreaterThan(0.2);
        const e = estimateAspect(q, 6000, 4000, fd);
        expect(e.method).toBe('lens');
        ratioOk(e.ratio, Wr / Lr, 1);
      }
    }
  });

  it('end-on with a slight turn and roll still comes out right', () => {
    for (const [, Wr, Lr] of RUGS) {
      const q = photograph(Wr, Lr, [0.3, -Lr / 2 - 1.5, 1.6], [0, 0, 0], 0.65, -2);
      ratioOk(estimateAspect(q, 6000, 4000, 0.65).ratio, Wr / Lr, 1);
      // with no EXIF it falls back to a typical lens, which is exact here
      ratioOk(estimateAspect(q, 6000, 4000).ratio, Wr / Lr, 3);
    }
  });

  it('without EXIF a wrong guess of the lens is off, but still closer than the side lengths', () => {
    // a 43mm-equivalent lens, assumed to be 28mm: this is why EXIF matters
    const q = photograph(5, 8, [0, -5.2, 1.7], [0, 0.1, 0], 1.0);
    const e = estimateAspect(q, 6000, 4000);
    expect(e.method).toBe('assumed');
    expect(TYPICAL_FOCAL).toBeCloseTo(0.647, 2);
    const sides = (Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y) + Math.hypot(q[2].x - q[3].x, q[2].y - q[3].y))
      / (Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y) + Math.hypot(q[2].x - q[1].x, q[2].y - q[1].y));
    const err = (r: number) => Math.abs(Math.log(r / (5 / 8)));
    expect(err(e.ratio)).toBeLessThan(err(sides));
  });

  it('is the side-length ratio when the view is flat on', () => {
    const q: Quad = [{ x: 1000, y: 1000 }, { x: 3000, y: 1000 }, { x: 3000, y: 3200 }, { x: 1000, y: 3200 }];
    const e = estimateAspect(q, 6000, 4000, 0.65);
    expect(e.method).toBe('sides');
    close(e.ratio, 2000 / 2200, 1e-9);
  });

  it('falls back to the side lengths for a crossed quad, and never returns an absurd ratio', () => {
    const crossed: Quad = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
    expect(estimateAspect(crossed, 200, 200).method).toBe('sides');
    const sliver: Quad = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 30 }, { x: 0, y: 30 }];
    const e = estimateAspect(sliver, 1000, 1000);
    expect(e.ratio).toBeLessThanOrEqual(10);
  });
});

describe('size (stretch and shape)', () => {
  it('stretches width and length separately', () => {
    const p = plan(1000, 500, { quad: null, angle: 0, crop: null, stretch: { x: 1.5, y: 0.8 } }, 5000);
    expect([p.outW, p.outH]).toEqual([1500, 400]);
    const s = apply(p.toSource, { x: 1500, y: 400 });
    close(s.x, 1000); close(s.y, 500);
  });

  it('a rug size sets the proportions exactly and keeps the area', () => {
    const p = plan(1000, 1000, { quad: null, angle: 0, crop: null, shape: 5 / 8 }, 5000);
    close(p.outW / p.outH, 5 / 8, 0.003);
    close(p.outW * p.outH, 1e6, 2000);
  });

  it('a rug size on top of a skew fix wins over the estimate, wherever the corners are', () => {
    const quad: Quad = [{ x: 0.3, y: 0.1 }, { x: 0.7, y: 0.12 }, { x: 0.95, y: 0.9 }, { x: 0.05, y: 0.88 }];
    for (const q of [quad, insetQuad(0.1)]) {
      const p = plan(3000, 2000, { quad: q, angle: 0, crop: null, shape: 0.625 });
      close(p.outW / p.outH, 0.625, 0.002);
      // corners of the output still land on the corners of the rug
      const c = apply(p.toSource, { x: p.outW, y: p.outH });
      close(c.x, q[2].x * 3000, 1e-6); close(c.y, q[2].y * 2000, 1e-6);
    }
  });

  it('composes with crop in one matrix: crop is in fractions of the sized frame', () => {
    const p = plan(1000, 1000, { quad: null, angle: 0, crop: { x: 0.5, y: 0, w: 0.5, h: 1 }, stretch: { x: 2, y: 1 } }, 5000);
    expect([p.outW, p.outH]).toEqual([1000, 1000]);
    close(apply(p.toSource, { x: 0, y: 0 }).x, 500);
  });

  it('counts as an edit, and neutral stretch does not', () => {
    expect(isDefaultSettings({ ...DEFAULT_SETTINGS, stretch: { x: 1, y: 1 } })).toBe(true);
    expect(isDefaultSettings({ ...DEFAULT_SETTINGS, stretch: { x: 1.2, y: 1 } })).toBe(false);
    expect(isDefaultSettings({ ...DEFAULT_SETTINGS, shape: 0.625 })).toBe(false);
  });
});

describe('resolution', () => {
  it('sizes from the full-resolution frame and samples a working copy of it', () => {
    const quad: Quad = [{ x: 0.2, y: 0.1 }, { x: 0.8, y: 0.1 }, { x: 0.95, y: 0.95 }, { x: 0.05, y: 0.95 }];
    const full = plan(8000, 5300, { quad, angle: 0, crop: null }, 2000);
    expect(Math.max(full.outW, full.outH)).toBe(2000);
    const work = rescalePlan(full, 8000, 5300, 4000, 2650);
    const a = apply(full.toSource, { x: 10, y: 10 }), b = apply(work.toSource, { x: 10, y: 10 });
    close(b.x, a.x / 2, 1e-6); close(b.y, a.y / 2, 1e-6);
    const st = sampleSteps(full);
    expect(st.min).toBeGreaterThan(0);
    expect(st.max).toBeGreaterThan(st.min); // the near end is squeezed more than the far end
  });

  it('supersampling keeps a flat colour flat and alpha exact', () => {
    const src = img(50, 50, () => [100, 150, 200, 255]);
    const out = warp(src, plan(50, 50, { quad: null, angle: 5, crop: null }), 3);
    for (let i = 0; i < out.data.length; i += 4) {
      expect(out.data[i]).toBe(100); expect(out.data[i + 3]).toBe(255);
    }
  });
});

describe('rug sizes', () => {
  it('names the nearest common size and keeps the photo long side long', async () => {
    const { nearestSize, orientSize, ratioText } = await import('./rugSize');
    expect(nearestSize(5 / 8)).toBe('5 x 8 ft');
    expect(nearestSize(8 / 5)).toBe('5 x 8 ft');
    expect(nearestSize(0.674)).toBe('2 x 3, 4 x 6 or 6 x 9 ft');
    expect(nearestSize(0.8)).toBe('8 x 10 ft');
    expect(nearestSize(0.56)).toBeNull();
    expect(orientSize({ a: 5, b: 8 }, false)).toEqual([5, 8]);
    expect(orientSize({ a: 5, b: 8 }, true)).toEqual([8, 5]);
    expect(ratioText(0.625)).toBe('1 : 1.60');
  });
});
