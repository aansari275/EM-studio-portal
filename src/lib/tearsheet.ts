/**
 * One page A4 tearsheet for a Library product, built in the browser.
 *
 * jsPDF (already a dependency, MIT) is imported lazily, so it stays out of the
 * main chunk; this module itself is only reached through a dynamic import from
 * TearsheetButton. Type is the PDF standard Times (serif, like the app's
 * font-serif headings) and Helvetica for the small labels: nothing to embed,
 * nothing to license.
 *
 * Photos come through the same Image CDN path as the decks (deckImages.ts):
 * sized for the page, JPEG, PNG cutouts flattened on white, and a photo that
 * fails is simply left off. Layout maths in tearsheetLayout.ts.
 *
 * No price, costing or profit field is read here.
 */
import type { jsPDF as JsPdf } from 'jspdf';
import type { ShowroomProduct } from './firebase';
import { orderedImages } from './img';
import { firstRoomImage, type RoomImage } from './roomImages';
import { loadDeckImages, type DeckImage } from './deckImages';
import {
  MARGIN, CONTENT_W, LOGO, HEADER_RULE_Y, FOOTER_RULE_Y, PDF_PPI, PDF_JPEG_Q,
  HERO_FETCH_IN, PHOTO_FETCH_IN, planTearsheet, tearsheetSpec, tearsheetFileName, pdfText,
  type Box, type SpecRow,
} from './tearsheetLayout';

/** The house deck's company line (pptGenerator.ts, outro slide), word for word. */
const COMPANY_LINE =
  'Eastern Mills is a design driven manufacturing and export company established in 1947 that deals in rugs, carpets and home furnishing products. Our factories are based in Bhadohi and Noida which are located in Eastern India. We create home fashion rooted in the leading trends, while positioning ourselves as a robust manufacturing company with a clear focus on quality.';
const WEBSITE = 'www.easternmills.com';

const INK: [number, number, number] = [31, 30, 28];
const SOFT: [number, number, number] = [128, 124, 118];
const RULE: [number, number, number] = [214, 209, 201];

const PT = 25.4 / 72; // mm per point

type Product = ShowroomProduct & { roomImages?: RoomImage[] | null };

/**
 * The canonical wordmark (em-logo-new.png, transparent) at 1200px: the source
 * is 2498px, far more than a 46mm logo needs. Transparency is kept, so there
 * is no off-white box round it on the page.
 */
async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch('/ppt-assets/em-logo-new.png');
    if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob());
    const w = 1200;
    const h = Math.round((w * bmp.height) / bmp.width);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    return c.toDataURL('image/png');
  } catch {
    return null;
  }
}

/** Text block: kicker, title, spec. Measures (draw = false) or draws, and returns its height. */
function textBlock(doc: JsPdf, style: string, spec: SpecRow[], box: Box, draw: boolean): number {
  let y = box.y;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setCharSpace(0.7);
  doc.setTextColor(...SOFT);
  if (draw) doc.text('STYLE NO.', box.x, y + 6.5 * PT * 0.8);
  y += 6.5 * PT + 3;
  doc.setCharSpace(0);

  // The biggest size at which the style number (one word, it never wraps) fits.
  doc.setFont('times', 'normal');
  let size = 28;
  for (const s of [28, 25, 22, 19, 16, 14]) {
    size = s;
    doc.setFontSize(s);
    if (doc.getTextWidth(style) <= box.w) break;
  }
  const titleLines: string[] = doc.splitTextToSize(style, box.w);
  doc.setTextColor(...INK);
  for (const line of titleLines) {
    if (draw) doc.text(line, box.x, y + size * PT * 0.78);
    y += size * PT * 1.12;
  }
  y += 7;

  for (const row of spec) {
    if (draw) {
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.15);
      doc.line(box.x, y, box.x + box.w, y);
    }
    y += 3.2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    doc.setCharSpace(0.6);
    doc.setTextColor(...SOFT);
    if (draw) doc.text(row.label.toUpperCase(), box.x, y + 6.2 * PT * 0.8);
    y += 6.2 * PT + 1.6;
    doc.setCharSpace(0);
    doc.setFont('times', 'normal');
    doc.setFontSize(11.5);
    doc.setTextColor(...INK);
    const lines: string[] = doc.splitTextToSize(row.value, box.w);
    for (const line of lines) {
      if (draw) doc.text(line, box.x, y + 11.5 * PT * 0.8);
      y += 11.5 * PT * 1.25;
    }
    y += 2.4;
  }
  return y - box.y;
}

