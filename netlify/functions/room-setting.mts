import { verifyIdToken, type TokenUser } from '../lib/idToken.mts';
import { buildRoomPrompt, roomStyle, istDay, validSize, type RugFt } from '../../src/lib/roomStyles.ts';

/**
 * Room setting: one rug photo + a written room type -> one 16:9 room photo.
 *
 * POST /api/room-setting   { doc: 'showroom_products/<id>' | 'em_products/<id>', photoUrl, roomType, size: { w, l }, fullRug: true }
 * GET  /api/room-setting   today's count and limit
 *
 * Needs a Firebase ID token of an @easternmills.com Google account
 * (Authorization: Bearer). Refusals are plain JSON with 401/403/400.
 *
 * Timing (measured on this site, 27 Nov 2026, draft deploys): a plain
 * response is cut at 30 s by the edge ("Inactivity Timeout", 504) and every
 * function is stopped at 60 s. Generation takes 14 to 34 s. So once the
 * request is accepted the reply is streamed: a space every 5 s keeps the
 * connection alive, then one JSON object. The model call is given 45 s.
 *
 * Cost control: one model call per request, never a retry. A daily counter
 * (studio_room_usage/<IST date>) is incremented atomically BEFORE the call;
 * over the limit (config/studio_room_setting.dailyLimit, default 100) it is
 * put back and the request refused. Failed calls count (they may be billed).
 * Every attempt is logged to studio_room_log.
 *
 * The result goes to Storage under studio-portal/room-settings/<style>/ as an
 * unkept candidate; the browser writes it onto the product only on Keep.
 * Firestore and Storage are written with the caller's own ID token.
 */

const PROJECT = 'easternmillscom';
const BUCKET = 'easternmillscom.firebasestorage.app';
const API_KEY = process.env.VITE_FIREBASE_API_KEY || 'AIzaSyBSnzCBh-nhQs2nNuPpV_xpRp29FyUyHuc';
const MODEL = 'gemini-nano-banana-2.1';
const DEFAULT_LIMIT = 100;
const MODEL_MS = 45_000;
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

type Fail = { ok: false; code: string; message: string };
const fail = (code: string, message: string): Fail => ({ ok: false, code, message });

// ---------- Firestore REST, as the caller ----------

type FsValue = { stringValue?: string; integerValue?: string; doubleValue?: number; booleanValue?: boolean; nullValue?: null;
  timestampValue?: string; arrayValue?: { values?: FsValue[] }; mapValue?: { fields?: Record<string, FsValue> } };

function decode(v: FsValue | undefined): unknown {
  if (!v) return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue?.values || []).map(decode);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue?.fields || {}).map(([k, x]) => [k, decode(x)]));
  return null;
}

function encode(x: unknown): FsValue {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === 'string') return { stringValue: x };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number') return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(encode) } };
  if (typeof x === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(x as object).map(([k, v]) => [k, encode(v)])) } };
  return { stringValue: String(x) };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

