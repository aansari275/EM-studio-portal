import type { ShowroomProduct } from './firebase';
import type { ProductEdit } from './productEdit';
import { orderedImages } from './img';

/**
 * Adding photos to an existing design from outside Edit design (Background
 * Removal's Send to). It goes through exactly what Edit design's Save does:
 * `uploadEditPhotos` for the files, then `updateProduct` with the design's
 * own specs unchanged and its photos in `orderedImages()` order with the new
 * ones after. So `heroImage()` picks the same main photo as before, and
 * `heroPinned` is set the same way a Save in Edit design sets it.
 *
 * Pure: the three calls come in as `io`, so the order of operations and the
 * list that is written are unit tested without touching a real design.
 */

export interface DesignIO {
  /** The design as stored now (the search result may be minutes old). */
  fresh: (p: ShowroomProduct) => Promise<ShowroomProduct>;
  upload: (p: ShowroomProduct, files: File[]) => Promise<string[]>;
  update: (p: ShowroomProduct, e: ProductEdit) => Promise<ShowroomProduct>;
}

/** The specs as Edit design starts them, so saving them changes nothing. */
export function specsAsEdited(p: ShowroomProduct): Omit<ProductEdit, 'photos'> {
  return {
    styleNumber: p.styleNumber || p.baseStyleNumber || '',
    construction: p.construction || '',
    color: p.color || '',
    size: p.size || '',
    gsm: p.gsm || '',
    materials: (p.materials || '').split(',').map((m) => m.trim()).filter(Boolean).join(', '),
  };
}

/**
 * Uploads each file on its own (one failure does not stop the rest), then
 * writes the design once with every photo that made it. `onEach` reports
 * each file as it finishes. Nothing is written when no file uploaded.
 */
export async function appendDesignPhotos(
  p: ShowroomProduct,
  files: File[],
  io: DesignIO,
  onEach?: (i: number, error?: string) => void
): Promise<{ product: ShowroomProduct; failed: number[] }> {
  const fresh = await io.fresh(p);
  const urls: string[] = [];
  const failed: number[] = [];
  const ok: number[] = [];
  for (let i = 0; i < files.length; i++) {
    try {
      const [url] = await io.upload(fresh, [files[i]]);
      if (!url) throw new Error('The upload gave no address.');
      urls.push(url);
      ok.push(i);
    } catch (e) {
      failed.push(i);
      onEach?.(i, e instanceof Error ? e.message : 'Upload failed');
    }
  }
  if (!urls.length) return { product: fresh, failed };
  const product = await io.update(fresh, { ...specsAsEdited(fresh), photos: [...orderedImages(fresh), ...urls] });
  ok.forEach((i) => onEach?.(i));
  return { product, failed };
}
