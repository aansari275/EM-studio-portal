import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { fileURLToPath } from 'node:url';
import { buildPptx, deckPhotoSlots, roomCaption, setAssetsBase, ROOM_PLATE, ROOM_SOURCE_PX, SLIDE, type DeckOptions, type DeckRecord } from './pptGenerator';
import { firstRoomImage, type RoomImage } from './roomImages';
import type { DeckImages } from './deckImages';

// A 1x1 PNG; the deck only needs data and the pixel size we claim for it.
const PX = 'image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const EMU = 914400;
setAssetsBase(fileURLToPath(new URL('../../public/ppt-assets', import.meta.url)));

const room = (n: string): RoomImage => ({
  url: `https://x.test/room-${n}.jpg`, path: `studio-portal/room-settings/${n}.jpg`,
  roomType: 'living', size: '8x10', at: '2026-11-27', by: 'test', sourceUrl: '',
});
const rug = (id: string, photos: number, roomImages?: RoomImage[]): DeckRecord => ({
  id,
  baseStyleNumber: `EM-26-T-${id}`,
  styleNumber: `EM-26-T-${id}`,
  displayName: `EM-26-T-${id}`,
  firebaseUrl: `https://x.test/${id}/main.jpg`,
  additionalImages: Array.from({ length: photos - 1 }, (_, i) => `https://x.test/${id}/image-${i + 2}.jpg`),
  heroPinned: true,
  ...(roomImages ? { roomImages } : {}),
});

// A has 5 photos (one overflow slide) and a room; B none; C a room.
const A = rug('A', 5, [room('a'), room('a2')]);
const B = rug('B', 2);
const C = rug('C', 3, [room('c')]);
const strip = (p: DeckRecord): DeckRecord => {
  const copy = { ...p };
  delete copy.roomImages;
  return copy;
};

function imagesFor(records: DeckRecord[]): DeckImages {
  const urls = deckPhotoSlots(records, { extraPhotos: true, roomSlides: true }).map((s) => s.url);
  return new Map(urls.map((u) => [u, u.includes('/room-') ? { data: PX, w: 1376, h: 768, bytes: 1 } : { data: PX, w: 1000, h: 1500, bytes: 1 }]));
}

async function unzip(records: DeckRecord[], opts: DeckOptions) {
  const buf = (await buildPptx(records, 'T', opts).write({ outputType: 'uint8array' })) as Uint8Array;
  return unzipSync(buf);
}

