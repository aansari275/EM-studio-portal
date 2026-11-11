/**
 * Where each photo lands on the one-rug-per-slide deck, in inches on the
 * 13.333 x 7.5in widescreen slide. Shared by the deck (pptGenerator.ts) and
 * the slot diagram in the design preview (SlidePreview.tsx), so the picture
 * the studio sees is the slide the buyer gets.
 *
 * The boxes are the house slide from "New Collection offer for Zara.pptx",
 * scaled to this canvas. Do not "improve" their sizes or positions.
 */
export type Box = { x: number; y: number; w: number; h: number };

export const SLIDE_W = 13.333;
export const SLIDE_H = 7.5;

const LEFT_TALL: Box = { x: 0.121, y: 0.273, w: 5.086, h: 7.118 };
const TOP_WIDE: Box = { x: 5.149, y: 0.446, w: 4.861, h: 3.255 };
const BOTTOM_MIDDLE: Box = { x: 5.134, y: 3.921, w: 2.346, h: 3.396 };
const BOTTOM_RIGHT: Box = { x: 8.362, y: 4.016, w: 4.766, h: 3.039 };

/**
 * Photo 1, 2, 3, 4 in that order. To move a number to another slot, reorder
 * this list; nothing else needs to change. Numbering per Abdul's reference
 * slide (5 Nov 2026): 1 left, 2 bottom middle, 3 top, 4 bottom right.
 */
export const PHOTO_SLOTS: Box[] = [LEFT_TALL, BOTTOM_MIDDLE, TOP_WIDE, BOTTOM_RIGHT];

/** What to shoot for each number, shown under the slot diagram. */
export const SLOT_HINTS = ['Full rug', 'Flat detail', 'Angled close-up', 'Corner or edge'];

/** The spec text block and the corner logo, drawn as placeholders. */
export const SPEC_BOX: Box = { x: 10.593, y: 1.223, w: 2.74, h: 1.533 };
export const LOGO_BOX: Box = { x: 11.449, y: 0.25, w: 1.674, h: 0.8 };

// ---------------------------------------------------------------------------
// Per-record slide layout (11 Nov 2026)
//
// The studio can move and resize the four photo boxes for one design or one
// colourway. It is stored on that record only, as `slideLayout`, never on the
// house template above. Positions and sizes are fractions of the slide
// (x and w of SLIDE_W, y and h of SLIDE_H), so they do not depend on the
// slide's inch size or on the preview's pixel size.
//
// A record with no `slideLayout` uses PHOTO_SLOTS exactly, so its deck is the
// same as before this feature existed.
// ---------------------------------------------------------------------------

/** One box as fractions of the slide. */
export type FracBox = { x: number; y: number; w: number; h: number };

export interface SlideLayout {
  v: 1;
  /** Photo 1..4, same order as PHOTO_SLOTS. */
  slots: FracBox[];
  updatedAt?: string;
  updatedBy?: string;
}

/**
 * The spec text and the corner logo, which photos must not cover. One
 * rectangle from the top of the slide to the bottom of the spec block, out to
 * the right edge. The house layout already keeps clear of it.
 */
export const RESERVED: Box = {
  x: SPEC_BOX.x,
  y: 0,
  w: SLIDE_W - SPEC_BOX.x,
  h: SPEC_BOX.y + SPEC_BOX.h,
};

/** Smallest box, in inches, so a box can never collapse to nothing. */
export const MIN_SIDE = 0.6;

const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

export const toFrac = (b: Box): FracBox => ({
  x: r5(b.x / SLIDE_W), y: r5(b.y / SLIDE_H), w: r5(b.w / SLIDE_W), h: r5(b.h / SLIDE_H),
});
export const fromFrac = (f: FracBox): Box => ({
  x: f.x * SLIDE_W, y: f.y * SLIDE_H, w: f.w * SLIDE_W, h: f.h * SLIDE_H,
});

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Read a stored layout, or undefined if it is missing or malformed. */
export function parseSlideLayout(input: unknown): SlideLayout | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const raw = input as { slots?: unknown; updatedAt?: unknown; updatedBy?: unknown };
  if (!Array.isArray(raw.slots)) return undefined;
  if (raw.slots.length !== PHOTO_SLOTS.length) return undefined;
  const slots: FracBox[] = [];
  for (const item of raw.slots as unknown[]) {
    const s = (item || {}) as Record<string, unknown>;
    if (![s.x, s.y, s.w, s.h].every(isNum)) return undefined;
    const { x, y, w, h } = s as FracBox;
    if (w <= 0 || h <= 0 || x < -0.001 || y < -0.001 || x + w > 1.001 || y + h > 1.001) return undefined;
    slots.push({ x, y, w, h });
  }
  return {
    v: 1,
    slots,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    updatedBy: typeof raw.updatedBy === 'string' ? raw.updatedBy : undefined,
  };
}

