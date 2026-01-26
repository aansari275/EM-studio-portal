import pptxgen from 'pptxgenjs';
import type { ShowroomProduct } from './firebase';

// Brand colors (matching EMPL template)
const COLORS = {
  gray: '808080',           // Main text color from template
  grayLight: '7F7F7F',
  white: 'FFFFFF',
  black: '000000',
};

// Font settings (Montserrat from template)
const FONTS = {
  main: 'Montserrat',
  body: 'Montserrat Light',
  calibri: 'Calibri',
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

  // Add 3 outro slides
  addOutroSlide1(pptx);
  addOutroSlide2(pptx);
  addOutroSlide3(pptx);

  // Save the file
  const fileName = `Eastern_Mills_Gallery_${new Date().toISOString().split('T')[0]}.pptx`;
  await pptx.writeFile({ fileName });
}

/**
 * Intro Slide 1: Logo + Banner with certifications
 * Matches template slide 1
 */
function addIntroSlide1(pptx: pptxgen) {
  const slide = pptx.addSlide();

  // White rounded box for logo area (top left)
  slide.addShape('roundRect', {
    x: 0.45,
    y: 0.43,
    w: 0.71,
    h: 0.69,
    fill: { color: COLORS.white },
  });

  // Logo image
  slide.addImage({
    path: `${ASSETS_BASE}/em-logo.jpeg`,
    x: 0.45,
    y: 0.49,
    w: 0.71,
    h: 0.56,
  });

  // "Eastern Mills" text next to logo
  slide.addText('Eastern Mills', {
    x: 1.2,
    y: 0.47,
    w: 5.7,
    h: 0.27,
    fontSize: 19,
    fontFace: FONTS.main,
    color: COLORS.gray,
  });

  // Large white rounded content area for banner
  slide.addShape('roundRect', {
    x: 0.07,
    y: 1.57,
    w: 9.45,
    h: 3.02,
    fill: { color: COLORS.white },
  });

  // Main banner image (full width of content area)
  slide.addImage({
    path: `${ASSETS_BASE}/intro-banner.jpg`,
    x: 0.07,
    y: 1.9,
    w: 9.45,
    h: 2.36,
  });
}

/**
 * Intro Slide 2: Factory image with company description
 * Matches template slide 2
 */
function addIntroSlide2(pptx: pptxgen) {
  const slide = pptx.addSlide();

  // Factory aerial image (centered, large)
  slide.addImage({
    path: `${ASSETS_BASE}/factory-aerial.png`,
    x: 0.95,
    y: 0.24,
    w: 7.75,
    h: 3.83,
    sizing: { type: 'contain', w: 7.75, h: 3.83 },
  });

  // Company description - "Eastern Mills" bold, rest regular
  const descriptionText = [
    { text: 'Eastern Mills ', options: { bold: true, fontSize: 13, fontFace: FONTS.calibri, color: COLORS.grayLight } },
    { text: 'is a design driven manufacturing and export company established in 1947 that deals in rugs, carpets and home furnishing products. Our factories are based in Bhadohi and Noida which are located in Eastern India. We create home fashion rooted in the leading trends, while positioning ourselves as a robust manufacturing company with a clear focus on quality.', options: { fontSize: 13, fontFace: FONTS.calibri, color: COLORS.grayLight } },
  ];

  slide.addText(descriptionText, {
    x: 1.18,
    y: 4.15,
    w: 7.28,
    h: 1.21,
    align: 'center',
    valign: 'top',
  });

  // Website URL
  slide.addText('www.easternmills.com', {
    x: 1.18,
    y: 5.5,
    w: 7.28,
    h: 0.3,
    fontSize: 11,
    fontFace: FONTS.calibri,
    color: COLORS.grayLight,
    align: 'center',
  });
}

/**
 * Product Slide - Matches template layout (full 13.333" width):
 * - Large main image on LEFT (full height ~6")
 * - Logo top-right corner
 * - TABLE with product details on right
 * - Thumbnail images in a ROW at bottom-right
 */