/** Slide XML, slide rels and media, which is what a buyer sees. */
const deckParts = (files: Record<string, Uint8Array>) =>
  Object.fromEntries(Object.entries(files).filter(([k]) => /^ppt\/(slides|media)\//.test(k)));

describe('room setting slides', () => {
  const images = imagesFor([A, B, C]);

  it('firstRoomImage', () => {
    expect(firstRoomImage(A)?.url).toBe(room('a').url);
    expect(firstRoomImage(B)).toBeNull();
    expect(firstRoomImage({ roomImages: [] })).toBeNull();
    expect(firstRoomImage({ roomImages: null })).toBeNull();
  });

  it('tick off, or no rug with a room image: slide XML and media byte identical to before', async () => {
    for (const layout of ['single', 'grid'] as const) {
      const before = deckParts(await unzip([A, B, C].map(strip), { images, extraPhotos: true, layout }));
      const off = deckParts(await unzip([A, B, C], { images, extraPhotos: true, layout }));
      const offExplicit = deckParts(await unzip([A, B, C], { images, extraPhotos: true, layout, roomSlides: false }));
      const noneHaveOne = deckParts(await unzip([A, B, C].map(strip), { images, extraPhotos: true, layout, roomSlides: true }));
      for (const other of [off, offExplicit, noneHaveOne]) {
        expect(Object.keys(other).sort()).toEqual(Object.keys(before).sort());
        for (const k of Object.keys(before)) expect(Buffer.from(other[k]).equals(Buffer.from(before[k])), k).toBe(true);
      }
    }
    // and the photos fetched are the same list
    expect(deckPhotoSlots([A, B, C], { extraPhotos: true })).toEqual(deckPhotoSlots([A, B, C].map(strip), { extraPhotos: true }));
    expect(deckPhotoSlots([A, B, C], { layout: 'grid', roomSlides: true })).toEqual(deckPhotoSlots([A, B, C], { layout: 'grid' }));
  });

  it('grid layout ignores room images', async () => {
    const grid = deckParts(await unzip([A, B, C], { images, layout: 'grid' }));
    const gridOn = deckParts(await unzip([A, B, C], { images, layout: 'grid', roomSlides: true }));
    for (const k of Object.keys(grid)) expect(Buffer.from(gridOn[k]).equals(Buffer.from(grid[k])), k).toBe(true);
  });

  it('fetches the first room image once per rug, full slide, capped at the source width', () => {
    const rooms = deckPhotoSlots([A, B, C], { extraPhotos: true, roomSlides: true }).filter((s) => s.url.includes('/room-'));
    expect(rooms).toEqual([
      { url: room('a').url, w: SLIDE.w, h: SLIDE.h, maxPx: ROOM_SOURCE_PX },
      { url: room('c').url, w: SLIDE.w, h: SLIDE.h, maxPx: ROOM_SOURCE_PX },
    ]);
  });

  it('order: each rug, its overflow, then its room slide; geometry covers the slide', async () => {
    const files = await unzip([A, B, C], { images, extraPhotos: true, roomSlides: true });
    const slides = Object.keys(files).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k));
    // 2 intro, A, A overflow, A room, B, C, C room, 3 outro
    expect(slides).toHaveLength(11);
    const xml = (n: number) => strFromU8(files[`ppt/slides/slide${n}.xml`]);
    const full = new RegExp(`<p:pic>[\\s\\S]*?<a:off x="0" y="0"/>\\s*<a:ext cx="${Math.round(SLIDE.w * EMU)}" cy="${Math.round(SLIDE.h * EMU)}"/>`);
    const isRoom = (n: number) => full.test(xml(n));
    expect([3, 4, 5, 6, 7, 8].map(isRoom)).toEqual([false, false, true, false, false, true]);
    expect(xml(3)).toContain('STYLE NO. – EM-26-T-A');
    expect(xml(4)).toContain('STYLE NO. – EM-26-T-A'); // overflow slide
    expect(xml(6)).toContain('STYLE NO. – EM-26-T-B');
    expect(xml(7)).toContain('STYLE NO. – EM-26-T-C');

    const r = xml(5);
    // The room photo is first (bottom of the stack), covering 0,0 to 13.333 x 7.5 in.
    const pics = [...r.matchAll(/<p:pic>[\s\S]*?<\/p:pic>/g)].map((m) => m[0]);
    expect(pics).toHaveLength(2); // room photo + corner logo
    expect(pics[0]).toMatch(/<a:off x="0" y="0"\/>\s*<a:ext cx="12191695" cy="6858000"\/>/);
    // Cover crop, centred: 1376x768 is a touch wider than 16:9, so equal left and right trims, none top and bottom.
    const trim = Math.round(1e5 * 0.5 * (1 - SLIDE.w / ((SLIDE.h * 1376) / 768)));
    expect(trim).toBeGreaterThan(0);
    expect(pics[0]).toContain(`<a:srcRect l="${trim}" r="${trim}" t="0" b="0"/>`);
    // Logo in the product slides' corner, on its plate.
    expect(pics[1]).toContain(`<a:off x="${Math.round(11.449 * EMU)}"`);
    expect(r).toContain(`<a:off x="${Math.round(ROOM_PLATE.x * EMU)}" y="${Math.round(ROOM_PLATE.y * EMU)}"/>`);
    // Caption, no dashes.
    expect(r).toContain('>EM-26-T-A<');
    expect(r).not.toMatch(/[–—]|--/);
    // The second room image is not used.
    expect(Object.keys(files).filter((k) => k.startsWith('ppt/media/')).length)
      .toBe(Object.keys(deckParts(await unzip([A, B, C].map(strip), { images, extraPhotos: true }))).filter((k) => k.startsWith('ppt/media/')).length + 2 + 2);
  });

  it('a room image that failed to load: no slide', async () => {
    const partial = new Map(images);
    partial.delete(room('a').url);
    const files = await unzip([A, B, C], { images: partial, extraPhotos: true, roomSlides: true });
    expect(Object.keys(files).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))).toHaveLength(10);
  });

  it('caption', () => {
    expect(roomCaption({ ...B, color: 'Grey Yellow' })).toBe('EM-26-T-B  ·  GREY YELLOW');
    expect(roomCaption({ ...B, styleNumber: 'EM-17-AM-418-GREY-YELLOW', color: 'Grey Yellow' })).toBe('EM-17-AM-418-GREY-YELLOW');
    expect(roomCaption(B)).toBe('EM-26-T-B');
  });
});
