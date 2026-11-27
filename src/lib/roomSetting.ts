import type { RoomImage } from './roomImages';

/**
 * Pure rules for the room images kept on a product (`roomImages`). The
 * Firestore and server calls are in roomSettingIO.ts. Room images are kept
 * apart from the photo list, so the hero, buyer links and photo slots never
 * see them.
 */

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** The stored list, tolerant of junk: entries without a url are dropped. */
export function parseRoomImages(raw: unknown): RoomImage[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list = raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !!str((x as Record<string, unknown>).url))
    .map((x) => ({
      url: str(x.url), path: str(x.path), roomType: str(x.roomType), size: str(x.size),
      at: str(x.at), by: str(x.by), sourceUrl: str(x.sourceUrl),
    }));
  return list.length ? list : undefined;
}

/** Add a kept image at the end (the first stays the deck one). The same url twice is kept once. */
export function addRoomImage(list: RoomImage[] | undefined, img: RoomImage): RoomImage[] {
  return [...(list || []).filter((r) => r.url !== img.url), img];
}

/** Drop one by url. The file stays in Storage. */
export function removeRoomImage(list: RoomImage[] | undefined, url: string): RoomImage[] {
  return (list || []).filter((r) => r.url !== url);
}

/** Move one to the front: the deck and tearsheet use the first. */
export function makeFirstRoomImage(list: RoomImage[] | undefined, url: string): RoomImage[] {
  const l = list || [];
  const hit = l.find((r) => r.url === url);
  return hit ? [hit, ...l.filter((r) => r.url !== url)] : l;
}
