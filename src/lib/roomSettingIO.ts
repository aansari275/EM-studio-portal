import { doc, getDoc, updateDoc, deleteField, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, invalidateShowroomCache, type ShowroomProduct } from './firebase';
import { auth, currentUserEmail } from './auth';
import type { RoomImage } from './roomImages';
import { addRoomImage, makeFirstRoomImage, parseRoomImages, removeRoomImage } from './roomSetting';
import type { RugFt } from './roomStyles';

/**
 * Room setting calls: the server function (netlify/functions/room-setting.mts)
 * and the one field it adds to a product, `roomImages`. The photo list,
 * hero and slide layout are never touched.
 */

const isArchive = (p: ShowroomProduct) => p.id.startsWith('em:');
export const docPathOf = (p: ShowroomProduct) => (isArchive(p) ? `em_products/${p.id.slice(3)}` : `showroom_products/${p.id}`);
const refOf = (p: ShowroomProduct) => (isArchive(p) ? doc(db, 'em_products', p.id.slice(3)) : doc(db, 'showroom_products', p.id));

const ENDPOINT = '/api/room-setting';

async function token(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in again.');
  return u.getIdToken();
}

export type Usage = { used: number; limit: number; remaining: number };

export async function roomUsage(): Promise<Usage | null> {
  try {
    const res = await fetch(ENDPOINT, { headers: { Authorization: `Bearer ${await token()}` } });
    if (!res.ok) return null;
    const d = await res.json();
    return d?.ok ? { used: d.used, limit: d.limit, remaining: d.remaining } : null;
  } catch {
    return null;
  }
}

export type Candidate = { url: string; path: string; w: number; h: number; ms: number; remaining?: number };

/**
 * One generation. The reply is streamed: spaces while it works, then one
 * JSON object, so it is read whole and trimmed. Throws an Error with a plain
 * message the panel shows as it is.
 */
export async function createRoomSetting(p: ShowroomProduct, photoUrl: string, roomType: string, size: RugFt, signal?: AbortSignal): Promise<Candidate> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ doc: docPathOf(p), photoUrl, roomType, size, fullRug: true }),
      signal,
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new Error('Could not reach the server. Check the connection and try again.');
  }
  let text = '';
  try { text = (await res.text()).trim(); } catch {
    throw new Error('The connection dropped while the room was being made. Try again.');
  }
  let d: { ok?: boolean; message?: string } & Partial<Candidate> = {};
  try { d = JSON.parse(text); } catch {
    throw new Error(res.status === 504 || !text ? 'The server took too long. Try again.' : `The server gave an error (${res.status}).`);
  }
  if (!d.ok || !d.url || !d.path) throw new Error(d.message || `The server gave an error (${res.status}).`);
  return { url: d.url, path: d.path, w: d.w || 0, h: d.h || 0, ms: d.ms || 0, remaining: d.remaining };
}

async function freshList(p: ShowroomProduct): Promise<RoomImage[] | undefined> {
  const snap = await getDoc(refOf(p));
  if (!snap.exists()) throw new Error('That product no longer exists.');
  return parseRoomImages(snap.data()?.roomImages);
}

/** Write only `roomImages` (removed when empty). */
async function write(p: ShowroomProduct, list: RoomImage[]): Promise<ShowroomProduct> {
  await updateDoc(refOf(p), { roomImages: list.length ? list : deleteField() });
  if (!isArchive(p)) invalidateShowroomCache();
  return { ...p, roomImages: list.length ? list : undefined };
}

/** Keep: add the candidate to the record as read now, so a change made meanwhile is not lost. */
export async function keepRoomImage(p: ShowroomProduct, c: { url: string; path: string; roomType: string; size: string; sourceUrl: string }): Promise<ShowroomProduct> {
  const img: RoomImage = { ...c, at: new Date().toISOString(), by: currentUserEmail() || 'studio' };
  return write(p, addRoomImage(await freshList(p), img));
}

/** Remove (soft: the file stays). Returns the record and the list before, for Undo. */
export async function removeRoomImageFrom(p: ShowroomProduct, url: string): Promise<{ product: ShowroomProduct; before: RoomImage[] }> {
  const before = (await freshList(p)) || [];
  return { product: await write(p, removeRoomImage(before, url)), before };
}

export async function restoreRoomImages(p: ShowroomProduct, list: RoomImage[]): Promise<ShowroomProduct> {
  return write(p, list);
}

export async function makeFirstRoom(p: ShowroomProduct, url: string): Promise<ShowroomProduct> {
  return write(p, makeFirstRoomImage(await freshList(p), url));
}

/** The room type she used last, per person, in config/room_prefs_<uid>. Both fail silently. */
export async function lastRoomType(): Promise<string | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  try {
    const d = (await getDoc(doc(db, 'config', `room_prefs_${uid}`))).data();
    return typeof d?.roomType === 'string' ? d.roomType : null;
  } catch {
    return null;
  }
}

export function rememberRoomType(roomType: string): void {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  setDoc(doc(db, 'config', `room_prefs_${uid}`), { roomType, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
}
