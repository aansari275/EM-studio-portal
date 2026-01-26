import pptxgen from 'pptxgenjs';
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

// PPT Assets base URL (deployed on same domain)
const ASSETS_BASE = '/ppt-assets';

/**
 * Generate a PowerPoint presentation matching EMPL template
 * Structure: 2 intro slides + product slides + 3 outro slides
 */
export async function generateProductPPT(
  products: ShowroomProduct[],
  title: string = 'Eastern Mills'
): Promise<void> {
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

  // Save the file
  const fileName = `Eastern_Mills_Gallery_${new Date().toISOString().split('T')[0]}.pptx`;
  await pptx.writeFile({ fileName });
}

/**
 * Intro Slide 1: NEW Logo + Banner with certifications
 * Uses the new Eastern logo (transparent background)
 */
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
    x: 0.62,
    y: 0.59,
    w: 1.2,
    h: 0.96,
    sizing: { type: 'contain', w: 1.2, h: 0.96 },
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

  // Collect all images
  const images: string[] = [];
  if (product.firebaseUrl) images.push(product.firebaseUrl);
  if (product.additionalImages) {
    images.push(...product.additionalImages.filter(Boolean));
  }

  // === TOP RIGHT: Logo ICON (not full logo) ===
  slide.addShape('rect', {
    x: 11.23,
    y: 0,
    w: 1.91,
    h: 1.21,
    fill: { color: COLORS.white },
  });

  // Logo Icon on product slides
  slide.addImage({
    path: `${ASSETS_BASE}/em-logo-icon.png`,
    x: 11.5,
    y: 0.1,
    w: 1.0,
    h: 1.0,
    sizing: { type: 'contain', w: 1.0, h: 1.0 },
  });

  // === LEFT SIDE: Main product image (full height) ===
  const mainImage = images[0];
  if (mainImage) {
    slide.addImage({
      path: mainImage,
      x: 0.22,
      y: 0.5,
      w: 3.97,
      h: 5.83,
      sizing: { type: 'contain', w: 3.97, h: 5.83 },
    });
  } else {
    // Placeholder if no image
    slide.addShape('rect', {
      x: 0.22,
      y: 0.5,
      w: 3.97,
      h: 5.83,
      fill: { color: 'F5F5F5' },
    });
    slide.addText('No Image', {
      x: 0.22,
      y: 3.2,
      w: 3.97,
      h: 0.5,
      fontSize: 16,
      fontFace: FONTS.main,
      color: COLORS.gray,
      align: 'center',
    });
  }

  // === RIGHT SIDE: Product details TABLE ===
  const tableRows: pptxgen.TableRow[] = [];

  // Product ID row (bold)
  tableRows.push([
    { text: 'Product ID', options: { bold: true, fontSize: 13, fontFace: FONTS.main, color: COLORS.gray } },
    { text: ':', options: { bold: true, fontSize: 13, fontFace: FONTS.main, color: COLORS.gray } },
    { text: product.displayName || product.baseStyleNumber || 'N/A', options: { bold: true, fontSize: 13, fontFace: FONTS.main, color: COLORS.gray } },
  ]);

  // Color
  if (product.color) {
    tableRows.push([
      { text: 'Color', options: { fontSize: 12, fontFace: FONTS.main, color: COLORS.gray } },
      { text: ':', options: { fontSize: 12, fontFace: FONTS.main, color: COLORS.gray } },
      { text: product.color.toUpperCase(), options: { fontSize: 12, fontFace: FONTS.main, color: COLORS.gray } },
    ]);
  }

  // Size
  if (product.size) {
    tableRows.push([
      { text: 'Size', options: { fontSize: 12, fontFace: FONTS.main, color: COLORS.gray } },
      { text: ':', options: { fontSize: 12, fontFace: FONTS.main, color: COLORS.gray } },
      { text: product.size, options: { fontSize: 12, fontFace: FONTS.main, color: COLORS.gray } },
    ]);
  }

  // GSM
  if (product.gsm) {
    tableRows.push([
      { text: 'GSM', options: { fontSize: 12, fontFace: FONTS.main, color: COLORS.gray } },
      { text: ':', options: { fontSize: 12, fontFace: FONTS.main, color: COLORS.gray } },
      { text: product.gsm, options: { fontSize: 12, fontFace: FONTS.main, color: COLORS.gray } },
    ]);
  }

  // Material
  if (product.materials) {
    tableRows.push([
      { text: 'Material', options: { fontSize: 12, fontFace: FONTS.main, color: COLORS.gray } },
      { text: ':', options: { fontSize: 12, fontFace: FONTS.main, color: COLORS.gray } },
      { text: product.materials.toUpperCase(), options: { fontSize: 12, fontFace: FONTS.main, color: COLORS.gray } },
    ]);
  }

  // Construction / Category
  if (product.construction || product.category) {
    tableRows.push([
      { text: 'Category', options: { fontSize: 12, fontFace: FONTS.main, color: COLORS.gray } },
      { text: ':', options: { fontSize: 12, fontFace: FONTS.main, color: COLORS.gray } },
      { text: (product.construction || product.category || '').toUpperCase(), options: { fontSize: 12, fontFace: FONTS.main, color: COLORS.gray } },
    ]);
  }

  // Add table
  slide.addTable(tableRows, {
    x: 8.51,
    y: 1.21,
    w: 4.82,
    colW: [1.71, 0.17, 2.94],
    fontFace: FONTS.main,
    fontSize: 12,
    color: COLORS.gray,
    fill: { color: COLORS.white },
    border: { type: 'none' },
    margin: [0.05, 0.05, 0.05, 0.05],
    valign: 'middle',
  });

  // === THUMBNAILS: Additional images ===
  const thumbnails = images.slice(1, 5);

  if (thumbnails.length > 0) {
    // Portrait detail image (next to main image)
    if (images.length > 1) {
      slide.addImage({
        path: images[1],
        x: 4.74,
        y: 2.63,
        w: 1.5,
        h: 2.1,
        sizing: { type: 'contain', w: 1.5, h: 2.1 },
      });
    }

    // Row of square thumbnails at bottom
    const thumbSize = 1.74;
    const thumbY = 5.06;
    const thumbGap = 0.19;
    let thumbX = 4.74;

    for (let i = 0; i < Math.min(thumbnails.length, 4); i++) {
      slide.addImage({
        path: thumbnails[i],
        x: thumbX,
        y: thumbY,
        w: thumbSize,
        h: thumbSize,
        sizing: { type: 'contain', w: thumbSize, h: thumbSize },
      });
      thumbX += thumbSize + thumbGap;
    }
  }
}

/**
 * Outro Slide 1: "Old Traditions, Fresh Perspective" - Template Slide 4
 * Gray box with text on left, 3 images showing products/factory
 */
function addOutroSlide1(pptx: pptxgen) {
  const slide = pptx.addSlide();

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
    path: `${ASSETS_BASE}/em-logo-horizontal.png`,
    x: 10.02,
    y: 5.29,
    w: 2.34,
    h: 1.79,
    sizing: { type: 'contain', w: 2.34, h: 1.79 },
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
    path: `${ASSETS_BASE}/em-logo-horizontal.png`,
    x: 10.98,
    y: 5.75,
    w: 1.84,
    h: 1.45,
    sizing: { type: 'contain', w: 1.84, h: 1.45 },
  });
}
