/**
 * Room setting: the seven approved room types, the rug size rules and the
 * prompt. Pure, shared by the browser (labels, size guard) and the Netlify
 * function `room-setting.mts` (prompt). The room types and the prompt come
 * from the test run in ~/dev/room-picker/test (styles.json, prompt.txt),
 * which the owner approved on 27 Nov 2026. The example pictures in
 * public/room-types/ are for the studio only; they are never sent to the
 * model (a reference room makes the model copy that room).
 */

export interface RoomStyle {
  id: string;
  name: string;
  /** One line for the picker. */
  line: string;
  light: string;
  palette: string;
  furniture: string;
  camera: string;
}

export const ROOM_STYLES: RoomStyle[] = [
  {
    id: 'scandi-living',
    name: 'Scandinavian living room',
    line: 'Bright daylight, pale wood floor, one colour accent. Rugs 5x8 and up.',
    light: 'Bright, even north light from tall sash windows, morning to midday, soft shadows.',
    palette: 'Warm white or greige walls, pale pine or oak plank floor, one confident colour accent in upholstery (cobalt, cognac, sage, burgundy).',
    furniture: 'A designer sofa facing camera or along one side, a low wood coffee table on the rug, one sculptural lounge chair, framed prints or a gallery wall, a single plant. Period details allowed: tiled stove, panelling, sash windows.',
    camera: 'Standing eye height, about 1.5 m, centred or slightly angled down the room, rug in the foreground and centre.',
  },
  {
    id: 'gallery-living',
    name: 'Calm gallery living room',
    line: 'Soft neutral, sheer curtains, very sparse. Large rugs, quiet or bold.',
    light: 'Diffused daylight through sheer linen curtains, very soft, almost shadowless.',
    palette: 'Warm white, oatmeal, bone, with one dark accent (black chair, dark wood table, black fireplace).',
    furniture: 'A low boucle or curved sofa, one sculptural coffee table, a floor lamp, one abstract artwork, built in oak shelving with a few ceramics. Very sparse.',
    camera: 'Seated to standing height, straight on or slight angle, wide enough to read the room.',
  },
  {
    id: 'golden-lounge',
    name: 'Mid century lounge, golden hour',
    line: 'Low warm sun, leather and walnut, a view. Warm toned rugs.',
    light: 'Low warm sun raking across the floor from floor to ceiling windows, long soft shadows, hills or landscape outside.',
    palette: 'Cream boucle, cognac and chocolate leather, walnut, travertine, terrazzo, smoked glass.',
    furniture: 'Modular cream sofa or a sunken conversation area, Togo style chair, low walnut or glass coffee table, arc or mushroom lamp.',
    camera: 'Standing height, slightly elevated, angled down the length of the room toward the windows.',
  },
  {
    id: 'reading-corner',
    name: 'Reading corner by a window',
    line: 'One chair, soft daylight, a lamp. Small and medium rugs.',
    light: 'Soft overcast daylight from one big window, plus a small warm table lamp glowing.',
    palette: 'Pale grey or warm white walls, light floor, natural wood and cream textiles.',
    furniture: 'One lounge chair (wood frame or Togo style) with a throw on the chair, a small side table, a stack of books on the side table, nothing else.',
    camera: 'Seated eye height, close to the scene, rug large in frame.',
  },
  {
    id: 'dining',
    name: 'Dining room, natural light',
    line: 'Table and chairs on the rug, warm plaster. Rugs 8x10 and up.',
    light: 'Daylight from a large window or garden doors at the side, soft and warm.',
    palette: 'Warm plaster walls, oak or limestone floor, walnut or stone table, linen.',
    furniture: 'Dining table with four to six simple wood chairs, a paper or metal pendant over the table, a sideboard with one ceramic and one artwork.',
    camera: 'Standing height, slightly elevated, angled from a corner so the rug outline reads under the table.',
  },
  {
    id: 'warm-bedroom',
    name: 'Warm bedroom, afternoon',
    line: 'Low bed, linen, golden light. Any size, beside or under the bed.',
    light: 'Late afternoon sun through warm sheer curtains, soft and golden.',
    palette: 'Cream walls, walnut or dark oak bed, white and oatmeal linen bedding, honey wood floor.',
    furniture: 'Low platform bed with linen bedding, two simple bedside tables with mushroom lamps, one or two small framed drawings. For a small rug: rug beside the bed. For a large rug: rug under the lower two thirds of the bed.',
    camera: 'Standing height, from the foot or the side of the bed, slightly elevated.',
  },
  {
    id: 'courtyard-room',
    name: 'Sunlit courtyard room',
    line: 'Stone, limewash and sun, almost no furniture. Textured, light rugs.',
    light: 'Strong Mediterranean sun with crisp shadows, light bouncing off pale plaster, garden or courtyard visible through an opening.',
    palette: 'Limewash white, sand, travertine, olive green from planting.',
    furniture: 'Almost none: a low daybed or bench, a built in plaster step or ledge, one plant. The rug and the architecture are the subject.',
    camera: 'Standing height, angled down, architectural composition.',
  },
];

