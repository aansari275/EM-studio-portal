import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { createShowroomProduct, addProductPhotos, type ShowroomProduct } from '../lib/firebase';
import { PhotoPicker } from './PhotoPicker';

/**
 * Create a design that is not in the library yet.
 *
 * Only the style number is required. Everything else is optional because the
 * studio usually photographs before the specs are settled, and a half-filled
 * record that exists beats a complete one that does not.
 */
export function NewProduct({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (p: ShowroomProduct) => void;
}) {
  const [f, setF] = useState({
    styleNumber: '', displayName: '', construction: '', materials: '', color: '', size: '', gsm: '',
  });
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });

  async function save() {
    if (!f.styleNumber.trim()) return setError('Type the design number first.');
    setError('');
    try {
      setBusy('Creating…');
      let created = await createShowroomProduct(f);
      // Photos are uploaded only once the design exists, so a cancelled entry
      // never leaves orphan files behind in storage.
      if (photos.length) {
        created = await addProductPhotos(created, photos, (done, total) =>
          setBusy(done === total ? 'Finishing…' : `Uploading ${done + 1} of ${total}…`)
        );
      }
      onCreated(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create it.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-10"
      onClick={onClose} role="dialog" aria-modal="true" aria-label="New design">
      <div className="w-full max-w-lg rounded-md bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-4 border-b border-neutral-100 px-6 py-5">
          <h2 className="font-serif text-[22px]">New design</h2>
          <div className="flex-1" />
          <button onClick={onClose} aria-label="Close"
            className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-6">
          <Field label="Design number" required hint="For example EM-26-MA-7420"
            value={f.styleNumber} onChange={set('styleNumber')} autoFocus
            onEnter={save} />
          <Field label="Name" hint="Leave blank to use the design number"
            value={f.displayName} onChange={set('displayName')} onEnter={save} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Construction" hint="Hand Knotted, Hand Tufted…" value={f.construction} onChange={set('construction')} onEnter={save} />
            <Field label="Material" value={f.materials} onChange={set('materials')} onEnter={save} />
            <Field label="Colour" value={f.color} onChange={set('color')} onEnter={save} />
            <Field label="Size" value={f.size} onChange={set('size')} onEnter={save} />
          </div>
          <Field label="GSM" value={f.gsm} onChange={set('gsm')} onEnter={save} />

          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400">
              Photos
            </span>
            <div className="mt-2">
              <PhotoPicker files={photos} onChange={setPhotos} disabled={!!busy} />
            </div>
          </div>

          {error && <p className="text-[13px] text-red-600">{error}</p>}
        </div>

        <div className="flex items-center gap-3 border-t border-neutral-100 px-6 py-4">
          <p className="flex-1 text-[12.5px] text-neutral-400">
            {photos.length
              ? `${photos.length} photo${photos.length > 1 ? 's' : ''} ready. The first is the main one.`
              : 'Photos are optional, you can add them later.'}
          </p>
          <button onClick={onClose} className="text-[13px] text-neutral-500 hover:text-neutral-900">Cancel</button>
          <button onClick={save} disabled={!!busy}
            className="rounded-sm bg-[#2F4C69] px-[18px] py-2.5 text-[13px] font-semibold text-white disabled:opacity-60">
            {busy || 'Create design'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, hint, required, value, onChange, autoFocus, onEnter,
}: {
  label: string; hint?: string; required?: boolean; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  autoFocus?: boolean; onEnter?: () => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400">
        {label}{required && <span className="ml-1 text-[#98671A]">required</span>}
      </span>
      <input
        value={value}
        onChange={onChange}
        autoFocus={autoFocus}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
        className="mt-1 w-full border-b border-neutral-200 bg-transparent pb-1.5 text-[15px] outline-none focus:border-[#2F4C69]"
      />
      {hint && <span className="mt-1 block text-[11.5px] text-neutral-400">{hint}</span>}
    </label>
  );
}
