import { describe, it, expect } from 'vitest';
import {
  homography, apply, plan, warp, render, applyTone, autoLevels, buildLuts, startQuad,
  hasAlpha, encodingFor, newPx, straightenShrink, insetQuad,
  DEFAULT_SETTINGS, NEUTRAL_TONE, type Quad, type Px,
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

  it('takes the output size from the average of opposite sides', () => {
    const quad: Quad = [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.6, y: 1 }, { x: 0, y: 1 }];
    const p = plan(1000, 1000, { quad, angle: 0, crop: null });
    expect(p.outW).toBe(550); // (500 + 600) / 2
    close(p.outH, (1000 + Math.hypot(100, 1000)) / 2, 1);
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
