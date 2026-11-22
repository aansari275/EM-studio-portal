import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { currentUserUid } from './auth';
import type { SeenMap } from './training';

/**
 * Firestore side of the training videos.
 *
 * - `config/studio_training`: the catalogue, read once per page session and
 *   kept in memory. Read only: the app never writes it.
 * - `studio_training_seen/{uid}`: `{ seen: { [videoId]: version } }`, read once
 *   per session, updated (merge) when she closes a video.
 *
 * A test page can swap in a fake catalogue and user with `setTrainingTestOverride`
 * so it never touches the real catalogue doc.
 */

let override: { catalogue?: unknown; uid?: string } | null = null;

/** Test pages only. */
export function setTrainingTestOverride(o: { catalogue?: unknown; uid?: string } | null) {
  override = o;
  catalogue = null;
  seenCache.clear();
}

let catalogue: Promise<unknown> | null = null;

/** The raw catalogue doc data, or null when it does not exist or cannot be read. */
export function loadCatalogue(): Promise<unknown> {
  if (override?.catalogue !== undefined) return Promise.resolve(override.catalogue);
  if (!catalogue) {
    catalogue = getDoc(doc(db, 'config', 'studio_training'))
      .then((s) => (s.exists() ? s.data() : null))
      .catch(() => {
        catalogue = null; // try again next time a page asks
        return null;
      });
  }
  return catalogue;
}

export function trainingUid(): string | null {
  return override?.uid ?? currentUserUid();
}

// uid -> seen map (or null when it could not be read). Updated in place on close.
const seenCache = new Map<string, Promise<SeenMap | null>>();

/** Her seen map, or null when she is not signed in or it could not be read. */
export function loadSeen(): Promise<SeenMap | null> {
  const uid = trainingUid();
  if (!uid) return Promise.resolve(null);
  let p = seenCache.get(uid);
  if (!p) {
    p = getDoc(doc(db, 'studio_training_seen', uid))
      .then((s) => {
        const seen = (s.exists() ? (s.data() as { seen?: unknown }).seen : null) || {};
        return typeof seen === 'object' ? { ...(seen as SeenMap) } : {};
      })
      .catch(() => {
        seenCache.delete(uid); // offline or refused: no auto-open now, ask again later
        return null;
      });
    seenCache.set(uid, p);
  }
  return p;
}

/** Record that she closed this video at this version. Fire and forget. */
export async function markSeen(videoId: string, version: number): Promise<void> {
  const uid = trainingUid();
  if (!uid) return;
  const cached = await seenCache.get(uid);
  if (cached) cached[videoId] = Math.max(version, Number(cached[videoId]) || 0);
  try {
    await setDoc(doc(db, 'studio_training_seen', uid), { seen: { [videoId]: version } }, { merge: true });
  } catch {
    // Not saved: the in-memory copy still stops it opening again this session.
  }
}
