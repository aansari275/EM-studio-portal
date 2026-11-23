import type { Pt, Px } from './photoEdit';

/**
 * Touch up for cutouts: paint to bring back pixels from the original photo,
 * or to erase. Pure maths, no DOM, unit tested (touchUp.test.ts).
 *
 * Why it exists: background removal cuts off fringes and pale end bands on
 * pale floors and sometimes leaves bits of floor. Four bigger models were
 * tried and none fixed it, so a person paints the fix.
 *
 * A stroke is stored as points in fractions of the image (0..1) and a radius
 * as a fraction of the long side, so the same strokes replay on the small
 * preview while painting and on the full-size cutout on Apply, and give the
 * same result at both sizes.
 *
 * Bring back needs the original the cutout came from, pixel aligned
 * (`alignment`, `contentMismatch`). The original is drawn at the cutout's
 * size, which is exactly how `removeBackground` made the cutout, so pixel
 * (x, y) of one is pixel (x, y) of the other.
 *
 * Skip the floor (smart Bring back): a painted pixel only comes back as far
 * as it differs from the floor colour around it (`smartAlpha`), so painting
 * loosely over a fringe restores the strands without a slab of floor.
 */

export type TouchMode = 'restore' | 'erase';

export interface Stroke {
  mode: TouchMode;
  /** Bring back only what differs from the floor (ignored for erase). */
  smart: boolean;
  /** Brush radius, fraction of the image's long side. */
  size: number;
  /** Fractions of width and height. */
  points: Pt[];
}

/** Brush radius range and default, fractions of the long side. */
export const BRUSH_MIN = 0.003;
export const BRUSH_MAX = 0.08;
export const BRUSH_DEFAULT = 0.02;
/** The inner share of the radius painted at full strength; the rest fades out. Hard enough that strokes laid side by side (up to 1.4 radii apart) leave no see-through lines. */
export const BRUSH_HARD = 0.7;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** One step of the brush size slider or the [ and ] keys: about 15% bigger or smaller. */
export function stepBrush(size: number, dir: 1 | -1): number {
  return clamp(size * (dir > 0 ? 1.15 : 1 / 1.15), BRUSH_MIN, BRUSH_MAX);
}

// ─── Alignment ────────────────────────────────────────────────────────────

export type Alignment = { ok: true; scaleX: number; scaleY: number } | { ok: false; reason: string };

export const NO_ORIGINAL = 'Bring back needs the original photo, and this cutout has none.';
export const NOT_DIRECT = 'Bring back is off: the photo was changed after the cut, so the original no longer lines up.';
export const MISALIGNED = 'Bring back is off: the original does not line up with this cutout.';

/**
 * Can the original be laid under the cutout pixel for pixel? The cutout is
 * the original scaled to fit a long side (2000px), same framing, so the
 * sizes must agree to the pixel after that scale. `direct` is
 * `Slot.cutOfOriginal`: false once skew, crop, size or tone ran after the cut.
 * The returned scale maps a cutout pixel to the original's pixel.
 */
export function alignment(
  cut: { width: number; height: number },
  orig: { width: number; height: number } | null | undefined,
  direct: boolean
): Alignment {
  if (!orig || !orig.width || !orig.height) return { ok: false, reason: NO_ORIGINAL };
  if (!direct) return { ok: false, reason: NOT_DIRECT };
  const k = Math.max(cut.width, cut.height) / Math.max(orig.width, orig.height);
  const ew = Math.max(1, Math.round(orig.width * k)), eh = Math.max(1, Math.round(orig.height * k));
  if (Math.abs(ew - cut.width) > 1 || Math.abs(eh - cut.height) > 1) return { ok: false, reason: MISALIGNED };
  return { ok: true, scaleX: orig.width / cut.width, scaleY: orig.height / cut.height };
}

/** Where cutout pixel (x, y) lies in the original (pixel centres). */
export function toOriginal(a: { scaleX: number; scaleY: number }, x: number, y: number): Pt {
  return { x: (x + 0.5) * a.scaleX - 0.5, y: (y + 0.5) * a.scaleY - 0.5 };
}

/**
 * Mean colour difference (0..255) between the cutout's solid pixels and the
 * original drawn at the same size, on a sparse grid. Same photo, same
 * framing: a few levels (resampling, JPEG). Turned, mirrored or shifted:
 * tens of levels. Catches a kept Library cutout that was turned after.
 * Returns null when there are too few solid pixels to tell.
 */
