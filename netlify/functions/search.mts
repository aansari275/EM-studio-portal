/**
 * Substring search over showroom_products, done on the server.
 *
 * Firestore cannot do "contains", so the browser used to download every
 * showroom record (10,000 of 16,380, ~9 MB) on the first keystroke and filter
 * locally. That was the lag, and it silently skipped the last 6,000 records.
 *
 * Here a slim index (text fields only, no image arrays) is held in the warm
 * function and refreshed every minute, and only the matched documents are
 * fetched in full. The Library pings ?warm=1 on load so the first real search
 * does not pay the cold start.
 *
 * Paged: `?q=&n=&offset=` returns `{ items, total, nextOffset }`. A broad term
 * like "80" matches thousands of records, and fetching 300 full documents
 * before showing any was the slow part. The library now asks for 60 at a time
 * and fetches the next page as she scrolls. Scanning the slim index for the
 * total is cheap; only the page itself goes through batchGet.
 */
const BASE = 'https://firestore.googleapis.com/v1/projects/easternmillscom/databases/(default)/documents';
const COLLECTION = 'showroom_products';
const FIELDS = ['styleNumber', 'displayName', 'baseStyleNumber', 'productId',
  'color', 'materials', 'construction', 'size', 'gsm', 'createdAt'];
const TTL_MS = 60 * 1000;

type Row = { id: string; text: string; at: string };
let index: { at: number; rows: Promise<Row[]> } | null = null;

function decode(v: any): any {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
  return null;
}
const decodeFields = (f: Record<string, any>) =>
  Object.fromEntries(Object.entries(f).map(([k, v]) => [k, decode(v)]));

const flat = (v: unknown): string =>
  Array.isArray(v) ? v.map((m: any) => (typeof m === 'string' ? m : m?.name || '')).join(' ') : String(v ?? '');

async function buildIndex(): Promise<Row[]> {
  const res = await fetch(`${BASE}:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: COLLECTION }],
        select: { fields: FIELDS.map((fieldPath) => ({ fieldPath })) },
      },
    }),
  });
  if (!res.ok) throw new Error(`index ${res.status}`);
  const out: Row[] = [];
  for (const r of (await res.json()) as any[]) {
    if (!r.document) continue;
    const id = r.document.name.split('/').pop();
    const d = decodeFields(r.document.fields || {});
    const text = [id, ...FIELDS.filter((k) => k !== 'createdAt').map((k) => flat(d[k]))]
      .join(' ').toLowerCase();
    out.push({ id, text, at: d.createdAt || '' });
  }
  // Newest first, matching the order the library shows when nothing is typed.
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

function getIndex(): Promise<Row[]> {
  if (index && Date.now() - index.at < TTL_MS) return index.rows;
  const stale = index;
  const rows = buildIndex();
  index = { at: Date.now(), rows };
  rows.catch(() => { index = stale; });
  // Serve the previous index while the new one builds, so a refresh never
  // makes someone wait mid-search.
  return stale ? stale.rows : rows;
}

async function fetchDocs(ids: string[]): Promise<any[]> {
  if (!ids.length) return [];
  const prefix = `projects/easternmillscom/databases/(default)/documents/${COLLECTION}/`;
  const res = await fetch(`${BASE}:batchGet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documents: ids.map((id) => prefix + id) }),
  });
  if (!res.ok) throw new Error(`batchGet ${res.status}`);
  const byId = new Map<string, any>();
  for (const r of (await res.json()) as any[]) {
    if (!r.found) continue;
    const id = r.found.name.split('/').pop();
    byId.set(id, { id, ...decodeFields(r.found.fields || {}) });
  }
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export default async (req: Request) => {
  const url = new URL(req.url);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });

  try {
    if (url.searchParams.has('warm')) {
      await getIndex();
      return json({ ok: true });
    }
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const n = Math.min(Number(url.searchParams.get('n')) || 300, 500);
    const offset = Math.max(0, Math.floor(Number(url.searchParams.get('offset')) || 0));
    if (!q) return json({ items: [], total: 0, nextOffset: null });
    const rows = await getIndex();
    // Every match, in index order (newest first), so offsets are stable
    // between pages as long as the index has not been rebuilt in between.
    const matched: string[] = [];
    for (const r of rows) if (r.text.includes(q)) matched.push(r.id);
    const end = offset + n;
    return json({
      items: await fetchDocs(matched.slice(offset, end)),
      total: matched.length,
      nextOffset: end < matched.length ? end : null,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'search failed' }, 500);
  }
};

export const config = { path: '/api/search' };
