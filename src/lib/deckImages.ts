/**
 * Photos for a PPT, sized for a slide rather than for print.
 *
 * The originals in Storage are 3500-4000px and up to 11 MB each. Embedding them
 * as-is made a three-rug test deck 67 MB. Nothing is compressed at upload: the
 * originals stay the archive. Each deck pulls its own copies through Netlify's
 * Image CDN instead, the same one the thumbnails use, at the width the deck
 * needs.
 *
 * Every photo comes back as JPEG data with its real pixel size, so the slide
 * can fit the rug inside its slot without stretching it, and the deck size is
 * known before anything is downloaded.
 */

export type DeckImage = { data: string; w: number; h: number; bytes: number };
export type DeckImages = Map<string, DeckImage>;

/** Pixels per inch of slide, and JPEG quality. */
export type Quality = { ppi: number; q: number };

/**
 * A slide shown full screen at 1920px is 144 pixels per inch. 300 is twice
 * that, so photos stay sharp on a retina screen and when a buyer zooms in.
 * Measured on six rugs with 101 photos: a flat 1600px came to 65 MB.
 */
export const FULL: Quality = { ppi: 300, q: 82 };

/**
 * Steps tried, in order, for an email-friendly deck. The first that lands
 * under the limit wins, so a small deck keeps as much quality as it can.
 * 144 is still a full-screen slide at 1080p, pixel for pixel.
 */
export const EMAIL_STEPS: Quality[] = [
  { ppi: 220, q: 78 },
  { ppi: 180, q: 72 },
  { ppi: 144, q: 68 },
  { ppi: 110, q: 62 },
];

/** A photo and the slot it goes in, in inches. */
export type PhotoSlot = { url: string; w: number; h: number };
type Px = { w: number; h: number; q: number };

const px = (slot: { w: number; h: number }, { ppi, q }: Quality): Px => ({
  w: Math.round(slot.w * ppi),
  h: Math.round(slot.h * ppi),
  q,
});

/** Most mail servers refuse attachments above 25 MB. */
export const EMAIL_LIMIT = 25 * 1024 * 1024;

// fit=contain keeps the whole rug: the photo is scaled to sit inside w x h.
const cdnUrl = (url: string, { w, h, q }: Px) =>
  `/.netlify/images?url=${encodeURIComponent(url)}&w=${w}&h=${h}&fit=contain&fm=jpg&q=${q}`;

/** Resize in the browser. Used in dev, where the CDN endpoint does not exist, and if the CDN fails. */
async function resizeLocally(blob: Blob, { w, h, q }: Px): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, w / bmp.width, h / bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // transparent PNGs would otherwise turn black in JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not resize a photo.'))), 'image/jpeg', q / 100)
  );
}

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Photo fetch failed (${res.status})`);
  return res.blob();
}

async function loadOne(url: string, quality: Px): Promise<DeckImage> {
  let blob: Blob;
  if (import.meta.env.DEV) {
    blob = await resizeLocally(await fetchBlob(url), quality);
  } else {
    try {
      blob = await fetchBlob(cdnUrl(url, quality));
    } catch {
      blob = await resizeLocally(await fetchBlob(url), quality);
    }
  }
  const bmp = await createImageBitmap(blob);
  const { width: w, height: h } = bmp;
  bmp.close();
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  // pptxgenjs wants "image/jpeg;base64,..." without the data: prefix.
  return { data: dataUrl.replace(/^data:/, ''), w, h, bytes: blob.size };
}

/**
 * Fetch every photo, six at a time, each sized for its slot. A photo used in
 * two slots is fetched once, at the larger. A photo that fails (a few stored
 * ".jpg" files are really HTML) is left out and its slot stays empty, rather
 * than failing the whole deck.
 */
export async function loadDeckImages(
  slots: PhotoSlot[],
  quality: Quality,
  onProgress?: (done: number, total: number) => void
): Promise<DeckImages> {
  const biggest = new Map<string, { w: number; h: number }>();
  for (const s of slots) {
    if (!s.url) continue;
    const b = biggest.get(s.url);
    biggest.set(s.url, { w: Math.max(s.w, b?.w || 0), h: Math.max(s.h, b?.h || 0) });
  }
  const unique = [...biggest.keys()];
  const out: DeckImages = new Map();
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < unique.length) {
      const url = unique[next++];
      try {
        out.set(url, await loadOne(url, px(biggest.get(url)!, quality)));
      } catch (e) {
        console.warn('Deck photo skipped', url, e);
      }
      onProgress?.(++done, unique.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, unique.length) }, worker));
  return out;
}