export function contentMismatch(cut: Px, orig: Px, step = 7): number | null {
  if (cut.width !== orig.width || cut.height !== orig.height) return 255;
  const c = cut.data, o = orig.data;
  let sum = 0, n = 0;
  for (let y = 0; y < cut.height; y += step) {
    for (let x = 0; x < cut.width; x += step) {
      const i = (y * cut.width + x) * 4;
      if (c[i + 3] < 255) continue;
      sum += (Math.abs(c[i] - o[i]) + Math.abs(c[i + 1] - o[i + 1]) + Math.abs(c[i + 2] - o[i + 2])) / 3;
      n++;
    }
  }
  return n < 50 ? null : sum / n;
}
/** Above this mean difference the original is taken as not lining up. */
export const MISMATCH_LIMIT = 14;

// ─── Brush ────────────────────────────────────────────────────────────────

/** Brush strength at distance d from the stroke's centre line, radius r: full inside, soft edge. */
export function falloff(d: number, r: number): number {
  if (d >= r) return 0;
  const inner = r * BRUSH_HARD;
  if (d <= inner) return 1;
  const t = 1 - (d - inner) / (r - inner);
  return t * t * (3 - 2 * t);
}

export interface Cover { x0: number; y0: number; w: number; h: number; cov: Float32Array }

/** Pixel radius of a stroke on an image of this size (at least half a pixel). */
export const radiusPx = (size: number, width: number, height: number) => Math.max(0.5, size * Math.max(width, height));

/**
 * The brush's strength (0..1) from point a to point b (fractions), written
 * into `into` (a full-size map) as the maximum with what is there, so a
 * stroke never builds up over itself. Returns the pixel box touched.
 */
export function stampSegment(
  into: Float32Array, width: number, height: number, a: Pt, b: Pt, size: number
): { x0: number; y0: number; x1: number; y1: number } | null {
  const r = radiusPx(size, width, height);
  const ax = a.x * width, ay = a.y * height, bx = b.x * width, by = b.y * height;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(width - 1, Math.ceil(Math.max(ax, bx) + r));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r)), y1 = Math.min(height - 1, Math.ceil(Math.max(ay, by) + r));
  if (x0 > x1 || y0 > y1) return null;
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + t * dx - px, qy = ay + t * dy - py;
      const f = falloff(Math.sqrt(qx * qx + qy * qy), r);
      if (f > 0) { const i = y * width + x; if (f > into[i]) into[i] = f; }
    }
  }
  return { x0, y0, x1, y1 };
}

/** A whole stroke's strength map, for replaying it. */
export function strokeCover(s: Stroke, width: number, height: number): { cov: Float32Array; box: { x0: number; y0: number; x1: number; y1: number } | null } {
  const cov = new Float32Array(width * height);
  let box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  const pts = s.points;
  for (let i = 0; i < pts.length; i++) {
    const b = stampSegment(cov, width, height, pts[Math.max(0, i - 1)], pts[i], s.size);
    if (b) box = box ? { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) } : b;
  }
  return { cov, box };
}

// ─── Floor colour ─────────────────────────────────────────────────────────

export interface Floor { r: number; g: number; b: number; /** Typical distance of floor pixels from it (noise, shading). */ spread: number }

/** Background, as far as the cutout's own mask is concerned. */
const BG_ALPHA = 24;

/**
 * The floor colour among some background pixels: the most common colour
 * (coarse histogram), refined to the mean of the pixels near it. Fringe
 * strands and shadows are background to the mask too, but they spread over
 * many colours, while the floor is one tight cluster, so the mode is the
 * floor even when strands cover a good part of the window.
 */
export function floorOf(samples: number[], minCount = 24): Floor | null {
  const n = samples.length / 3;
  if (n < minCount) return null;
  const hist = new Uint32Array(4096);
  for (let i = 0; i < n; i++) hist[((samples[i * 3] >> 4) << 8) | ((samples[i * 3 + 1] >> 4) << 4) | (samples[i * 3 + 2] >> 4)]++;
  let best = 0;
  for (let i = 1; i < 4096; i++) if (hist[i] > hist[best]) best = i;
  let r = ((best >> 8) << 4) + 8, g = (((best >> 4) & 15) << 4) + 8, b = ((best & 15) << 4) + 8;
  let spread = 0, count = 0;
  for (const lim of [28, 16]) {
    let sr = 0, sg = 0, sb = 0, c = 0;
    for (let i = 0; i < n; i++) {
      const dr = samples[i * 3] - r, dg = samples[i * 3 + 1] - g, db = samples[i * 3 + 2] - b;
      if (dr * dr + dg * dg + db * db <= lim * lim) { sr += samples[i * 3]; sg += samples[i * 3 + 1]; sb += samples[i * 3 + 2]; c++; }
    }
    if (!c) break;
    r = sr / c; g = sg / c; b = sb / c; count = c;
  }
  if (count < minCount / 2) return null;
  let sd = 0, c2 = 0;
  for (let i = 0; i < n; i++) {
    const d = colourDistance(samples[i * 3], samples[i * 3 + 1], samples[i * 3 + 2], r, g, b);
    if (d < 20) { sd += d; c2++; }
  }
  spread = c2 ? sd / c2 : 0;
  return { r, g, b, spread };
}

