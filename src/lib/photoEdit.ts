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
  /**
   * Size: stretch along each axis of the squared-up, straightened frame
   * (1 = as found), so width and length can be set separately. Applies to any
   * photo, with or without a skew fix.
   */
  stretch: { x: number; y: number };
  /**
   * A real rug's proportions, width / height of the result before crop, set
   * from Rug size. When set it wins over `stretch`, so the result has exactly
   * these proportions even if the corners move afterwards. Null = use stretch.
   */
  shape: number | null;
}

/** What the editor knows about the camera frame the photo came from. */
export interface Frame {
  /**
   * Focal length as a fraction of the frame diagonal (from EXIF), only when
   * the photo is still the camera's own uncropped frame. Null = unknown.
   */
  focal?: number | null;
}

export const NEUTRAL_TONE: Tone = {
  black: 0, white: 255, gamma: 1, brightness: 0, contrast: 0, saturation: 0, warmth: 0,
};

export const NO_STRETCH = { x: 1, y: 1 } as const;

export const DEFAULT_SETTINGS: EditSettings = {
  quad: null, angle: 0, crop: null, tone: NEUTRAL_TONE, stretch: NO_STRETCH, shape: null,
};

/** Stretch limits, either axis: a quarter to four times. */
export const MIN_STRETCH = 0.25;
export const MAX_STRETCH = 4;

export const MAX_ANGLE = 15;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function newPx(width: number, height: number): Px {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function isNeutralTone(t: Tone): boolean {
  return (Object.keys(NEUTRAL_TONE) as (keyof Tone)[]).every((k) => t[k] === NEUTRAL_TONE[k]);
}

export const isNoStretch = (s: Partial<Pick<EditSettings, 'stretch' | 'shape'>>) =>
  !s.shape && (!s.stretch || (s.stretch.x === 1 && s.stretch.y === 1));

export function isDefaultSettings(s: EditSettings): boolean {
  return !s.quad && !s.angle && !s.crop && isNeutralTone(s.tone) && isNoStretch(s);
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
  /** How the shape was decided, for the editor's Size step. */
  info: {
    /** The proportions worked out from the skew corners, when there are corners. */
    estimate: AspectEstimate | null;
    /** Width / height after skew and straighten, before any stretch. */
    base: number;
    /** The stretch actually used (from `shape` when that is set). */
    sx: number;
    sy: number;
  };
}

type PlanSettings = Pick<EditSettings, 'quad' | 'angle' | 'crop'> & Partial<Pick<EditSettings, 'stretch' | 'shape'>>;

/**
 * Turns the settings into an output size and one output-to-source matrix,
 * for a source of srcW x srcH pixels, with the long side capped at maxSide.
 * `upTo` stops early, for the editor's own views: 'straighten' leaves the
 * crop out so the crop box can be drawn over the whole frame.
 *
 * Order: fix skew, straighten, size (stretch), crop. Size comes after
 * straighten so it stretches along the rug's own sides, and before crop so
 * the crop box (in fractions) still sits where she put it.
 */
export function plan(
  srcW: number,
  srcH: number,
  s: PlanSettings,
  maxSide = 2000,
  upTo: 'all' | 'straighten' = 'all',
  frame: Frame = {}
): Plan {
  // A: fix skew. The quad becomes an upright rectangle with the rug's real
  // proportions as worked out from the perspective of the four corners (not
  // the side lengths, which shrink with distance). Its area matches the
  // quad's, so the detail available sets the natural size.
  let toSrc: Mat3 = IDENTITY;
  let W = srcW, H = srcH;
  let estimate: AspectEstimate | null = null;
  if (s.quad) {
    const q = s.quad.map((p) => ({ x: p.x * srcW, y: p.y * srcH })) as Quad;
    estimate = estimateAspect(q, srcW, srcH, frame.focal ?? null);
    const sideW = Math.max(1, (dist(q[0], q[1]) + dist(q[3], q[2])) / 2);
    const sideH = Math.max(1, (dist(q[0], q[3]) + dist(q[1], q[2])) / 2);
    const area = sideW * sideH;
    W = Math.max(1, Math.sqrt(area * estimate.ratio));
    H = Math.max(1, Math.sqrt(area / estimate.ratio));
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

  // B2: size. Width and length stretched separately; a rug size sets the
  // proportions exactly, keeping the area so no detail is thrown away.
  const base = W / H;
  let sx = clamp(s.stretch?.x ?? 1, MIN_STRETCH, MAX_STRETCH);
  let sy = clamp(s.stretch?.y ?? 1, MIN_STRETCH, MAX_STRETCH);
  if (s.shape && s.shape > 0 && Number.isFinite(s.shape)) {
    sx = Math.sqrt(s.shape / base);
    sy = 1 / sx;
  }
  if (sx !== 1 || sy !== 1) {
    toSrc = mul(toSrc, scale(1 / sx, 1 / sy));
    W *= sx; H *= sy;
  }

  // C: crop, a plain window onto the sized frame.
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
  return { outW, outH, toSource: toSrc, info: { estimate, base, sx, sy } };
}

/**
 * The same plan for a copy of the source at another size (same frame): the
 * output size stays, only where it samples moves. Used to size the result
 * from the full-resolution photo while sampling a lighter working copy.
 */
export function rescalePlan(p: Plan, fromW: number, fromH: number, toW: number, toH: number): Plan {
  return { ...p, toSource: mul(scale(toW / fromW, toH / fromH), p.toSource) };
}

/**
 * How many source pixels one output pixel steps over, smallest and largest,
 * measured over a grid across the output. Under perspective the near end of
 * a rug is squeezed (large step) and the far end stretched (small step).
 */
export function sampleSteps(p: Plan): { min: number; max: number } {
  let min = Infinity, max = 0;
  const n = 6;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const x = (p.outW * i) / n, y = (p.outH * j) / n;
      const o = apply(p.toSource, { x, y });
      const dx = apply(p.toSource, { x: x + 1, y });
      const dy = apply(p.toSource, { x, y: y + 1 });
      for (const d of [dist(o, dx), dist(o, dy)]) {
        if (!Number.isFinite(d)) continue;
        if (d < min) min = d;
        if (d > max) max = d;
      }
    }
  }
  return { min: Number.isFinite(min) ? min : 1, max: max || 1 };
}

