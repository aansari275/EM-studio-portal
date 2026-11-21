import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Plus, X, Undo2, Scissors, Download } from 'lucide-react';

// The editor and its pixel maths load only when a tile is first clicked.
const PhotoEditor = lazy(() => import('./PhotoEditor'));

/**
 * A grid of photo thumbnails with a + tile on the end.
 *
 * Files are held locally and only uploaded when the design is saved, so a
 * half-finished entry never leaves a stray folder in storage. The first tile is
 * labelled, because that one becomes the product's main photo everywhere else.
 *
 * Background removal runs here rather than in a separate tool, so there is no
 * process / download / re-upload round trip. It is never applied blind: each
 * result is shown on its own tile with an undo, because the model handles
 * full-rug and cushion shots well but loses pale low-contrast pieces, and
 * full-bleed texture crops have no background to find in the first place.
 *
 * Clicking a tile opens the photo editor (skew, straighten, crop, tone). An
 * edit replaces the tile's file but keeps the first `original`, so the one
 * undo on the tile always goes back to the photo as it was dropped in.
 */

export type Slot = {
  file: File;
  /** The photo as it was added, before any cutout or edit. */
  original?: File;
  /** The background has been removed (the file is a cutout). */
  cut?: boolean;
  keptPct?: number;
  working?: boolean;
  failed?: string;
};

