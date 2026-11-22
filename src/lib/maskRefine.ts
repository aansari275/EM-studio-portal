/**
 * Cleaning up a background removal mask, pure maths on typed arrays.
 *
 * U^2-Net small sees the photo at 320x320, so its mask, stretched to 2000px,
 * has a soft band 6 to 10px wide on every edge: a pale halo of floor around
 * the rug. Two cheap steps fix most of it (tested on 12 of the studio's raw
 * photos, 22 Nov 2026: 0 good / 8 usable / 4 failed became 6 / 2 / 4):
 *
 * 1. Run the model again on a crop around the rug (`cropBox`), so the rug
 *    fills the model's input. Only when the first mask does not touch the
 *    edge of the frame (`touchesEdge`); on full-bleed or cut-off shots the
 *    re-run made things much worse.
 * 2. A guided filter (He, Sun and Tang) against the photo itself, which snaps
 *    the mask's edge to the rug's real edge, then a re-steepen.
 *
 * Neither fixes a folded-back rug, a person on the rug or other rugs behind
 * it; `maskStats` feeds the "Check this" flag for those.
 */

/** Pixels from the frame edge that count as touching it, at 2000px (scaled with the size). */
export const EDGE_BAND_2000 = 8;
/** Padding around the rug for the crop re-run, as a share of the long side. */
export const CROP_PAD = 0.04;
/** Guided filter radius (px at 2000px) and regularisation (on 0..1 colour). */
export const GF_RADIUS = 5;
export const GF_EPS = 0.04 * 0.04;
/** Re-steepen after the filter: (q - 0.5) * k + 0.5. */
export const GF_STEEPEN = 1.6;

export const edgeBand = (w: number, h: number) => Math.max(2, Math.round((EDGE_BAND_2000 * Math.max(w, h)) / 2000));

/**
 * Share of the frame's edge band, as a fraction, that should count as the
 * rug touching the edge. A single corner grazing the frame (DSC04675: 59 of
 * 53,088 band pixels) is not a full-bleed shot; a rug running off the side
 * is (DSC04671: 19,361).
 */
export const EDGE_TOUCH_SHARE = 0.005;

/** How many mask pixels (over `thr`) lie in the edge band, and how many pixels the band has. */
export function edgeContact(alpha: Uint8Array | Uint8ClampedArray, w: number, h: number, thr = 128, band = edgeBand(w, h)): { hits: number; size: number } {
  let hits = 0, size = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    if (y < band || y >= h - band) {
      size += w;
      for (let x = 0; x < w; x++) if (alpha[row + x] > thr) hits++;
    } else {
      const b = Math.min(band, Math.floor(w / 2));
      size += 2 * b;
      for (let x = 0; x < b; x++) {
        if (alpha[row + x] > thr) hits++;
        if (alpha[row + w - 1 - x] > thr) hits++;
      }
    }
  }
  return { hits, size };
}

/**
 * True when the rug runs into the edge of the frame: more than
 * EDGE_TOUCH_SHARE of the edge band is rug. Decides whether the crop re-run
 * is safe, and sets the "touches the edge" note.
 */
export function touchesEdge(alpha: Uint8Array | Uint8ClampedArray, w: number, h: number, thr = 128, band = edgeBand(w, h)): boolean {
  const { hits, size } = edgeContact(alpha, w, h, thr, band);
  return hits > Math.max(0, EDGE_TOUCH_SHARE * size);
}

export type Box = { x: number; y: number; w: number; h: number };

/** The box around the mask (over `thr`), padded by `pad` of the long side and kept in the frame. Null if empty. */
export function cropBox(alpha: Uint8Array | Uint8ClampedArray, w: number, h: number, thr = 128, pad = CROP_PAD): Box | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (alpha[row + x] > thr) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const p = pad * Math.max(w, h);
  const bx0 = Math.max(0, Math.floor(x0 - p)), by0 = Math.max(0, Math.floor(y0 - p));
  const bx1 = Math.min(w, Math.ceil(x1 + 1 + p)), by1 = Math.min(h, Math.ceil(y1 + 1 + p));
  return { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 };
}

export interface MaskStats {
  /** Share of the frame kept (over 50%), percent. */
  keptPct: number;
  /** Share of the kept area (over 10%) that is only partly opaque (10 to 90%), percent. */
  semiPct: number;
  touchesEdge: boolean;
}

export function maskStats(alpha: Uint8Array | Uint8ClampedArray, w: number, h: number): MaskStats {
  let kept = 0, any = 0, semi = 0;
  for (let i = 0; i < w * h; i++) {
    const a = alpha[i];
    if (a > 128) kept++;
    if (a > 25) { any++; if (a < 230) semi++; }
  }
  return {
    keptPct: Math.round((100 * kept) / (w * h)),
    semiPct: any ? Math.round((1000 * semi) / any) / 10 : 0,
    touchesEdge: touchesEdge(alpha, w, h),
  };
}

