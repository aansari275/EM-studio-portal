/**
 * Where things go on the tearsheet, in millimetres on an A4 portrait page.
 * Pure maths, no PDF library, so it is unit tested (tearsheetLayout.test.ts).
 *
 * Two shapes of page:
 * - wide: a landscape hero (a 16:9 room setting, or a rug shot sideways)
 *   runs the full width, with the title and spec under it on the left and
 *   the other photos on the right.
 * - tall: a portrait or square hero sits on the left, the title and spec
 *   beside it, and the other photos go wherever they come out biggest
 *   (a row under everything, or a column under the spec).
 * Every photo is contained, never cropped: a rug is shown whole.
 */

export type Size = { w: number; h: number };
export type Box = { x: number; y: number; w: number; h: number };

export const PAGE: Size = { w: 210, h: 297 };
export const MARGIN = 16;
export const CONTENT_W = PAGE.w - 2 * MARGIN;
/** The logo: em-logo-new.png is 2498 x 963. */
export const LOGO_AR = 2498 / 963;
export const LOGO: Box = { x: (PAGE.w - 46) / 2, y: 11.5, w: 46, h: 46 / LOGO_AR };
/** Hairline under the logo. */
export const HEADER_RULE_Y = 34;
/** Photos and text start here and end at BOTTOM; the footer sits under it. */
export const TOP = 42;
export const FOOTER_RULE_Y = 272;
export const BOTTOM = FOOTER_RULE_Y - 10;
export const GAP = 10;
export const PHOTO_GAP = 5;
/** A secondary photo smaller than this on its short side is left off. */
export const MIN_PHOTO = 28;
/** Hero at least this much wider than tall counts as landscape. */
export const WIDE_AT = 1.2;

const WIDE_HERO_MAX_H = 125;
const WIDE_TEXT_W = 74;
const TALL_HERO_W = 104;
const TALL_HERO_MAX_H = 150;

export interface TearsheetPlan {
  mode: 'wide' | 'tall' | 'none';
  hero: Box | null;
  /** Kicker, title and spec go in here, from the top. */
  text: Box;
  /** One box per photo kept, in the order given. May be shorter than the input. */
  photos: Box[];
}

const area = (bs: Box[]) => bs.reduce((s, b) => s + b.w * b.h, 0);
const valid = (s: Size) => s.w > 0 && s.h > 0;

/** The largest box of the photo's shape inside the region. */
export function fitInside(region: Box, s: Size, alignX: 'start' | 'center' | 'end' = 'start'): Box {
  const scale = Math.min(region.w / s.w, region.h / s.h);
  const w = s.w * scale;
  const h = s.h * scale;
  const x = alignX === 'start' ? region.x : alignX === 'end' ? region.x + region.w - w : region.x + (region.w - w) / 2;
  return { x, y: region.y, w, h };
}

/**
 * Photos side by side at one height (row) or stacked at one width (column),
 * as large as the region allows. Returns [] if any would be under MIN_PHOTO.
 */
export function arrange(region: Box, sizes: Size[], dir: 'row' | 'column', alignX: 'start' | 'end' = 'start'): Box[] {
  const n = sizes.length;
  if (!n || region.w <= 0 || region.h <= 0) return [];
  const gaps = PHOTO_GAP * (n - 1);
  let boxes: Box[];
  if (dir === 'row') {
    const ratios = sizes.reduce((s, z) => s + z.w / z.h, 0);
    const h = Math.min(region.h, (region.w - gaps) / ratios);
    const total = h * ratios + gaps;
    let x = alignX === 'end' ? region.x + region.w - total : region.x;
    boxes = sizes.map((z) => {
      const b = { x, y: region.y, w: h * (z.w / z.h), h };
      x += b.w + PHOTO_GAP;
      return b;
    });
  } else {
    const inv = sizes.reduce((s, z) => s + z.h / z.w, 0);
    const w = Math.min(region.w, (region.h - gaps) / inv);
    const x = alignX === 'end' ? region.x + region.w - w : region.x;
    let y = region.y;
    boxes = sizes.map((z) => {
      const b = { x, y, w, h: w * (z.h / z.w) };
      y += b.h + PHOTO_GAP;
      return b;
    });
  }
  return boxes.every((b) => Math.min(b.w, b.h) >= MIN_PHOTO - 1e-9) ? boxes : [];
}

