import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Plus } from 'lucide-react';
import {
  createShowroomProduct, addProductPhotos, findDuplicateStyle, styleKey, variantStyleNumber,
  type ShowroomProduct,
} from '../lib/firebase';
import { getLibraryVariants } from '../lib/library';
import { getStudioOptions, addStudioOption, DEFAULT_OPTIONS, type OptionKind } from '../lib/options';
import { PhotoPicker } from './PhotoPicker';

/**
 * Create a design that is not in the library yet.
 *
 * Only the design number is required. Everything else is optional because the
 * studio usually photographs before the specs are settled, and a half-filled
 * record that exists beats a complete one that does not. There is no separate
 * name: the design number is the name.
 *
 * `initial` prefills the specs when copying an existing design. The design
 * number and photos are never carried over: a copy is a new design.
 *
 * `variantOf` opens it as a new colour variant of that design instead: the
 * design number is fixed, the colour name is required, the specs start from
 * the design, and the record is saved as <design>-<COLOUR> grouped under it.
 * Typing a number that already exists offers to switch into this mode.
 */
export type NewProductInitial = Partial<Record<'construction' | 'materials' | 'color' | 'size' | 'gsm', string>>;

export function NewProduct({
  initial,
  variantOf: variantOfProp,
  onClose,
  onCreated,
  onOpenExisting,
}: {
  initial?: NewProductInitial;
  variantOf?: ShowroomProduct;
  onClose: () => void;
  onCreated: (p: ShowroomProduct) => void;
  onOpenExisting?: (p: ShowroomProduct) => void;
}) {
  const [variantOf, setVariantOf] = useState<ShowroomProduct | undefined>(variantOfProp);
  const base = variantOf ? (variantOf.baseStyleNumber || variantOf.styleNumber).trim() : '';
  // A variant starts from its design's specs, but never its colour.
  const start = variantOf ? { ...specsOf(variantOf), color: '' } : initial;
  const [f, setF] = useState({
    styleNumber: '',
    construction: start?.construction || '',
    color: start?.color || '',
    size: start?.size || '',
    gsm: start?.gsm || '',
  });
  // Stored as one comma separated string; the form edits one row per material.
  const [materials, setMaterials] = useState<string[]>(() => splitMaterials(start?.materials));
  const copying = !variantOf && !!(initial && Object.values(initial).some(Boolean));
  const [slots, setSlots] = useState<{ file: File; original?: File }[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const qc = useQueryClient();
  const { data: options = DEFAULT_OPTIONS } = useQuery({
    queryKey: ['studio-options'],
    queryFn: getStudioOptions,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (k: keyof typeof f) => (v: string) => setF((cur) => ({ ...cur, [k]: v }));

  // Look for the same style number while it is typed, ignoring case, spaces,
  // dashes and dots. A match only warns: duplicates are allowed, and the
  // warning offers the colourway route in case that is what was meant.
  const typedKey = styleKey(f.styleNumber);
  const [checkKey, setCheckKey] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setCheckKey(typedKey), 300);
    return () => clearTimeout(t);
  }, [typedKey]);
  const { data: existing } = useQuery({
    queryKey: ['style-duplicate', checkKey],
    queryFn: () => findDuplicateStyle(f.styleNumber),
    enabled: !variantOf && checkKey.length >= 3,
    staleTime: 30_000,
  });
  // Ignore an answer that belongs to what was typed a moment ago.
  const duplicate = !variantOf && checkKey === typedKey && checkKey.length >= 3 ? existing ?? null : null;

  // The colours this design already has, so the same one is not added twice.
  const { data: siblings = [] } = useQuery({
    queryKey: ['variants', base],
    queryFn: () => getLibraryVariants(base),
    enabled: !!base,
  });
  const colourKey = styleKey(f.color);
  const variantStyle = variantOf ? variantStyleNumber(base, f.color) : '';
  const sameColour = variantOf && colourKey
    ? siblings.find((v) => styleKey(v.color || '') === colourKey || styleKey(v.styleNumber) === styleKey(variantStyle))
    : undefined;

  /** Switch from a clashing new design to a colour variant of the existing one. */
  function makeVariantOf(p: ShowroomProduct) {
    const spec = specsOf(p);
    // Keep anything already chosen; fill the blanks from the design.
    setF((cur) => ({
      styleNumber: '',
      construction: cur.construction || spec.construction,
      size: cur.size || spec.size,
      gsm: cur.gsm || spec.gsm,
      color: cur.color,
    }));
    setMaterials((cur) => (cur.some((m) => m.trim()) ? cur : splitMaterials(spec.materials)));
    setError('');
    setVariantOf(p);
  }

  /** A value typed with "+ Add new" is saved for everyone, then selected. */
  const addOption = (kind: OptionKind) => async (v: string) => {
    try {
      await addStudioOption(kind, v);
      qc.invalidateQueries({ queryKey: ['studio-options'] });
    } catch {
      /* the value is still used on this design even if saving the choice fails */
    }
  };

  async function save() {
    if (variantOf) {
      if (!f.color.trim()) return setError('Type the colour name of this colourway.');
    } else if (!f.styleNumber.trim()) {
      return setError('Type the design number first.');
    }
    setError('');
    try {
      setBusy('Creating…');
      const specs = { ...f, materials: materials.map((m) => m.trim()).filter(Boolean).join(', ') };
      let created = await createShowroomProduct(
        variantOf
          ? {
              ...specs,
              color: f.color.trim(),
              styleNumber: variantStyle,
              baseStyleNumber: base,
              displayName: `${base} · ${f.color.trim()}`,
            }
          : specs
      );
      // Photos are uploaded only once the design exists, so a cancelled entry
      // never leaves orphan files behind in storage.
      const photos = slots.map((s) => s.file);
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
          <h2 className="font-serif text-[22px]">{variantOf ? 'Add colourway' : 'New design'}</h2>
          {copying && <span className="text-[12px] text-neutral-400">Specs copied. Add the number and photos.</span>}
          {variantOf && <span className="text-[12px] text-neutral-400">Another colour of this design. Specs copied, change any that differ.</span>}
          <div className="flex-1" />
          <button onClick={onClose} aria-label="Close"
            className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-6">
          {variantOf ? (
            <>
              <div>
                <Label>Design number</Label>
                <div className="mt-1 flex items-center gap-3 border-b border-neutral-100 pb-1.5">
                  <span className="font-mono text-[15px]">{base}</span>
                  {variantOfProp ? null : (
                    <button type="button" onClick={() => setVariantOf(undefined)}
                      className="text-[12px] font-semibold text-[#2F4C69] hover:underline">
                      Make it a new design instead
                    </button>
                  )}
                </div>
                {siblings.length > 0 && (
                  <span className="mt-1 block text-[11.5px] text-neutral-400">
                    Already in: {siblings.map((v) => v.color || v.styleNumber).join(', ')}
                  </span>
                )}
              </div>
              <div>
                <Field label="Colourway name" required hint={f.color.trim()
                    ? `Saved as ${variantStyle}`
                    : 'For example Ivory Grey or V2'}
                  value={f.color} onChange={set('color')} autoFocus onEnter={save} />
                {sameColour && (
                  <div role="status" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-l-2 border-[#98671A] bg-[#98671A]/[0.06] px-3 py-2 text-[12.5px] text-[#7a5215]">
                    <span>{base} already has this colourway. You can still add it again.</span>
                    {onOpenExisting && (
                      <button type="button" onClick={() => onOpenExisting(sameColour)}
                        className="font-semibold text-[#2F4C69] hover:underline">
                        Open it and add photos there
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <Field label="Design number" required hint="For example EM-26-MA-7420"
              value={f.styleNumber} onChange={set('styleNumber')} autoFocus onEnter={save} />
          )}
          {duplicate && (
            <div role="status" className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-l-2 border-[#98671A] bg-[#98671A]/[0.06] px-3 py-2 text-[12.5px] text-[#7a5215]">
              <span>
                This style number already exists
                {duplicate.styleNumber && styleKey(duplicate.styleNumber) === typedKey && duplicate.styleNumber !== f.styleNumber.trim()
                  ? ` as ${duplicate.styleNumber}.` : '.'}
              </span>
              <button type="button" onClick={() => makeVariantOf(duplicate)}
                className="font-semibold text-[#2F4C69] hover:underline">
                Add a colourway to it
              </button>
              {onOpenExisting && (
                <button type="button" onClick={() => onOpenExisting(duplicate)}
                  className="font-semibold text-[#2F4C69] hover:underline">
                  Open the existing design
                </button>
              )}
            </div>
          )}

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
            {!variantOf && <Field label="Colour" value={f.color} onChange={set('color')} onEnter={save} />}
            <Field label="GSM" value={f.gsm} onChange={set('gsm')} onEnter={save} />
          </div>

          <div>
            <Label>Photos</Label>
            <div className="mt-2">
              <PhotoPicker slots={slots} onChange={setSlots} disabled={!!busy} />
            </div>
          </div>

          {error && <p className="text-[13px] text-red-600">{error}</p>}
        </div>

        <div className="flex items-center gap-3 border-t border-neutral-100 px-6 py-4">
          <p className="flex-1 text-[12.5px] text-neutral-400">
            {duplicate
              ? 'Creating it adds a second design with this number.'
              : slots.length
                ? `${slots.length} photo${slots.length > 1 ? 's' : ''} ready. The first is the main one.`
                : 'Add as many photos as you like, or add them later.'}
          </p>
          <button onClick={onClose} className="text-[13px] text-neutral-500 hover:text-neutral-900">Cancel</button>
          <button onClick={save} disabled={!!busy}
            className="rounded-sm bg-[#2F4C69] px-[18px] py-2.5 text-[13px] font-semibold text-white disabled:opacity-60">
            {busy || (variantOf ? 'Create colourway' : 'Create design')}
          </button>
        </div>
      </div>
    </div>
  );
}

function specsOf(p: ShowroomProduct) {
  return {
    construction: p.construction || '', materials: p.materials || '',
    color: p.color || '', size: p.size || '', gsm: p.gsm || '',
  };
}

function splitMaterials(v?: string): string[] {
  const list = (v || '').split(',').map((m) => m.trim()).filter(Boolean);
  return list.length ? list : [''];
}

export function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400">
      {children}{required && <span className="ml-1 text-[#98671A]">required</span>}
    </span>
  );
}

const ADD = '__add__';
const lineCls =
  'mt-1 w-full border-b border-neutral-200 bg-transparent pb-1.5 text-[15px] outline-none focus:border-[#2F4C69]';

/**
 * A dropdown whose last entry is "+ Add new…". Picking it swaps the select for
 * a text box; Enter or leaving the box keeps the value and saves it as a choice.
 */
export function Choice({
  label, value, onChange, options, onAdd, ariaLabel,
}: {
  label?: string; value: string; onChange: (v: string) => void;
  options: string[]; onAdd: (v: string) => void; ariaLabel?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  // A value added in this form shows up even before the saved list reloads.
  const list = value && !options.includes(value) ? [...options, value] : options;

  const commit = () => {
    const v = draft.trim();
    setAdding(false);
    setDraft('');
    if (!v) return;
    onChange(v);
    onAdd(v);
  };

  return (
    <label className="block">
      {label && <Label>{label}</Label>}
      {adding ? (
        <input
          autoFocus
          value={draft}
          placeholder="Type the new one"
          aria-label={ariaLabel || label}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { e.nativeEvent.stopPropagation(); setAdding(false); setDraft(''); }
          }}
          className={lineCls}
        />
      ) : (
        <select
          value={value}
          aria-label={ariaLabel || label}
          onChange={(e) => (e.target.value === ADD ? setAdding(true) : onChange(e.target.value))}
          className={lineCls + (value ? '' : ' text-neutral-400')}
        >
          <option value="">Choose…</option>
          {list.map((o) => <option key={o} value={o} className="text-neutral-900">{o}</option>)}
          <option value={ADD} className="text-[#2F4C69]">+ Add new…</option>
        </select>
      )}
    </label>
  );
}

export function Field({
  label, hint, required, value, onChange, autoFocus, onEnter,
}: {
  label: string; hint?: string; required?: boolean; value: string;
  onChange: (v: string) => void; autoFocus?: boolean; onEnter?: () => void;
}) {
  return (
    <label className="block">
      <Label required={required}>{label}</Label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
        className={lineCls}
      />
      {hint && <span className="mt-1 block text-[11.5px] text-neutral-400">{hint}</span>}
    </label>
  );
}
