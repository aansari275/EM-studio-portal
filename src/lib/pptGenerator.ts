import pptxgen from 'pptxgenjs';
import { orderedImages } from './img';
import type { ShowroomProduct } from './firebase';

// Brand colors (matching EMPL template)
const COLORS = {
  gray: '808080',
  grayLight: '7F7F7F',
  grayDark: '282828',
  white: 'FFFFFF',
  black: '000000',
  lightGray: 'E1E1E1',
};

// Font settings (Montserrat from template)
const FONTS = {
  main: 'Montserrat',
  light: 'Montserrat Light',
  calibri: 'Calibri',
  dotum: 'Dotum',
};

// Real pixel aspect ratios of the logo files. pptxgenjs does not reliably honour
// sizing:'contain', so every logo box derives its height from these instead of
// hardcoding one that happens to be wrong.
const LOGO_AR = 2498 / 963;   // em-logo-new.png
const ICON_AR = 6300 / 2363;  // em-logo-icon.png

// PPT Assets base. Same-origin in the browser; the server-side generator
// points this at a local directory, because pptxgenjs under Node reads image
// paths off the filesystem rather than fetching them.
let ASSETS_BASE = '/ppt-assets';

/** Used by the Netlify function that builds decks outside the browser. */
export function setAssetsBase(base: string) {
  ASSETS_BASE = base;
}

/**
 * Generate a PowerPoint presentation matching EMPL template
 * Structure: 2 intro slides + product slides + 3 outro slides
 */
/**
 * Assemble the deck. Everything except writing it out, so the browser and the
 * MCP connector share one layout instead of drifting apart.
 */
