import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Plus, X, Undo2, Scissors, Download } from 'lucide-react';
import { ACCEPT } from '../lib/imageIntake';
import {
  addFilesAsSlots, isBusySlot, isReadySlot, isSyncedSlot, replaceFile, restoreOriginal, type Slot, type SlotUpdate,
} from '../lib/photoSlots';

export type { Slot };

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
 *
 * Every added file goes through photo intake first (`lib/imageIntake.ts`):
 * HEIC, TIFF, WebP, RAW previews and the rest become JPEG or PNG, each tile
 * filling in as its conversion finishes. A file that cannot be opened stays
 * as a tile with the reason, and the rest of the drop still loads.
 */

export function PhotoPicker({
  slots,
  onChange,
  disabled,
  hasMain,
  noMain,
  onDownload,
  showSync,
}: {
  slots: Slot[];
  /** A state setter: updates arrive while conversions and cutouts finish. */
  onChange: SlotUpdate;
  disabled?: boolean;
  /** The design already has a main photo, so none of these new ones is it. */
  hasMain?: boolean;
  /** No tile is a main photo here (entries and the background removal page). */
  noMain?: boolean;
  /** Shows a download button on each tile. */
  onDownload?: (i: number) => void;
  /** Tiles upload as they are added (autosave): show each tile's upload state. */
  showSync?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const [cutting, setCutting] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);

  useEffect(() => {
    // only decodable files get a preview; a tile still converting shows its state instead
    const made = slots.map((s) => (isReadySlot(s) ? URL.createObjectURL(s.file) : ''));
    setUrls(made);
    return () => made.forEach((u) => u && URL.revokeObjectURL(u));
  }, [slots]);

  const add = (list: FileList | null) => {
    addFilesAsSlots(list, onChange);
    if (input.current) input.current.value = '';
  };

  // Updates go by tile id, because tiles can be converting, cutting, or
  // removed at the same time.
  const patch = (id: string, fn: (s: Slot) => Slot) =>
    onChange((cur) => cur.map((s) => (s.id === id ? fn(s) : s)));

  async function cutAll() {
    const todo = slots.filter((s) => !s.cut && !isBusySlot(s) && isReadySlot(s));
    if (!todo.length) return;
    setCutting(true);
    const ids = new Set(todo.map((s) => s.id));
    onChange((cur) => cur.map((s) => (ids.has(s.id) ? { ...s, working: true, failed: undefined } : s)));
    for (const slot of todo) {
      try {
        // The model runtime is ~1.5 MB of JS plus a 28 MB wasm, so it loads
        // only when someone actually asks for a background to be removed.
        const { removeBackground } = await import('../lib/bgremove');
        const { file, keptPct } = await removeBackground(slot.file);
        patch(slot.id, (s) => replaceFile(s, file, { cut: true, keptPct, working: false }));
      } catch (e) {
        patch(slot.id, (s) => ({ ...s, working: false, failed: e instanceof Error ? e.message : 'failed' }));
      }
    }
    setCutting(false);
  }

  const undo = (id: string) => patch(id, restoreOriginal);

  const edited = (id: string, file: File) => {
    patch(id, (s) => replaceFile(s, file));
    setEditing(null);
  };

  const remove = (id: string) => onChange((cur) => cur.filter((s) => s.id !== id));

  const cutCount = slots.filter((s) => s.cut).length;
  const changedCount = slots.filter((s) => s.original).length;
  const canCut = slots.some((s) => !s.cut && isReadySlot(s));
  const converting = slots.filter((s) => s.converting).length;
  const rejected = slots.filter((s) => s.rejected).length;
  const failedCuts = slots.filter((s) => s.failed).length;

  return (
    <div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2.5">
        {slots.map((s, i) => {
          // A cut-out that keeps almost nothing, or almost everything, is the
          // model failing rather than succeeding. Say so on the tile.
          const suspect = s.cut && (s.keptPct! < 8 || s.keptPct! > 97);
          return (
            <div key={s.id}
              className="group relative aspect-square overflow-hidden rounded-sm bg-[conic-gradient(#f3f3f3_0_25%,#fff_0_50%,#f3f3f3_0_75%,#fff_0)] bg-[length:14px_14px]">
              {s.rejected ? (
                <div role="alert" aria-label={s.rejected} title={s.rejected}
                  className="flex h-full w-full flex-col justify-center gap-0.5 overflow-hidden border border-red-200 bg-red-50 p-1.5 text-[10px] leading-tight text-red-800 [overflow-wrap:anywhere]">
                  <span className="font-semibold">Could not open</span>
                  <span className="line-clamp-2">{s.file.name}</span>
                </div>
              ) : (
                <button type="button" onClick={() => setEditing(i)} disabled={disabled || isBusySlot(s)}
                  aria-label={`Edit photo ${i + 1}`} title="Edit: fix skew, straighten, crop, tone"
                  className="block h-full w-full cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2F4C69]">
                  {urls[i] && <img src={urls[i]} alt="" className="h-full w-full object-contain" />}
                </button>
              )}

              {s.converting && (
                <span className="absolute inset-0 grid place-items-center bg-white/80 px-1 text-center text-[10px] font-semibold text-neutral-600">
                  Opening…
                  <span className="block max-w-full truncate font-normal text-neutral-400">{s.file.name}</span>
                </span>
              )}
              {s.failed && !s.working && (
                <span title={s.failed} className="absolute inset-x-0 top-0 bg-red-700 px-1 py-0.5 text-center text-[9px] font-semibold text-white">
                  Cutout failed
                </span>
              )}

              {s.working && (
                <span className="absolute inset-0 grid place-items-center bg-white/70 text-[10px] font-semibold text-neutral-600">
                  Cutting…
                </span>
              )}
              {suspect && !s.working && !s.failed && (
                <span className="absolute inset-x-0 top-0 bg-[#98671A] py-0.5 text-center text-[9px] font-semibold text-white">
                  Check this
                </span>
              )}
              {showSync && !s.converting && !s.rejected && !s.working && (
                s.syncError ? (
                  <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-red-700 px-1 py-0.5 text-[9px] font-semibold text-white" title={s.syncError}>
                    Upload failed
                    <button type="button" onClick={() => patch(s.id, (x) => ({ ...x, syncError: undefined }))}
                      aria-label={`Retry uploading photo ${i + 1}`} className="underline underline-offset-2">Retry</button>
                  </span>
                ) : s.syncing || !isSyncedSlot(s) ? (
                  <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[9px] font-semibold text-white">Uploading…</span>
                ) : (
                  <span className="absolute bottom-1 left-1 rounded-sm bg-white/90 px-1 text-[9px] font-semibold text-emerald-700">Saved</span>
                )
              )}
              {i === 0 && !hasMain && !noMain && !isBusySlot(s) && !s.rejected && (
                <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[9.5px] font-semibold uppercase tracking-wide text-white">
                  Main
                </span>
              )}

              <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                {onDownload && isReadySlot(s) && (
                  <button type="button" onClick={() => onDownload(i)} aria-label={`Download photo ${i + 1}`}
                    title="Download"
                    className="grid h-5 w-5 place-items-center rounded-full bg-white/90 text-neutral-700 hover:text-[#2F4C69]">
                    <Download className="h-3 w-3" strokeWidth={2.5} />
                  </button>
                )}
                {s.original && (
                  <button type="button" onClick={() => undo(s.id)} aria-label={`Put the original of photo ${i + 1} back`}
                    title="Put the original back"
                    className="grid h-5 w-5 place-items-center rounded-full bg-white/90 text-neutral-700 hover:text-[#2F4C69]">
                    <Undo2 className="h-3 w-3" strokeWidth={2.5} />
                  </button>
                )}
                <button type="button" onClick={() => remove(s.id)}
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
                : 'Background removal runs on this computer. Click a photo to edit it.'}
          </span>
        </div>
      )}
      <p aria-live="polite" className="mt-1.5 text-[11.5px] empty:hidden">
        {converting > 0 && <span className="mr-3 text-neutral-500">Opening {converting} photo{converting > 1 ? 's' : ''}…</span>}
        {rejected > 0 && (
          <span className="mr-3 block text-red-700">
            {slots.filter((s) => s.rejected).map((s) => <span key={s.id} className="block">{s.rejected}</span>)}
          </span>
        )}
        {failedCuts > 0 && (
          <span className="text-red-700">
            Background removal failed on {failedCuts} photo{failedCuts > 1 ? 's' : ''}
            {slots.find((s) => s.failed)?.failed ? `: ${slots.find((s) => s.failed)!.failed}` : ''}.
          </span>
        )}
      </p>

      {editing !== null && slots[editing] && (
        <Suspense fallback={null}>
          <PhotoEditor file={slots[editing].file} onApply={(f) => edited(slots[editing].id, f)} onClose={() => setEditing(null)} />
        </Suspense>
      )}

      <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => add(e.target.files)} />
    </div>
  );
}
