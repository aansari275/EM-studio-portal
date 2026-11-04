import { doc, getDoc, updateDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, invalidateShowroomCache, mapShowroomData, styleSlug, deriveBaseStyle, type ShowroomProduct } from './firebase';
import { currentUserEmail } from './auth';

/**
 * Editing and deleting a design from the library.
 *
 * The library is two collections (see library.ts): `showroom_products`, and
 * the PPT archive `em_products`, whose ids reach the page prefixed `em:`.
 * Both are edited in place on the document the card came from. Neither one
 * renames its document id when the design number changes, because buyer
 * links, decks and other apps point at the id.
 *
 * Delete is soft: the document gets `deletedAt` and the library stops showing
 * it. Nothing is erased, so a wrong click is one field away from undone, and
 * the Firestore rules (deletes locked to an allowlist since 28 Oct 2026) stay
 * as they are. Removed photos are only unlinked; the files stay in Storage.
 */

export interface ProductEdit {
  styleNumber: string;
  construction: string;
  materials: string;
  color: string;
  size: string;
  gsm: string;
  /** Every photo to keep, in order. The first is the main one. */
  photos: string[];
}

const isArchive = (p: ShowroomProduct) => p.id.startsWith('em:');
const archiveRef = (p: ShowroomProduct) => doc(db, 'em_products', p.id.slice(3));
const showroomRef = (p: ShowroomProduct) => doc(db, 'showroom_products', p.id);

/** Upload new photos for a design and return their URLs, in the order given. */
export async function uploadEditPhotos(
  p: ShowroomProduct,
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<string[]> {
  const folder = isArchive(p)
    ? `em-products/${p.id.slice(3)}`
    : `products/${styleSlug(p.styleNumber || p.baseStyleNumber) || p.id}`;
  const urls: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    let body: Blob = file;
    try {
      const imageCompression = (await import('browser-image-compression')).default;
      body = await imageCompression(file, { maxWidthOrHeight: 2000, maxSizeMB: 2, useWebWorker: true });
    } catch {
      /* upload the original rather than fail */
    }
    // A timestamp, not a sequence number, so a re-upload never overwrites a
    // file another record or an old buyer link still points at.
    const sref = ref(storage, `${folder}/edit-${Date.now()}-${i + 1}.${ext}`);
    await uploadBytes(sref, body, { contentType: file.type || 'image/jpeg' });
    urls.push(await getDownloadURL(sref));
    onProgress?.(i + 1, files.length);
  }
  return urls;
}

export async function updateProduct(p: ShowroomProduct, e: ProductEdit): Promise<ShowroomProduct> {
  const styleNumber = e.styleNumber.trim();
  if (!styleNumber) throw new Error('The design number cannot be empty.');
  const t = (v: string) => v.trim();

  if (isArchive(p)) {
    const r = archiveRef(p);
    const old = (await getDoc(r)).data() as any;
    if (!old) throw new Error('This archive record no longer exists.');
    // Keep the stored w/h/path of photos that stay, so nothing else loses them.
    const byUrl = new Map<string, any>((old.photos || []).map((ph: any) => [ph?.url, ph]));
    await updateDoc(r, {
      styleDisplay: styleNumber,
      color: t(e.color),
      material: t(e.materials),
      // em_products keeps the construction in `category`, see mapEm.
      category: t(e.construction),
      size: t(e.size),
      gsm: t(e.gsm),
      photos: e.photos.map((url) => byUrl.get(url) || { url }),
      updatedAt: serverTimestamp(),
      updatedBy: currentUserEmail() || 'studio',
    });
    const [hero, ...rest] = e.photos;
    return {
      ...p,
      styleNumber, baseStyleNumber: styleNumber,
      displayName: e.color.trim() ? `${styleNumber} · ${e.color.trim()}` : styleNumber,
      construction: t(e.construction), materials: t(e.materials), color: t(e.color),
      size: t(e.size), gsm: t(e.gsm),
      firebaseUrl: hero || '', additionalImages: rest,
    };
  }

  const r = showroomRef(p);
  const before = await getDoc(r);
  if (!before.exists()) throw new Error(`No document at showroom_products/${p.id}.`);
  const nameWasNumber = !before.data().displayName || before.data().displayName === before.data().styleNumber;
  const [hero, ...rest] = e.photos;
  await updateDoc(r, {
    styleNumber,
    baseStyleNumber: deriveBaseStyle(styleNumber),
    // A display name that only repeated the number follows it; a real name stays.
    ...(nameWasNumber ? { displayName: styleNumber } : {}),
    construction: t(e.construction),
    materials: t(e.materials),
    color: t(e.color),
    size: t(e.size),
    gsm: t(e.gsm),
    firebaseUrl: hero || '',
    additionalImages: rest,
    // The studio chose this order, so heroImage() must not second-guess it.
    heroPinned: true,
    updatedAt: serverTimestamp(),
    updatedBy: currentUserEmail() || 'studio',
  });
  invalidateShowroomCache();
  const fresh = await getDoc(r);
  return mapShowroomData(fresh.id, fresh.data());
}

export async function deleteProduct(p: ShowroomProduct): Promise<void> {
  await updateDoc(isArchive(p) ? archiveRef(p) : showroomRef(p), {
    deletedAt: serverTimestamp(),
    deletedBy: currentUserEmail() || 'studio',
  });
  invalidateShowroomCache();
}

/** Undo for deleteProduct. */
export async function restoreProduct(p: ShowroomProduct): Promise<void> {
  await updateDoc(isArchive(p) ? archiveRef(p) : showroomRef(p), {
    deletedAt: deleteField(),
    deletedBy: deleteField(),
  });
  invalidateShowroomCache();
}
