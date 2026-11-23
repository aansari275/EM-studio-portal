/**
 * A rug is one solid object: no see-through patches inside it.
 *
 * U^2-Net small sometimes reads a pale band inside the rug as floor (EM-26-MA-10456:
 * a white and grey striped band near the top came out see-through). The fix works
 * on the mask, before and after the guided filter, pure maths on typed arrays.
 *
 * 1. Outside = every pixel reachable from the frame border through mask < WALL.
 *    Anything else is the rug (or another object standing on the floor).
 * 2. Holes: pixels of the rug with mask < WALL are not reachable from the border,
 *    so they are enclosed by the rug. They become fully opaque.
 * 3. Deep inside: rug pixels at least `depth` px from the outside become fully
 *    opaque too, so a weak (part see-through) patch inside is filled; the soft
 *    rim near the outline is left for the guided filter.
 * 4. Bays (conservative): a soft dent connected to the outside only through a
 *    thin channel. Found by closing every channel narrower than 2 x `channel`
 *    px (an opening of the outside from the border) and looking at what is cut
 *    off. A cut-off pocket is filled only when ALL of these hold:
 *      - it does not touch the frame border;
 *      - the model was unsure there, not sure it was floor: mean mask at least
 *        BAY_MIN_MEAN (a real gap, the floor between two rugs or between
 *        tassels, scores near 0);
 *      - at least BAY_IN_HULL of it lies inside the convex outline of the rug;
 *      - it is at least channel x channel px (no slivers).
 *    A genuine concave shape (an L-shaped rug, a folded corner) has a wide mouth
 *    and floor the model is sure about, so it fails twice over.
 */

/** Below this the mask counts as see-through (walls are at or above it). */
export const WALL = 128;
/** Rug pixels this far (px at 2000px) from the outside are forced opaque. */
export const DEPTH_2000 = 12;
/** Channels narrower than twice this (px at 2000px) are closed when looking for bays. */
export const CHANNEL_2000 = 20;
/** A bay is filled only if the model's mean mask there is at least this (0..255). */
export const BAY_MIN_MEAN = 48;
/** Share of a bay that must lie inside the rug's convex outline. */
export const BAY_IN_HULL = 0.95;

const scaled = (v: number, w: number, h: number) => Math.max(1, Math.round((v * Math.max(w, h)) / 2000));

export interface FillResult {
  /** The mask with the inside filled (a new array). */
  mask: Uint8Array;
  /** Rug pixels (not outside) after the fill. */
  inside: number;
  /** Pixels that were see-through (< WALL) inside the rug and are now opaque. */
  holes: number;
  /** Pixels deep inside that were weak (WALL..WEAK) and are now opaque. */
  weak: number;
  /** Pockets filled by the bay rule. */
  bays: number;
}

/** Below this a deep inside pixel counts as weak (part see-through). */
export const WEAK = 200;

const BIG = 1 << 30;

/**
 * Chamfer (3-4) distance to the nearest source pixel, in px (approx. Euclidean,
 * within about 8%). `src[i]` true = distance 0.
 */
export function chamferDistance(src: Uint8Array, w: number, h: number): Float32Array {
  const d = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = src[i] ? 0 : BIG;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = d[i];
      if (v === 0) continue;
      if (x > 0 && d[i - 1] + 3 < v) v = d[i - 1] + 3;
      if (y > 0) {
        const u = i - w;
        if (d[u] + 3 < v) v = d[u] + 3;
        if (x > 0 && d[u - 1] + 4 < v) v = d[u - 1] + 4;
        if (x < w - 1 && d[u + 1] + 4 < v) v = d[u + 1] + 4;
      }
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = d[i];
      if (v === 0) continue;
      if (x < w - 1 && d[i + 1] + 3 < v) v = d[i + 1] + 3;
      if (y < h - 1) {
        const u = i + w;
        if (d[u] + 3 < v) v = d[u] + 3;
        if (x < w - 1 && d[u + 1] + 4 < v) v = d[u + 1] + 4;
        if (x > 0 && d[u - 1] + 4 < v) v = d[u - 1] + 4;
      }
      d[i] = v;
    }
  }
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = d[i] >= BIG ? Infinity : d[i] / 3;
  return out;
}

/**
 * Flood fill (4-connected) from the seeds through pixels where `pass[i]` is
 * true. Seeds that do not pass are ignored. Returns 1 for every pixel reached.
 */
