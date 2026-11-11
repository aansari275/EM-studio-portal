import { doc, getDoc, updateDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, invalidateShowroomCache, mapShowroomData, styleSlug, deriveBaseStyle, type ShowroomProduct } from './firebase';
import { currentUserEmail, auth } from './auth';
import { onIdTokenChanged } from 'firebase/auth';
import { orderedImages } from './img';
import { parseSlideLayout, toFrac, isDefaultSlots, type Box, type SlideLayout } from './deckSlots';

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

/**
 * Save a new photo order from the preview (drag or right-click). The first
 * photo becomes the main one. Only the order changes: no photo is added or
 * removed, and the specs are left alone.
 */
export async function reorderPhotos(p: ShowroomProduct, photos: string[]): Promise<ShowroomProduct> {
  const [hero, ...rest] = photos;
  if (isArchive(p)) {
    const r = archiveRef(p);
    const old = (await getDoc(r)).data() as any;
    if (!old) throw new Error('This archive record no longer exists.');
    const byUrl = new Map<string, any>((old.photos || []).map((ph: any) => [ph?.url, ph]));
    await updateDoc(r, {
      photos: photos.map((url) => byUrl.get(url) || { url }),
      heroPinned: true,
      updatedAt: serverTimestamp(),
      updatedBy: currentUserEmail() || 'studio',
    });
    return { ...p, firebaseUrl: hero || '', additionalImages: rest, heroPinned: true };
  }
  const r = showroomRef(p);
  await updateDoc(r, {
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

/**
 * Turns one photo of a design by quarter turns (1 = 90° clockwise) and saves
 * it as a NEW file next to the old one, then points the record at it. The old
 * file stays in Storage, so nothing is lost. Rotating the pixels, rather than
 * storing an angle, means decks, buyer links and the other apps all get the
 * turned photo without knowing anything about it.
 */
export async function rotatePhoto(p: ShowroomProduct, url: string, quarterTurns: number): Promise<ShowroomProduct> {
  const turns = ((quarterTurns % 4) + 4) % 4;
  if (!turns) return p;
  const photos = orderedImages(p);
  const at = photos.indexOf(url);
  if (at < 0) throw new Error('That photo is no longer on this design.');

  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not load the photo to turn it.');
  const bmp = await createImageBitmap(await res.blob());
  // Same ceiling as uploads: nothing downstream needs more than ~2000px.
  const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const side = turns % 2 === 1;
  const canvas = document.createElement('canvas');
  canvas.width = side ? h : w;
  canvas.height = side ? w : h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot turn photos.');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((turns * Math.PI) / 2);
  ctx.drawImage(bmp, -w / 2, -h / 2, w, h);
  bmp.close();
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.92));
  if (!blob) throw new Error('Could not save the turned photo.');

  const folder = (p.id && !p.id.startsWith('em:') ? p.id : '') || styleSlug(p.styleNumber || p.baseStyleNumber || '');
  if (!folder) throw new Error('This design has no style number, so there is nowhere to file the photo.');
  const base = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'photo')
    .split('/').pop()!.replace(/\.[a-z0-9]+$/i, '').replace(/-r\d+$/, '');
  const sref = ref(storage, `products/${folder}/${base}-r${Date.now()}.jpg`);
  await uploadBytes(sref, blob, { contentType: 'image/jpeg' });
  const fresh = await getDownloadURL(sref);

  const next = [...photos];
  next[at] = fresh;
  return reorderPhotos(p, next);
}

/**
 * Save this record's own photo boxes for its deck slide (moved or resized in
 * the preview), or clear them with `null` to go back to the house layout.
 * Only `slideLayout` is written, through the same document the other edits
 * use, so the record's other fields, its updatedAt and the shared template
 * are untouched. Boxes that equal the house layout are stored as no layout.
 */
export async function saveSlideLayout(p: ShowroomProduct, boxes: Box[] | null): Promise<ShowroomProduct> {
  const r = isArchive(p) ? archiveRef(p) : showroomRef(p);
  if (!boxes || isDefaultSlots(boxes)) {
    await updateDoc(r, { slideLayout: deleteField() });
    if (!isArchive(p)) invalidateShowroomCache();
    return { ...p, slideLayout: undefined };
  }
  const layout: SlideLayout = {
    v: 1,
    slots: boxes.map(toFrac),
    updatedAt: new Date().toISOString(),
    updatedBy: currentUserEmail() || 'studio',
  };
  await updateDoc(r, { slideLayout: layout });
  if (!isArchive(p)) invalidateShowroomCache();
  return { ...p, slideLayout: layout };
}

// The signed-in user's ID token, kept current so a write can be sent while
// the page is closing, when there is no time to fetch one.
let idToken = '';
onIdTokenChanged(auth, (u) => {
  if (!u) { idToken = ''; return; }
  u.getIdToken().then((t) => { idToken = t; }).catch(() => {});
});

/**
 * saveSlideLayout for a page that is closing. The Firestore SDK's write is
 * dropped when the page unloads mid-send, so this goes straight to the
 * Firestore REST API with `keepalive`, which the browser finishes after the
 * page is gone. Same document, same single field as saveSlideLayout.
 */
export function saveSlideLayoutOnExit(p: ShowroomProduct, boxes: Box[] | null): SlideLayout | undefined {
  const { apiKey, projectId } = db.app.options;
  const path = isArchive(p) ? `em_products/${p.id.slice(3)}` : `showroom_products/${p.id}`;
  const layout: SlideLayout | undefined = !boxes || isDefaultSlots(boxes) ? undefined : {
    v: 1,
    slots: boxes.map(toFrac),
    updatedAt: new Date().toISOString(),
    updatedBy: currentUserEmail() || 'studio',
  };
  const num = (n: number) => ({ doubleValue: n });
  const body = layout ? {
    fields: {
      slideLayout: {
        mapValue: {
          fields: {
            v: { integerValue: '1' },
            slots: { arrayValue: { values: layout.slots.map((b) => ({ mapValue: { fields: { x: num(b.x), y: num(b.y), w: num(b.w), h: num(b.h) } } })) } },
            updatedAt: { stringValue: layout.updatedAt },
            updatedBy: { stringValue: layout.updatedBy },
          },
        },
      },
    },
  } : { fields: {} }; // slideLayout in the mask but not the body: the field is removed
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`
    + `?updateMask.fieldPaths=slideLayout&currentDocument.exists=true&key=${apiKey}`;
  try {
    void fetch(url, {
      method: 'PATCH',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch {
    /* nothing more can be done while the page closes */
  }
  if (!isArchive(p)) invalidateShowroomCache();
  return layout;
}

/**
 * The latest saved slide layout of each record, read fresh before a deck is
 * built. The selection tray keeps copies from when a rug was ticked, so a
 * layout changed since then would otherwise be missed. A read that fails
 * keeps the copy it has rather than stopping the deck.
 */
export async function withFreshSlideLayouts(products: ShowroomProduct[]): Promise<ShowroomProduct[]> {
  return Promise.all(products.map(async (p) => {
    try {
      const snap = await getDoc(isArchive(p) ? archiveRef(p) : showroomRef(p));
      if (!snap.exists()) return p;
      return { ...p, slideLayout: parseSlideLayout(snap.data()?.slideLayout) };
    } catch {
      return p;
    }
  }));
}
