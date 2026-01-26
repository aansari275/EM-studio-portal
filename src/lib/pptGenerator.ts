import pptxgen from 'pptxgenjs';
import type { ShowroomProduct } from './firebase';

/**
 * Generate a PowerPoint presentation from selected products
 * Each product gets its own slide with image and details
 */
export async function generateProductPPT(
  products: ShowroomProduct[],
  title: string = 'Eastern Mills - Rug Gallery'
): Promise<void> {
  const pptx = new pptxgen();

  // Set presentation properties
  pptx.author = 'Eastern Mills Studio';
  pptx.title = title;
  pptx.subject = 'Product Catalog';
  pptx.company = 'Eastern Mills';

  // Define layout
  pptx.defineLayout({ name: 'CUSTOM', width: 10, height: 7.5 });
  pptx.layout = 'CUSTOM';

  // Add title slide
  const titleSlide = pptx.addSlide();
  titleSlide.addText(title, {
    x: 0.5,
    y: 2.5,
    w: 9,
    h: 1.5,
    fontSize: 36,
    bold: true,
    color: '333333',
    align: 'center',
  });
  titleSlide.addText(`${products.length} Products`, {
    x: 0.5,
    y: 4,
    w: 9,
    h: 0.5,
    fontSize: 18,
    color: '666666',
    align: 'center',
  });
  titleSlide.addText(new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }), {
    x: 0.5,
    y: 4.5,
    w: 9,
    h: 0.5,
    fontSize: 14,
    color: '999999',
    align: 'center',
  });

  // Add product slides
  for (const product of products) {
    const slide = pptx.addSlide();

    // Add product image (left side - 60% width)
    if (product.firebaseUrl) {
      try {
        slide.addImage({
          path: product.firebaseUrl,
          x: 0.3,
          y: 0.5,
          w: 5.5,
          h: 6.5,
          sizing: { type: 'contain', w: 5.5, h: 6.5 },
        });
      } catch (error) {
        // If image fails, add placeholder text
        slide.addText('Image not available', {
          x: 0.3,
          y: 3,
          w: 5.5,
          h: 1,
          fontSize: 14,
          color: '999999',
          align: 'center',
        });
      }
    }

    // Add details panel (right side - 40% width)
    const detailsX = 6;
    const detailsW = 3.7;
    let currentY = 0.5;

    // Product name (title)
    slide.addText(product.displayName || 'Unnamed Product', {
      x: detailsX,
      y: currentY,
      w: detailsW,
      h: 0.8,
      fontSize: 20,
      bold: true,
      color: '333333',
      valign: 'top',
    });
    currentY += 0.9;

    // Details list
    const details: { label: string; value: string }[] = [];

    if (product.baseStyleNumber) {
      details.push({ label: 'Style', value: product.baseStyleNumber });
    }
    if (product.color) {
      details.push({ label: 'Color', value: product.color });
    }
    if (product.construction) {
      details.push({ label: 'Construction', value: product.construction });
    }
    if (product.category) {
      details.push({ label: 'Category', value: product.category });
    }
    if (product.size) {
      details.push({ label: 'Size', value: product.size });
    }
    if (product.materials) {
      details.push({ label: 'Materials', value: product.materials });
    }

    // Add each detail
    for (const detail of details) {
      // Label
      slide.addText(detail.label, {
        x: detailsX,
        y: currentY,
        w: detailsW,
        h: 0.3,
        fontSize: 10,
        color: '999999',
        bold: false,
      });
      currentY += 0.25;

      // Value
      slide.addText(detail.value, {
        x: detailsX,
        y: currentY,
        w: detailsW,
        h: 0.4,
        fontSize: 14,
        color: '333333',
        bold: true,
      });
      currentY += 0.5;
    }

    // Add photo count at bottom
    const photoCount = 1 + (product.additionalImages?.length || 0);
    slide.addText(`${photoCount} photo${photoCount !== 1 ? 's' : ''} available`, {
      x: detailsX,
      y: 6.5,
      w: detailsW,
      h: 0.3,
      fontSize: 10,
      color: '666666',
      italic: true,
    });

    // Add subtle divider line
    slide.addShape('rect', {
      x: 5.8,
      y: 0.5,
      w: 0.02,
      h: 6.5,
      fill: { color: 'EEEEEE' },
    });
  }

  // Save the file
  const fileName = `Eastern_Mills_Gallery_${new Date().toISOString().split('T')[0]}.pptx`;
  await pptx.writeFile({ fileName });
}

