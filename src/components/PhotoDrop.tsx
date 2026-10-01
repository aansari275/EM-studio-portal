import { useRef, useState } from 'react';
import { addProductPhotos, type ShowroomProduct } from '../lib/firebase';

/**
 * Drag photos onto a product, or click to pick them.
 *
 * The first photo on a product that has none is filed as main.<ext>, which is
 * what heroImage() looks for, so the full-rug shot leads everywhere afterwards.
 */
export function PhotoDrop({
  product,
  onUploaded,
}: {
  product: ShowroomProduct;
  onUploaded: (p: ShowroomProduct) => void;
}) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  async function take(list: FileList | null) {
    const files = [...(list || [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    setError(''); setBusy(`Uploading 1 of ${files.length}…`);
    try {
      const updated = await addProductPhotos(product, files, (done, total) =>
        setBusy(done === total ? 'Finishing…' : `Uploading ${done + 1} of ${total}…`)
      );
      onUploaded(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy('');
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div>
      <button
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
        disabled={!!busy}
        className={
          'flex w-full flex-col items-center justify-center gap-1 rounded-sm border border-dashed px-4 py-6 text-center transition-colors ' +
          (over ? 'border-[#2F4C69] bg-[#2F4C69]/5' : 'border-neutral-300 hover:border-neutral-400')
        }
      >
        <span className="text-[13px] font-semibold">
          {busy || (over ? 'Drop them here' : 'Drag photos here, or click to choose')}
        </span>
        {!busy && (
          <span className="text-[11.5px] text-neutral-400">
            {product.firebaseUrl ? 'Added after the existing photos' : 'The first one becomes the main photo'}
          </span>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => take(e.target.files)}
      />
      {error && <p className="mt-2 text-[12.5px] text-red-600">{error}</p>}
    </div>
  );
}