/** Over this share of semi-transparent pixels in the kept area, the rug is probably see-through somewhere. */
export const SEMI_WARN_PCT = 12;

/**
 * What the tile says when a cutout needs a human look, or null. The first
 * that applies wins.
 */
export function cutoutWarning(s: MaskStats): string | null {
  if (s.keptPct < 8) return 'Very little was kept. Check the cutout.';
  if (s.keptPct > 97) return 'Almost nothing was removed. Check the cutout.';
  if (s.touchesEdge) return 'Rug touches the edge of the photo. Check the cutout.';
  if (s.semiPct > SEMI_WARN_PCT) return 'Parts of the rug look see-through. Check the cutout.';
  return null;
}

// ─── Guided filter ──────────────────────────────────────────────────────────

/**
 * Mean over a (2r+1) square window, clamped at the edges (divided by the
 * pixels actually in the window). Separable running sums, O(w*h) for any r.
 */
function boxMean(src: Float32Array, w: number, h: number, r: number, out: Float32Array, tmp: Float32Array): void {
  // horizontal sums into tmp, with the count folded in
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let s = 0;
    for (let x = 0; x <= Math.min(r, w - 1); x++) s += src[row + x];
    for (let x = 0; x < w; x++) {
      const lo = Math.max(0, x - r), hi = Math.min(w - 1, x + r);
      tmp[row + x] = s / (hi - lo + 1);
      if (x + r + 1 < w) s += src[row + x + r + 1];
      if (x - r >= 0) s -= src[row + x - r];
    }
  }
  // vertical sums of the row means
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = 0; y <= Math.min(r, h - 1); y++) s += tmp[y * w + x];
    for (let y = 0; y < h; y++) {
      const lo = Math.max(0, y - r), hi = Math.min(h - 1, y + r);
      out[y * w + x] = s / (hi - lo + 1);
      if (y + r + 1 < h) s += tmp[(y + r + 1) * w + x];
      if (y - r >= 0) s -= tmp[(y - r) * w + x];
    }
  }
}

/** The colour guided filter on one block of rows (all planes h x w). */
function guidedBlock(
  I: [Float32Array, Float32Array, Float32Array], p: Float32Array, w: number, h: number, r: number, eps: number
): Float32Array {
  const n = w * h;
  const F = () => new Float32Array(n);
  const tmp = F(), prod = F();
  const mean = (src: Float32Array) => { const o = F(); boxMean(src, w, h, r, o, tmp); return o; };
  const meanOf = (f: (i: number) => number) => { for (let i = 0; i < n; i++) prod[i] = f(i); return mean(prod); };
  const [R, G, B] = I;
  const mR = mean(R), mG = mean(G), mB = mean(B), mP = mean(p);
  const cRP = meanOf((i) => R[i] * p[i]), cGP = meanOf((i) => G[i] * p[i]), cBP = meanOf((i) => B[i] * p[i]);
  const vRR = meanOf((i) => R[i] * R[i]), vRG = meanOf((i) => R[i] * G[i]), vRB = meanOf((i) => R[i] * B[i]);
  const vGG = meanOf((i) => G[i] * G[i]), vGB = meanOf((i) => G[i] * B[i]), vBB = meanOf((i) => B[i] * B[i]);
  // a = (Sigma + eps)^-1 cov(I, p); b = mean(p) - a . mean(I). Written over the inputs' means.
  const aR = cRP, aG = cGP, aB = cBP, b = mP;
  for (let i = 0; i < n; i++) {
    const mr = mR[i], mg = mG[i], mb = mB[i], mp = mP[i];
    const cr = cRP[i] - mr * mp, cg = cGP[i] - mg * mp, cb = cBP[i] - mb * mp;
    const rr = vRR[i] - mr * mr + eps, rg = vRG[i] - mr * mg, rb = vRB[i] - mr * mb;
    const gg = vGG[i] - mg * mg + eps, gb = vGB[i] - mg * mb, bb = vBB[i] - mb * mb + eps;
    // inverse of the symmetric 3x3 by cofactors
    const i00 = gg * bb - gb * gb, i01 = rb * gb - rg * bb, i02 = rg * gb - rb * gg;
    const i11 = rr * bb - rb * rb, i12 = rb * rg - rr * gb, i22 = rr * gg - rg * rg;
    const det = rr * i00 + rg * i01 + rb * i02;
    const ar = (i00 * cr + i01 * cg + i02 * cb) / det;
    const ag = (i01 * cr + i11 * cg + i12 * cb) / det;
    const ab = (i02 * cr + i12 * cg + i22 * cb) / det;
    aR[i] = ar; aG[i] = ag; aB[i] = ab;
    b[i] = mp - ar * mr - ag * mg - ab * mb;
  }
  const maR = mean(aR), maG = mean(aG), maB = mean(aB), mb = mean(b);
  const q = F();
  for (let i = 0; i < n; i++) q[i] = maR[i] * R[i] + maG[i] * G[i] + maB[i] * B[i] + mb[i];
  return q;
}

