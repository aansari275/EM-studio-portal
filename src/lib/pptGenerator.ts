import pptxgen from 'pptxgenjs';
import type { ShowroomProduct } from './firebase';

// Brand colors (matching EMPL template)
const COLORS = {
  primary: '2D5A4A',      // Deep green
  secondary: '8B7355',    // Warm brown
  text: '333333',
  textLight: '666666',
  textMuted: '7F7F7F',    // Gray from template
  accent: 'E8DED1',       // Warm beige
  white: 'FFFFFF',
  divider: 'E5E5E5',
  black: '000000',
};

// Font settings (Montserrat Light from template, with fallbacks)
const FONTS = {
  heading: 'Montserrat',
  headingLight: 'Montserrat Light',
  body: 'Calibri',
};

// PPT Assets base URL (deployed on same domain)
const ASSETS_BASE = '/ppt-assets';

/**
 * Generate a beautifully styled PowerPoint presentation
 * With intro slides, product slides, and outro slides
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

  // 16:9 widescreen layout
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
 * Intro Slide 1: Logo + Banner Image with "Making ideas tangible"
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

  // Logo
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
    fontFace: FONTS.heading,
    color: COLORS.textMuted,
  });

  // Large white rounded content area
  slide.addShape('roundRect', {
    x: 0.07,
    y: 1.57,
    w: 9.45,
    h: 3.02,
    fill: { color: COLORS.white },
  });

  // Main banner image
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
 */
function addIntroSlide2(pptx: pptxgen) {
  const slide = pptx.addSlide();

  // Factory aerial image (centered)
  slide.addImage({
    path: `${ASSETS_BASE}/factory-aerial.png`,
    x: 0.95,
    y: 0.24,
    w: 7.75,
    h: 3.83,
    sizing: { type: 'contain', w: 7.75, h: 3.83 },
  });

  // Company description text
  const descriptionText = [
    { text: 'Eastern Mills ', options: { bold: true, fontSize: 13, fontFace: FONTS.body, color: COLORS.textMuted } },
    { text: 'is a design driven manufacturing and export company established in 1947 that deals in rugs, carpets and home furnishing products. Our factories are based in Bhadohi and Noida which are located in Eastern India. We create home fashion rooted in the leading trends, while positioning ourselves as a robust manufacturing company with a clear focus on quality.', options: { fontSize: 13, fontFace: FONTS.body, color: COLORS.textMuted } },
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
    fontFace: FONTS.body,
    color: COLORS.textMuted,
    align: 'center',
  });
}

/**
 * Outro Slide 1: Thank You slide (can be customized)
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
    fontFace: FONTS.heading,
    bold: true,
    color: COLORS.text,
    align: 'center',
  });

  // Tagline
  slide.addText('Making ideas tangible', {
    x: 0.5,
    y: 3.6,
    w: 12.333,
    h: 0.5,
    fontSize: 18,
    fontFace: FONTS.headingLight,
    italic: true,
    color: COLORS.textMuted,
    align: 'center',
  });

  // Divider line
  slide.addShape('rect', {
    x: 5.5,
    y: 4.3,
    w: 2.333,
    h: 0.02,
    fill: { color: COLORS.secondary },
  });

  // Website
  slide.addText('www.easternmills.com', {
    x: 0.5,
    y: 4.6,
    w: 12.333,
    h: 0.4,
    fontSize: 14,
    fontFace: FONTS.body,
    color: COLORS.textMuted,
    align: 'center',
  });
}

/**
 * Outro Slide 2: Factory locations
 */
