import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import {
  db, search, colourways, resolveMany, normStyle, type Product,
  collection, query, orderBy, qlimit, getDocs,
} from '../lib/em.mjs';

/**
 * MCP server for the Eastern Mills rug library, for use as a Claude connector.
 *
 * Streamable HTTP, stateless: every POST carries one JSON-RPC message and gets
 * one JSON response. The spec allows a plain application/json reply instead of
 * an SSE stream, which is what a serverless function can actually deliver.
 *
 * Auth is a bearer token, accepted in the Authorization header or as ?key=,
 * because the connector UI only takes a URL.
 */

const PROTOCOL = '2025-06-18';
const SUPPORTED = new Set(['2025-06-18', '2025-03-26', '2024-11-05']);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type, authorization, mcp-protocol-version',
      'access-control-allow-methods': 'POST, OPTIONS',
    },
  });

const rpcError = (id: unknown, code: number, message: string) =>
  json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

const text = (s: string) => ({ content: [{ type: 'text', text: s }] });

function authorised(req: Request): boolean {
  const expected = process.env.MCP_TOKEN;
  if (!expected) return false;
  const header = req.headers.get('authorization') || '';
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  const key = new URL(req.url).searchParams.get('key') || '';
  return bearer === expected || key === expected;
}

const fmt = (p: Product) =>
  [p.style, p.color && `colour ${p.color}`, p.material, p.size,
   p.gsm, p.category, `${p.images.length} photo(s)`]
    .filter(Boolean).join(' · ');

const TOOLS = [
  {
    name: 'search_products',
    description:
      'Find rugs by style number or partial style number. Handles the shorthand used on '
      + 'selection sheets, where the MA/FA/CO infix is dropped — "25-9995" finds EM-25-MA-9995, '
      + 'and a bare serial like "9995" works too. Returns style, colour, material, size, GSM, '
      + 'category and photo count.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Style number or fragment, e.g. 25-9995' },
        limit: { type: 'number', description: 'Max results (default 25)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_product',
    description: 'Every colourway recorded for one style, with full specification and image URLs.',
    inputSchema: {
      type: 'object',
      properties: { style: { type: 'string', description: 'e.g. 23-6744 or EM-23-MA-6744' } },
      required: ['style'],
    },
  },
  {
    name: 'create_catalog',
    description:
      'Build a shareable buyer catalog from a list of style numbers and return its link. '
      + 'The catalog is a frozen copy, so the link never changes when products are edited. '
      + 'Buyers open it without signing in.',
    inputSchema: {
      type: 'object',
      properties: {
        styles: { type: 'array', items: { type: 'string' }, description: 'Style numbers' },
        buyer: { type: 'string', description: 'Buyer or customer name' },
      },
      required: ['styles', 'buyer'],
    },
  },
  {
    name: 'build_ppt',
    description:
      'Generate a PowerPoint deck from a list of style numbers — intro slides, one slide '
      + 'per rug, outro slides, in the standard Eastern Mills layout. Building takes up to '
      + 'a couple of minutes, so this returns a job id; call get_ppt with it to get the '
      + 'download link.',
    inputSchema: {
      type: 'object',
      properties: {
        styles: { type: 'array', items: { type: 'string' }, description: 'Style numbers' },
        title: { type: 'string', description: 'Deck title (default "Eastern Mills")' },
      },
      required: ['styles'],
    },
  },
  {
    name: 'get_ppt',
    description:
      'Check a deck build and get its download link once ready. Call this a few seconds '
      + 'after build_ppt, and again if it is still building.',
    inputSchema: {
      type: 'object',
      properties: { job_id: { type: 'string' } },
      required: ['job_id'],
    },
  },
  {
    name: 'list_catalogs',
    description: 'Recently created buyer catalogs with their links.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Default 20' } },
    },
  },
];

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const makeId = (len = 7) =>
  Array.from(crypto.getRandomValues(new Uint8Array(len)),
    (b) => ALPHABET[b % ALPHABET.length]).join('');

