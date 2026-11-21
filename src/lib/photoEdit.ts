/**
 * Pure image maths for the photo editor. No React, no DOM: everything works on
 * plain { width, height, data } pixel buffers, so it runs the same in the
 * browser and in unit tests, and the live preview (about 1000px) and the final
 * render (up to 2000px) go through exactly the same code.
 *
 * Geometry is one inverse map. Fix skew, straighten and crop are each a
 * projective transform, so they are multiplied into a single 3x3 matrix that
 * takes an output pixel straight back to the source. Every output pixel is
 * sampled once, which keeps the result sharp however many tools were used.
 *
 * Coordinates in the settings are fractions (0..1), never pixels, so the same
 * settings describe the downscaled preview and the full size render.
 */

export type Px = { width: number; height: number; data: Uint8ClampedArray };
export type Pt = { x: number; y: number };
/** Top left, top right, bottom right, bottom left. */
export type Quad = [Pt, Pt, Pt, Pt];
export type Rect = { x: number; y: number; w: number; h: number };
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export interface Tone {
  /** Levels, 0..255. */
  black: number;
  white: number;
  /** Midtones. 1 is neutral, above 1 lightens. */
  gamma: number;
  /** -100..100, 0 is neutral. */
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
}

export interface EditSettings {
  /** Fix skew: the four corners of the rug, as fractions of the source. Null = whole frame. */
  quad: Quad | null;
  /** Straighten, degrees, -15..15. */
  angle: number;
  /** Crop, as fractions of the straightened frame. Null = all of it. */
  crop: Rect | null;
  tone: Tone;
}

export const NEUTRAL_TONE: Tone = {
  black: 0, white: 255, gamma: 1, brightness: 0, contrast: 0, saturation: 0, warmth: 0,
};

export const DEFAULT_SETTINGS: EditSettings = { quad: null, angle: 0, crop: null, tone: NEUTRAL_TONE };

export const MAX_ANGLE = 15;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function newPx(width: number, height: number): Px {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function isNeutralTone(t: Tone): boolean {
  return (Object.keys(NEUTRAL_TONE) as (keyof Tone)[]).every((k) => t[k] === NEUTRAL_TONE[k]);
}

export function isDefaultSettings(s: EditSettings): boolean {
  return !s.quad && !s.angle && !s.crop && isNeutralTone(s.tone);
}

// ─── Matrices ───────────────────────────────────────────────────────────────

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function mul(a: Mat3, b: Mat3): Mat3 {
  const r = new Array(9).fill(0) as Mat3;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}

export function apply(m: Mat3, p: Pt): Pt {
  const w = m[6] * p.x + m[7] * p.y + m[8];
  return { x: (m[0] * p.x + m[1] * p.y + m[2]) / w, y: (m[3] * p.x + m[4] * p.y + m[5]) / w };
}

const translate = (x: number, y: number): Mat3 => [1, 0, x, 0, 1, y, 0, 0, 1];
const scale = (sx: number, sy = sx): Mat3 => [sx, 0, 0, 0, sy, 0, 0, 0, 1];
const rotate = (rad: number): Mat3 => {
  const c = Math.cos(rad), s = Math.sin(rad);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};

/**
 * The homography that takes each `from` point to the matching `to` point.
 * Solves the usual 8x8 system with h33 = 1, by Gaussian elimination with
 * partial pivoting. Throws if the points are degenerate (three in a line).
 */
export function homography(from: Quad, to: Quad): Mat3 {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  const n = 8;
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-12) throw new Error('Those corners do not make a shape that can be squared up.');
    [A[col], A[piv]] = [A[piv], A[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      if (!f) continue;
      for (let c = col; c <= n; c++) A[r][c] -= f * A[col][c];
    }
  }
  const h = A.map((row, i) => row[n] / row[i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

// ─── Geometry plan ──────────────────────────────────────────────────────────

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** The whole frame, inset by `inset` on every side, as a fractional quad. */
export function insetQuad(inset = 0.05): Quad {
  const a = inset, b = 1 - inset;
  return [{ x: a, y: a }, { x: b, y: a }, { x: b, y: b }, { x: a, y: b }];
}

/**
 * How much a w x h frame must shrink so that, turned by `rad`, it still
 * sits fully inside the unturned frame. No empty corners after straighten.
 */
export function straightenShrink(w: number, h: number, rad: number): number {
  const c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad));
  return c + Math.max(w / h, h / w) * s;
}

export interface Plan {
  outW: number;
  outH: number;
  /** Maps an output pixel position to a source pixel position. */
  toSource: Mat3;
}

/**
 * Turns the settings into an output size and one output-to-source matrix,
 * for a source of srcW x srcH pixels, with the long side capped at maxSide.
 * `upTo` stops early, for the editor's own views: 'skew' shows the source,
 * 'straighten' shows the squared-up photo turned, 'crop' adds nothing yet.
 */
export function plan(
  srcW: number,
  srcH: number,
  s: Pick<EditSettings, 'quad' | 'angle' | 'crop'>,
  maxSide = 2000,
  upTo: 'all' | 'straighten' = 'all'
): Plan {
  // A: fix skew. The quad becomes an upright rectangle whose sides are the
  // average of the opposite sides of the quad, so the rug keeps its proportions.
  let toSrc: Mat3 = IDENTITY;
  let W = srcW, H = srcH;
  if (s.quad) {
    const q = s.quad.map((p) => ({ x: p.x * srcW, y: p.y * srcH })) as Quad;
    W = Math.max(1, (dist(q[0], q[1]) + dist(q[3], q[2])) / 2);
    H = Math.max(1, (dist(q[0], q[3]) + dist(q[1], q[2])) / 2);
    const rect: Quad = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
    toSrc = homography(rect, q);
  }

  // B: straighten. Turn about the centre and keep the largest same-shaped
  // frame that has no empty corners.
  if (s.angle) {
    const rad = (s.angle * Math.PI) / 180;
    const k = straightenShrink(W, H, rad);
    const Wb = W / k, Hb = H / k;
    // output position in B -> centred -> turned back -> position in A
    const bToA = mul(translate(W / 2, H / 2), mul(rotate(-rad), translate(-Wb / 2, -Hb / 2)));
    toSrc = mul(toSrc, bToA);
    W = Wb; H = Hb;
  }

  // C: crop, a plain window onto the straightened frame.
  if (s.crop && upTo === 'all') {
    const c = s.crop;
    toSrc = mul(toSrc, translate(c.x * W, c.y * H));
    W = Math.max(1, c.w * W);
    H = Math.max(1, c.h * H);
  }

  const k = Math.min(1, maxSide / Math.max(W, H));
  const outW = Math.max(1, Math.round(W * k));
  const outH = Math.max(1, Math.round(H * k));
  toSrc = mul(toSrc, scale(W / outW, H / outH));
  return { outW, outH, toSource: toSrc };
}

const isIdentity = (m: Mat3) => m.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-9);

