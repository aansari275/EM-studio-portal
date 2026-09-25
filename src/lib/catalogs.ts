import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs, query, orderBy, limit, deleteDoc } from 'firebase/firestore';
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
}

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
  createdBy?: string
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
  });
  return id;
}

export async function getCatalog(id: string): Promise<Catalog | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;
  const d = snap.data() as Record<string, unknown>;
  return {
    id: snap.id,
    title: (d.title as string) || 'Eastern Mills',
    buyer: (d.buyer as string) || '',
    items: (d.items as CatalogItem[]) || [],
    createdBy: (d.createdBy as string) || undefined,
    createdAt: (d.createdAt as { toDate?: () => Date })?.toDate?.().toISOString(),
  };
}

export async function listCatalogs(max = 50): Promise<Catalog[]> {
  const snap = await getDocs(query(collection(db, COLLECTION), orderBy('createdAt', 'desc'), limit(max)));
  return snap.docs.map((s) => {
    const d = s.data() as Record<string, unknown>;
    return {
      id: s.id,
      title: (d.title as string) || 'Eastern Mills',
      buyer: (d.buyer as string) || '',
      items: (d.items as CatalogItem[]) || [],
      createdBy: (d.createdBy as string) || undefined,
      createdAt: (d.createdAt as { toDate?: () => Date })?.toDate?.().toISOString(),
    };
  });
}

export async function deleteCatalog(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}

export const catalogUrl = (id: string) => `${window.location.origin}/c/${id}`;