export function PhotoPicker({
  slots,
  onChange,
  disabled,
  hasMain,
  noMain,
  onDownload,
}: {
  slots: Slot[];
  onChange: (s: Slot[]) => void;
  disabled?: boolean;
  /** The design already has a main photo, so none of these new ones is it. */
  hasMain?: boolean;
  /** No tile is a main photo here (entries and the background removal page). */
  noMain?: boolean;
  /** Shows a download button on each tile. */
  onDownload?: (i: number) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const [cutting, setCutting] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);

  useEffect(() => {
    const made = slots.map((s) => URL.createObjectURL(s.file));
    setUrls(made);
    return () => made.forEach((u) => URL.revokeObjectURL(u));
  }, [slots]);

  const add = (list: FileList | null) => {
    const picked = [...(list || [])].filter((f) => f.type.startsWith('image/'));
    if (picked.length) onChange([...slots, ...picked.map((file) => ({ file }))]);
    if (input.current) input.current.value = '';
  };

  async function cutAll() {
    const todo = slots.map((s, i) => [s, i] as const).filter(([s]) => !s.cut && !s.working);
    if (!todo.length) return;
    setCutting(true);
    let next = slots.map((s, i) => (todo.some(([, j]) => j === i) ? { ...s, working: true } : s));
    onChange(next);
    for (const [slot, i] of todo) {
      try {
        // The model runtime is ~1.5 MB of JS plus a 28 MB wasm, so it loads
        // only when someone actually asks for a background to be removed.
        const { removeBackground } = await import('../lib/bgremove');
        const { file, keptPct } = await removeBackground(slot.file);
        next = next.map((s, j) =>
          j === i ? { file, original: slot.original || slot.file, cut: true, keptPct, working: false } : s
        );
      } catch (e) {
        next = next.map((s, j) =>
          j === i ? { ...s, working: false, failed: e instanceof Error ? e.message : 'failed' } : s
        );
      }
      onChange([...next]);
    }
    setCutting(false);
  }

  const undo = (i: number) =>
    onChange(slots.map((s, j) => (j === i && s.original ? { file: s.original } : s)));

  const edited = (i: number, file: File) => {
    onChange(slots.map((s, j) => (j === i ? { ...s, file, original: s.original || s.file, failed: undefined } : s)));
    setEditing(null);
  };

  const cutCount = slots.filter((s) => s.cut).length;
  const changedCount = slots.filter((s) => s.original).length;
  const canCut = slots.some((s) => !s.cut);

  return (
    <div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2.5">
        {slots.map((s, i) => {
          // A cut-out that keeps almost nothing, or almost everything, is the
          // model failing rather than succeeding. Say so on the tile.
          const suspect = s.cut && (s.keptPct! < 8 || s.keptPct! > 97);
          return (
            <div key={`${s.file.name}-${i}`}
              className="group relative aspect-square overflow-hidden rounded-sm bg-[conic-gradient(#f3f3f3_0_25%,#fff_0_50%,#f3f3f3_0_75%,#fff_0)] bg-[length:14px_14px]">
              <button type="button" onClick={() => setEditing(i)} disabled={disabled || s.working}
                aria-label={`Edit photo ${i + 1}`} title="Edit: fix skew, straighten, crop, tone"
                className="block h-full w-full cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2F4C69]">
                <img src={urls[i]} alt="" className="h-full w-full object-contain" />
              </button>

              {s.working && (
                <span className="absolute inset-0 grid place-items-center bg-white/70 text-[10px] font-semibold text-neutral-600">
                  Cutting…
                </span>
              )}
              {suspect && !s.working && (
                <span className="absolute inset-x-0 top-0 bg-[#98671A] py-0.5 text-center text-[9px] font-semibold text-white">
                  Check this
                </span>
              )}
              {i === 0 && !hasMain && !noMain && !s.working && (
                <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[9.5px] font-semibold uppercase tracking-wide text-white">
                  Main
                </span>
              )}

              <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                {onDownload && (
                  <button type="button" onClick={() => onDownload(i)} aria-label={`Download photo ${i + 1}`}
                    title="Download"
                    className="grid h-5 w-5 place-items-center rounded-full bg-white/90 text-neutral-700 hover:text-[#2F4C69]">
                    <Download className="h-3 w-3" strokeWidth={2.5} />
                  </button>
                )}
                {s.original && (
                  <button type="button" onClick={() => undo(i)} aria-label={`Put the original of photo ${i + 1} back`}
                    title="Put the original back"
                    className="grid h-5 w-5 place-items-center rounded-full bg-white/90 text-neutral-700 hover:text-[#2F4C69]">
                    <Undo2 className="h-3 w-3" strokeWidth={2.5} />
                  </button>
                )}
                <button type="button" onClick={() => onChange(slots.filter((_, j) => j !== i))}
                  aria-label={`Remove photo ${i + 1}`}
                  className="grid h-5 w-5 place-items-center rounded-full bg-white/90 text-neutral-700 hover:text-red-600">
                  <X className="h-3 w-3" strokeWidth={2.5} />
                </button>
              </div>
            </div>
          );
        })}

        <button type="button" onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
          disabled={disabled}
          aria-label="Add photos"
          className={
            'flex aspect-square flex-col items-center justify-center gap-1 rounded-sm border border-dashed transition-colors ' +
            (over ? 'border-[#2F4C69] bg-[#2F4C69]/5' : 'border-neutral-300 hover:border-neutral-500')
          }>
          <Plus className="h-5 w-5 text-neutral-400" strokeWidth={2} />
          <span className="text-[10px] text-neutral-400">{slots.length ? 'Add' : 'Photos'}</span>
        </button>
      </div>

      {slots.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-3">
          <button type="button" onClick={cutAll} disabled={disabled || cutting || !canCut}
            className="flex items-center gap-1.5 rounded-sm border border-neutral-200 px-3 py-1.5 text-[12px] font-semibold hover:border-neutral-400 disabled:opacity-50">
            <Scissors className="h-3.5 w-3.5" strokeWidth={2} />
            {cutting ? 'Removing backgrounds…' : 'Remove backgrounds'}
          </button>
          <span className="text-[11.5px] text-neutral-400">
            {cutCount
              ? `${cutCount} cut out. Hover a tile to undo one.`
              : changedCount
                ? `${changedCount} edited. Hover a tile to undo one.`
                : 'Runs on this computer. Nothing is sent anywhere. Click a photo to edit it.'}
          </span>
        </div>
      )}

      {editing !== null && slots[editing] && (
        <Suspense fallback={null}>
          <PhotoEditor file={slots[editing].file} onApply={(f) => edited(editing, f)} onClose={() => setEditing(null)} />
        </Suspense>
      )}

      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} />
    </div>
  );
}
