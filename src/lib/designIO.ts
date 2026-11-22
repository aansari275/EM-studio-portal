import type { DesignIO } from './designAppend';
import { freshDesign } from './library';
import { updateProduct, uploadEditPhotos } from './productEdit';

/**
 * The real calls behind Send to Library (existing design): the same upload
 * and save Edit design uses. One shared object, so a test page can swap the
 * write for a stub without touching a real design.
 */
export const designIO: DesignIO = {
  fresh: freshDesign,
  upload: uploadEditPhotos,
  update: updateProduct,
};