export const roomStyle = (id: string): RoomStyle | undefined => ROOM_STYLES.find((s) => s.id === id);

/** A rug size in feet, short side first. */
export interface RugFt { w: number; l: number }

/**
 * Read the record's size field, which is free text and often junk or a sample
 * size (measured 27 Nov 2026 over 6,000 records: "1.0X1.0", "2.0x3.0",
 * "27''X18''", "30X30", "60X90", "5.0X8.0", "5X8 feet", "160X230", "0X8").
 * Units: inch marks or "in" = inches, "cm" = cm, "ft"/"feet"/' = feet; with no
 * unit, numbers up to 20 are feet, up to 36 inches (18x27, 30x30), above
 * that cm (60x90, 160x230). Returns null for anything it cannot read.
 */
export function parseRugSize(raw: string | undefined | null): RugFt | null {
  if (!raw) return null;
  const s = raw.toLowerCase()
    .replace(/[‘’′]/g, "'").replace(/[“”″]/g, '"')
    .replace(/(\d)\s+\.(\d)/g, '$1.$2').replace(/\s+/g, ' ');
  const m = s.match(/(\d+(?:\.\d+)?)\s*(''|"|'|ft|feet|cm|in)?\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(''|"|'|ft|feet|cm|in)?/);
  if (!m) return null;
  const a = Number(m[1]); const b = Number(m[3]);
  if (!(a > 0) || !(b > 0)) return null;
  const unitText = m[2] || m[4] || (/\bcm\b/.test(s) ? 'cm' : /\bfeet\b|\bft\b/.test(s) ? 'ft' : '');
  const big = Math.max(a, b);
  let unit: 'ft' | 'in' | 'cm';
  if (unitText === "''" || unitText === '"' || unitText === 'in') unit = 'in';
  else if (unitText === 'cm') unit = 'cm';
  else if (unitText === "'" || unitText === 'ft' || unitText === 'feet') unit = 'ft';
  else unit = big <= 20 ? 'ft' : big <= 36 ? 'in' : 'cm';
  const k = unit === 'ft' ? 1 : unit === 'in' ? 1 / 12 : 1 / 30.48;
  const w = Math.round(Math.min(a, b) * k * 10) / 10;
  const l = Math.round(Math.max(a, b) * k * 10) / 10;
  if (w < 0.5 || l > 40) return null;
  return { w, l };
}

/** Under about 3 x 5 ft (14 sq ft) a record's size is a sample swatch, not a rug for a room. */
export const SAMPLE_SQFT = 14;
export const isSampleSize = (s: RugFt) => s.w * s.l < SAMPLE_SQFT;

/** Sizes offered in the picker, in feet. */
export const COMMON_SIZES: RugFt[] = [
  { w: 2, l: 3 }, { w: 3, l: 5 }, { w: 4, l: 6 }, { w: 5, l: 8 }, { w: 6, l: 9 },
  { w: 8, l: 10 }, { w: 9, l: 12 }, { w: 10, l: 14 }, { w: 2.5, l: 8 },
];
export const DEFAULT_SIZE: RugFt = { w: 8, l: 10 };

/** "8 x 10 ft", short side first. */
export const sizeLabel = (s: RugFt) => `${trim(s.w)} x ${trim(s.l)} ft`;
const trim = (n: number) => String(Math.round(n * 10) / 10);

/** A size a person can enter for a rug in a room: 1.5 to 30 ft a side. */
export const validSize = (s: RugFt) => s.w >= 1.5 && s.l >= 1.5 && s.w <= 30 && s.l <= 30;

/**
 * What the record says about the rug, for the size step. `sample`: the size
 * reads as a swatch, so the studio must confirm the photo is a full rug and
 * give its real size. `full`: a sensible rug size to prefill. `unknown`:
 * blank or unreadable (half the records), so 8 x 10 is offered and she
 * confirms.
 */
export type SizeVerdict = { kind: 'full'; size: RugFt } | { kind: 'sample'; size: RugFt } | { kind: 'unknown' };
export function sizeVerdict(raw: string | undefined | null): SizeVerdict {
  const s = parseRugSize(raw);
  if (!s) return { kind: 'unknown' };
  return isSampleSize(s) ? { kind: 'sample', size: s } : { kind: 'full', size: s };
}

/**
 * Photo level hint, honest and cheap: a square photo or a file named swatch /
 * sample is often a sample piece. Tie cords and labels cannot be detected
 * reliably, so the studio's own tick is the real guard.
 */
export function photoLooksLikeSwatch(url: string, px?: { w: number; h: number }): boolean {
  let name = url;
  try { name = decodeURIComponent(new URL(url).pathname); } catch { /* keep raw */ }
  if (/swatch|sample|cutting|piece/i.test(name.split('/').pop() || '')) return true;
  if (px && px.w > 0 && px.h > 0) {
    const r = px.w / px.h;
    if (r > 0.92 && r < 1.08) return true;
  }
  return false;
}

function scaleWords(s: RugFt): { scale: string; onRug: string } {
  const a = s.w * s.l;
  if (a < 20) return {
    scale: 'a small accent rug, clearly smaller than the chair or bed next to it, about the length of a seat cushion to an armchair',
    onRug: 'nothing at all',
  };
  if (s.l / s.w >= 2.6) return {
    scale: 'a long runner, narrow, running along the floor',
    onRug: 'nothing at all',
  };
  if (a < 45) return {
    scale: 'a medium rug, about as long as a two seat sofa is wide, with clear floor all round it',
    onRug: 'the front legs of one chair at most',
  };
  if (a < 100) return {
    scale: 'a large living room rug, roughly as long as a three seat sofa is wide plus a metre, with the front legs of the sofa and chairs standing on it',
    onRug: 'the front legs of the sofa and chairs and the legs of a coffee table',
  };
  return {
    scale: 'a very large room size rug that covers most of the seating area, all furniture legs standing on it',
    onRug: 'furniture legs',
  };
}

const metres = (ft: number) => (Math.round(ft * 0.3048 * 10) / 10).toFixed(1);

export interface PromptInput {
  styleNumber: string;
  construction?: string;
  materials?: string;
  size: RugFt;
  style: RoomStyle;
  /** The photo is a PNG cutout with a transparent background. */
  cutout?: boolean;
}

/**
 * The prompt that worked in the test (prompt.txt), with the swatch line
 * removed: the photo is the whole rug, rendered at the size given, never a
 * sample scaled up.
 */
export function buildRoomPrompt(p: PromptInput): string {
  const { w, l } = p.size;
  const sizeWords = `about ${trim(w)} x ${trim(l)} ft (${metres(w)} x ${metres(l)} m)`;
  const what = [p.construction, p.materials].map((x) => (x || '').trim()).filter((x) => x && x.length < 60).join(', ').toLowerCase();
  const { scale, onRug } = scaleWords(p.size);
  const ratio = (w / l).toFixed(2);
  return [
    `Image 1 is a studio photo of a real handmade rug, ${p.styleNumber}${what ? `, ${what}` : ''}, ${sizeWords}. The photo shows the whole rug.`,
    'Use no other reference.',
    'Create one photorealistic interior photograph, landscape 16:9, showing exactly this rug in a room.',
    '',
    `THE RUG MUST BE IDENTICAL TO IMAGE 1. Keep its exact pattern, every stripe, motif and block in the same order and the same relative sizes, the exact colours, its proportions (width to length about ${ratio}), its border and its edge finish exactly as in the photo: a fringe only if the photo shows one. Do not simplify, recolour, mirror, crop, add, repeat or invent any motif. Do not enlarge the pattern or tile it to fill a bigger rug.${p.cutout ? ' The photo has a transparent or plain background; that is not part of the rug.' : ''}`,
    `The rug lies completely flat on the floor, seen in correct perspective from the camera, at its real size of ${sizeWords}: ${scale}. It must not look bigger than that.`,
    `Show the whole rug, or at least 90 percent of it, unobstructed and in sharp focus. Nothing lies on it except ${onRug}.`,
    '',
    `ROOM: ${p.style.name}.`,
    `Light: ${p.style.light}`,
    `Palette: ${p.style.palette}`,
    `Furniture: ${p.style.furniture}`,
    `Camera: ${p.style.camera}`,
    '',
    'House look: real architecture photographed for an interiors magazine, natural daylight, warm quiet palette, few well chosen designer pieces, lots of empty floor, the rug is the hero.',
    'Never include: people, hands, pets, text, signage, logos, watermarks, clutter, objects lying on the rug, sample labels or tie cords from the studio photo, brass heavy glam, neon or dramatic coloured lighting.',
  ].join('\n');
}

/** India date, YYYY-MM-DD: the daily cap resets at midnight IST. */
export function istDay(now = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}
