import {
  collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc,
  serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import { currentUserEmail, type Actor } from './auth';
import { getSavedCustomers } from './options';
import { patchOnExit } from './exitSave';

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
 *
 * Drafts (22 Nov 2026): a New entry is created as soon as its form has
 * anything in it, with `status: 'draft'`, and autosaved from then on
 * (debounced in the dialog, keepalive REST write on pagehide). Older docs have
 * no `status` and count as saved. Save entry flips it to `'saved'`; Discard
 * sets `deleted: true`. Still one equality filter for the listing.
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
  /** The photo before a cutout or edit, so Undo works after a reload. */
  originalUrl?: string;
  originalPath?: string;
  cut?: boolean;
  /** The file is a cutout of the original, same framing (see Slot.cutOfOriginal). */
  cutOfOriginal?: boolean;
}

export type EntryStatus = 'draft' | 'saved';

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
  createdByUid: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  deleted: boolean;
  status: EntryStatus;
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
    createdByUid: String(d.createdByUid || ''),
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
    updatedBy: String(d.updatedBy || ''),
    deleted: d.deleted === true,
    status: d.status === 'draft' ? 'draft' : 'saved', // no status = saved (before drafts existed)
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

/** One photo into an entry's folder, compressed like the others. For background uploads. */
export async function uploadEntryPhoto(kind: EntryKind, id: string, file: File): Promise<EntryPhoto> {
  const p = await prepare(file);
  const name = `${safeBase(file.name)}.${p.ext}`;
  const path = `${FOLDER[kind]}/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${name}`;
  const sref = ref(storage, path);
  await uploadBytes(sref, p.body, { contentType: p.type });
  return { url: await getDownloadURL(sref), path, name, width: p.width, height: p.height, uploadedAt: new Date().toISOString() };
}

// ─── Writes ─────────────────────────────────────────────────────────────────

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

// ─── Drafts and autosave ────────────────────────────────────────────────────

/** A fresh document id for a new entry, so photos can upload before the draft is written. */
export function newEntryId(kind: EntryKind): string {
  return doc(collection(db, COLLECTION[kind])).id;
}

/** Everything the dialog autosaves. */
export interface EntryFields extends EntryDetails {
  photos: EntryPhoto[];
}

const cleanPhotos = (photos: EntryPhoto[]) =>
  photos.map((p) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as unknown as EntryPhoto);

const draftCreation = (by: Actor) => ({
  status: 'draft' as const,
  deleted: false,
  createdBy: by.email || 'studio',
  createdByUid: by.uid,
});

/**
 * The autosave write. `create` is true until the draft document exists:
 * then the draft fields are written as well. Never changes `status` of an
 * existing entry, so editing a saved entry keeps it saved.
 */
export async function saveEntryFields(kind: EntryKind, id: string, f: EntryFields, by: Actor, create: boolean): Promise<void> {
  const body = {
    customerName: f.customerName.trim(),
    customerCode: f.customerCode || null,
    date: f.date,
    note: f.note,
    photos: cleanPhotos(f.photos),
    updatedAt: serverTimestamp(),
    updatedBy: by.email || 'studio',
    ...(create ? { ...draftCreation(by), createdAt: serverTimestamp() } : {}),
  };
  await setDoc(entryRef(kind, id), body, { merge: true });
}

/** The same write for a page that is closing (keepalive REST). */
export function saveEntryFieldsOnExit(kind: EntryKind, id: string, f: EntryFields, by: Actor, create: boolean): void {
  const now = new Date();
  patchOnExit(`${COLLECTION[kind]}/${id}`, {
    customerName: f.customerName.trim(),
    customerCode: f.customerCode || null,
    date: f.date,
    note: f.note,
    photos: cleanPhotos(f.photos),
    updatedAt: now,
    updatedBy: by.email || 'studio',
    ...(create ? { ...draftCreation(by), createdAt: now } : {}),
  }, !create);
}

/** Save entry: checks it is complete, then flips the draft to saved. */
export async function promoteEntry(kind: EntryKind, id: string, f: EntryFields, by: Actor): Promise<StudioEntry> {
  const d = checkDetails(f);
  if (!f.photos.length) throw new Error('Add at least one photo.');
  await setDoc(entryRef(kind, id), {
    ...d,
    photos: cleanPhotos(f.photos),
    status: 'saved',
    deleted: false,
    updatedAt: serverTimestamp(),
    updatedBy: by.email || 'studio',
  }, { merge: true });
  return (await getEntry(kind, id))!;
}

/** Discard draft: soft, like delete. */
export async function discardDraft(kind: EntryKind, id: string, by: Actor): Promise<void> {
  await setDoc(entryRef(kind, id), {
    deleted: true, deletedAt: serverTimestamp(), deletedBy: by.email || 'studio',
  }, { merge: true });
}
