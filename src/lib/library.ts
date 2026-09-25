import {
  collection, query, where, orderBy, limit as qlimit, getDocs, doc, getDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  getShowroomProducts, searchShowroomProducts, getDesignVariants,
  type ShowroomProduct,
} from './firebase';

/**
 * The library reads two collections.
 *
 * `showroom_products` is one record per style, photographed in the studio at
 * full resolution — but `color`, `materials`, `construction` and `size` are
 * empty on essentially every document, and `category` reads "Area Rug".
 *
 * `em_products` is the PPT archive backfill: one record per style AND colour,
 * carrying the colour, material, GSM, size and real category, plus 7,893
 * styles the showroom set does not have at all.
 *
 * So they are complementary, not competing, and this module unions them.
 * Neither collection is written to — other apps read both.
 */
const EM = 'em_products';

/** Matches the normalisation used when the archive was indexed. */
export function normStyle(s: string): string {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '').replace(/^EM-/, '');
}

/** Trailing number of a style — selection sheets drop the MA/FA/CO infix. */
function serialOf(s: string): string {
  const bits = normStyle(s).split('-').filter((p) => /^\d+$/.test(p));
  return bits.length ? bits[bits.length - 1] : '';
}

function mapEm(id: string, d: any): ShowroomProduct {
  const photos: string[] = (d.photos || []).map((p: any) => p?.url).filter(Boolean);
  const style = d.styleDisplay || `EM-${d.styleKey || d.style || ''}`;
  return {
    id: `em:${id}`,
    baseStyleNumber: style,
    styleNumber: style,
    displayName: d.color ? `${style} · ${d.color}` : style,
    firebaseUrl: photos[0] || '',
    additionalImages: photos.slice(1),
    color: d.color || '',
    materials: d.material || '',
    construction: '',
    category: d.category || '',
    size: d.size || '',
    gsm: d.gsm || '',
    source: 'ppt_archive',
    tags: [],
  };
}

async function runEm(q: any): Promise<ShowroomProduct[]> {
  const snap = await getDocs(q);
  return snap.docs.map((s: any) => mapEm(s.id, s.data()));
}

/**
 * Indexed lookups rather than the download-everything-and-filter approach the
 * showroom search uses — em_products is 21k documents and growing.
 * A style prefix covers "EM-25-MA-9995" and "25-MA"; the serial covers
 * "25-9995" and "9995", which is how the style is usually written down.
 */
export async function searchEmProducts(term: string, n = 150): Promise<ShowroomProduct[]> {
  const t = normStyle(term);
  if (!t) return [];
  const serial = serialOf(term);
  const jobs: Promise<ShowroomProduct[]>[] = [
    runEm(query(collection(db, EM), where('styleKey', '>=', t),
                where('styleKey', '<=', t + ''), qlimit(n))),
  ];
  if (serial) {
    jobs.push(runEm(query(collection(db, EM), where('serial', '==', serial), qlimit(n))));
  }
  const found = (await Promise.all(jobs.map((p) => p.catch(() => [])))).flat();
  const seen = new Set<string>();
  return found.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}

/** Every colourway recorded for one style. */
export async function getEmVariants(styleNumber: string, n = 60): Promise<ShowroomProduct[]> {
  const key = normStyle(styleNumber);
  if (!key) return [];
  return runEm(query(collection(db, EM), where('styleKey', '==', key), qlimit(n)))
    .catch(() => []);
}

/** Keep the showroom record when a style exists in both: its photos are the
 *  full-resolution studio originals, where the archive ones came out of a deck. */
function dedupe(items: ShowroomProduct[]): ShowroomProduct[] {
  const seen = new Set<string>();
  const out: ShowroomProduct[] = [];
  for (const p of items) {
    const key = `${normStyle(p.styleNumber)}|${(p.color || '').toUpperCase().trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

export async function getLibraryProducts(n = 200): Promise<ShowroomProduct[]> {
  const [showroom, em] = await Promise.all([
    getShowroomProducts(n).catch(() => []),
    // Newest season first. Ordering by styleKey instead sorts alphabetically,
    // which floats oddly-named entries ("ZERO BASKET OPTION 03") to the top.
    runEm(query(collection(db, EM), orderBy('year', 'desc'), qlimit(n))).catch(() => []),
  ]);
  return dedupe([...showroom, ...em]);
}

export async function searchLibrary(term: string, n = 300): Promise<ShowroomProduct[]> {
  const [showroom, em] = await Promise.all([
    searchShowroomProducts(term, n).catch(() => []),
    searchEmProducts(term, Math.min(n, 150)).catch(() => []),
  ]);
  return dedupe([...showroom, ...em]);
}

export async function getLibraryVariants(baseStyleNumber: string): Promise<ShowroomProduct[]> {
  const [showroom, em] = await Promise.all([
    getDesignVariants(baseStyleNumber).catch(() => []),
    getEmVariants(baseStyleNumber).catch(() => []),
  ]);
  return dedupe([...showroom, ...em]);
}

/** Union of both collections, precomputed by the backfill tooling. */
export async function getLibraryCount(): Promise<number> {
  try {
    const snap = await getDoc(doc(db, 'config', 'library_stats'));
    const d = snap.data() as any;
    return d?.unionStyles || d?.showroomDocs || 0;
  } catch {
    return 0;
  }
}