/**
 * Generate PPT with progress callback
 */
export async function generateProductPPTWithProgress(
  products: ShowroomProduct[],
  onProgress?: (current: number, total: number) => void,
  title: string = 'Eastern Mills - Rug Gallery'
): Promise<void> {
  const pptx = new pptxgen();

  pptx.author = 'Eastern Mills Studio';
  pptx.title = title;
  pptx.subject = 'Product Catalog';
  pptx.company = 'Eastern Mills';

  pptx.defineLayout({ name: 'CUSTOM', width: 10, height: 7.5 });
  pptx.layout = 'CUSTOM';

  // Title slide
  const titleSlide = pptx.addSlide();
  titleSlide.addText(title, {
    x: 0.5,
    y: 2.5,
    w: 9,
    h: 1.5,
    fontSize: 36,
    bold: true,
    color: '333333',
    align: 'center',
  });
  titleSlide.addText(`${products.length} Products`, {
    x: 0.5,
    y: 4,
    w: 9,
    h: 0.5,
    fontSize: 18,
    color: '666666',
    align: 'center',
  });

  // Process products
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    onProgress?.(i + 1, products.length);

    const slide = pptx.addSlide();

    // Image
    if (product.firebaseUrl) {
      try {
        slide.addImage({
          path: product.firebaseUrl,
          x: 0.3,
          y: 0.5,
          w: 5.5,
          h: 6.5,
          sizing: { type: 'contain', w: 5.5, h: 6.5 },
        });
      } catch {
        slide.addText('Image not available', {
          x: 0.3,
          y: 3,
          w: 5.5,
          h: 1,
          fontSize: 14,
          color: '999999',
          align: 'center',
        });
      }
    }

    // Details
    const detailsX = 6;
    const detailsW = 3.7;
    let currentY = 0.5;

    slide.addText(product.displayName || 'Unnamed Product', {
      x: detailsX,
      y: currentY,
      w: detailsW,
      h: 0.8,
      fontSize: 20,
      bold: true,
      color: '333333',
      valign: 'top',
    });
    currentY += 0.9;

    const details: { label: string; value: string }[] = [];
    if (product.baseStyleNumber) details.push({ label: 'Style', value: product.baseStyleNumber });
    if (product.color) details.push({ label: 'Color', value: product.color });
    if (product.construction) details.push({ label: 'Construction', value: product.construction });
    if (product.category) details.push({ label: 'Category', value: product.category });
    if (product.size) details.push({ label: 'Size', value: product.size });
    if (product.materials) details.push({ label: 'Materials', value: product.materials });

    for (const detail of details) {
      slide.addText(detail.label, {
        x: detailsX,
        y: currentY,
        w: detailsW,
        h: 0.3,
        fontSize: 10,
        color: '999999',
      });
      currentY += 0.25;
      slide.addText(detail.value, {
        x: detailsX,
        y: currentY,
        w: detailsW,
        h: 0.4,
        fontSize: 14,
        color: '333333',
        bold: true,
      });
      currentY += 0.5;
    }

    // Divider
    slide.addShape('rect', {
      x: 5.8,
      y: 0.5,
      w: 0.02,
      h: 6.5,
      fill: { color: 'EEEEEE' },
    });
  }

  const fileName = `Eastern_Mills_Gallery_${new Date().toISOString().split('T')[0]}.pptx`;
  await pptx.writeFile({ fileName });
}