/**
 * Refines `mask` (w x h, 0..255) against the photo `rgba` (w x h x 4) with
 * the colour guided filter, then re-steepens. Works in strips of rows with
 * enough overlap that the result equals one pass over the whole image, so
 * memory stays near 40 MB at 2000px whatever the photo's height. Fully
 * transparent and fully opaque areas come out exactly 0 and 255.
 */
export function refineMask(
  rgba: Uint8Array | Uint8ClampedArray, mask: Uint8Array | Uint8ClampedArray, w: number, h: number,
  r = GF_RADIUS, eps = GF_EPS, steepen = GF_STEEPEN, strip = 256
): Uint8Array {
  const out = new Uint8Array(w * h);
  const halo = 2 * r + 1;
  for (let y0 = 0; y0 < h; y0 += strip) {
    const y1 = Math.min(h, y0 + strip);
    const s0 = Math.max(0, y0 - halo), s1 = Math.min(h, y1 + halo);
    const sh = s1 - s0, n = w * sh;
    const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n), P = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const j = (s0 * w + i) * 4;
      R[i] = rgba[j] / 255; G[i] = rgba[j + 1] / 255; B[i] = rgba[j + 2] / 255;
      P[i] = mask[s0 * w + i] / 255;
    }
    const q = guidedBlock([R, G, B], P, w, sh, r, eps);
    for (let y = y0; y < y1; y++) {
      const src = (y - s0) * w, dst = y * w;
      for (let x = 0; x < w; x++) {
        const v = (q[src + x] - 0.5) * steepen + 0.5;
        out[dst + x] = v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
      }
    }
  }
  return out;
}

// ─── Edge colour ────────────────────────────────────────────────────────────

/**
 * Edge colour clean-up. A pixel on the rug's edge that is part see-through
 * still carries the photo's colour there, which is mostly floor: on a white
 * floor that reads as a thin pale line even once the mask is sharp. Each
 * partly transparent pixel takes the average colour of the solid rug pixels
 * within `r` instead (alpha untouched). Solid and fully clear pixels are left
 * exactly as they are. In place on `rgba`, whose alpha channel must be set.
 */
export function decontaminate(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, r = 4, solid = 230, strip = 256): void {
  // In strips of rows (with r rows of overlap), so a 6000px photo in the
  // editor needs tens of MB, not hundreds.
  for (let y0 = 0; y0 < h; y0 += strip) {
    const y1 = Math.min(h, y0 + strip);
    const s0 = Math.max(0, y0 - r), s1 = Math.min(h, y1 + r);
    const sh = s1 - s0, n = w * sh, base = s0 * w;
    let edge = 0;
    for (let i = y0 * w; i < y1 * w; i++) { const a = rgba[i * 4 + 3]; if (a > 0 && a < solid) { edge++; break; } }
    if (!edge) continue;
    const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n), M = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const j = (base + i) * 4;
      if (rgba[j + 3] >= solid) { M[i] = 1; R[i] = rgba[j]; G[i] = rgba[j + 1]; B[i] = rgba[j + 2]; }
    }
    const tmp = new Float32Array(n);
    const mR = new Float32Array(n), mG = new Float32Array(n), mB = new Float32Array(n), mM = new Float32Array(n);
    boxMean(R, w, sh, r, mR, tmp); boxMean(G, w, sh, r, mG, tmp); boxMean(B, w, sh, r, mB, tmp); boxMean(M, w, sh, r, mM, tmp);
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y - s0) * w + x, j = (y * w + x) * 4;
        const a = rgba[j + 3];
        if (a === 0 || a >= solid || mM[i] <= 0) continue;
        rgba[j] = Math.round(mR[i] / mM[i]);
        rgba[j + 1] = Math.round(mG[i] / mM[i]);
        rgba[j + 2] = Math.round(mB[i] / mM[i]);
      }
    }
  }
}

/**
 * The whole clean-up for a cutout: the guided filter on the mask, the mask
 * into the alpha channel, then the edge colour. In place on `rgba` (the photo
 * at the cutout's size), which is also returned.
 */
export function finishCutout<T extends Uint8Array | Uint8ClampedArray>(rgba: T, mask: Uint8Array, w: number, h: number): T {
  const alpha = refineMask(rgba, mask, w, h);
  for (let i = 0; i < w * h; i++) rgba[i * 4 + 3] = alpha[i];
  decontaminate(rgba, w, h);
  return rgba;
}