/**
 * Shrink an arrangement, as a whole, from its anchor corner (top left, or top
 * right when aligned to the end) until no photo is over maxArea.
 */
function capArea(boxes: Box[], region: Box, alignX: 'start' | 'end', maxArea: number): Box[] {
  const biggest = Math.max(...boxes.map((b) => b.w * b.h));
  const s = Math.min(1, Math.sqrt(maxArea / biggest));
  if (s >= 1) return boxes;
  const ax = alignX === 'end' ? region.x + region.w : region.x;
  const out = boxes.map((b) => ({ x: ax + (b.x - ax) * s, y: region.y + (b.y - region.y) * s, w: b.w * s, h: b.h * s }));
  return out.every((b) => Math.min(b.w, b.h) >= MIN_PHOTO - 1e-9) ? out : [];
}

/**
 * The biggest arrangement over the candidate regions, dropping photos from the
 * end until one fits. No photo may come out bigger than maxArea, so the hero
 * always reads as the main picture.
 */
function bestPhotos(regions: { box: Box; alignX: 'start' | 'end' }[], sizes: Size[], maxArea = Infinity): Box[] {
  for (let n = sizes.length; n > 0; n--) {
    const take = sizes.slice(0, n);
    let best: Box[] = [];
    for (const r of regions) {
      for (const dir of ['row', 'column'] as const) {
        const raw = arrange(r.box, take, dir, r.alignX);
        const b = raw.length ? capArea(raw, r.box, r.alignX, maxArea) : raw;
        if (b.length && area(b) > area(best)) best = b;
      }
    }
    if (best.length) return best;
  }
  return [];
}

const heroCap = (hero: Box) => (hero.w * hero.h) / HERO_DOMINANCE;

/**
 * @param hero    pixel size of the hero photo, or null when none loaded
 * @param photos  pixel sizes of up to two more photos, in order
 * @param textH   height the kicker, title and spec need, in mm (measured by the caller)
 */
export function planTearsheet(hero: Size | null, photos: Size[], textH: number): TearsheetPlan {
  const extra = photos.filter(valid).slice(0, 2);
  if (!hero || !valid(hero)) {
    const text = { x: MARGIN, y: TOP + 8, w: CONTENT_W * 0.6, h: BOTTOM - TOP - 8 };
    const below = text.y + textH + GAP;
    const photosOut = bestPhotos([{ box: { x: MARGIN, y: below, w: CONTENT_W, h: BOTTOM - below }, alignX: 'start' }], extra);
    return { mode: 'none', hero: null, text, photos: photosOut };
  }

  if (hero.w / hero.h >= WIDE_AT) {
    const maxH = Math.max(60, Math.min(WIDE_HERO_MAX_H, BOTTOM - TOP - GAP - textH));
    const heroBox = fitInside({ x: MARGIN, y: TOP, w: CONTENT_W, h: maxH }, hero, 'center');
    const y = heroBox.y + heroBox.h + GAP;
    const text = { x: MARGIN, y, w: WIDE_TEXT_W, h: BOTTOM - y };
    const right = { x: MARGIN + WIDE_TEXT_W + GAP, y, w: CONTENT_W - WIDE_TEXT_W - GAP, h: BOTTOM - y };
    return { mode: 'wide', hero: heroBox, text, photos: bestPhotos([{ box: right, alignX: 'end' }], extra, heroCap(heroBox)) };
  }

  // A shorter hero can leave room for a much bigger row of photos under it.
  // Take the height that puts the most photo on the page (the hero stays the
  // biggest picture by a clear margin, see heroCap); ties keep the taller hero.
  let best: TearsheetPlan | null = null;
  let bestScore = -1;
  for (const maxH of TALL_HERO_HEIGHTS) {
    const plan = tallPlan(hero, extra, textH, maxH);
    const score = plan.hero!.w * plan.hero!.h + area(plan.photos);
    if (score > bestScore + 1e-6) {
      best = plan;
      bestScore = score;
    }
  }
  return best!;
}