function flood(pass: Uint8Array, seeds: Iterable<number>, w: number, h: number): Uint8Array {
  const seen = new Uint8Array(w * h);
  const q = new Int32Array(w * h);
  let head = 0, tail = 0;
  for (const s of seeds) if (pass[s] && !seen[s]) { seen[s] = 1; q[tail++] = s; }
  while (head < tail) {
    const i = q[head++];
    const x = i % w;
    if (x > 0 && pass[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; q[tail++] = i - 1; }
    if (x < w - 1 && pass[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; q[tail++] = i + 1; }
    if (i >= w && pass[i - w] && !seen[i - w]) { seen[i - w] = 1; q[tail++] = i - w; }
    if (i < w * (h - 1) && pass[i + w] && !seen[i + w]) { seen[i + w] = 1; q[tail++] = i + w; }
  }
  return seen;
}

function* border(w: number, h: number): Generator<number> {
  for (let x = 0; x < w; x++) { yield x; yield (h - 1) * w + x; }
  for (let y = 1; y < h - 1; y++) { yield y * w; yield y * w + w - 1; }
}

/**
 * For every row, the x range [lo, hi] of the convex outline of the pixels where
 * `solid` is true (lo > hi = row outside it). Monotone chain over each row's
 * end points.
 */
export function hullRows(solid: Uint8Array, w: number, h: number): { lo: Float32Array; hi: Float32Array } {
  const pts: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    let a = -1, b = -1;
    for (let x = 0; x < w; x++) if (solid[y * w + x]) { if (a < 0) a = x; b = x; }
    if (a >= 0) { pts.push([a, y]); if (b !== a) pts.push([b, y]); }
  }
  const lo = new Float32Array(h).fill(Infinity), hi = new Float32Array(h).fill(-Infinity);
  if (!pts.length) return { lo, hi };
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [], upper: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  for (let k = pts.length - 1; k >= 0; k--) {
    const p = pts[k];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  if (hull.length === 1) hull.push(hull[0]);
  for (let k = 0; k < hull.length; k++) {
    const [x1, y1] = hull[k], [x2, y2] = hull[(k + 1) % hull.length];
    const ya = Math.max(0, Math.ceil(Math.min(y1, y2))), yb = Math.min(h - 1, Math.floor(Math.max(y1, y2)));
    for (let y = ya; y <= yb; y++) {
      const x = y1 === y2 ? Math.min(x1, x2) : x1 + ((x2 - x1) * (y - y1)) / (y2 - y1);
      const xe = y1 === y2 ? Math.max(x1, x2) : x;
      if (x < lo[y]) lo[y] = x;
      if (xe > hi[y]) hi[y] = xe;
    }
  }
  return { lo, hi };
}

/** Pockets of `outside` cut off once channels narrower than 2r are closed (1 = pocket). */
function pocketsOf(outside: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const notOut = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) notOut[i] = outside[i] ? 0 : 1;
  const toRug = chamferDistance(notOut, w, h);
  const core = new Uint8Array(w * h);
  // the frame border is open floor, not a wall: only the rug narrows a channel
  for (let i = 0; i < w * h; i++) core[i] = outside[i] && toRug[i] > r ? 1 : 0;
  const reached = flood(core, border(w, h), w, h);
  const near = chamferDistance(reached, w, h);
  const pockets = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) pockets[i] = outside[i] && near[i] > r + 1 ? 1 : 0;
  return pockets;
}

export interface FillOptions {
  /** Look for bays as well as enclosed holes. */
  bays?: boolean;
  depth?: number;
  channel?: number;
}

/**
 * Fills the inside of the rug in `mask` (w x h, 0..255). See the file comment
 * for the rules. Pixels outside the rug are never changed.
 */
export function fillInterior(mask: Uint8Array | Uint8ClampedArray, w: number, h: number, opts: FillOptions = {}): FillResult {
  const n = w * h;
  const depthPx = opts.depth ?? scaled(DEPTH_2000, w, h);
  const r = opts.channel ?? scaled(CHANNEL_2000, w, h);
  const low = new Uint8Array(n);
  for (let i = 0; i < n; i++) low[i] = mask[i] < WALL ? 1 : 0;
  const outside = flood(low, border(w, h), w, h);

  let bays = 0;
  if (opts.bays) {
    const pockets = pocketsOf(outside, w, h, r);
    const solid = new Uint8Array(n);
    for (let i = 0; i < n; i++) solid[i] = mask[i] >= WALL ? 1 : 0;
    const { lo, hi } = hullRows(solid, w, h);
    const label = new Int32Array(n).fill(-1);
    const q = new Int32Array(n);
    for (let s = 0; s < n; s++) {
      if (!pockets[s] || label[s] >= 0) continue;
      // one pocket, 8-connected
      let head = 0, tail = 0, area = 0, sum = 0, inHull = 0, edge = false;
      label[s] = s; q[tail++] = s;
      while (head < tail) {
        const i = q[head++];
        const x = i % w, y = (i - x) / w;
        area++; sum += mask[i];
        if (x >= lo[y] && x <= hi[y]) inHull++;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if ((dx || dy) && xx >= 0 && yy >= 0 && xx < w && yy < h) {
            const j = yy * w + xx;
            if (pockets[j] && label[j] < 0) { label[j] = s; q[tail++] = j; }
          }
        }
      }
      const ok = !edge && area >= r * r && sum / area >= BAY_MIN_MEAN && inHull >= BAY_IN_HULL * area;
      if (ok) {
        bays++;
        for (let k = 0; k < tail; k++) outside[q[k]] = 0;
      }
    }
  }

  const depth = chamferDistance(outside, w, h);
  const out = new Uint8Array(n);
  let inside = 0, holes = 0, weak = 0;
  for (let i = 0; i < n; i++) {
    const m = mask[i];
    if (outside[i]) { out[i] = m; continue; }
    inside++;
    if (m < WALL) { holes++; out[i] = 255; }
    else if (depth[i] >= depthPx) { if (m < WEAK) weak++; out[i] = 255; }
    else out[i] = m;
  }
  return { mask: out, inside, holes, weak, bays };
}
