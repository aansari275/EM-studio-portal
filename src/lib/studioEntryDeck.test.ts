import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { entryDeckFileName, entryDeckRecord, entrySpecLines, formatDate, reorderBy } from './studioEntryDeck';
import { buildPptx, setAssetsBase } from './pptGenerator';
import { fileURLToPath } from 'node:url';
import { fitContain, photoSlotsFor, toFrac, PHOTO_SLOTS, type SlideLayout } from './deckSlots';
import { orderedImages } from './img';
import type { DeckImages } from './deckImages';

const photo = (n: number) => ({ url: `https://x.test/p${n}.jpg` });

describe('entry deck record', () => {
  it('keeps the entry photo order, photo 1 is main', () => {
    const r = entryDeckRecord({ id: 'e1', customerName: 'Acme', date: '2026-11-21', note: '', photos: [photo(3), photo(1), photo(2)] });
    expect(orderedImages(r)).toEqual([photo(3).url, photo(1).url, photo(2).url]);
  });

  it('does not let a main.* file jump the queue', () => {
    const r = entryDeckRecord({ id: 'e1', customerName: 'A', date: '', note: '', photos: [photo(1), { url: 'https://x.test/main.jpg' }] });
    expect(orderedImages(r)[0]).toBe(photo(1).url);
  });

  it('spec text is customer, date and note only, no dashes', () => {
    expect(entrySpecLines({ customerName: ' Acme Home ', date: '2026-11-21', note: ' 8x10, hand tufted \n\n\n\nblue ' }))
      .toEqual(['CUSTOMER: ACME HOME', 'DATE: 21 NOV 2026', '8x10, hand tufted \n\nblue']);
    expect(entrySpecLines({ customerName: '', date: '', note: '' })).toEqual([]);
    for (const l of entrySpecLines({ customerName: 'X', date: '2026-01-02', note: '' })) expect(l).not.toMatch(/[–—]/);
  });

  it('file name', () => {
    expect(entryDeckFileName({ customerName: 'Acme & Sons, Ltd.', date: '2026-11-21' })).toBe('Eastern_Mills_Acme_Sons_Ltd_2026-11-21.pptx');
    expect(entryDeckFileName({ customerName: '', date: '2026-11-21' })).toBe('Eastern_Mills_Entry_2026-11-21.pptx');
  });

  it('formatDate', () => {
    expect(formatDate('2026-11-21')).toBe('21 Nov 2026');
    expect(formatDate('junk')).toBe('junk');
  });
});

describe('reorderBy', () => {
  const url = (s: string) => s;
  it('moves, keeps unshown items at the end, removes and restores from the stash', () => {
    const stash = new Map<string, string>();
    expect(reorderBy(['a', 'b', 'c', 'd'], url, ['c', 'a', 'b'], ['a', 'b', 'c'], stash)).toEqual(['c', 'a', 'b', 'd']);
    const removed = reorderBy(['a', 'b', 'c'], url, ['a', 'c'], ['a', 'b', 'c'], stash);
    expect(removed).toEqual(['a', 'c']);
    expect(reorderBy(removed, url, ['a', 'b', 'c'], ['a', 'c'], stash)).toEqual(['a', 'b', 'c']);
  });
  it('items without a url (still uploading) stay', () => {
    type T = { u?: string; id: number };
    const items: T[] = [{ u: 'a', id: 1 }, { id: 2 }, { u: 'b', id: 3 }];
    expect(reorderBy(items, (t) => t.u, ['b', 'a'], ['a', 'b']).map((t) => t.id)).toEqual([3, 1, 2]);
  });
});

// A 1x1 PNG; the deck only needs data and the pixel size we claim for it.
const PX = 'image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const EMU = 914400;
// Under Node pptxgenjs reads the logo and outro images off disk.
setAssetsBase(fileURLToPath(new URL('../../public/ppt-assets', import.meta.url)));

async function slideXml(records: Parameters<typeof buildPptx>[0], images: DeckImages, n: number) {
  const buf = (await buildPptx(records, 'T', { images, extraPhotos: true }).write({ outputType: 'uint8array' })) as Uint8Array;
  const files = unzipSync(buf);
  return strFromU8(files[`ppt/slides/slide${n}.xml`]);
}

const pics = (xml: string) =>
  [...xml.matchAll(/<p:pic>[\s\S]*?<a:off x="(\d+)" y="(\d+)"\/>\s*<a:ext cx="(\d+)" cy="(\d+)"\/>/g)]
    .map((m) => m.slice(1).map(Number));

describe('entry deck slide matches the diagram geometry', () => {
  const photos = [1, 2, 3, 4, 5].map(photo);
  const sizes = [[1000, 1500], [800, 800], [1600, 900], [900, 1200], [500, 500]];
  const images: DeckImages = new Map(photos.map((p, i) => [p.url, { data: PX, w: sizes[i][0], h: sizes[i][1], bytes: 1 }]));
  const boxes = PHOTO_SLOTS.map((b, i) => (i === 0 ? { x: 0.5, y: 0.5, w: 4, h: 6 } : b));
  const layout: SlideLayout = { v: 1, slots: boxes.map(toFrac) };

  it('photos 1 to 4 sit where fitContain(photoSlotsFor(layout)) puts them; spec text is the entry', async () => {
    const rec = entryDeckRecord({ id: 'e', customerName: 'Test', date: '2026-11-24', note: 'Blue, 8x10', photos, slideLayout: layout });
    const xml = await slideXml([rec], images, 3); // 2 intro slides first
    const got = pics(xml).slice(1); // first pic is the corner logo
    const want = photoSlotsFor(layout).map((b, i) => fitContain(b, sizes[i][0], sizes[i][1]));
    expect(got).toHaveLength(4);
    got.forEach((g, i) => {
      const w = want[i];
      [w.x, w.y, w.w, w.h].forEach((v, k) => expect(Math.abs(g[k] - v * EMU)).toBeLessThan(100));
    });
    expect(xml).toContain('CUSTOMER: TEST');
    expect(xml).toContain('DATE: 24 NOV 2026');
    expect(xml).toContain('Blue, 8x10');
    // photo 5 goes on the 8-up overflow slide after it
    expect(pics(await slideXml([rec], images, 4)).length).toBe(2); // logo + photo 5
  });
});
