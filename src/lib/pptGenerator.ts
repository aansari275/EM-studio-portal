import pptxgen from 'pptxgenjs';
import type { ShowroomProduct } from './firebase';

// Brand colors
const COLORS = {
  primary: '2D5A4A',      // Deep green
  secondary: '8B7355',    // Warm brown
  text: '333333',
  textLight: '666666',
  textMuted: '999999',
  accent: 'E8DED1',       // Warm beige
  white: 'FFFFFF',
  divider: 'E5E5E5',
};

// Font settings (Montserrat-style clean sans-serif)
const FONTS = {
  heading: 'Arial',       // Clean sans-serif fallback
  body: 'Arial',
};

/**
 * Generate a beautifully styled PowerPoint presentation
 * Each product gets its own slide with image(s) and details
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

  // Add title slide
  addTitleSlide(pptx, title, products.length);

  // Add product slides
  for (const product of products) {
    addProductSlide(pptx, product);
  }

  // Save the file
  const fileName = `Eastern_Mills_Gallery_${new Date().toISOString().split('T')[0]}.pptx`;
  await pptx.writeFile({ fileName });
}

/**
 * Add elegant title slide
 */
function addTitleSlide(pptx: pptxgen, title: string, productCount: number) {
  const slide = pptx.addSlide();

  // Warm background accent bar at top
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: 13.333,
    h: 0.15,
    fill: { color: COLORS.primary },
  });

  // Main title
  slide.addText(title.toUpperCase(), {
    x: 0.5,
    y: 2.8,
    w: 12.333,
    h: 1,
    fontSize: 44,
    fontFace: FONTS.heading,
    bold: true,
    color: COLORS.text,
    align: 'center',
    charSpacing: 8,
  });

  // Subtitle - Product catalog
  slide.addText('Rug Gallery Collection', {
    x: 0.5,
    y: 3.8,
    w: 12.333,
    h: 0.5,
    fontSize: 18,
    fontFace: FONTS.body,
    color: COLORS.textLight,
    align: 'center',
    charSpacing: 2,
  });

  // Divider line
  slide.addShape('rect', {
    x: 5.5,
    y: 4.5,
    w: 2.333,
    h: 0.02,
    fill: { color: COLORS.secondary },
  });

  // Product count
  slide.addText(`${productCount} Products`, {
    x: 0.5,
    y: 4.8,
    w: 12.333,
    h: 0.4,
    fontSize: 14,
    fontFace: FONTS.body,
    color: COLORS.textMuted,
    align: 'center',
  });

  // Date at bottom
  slide.addText(new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }), {
    x: 0.5,
    y: 6.8,
    w: 12.333,
    h: 0.3,
    fontSize: 11,
    fontFace: FONTS.body,
    color: COLORS.textMuted,
    align: 'center',
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

  // If less than 3 thumbnails, add indicator for more photos
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
