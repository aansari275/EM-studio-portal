/**
 * Thumbnails.
 *
 * The product photos in Storage are full studio originals: 3500-4000px wide and
 * 0.6-11 MB each. A six-rug buyer link came to 19 MB before this, which is
 * unusable on a phone. Netlify's Image CDN resizes and re-encodes on the fly,
 * so nothing has to be re-uploaded and the originals stay untouched.
 *
 * The CDN endpoint only exists on the deployed site, so dev serves originals.
 */
export function thumb(raw: string | undefined, width = 700): string {
  if (!raw) return '';
  const url = fixStorageUrl(raw);
  if (import.meta.env.DEV) return url;
  if (!/^https?:\/\//.test(url)) return url;
  return `/.netlify/images?url=${encodeURIComponent(url)}&w=${width}&fm=webp&q=72`;
}

const BUCKET = 'easternmillscom.firebasestorage.app';
const PUBLIC_HOST = `https://storage.googleapis.com/${BUCKET}/`;

/**
 * The Heimtextil import stored plain public bucket links
 * (storage.googleapis.com/<bucket>/heimtextil/...). Those objects are not
 * public, so every one answers 403 and the card shows a broken image, while
 * the very same file loads through the Firebase endpoint under the storage
 * rules. Checked 4 Nov 2026 on EM-25-FA-8844: 403 public, 200 Firebase.
 * Rewritten on read rather than in the data, so other apps are untouched.
 */
export function fixStorageUrl(url: string): string {
  if (!url || !url.startsWith(PUBLIC_HOST)) return url;
  const path = decodeURIComponent(url.slice(PUBLIC_HOST.length).split('?')[0]);
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media`;
}

type HasImages = { firebaseUrl?: string; additionalImages?: string[]; heroPinned?: boolean };

/**
 * Which photo is the hero.
 *
 * The products_migration set `firebaseUrl` to a numbered frame (image-2.jpg,
 * image-10.jpg) and pushed the file actually named `main.jpg` into
 * additionalImages. Measured 2026-09-25 over 2,000 products: 68.5% have the
 * hero wrong that way, so the PPT and the buyer link both led with a corner
 * close-up instead of the full rug.
 *
 * Fixed in code rather than by rewriting 9,600 documents, because other apps
 * read this collection and a bulk rewrite is not reversible.
 */
const isMain = (url: string) => {
  try {
    return /\/main\.[a-z0-9]+$/i.test(decodeURIComponent(url).split('?')[0]);
  } catch {
    return /%2Fmain\.[a-z0-9]+/i.test(url);
  }
};

export function allImages(p: HasImages): string[] {
  const seen = new Set<string>();
  return [p.firebaseUrl, ...(p.additionalImages || [])]
    .filter((u): u is string => !!u)
    .filter((u) => (seen.has(u) ? false : (seen.add(u), true)));
}

/** The full-rug shot when we can identify it, else whatever was set as primary. */
export function heroImage(p: HasImages): string {
  if (p.heroPinned && p.firebaseUrl) return p.firebaseUrl;
  const all = allImages(p);
  return all.find(isMain) || p.firebaseUrl || all[0] || '';
}

/** Hero first, then the rest in their existing order. */
export function orderedImages(p: HasImages): string[] {
  const hero = heroImage(p);
  return hero ? [hero, ...allImages(p).filter((u) => u !== hero)] : allImages(p);
}