// ─── True proportions from perspective ──────────────────────────────────────

export interface AspectEstimate {
  /** Width / height of the real rectangle (top edge over left edge). */
  ratio: number;
  /**
   * 'perspective': focal length worked out from the two vanishing points.
   * 'lens': focal length from the photo's EXIF. 'assumed': a typical lens
   * (about 28mm full-frame equivalent) because neither was available.
   * 'sides': the side-length ratio (a flat-on view, or a fallback).
   */
  method: 'perspective' | 'lens' | 'assumed' | 'sides';
  /** Focal length used, as a fraction of the frame diagonal. */
  focal: number | null;
}

/** About a 28mm lens on full frame (or a phone's main camera), as a fraction of the diagonal. */
export const TYPICAL_FOCAL = 28 / 43.27;
/** Beyond this distance (in frame diagonals) a vanishing point is too far to trust. */
const FAR_VANISHING = 4;
const MAX_RATIO = 10;

type V3 = [number, number, number];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * The true width / height of the rectangle whose photo is `quad` (pixel
 * coordinates of a w x h frame; top left, top right, bottom right, bottom
 * left), by the whiteboard rectification of Zhang and He (2007). It assumes
 * square pixels and the principal point at the centre of the frame, so the
 * frame must be the camera's own, uncropped.
 *
 * The focal length comes from the two vanishing points when both are near
 * enough to measure. When a pair of sides is (nearly) parallel in the photo,
 * for example a rug shot straight from one end, that vanishing point is at
 * infinity and the focal length cannot be measured; then `focal` (from EXIF)
 * is used, or a typical lens. With both pairs parallel the view is flat on
 * and the answer is the side-length ratio. Anything absurd falls back to the
 * side-length ratio as well.
 */