async function getDoc(path: string, token: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${FS}/${path}?key=${API_KEY}`, { headers: auth(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`read ${path} ${res.status}`);
  const d = (await res.json()) as { fields?: Record<string, FsValue> };
  return decode({ mapValue: { fields: d.fields || {} } }) as Record<string, unknown>;
}

/** Atomic add to a counter field; returns the new value. Creates the doc if needed. */
async function increment(path: string, field: string, by: number, token: string): Promise<number> {
  const res = await fetch(`${FS.replace(/\/documents$/, '/documents:commit')}?key=${API_KEY}`, {
    method: 'POST', headers: auth(token),
    body: JSON.stringify({ writes: [{ transform: {
      document: `projects/${PROJECT}/databases/(default)/documents/${path}`,
      fieldTransforms: [{ fieldPath: field, increment: { integerValue: String(by) } }],
    } }] }),
  });
  if (!res.ok) throw new Error(`counter ${res.status}`);
  const d = (await res.json()) as { writeResults?: Array<{ transformResults?: FsValue[] }> };
  return Number(decode(d.writeResults?.[0]?.transformResults?.[0]) ?? NaN);
}

async function addLog(entry: Record<string, unknown>, token: string): Promise<void> {
  const fields = (encode(entry).mapValue?.fields) || {};
  await fetch(`${FS}/studio_room_log?key=${API_KEY}`, { method: 'POST', headers: auth(token), body: JSON.stringify({ fields }) })
    .catch(() => undefined);
}

async function dailyLimit(token: string): Promise<number> {
  try {
    const c = await getDoc('config/studio_room_setting', token);
    const n = Number(c?.dailyLimit);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_LIMIT;
  } catch {
    return DEFAULT_LIMIT;
  }
}

async function usedToday(token: string): Promise<number> {
  const d = await getDoc(`studio_room_usage/${istDay()}`, token).catch(() => null);
  return Number(d?.count) || 0;
}

// ---------- photos ----------

/** Our bucket only, either URL form. Returns the object path, or null. */
function storagePath(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  if (u.hostname === 'firebasestorage.googleapis.com') {
    const m = u.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    return m && m[1] === BUCKET ? decodeURIComponent(m[2]) : null;
  }
  if (u.hostname === 'storage.googleapis.com') {
    const prefix = `/${BUCKET}/`;
    return u.pathname.startsWith(prefix) ? decodeURIComponent(u.pathname.slice(prefix.length)) : null;
  }
  return null;
}

const mediaUrl = (path: string) => `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media`;

function photosOf(d: Record<string, unknown>): string[] {
  const out: string[] = [];
  const add = (v: unknown) => { if (typeof v === 'string' && v) out.push(v); };
  add(d.firebaseUrl); add(d.imageUrl);
  for (const k of ['additionalImages', 'additionalImageUrls']) if (Array.isArray(d[k])) (d[k] as unknown[]).forEach(add);
  if (Array.isArray(d.photos)) (d.photos as Array<{ url?: string }>).forEach((p) => add(p?.url));
  return out;
}

/** Pixel size of a JPEG or PNG from its header, or null. */
function imageSize(b: Uint8Array): { w: number; h: number } | null {
  if (b[0] === 0x89 && b[1] === 0x50) return { w: (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19], h: (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23] };
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    i += 2 + len;
  }
  return null;
}

/** The rug photo at a size the model needs (1536 px long side), through the site's image CDN, else the file itself. */
async function fetchRug(origin: string, path: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const src = mediaUrl(path);
  const png = /\.png$/i.test(path);
  const cdn = `${origin}/.netlify/images?url=${encodeURIComponent(src)}&w=1536&h=1536&fit=contain&fm=${png ? 'png' : 'jpg'}${png ? '' : '&q=85'}`;
  for (const u of [cdn, src]) {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length > 12 * 1024 * 1024) continue;
      const mime = bytes[0] === 0x89 ? 'image/png' : bytes[0] === 0xff ? 'image/jpeg' : '';
      if (!mime) continue;
      return { bytes, mime };
    } catch { /* next */ }
  }
  throw new Error('photo');
}

async function upload(path: string, bytes: Uint8Array, token: string): Promise<string> {
  const res = await fetch(`https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(path)}`, {
    method: 'POST', headers: { Authorization: `Firebase ${token}`, 'Content-Type': 'image/jpeg' }, body: bytes,
  });
  if (!res.ok) throw new Error(`upload ${res.status}`);
  const d = (await res.json()) as { downloadTokens?: string };
  const t = (d.downloadTokens || '').split(',')[0];
  return mediaUrl(path) + (t ? `&token=${t}` : '');
}

// ---------- the model ----------

type Usage = Record<string, unknown> | undefined;
type ModelOut = { ok: true; bytes: Uint8Array; usage: Usage } | (Fail & { usage?: Usage; http?: number });

async function generate(prompt: string, rug: { bytes: Uint8Array; mime: string }, key: string): Promise<ModelOut> {
  let res: Response;
  try {
    res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json', 'Api-Revision': '2026-05-20' },
      body: JSON.stringify({
        model: MODEL,
        input: [
          { type: 'text', text: prompt },
          { type: 'image', mime_type: rug.mime, data: Buffer.from(rug.bytes).toString('base64') },
        ],
        response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '16:9', image_size: '1K' },
      }),
      signal: AbortSignal.timeout(MODEL_MS),
    });
  } catch (e) {
    const timeout = e instanceof Error && /timeout|abort/i.test(e.name + e.message);
    return timeout
      ? fail('timeout', 'The image service took too long. Try again in a minute.')
      : fail('network', 'Could not reach the image service. Try again.');
  }
  const text = await res.text();
  let d: any = null;
  try { d = JSON.parse(text); } catch { /* not json */ }
  const usage = d?.usage as Usage;
  if (res.status === 429) return { ...fail('quota', 'The image service is busy or its quota is used up. Try again later.'), usage, http: 429 };
  if (!res.ok) {
    const msg = String(d?.error?.message || '');
    if (/safety|blocked|policy/i.test(msg)) return { ...fail('safety', 'The image service refused this photo. Try another photo or room.'), usage, http: res.status };
    return { ...fail('model', `The image service gave an error (${res.status}). Try again.`), usage, http: res.status };
  }
  for (const step of (d?.steps || []) as any[]) {
    for (const c of (step?.content || []) as any[]) {
      if (c?.type === 'image' && typeof c.data === 'string' && c.data.length > 1000) {
        return { ok: true, bytes: new Uint8Array(Buffer.from(c.data, 'base64')), usage };
      }
    }
  }
  if (/block|safety/i.test(JSON.stringify(d?.status || '') + JSON.stringify(d?.error || ''))) {
    return { ...fail('safety', 'The image service refused this photo. Try another photo or room.'), usage };
  }
  return { ...fail('no-image', 'The image service answered without a picture. Try again.'), usage };
}

// ---------- handler ----------

async function caller(req: Request): Promise<{ user: TokenUser; token: string } | Response> {
  const h = req.headers.get('authorization') || '';
  const token = h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : '';
  if (!token) return json(fail('auth', 'Sign in again.'), 401);
  const v = await verifyIdToken(token).catch(() => ({ ok: false as const, reason: 'certs' }));
  if (!v.ok) return json(fail('auth', 'Sign in again.'), 401);
  if (!v.user.email.endsWith('@easternmills.com') || !v.user.emailVerified) {
    return json(fail('forbidden', 'Room settings are for Eastern Mills accounts only.'), 403);
  }
  return { user: v.user, token };
}

const slug = (s: string) => (s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'UNKNOWN';

export default async (req: Request) => {
  const who = await caller(req);
  if (who instanceof Response) return who;
  const { user, token } = who;

  if (req.method === 'GET') {
    const [used, limit] = await Promise.all([usedToday(token), dailyLimit(token)]);
    return json({ ok: true, used, limit, remaining: Math.max(0, limit - used) });
  }
  if (req.method !== 'POST') return json(fail('method', 'POST only.'), 405);

  const key = process.env.GEMINI_API_KEY;
  if (!key) return json(fail('config', 'Room settings are not set up on this site yet.'), 503);

  let body: any;
  try { body = await req.json(); } catch { return json(fail('bad', 'Bad request.'), 400); }
  const docPath = String(body?.doc || '');
  if (!/^(showroom_products|em_products)\/[A-Za-z0-9_.:-]{1,200}$/.test(docPath)) return json(fail('bad', 'Unknown product.'), 400);
  const style = roomStyle(String(body?.roomType || ''));
  if (!style) return json(fail('bad', 'Pick a room type.'), 400);
  const size: RugFt = { w: Number(body?.size?.w), l: Number(body?.size?.l) };
  if (!validSize(size)) return json(fail('bad', 'Give the rug size in feet, 1.5 to 30 a side.'), 400);
  const sorted: RugFt = { w: Math.min(size.w, size.l), l: Math.max(size.w, size.l) };
  if (body?.fullRug !== true) return json(fail('swatch', 'Confirm the photo shows the full rug.'), 400);
  const photoPath = storagePath(String(body?.photoUrl || ''));
  if (!photoPath) return json(fail('bad', 'That photo is not one of ours.'), 400);

  let product: Record<string, unknown> | null;
  try { product = await getDoc(docPath, token); } catch { return json(fail('read', 'Could not read the product. Try again.'), 502); }
  if (!product) return json(fail('bad', 'That product no longer exists.'), 404);
  if (!photosOf(product).some((u) => storagePath(u) === photoPath)) return json(fail('bad', 'That photo is no longer on this product.'), 400);
  const styleNumber = String(product.styleNumber || product.styleDisplay || product.baseStyleNumber || docPath.split('/')[1]);
  const construction = String(product.construction || (docPath.startsWith('em_') ? product.category : '') || '');
  const materials = String(product.materials || product.material || '');

  const origin = new URL(req.url).origin;
  const day = istDay();
  const t0 = Date.now();

  // Accepted: from here the reply is streamed (see the note at the top).
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const beat = setInterval(() => { try { ctrl.enqueue(enc.encode(' ')); } catch { /* closed */ } }, 5000);
      ctrl.enqueue(enc.encode(' '));
      const log: Record<string, unknown> = {
        at: new Date().toISOString(), day, by: user.email, uid: user.uid, doc: docPath, styleNumber,
        roomType: style.id, size: `${sorted.w}x${sorted.l}`, sourcePath: photoPath, model: MODEL,
      };
      const finish = async (out: Record<string, unknown>) => {
        clearInterval(beat);
        log.ms = Date.now() - t0;
        log.ok = out.ok === true;
        if (out.ok !== true) log.error = out.code;
        await addLog(log, token);
        try { ctrl.enqueue(enc.encode(JSON.stringify(out))); ctrl.close(); } catch { /* closed */ }
      };
      try {
        const limit = await dailyLimit(token);
        let count: number;
        try { count = await increment(`studio_room_usage/${day}`, 'count', 1, token); }
        catch { return await finish(fail('cap', 'Could not check today\'s count. Try again.')); }
        if (!(count <= limit)) {
          await increment(`studio_room_usage/${day}`, 'count', -1, token).catch(() => undefined);
          log.counted = false;
          return await finish({ ...fail('cap', `Today's limit of ${limit} room settings is used up. It resets at midnight India time.`), limit, remaining: 0 });
        }
        log.counted = true;
        let rug: { bytes: Uint8Array; mime: string };
        try { rug = await fetchRug(origin, photoPath); }
        catch { return await finish(fail('photo', 'Could not load the rug photo. Try again.')); }
        const prompt = buildRoomPrompt({ styleNumber, construction, materials, size: sorted, style, cutout: rug.mime === 'image/png' });
        const tm = Date.now();
        const out = await generate(prompt, rug, key);
        log.modelMs = Date.now() - tm;
        log.usage = out.usage ?? null;
        if (!out.ok) return await finish(out);
        const px = imageSize(out.bytes);
        log.px = px ? `${px.w}x${px.h}` : null;
        if (!px || px.w < 800 || px.w / px.h < 1.4) return await finish(fail('size', 'The picture came back the wrong shape. Try again.'));
        const path = `studio-portal/room-settings/${slug(styleNumber)}/room-${Date.now()}-${style.id}.jpg`;
        let url: string;
        try { url = await upload(path, out.bytes, token); }
        catch { return await finish(fail('upload', 'The room was made but could not be saved. Try again.')); }
        log.path = path;
        log.bytes = out.bytes.length;
        await finish({ ok: true, url, path, w: px.w, h: px.h, ms: Date.now() - t0, limit, remaining: Math.max(0, limit - count) });
      } catch {
        await finish(fail('error', 'Something went wrong. Try again.'));
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
};

export const config = { path: '/api/room-setting' };