function addOutroSlide2(pptx: pptxgen) {
  const slide = pptx.addSlide();

  // Title
  slide.addText('Our Facilities', {
    x: 0.5,
    y: 0.5,
    w: 12.333,
    h: 0.6,
    fontSize: 28,
    fontFace: FONTS.heading,
    bold: true,
    color: COLORS.text,
    align: 'center',
  });

  // Factory image
  slide.addImage({
    path: `${ASSETS_BASE}/factory-aerial.png`,
    x: 1.5,
    y: 1.3,
    w: 10.333,
    h: 4,
    sizing: { type: 'contain', w: 10.333, h: 4 },
  });

  // Office Location
  slide.addText('OFFICE LOCATION', {
    x: 1,
    y: 5.5,
    w: 3.5,
    h: 0.3,
    fontSize: 12,
    fontFace: FONTS.headingLight,
    bold: true,
    color: COLORS.black,
  });

  slide.addText('E-131, sector 63,\nNoida, India\nPin - 201301', {
    x: 1,
    y: 5.85,
    w: 3.5,
    h: 0.9,
    fontSize: 11,
    fontFace: FONTS.headingLight,
    color: COLORS.textMuted,
  });

  // Factory Location
  slide.addText('FACTORY LOCATION', {
    x: 5,
    y: 5.5,
    w: 3.5,
    h: 0.3,
    fontSize: 12,
    fontFace: FONTS.headingLight,
    bold: true,
    color: COLORS.black,
  });

  slide.addText('Rayan, Suriawan Road\nBhadohi, Uttar Pradesh\n221401 INDIA', {
    x: 5,
    y: 5.85,
    w: 3.5,
    h: 0.9,
    fontSize: 11,
    fontFace: FONTS.headingLight,
    color: COLORS.textMuted,
  });

  // Hours
  slide.addText('OFFICE HOURS', {
    x: 9,
    y: 5.5,
    w: 3.5,
    h: 0.3,
    fontSize: 12,
    fontFace: FONTS.headingLight,
    bold: true,
    color: COLORS.black,
  });

  slide.addText('MON-FRI\n9:30 – 17:30', {
    x: 9,
    y: 5.85,
    w: 3.5,
    h: 0.6,
    fontSize: 11,
    fontFace: FONTS.headingLight,
    color: COLORS.textMuted,
  });
}

/**
 * Outro Slide 3: Contact Us slide
 */