/**
 * The four photo boxes for one record, in inches. This is the one function
 * the deck and the preview both use. No layout: the house boxes, untouched.
 */
export function photoSlotsFor(layout?: SlideLayout | null): Box[] {
  if (!layout) return PHOTO_SLOTS;
  return layout.slots.map(fromFrac);
}

/** True when a set of boxes is the house layout (to the rounding stored). */
export function isDefaultSlots(boxes: Box[]): boolean {
  return boxes.every((b, i) => {
    const a = toFrac(b);
    const d = toFrac(PHOTO_SLOTS[i]);
    return Math.abs(a.x - d.x) < 2e-4 && Math.abs(a.y - d.y) < 2e-4 && Math.abs(a.w - d.w) < 2e-4 && Math.abs(a.h - d.h) < 2e-4;
  });
}

/**
 * Where a photo of imgW x imgH pixels sits inside its box: scaled to fit
 * whole (contain), never stretched, centred, or seated on the bottom edge.
 * The deck places every photo with this, and the preview draws with it.
 */
export function fitContain(box: Box, imgW: number, imgH: number, valign: 'middle' | 'bottom' = 'middle'): Box {
  const s = Math.min(box.w / imgW, box.h / imgH);
  const w = imgW * s;
  const h = imgH * s;
  const y = valign === 'bottom' ? box.y + box.h - h : box.y + (box.h - h) / 2;
  return { x: box.x + (box.w - w) / 2, y, w, h };
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;

const inSlide = (b: Box) =>
  b.x >= -1e-6 && b.y >= -1e-6 && b.x + b.w <= SLIDE_W + 1e-6 && b.y + b.h <= SLIDE_H + 1e-6
  && b.w >= MIN_SIDE - 1e-6 && b.h >= MIN_SIDE - 1e-6;

/** A box is allowed when it is on the slide, not tiny, and clear of the logo and spec text. */
export const isValidBox = (b: Box) => inSlide(b) && !overlaps(b, RESERVED);

/** Which corner is being dragged: -1 is left/top, +1 is right/bottom. */
export type Corner = { sx: -1 | 1; sy: -1 | 1 };

/**
 * Keep a box the user is dragging legal. `mode` is 'move' or the corner being
 * resized. Returns the nearest allowed box, or `prev` when none is close.
 */
export function constrainBox(next: Box, prev: Box, mode: 'move' | Corner): Box {
  let b = { ...next };
  if (mode === 'move') {
    b.w = prev.w; b.h = prev.h;
    b.x = Math.min(Math.max(b.x, 0), SLIDE_W - b.w);
    b.y = Math.min(Math.max(b.y, 0), SLIDE_H - b.h);
    if (isValidBox(b)) return b;
    // Pushed against the reserved corner: slide out left or down, whichever is nearer.
    const left = { ...b, x: RESERVED.x - b.w };
    const down = { ...b, y: RESERVED.y + RESERVED.h };
    const options = [left, down].filter(isValidBox)
      .sort((p, q) => (Math.abs(p.x - b.x) + Math.abs(p.y - b.y)) - (Math.abs(q.x - b.x) + Math.abs(q.y - b.y)));
    return options[0] || prev;
  }
  // Resize: the opposite corner stays where it was.
  const { sx, sy } = mode;
  const ax = sx === 1 ? prev.x : prev.x + prev.w; // anchor x
  const ay = sy === 1 ? prev.y : prev.y + prev.h; // anchor y
  let ex = sx === 1 ? next.x + next.w : next.x;   // moving edge x
  let ey = sy === 1 ? next.y + next.h : next.y;   // moving edge y
  ex = sx === 1 ? Math.min(Math.max(ex, ax + MIN_SIDE), SLIDE_W) : Math.max(Math.min(ex, ax - MIN_SIDE), 0);
  ey = sy === 1 ? Math.min(Math.max(ey, ay + MIN_SIDE), SLIDE_H) : Math.max(Math.min(ey, ay - MIN_SIDE), 0);
  const make = (x1: number, y1: number): Box => ({
    x: Math.min(ax, x1), y: Math.min(ay, y1), w: Math.abs(x1 - ax), h: Math.abs(y1 - ay),
  });
  b = make(ex, ey);
  if (isValidBox(b)) return b;
  // Growing into the reserved corner: stop at its left edge or its bottom edge.
  const options: Box[] = [];
  if (sx === 1) options.push(make(Math.min(ex, RESERVED.x), ey));
  if (sy === -1) options.push(make(ex, Math.max(ey, RESERVED.y + RESERVED.h)));
  const valid = options.filter(isValidBox).sort((p, q) => q.w * q.h - p.w * p.h);
  return valid[0] || prev;
}