/**
 * Inverse maps every output pixel through `toSource` and samples the source
 * bilinearly. Sampling is done on premultiplied colour, so a transparent
 * neighbour's colour (often black in a cutout) never bleeds into the edge as
 * a dark halo. Positions off the source are clamped to its edge.
 */
export function warp(src: Px, p: Plan): Px {
  const { outW, outH, toSource: m } = p;
  if (outW === src.width && outH === src.height && isIdentity(m)) {
    return { width: outW, height: outH, data: new Uint8ClampedArray(src.data) };
  }
  const out = newPx(outW, outH);
  const sd = src.data, od = out.data;
  const sw = src.width, sh = src.height;
  const maxX = sw - 1, maxY = sh - 1;
  for (let y = 0; y < outH; y++) {
    const py = y + 0.5;
    for (let x = 0; x < outW; x++) {
      const px = x + 0.5;
      const w = m[6] * px + m[7] * py + m[8];
      // pixel centres sit at +0.5, so shift back to sample positions
      let sx = (m[0] * px + m[1] * py + m[2]) / w - 0.5;
      let sy = (m[3] * px + m[4] * py + m[5]) / w - 0.5;
      sx = sx < 0 ? 0 : sx > maxX ? maxX : sx;
      sy = sy < 0 ? 0 : sy > maxY ? maxY : sy;
      const x0 = sx | 0, y0 = sy | 0;
      const x1 = x0 < maxX ? x0 + 1 : x0, y1 = y0 < maxY ? y0 + 1 : y0;
      const fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      const a00 = sd[i00 + 3] * w00, a10 = sd[i10 + 3] * w10, a01 = sd[i01 + 3] * w01, a11 = sd[i11 + 3] * w11;
      const a = a00 + a10 + a01 + a11;
      const o = (y * outW + x) * 4;
      if (a <= 0) { od[o] = od[o + 1] = od[o + 2] = od[o + 3] = 0; continue; }
      od[o] = (sd[i00] * a00 + sd[i10] * a10 + sd[i01] * a01 + sd[i11] * a11) / a;
      od[o + 1] = (sd[i00 + 1] * a00 + sd[i10 + 1] * a10 + sd[i01 + 1] * a01 + sd[i11 + 1] * a11) / a;
      od[o + 2] = (sd[i00 + 2] * a00 + sd[i10 + 2] * a10 + sd[i01 + 2] * a01 + sd[i11 + 2] * a11) / a;
      od[o + 3] = a;
    }
  }
  return out;
}

// ─── Tone ───────────────────────────────────────────────────────────────────

