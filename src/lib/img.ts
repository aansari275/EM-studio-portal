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