function addOutroSlide3(pptx: pptxgen) {
  const slide = pptx.addSlide();

  // CONTACT US header
  slide.addText('CONTACT US', {
    x: 0.5,
    y: 0.8,
    w: 12.333,
    h: 0.4,
    fontSize: 13,
    fontFace: FONTS.headingLight,
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

  // Left column - Office Location
  slide.addText('OFFICE LOCATION', {
    x: 2.66,
    y: 1.68,
    w: 2.5,
    h: 0.33,
    fontSize: 12,
    fontFace: FONTS.headingLight,
    bold: true,
    color: COLORS.black,
  });

  slide.addText('E-131, sector 63,\nNoida, India\nPin - 201301', {
    x: 2.66,
    y: 2.12,
    w: 2.5,
    h: 1.1,
    fontSize: 12,
    fontFace: FONTS.headingLight,
    color: COLORS.textMuted,
  });

  // Middle column - Factory Location
  slide.addText('FACTORY LOCATION', {
    x: 5.2,
    y: 1.68,
    w: 2.75,
    h: 0.33,
    fontSize: 12,
    fontFace: FONTS.headingLight,
    bold: true,
    color: COLORS.black,
  });

  slide.addText('Rayan, Suriawan Road\nBhadohi, Uttar Pradesh\n221401 INDIA', {
    x: 5.2,
    y: 2.12,
    w: 2.75,
    h: 1.1,
    fontSize: 12,
    fontFace: FONTS.headingLight,
    color: COLORS.textMuted,
  });

  // Left column - Office Hours
  slide.addText('OFFICE HOURS', {
    x: 2.66,
    y: 3.35,
    w: 2.5,
    h: 0.33,
    fontSize: 12,
    fontFace: FONTS.headingLight,
    bold: true,
    color: COLORS.black,
  });

  slide.addText('MON-FRI\n9:30 – 17:30', {
    x: 2.66,
    y: 3.79,
    w: 2.5,
    h: 0.75,
    fontSize: 12,
    fontFace: FONTS.headingLight,
    color: COLORS.textMuted,
  });

  // Right column - Contact Info
  slide.addText('CONTACT INFO', {
    x: 5.2,
    y: 3.35,
    w: 2.75,
    h: 0.33,
    fontSize: 12,
    fontFace: FONTS.headingLight,
    bold: true,
    color: COLORS.black,
  });

  slide.addText('www.easternmills.com\nwww.easternfoundation.org', {
    x: 5.2,
    y: 3.79,
    w: 2.75,
    h: 0.6,
    fontSize: 12,
    fontFace: FONTS.headingLight,
    color: COLORS.textMuted,
  });

  slide.addText('Info@easternmills.com\n+91-120-4313641', {
    x: 5.2,
    y: 4.45,
    w: 2.75,
    h: 0.6,
    fontSize: 12,
    fontFace: FONTS.headingLight,
    color: COLORS.textMuted,
  });

  // Social media handle
  slide.addText('@easternmills', {
    x: 4.42,
    y: 4.64,
    w: 1.05,
    h: 0.23,
    fontSize: 10,
    fontFace: 'Dotum',
    color: COLORS.textMuted,
  });
}

/**
 * Add product slide with proper image handling
 */
function addProductSlide(pptx: pptxgen, product: ShowroomProduct) {
  const slide = pptx.addSlide();

  // Collect all images
  const images: string[] = [];
  if (product.firebaseUrl) images.push(product.firebaseUrl);
  if (product.additionalImages) {
    images.push(...product.additionalImages.filter(Boolean));
  }

  const hasMultipleImages = images.length > 1;

  // Top accent bar
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: 13.333,
    h: 0.08,
    fill: { color: COLORS.primary },
  });

  if (hasMultipleImages) {
    // Multiple images layout - main image left, thumbnails right
    addMultiImageLayout(slide, images, product);
  } else {
    // Single image layout - image left, details right
    addSingleImageLayout(slide, images[0], product);
  }
}

/**
 * Single image layout - large image on left, details on right
 */
function addSingleImageLayout(slide: pptxgen.Slide, imageUrl: string | undefined, product: ShowroomProduct) {
  // Image area (left 60%)
  if (imageUrl) {
    slide.addImage({
      path: imageUrl,
      x: 0.4,
      y: 0.5,
      w: 7.2,
      h: 6.5,
      sizing: { type: 'contain', w: 7.2, h: 6.5 },
    });
  } else {
    // Placeholder for no image
    slide.addShape('rect', {
      x: 0.4,
      y: 0.5,
      w: 7.2,
      h: 6.5,
      fill: { color: 'F5F5F5' },
    });
    slide.addText('No Image', {
      x: 0.4,
      y: 3.2,
      w: 7.2,
      h: 0.5,
      fontSize: 16,
      fontFace: FONTS.body,
      color: COLORS.textMuted,
      align: 'center',
    });
  }

  // Vertical divider
  slide.addShape('rect', {
    x: 7.9,
    y: 0.8,
    w: 0.015,
    h: 6,
    fill: { color: COLORS.divider },
  });

  // Details area (right 40%)
  addProductDetails(slide, product, 8.3, 4.6);
}

/**
 * Multiple images layout - main image with thumbnails
 */