/**
 * Colour difference that weighs hue (chroma) above brightness: a pale cream
 * strand on a pale blue floor differs mostly in hue, while the floor itself
 * varies mostly in brightness (light falloff, soft shadow).
 */
export function colourDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const y1 = 0.299 * r1 + 0.587 * g1 + 0.114 * b1, y2 = 0.299 * r2 + 0.587 * g2 + 0.114 * b2;
  const dy = y1 - y2;
  const dcb = (b1 - y1) - (b2 - y2), dcr = (r1 - y1) - (r2 - y2);
  return Math.sqrt(0.5 * dy * dy + 2.2 * (dcb * dcb + dcr * dcr));
}

/** How far (colourDistance) a local floor may be from the frame border's floor and still count. */
export const FLOOR_AGREE = 30;

/** Tile size for the floor map, fraction of the long side. */
export const FLOOR_TILE = 0.04;

/**
 * The floor colour around any pixel: one estimate per tile (from background
 * pixels within two tiles of it), smoothly blended between tiles, with the
 * frame border as the fallback where a tile sees no floor (deep inside the
 * rug). Tiles are in fractions of the image, so the preview and the full
 * size agree. Estimates are made on first use and kept.
 */
export function floorMap(orig: Px, baseAlpha: Uint8Array | Uint8ClampedArray) {
  const { width: W, height: H, data } = orig;
  const long = Math.max(W, H);
  const T = Math.max(6, Math.round(long * FLOOR_TILE));
  const nx = Math.ceil(W / T), ny = Math.ceil(H / T);
  const stride = Math.max(1, Math.round(long / 600));
  const cache = new Map<number, Floor | null>();

  const collect = (x0: number, y0: number, x1: number, y1: number, out: number[], skipInside?: { x0: number; y0: number; x1: number; y1: number }) => {
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y += stride) {
      for (let x = Math.max(0, x0); x < Math.min(W, x1); x += stride) {
        if (skipInside && x >= skipInside.x0 && x < skipInside.x1 && y >= skipInside.y0 && y < skipInside.y1) continue;
        const i = y * W + x;
        if (baseAlpha[i] >= BG_ALPHA) continue;
        out.push(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
      }
    }
  };

  let border: Floor | null | undefined;
  const borderFloor = () => {
    if (border !== undefined) return border;
    const band = Math.max(2, Math.round(long * 0.02));
    const s: number[] = [];
    collect(0, 0, W, H, s, { x0: band, y0: band, x1: W - band, y1: H - band });
    border = floorOf(s);
    return border;
  };

  const tile = (tx: number, ty: number): Floor | null => {
    const key = ty * nx + tx;
    if (cache.has(key)) return cache.get(key)!;
    const s: number[] = [];
    collect((tx - 2) * T, (ty - 2) * T, (tx + 3) * T, (ty + 3) * T, s);
    const local = floorOf(s, 40), whole = borderFloor();
    // Inside a wide part of the rug the model lost (a pale end band), the
    // commonest "background" colour is the rug itself. A studio floor is one
    // hue across the frame, so a local estimate far from the border's is not
    // floor, and the border's is used instead.
    const f = local && (!whole || colourDistance(local.r, local.g, local.b, whole.r, whole.g, whole.b) <= FLOOR_AGREE)
      ? local : whole;
    cache.set(key, f);
    return f;
  };

  /** The floor at pixel (x, y), or null when the photo shows no floor at all. */
  return (x: number, y: number): Floor | null => {
    const fx = clamp((x + 0.5) / T - 0.5, 0, nx - 1), fy = clamp((y + 0.5) / T - 0.5, 0, ny - 1);
    const tx0 = Math.floor(fx), ty0 = Math.floor(fy);
    const tx1 = Math.min(nx - 1, tx0 + 1), ty1 = Math.min(ny - 1, ty0 + 1);
    const ax = fx - tx0, ay = fy - ty0;
    let r = 0, g = 0, b = 0, sp = 0, wsum = 0;
    const add = (f: Floor | null, w: number) => {
      if (!f || w <= 0) return;
      r += f.r * w; g += f.g * w; b += f.b * w; sp += f.spread * w; wsum += w;
    };
    add(tile(tx0, ty0), (1 - ax) * (1 - ay));
    add(tile(tx1, ty0), ax * (1 - ay));
    add(tile(tx0, ty1), (1 - ax) * ay);
    add(tile(tx1, ty1), ax * ay);
    if (!wsum) return null;
    return { r: r / wsum, g: g / wsum, b: b / wsum, spread: sp / wsum };
  };
}
export type FloorAt = ReturnType<typeof floorMap>;

