import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import type { Actor } from './auth';
import { patchOnExit } from './exitSave';
import type { RemoteFile } from './photoSlots';

/**
 * The Background Removal page's working set, one draft per person:
 * `studio_bg_drafts/{uid}` with `photos`, files under
 * `studio-portal/bg-drafts/{uid}/`. The processing still runs on her
 * computer; only the photos are kept, so a refresh or a crash loses nothing.
 *
 * Files are uploaded exactly as they are (no compression), because these
 * are what she downloads. Clear all empties the list; the files stay in
 * Storage, and nothing is ever hard deleted.
 */

const COLLECTION = 'studio_bg_drafts';
const folder = (uid: string) => `studio-portal/bg-drafts/${uid}`;

export interface BgPhoto {
  name: string;
  url: string;
  path: string;
  originalUrl?: string;
  originalPath?: string;
  cut: boolean;
  /** The file is a cutout of the original, same framing (see Slot.cutOfOriginal). */
  cutOfOriginal?: boolean;
  /** Where it was sent with Send to, shown under the tile. */
  sent?: string;
  updatedAt: string;
}

const safeBase = (name: string) =>
  (name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'photo').slice(0, 60);

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' };

export async function loadBgDraft(uid: string): Promise<BgPhoto[]> {
  const snap = await getDoc(doc(db, COLLECTION, uid));
  const photos = snap.exists() ? snap.data().photos : null;
  return Array.isArray(photos) ? (photos as BgPhoto[]).filter((p) => p && p.url) : [];
}

export async function uploadBgFile(uid: string, file: File): Promise<RemoteFile> {
  const ext = EXT[file.type] || 'jpg';
  const name = `${safeBase(file.name)}.${ext}`;
  const path = `${folder(uid)}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${name}`;
  const sref = ref(storage, path);
  await uploadBytes(sref, file, { contentType: file.type || 'image/jpeg' });
  return { url: await getDownloadURL(sref), path, name, uploadedAt: new Date().toISOString() };
}

const clean = (photos: BgPhoto[]) =>
  photos.map((p) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as unknown as BgPhoto);

export async function saveBgDraft(by: Actor, photos: BgPhoto[]): Promise<void> {
  await setDoc(doc(db, COLLECTION, by.uid), {
    photos: clean(photos), uid: by.uid, updatedAt: serverTimestamp(), updatedBy: by.email || 'studio',
  }, { merge: true });
}

export function saveBgDraftOnExit(by: Actor, photos: BgPhoto[]): void {
  patchOnExit(`${COLLECTION}/${by.uid}`, {
    photos: clean(photos), uid: by.uid, updatedAt: new Date(), updatedBy: by.email || 'studio',
  }, false);
}