function addProductSlide(pptx: pptxgen, product: ShowroomProduct) {
  const slide = pptx.addSlide();

  // Collect all images
  const images: string[] = [];
  if (product.firebaseUrl) images.push(product.firebaseUrl);
  if (product.additionalImages) {
    images.push(...product.additionalImages.filter(Boolean));
  }

  // === TOP RIGHT: Logo area (white box + logo) - positioned at ~11.23" ===
  slide.addShape('rect', {
    x: 11.23,
    y: 0,
    w: 1.91,
    h: 1.21,
    fill: { color: COLORS.white },
  });

  slide.addImage({
    path: `${ASSETS_BASE}/em-logo.jpeg`,
    x: 11.44,
    y: 0,
    w: 1.67,
    h: 1.21,
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

  // Add table - positioned at right side of slide (~8.51" like template)
  slide.addTable(tableRows, {
    x: 8.51,
    y: 1.21,
    w: 4.74,
    colW: [1.71, 0.17, 2.86],
    fontFace: FONTS.main,
    fontSize: 12,
    color: COLORS.gray,
    fill: { color: COLORS.white },
    border: { type: 'none' },
    margin: [0.05, 0.05, 0.05, 0.05],
    valign: 'middle',
  });

  // === THUMBNAILS: Additional images ===
  const thumbnails = images.slice(1, 5); // Up to 4 additional thumbnails

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

    // Row of square thumbnails at bottom (spanning to right edge)
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
 * Outro Slide 1: Thank You slide
 */
function addOutroSlide1(pptx: pptxgen) {
  const slide = pptx.addSlide();

  // Thank you message
  slide.addText('Thank You', {
    x: 0.5,
    y: 2.5,
    w: 12.333,
    h: 1,
    fontSize: 48,
    fontFace: FONTS.main,
    bold: true,
    color: COLORS.black,
    align: 'center',
  });

  // Tagline
  slide.addText('Making ideas tangible', {
    x: 0.5,
    y: 3.6,
    w: 12.333,
    h: 0.5,
    fontSize: 18,
    fontFace: FONTS.body,
    italic: true,
    color: COLORS.gray,
    align: 'center',
  });

  // Divider line
  slide.addShape('rect', {
    x: 5.5,
    y: 4.3,
    w: 2.333,
    h: 0.015,
    fill: { color: COLORS.black },
  });

  // Website
  slide.addText('www.easternmills.com', {
    x: 0.5,
    y: 4.6,
    w: 12.333,
    h: 0.4,
    fontSize: 14,
    fontFace: FONTS.body,
    color: COLORS.gray,
    align: 'center',
  });
}

/**
 * Outro Slide 2: Our Facilities with factory image
 */
function addOutroSlide2(pptx: pptxgen) {
  const slide = pptx.addSlide();

  // Title
  slide.addText('Our Facilities', {
    x: 0.5,
    y: 0.4,
    w: 12.333,
    h: 0.5,
    fontSize: 24,
    fontFace: FONTS.main,
    bold: true,
    color: COLORS.black,
    align: 'center',
  });

  // Factory image (large, centered)
  slide.addImage({
    path: `${ASSETS_BASE}/factory-aerial.png`,
    x: 1.5,
    y: 1.1,
    w: 10.333,
    h: 4,
    sizing: { type: 'contain', w: 10.333, h: 4 },
  });

  // Bottom info row using table for alignment
  const infoRows: pptxgen.TableRow[] = [
    [
      { text: 'OFFICE LOCATION', options: { bold: true, fontSize: 10, fontFace: FONTS.body, color: COLORS.black } },
      { text: 'FACTORY LOCATION', options: { bold: true, fontSize: 10, fontFace: FONTS.body, color: COLORS.black } },
      { text: 'OFFICE HOURS', options: { bold: true, fontSize: 10, fontFace: FONTS.body, color: COLORS.black } },
    ],
    [
      { text: 'E-131, Sector 63,\nNoida, India\nPin - 201301', options: { fontSize: 10, fontFace: FONTS.body, color: COLORS.gray } },
      { text: 'Rayan, Suriawan Road\nBhadohi, Uttar Pradesh\n221401 INDIA', options: { fontSize: 10, fontFace: FONTS.body, color: COLORS.gray } },
      { text: 'MON-FRI\n9:30 – 17:30', options: { fontSize: 10, fontFace: FONTS.body, color: COLORS.gray } },
    ],
  ];

  slide.addTable(infoRows, {
    x: 1,
    y: 5.3,
    w: 11.333,
    colW: [3.78, 3.78, 3.78],
    border: { type: 'none' },
    fill: { color: COLORS.white },
    margin: [0.05, 0.1, 0.05, 0.1],
  });
}

/**
 * Outro Slide 3: Contact Us with social icons
 * Matches template slide 6
 */
function addOutroSlide3(pptx: pptxgen) {
  const slide = pptx.addSlide();

  // CONTACT US header (centered)
  slide.addText('CONTACT US', {
    x: 4.05,
    y: 0.81,
    w: 1.56,
    h: 0.08,
    fontSize: 13,
    fontFace: FONTS.body,
    bold: true,
    color: COLORS.black,
    align: 'center',
  });

  // Divider line under header
  slide.addShape('line', {
    x: 4.18,
    y: 1.08,
    w: 1.3,
    h: 0,
    line: { color: COLORS.black, width: 0.75 },
  });

  // Factory image (right side)
  slide.addImage({
    path: `${ASSETS_BASE}/factory-small.png`,
    x: 8.27,
    y: 4.33,
    w: 1.38,
    h: 1.1,
  });

  // Contact details table (2 columns x multiple rows)
  const contactTable: pptxgen.TableRow[] = [
    // Headers
    [
      { text: 'OFFICE LOCATION', options: { bold: true, fontSize: 12, fontFace: FONTS.body, color: COLORS.black } },
      { text: 'FACTORY LOCATION', options: { bold: true, fontSize: 12, fontFace: FONTS.body, color: COLORS.black } },
    ],
    // Values
    [
      { text: 'E-131, Sector 63,\nNoida, India\nPin - 201301', options: { fontSize: 12, fontFace: FONTS.body, color: COLORS.gray } },
      { text: 'Rayan, Suriawan Road\nBhadohi, Uttar Pradesh\n221401 INDIA', options: { fontSize: 12, fontFace: FONTS.body, color: COLORS.gray } },
    ],
  ];

  slide.addTable(contactTable, {
    x: 2.66,
    y: 1.68,
    w: 5.29,
    colW: [2.54, 2.75],
    border: { type: 'none' },
    margin: [0.02, 0.02, 0.02, 0.02],
  });

  // Second row of contact info
  const contactTable2: pptxgen.TableRow[] = [
    [
      { text: 'OFFICE HOURS', options: { bold: true, fontSize: 12, fontFace: FONTS.body, color: COLORS.black } },
      { text: 'CONTACT INFO', options: { bold: true, fontSize: 12, fontFace: FONTS.body, color: COLORS.black } },
    ],
    [
      { text: 'MON-FRI\n9:30 – 17:30', options: { fontSize: 12, fontFace: FONTS.body, color: COLORS.gray } },
      { text: 'www.easternmills.com\nwww.easternfoundation.org\n\nInfo@easternmills.com\n+91-120-4313641', options: { fontSize: 12, fontFace: FONTS.body, color: COLORS.gray } },
    ],
  ];

  slide.addTable(contactTable2, {
    x: 2.66,
    y: 3.35,
    w: 5.29,
    colW: [2.54, 2.75],
    border: { type: 'none' },
    margin: [0.02, 0.02, 0.02, 0.02],
  });

  // Social media icons row (circles with letters as placeholder)
  // Twitter
  slide.addShape('ellipse', {
    x: 3.95,
    y: 4.66,
    w: 0.35,
    h: 0.35,
    fill: { color: COLORS.black },
  });
  slide.addText('X', {
    x: 3.95,
    y: 4.66,
    w: 0.35,
    h: 0.35,
    fontSize: 12,
    fontFace: FONTS.main,
    color: COLORS.white,
    align: 'center',
    valign: 'middle',
  });

  // Facebook
  slide.addShape('ellipse', {
    x: 4.42,
    y: 4.66,
    w: 0.35,
    h: 0.35,
    fill: { color: COLORS.black },
  });
  slide.addText('f', {
    x: 4.42,
    y: 4.66,
    w: 0.35,
    h: 0.35,
    fontSize: 14,
    fontFace: FONTS.main,
    color: COLORS.white,
    align: 'center',
    valign: 'middle',
  });

  // LinkedIn
  slide.addShape('ellipse', {
    x: 4.89,
    y: 4.66,
    w: 0.35,
    h: 0.35,
    fill: { color: COLORS.black },
  });
  slide.addText('in', {
    x: 4.89,
    y: 4.66,
    w: 0.35,
    h: 0.35,
    fontSize: 10,
    fontFace: FONTS.main,
    color: COLORS.white,
    align: 'center',
    valign: 'middle',
  });

  // Instagram
  slide.addShape('ellipse', {
    x: 5.36,
    y: 4.66,
    w: 0.35,
    h: 0.35,
    fill: { color: COLORS.black },
  });
  slide.addText('ig', {
    x: 5.36,
    y: 4.66,
    w: 0.35,
    h: 0.35,
    fontSize: 10,
    fontFace: FONTS.main,
    color: COLORS.white,
    align: 'center',
    valign: 'middle',
  });

  // @easternmills handle
  slide.addText('@easternmills', {
    x: 3.95,
    y: 5.1,
    w: 1.76,
    h: 0.23,
    fontSize: 10,
    fontFace: 'Dotum',
    color: COLORS.gray,
    align: 'center',
  });
}
// Build trigger 1769426403