async function callTool(name: string, args: any, origin: string) {
  if (name === 'search_products') {
    const hits = await search(String(args?.query ?? ''), Math.min(Number(args?.limit) || 25, 100));
    if (!hits.length) return text(`No rug matches "${args?.query}".`);
    return text(`${hits.length} match(es):\n` + hits.map((p) => `• ${fmt(p)}`).join('\n'));
  }

  if (name === 'get_product') {
    const list = await colourways(String(args?.style ?? ''));
    if (!list.length) return text(`No rug found for "${args?.style}".`);
    const body = list.map((p) =>
      `• ${fmt(p)}\n  ${p.images.slice(0, 3).join('\n  ')}`).join('\n');
    return text(`${list.length} colourway(s) of ${normStyle(String(args?.style))}:\n${body}`);
  }

  if (name === 'create_catalog') {
    const styles: string[] = Array.isArray(args?.styles) ? args.styles.map(String) : [];
    if (!styles.length) return text('Give at least one style number.');
    const { found, missing } = await resolveMany(styles);
    const withPhotos = found.filter((p) => p.images.length);
    if (!withPhotos.length) return text('None of those styles have a photo on file.');

    const id = makeId();
    await setDoc(doc(db(), 'catalogs', id), {
      title: 'Eastern Mills',
      buyer: String(args?.buyer ?? '').trim(),
      items: withPhotos.map((p) => {
        const item: Record<string, string> = {
          styleNumber: p.style,
          displayName: p.color ? `${p.style} · ${p.color}` : p.style,
          image: p.images[0],
        };
        if (p.material) item.materials = p.material;
        if (p.color) item.color = p.color;
        if (p.size) item.size = p.size;
        return item;
      }),
      createdBy: 'mcp',
      createdAt: serverTimestamp(),
    });

    const note = missing.length ? `\nNot found: ${missing.join(', ')}` : '';
    const noPhoto = found.length - withPhotos.length;
    const photoNote = noPhoto ? `\n${noPhoto} skipped for having no photo.` : '';
    return text(`Catalog for ${args?.buyer}: ${origin}/c/${id}\n`
      + `${withPhotos.length} rug(s).${photoNote}${note}`);
  }

  if (name === 'build_ppt') {
    const styles: string[] = Array.isArray(args?.styles) ? args.styles.map(String) : [];
    if (!styles.length) return text('Give at least one style number.');
    const jobId = makeId(10);
    await setDoc(doc(db(), 'ppt_jobs', jobId), {
      styles, title: String(args?.title || 'Eastern Mills'),
      status: 'queued', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    // Fire and forget: a background function replies 202 and keeps working.
    fetch(`${origin}/.netlify/functions/ppt-background`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId, token: process.env.MCP_TOKEN }),
    }).catch(() => {});
    return text(`Building a deck of ${styles.length} style(s). Job id: ${jobId}\n`
      + `Call get_ppt with that id in about 20 seconds.`);
  }

  if (name === 'get_ppt') {
    const id = String(args?.job_id || '');
    if (!id) return text('Give the job id returned by build_ppt.');
    const snap = await getDoc(doc(db(), 'ppt_jobs', id));
    if (!snap.exists()) return text(`No job ${id}.`);
    const j = snap.data() as any;
    if (j.status === 'ready') {
      const miss = j.missing?.length ? `\nNot found: ${j.missing.join(', ')}` : '';
      return text(`Ready — ${j.products} rug(s), ${j.slides} slides, `
        + `${Math.round((j.bytes || 0) / 1e6)} MB.\n${j.url}${miss}`);
    }
    if (j.status === 'failed') return text(`Build failed: ${j.error || 'unknown error'}`);
    return text(`Still ${j.status}. Try get_ppt again shortly.`);
  }

  if (name === 'list_catalogs') {
    const snap = await getDocs(query(collection(db(), 'catalogs'),
      orderBy('createdAt', 'desc'), qlimit(Math.min(Number(args?.limit) || 20, 50))));
    if (snap.empty) return text('No catalogs yet.');
    return text(snap.docs.map((d) => {
      const c = d.data();
      return `• ${c.buyer || 'unnamed'} — ${(c.items || []).length} rug(s) — ${origin}/c/${d.id}`;
    }).join('\n'));
  }

  throw new Error(`Unknown tool: ${name}`);
}

export default async (req: Request) => {
  if (req.method === 'OPTIONS') return json({}, 204);
  if (!authorised(req)) return json({ error: 'unauthorized' }, 401);
  if (req.method !== 'POST') {
    return json({ error: 'This MCP endpoint speaks JSON-RPC over POST.' }, 405);
  }

  let msg: any;
  try {
    msg = await req.json();
  } catch {
    return rpcError(null, -32700, 'Parse error');
  }

  const { id, method, params } = msg ?? {};
  const origin = new URL(req.url).origin;

  try {
    if (method === 'initialize') {
      const asked = params?.protocolVersion;
      return json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: SUPPORTED.has(asked) ? asked : PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'eastern-mills-library', version: '1.0.0' },
        },
      });
    }

    // Notifications carry no id and expect no response body.
    if (typeof method === 'string' && method.startsWith('notifications/')) {
      return new Response(null, { status: 202 });
    }

    if (method === 'ping') return json({ jsonrpc: '2.0', id, result: {} });
    if (method === 'tools/list') return json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });

    if (method === 'tools/call') {
      const result = await callTool(params?.name, params?.arguments ?? {}, origin);
      return json({ jsonrpc: '2.0', id, result });
    }

    return rpcError(id, -32601, `Method not found: ${method}`);
  } catch (err: any) {
    // Tool failures are reported in-band so the model can react to them.
    if (method === 'tools/call') {
      return json({
        jsonrpc: '2.0', id,
        result: { isError: true, content: [{ type: 'text', text: String(err?.message || err) }] },
      });
    }
    return rpcError(id, -32603, String(err?.message || err));
  }
};

export const config = { path: '/mcp' };
