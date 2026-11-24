import type { DeckRecord } from './pptGenerator';
import type { SlideLayout } from './deckSlots';

/**
 * A Custom Rugs or Sample Dispatch entry as one rug for the house deck
 * (pptGenerator.ts). Pure, so it is unit tested without Firebase.
 *
 * - Photos go in the entry's own order: photo 1 is the main photo, 2 to 4 the
 *   other boxes, the rest on the 8-up overflow slides. `heroPinned` makes the
 *   deck trust that order (no main.* guessing, which is for Library imports).
 * - The spec text is only what the entry has: customer, date, note. No style
 *   number, no prices, nothing made up. Empty parts are left out.
 * - `slideLayout` is the entry's own, the same shape as a product's, so the
 *   deck and the diagram use the same photoSlotsFor() boxes.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 2026-11-21 as 21 Nov 2026. */
export function formatDate(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : d;
}

export interface EntryDeckInput {
  id: string;
  customerName: string;
  date: string;
  note: string;
  photos: { url: string }[];
  slideLayout?: SlideLayout;
}

/** The spec lines on the slide, in the house deck's capitals. */
export function entrySpecLines(e: Pick<EntryDeckInput, 'customerName' | 'date' | 'note'>): string[] {
  const lines: string[] = [];
  const name = e.customerName.trim();
  if (name) lines.push(`CUSTOMER: ${name.toUpperCase()}`);
  if (e.date) lines.push(`DATE: ${formatDate(e.date).toUpperCase()}`);
  const note = e.note.trim().replace(/\n{3,}/g, '\n\n');
  if (note) lines.push(note);
  return lines;
}

export function entryDeckRecord(e: EntryDeckInput): DeckRecord {
  const urls = e.photos.map((p) => p.url).filter(Boolean);
  const name = e.customerName.trim();
  return {
    id: e.id,
    baseStyleNumber: '',
    styleNumber: '',
    displayName: name || 'Entry',
    firebaseUrl: urls[0] || '',
    additionalImages: urls.slice(1),
    heroPinned: true,
    slideLayout: e.slideLayout,
    deckSpec: entrySpecLines(e),
  };
}

/** Eastern_Mills_<Customer>_<date>.pptx, safe for any file system. */
export function entryDeckFileName(e: Pick<EntryDeckInput, 'customerName' | 'date'>): string {
  const who = e.customerName.trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'Entry';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : new Date().toISOString().split('T')[0];
  return `Eastern_Mills_${who}_${date}.pptx`;
}

/**
 * A photo list put in a new order from the strip (PhotoStrip). `next` is the
 * strip's new list of urls, `shown` the urls the strip was showing. Items in
 * `next` come first, in that order (found in `items` or, for an Undo, in
 * `stash`); items the strip did not show (still uploading) keep their place
 * at the end; items it showed but `next` leaves out are removed.
 */
export function reorderBy<T>(
  items: T[], urlOf: (t: T) => string | undefined, next: string[], shown: string[], stash?: Map<string, T>,
): T[] {
  const byUrl = new Map<string, T>();
  for (const t of items) {
    const u = urlOf(t);
    if (u) { byUrl.set(u, t); stash?.set(u, t); }
  }
  const picked = next.map((u) => byUrl.get(u) ?? stash?.get(u)).filter((t): t is T => t !== undefined);
  const inNext = new Set(next);
  const wasShown = new Set(shown);
  const rest = items.filter((t) => { const u = urlOf(t); return !u || (!inNext.has(u) && !wasShown.has(u)); });
  return [...picked, ...rest];
}
