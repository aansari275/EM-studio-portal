import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, resolveMany, type Product } from '../lib/em.mjs';

/**
 * Builds a deck and uploads it, out of band.
 *
 * A background function because a synchronous one caps at ten seconds and a
 * forty-rug deck means fetching well over a hundred photographs. Progress and
 * the finished link go to Firestore under ppt_jobs, which the MCP endpoint
 * reads back.
 *
 * pptxgenjs under Node reads images off disk rather than over HTTP, so every
 * asset and photo is pulled into a temp directory first.
 */

const ASSETS = [
  'em-logo-new.png', 'em-logo-icon.png', 'em-logo-horizontal.png', 'em-logo.jpeg',
  'intro-banner.jpg', 'certifications.png', 'factory-aerial.png', 'factory-badge.jpg',
  'factory-small.png', 'outro-slide4-1.jpg',
];

async function download(url: string, dest: string): Promise<boolean> {
  try {
    const r = await fetch(url);
    if (!r.ok) return false;
    await writeFile(dest, Buffer.from(await r.arrayBuffer()));
    return true;
  } catch {
    return false;
  }
}

/** Fetch in parallel but bounded — a hundred at once exhausts the socket pool. */
async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  }));
  return out;
}

export default async (req: Request) => {
  const body = await req.json().catch(() => ({} as any));
  const { jobId, token } = body || {};
  if (!token || token !== process.env.MCP_TOKEN) {
    return new Response('unauthorized', { status: 401 });
  }
  if (!jobId) return new Response('missing jobId', { status: 400 });

  const jobRef = doc(db(), 'ppt_jobs', String(jobId));
  const fail = (msg: string) =>
    updateDoc(jobRef, { status: 'failed', error: msg, updatedAt: serverTimestamp() });

  try {
    // Recorded first so a failure in here is distinguishable from never
    // having been invoked at all.
    await updateDoc(jobRef, { status: 'started', updatedAt: serverTimestamp() });

    // Imported lazily so a module-level failure lands in the job record
    // rather than killing the invocation silently.
    const { buildPptx, setAssetsBase, deckFileName } =
      await import('../../src/lib/pptGenerator.js');

    const snap = await getDoc(jobRef);
    if (!snap.exists()) return new Response('no such job', { status: 404 });
    const job = snap.data() as { styles: string[]; title: string };

    await updateDoc(jobRef, { status: 'resolving', updatedAt: serverTimestamp() });
    const { found, missing } = await resolveMany(job.styles || []);
    const usable = found.filter((p) => p.images.length);
    if (!usable.length) return void (await fail('None of those styles have a photo on file.'));

    const dir = await mkdtemp(join(tmpdir(), 'deck-'));
    await updateDoc(jobRef, { status: 'fetching images', updatedAt: serverTimestamp() });

    const origin = new URL(req.url).origin;
    await pool(ASSETS, 6, (name) =>
      download(`${origin}/ppt-assets/${name}`, join(dir, name)).then(() => undefined));
    setAssetsBase(dir);

    // Three photos per rug is what the layout uses; more is wasted bandwidth.
    const tasks: { p: Product; url: string; file: string }[] = [];
    usable.forEach((p, pi) =>
      p.images.slice(0, 3).forEach((url, ii) =>
        tasks.push({ p, url, file: join(dir, `p${pi}_${ii}.jpg`) })));
    const ok = await pool(tasks, 8, (t) => download(t.url, t.file));

    const local = new Map<Product, string[]>();
    tasks.forEach((t, i) => {
      if (!ok[i]) return;
      local.set(t.p, [...(local.get(t.p) || []), t.file]);
    });

    const products = usable
      .map((p) => {
        const files = local.get(p) || [];
        return {
          id: p.style, baseStyleNumber: p.style, styleNumber: p.style,
          displayName: p.color ? `${p.style} · ${p.color}` : p.style,
          firebaseUrl: files[0] || '', additionalImages: files.slice(1),
          color: p.color, materials: p.material, construction: '',
          category: p.category, size: p.size, gsm: p.gsm,
        };
      })
      .filter((p) => p.firebaseUrl);

    if (!products.length) return void (await fail('Could not download any of the photos.'));

    await updateDoc(jobRef, { status: 'building', updatedAt: serverTimestamp() });
    const pptx = buildPptx(products as any, job.title || 'Eastern Mills');
    const buf = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;

    await updateDoc(jobRef, { status: 'uploading', updatedAt: serverTimestamp() });
    const name = deckFileName();
    const path = `ppt-exports/${jobId}/${name}`;
    const storageRef = ref(getStorage(), path);
    await uploadBytes(storageRef, buf, {
      contentType:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    const url = await getDownloadURL(storageRef);

    await updateDoc(jobRef, {
      status: 'ready', url, fileName: name, slides: products.length + 5,
      products: products.length, missing, bytes: buf.length,
      updatedAt: serverTimestamp(),
    });
    return new Response('ok');
  } catch (err: any) {
    await fail(String(err?.message || err)).catch(() => {});
    return new Response('error', { status: 500 });
  }
};
