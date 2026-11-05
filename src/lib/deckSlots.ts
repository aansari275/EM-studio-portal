/**
 * Where each photo lands on the one-rug-per-slide deck, in inches on the
 * 13.333 x 7.5in widescreen slide. Shared by the deck (pptGenerator.ts) and
 * the slot diagram in the design preview (SlidePreview.tsx), so the picture
 * the studio sees is the slide the buyer gets.
 *
 * The boxes are the house slide from "New Collection offer for Zara.pptx",
 * scaled to this canvas. Do not "improve" their sizes or positions.
 */
export type Box = { x: number; y: number; w: number; h: number };

export const SLIDE_W = 13.333;
export const SLIDE_H = 7.5;

const LEFT_TALL: Box = { x: 0.121, y: 0.273, w: 5.086, h: 7.118 };
const TOP_WIDE: Box = { x: 5.149, y: 0.446, w: 4.861, h: 3.255 };
const BOTTOM_MIDDLE: Box = { x: 5.134, y: 3.921, w: 2.346, h: 3.396 };
const BOTTOM_RIGHT: Box = { x: 8.362, y: 4.016, w: 4.766, h: 3.039 };

/**
 * Photo 1, 2, 3, 4 in that order. To move a number to another slot, reorder
 * this list; nothing else needs to change. Numbering per Abdul's reference
 * slide (5 Nov 2026): 1 left, 2 bottom middle, 3 top, 4 bottom right.
 */
export const PHOTO_SLOTS: Box[] = [LEFT_TALL, BOTTOM_MIDDLE, TOP_WIDE, BOTTOM_RIGHT];

/** What to shoot for each number, shown under the slot diagram. */
export const SLOT_HINTS = ['Full rug', 'Flat detail', 'Angled close-up', 'Corner or edge'];

/** The spec text block and the corner logo, drawn as placeholders. */
export const SPEC_BOX: Box = { x: 10.593, y: 1.223, w: 2.74, h: 1.533 };
export const LOGO_BOX: Box = { x: 11.449, y: 0.25, w: 1.674, h: 0.8 };