export function buildPptx(
  products: ShowroomProduct[],
  title: string = 'Eastern Mills'
): pptxgen {
  const pptx = new pptxgen();

  // Set presentation properties
  pptx.author = 'Eastern Mills Studio';
  pptx.title = title;
  pptx.subject = 'Product Catalog';
  pptx.company = 'Eastern Mills';

  // 16:9 widescreen layout (same as template)
  pptx.defineLayout({ name: 'WIDESCREEN', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDESCREEN';

  // Add 2 intro slides
  addIntroSlide1(pptx);
  addIntroSlide2(pptx);

  // Add product slides
  for (const product of products) {
    addProductSlide(pptx, product);
  }

  // Add 3 outro slides (matching template slides 4, 5, 6)
  addOutroSlide1(pptx); // "Old Traditions, Fresh Perspective" with images
  addOutroSlide2(pptx); // Factory views with certifications
  addOutroSlide3(pptx); // Contact Us

  return pptx;
}

export const deckFileName = () =>
  `Eastern_Mills_Gallery_${new Date().toISOString().split('T')[0]}.pptx`;

export async function generateProductPPT(
  products: ShowroomProduct[],
  title: string = 'Eastern Mills'
): Promise<void> {
  await buildPptx(products, title).writeFile({ fileName: deckFileName() });
}

/**
 * Intro Slide 1: NEW Logo + Banner with certifications
 * Uses the new Eastern logo (transparent background)
 */

/**
 * The EM mark, top right, in the same slot the house deck uses on its product
 * slides. Fitted to the slot width and centred in its height, because the
 * current logo is 2.666 wide to 1 and the slot was cut for the old stacked
 * mark at 1.26.
 */
function addCornerLogo(slide: pptxgen.Slide) {
  const w = 1.674;
  const h = w / ICON_AR;
  slide.addImage({
    path: `${ASSETS_BASE}/em-logo-icon.png`,
    x: 11.449,
    y: (1.323 - h) / 2,
    w,
    h,
  });
}

function addIntroSlide1(pptx: pptxgen) {
  const slide = pptx.addSlide();

  // White rounded box for logo area (top left)
  slide.addShape('roundRect', {
    x: 0.62,
    y: 0.59,
    w: 1.2,
    h: 0.96,
    fill: { color: COLORS.white },
  });

  // NEW Logo image (transparent background)
  slide.addImage({
    path: `${ASSETS_BASE}/em-logo-new.png`,
    // House deck slot, scaled: x 1.18 y 1.30, 1.88 x 1.49. The current logo is
    // 2.594 wide to 1, so it is fitted to the slot width and centred in its
    // height instead of being squashed into the old mark's proportions.
    x: 0.619,
    y: 0.682 + (0.782 - 0.987 / LOGO_AR) / 2,
    w: 0.987,
    h: 0.987 / LOGO_AR,
  });

  // "Eastern Mills" text next to logo
  slide.addText('Eastern Mills', {
    x: 1.9,
    y: 0.75,
    w: 7.87,
    h: 0.37,
    fontSize: 19,
    fontFace: FONTS.main,
    color: COLORS.gray,
  });

  // Large white rounded content area for banner
  slide.addShape('roundRect', {
    x: 0.10,
    y: 2.17,
    w: 13.06,
    h: 4.17,
    fill: { color: COLORS.white },
  });

  // Main banner image
  slide.addImage({
    path: `${ASSETS_BASE}/intro-banner.jpg`,
    x: 0.10,
    y: 2.62,
    w: 13.06,
    h: 3.26,
  });
}

/**
 * Intro Slide 2: Factory image with company description
 */
function addIntroSlide2(pptx: pptxgen) {
  const slide = pptx.addSlide();
  addCornerLogo(slide);

  // Factory aerial image
  slide.addImage({
    path: `${ASSETS_BASE}/factory-aerial.png`,
    x: 1.31,
    y: 0.33,
    w: 10.71,
    h: 5.28,
    sizing: { type: 'contain', w: 10.71, h: 5.28 },
  });

  // Company description
  const descriptionText = [
    { text: 'Eastern Mills ', options: { bold: true, fontSize: 13, fontFace: FONTS.calibri, color: COLORS.grayLight } },
    { text: 'is a design driven manufacturing and export company established in 1947 that deals in rugs, carpets and home furnishing products. Our factories are based in Bhadohi and Noida which are located in Eastern India. We create home fashion rooted in the leading trends, while positioning ourselves as a robust manufacturing company with a clear focus on quality.', options: { fontSize: 13, fontFace: FONTS.calibri, color: COLORS.grayLight } },
  ];

  slide.addText(descriptionText, {
    x: 1.64,
    y: 5.73,
    w: 10.06,
    h: 1.67,
    align: 'center',
    valign: 'top',
  });
}

/**
 * Product Slide - With logo ICON on all product slides
 */
function addProductSlide(pptx: pptxgen, product: ShowroomProduct) {
  const slide = pptx.addSlide();

  // Geometry lifted straight from the house deck, "New Collection offer for
  // Zara.pptx". That file is 25.4 x 14.29in, exactly 1.905x this canvas, so
  // every value here is the original multiplied by 13.333/25.4. Its 22.86pt
  // body text lands on exactly 12pt, which is what confirms the deck is a
  // scaled version of a 13.333in design rather than something hand-drawn.
  //
  // Do not "improve" these numbers. The sizes of the primary, second, third
  // and fourth images, the text position and the font size are the house
  // standard and are deliberately unchanged.

  // Hero first. firebaseUrl is a numbered detail frame on ~68% of products, so
  // using it as images[0] put a corner close-up in the big slot.
  const images: string[] = orderedImages(product);

  // === TOP RIGHT: EM logo, on every slide ===
  // The slot in the house deck is 1.674 x 1.323 (the old stacked mark). The
  // current logo is far wider, so it is fitted to the slot's width and centred
  // in its height rather than squashed into the old proportions.
  addCornerLogo(slide);

  // === PRIMARY: tall portrait down the left ===
  if (images[0]) {
    slide.addImage({ path: images[0], x: 0.121, y: 0.273, w: 5.086, h: 7.118,
      sizing: { type: 'contain', w: 5.086, h: 7.118 } });
  } else {
    slide.addShape('rect', { x: 0.121, y: 0.273, w: 5.086, h: 7.118, fill: { color: 'F5F5F5' } });
    slide.addText('No Image', { x: 0.121, y: 3.5, w: 5.086, h: 0.5, fontSize: 16,
      fontFace: FONTS.main, color: COLORS.gray, align: 'center' });
  }

  // === SECOND, THIRD, FOURTH ===
  const rest: Array<{ x: number; y: number; w: number; h: number }> = [
    { x: 5.149, y: 0.446, w: 4.861, h: 3.255 },
    { x: 5.134, y: 3.921, w: 2.346, h: 3.396 },
    { x: 8.362, y: 4.016, w: 4.766, h: 3.039 },
  ];
  rest.forEach((box, i) => {
    const src = images[i + 1];
    if (src) slide.addImage({ path: src, ...box, sizing: { type: 'contain', w: box.w, h: box.h } });
  });

  // === RIGHT: the spec block ===
  // Same four labels and the same dash style as the house deck.
  const style = (product.styleNumber || product.baseStyleNumber || '').trim();
  const lines: string[] = [];
  if (style) lines.push(`STYLE NO. – ${style}`);
  if (product.color) lines.push(`COLOR – ${product.color.toUpperCase()}`);
  if (product.materials) lines.push(`MATERIAL – ${product.materials.toUpperCase()}`);
  if (product.construction) lines.push(`${product.construction.toUpperCase()}`);
  if (product.size) lines.push(`Size- ${product.size}`);
  if (product.gsm) lines.push(`GSM- ${product.gsm}`);

  if (lines.length) {
    slide.addText(lines.join('\n'), {
      x: 10.593,
      y: 1.223,
      w: 2.74,
      h: 1.533,
      fontSize: 12,
      fontFace: FONTS.main,
      color: COLORS.gray,
      valign: 'top',
      lineSpacingMultiple: 1.2,
    });
  }
}

/**
 * Outro Slide 1: "Old Traditions, Fresh Perspective" - Template Slide 4
 * Gray box with text on left, 3 images showing products/factory
 */
function addOutroSlide1(pptx: pptxgen) {
  const slide = pptx.addSlide();
  addCornerLogo(slide);

  // Gray box (top left) with text
  slide.addShape('rect', {
    x: 0.57,
    y: 0.35,
    w: 2.85,
    h: 3.12,
    fill: { color: COLORS.lightGray },
  });

  // "OLD TRADITIONS, FRESH PERSPECTIVE" text
  slide.addText('OLD TRADITIONS, FRESH PERSPECTIVE', {
    x: 0.66,
    y: 1.45,
    w: 2.68,
    h: 0.92,
    fontSize: 20,
    fontFace: FONTS.calibri,
    color: COLORS.grayDark,
    align: 'center',
  });

  // Top right image (large landscape)
  slide.addImage({
    path: `${ASSETS_BASE}/outro-slide4-2.jpg`,
    x: 3.98,
    y: 0.35,
    w: 8.26,
    h: 3.12,
    sizing: { type: 'cover', w: 8.26, h: 3.12 },
  });

  // Bottom left image (weaving/artisan)
  slide.addImage({
    path: `${ASSETS_BASE}/outro-slide4-1.jpg`,
    x: 0.57,
    y: 3.73,
    w: 7.06,
    h: 3.10,
    sizing: { type: 'cover', w: 7.06, h: 3.10 },
  });

  // Bottom right image (product detail)
  slide.addImage({
    path: `${ASSETS_BASE}/outro-slide4-3.jpg`,
    x: 7.99,
    y: 3.73,
    w: 4.25,
    h: 3.12,
    sizing: { type: 'cover', w: 4.25, h: 3.12 },
  });
}

/**
 * Outro Slide 2: Factory Views - Template Slide 5
 * Grid of factory images + certifications badge
 */
function addOutroSlide2(pptx: pptxgen) {
  const slide = pptx.addSlide();

  // Gray box (top left) with "FACTORY VIEWS" text
  slide.addShape('rect', {
    x: 0.48,
    y: 0.12,
    w: 2.80,
    h: 2.25,
    fill: { color: COLORS.lightGray },
  });

  slide.addText('FACTORY VIEWS', {
    x: 0.93,
    y: 0.93,
    w: 1.90,
    h: 0.62,
    fontSize: 8,
    fontFace: FONTS.calibri,
    color: COLORS.grayDark,
    align: 'center',
  });

  // Top middle image (certifications)
  slide.addImage({
    path: `${ASSETS_BASE}/certifications.png`,
    x: 3.90,
    y: 0.12,
    w: 2.80,
    h: 2.25,
    sizing: { type: 'contain', w: 2.80, h: 2.25 },
  });

  // Top right image (factory small)
  slide.addImage({
    path: `${ASSETS_BASE}/factory-small.png`,
    x: 7.32,
    y: 0.12,
    w: 2.80,
    h: 2.25,
    sizing: { type: 'cover', w: 2.80, h: 2.25 },
  });

  // Bottom left - factory badge
  slide.addImage({
    path: `${ASSETS_BASE}/factory-badge.jpg`,
    x: 0.48,
    y: 2.62,
    w: 2.20,
    h: 3.95,
    sizing: { type: 'contain', w: 2.20, h: 3.95 },
  });

  // Bottom center - large factory aerial
  slide.addImage({
    path: `${ASSETS_BASE}/factory-aerial.png`,
    x: 2.95,
    y: 2.62,
    w: 7.17,
    h: 3.95,
    sizing: { type: 'cover', w: 7.17, h: 3.95 },
  });

  // Bottom right - logo horizontal
  slide.addImage({
    path: `${ASSETS_BASE}/em-logo-new.png`,
    x: 10.02,
    y: 5.29 + (1.79 - 2.34 / LOGO_AR) / 2,
    w: 2.34,
    h: 2.34 / LOGO_AR,
  });
}

/**
 * Outro Slide 3: Contact Us - Template Slide 6
 * Contact information with social media icons
 */
function addOutroSlide3(pptx: pptxgen) {
  const slide = pptx.addSlide();

  // CONTACT US header (centered)
  slide.addText('CONTACT US', {
    x: 5.38,
    y: 1.07,
    w: 2.07,
    h: 0.11,
    fontSize: 17,
    fontFace: FONTS.light,
    bold: true,
    color: COLORS.black,
    align: 'center',
  });

  // Divider line under header
  slide.addShape('line', {
    x: 5.55,
    y: 1.43,
    w: 1.73,
    h: 0,
    line: { color: COLORS.black, width: 0.75 },
  });

  // Contact details - Left column
  // OFFICE LOCATION header
  slide.addText('OFFICE LOCATION', {
    x: 3.54,
    y: 2.23,
    w: 2.65,
    h: 0.35,
    fontSize: 16,
    fontFace: FONTS.light,
    bold: true,
    color: COLORS.black,
  });

  // Office address
  slide.addText('E-131, sector 63,\nNoida, India\nPin - 201301', {
    x: 3.54,
    y: 2.70,
    w: 3.0,
    h: 0.92,
    fontSize: 16,
    fontFace: FONTS.light,
    color: COLORS.grayLight,
  });

  // HOUR HOURS header
  slide.addText('OFFICE HOURS', {
    x: 3.54,
    y: 3.75,
    w: 2.0,
    h: 0.35,
    fontSize: 16,
    fontFace: FONTS.light,
    bold: true,
    color: COLORS.black,
  });

  // Hours
  slide.addText('MON-FRI\n9:30 – 17:30', {
    x: 3.54,
    y: 4.20,
    w: 2.5,
    h: 0.63,
    fontSize: 16,
    fontFace: FONTS.light,
    color: COLORS.grayLight,
  });

  // FACTORY LOCATION header
  slide.addText('FACTORY LOCATION', {
    x: 6.90,
    y: 2.23,
    w: 2.82,
    h: 0.43,
    fontSize: 15,
    fontFace: FONTS.light,
    bold: true,
    color: COLORS.black,
  });

  // Factory address
  slide.addText('Rayan, Suriawan Road\nBhadohi, Uttar Pradesh\n221401 INDIA', {
    x: 6.90,
    y: 2.81,
    w: 3.66,
    h: 0.92,
    fontSize: 15,
    fontFace: FONTS.light,
    color: COLORS.grayLight,
  });

  // CONTACT INFO header
  slide.addText('CONTACT INFO', {
    x: 6.90,
    y: 3.75,
    w: 2.24,
    h: 0.35,
    fontSize: 16,
    fontFace: FONTS.light,
    bold: true,
    color: COLORS.black,
  });

  // Website and email
  slide.addText('www.easternmills.com\nwww.easternfoundation.org\n\nInfo@easternmills.com\n+91-120-4313641', {
    x: 6.90,
    y: 4.20,
    w: 3.5,
    h: 1.2,
    fontSize: 16,
    fontFace: FONTS.light,
    color: COLORS.grayLight,
  });

  // Social media icons row
  const iconSize = 0.37;
  const iconY = 6.18;
  const iconGap = 0.50;
  let iconX = 5.25;

  // Twitter (X)
  slide.addShape('ellipse', { x: iconX, y: iconY, w: iconSize, h: iconSize, fill: { color: COLORS.black } });
  slide.addText('X', { x: iconX, y: iconY, w: iconSize, h: iconSize, fontSize: 12, fontFace: FONTS.main, color: COLORS.white, align: 'center', valign: 'middle' });
  iconX += iconGap;

  // Facebook
  slide.addShape('ellipse', { x: iconX, y: iconY, w: iconSize, h: iconSize, fill: { color: COLORS.black } });
  slide.addText('f', { x: iconX, y: iconY, w: iconSize, h: iconSize, fontSize: 14, fontFace: FONTS.main, color: COLORS.white, align: 'center', valign: 'middle' });
  iconX += iconGap;

  // LinkedIn
  slide.addShape('ellipse', { x: iconX, y: iconY, w: iconSize, h: iconSize, fill: { color: COLORS.black } });
  slide.addText('in', { x: iconX, y: iconY, w: iconSize, h: iconSize, fontSize: 10, fontFace: FONTS.main, color: COLORS.white, align: 'center', valign: 'middle' });
  iconX += iconGap;

  // Instagram
  slide.addShape('ellipse', { x: iconX, y: iconY, w: iconSize, h: iconSize, fill: { color: COLORS.black } });
  slide.addText('ig', { x: iconX, y: iconY, w: iconSize, h: iconSize, fontSize: 10, fontFace: FONTS.main, color: COLORS.white, align: 'center', valign: 'middle' });

  // @easternmills handle
  slide.addText('@easternmills', {
    x: 5.88,
    y: 5.75,
    w: 1.40,
    h: 0.31,
    fontSize: 13,
    fontFace: FONTS.dotum,
    color: COLORS.grayLight,
    align: 'center',
  });

  // Logo horizontal in corner
  slide.addImage({
    path: `${ASSETS_BASE}/em-logo-new.png`,
    x: 10.98,
    y: 5.75 + (1.45 - 1.84 / LOGO_AR) / 2,
    w: 1.84,
    h: 1.84 / LOGO_AR,
  });
}
