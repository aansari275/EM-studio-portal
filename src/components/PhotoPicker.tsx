import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Plus, X, Undo2, Scissors, Download } from 'lucide-react';
import { ACCEPT } from '../lib/imageIntake';
import { Working, Spinner } from './Working';
import { RotateButton } from './Rotate';
import { busySummary, CUT_LABEL, type Job } from '../lib/jobStatus';
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
  select,
  rotate,
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
  /** Tick boxes on the tiles (Background Removal's Send to), with Retry for a failed send. */
  select?: { selected: Set<string>; toggle: (id: string) => void; onRetry?: (id: string) => void };
  /**
   * A round turn button on each tile (Custom Rugs, Sample Dispatch). Like the
   * Library: the turn shows at once and is applied when the clicks stop, as an
   * edit of the tile (new file, first original kept, Undo puts it back).
   */
  rotate?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const [cutting, setCutting] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  /** Open the editor on Touch up (from a Check this note). */
  const [touchFirst, setTouchFirst] = useState(false);
  const edit = (i: number, touch = false) => { setTouchFirst(touch); setEditing(i); };

  // ─── turning tiles (rotate) ───────────────────────────────────────────
  const latest = useRef(slots);
  latest.current = slots;
  const [turns, setTurns] = useState<Record<string, number>>({});
  const [turning, setTurning] = useState<Record<string, boolean>>({});
  const [turnError, setTurnError] = useState<Record<string, string>>({});
  const turnTimers = useRef(new Map<string, number>());
  const turnCount = useRef(new Map<string, number>());
  useEffect(() => () => turnTimers.current.forEach((t) => window.clearTimeout(t)), []);
  const setFor = <T,>(set: (f: (m: Record<string, T>) => Record<string, T>) => void, id: string, v: T | undefined) =>
    set((m) => { const n = { ...m }; if (v === undefined) delete n[id]; else n[id] = v; return n; });

  function turnTile(id: string) {
    if (turning[id]) return;
    setFor(setTurnError, id, undefined);
    const n = (turnCount.current.get(id) || 0) + 1;
    turnCount.current.set(id, n);
    setFor(setTurns, id, n);
    window.clearTimeout(turnTimers.current.get(id));
    // Quick clicks are one turn of 180° or 270°, not two or three saves.
    turnTimers.current.set(id, window.setTimeout(async () => {
      const q = turnCount.current.get(id) || 0;
      turnCount.current.delete(id);
      turnTimers.current.delete(id);
      const done = () => { setFor(setTurns, id, undefined); setFor(setTurning, id, undefined); };
      const slot = latest.current.find((x) => x.id === id);
      if (!slot || q % 4 === 0) { done(); return; }
      setFor(setTurning, id, true);
      try {
        const { rotateBlob } = await import('../lib/canvasImage');
        // Full resolution stays (the upload caps it at 2000px, the editor works from this file).
        const turned = await rotateBlob(slot.file, q, 6000);
        const name = slot.file.name.replace(/\.[^.]+$/, '') + '.' + turned.ext;
        const file = new File([turned.blob], name, { type: turned.type });
        // Only if nothing else changed the photo meanwhile (a cutout finishing).
        patch(id, (x) => (x.file === slot.file ? replaceFile(x, file, { cutOfOriginal: false }) : x));
      } catch (e) {
        setFor(setTurnError, id, e instanceof Error ? e.message : 'Could not turn the photo.');
      } finally {
        done();
      }
    }, 900));
  }

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
    const of = todo.length;
    const at = (i: number) => (of > 1 ? { n: i + 1, of } : {});
    onChange((cur) => cur.map((s) => (ids.has(s.id)
      ? { ...s, working: true, failed: undefined, job: { label: 'Waiting', ...at(todo.findIndex((t) => t.id === s.id)) } } : s)));
    for (let i = 0; i < todo.length; i++) {
      const slot = todo[i];
      const say = (label: string) => patch(slot.id, (s) => ({ ...s, job: { label, ...at(i) } }));
      try {
        say(CUT_LABEL.finding);
        // The model runtime is ~1.5 MB of JS plus a 28 MB wasm, so it loads
        // only when someone actually asks for a background to be removed.
        const { removeBackground } = await import('../lib/bgremove');
        const { file, keptPct, warning } = await removeBackground(slot.file, 2000, (st) => say(CUT_LABEL[st]));
        // A cutout of the photo as it came in keeps its framing, so the editor
        // can work from the full-resolution original later.
        patch(slot.id, (s) => replaceFile(s, file, { cut: true, keptPct, cutWarn: warning || undefined, working: false, job: undefined, cutOfOriginal: !s.original }));
      } catch (e) {
        patch(slot.id, (s) => ({ ...s, working: false, job: undefined, failed: e instanceof Error ? e.message : 'failed' }));
      }
    }
    setCutting(false);
  }

  const undo = (id: string) => patch(id, restoreOriginal);

  // A touch up alone keeps the cutout a direct cut of its original (same
  // framing, alpha and original pixels only), so it can be touched up again
  // and the editor still samples the full-resolution original. Her look
  // answers the Check this note, so the note goes.
  const edited = (id: string, file: File, info: { touchOnly: boolean }) => {
    patch(id, (s) => replaceFile(s, file, info.touchOnly
      ? { cutOfOriginal: s.cutOfOriginal, cutWarn: undefined, keptPct: undefined }
      : { cutOfOriginal: false }));
    setEditing(null);
  };

  const remove = (id: string) => onChange((cur) => cur.filter((s) => s.id !== id));

  const cutCount = slots.filter((s) => s.cut).length;
  const changedCount = slots.filter((s) => s.original).length;
  const canCut = slots.some((s) => !s.cut && isReadySlot(s));
  // One line for every tile that is busy, read out politely (no percentages).
  const busyLine = busySummary(slots.filter((s) => s.job && (s.converting || s.working || s.syncing || s.send?.state === 'sending')).map((s) => s.job as Job));
  const rejected = slots.filter((s) => s.rejected).length;
  const failedCuts = slots.filter((s) => s.failed).length;

  return (
    <div>
      {/* tiles with tick boxes are wider, so the box and the tile buttons never overlap */}
      <div className={'grid gap-2.5 ' + (select ? 'grid-cols-[repeat(auto-fill,minmax(112px,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(84px,1fr))]')}>
        {slots.map((s, i) => {
          // A cut-out that keeps almost nothing or almost everything, touches
          // the frame, or is partly see-through needs a human look. Say so on
          // the tile, and why under it. (keptPct alone for cutouts made before.)
          const suspect = s.cut && (!!s.cutWarn || s.keptPct! < 8 || s.keptPct! > 97);
          const ticked = !!select?.selected.has(s.id);
          return (
            <div key={s.id} className="min-w-0">
            <div
              className={'group relative aspect-square overflow-hidden rounded-sm bg-[conic-gradient(#f3f3f3_0_25%,#fff_0_50%,#f3f3f3_0_75%,#fff_0)] bg-[length:14px_14px] ' +
                (ticked ? 'shadow-[0_0_0_2px_#2F4C69]' : '')}>
              {s.rejected ? (
                <div role="alert" aria-label={s.rejected} title={s.rejected}
                  className="flex h-full w-full flex-col justify-center gap-0.5 overflow-hidden border border-red-200 bg-red-50 p-1.5 text-[10px] leading-tight text-red-800 [overflow-wrap:anywhere]">
                  <span className="font-semibold">Could not open</span>
                  <span className="line-clamp-2">{s.file.name}</span>
                </div>
              ) : (
                <button type="button" onClick={() => edit(i)} disabled={disabled || isBusySlot(s)}
                  aria-label={`Edit photo ${i + 1}`} title={s.cut ? 'Edit: touch up, fix skew, straighten, crop, tone' : 'Edit: fix skew, straighten, crop, tone'}
                  className="block h-full w-full cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2F4C69]">
                  {urls[i] && <img src={urls[i]} alt="" className="h-full w-full object-contain"
                    style={turns[s.id] ? { transform: `rotate(${turns[s.id] * 90}deg)`, transition: 'transform 200ms ease' } : undefined} />}
                </button>
              )}

              {s.converting && (
                <span className="absolute inset-0 grid place-items-center bg-white/85 px-1 text-neutral-700">
                  <Working key={s.job?.label} job={s.job || { label: 'Opening', detail: s.remote?.name || s.file.name }} />
                </span>
              )}
              {s.failed && !s.working && (
                <span title={s.failed} className="absolute inset-x-0 top-0 bg-red-700 px-1 py-0.5 text-center text-[9px] font-semibold text-white">
                  Cutout failed
                </span>
              )}

              {s.working && (
                <span className="absolute inset-0 grid place-items-center bg-white/80 px-1 text-neutral-700">
                  <Working key={s.job?.label} job={s.job || { label: 'Removing the background' }} />
                </span>
              )}
              {suspect && !s.working && !s.failed && (
                <span title={s.cutWarn} className="absolute inset-x-0 top-0 bg-[#98671A] py-0.5 text-center text-[9px] font-semibold text-white">
                  Check this
                </span>
              )}
              {showSync && !s.converting && !s.rejected && !s.working && !s.send && (
                s.syncError ? (
                  <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-red-700 px-1 py-0.5 text-[9px] font-semibold text-white" title={s.syncError}>
                    Upload failed
                    <button type="button" onClick={() => patch(s.id, (x) => ({ ...x, syncError: undefined }))}
                      aria-label={`Retry uploading photo ${i + 1}`} className="underline underline-offset-2">Retry</button>
                  </span>
                ) : s.syncing || !isSyncedSlot(s) ? (
                  <span className="absolute inset-x-0 bottom-0 bg-white/90 px-1 py-0.5 text-neutral-800">
                    <Working key={s.job?.label} compact job={s.job || { label: 'Uploading' }} />
                  </span>
                ) : (
                  <span className="absolute bottom-1 left-1 rounded-sm bg-white/90 px-1 text-[9px] font-semibold text-emerald-700">Saved</span>
                )
              )}
              {s.send?.state === 'sending' && (
                <span className="absolute inset-0 grid place-items-center bg-white/85 px-1 text-neutral-700">
                  <Working key={s.job?.label} job={s.job || { label: 'Sending' }} />
                </span>
              )}
              {s.send?.state === 'waiting' && (
                <span className="absolute inset-x-0 bottom-0 bg-[#2F4C69] px-1 py-0.5 text-center text-[9px] font-semibold text-white"
                  title="Waiting for the new design to be created in Library">
                  In New design
                </span>
              )}
              {s.send?.state === 'failed' && (
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-red-700 px-1 py-0.5 text-[9px] font-semibold text-white"
                  title={s.send.message}>
                  Not sent
                  {select?.onRetry && (
                    <button type="button" onClick={() => select.onRetry!(s.id)} aria-label={`Retry sending photo ${i + 1}`}
                      className="underline underline-offset-2">Retry</button>
                  )}
                </span>
              )}
              {select && !s.rejected && (
                <label className="absolute left-1 top-1 z-10 grid h-6 w-6 cursor-pointer place-items-center rounded-sm bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.15)]"
                  title="Select for Send to">
                  <input type="checkbox" checked={ticked} onChange={() => select.toggle(s.id)}
                    aria-label={`Select photo ${i + 1}`}
                    className="h-4 w-4 cursor-pointer accent-[#2F4C69]" />
                </label>
              )}
              {i === 0 && !hasMain && !noMain && !isBusySlot(s) && !s.rejected && (
                <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[9.5px] font-semibold uppercase tracking-wide text-white">
                  Main
                </span>
              )}

              {rotate && !s.rejected && !s.converting && !s.working && (() => {
                const bar = (showSync && (!!s.syncError || s.syncing || !isSyncedSlot(s))) || !!s.send;
                const uploadingNow = showSync && !s.syncError && (s.syncing || !isSyncedSlot(s));
                return (
                  <RotateButton onClick={() => turnTile(s.id)} busy={!!turning[s.id]}
                    disabled={disabled || uploadingNow}
                    label={`Turn photo ${i + 1} 90° clockwise`}
                    className={'absolute right-1 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-neutral-700 shadow-[0_1px_3px_rgba(0,0,0,0.2)] hover:text-[#2F4C69] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2F4C69] [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 [&_svg]:h-4 [&_svg]:w-4 '
                      + (bar ? 'bottom-6' : 'bottom-1')} />
                );
              })()}

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
            {suspect && !s.working && !s.failed && (
              <>
                {s.cutWarn && <p className="mt-1 line-clamp-3 text-[10px] leading-tight text-[#7a5215]" title={s.cutWarn}>{s.cutWarn}</p>}
                <button type="button" onClick={() => edit(i, true)} disabled={disabled || isBusySlot(s)}
                  aria-label={`Touch up photo ${i + 1}`}
                  className="mt-0.5 min-h-[44px] w-full rounded-sm border border-[#98671A]/40 px-1 text-[11px] font-semibold text-[#7a5215] hover:bg-[#98671A]/10 disabled:opacity-50">
                  Touch up
                </button>
              </>
            )}
            {turnError[s.id] && (
              <p role="alert" className="mt-1 line-clamp-2 text-[10px] leading-tight text-red-700" title={turnError[s.id]}>{turnError[s.id]}</p>
            )}
            {s.sent && (
              <p className="mt-1 line-clamp-2 text-[10px] leading-tight text-[#2F4C69]" title={s.sent}>{s.sent}</p>
            )}
            {s.send?.state === 'failed' && s.send.message && (
              <p className="mt-1 line-clamp-2 text-[10px] leading-tight text-red-700" title={s.send.message}>{s.send.message}</p>
            )}
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
            {cutting ? <Spinner /> : <Scissors className="h-3.5 w-3.5" strokeWidth={2} />}
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
        {busyLine && <span className="mr-3 block text-neutral-600">{busyLine}</span>}
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
          <PhotoEditor file={slots[editing].file}
            full={slots[editing].cutOfOriginal ? slots[editing].original : undefined}
            cameraFrame={!slots[editing].original || !!slots[editing].cutOfOriginal}
            hasOriginal={!!slots[editing].original}
            initialTool={touchFirst ? 'touch' : undefined}
            onApply={(f, info) => edited(slots[editing].id, f, info)} onClose={() => setEditing(null)} />
        </Suspense>
      )}

      <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => add(e.target.files)} />
    </div>
  );
}