export function estimateAspect(quad: Quad, w: number, h: number, focal: number | null = null): AspectEstimate {
  const d = Math.hypot(w, h) || 1;
  const cx = w / 2, cy = h / 2;
  // centred, in units of the diagonal, so the numbers are well scaled
  const m = (p: Pt): V3 => [(p.x - cx) / d, (p.y - cy) / d, 1];
  const m1 = m(quad[0]), m2 = m(quad[1]), m4 = m(quad[2]), m3 = m(quad[3]);
  const sides = (dist(quad[0], quad[1]) + dist(quad[3], quad[2])) / (dist(quad[0], quad[3]) + dist(quad[1], quad[2]));
  const fallback: AspectEstimate = { ratio: clamp(Number.isFinite(sides) && sides > 0 ? sides : 1, 1 / MAX_RATIO, MAX_RATIO), method: 'sides', focal: null };

  const c14 = cross3(m1, m4);
  const k2 = dot3(c14, m3) / dot3(cross3(m2, m4), m3);
  const k3 = dot3(c14, m2) / dot3(cross3(m3, m4), m2);
  // A crossed or folded quad is not the photo of a rectangle.
  if (!(k2 > 0) || !(k3 > 0) || !Number.isFinite(k2) || !Number.isFinite(k3)) return fallback;
  const n2: V3 = [k2 * m2[0] - m1[0], k2 * m2[1] - m1[1], k2 * m2[2] - m1[2]];
  const n3: V3 = [k3 * m3[0] - m1[0], k3 * m3[1] - m1[1], k3 * m3[2] - m1[2]];

  // Distance of each vanishing point from the centre, in diagonals.
  const far = (n: V3) => Math.hypot(n[0], n[1]) / Math.max(1e-12, Math.abs(n[2]));
  const flat = 1e-9;
  let f: number | null = null;
  let method: AspectEstimate['method'];
  if (Math.abs(n2[2]) < flat && Math.abs(n3[2]) < flat) {
    method = 'sides'; // flat on: no perspective at all
  } else if (focal && focal > 0) {
    f = focal; method = 'lens';
  } else {
    if (far(n2) < FAR_VANISHING && far(n3) < FAR_VANISHING) {
      const f2 = -(n2[0] * n3[0] + n2[1] * n3[1]) / (n2[2] * n3[2]);
      const fm = f2 > 0 ? Math.sqrt(f2) : NaN;
      if (fm >= 0.2 && fm <= 5) { f = fm; method = 'perspective'; }
    }
    if (f === null) { f = TYPICAL_FOCAL; method = 'assumed'; }
  }
  const ff = (f ?? 0) ** 2;
  const num = n2[0] ** 2 + n2[1] ** 2 + ff * n2[2] ** 2;
  const den = n3[0] ** 2 + n3[1] ** 2 + ff * n3[2] ** 2;
  const ratio = Math.sqrt(num / den);
  if (!Number.isFinite(ratio) || ratio <= 1 / MAX_RATIO || ratio >= MAX_RATIO) return fallback;
  return { ratio, method: method!, focal: f };
}

const isIdentity = (m: Mat3) => m.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-9);

/**
 * Inverse maps every output pixel through `toSource` and samples the source
 * bilinearly. Sampling is done on premultiplied colour, so a transparent
 * neighbour's colour (often black in a cutout) never bleeds into the edge as
 * a dark halo. Positions off the source are clamped to its edge.
 *
 * `ss` takes ss x ss samples per output pixel and averages them. Use it when
 * the output squeezes the source (the near end of a rug under perspective),
 * where one bilinear sample per pixel would shimmer on fine texture.
 */
export function warp(src: Px, p: Plan, ss = 1): Px {
  const { outW, outH, toSource: m } = p;
  if (outW === src.width && outH === src.height && isIdentity(m)) {
    return { width: outW, height: outH, data: new Uint8ClampedArray(src.data) };
  }
  const n = Math.max(1, Math.min(4, Math.round(ss)));
  const out = newPx(outW, outH);
  const sd = src.data, od = out.data;
  const sw = src.width, sh = src.height;
  const maxX = sw - 1, maxY = sh - 1;
  const inv = 1 / (n * n);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < n; j++) {
        const py = y + (j + 0.5) / n;
        for (let i = 0; i < n; i++) {
          const px = x + (i + 0.5) / n;
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
          a += a00 + a10 + a01 + a11;
          r += sd[i00] * a00 + sd[i10] * a10 + sd[i01] * a01 + sd[i11] * a11;
          g += sd[i00 + 1] * a00 + sd[i10 + 1] * a10 + sd[i01 + 1] * a01 + sd[i11 + 1] * a11;
          b += sd[i00 + 2] * a00 + sd[i10 + 2] * a10 + sd[i01 + 2] * a01 + sd[i11 + 2] * a11;
        }
      }
      const o = (y * outW + x) * 4;
      if (a <= 0) { od[o] = od[o + 1] = od[o + 2] = od[o + 3] = 0; continue; }
      od[o] = r / a; od[o + 1] = g / a; od[o + 2] = b / a; od[o + 3] = a * inv;
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
export function render(src: Px, s: EditSettings, maxSide = 2000, frame: Frame = {}): Px {
  const geo = warp(src, plan(src.width, src.height, s, maxSide, 'all', frame));
  return applyTone(geo, s.tone);
}