/** One lookup table per channel, folding levels, brightness, contrast and warmth together. */
export function buildLuts(t: Tone): [Uint8Array, Uint8Array, Uint8Array] {
  const r = new Uint8Array(256), g = new Uint8Array(256), b = new Uint8Array(256);
  const lo = clamp(t.black, 0, 254);
  const hi = clamp(t.white, lo + 1, 255);
  const gamma = clamp(t.gamma, 0.1, 10);
  const bright = t.brightness / 100 * 0.4;
  const contrast = 1 + clamp(t.contrast, -100, 100) / 100;
  const warm = t.warmth / 100 * 0.1;
  for (let v = 0; v < 256; v++) {
    let x = clamp((v - lo) / (hi - lo), 0, 1);
    if (gamma !== 1) x = Math.pow(x, 1 / gamma);
    x = (x + bright - 0.5) * contrast + 0.5;
    r[v] = Math.round(clamp(x + warm, 0, 1) * 255);
    g[v] = Math.round(clamp(x, 0, 1) * 255);
    b[v] = Math.round(clamp(x - warm, 0, 1) * 255);
  }
  return [r, g, b];
}

/** Applies the tone settings into a new buffer. Alpha is copied untouched. */
export function applyTone(src: Px, t: Tone): Px {
  if (isNeutralTone(t)) return { width: src.width, height: src.height, data: new Uint8ClampedArray(src.data) };
  const [lr, lg, lb] = buildLuts(t);
  const sat = 1 + clamp(t.saturation, -100, 100) / 100;
  const s = src.data;
  const out = newPx(src.width, src.height);
  const o = out.data;
  for (let i = 0; i < s.length; i += 4) {
    let r = lr[s[i]], g = lg[s[i + 1]], b = lb[s[i + 2]];
    if (sat !== 1) {
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
    }
    o[i] = r; o[i + 1] = g; o[i + 2] = b; o[i + 3] = s[i + 3];
  }
  return out;
}

/**
 * Auto levels: black and white points from the 0.5 and 99.5 luminance
 * percentiles. Transparent pixels are ignored, so a cutout is judged on the
 * rug alone and not on the empty space around it.
 */
export function autoLevels(src: Px, loPct = 0.005, hiPct = 0.995): { black: number; white: number } {
  const hist = new Uint32Array(256);
  const d = src.data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 16) continue;
    hist[Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2])]++;
    n++;
  }
  if (!n) return { black: 0, white: 255 };
  const find = (target: number) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > target) return v; }
    return 255;
  };
  let black = find(n * loPct);
  let white = find(n * hiPct);
  if (white - black < 2) { black = 0; white = 255; }
  return { black, white };
}

// ─── Transparency ───────────────────────────────────────────────────────────

/** True if any pixel is less than fully opaque. */
export function hasAlpha(src: Px): boolean {
  const d = src.data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
  return false;
}

/** The file format to save a result in: PNG keeps transparency, JPEG otherwise. */
export function encodingFor(src: Px): { type: 'image/png'; ext: 'png'; quality?: undefined } | { type: 'image/jpeg'; ext: 'jpg'; quality: number } {
  return hasAlpha(src) ? { type: 'image/png', ext: 'png' } : { type: 'image/jpeg', ext: 'jpg', quality: 0.92 };
}

/**
 * Starting corners for fix skew. On a cutout the rug's own corners are found
 * from the alpha mask (the extreme points along the two diagonals); on a
 * normal photo the handles start 5% in from the edges.
 */
export function startQuad(src: Px): Quad {
  if (!hasAlpha(src)) return insetQuad(0.05);
  const { width: w, height: h, data: d } = src;
  let tl = Infinity, br = -Infinity, tr = -Infinity, bl = -Infinity;
  const q: Pt[] = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
  let any = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] < 128) continue;
      any = true;
      const s = x + y, t = x - y;
      if (s < tl) { tl = s; q[0] = { x, y }; }
      if (t > tr) { tr = t; q[1] = { x: x + 1, y }; }
      if (s > br) { br = s; q[2] = { x: x + 1, y: y + 1 }; }
      if (-t > bl) { bl = -t; q[3] = { x, y: y + 1 }; }
    }
  }
  if (!any) return insetQuad(0.05);
  const quad = q.map((p) => ({ x: p.x / w, y: p.y / h })) as Quad;
  // A mask with no real corners (a round rug, a sliver) gives a squashed quad.
  // Fall back to the inset frame rather than offer handles on top of each other.
  const area = Math.abs(
    quad.reduce((acc, p, i) => { const n = quad[(i + 1) % 4]; return acc + p.x * n.y - n.x * p.y; }, 0) / 2
  );
  return area < 0.02 ? insetQuad(0.05) : quad;
}

/**
 * The full pipeline: geometry then tone, into a new buffer. Returns the
 * source unchanged (copied) when every setting is neutral.
 */
export function render(src: Px, s: EditSettings, maxSide = 2000): Px {
  const geo = warp(src, plan(src.width, src.height, s, maxSide));
  return applyTone(geo, s.tone);
}
