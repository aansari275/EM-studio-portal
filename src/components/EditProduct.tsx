import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Star } from 'lucide-react';
import { type ShowroomProduct } from '../lib/firebase';
import { getStudioOptions, addStudioOption, DEFAULT_OPTIONS, type OptionKind } from '../lib/options';
import { updateProduct, uploadEditPhotos } from '../lib/productEdit';
import { orderedImages, thumb } from '../lib/img';
import { PhotoPicker } from './PhotoPicker';
import { Label, Choice, Field } from './NewProduct';

/**
 * Edit an existing design: its number, specs and photos.
 *
 * Photos already on the design can be removed or made the main one; new ones
 * are queued like in New design and only uploaded on Save, so Cancel leaves
 * nothing behind.
 */
export function EditProduct({
  product,
  onClose,
  onSaved,
}: {
  product: ShowroomProduct;
  onClose: () => void;
  onSaved: (p: ShowroomProduct) => void;
}) {
  const [f, setF] = useState({
    styleNumber: product.styleNumber || product.baseStyleNumber || '',
    construction: product.construction || '',
    color: product.color || '',
    size: product.size || '',
    gsm: product.gsm || '',
  });
  const [materials, setMaterials] = useState<string[]>(() => {
    const list = (product.materials || '').split(',').map((m) => m.trim()).filter(Boolean);
    return list.length ? list : [''];
  });
  const [photos, setPhotos] = useState<string[]>(() => orderedImages(product));
  const [slots, setSlots] = useState<{ file: File; original?: File }[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const qc = useQueryClient();
  const { data: options = DEFAULT_OPTIONS } = useQuery({
    queryKey: ['studio-options'],
    queryFn: getStudioOptions,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const set = (k: keyof typeof f) => (v: string) => setF((cur) => ({ ...cur, [k]: v }));

  const addOption = (kind: OptionKind) => async (v: string) => {
    try {
      await addStudioOption(kind, v);
      qc.invalidateQueries({ queryKey: ['studio-options'] });
    } catch {
      /* the value is still used on this design even if saving the choice fails */
    }
  };

  async function save() {
    if (!f.styleNumber.trim()) return setError('The design number cannot be empty.');
    setError('');
    try {
      let added: string[] = [];
      const files = slots.map((s) => s.file);
      if (files.length) {
        setBusy(`Uploading 1 of ${files.length}…`);
        added = await uploadEditPhotos(product, files, (done, total) =>
          setBusy(done === total ? 'Saving…' : `Uploading ${done + 1} of ${total}…`));
      }
      setBusy('Saving…');
      const saved = await updateProduct(product, {
        ...f,
        materials: materials.map((m) => m.trim()).filter(Boolean).join(', '),
        photos: [...photos, ...added],
      });
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save it.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-10"
      onClick={() => !busy && onClose()} role="dialog" aria-modal="true" aria-label={`Edit ${product.displayName}`}>
      <div className="w-full max-w-lg rounded-md bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-4 border-b border-neutral-100 px-6 py-5">
          <h2 className="font-serif text-[22px]">Edit design</h2>
          {product.source === 'ppt_archive' && (
            <span className="text-[12px] text-neutral-400">Archive record</span>
          )}
          <div className="flex-1" />
          <button onClick={onClose} disabled={!!busy} aria-label="Close"
            className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-6">
          <Field label="Design number" required value={f.styleNumber} onChange={set('styleNumber')} onEnter={save} />

          <div className="grid gap-5 sm:grid-cols-2">
            <Choice label="Construction" value={f.construction} onChange={set('construction')}
              options={options.constructions} onAdd={addOption('constructions')} />
            <Choice label="Size" value={f.size} onChange={set('size')}
              options={options.sizes} onAdd={addOption('sizes')} />
          </div>

          <div>
            <Label>Material</Label>
            <div className="mt-1 space-y-2">
              {materials.map((m, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Choice value={m} options={options.materials} onAdd={addOption('materials')}
                      ariaLabel={`Material ${i + 1}`}
                      onChange={(v) => setMaterials((cur) => cur.map((x, j) => (j === i ? v : x)))} />
                  </div>
                  {materials.length > 1 && (
                    <button type="button" aria-label={`Remove material ${i + 1}`}
                      onClick={() => setMaterials((cur) => cur.filter((_, j) => j !== i))}
                      className="mb-1 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setMaterials((cur) => [...cur, ''])}
              className="mt-2 flex items-center gap-1 text-[12.5px] font-semibold text-[#2F4C69] hover:underline">
              <Plus className="h-3.5 w-3.5" strokeWidth={3} /> Add material
            </button>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Colour" value={f.color} onChange={set('color')} onEnter={save} />
            <Field label="GSM" value={f.gsm} onChange={set('gsm')} onEnter={save} />
          </div>

          <div>
            <Label>Photos</Label>
            {photos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {photos.map((u, i) => (
                  <div key={u} className="group relative h-20 w-20 overflow-hidden rounded-sm bg-neutral-100 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)]">
                    <img src={thumb(u, 160)} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                    {i === 0 ? (
                      <span className="absolute inset-x-0 bottom-0 bg-black/55 text-center text-[9px] font-semibold uppercase tracking-wide text-white">
                        Main
                      </span>
                    ) : (
                      <button type="button" title="Make this the main photo" aria-label={`Make photo ${i + 1} the main photo`}
                        onClick={() => setPhotos((cur) => [u, ...cur.filter((x) => x !== u)])}
                        className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/55 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100">
                        <Star className="h-2.5 w-2.5" /> Main
                      </button>
                    )}
                    <button type="button" aria-label={`Remove photo ${i + 1}`} title="Remove this photo"
                      onClick={() => setPhotos((cur) => cur.filter((x) => x !== u))}
                      className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-white/95 text-neutral-700 shadow hover:text-red-600">
                      <X className="h-3 w-3" strokeWidth={3} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3">
              <PhotoPicker slots={slots} onChange={setSlots} disabled={!!busy} />
            </div>
          </div>

          {error && <p className="text-[13px] text-red-600">{error}</p>}
        </div>

        <div className="flex items-center gap-3 border-t border-neutral-100 px-6 py-4">
          <p className="flex-1 text-[12.5px] text-neutral-400">
            Buyer links already sent keep the old version.
          </p>
          <button onClick={onClose} disabled={!!busy} className="text-[13px] text-neutral-500 hover:text-neutral-900">Cancel</button>
          <button onClick={save} disabled={!!busy}
            className="rounded-sm bg-[#2F4C69] px-[18px] py-2.5 text-[13px] font-semibold text-white disabled:opacity-60">
            {busy || 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
