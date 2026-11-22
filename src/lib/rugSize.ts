import type { AspectEstimate } from './photoEdit';

/**
 * Rug sizes and how a shape is described in the editor's Size step. Pure,
 * no React, so it can be unit tested.
 */

/** Common rug sizes, short side then long side, in feet. */
export const PRESETS: { label: string; a: number; b: number }[] = [
  { label: '2x3', a: 2, b: 3 },
  { label: '3x5', a: 3, b: 5 },
  { label: '4x6', a: 4, b: 6 },
  { label: '5x8', a: 5, b: 8 },
  { label: '6x9', a: 6, b: 9 },
  { label: '8x10', a: 8, b: 10 },
  { label: '9x12', a: 9, b: 12 },
  { label: '10x14', a: 10, b: 14 },
  { label: 'Runner 2.5x8', a: 2.5, b: 8 },
  { label: 'Round or square', a: 1, b: 1 },
];

export const trim = (v: number) => String(Math.round(v * 100) / 100);

/** Width / height as "1 : 1.60" (the short side is 1). */
export function ratioText(r: number): string {
  if (!Number.isFinite(r) || r <= 0) return '';
  return r <= 1 ? `1 : ${(1 / r).toFixed(2)}` : `${r.toFixed(2)} : 1`;
}

/**
 * The nearest common rug size, if one is within 3% of this shape. Sizes with
 * the same shape are named together (2 x 3, 4 x 6 and 6 x 9 are all 2 : 3).
 */
export function nearestSize(r: number): string | null {
  const long = Math.max(r, 1 / r);
  if (Math.abs(Math.log(long)) < 0.03) return 'square';
  const scored = PRESETS.filter((p) => p.a !== p.b)
    .map((p) => ({ p, err: Math.abs(Math.log(long / (p.b / p.a))) }));
  const best = Math.min(...scored.map((x) => x.err));
  if (best >= 0.03) return null;
  const names = scored.filter((x) => x.err - best < 1e-9).map((x) => `${trim(x.p.a)} x ${trim(x.p.b)}`);
  return `${names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : names[0]} ft`;
}

/**
 * A preset placed on the photo: the photo's long side stays the long side.
 * Returns width (left to right) and length (top to bottom).
 */
export function orientSize(p: { a: number; b: number }, landscape: boolean): [number, number] {
  const short = Math.min(p.a, p.b), long = Math.max(p.a, p.b);
  return landscape ? [long, short] : [short, long];
}

/** One line on how far the automatic proportions can be trusted. */
export function estimateNote(e: AspectEstimate, cameraFrame: boolean): string {
  const near = nearestSize(e.ratio);
  const like = near ? ` Close to ${near}.` : '';
  if (!cameraFrame && e.method !== 'sides') {
    return `This photo was cropped or edited before, so this is a rough guess; enter the rug size if you know it.${like}`;
  }
  switch (e.method) {
    case 'lens': return `Worked out from the perspective and the camera's lens.${like}`;
    case 'perspective': return `Worked out from the perspective.${like}`;
    case 'assumed': return `The photo has no lens details, so this assumes a typical lens; check it, or enter the rug size.${like}`;
    default: return `Taken from the side lengths.${like}`;
  }
}

export type SizeUnit = 'ft' | 'cm';

/** What is typed in the Size step's Rug size fields: width (left to right), length (top to bottom). */
export interface SizeFields { a: string; b: string; unit: SizeUnit }

export const EMPTY_SIZE: SizeFields = { a: '', b: '', unit: 'ft' };

const num = (v: string) => { const n = Number(v); return v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null; };

/**
 * True when both fields hold a size and the photo's shape is exactly that
 * size (within rounding, so switching ft and cm does not count as a change).
 */
export function sizeApplied(f: SizeFields, shape: number | null): boolean {
  const a = num(f.a), b = num(f.b);
  if (a === null || b === null || !shape) return false;
  return Math.abs(Math.log(a / b / shape)) < 0.002;
}

/**
 * The fields as they should show. A filled-in size that no longer matches
 * the shape (Width or Length was moved, Auto or Reset) is cleared, so the
 * fields never claim a size the photo no longer has. A size still being
 * typed (one field empty) is left alone.
 */
export function reconcileSize(f: SizeFields, shape: number | null): SizeFields {
  if (num(f.a) === null || num(f.b) === null) return f;
  return sizeApplied(f, shape) ? f : { ...f, a: '', b: '' };
}

/** The preset that is in use: its size is in the fields and applied. */
export function activePreset(f: SizeFields, shape: number | null, landscape: boolean): string | null {
  if (!sizeApplied(f, shape)) return null;
  const k = f.unit === 'cm' ? 30.48 : 1;
  const a = Number(f.a), b = Number(f.b);
  const hit = PRESETS.find((p) => {
    const [w, l] = orientSize(p, landscape);
    return Math.abs(Number(trim(w * k)) - a) < 1e-9 && Math.abs(Number(trim(l * k)) - b) < 1e-9;
  });
  return hit ? hit.label : null;
}
