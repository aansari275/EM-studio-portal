import { fixStorageUrl } from './img';

/**
 * Remove background from the Library preview, and Restore original.
 *
 * A design's photos are plain URL lists (`firebaseUrl` + `additionalImages`,
 * or `photos[].url` on the em_products archive), so there is nowhere on a
 * photo itself to note what it was cut from. A cutout kept from the preview
 * is therefore recorded on the record as
 *
 *   photoOriginals: [{ url, originalUrl, at, by }]
 *
 * `url` is the cutout now in the photo list, `originalUrl` the photo it
 * replaced. Both files stay in Storage (deletes are locked and nothing is
 * ever deleted); the list only says which one to put back. Same idea as the
 * `originalUrl` on Background Removal draft photos and on entry photos.
 *
 * Entries are not pruned when a photo leaves the list, so "Photo removed.
 * Undo" still brings back a photo that can be restored. Pure, unit tested.
 */

export interface PhotoOriginal {
  /** The cutout as it appears in the photo list. */
  url: string;
  /** The photo it replaced, kept in Storage. */
  originalUrl: string;
  /** ISO time it was kept. */
  at: string;
  by?: string;
}

/** Read the stored list, dropping anything malformed. URLs healed like the photos are. */
export function parsePhotoOriginals(raw: unknown): PhotoOriginal[] {
  if (!Array.isArray(raw)) return [];
  const out: PhotoOriginal[] = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const { url, originalUrl, at, by } = e as Record<string, unknown>;
    if (typeof url !== 'string' || !url || typeof originalUrl !== 'string' || !originalUrl) continue;
    out.push({
      url: fixStorageUrl(url),
      originalUrl: fixStorageUrl(originalUrl),
      at: typeof at === 'string' ? at : '',
      ...(typeof by === 'string' && by ? { by } : {}),
    });
  }
  return out;
}

/** The original kept for this photo, if any. The newest entry wins. */
export function originalOf(list: PhotoOriginal[] | undefined, url: string): string | undefined {
  if (!list || !url) return undefined;
  for (let i = list.length - 1; i >= 0; i--) if (list[i].url === url) return list[i].originalUrl;
  return undefined;
}

/** The list with `url` swapped for `next` at the same position. */
export function replaceAt(photos: string[], url: string, next: string): string[] {
  const at = photos.indexOf(url);
  if (at < 0) throw new Error('That photo is no longer on this design.');
  const out = [...photos];
  out[at] = next;
  // A list never holds the same photo twice (allImages() would drop one and shift the rest).
  return out.filter((u, i) => i === at || u !== next);
}

/**
 * Keep a cutout in place of `oldUrl`. The cutout takes the same position, so
 * the main photo stays main and the order is unchanged. If `oldUrl` was
 * itself a kept cutout, the new one points at the first original, so
 * Restore always gives back the camera photo.
 */
export function keepCutout(
  photos: string[], originals: PhotoOriginal[], oldUrl: string, cutUrl: string,
  meta: { at: string; by?: string }
): { photos: string[]; originals: PhotoOriginal[] } {
  const next = replaceAt(photos, oldUrl, cutUrl);
  const first = originalOf(originals, oldUrl) || oldUrl;
  return {
    photos: next,
    originals: [
      ...originals.filter((e) => e.url !== oldUrl && e.url !== cutUrl),
      { url: cutUrl, originalUrl: first, at: meta.at, ...(meta.by ? { by: meta.by } : {}) },
    ],
  };
}

/** Put the original back in the cutout's position and forget the entry. */
export function restoreOriginal(
  photos: string[], originals: PhotoOriginal[], url: string
): { photos: string[]; originals: PhotoOriginal[] } {
  const orig = originalOf(originals, url);
  if (!orig) throw new Error('No original is kept for this photo.');
  return { photos: replaceAt(photos, url, orig), originals: originals.filter((e) => e.url !== url) };
}

/** A kept cutout that is turned gets a new address; its original follows it. */
export function carryOriginal(originals: PhotoOriginal[], fromUrl: string, toUrl: string): PhotoOriginal[] | null {
  if (!originals.some((e) => e.url === fromUrl)) return null;
  return originals.map((e) => (e.url === fromUrl ? { ...e, url: toUrl } : e));
}