function addMultiImageLayout(slide: pptxgen.Slide, images: string[], product: ShowroomProduct) {
  const mainImage = images[0];
  const thumbnails = images.slice(1, 4); // Max 3 thumbnails

  // Main image (larger, left side)
  if (mainImage) {
    slide.addImage({
      path: mainImage,
      x: 0.4,
      y: 0.5,
      w: 5.8,
      h: 6.5,
      sizing: { type: 'contain', w: 5.8, h: 6.5 },
    });
  }

  // Thumbnails (stacked vertically next to main image)
  const thumbWidth = 2;
  const thumbHeight = 2;
  const thumbX = 6.4;
  let thumbY = 0.5;

  for (const thumb of thumbnails) {
    slide.addImage({
      path: thumb,
      x: thumbX,
      y: thumbY,
      w: thumbWidth,
      h: thumbHeight,
      sizing: { type: 'contain', w: thumbWidth, h: thumbHeight },
    });
    thumbY += thumbHeight + 0.15;
  }

  // If more than 4 images, show indicator
  if (images.length > 4) {
    slide.addText(`+${images.length - 4} more`, {
      x: thumbX,
      y: thumbY + 0.2,
      w: thumbWidth,
      h: 0.3,
      fontSize: 10,
      fontFace: FONTS.body,
      color: COLORS.textMuted,
      align: 'center',
    });
  }

  // Vertical divider
  slide.addShape('rect', {
    x: 8.7,
    y: 0.8,
    w: 0.015,
    h: 6,
    fill: { color: COLORS.divider },
  });

  // Details area (right side)
  addProductDetails(slide, product, 9.1, 3.8);
}

/**
 * Add product details to slide
 */
function addProductDetails(slide: pptxgen.Slide, product: ShowroomProduct, startX: number, width: number) {
  let currentY = 0.6;

  // Product name (title)
  slide.addText(product.displayName || 'Unnamed Product', {
    x: startX,
    y: currentY,
    w: width,
    h: 0.9,
    fontSize: 22,
    fontFace: FONTS.heading,
    bold: true,
    color: COLORS.text,
    valign: 'top',
    breakLine: true,
  });
  currentY += 1.1;

  // Accent line under title
  slide.addShape('rect', {
    x: startX,
    y: currentY - 0.15,
    w: 1.2,
    h: 0.025,
    fill: { color: COLORS.secondary },
  });
  currentY += 0.2;

  // Details
  const details: { label: string; value: string }[] = [];

  if (product.baseStyleNumber && product.baseStyleNumber !== product.displayName) {
    details.push({ label: 'STYLE', value: product.baseStyleNumber });
  }
  if (product.color) {
    details.push({ label: 'COLOR', value: product.color });
  }
  if (product.construction) {
    details.push({ label: 'CONSTRUCTION', value: product.construction });
  }
  if (product.category) {
    details.push({ label: 'CATEGORY', value: product.category });
  }
  if (product.size) {
    details.push({ label: 'SIZE', value: product.size });
  }
  if (product.materials) {
    details.push({ label: 'MATERIALS', value: product.materials });
  }

  // Add each detail with clean typography
  for (const detail of details) {
    // Label (small, muted, uppercase)
    slide.addText(detail.label, {
      x: startX,
      y: currentY,
      w: width,
      h: 0.25,
      fontSize: 9,
      fontFace: FONTS.body,
      color: COLORS.textMuted,
      charSpacing: 1.5,
    });
    currentY += 0.22;

    // Value (larger, bold)
    slide.addText(detail.value, {
      x: startX,
      y: currentY,
      w: width,
      h: 0.35,
      fontSize: 13,
      fontFace: FONTS.body,
      bold: true,
      color: COLORS.text,
    });
    currentY += 0.55;
  }

  // Photo count at bottom
  const photoCount = 1 + (product.additionalImages?.length || 0);
  if (photoCount > 1) {
    slide.addText(`${photoCount} photos available`, {
      x: startX,
      y: 6.7,
      w: width,
      h: 0.3,
      fontSize: 9,
      fontFace: FONTS.body,
      color: COLORS.textMuted,
      italic: true,
    });
  }

  // Eastern Mills branding at bottom right
  slide.addText('EASTERN MILLS', {
    x: startX,
    y: 7,
    w: width,
    h: 0.25,
    fontSize: 8,
    fontFace: FONTS.heading,
    color: COLORS.divider,
    charSpacing: 2,
  });
}