/** Hero heights tried on a tall page, tallest first. */
export const TALL_HERO_HEIGHTS = [TALL_HERO_MAX_H, 140, 130, 120];
/** The hero must be at least this many times the area of any other photo. */
export const HERO_DOMINANCE = 1.5;

function tallPlan(hero: Size, extra: Size[], textH: number, maxH: number): TearsheetPlan {
  const heroBox = fitInside({ x: MARGIN, y: TOP, w: TALL_HERO_W, h: maxH }, hero);
  const textX = heroBox.x + heroBox.w + GAP;
  const text = { x: textX, y: TOP, w: MARGIN + CONTENT_W - textX, h: BOTTOM - TOP };
  const heroBottom = heroBox.y + heroBox.h;
  const rowY = Math.max(heroBottom, TOP + textH) + GAP;
  const colY = TOP + textH + GAP;
  const regions = [
    { box: { x: MARGIN, y: rowY, w: CONTENT_W, h: BOTTOM - rowY }, alignX: 'start' as const },
    { box: { x: textX, y: colY, w: text.w, h: BOTTOM - colY }, alignX: 'start' as const },
  ];
  return { mode: 'tall', hero: heroBox, text, photos: bestPhotos(regions, extra, heroCap(heroBox)) };
}

/** Pixels to ask the image CDN for, so the PDF stays around 1 to 3 MB. */
export const PDF_PPI = 300;
export const PDF_JPEG_Q = 84;

/**
 * The biggest box a hero or a secondary photo can be given on the page,
 * in inches, for fetching before the layout is known.
 */
export const HERO_FETCH_IN = { w: CONTENT_W / 25.4, h: TALL_HERO_MAX_H / 25.4 };
export const PHOTO_FETCH_IN = { w: 90 / 25.4, h: 110 / 25.4 };

/** File name: Eastern_Mills_<style>_tearsheet.pdf, safe on every system. */
export function tearsheetFileName(style: string): string {
  const s = (style || 'rug').trim().replace(/[^A-Za-z0-9-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return `Eastern_Mills_${s || 'rug'}_tearsheet.pdf`;
}

export type SpecRow = { label: string; value: string };

type SpecSource = {
  styleNumber?: string; baseStyleNumber?: string; color?: string; construction?: string;
  materials?: string; size?: string; gsm?: string;
};

/**
 * The spec block, in the Library preview's order. Only what the record holds:
 * an empty field is left out, nothing is guessed, and there is no field here
 * for price, costing or margin, so none can reach the page.
 */
export function tearsheetSpec(p: SpecSource): SpecRow[] {
  const t = (v?: unknown) => (typeof v === 'string' ? v.trim() : '');
  const style = t(p.styleNumber) || t(p.baseStyleNumber);
  const design = t(p.baseStyleNumber);
  const rows: SpecRow[] = [];
  if (design && design !== style) rows.push({ label: 'Design', value: design });
  const add = (label: string, v?: unknown) => { if (t(v)) rows.push({ label, value: t(v) }); };
  add('Colour', p.color);
  add('Construction', p.construction);
  add('Material', p.materials);
  add('Size', p.size);
  add('GSM', p.gsm);
  return rows;
}

/** Standard PDF fonts only cover Latin 1: fold accents, turn long dashes into spaces, drop the rest. */
export function pdfText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[–—−]/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
