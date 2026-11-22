import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { addProductPhotos, type ShowroomProduct } from '../lib/firebase';
import { ACCEPT, normaliseAll } from '../lib/imageIntake';

/**
 * The + tile that sits on the end of a product's thumbnail row.
 *
 * Uploads straight away, because the design already exists here. In the create
 * window photos are queued instead and only sent once the record is saved.
 */
export function PhotoDrop({
  product,
  onUploaded,
  size = 'h-14 w-14',
}: {
  product: ShowroomProduct;
  onUploaded: (p: ShowroomProduct) => void;
  size?: string;
}) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  async function take(list: FileList | null) {
    const picked = [...(list || [])];
    if (!picked.length) return;
    setError(''); setBusy('…');
    // Photo intake first: HEIC, TIFF, WebP, RAW previews... become JPEG or PNG.
    const done: (File | null)[] = picked.map(() => null);
    const problems: string[] = [];
    let n = 0;
    await normaliseAll(picked, (i, r) => {
      if (r.ok) done[i] = r.file; else problems.push(r.error);
      setBusy(`${++n}/${picked.length}`);
    });
    const files = done.filter((f): f is File => !!f); // in the order she picked them
    if (!files.length) {
      setError(problems.join(' '));
      setBusy('');
      if (input.current) input.current.value = '';
      return;
    }
    try {
      const updated = await addProductPhotos(product, files, (done, total) =>
        setBusy(`${done}/${total}`)
      );
      onUploaded(updated);
      if (problems.length) setError(problems.join(' '));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy('');
      if (input.current) input.current.value = '';
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
        disabled={!!busy}
        aria-label="Add photos"
        title="Add photos"
        className={
          `${size} flex shrink-0 flex-col items-center justify-center rounded-sm border border-dashed transition-colors ` +
          (over ? 'border-[#2F4C69] bg-[#2F4C69]/5' : 'border-neutral-300 hover:border-neutral-500')
        }
      >
        {busy ? (
          <span className="text-[10px] font-semibold text-neutral-500">{busy}</span>
        ) : (
          <Plus className="h-4 w-4 text-neutral-400" strokeWidth={2} />
        )}
      </button>
      <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => take(e.target.files)} />
      {error && <p className="mt-2 w-full text-[12px] text-red-600">{error}</p>}
    </>
  );
}