function footer(doc: JsPdf) {
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, FOOTER_RULE_Y, MARGIN + CONTENT_W, FOOTER_RULE_Y);
  const y = FOOTER_RULE_Y + 5.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setCharSpace(1.4);
  doc.setTextColor(...INK);
  doc.text('EASTERN MILLS', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.setCharSpace(0);
  doc.setTextColor(...SOFT);
  // jsPDF's right align ignores character spacing, so the site is set without it.
  doc.text(WEBSITE, MARGIN + CONTENT_W, y, { align: 'right' });
  doc.setFont('times', 'italic');
  doc.setFontSize(8);
  const lines: string[] = doc.splitTextToSize(COMPANY_LINE, CONTENT_W);
  doc.text(lines, MARGIN, y + 5.5, { lineHeightFactor: 1.35 });
}

function placeImage(doc: JsPdf, img: DeckImage, box: Box) {
  doc.addImage(`data:${img.data}`, 'JPEG', box.x, box.y, box.w, box.h, undefined, 'NONE');
}

export interface Tearsheet { blob: Blob; fileName: string; heroIsRoom: boolean; photos: number }

export async function buildTearsheet(product: Product): Promise<Tearsheet> {
  const room = firstRoomImage(product)?.url || '';
  const rugs = orderedImages(product);
  const candidates = [...new Set([room, ...rugs].filter(Boolean))].slice(0, 4);

  const [{ jsPDF }, logo, images] = await Promise.all([
    import('jspdf'),
    loadLogo(),
    loadDeckImages(
      candidates.map((url, i) => ({ url, ...(i < (room ? 2 : 1) ? HERO_FETCH_IN : PHOTO_FETCH_IN) })),
      { ppi: PDF_PPI, q: PDF_JPEG_Q },
    ),
  ]);

  // First photo that loaded is the hero (room setting if there is one), the next two follow.
  const loaded = candidates.filter((u) => images.has(u));
  const [heroUrl, ...rest] = loaded;
  const extraUrls = rest.slice(0, 2);
  const hero = heroUrl ? images.get(heroUrl)! : null;
  const extras = extraUrls.map((u) => images.get(u)!);

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const style = pdfText(product.styleNumber || product.baseStyleNumber || product.displayName || '');
  const spec = tearsheetSpec(product).map((r) => ({ label: r.label, value: pdfText(r.value) })).filter((r) => r.value);
  doc.setProperties({ title: `Eastern Mills ${style}`, author: 'Eastern Mills', creator: 'Eastern Studio' });

  // Measure the text at the width it gets, then lay out again with its real height.
  const sizes = extras.map((e) => ({ w: e.w, h: e.h }));
  const heroSize = hero ? { w: hero.w, h: hero.h } : null;
  // The text column's width depends on the hero, and the layout on the text's
  // height, so settle it in a few rounds; the height only grows after the first.
  let plan = planTearsheet(heroSize, sizes, 60);
  let textH = textBlock(doc, style, spec, plan.text, false);
  for (let i = 0; i < 4; i++) {
    plan = planTearsheet(heroSize, sizes, textH);
    const h = textBlock(doc, style, spec, plan.text, false);
    if (h <= textH + 0.01) break;
    textH = h;
  }

  if (logo) doc.addImage(logo, 'PNG', LOGO.x, LOGO.y, LOGO.w, LOGO.h, undefined, 'FAST');
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, HEADER_RULE_Y, MARGIN + CONTENT_W, HEADER_RULE_Y);

  if (hero && plan.hero) placeImage(doc, hero, plan.hero);
  plan.photos.forEach((box, i) => placeImage(doc, extras[i], box));
  textBlock(doc, style, spec, plan.text, true);
  footer(doc);

  return {
    blob: doc.output('blob'),
    fileName: tearsheetFileName(product.styleNumber || product.baseStyleNumber),
    heroIsRoom: !!room && heroUrl === room,
    photos: (plan.hero ? 1 : 0) + plan.photos.length,
  };
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
