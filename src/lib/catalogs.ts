import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp, increment, Timestamp,
  collection, getDocs, query, orderBy, limit, deleteDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import type { ShowroomProduct } from './firebase';
import { heroImage } from './img';

/**
 * Shareable buyer catalogs.
 *
 * A catalog is a FROZEN COPY of the chosen products, not a list of references.
 * Two reasons: a link you sent in March must not silently change when someone
 * edits a product in June, and a buyer's browser never reads the 9,600-product
 * collection, only this one document.
 */

const COLLECTION = 'catalogs';

export interface CatalogItem {
  styleNumber: string;
  displayName: string;
  image: string;
  construction?: string;
  materials?: string;
  color?: string;
  size?: string;
}

export interface Catalog {
  id: string;
  title: string;
  buyer: string;
  items: CatalogItem[];
  createdAt?: string;
  createdBy?: string;
  /** Times the link was opened, counted once per browser session. */
  views: number;
  lastViewedAt?: string;
  /** After this the buyer sees an expiry notice instead of the rugs. */
  expiresAt?: string;
}

/** Offered when a link is made. 0 means it never expires. */
export const EXPIRY_CHOICES = [
  { days: 0, label: 'Never' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

export const isExpired = (c: Pick<Catalog, 'expiresAt'>, now = Date.now()) =>
  !!c.expiresAt && new Date(c.expiresAt).getTime() <= now;

/** Short, unguessable, no lookalike characters. */
function makeId(len = 7): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function toItem(p: ShowroomProduct): CatalogItem {
  const item: CatalogItem = {
    styleNumber: p.styleNumber || p.baseStyleNumber || '',
    displayName: p.displayName || p.baseStyleNumber || 'Untitled',
    image: heroImage(p),
  };
  // Firestore rejects undefined, so only set what we actually have.
  if (p.construction) item.construction = p.construction;
  if (p.materials) item.materials = p.materials;
  if (p.color) item.color = p.color;
  if (p.size) item.size = p.size;
  return item;
}

export async function createCatalog(
  products: ShowroomProduct[],
  buyer: string,
  createdBy?: string,
  expiresInDays = 0
): Promise<string> {
  const withPhotos = products.filter((p) => heroImage(p));
  if (!withPhotos.length) throw new Error('None of the selected rugs have a photo yet.');

  const id = makeId();
  await setDoc(doc(db, COLLECTION, id), {
    title: 'Eastern Mills',
    buyer: buyer.trim(),
    items: withPhotos.map(toItem),
    createdBy: createdBy || null,
    createdAt: serverTimestamp(),
    // Counted from the browser clock, which is fine for a 7 to 90 day window.
    expiresAt: expiresInDays > 0 ? Timestamp.fromMillis(Date.now() + expiresInDays * 86_400_000) : null,
  });
  return id;
}

const iso = (v: unknown) => (v as { toDate?: () => Date })?.toDate?.().toISOString();

function fromDoc(id: string, d: Record<string, unknown>): Catalog {
  return {
    id,
    title: (d.title as string) || 'Eastern Mills',
    buyer: (d.buyer as string) || '',
    items: (d.items as CatalogItem[]) || [],
    createdBy: (d.createdBy as string) || undefined,
    createdAt: iso(d.createdAt),
    views: typeof d.views === 'number' ? d.views : 0,
    lastViewedAt: iso(d.lastViewedAt),
    expiresAt: iso(d.expiresAt),
  };
}

export async function getCatalog(id: string): Promise<Catalog | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;
  return fromDoc(snap.id, snap.data() as Record<string, unknown>);
}

export async function listCatalogs(max = 50): Promise<Catalog[]> {
  const snap = await getDocs(query(collection(db, COLLECTION), orderBy('createdAt', 'desc'), limit(max)));
  return snap.docs.map((s) => fromDoc(s.id, s.data() as Record<string, unknown>));
}

/**
 * Count one opening of a buyer link. Only a counter and a time are written, no
 * buyer identity. The session flag means a buyer refreshing the page, or
 * flicking back to it, is one view rather than ten.
 */
export async function recordCatalogView(id: string): Promise<void> {
  const flag = `em-catalog-viewed-${id}`;
  try {
    if (sessionStorage.getItem(flag)) return;
    sessionStorage.setItem(flag, '1');
  } catch {
    /* storage blocked: count it anyway, a rare double count beats none */
  }
  await updateDoc(doc(db, COLLECTION, id), { views: increment(1), lastViewedAt: serverTimestamp() });
}

/** "today", "yesterday", "5 days ago", "3 weeks ago", else a date. */
export function relativeDay(isoDate: string, now = Date.now()): string {
  const days = Math.floor((now - new Date(isoDate).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return new Date(isoDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export async function deleteCatalog(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}

export const catalogUrl = (id: string) => `${window.location.origin}/c/${id}`;