/**
 * How much of a pixel to bring back (0..1) with Skip the floor on: none when
 * it is the floor colour (within the floor's own noise), all of it once it is
 * clearly something else, soft in between.
 */
export function smartAlpha(r: number, g: number, b: number, f: Floor): number {
  const d = colourDistance(r, g, b, f.r, f.g, f.b);
  const t0 = SMART_FROM + 1.5 * f.spread;
  const t1 = t0 + SMART_SPAN + f.spread;
  if (d <= t0) return 0;
  if (d >= t1) return 1;
  const t = (d - t0) / (t1 - t0);
  return t * t * (3 - 2 * t);
}
/** Distance (colourDistance units) under which a pixel counts as floor, before noise. */
export const SMART_FROM = 5;
/** Distance over which it fades in. */
export const SMART_SPAN = 12;

/**
 * The colour a part-transparent pixel should carry: the original pixel is a
 * mix of strand and floor, so take the floor back out (`c = a*fg + (1-a)*F`),
 * gently (never by more than doubling the difference), so a thin strand
 * does not carry a blue floor tint onto a white slide.
 */
export function unmix(o: number, floor: number, a: number): number {
  if (a >= 1) return o;
  return clamp(Math.round(floor + (o - floor) / Math.max(a, 0.5)), 0, 255);
}

// ─── Applying strokes ─────────────────────────────────────────────────────

export interface TouchSource {
  /** The original, drawn at the cutout's size, or null (Erase only). */
  orig: Px | null;
  /** The original lightly smoothed (`smoothRadius`), for judging floor vs strand without grain. */
  soft: Px | null;
  /** The cutout's own mask before any touch up: what counts as floor. */
  baseAlpha: Uint8Array;
  floor: FloorAt | null;
}

/** Everything Bring back needs about the original, at one size. */
export function touchSource(cut: Px, orig: Px | null): TouchSource {
  const baseAlpha = new Uint8Array(cut.width * cut.height);
  for (let i = 0; i < baseAlpha.length; i++) baseAlpha[i] = cut.data[i * 4 + 3];
  if (!orig) return { orig: null, soft: null, baseAlpha, floor: null };
  return { orig, soft: boxBlur(orig, smoothRadius(orig.width, orig.height)), baseAlpha, floor: floorMap(orig, baseAlpha) };
}

/**
 * Smoothing radius for judging floor vs strand, in pixels: one pixel per
 * 2400 of the long side (0 on a 1000px preview, 1 on a 2000px cutout), so the
 * preview and the full size smooth about the same share of the image.
 */
export const smoothRadius = (width: number, height: number) => Math.round(Math.max(width, height) / 2400);

/** Box blur of the colour channels, radius r (0 = a copy). */
export function boxBlur(src: Px, r: number): Px {
  const { width: W, height: H, data: s } = src;
  if (r <= 0) return { width: W, height: H, data: new Uint8ClampedArray(s) };
  const out = new Uint8ClampedArray(s.length);
  const tmp = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const l = Math.max(0, x - r), rr = Math.min(W - 1, x + r);
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let k = l; k <= rr; k++) sum += s[(y * W + k) * 4 + c];
      tmp[(y * W + x) * 3 + c] = sum / (rr - l + 1);
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = Math.max(0, y - r), b = Math.min(H - 1, y + r);
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let k = t; k <= b; k++) sum += tmp[(k * W + x) * 3 + c];
      out[(y * W + x) * 4 + c] = Math.round(sum / (b - t + 1));
    }
    out[(y * W + x) * 4 + 3] = s[(y * W + x) * 4 + 3];
  }
  return { width: W, height: H, data: out };
}

