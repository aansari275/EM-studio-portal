import {
  collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, arrayUnion,
  serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import { currentUserEmail } from './auth';
import { getSavedCustomers } from './options';

/**
 * Custom Rugs and Sample Dispatch: photos filed by customer and date.
 *
 * Every Firestore and Storage call for these entries is in this file. They
 * are the studio's own collections; the Orders app's
 * `sample_dispatches_to_buyers` is a different thing and is never touched,
 * and `buyers` is only ever read.
 *
 * Delete is soft (`deleted: true`). Nothing is erased, so the Firestore
 * delete lock is never involved and every photo stays in Storage.
 */

export type EntryKind = 'custom-rug' | 'sample-dispatch';

const COLLECTION: Record<EntryKind, string> = {
  'custom-rug': 'studio_custom_rugs',
  'sample-dispatch': 'studio_sample_dispatches',
};
const FOLDER: Record<EntryKind, string> = {
  'custom-rug': 'studio-portal/custom-rugs',
  'sample-dispatch': 'studio-portal/sample-dispatches',
};

export const KIND_NOUN: Record<EntryKind, string> = { 'custom-rug': 'custom rug', 'sample-dispatch': 'sample dispatch' };

export interface EntryPhoto {
  url: string;
  path: string;
  name: string;
  width: number;
  height: number;
  uploadedAt: string;
}

export interface EntryDetails {
  customerName: string;
  customerCode: string | null;
  /** YYYY-MM-DD */
  date: string;
  note: string;
}

export interface StudioEntry extends EntryDetails {
  id: string;
  kind: EntryKind;
  photos: EntryPhoto[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  deleted: boolean;
}

export interface Customer {
  name: string;
  code: string | null;
}

const who = () => currentUserEmail() || 'studio';
const iso = (v: unknown) => (v instanceof Timestamp ? v.toDate().toISOString() : typeof v === 'string' ? v : '');
const entryRef = (kind: EntryKind, id: string) => doc(db, COLLECTION[kind], id);

function mapEntry(kind: EntryKind, id: string, d: Record<string, unknown>): StudioEntry {
  return {
    id,
    kind,
    customerName: String(d.customerName || ''),
    customerCode: (d.customerCode as string) || null,
    date: String(d.date || ''),
    note: String(d.note || ''),
    photos: Array.isArray(d.photos) ? (d.photos as EntryPhoto[]).filter((p) => p && p.url) : [],
    createdBy: String(d.createdBy || ''),
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
    updatedBy: String(d.updatedBy || ''),
    deleted: d.deleted === true,
  };
}

function checkDetails(d: EntryDetails): EntryDetails {
  const customerName = d.customerName.trim();
  if (!customerName) throw new Error('Choose a customer.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) throw new Error('Choose a date.');
  return { customerName, customerCode: d.customerCode || null, date: d.date, note: d.note.trim() };
}

/** Newest date first, then newest created first. */
export function sortEntries(list: StudioEntry[]): StudioEntry[] {
  return [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export async function listEntries(kind: EntryKind): Promise<StudioEntry[]> {
  // One equality filter only, so no composite index is needed; sorted here.
  const snap = await getDocs(query(collection(db, COLLECTION[kind]), where('deleted', '==', false)));
  return sortEntries(snap.docs.map((d) => mapEntry(kind, d.id, d.data())));
}

export async function getEntry(kind: EntryKind, id: string): Promise<StudioEntry | null> {
  const snap = await getDoc(entryRef(kind, id));
  return snap.exists() ? mapEntry(kind, snap.id, snap.data()) : null;
}

// ─── Photos ─────────────────────────────────────────────────────────────────

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

/**
 * Same compression as library uploads (2000px, 2 MB), with two guards: a PNG
 * must come back as a PNG, or its transparency would be lost, and the stored
 * contentType and extension always describe the bytes actually uploaded.
 */
async function prepare(file: File): Promise<{ body: Blob; type: string; ext: string; width: number; height: number }> {
  const type = file.type || 'image/jpeg';
  let body: Blob = file;
  try {
    const imageCompression = (await import('browser-image-compression')).default;
    const out = await imageCompression(file, { maxWidthOrHeight: 2000, maxSizeMB: 2, useWebWorker: true, fileType: type });
    if (type !== 'image/png' || out.type === 'image/png') body = out;
  } catch {
    /* compression is a nicety; upload the original rather than fail */
  }
  const actual = body.type || type;
  let width = 0, height = 0;
  try {
    const bmp = await createImageBitmap(body);
    width = bmp.width; height = bmp.height;
    bmp.close();
  } catch {
    /* size unknown, still worth keeping the photo */
  }
  return { body, type: actual, ext: EXT[actual] || 'jpg', width, height };
}

const safeBase = (name: string) =>
  (name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'photo').slice(0, 60);

async function uploadPhotos(
  kind: EntryKind,
  id: string,
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<EntryPhoto[]> {
  const out: EntryPhoto[] = [];
  for (let i = 0; i < files.length; i++) {
    const p = await prepare(files[i]);
    const name = `${safeBase(files[i].name)}.${p.ext}`;
    // A time stamp keeps two photos with the same name from overwriting each other.
    const path = `${FOLDER[kind]}/${id}/${Date.now()}-${i}-${name}`;
    const sref = ref(storage, path);
    await uploadBytes(sref, p.body, { contentType: p.type });
    out.push({
      url: await getDownloadURL(sref),
      path, name, width: p.width, height: p.height,
      uploadedAt: new Date().toISOString(),
    });
    onProgress?.(i + 1, files.length);
  }
  return out;
}

// ─── Writes ─────────────────────────────────────────────────────────────────

/**
 * Creates an entry. The photos go up first and the document is written last,
 * so the list never shows an entry whose photos are still missing.
 */
export async function createEntry(
  kind: EntryKind,
  details: EntryDetails,
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<StudioEntry> {
  const d = checkDetails(details);
  if (!files.length) throw new Error('Add at least one photo.');
  const r = doc(collection(db, COLLECTION[kind]));
  const photos = await uploadPhotos(kind, r.id, files, onProgress);
  await setDoc(r, {
    ...d,
    photos,
    createdBy: who(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: who(),
    deleted: false,
  });
  return (await getEntry(kind, r.id))!;
}

export async function updateEntryDetails(kind: EntryKind, id: string, details: EntryDetails): Promise<StudioEntry | null> {
  const d = checkDetails(details);
  await updateDoc(entryRef(kind, id), { ...d, updatedAt: serverTimestamp(), updatedBy: who() });
  return getEntry(kind, id);
}

export async function addEntryPhotos(
  kind: EntryKind,
  id: string,
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<StudioEntry | null> {
  if (!files.length) return getEntry(kind, id);
  const photos = await uploadPhotos(kind, id, files, onProgress);
  await updateDoc(entryRef(kind, id), {
    photos: arrayUnion(...photos),
    updatedAt: serverTimestamp(),
    updatedBy: who(),
  });
  return getEntry(kind, id);
}

/**
 * Sets the entry's photo list, to remove or reorder. A removed photo is only
 * taken off the entry; its file stays in Storage.
 */
export async function setEntryPhotos(kind: EntryKind, id: string, photos: EntryPhoto[]): Promise<StudioEntry | null> {
  if (!photos.length) throw new Error('An entry needs at least one photo. Delete the entry instead.');
  await updateDoc(entryRef(kind, id), { photos, updatedAt: serverTimestamp(), updatedBy: who() });
  return getEntry(kind, id);
}

export async function softDeleteEntry(kind: EntryKind, id: string): Promise<void> {
  await updateDoc(entryRef(kind, id), {
    deleted: true,
    deletedAt: serverTimestamp(),
    deletedBy: who(),
  });
}

export async function restoreEntry(kind: EntryKind, id: string): Promise<void> {
  await updateDoc(entryRef(kind, id), { deleted: false, updatedAt: serverTimestamp(), updatedBy: who() });
}

// ─── Customers ──────────────────────────────────────────────────────────────

/**
 * Active buyers from the Orders app (read only) merged with the names the
 * studio added itself, sorted, one entry per name. A buyer's code wins over
 * a typed-in copy of the same name.
 */
export async function listCustomers(): Promise<Customer[]> {
  const [buyers, saved] = await Promise.all([
    getDocs(collection(db, 'buyers'))
      .then((s) => s.docs.map((d) => d.data()))
      .catch(() => [] as Record<string, unknown>[]),
    getSavedCustomers(),
  ]);
  const byKey = new Map<string, Customer>();
  for (const b of buyers) {
    // Only an explicit isActive: false hides a buyer, so older records without the field still show.
    if (b.isActive === false) continue;
    const name = String(b.name || '').trim();
    if (name) byKey.set(name.toLowerCase(), { name, code: String(b.code || '').trim() || null });
  }
  for (const n of saved) {
    const name = n.trim();
    if (!byKey.has(name.toLowerCase())) byKey.set(name.toLowerCase(), { name, code: null });
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

/** The photo's bytes, for downloads. */
export async function fetchPhoto(p: EntryPhoto): Promise<Blob> {
  const res = await fetch(p.url);
  if (!res.ok) throw new Error(`Could not download ${p.name}.`);
  return res.blob();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 2026-11-21 as 21 Nov 2026. */
export function formatDate(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : d;
}
