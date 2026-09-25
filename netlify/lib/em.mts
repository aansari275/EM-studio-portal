import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore, collection, query, where, orderBy, limit as qlimit, getDocs,
} from 'firebase/firestore';

/**
 * Firestore access for the MCP endpoint.
 *
 * Uses the public web config rather than a service account. The same values
 * already ship in the browser bundle, so nothing secret lives here, and the
 * collections this reads are world-readable under the project's current rules.
 * If those rules are ever tightened, this needs a service account instead.
 */
const config = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyBSnzCBh-nhQs2nNuPpV_xpRp29FyUyHuc',
  authDomain: 'easternmillscom.firebaseapp.com',
  projectId: 'easternmillscom',
  storageBucket: 'easternmillscom.firebasestorage.app',
};

export const db = () =>
  getFirestore(getApps().length ? getApps()[0] : initializeApp(config));

/** Same normalisation the archive was indexed with. */
export function normStyle(s: string): string {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '').replace(/^EM-/, '');
}

/** Trailing number — selection sheets drop the MA/FA/CO infix. */
export function serialOf(s: string): string {
  const bits = normStyle(s).split('-').filter((p) => /^\d+$/.test(p));
  return bits.length ? bits[bits.length - 1] : '';
}

export interface Product {
  style: string;
  color: string;
  material: string;
  size: string;
  gsm: string;
  category: string;
  images: string[];
  source: 'archive' | 'showroom';
}

const fromEm = (d: any): Product => ({
  style: d.styleDisplay || `EM-${d.styleKey || ''}`,
  color: d.color || '',
  material: d.material || '',
  size: d.size || '',
  gsm: d.gsm || '',
  category: d.category || '',
  images: (d.photos || []).map((p: any) => p?.url).filter(Boolean),
  source: 'archive',
});

const fromShowroom = (d: any): Product => ({
  style: d.styleNumber || d.displayName || '',
  color: d.color || '',
  material: typeof d.materials === 'string' ? d.materials : '',
  size: d.size || '',
  gsm: d.gsm || '',
  category: d.category || '',
  images: [d.firebaseUrl, ...(d.additionalImages || [])].filter(Boolean),
  source: 'showroom',
});

function dedupe(items: Product[]): Product[] {
  const seen = new Set<string>();
  return items.filter((p) => {
    const k = `${normStyle(p.style)}|${p.color.toUpperCase().trim()}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

const run = (q: any, map: (d: any) => Product): Promise<Product[]> =>
  getDocs(q).then((s: any) => s.docs.map((d: any) => map(d.data()))).catch(() => [] as Product[]);

/**
 * Look up a style across both collections.
 *
 * em_products is queried by indexed fields — a prefix on styleKey for
 * "EM-25-MA-9995", an equality on serial for "25-9995" or "9995".
 */
export async function search(term: string, max = 50): Promise<Product[]> {
  const t = normStyle(term);
  if (!t) return [];
  const s = serialOf(term);
  const em = collection(db(), 'em_products');
  const jobs = [
    run(query(em, where('styleKey', '>=', t), where('styleKey', '<=', t + ''), qlimit(max)), fromEm),
    run(query(collection(db(), 'showroom_products'),
      where('styleNumber', '>=', `EM-${t}`), where('styleNumber', '<=', `EM-${t}`),
      qlimit(max)), fromShowroom),
  ];
  if (s) jobs.push(run(query(em, where('serial', '==', s), qlimit(max)), fromEm));
  return dedupe((await Promise.all(jobs)).flat()).slice(0, max);
}

/**
 * Every colourway recorded for one style.
 *
 * The caller usually writes the style the way it appears on a selection sheet
 * ("23-6744"), which is not the stored key ("23-MA-6744"), so an exact match
 * has to fall back to resolving the real key first.
 */
export async function colourways(style: string): Promise<Product[]> {
  let key = normStyle(style);
  if (!key) return [];
  const direct = await run(
    query(collection(db(), 'em_products'), where('styleKey', '==', key), qlimit(1)), fromEm);
  if (!direct.length) {
    const resolved = await search(style, 1);
    if (resolved.length) key = normStyle(resolved[0].style);
  }
  const [em, show] = await Promise.all([
    run(query(collection(db(), 'em_products'), where('styleKey', '==', key), qlimit(60)), fromEm),
    run(query(collection(db(), 'showroom_products'),
      where('styleNumber', '==', `EM-${key}`), qlimit(20)), fromShowroom),
  ]);
  return dedupe([...em, ...show]);
}

/** Resolve a list of style numbers, reporting the ones that matched nothing. */
export async function resolveMany(styles: string[]) {
  const found: Product[] = [];
  const missing: string[] = [];
  for (const raw of styles) {
    const hits = await search(raw, 8);
    if (hits.length) found.push(hits[0]);
    else missing.push(raw);
  }
  return { found, missing };
}

export { collection, query, orderBy, qlimit, getDocs };