/**
 * Composite one stroke over the box, from `before` (the pixels as they were
 * when the stroke began) into `out`, with the stroke's strength map `cov`.
 * Doing it from `before` each time means a stroke painted bit by bit gives
 * exactly what replaying it whole gives.
 *
 * Bring back: alpha rises to the brush strength (times the smart alpha), and
 * the colour moves towards the original's in proportion to what was added.
 * Erase: alpha falls by the brush strength. Nothing else changes.
 */
export function compositeStroke(
  before: Uint8ClampedArray, out: Uint8ClampedArray, cov: Float32Array, width: number,
  box: { x0: number; y0: number; x1: number; y1: number }, s: Stroke, src: TouchSource
): void {
  const restore = s.mode === 'restore';
  if (restore && !src.orig) return;
  const o = src.orig?.data, soft = src.soft?.data;
  const smart = restore && s.smart && !!src.floor;
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const i = y * width + x, j = i * 4;
      const c = cov[i];
      if (c <= 0) continue;
      const a0 = before[j + 3];
      if (!restore) {
        out[j] = before[j]; out[j + 1] = before[j + 1]; out[j + 2] = before[j + 2];
        out[j + 3] = Math.round(a0 * (1 - c));
        continue;
      }
      let k = 1, fr = 0, fg = 0, fb = 0;
      if (smart && soft) {
        const f = src.floor!(x, y);
        if (f) {
          k = smartAlpha(soft[j], soft[j + 1], soft[j + 2], f);
          fr = f.r; fg = f.g; fb = f.b;
        } else {
          fr = -1;
        }
      }
      const target = Math.round(255 * c * k);
      if (target <= a0) {
        out[j] = before[j]; out[j + 1] = before[j + 1]; out[j + 2] = before[j + 2]; out[j + 3] = a0;
        continue;
      }
      let r = o![j], g = o![j + 1], b = o![j + 2];
      if (smart && fr >= 0 && k < 1) { r = unmix(r, fr, k); g = unmix(g, fg, k); b = unmix(b, fb, k); }
      const add = target - a0;
      out[j] = Math.round((before[j] * a0 + r * add) / target);
      out[j + 1] = Math.round((before[j + 1] * a0 + g * add) / target);
      out[j + 2] = Math.round((before[j + 2] * a0 + b * add) / target);
      out[j + 3] = target;
    }
  }
}

/** The cutout with every stroke applied in order, as a new buffer. */
export function renderStrokes(cut: Px, src: TouchSource, strokes: Stroke[]): Px {
  const { width: W, height: H } = cut;
  const out = new Uint8ClampedArray(cut.data);
  const before = new Uint8ClampedArray(out.length);
  const cov = new Float32Array(W * H);
  for (const s of strokes) {
    let box: { x0: number; y0: number; x1: number; y1: number } | null = null;
    for (let i = 0; i < s.points.length; i++) {
      const b = stampSegment(cov, W, H, s.points[Math.max(0, i - 1)], s.points[i], s.size);
      if (b) box = box ? { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) } : b;
    }
    if (!box) continue;
    // only the stroke's box is copied and cleared, so a small stroke on a big photo is cheap
    for (let y = box.y0; y <= box.y1; y++) {
      const a = (y * W + box.x0) * 4, z = (y * W + box.x1 + 1) * 4;
      before.set(out.subarray(a, z), a);
    }
    compositeStroke(before, out, cov, W, box, s, src);
    for (let y = box.y0; y <= box.y1; y++) cov.fill(0, y * W + box.x0, y * W + box.x1 + 1);
  }
  return { width: W, height: H, data: out };
}

// ─── Undo ─────────────────────────────────────────────────────────────────

export interface History { done: Stroke[]; undone: Stroke[] }
export const EMPTY_HISTORY: History = { done: [], undone: [] };

/** A finished stroke; it clears the redo list, as in any editor. */
export const pushStroke = (h: History, s: Stroke): History => (s.points.length ? { done: [...h.done, s], undone: [] } : h);
export const undoStroke = (h: History): History =>
  h.done.length ? { done: h.done.slice(0, -1), undone: [h.done[h.done.length - 1], ...h.undone] } : h;
export const redoStroke = (h: History): History =>
  h.undone.length ? { done: [...h.done, h.undone[0]], undone: h.undone.slice(1) } : h;
