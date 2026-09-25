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
export function thumb(url: string | undefined, width = 700): string {
  if (!url) return '';
  if (import.meta.env.DEV) return url;
  if (!/^https?:\/\//.test(url)) return url;
  return `/.netlify/images?url=${encodeURIComponent(url)}&w=${width}&fm=webp&q=72`;
}

type HasImages = { firebaseUrl?: string; additionalImages?: string[] };

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
  const all = allImages(p);
  return all.find(isMain) || p.firebaseUrl || all[0] || '';
}

/** Hero first, then the rest in their existing order. */
export function orderedImages(p: HasImages): string[] {
  const hero = heroImage(p);
  return hero ? [hero, ...allImages(p).filter((u) => u !== hero)] : allImages(p);
}
