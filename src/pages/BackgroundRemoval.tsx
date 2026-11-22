import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, ImagePlus, Send } from 'lucide-react';
import { PhotoPicker, type Slot } from '../components/PhotoPicker';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SaveStatus } from '../components/SaveStatus';
import { saveBlob, saveZip, today } from '../lib/download';
import { useUnsavedWork } from '../lib/tabContext';
import { ACCEPT } from '../lib/imageIntake';
import {
  addFilesAsSlots, fetchFile, fillSavedSlots, isBusySlot, isReadySlot, limiter, needsUpload, newSlotId,
  placeholderSlots, savedPhotos,
} from '../lib/photoSlots';
import { SendToDialog } from '../components/SendToDialog';
import {
  DESTINATION_LABEL, DESTINATION_PATH, deliver, deliveryId, sentNote, type Destination, type SendTarget,
} from '../lib/sendTo';
import { newEntryId, uploadEntryPhoto } from '../lib/studioEntries';
import { appendDesignPhotos } from '../lib/designAppend';
import { designIO } from '../lib/designIO';
import { usePhotoSync } from '../lib/usePhotoSync';
import { useAutosave } from '../lib/useAutosave';
import { currentActor } from '../lib/auth';
import { loadBgDraft, saveBgDraft, saveBgDraftOnExit, uploadBgFile, type BgPhoto } from '../lib/bgDraft';

/**
 * Background removal on its own page, for photos that are not going into the
 * library. Drop photos, remove backgrounds, edit, download.
 *
 * The processing runs on her computer. The photos themselves are kept as a
 * draft in the portal (one per person, `lib/bgDraft.ts`), uploaded as they
 * are added and after every cutout or edit, so a refresh, a crash or a
 * closed tab loses nothing. Clear all empties the draft.
 */
export function BackgroundRemoval() {
  const actor = useMemo(() => currentActor(), []);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loaded, setLoaded] = useState<'loading' | 'ready' | 'failed'>(actor ? 'loading' : 'ready');
  const [zipping, setZipping] = useState(false);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Bring back what she had: tiles show at once, files come down behind them.
  useEffect(() => {
    if (!actor) return;
    let live = true;
    loadBgDraft(actor.uid).then((photos) => {
      if (!live) return;
      const tiles = placeholderSlots(photos.map((p) => ({ ...p, uploadedAt: p.updatedAt })))
        .map((t, i) => (photos[i].sent ? { ...t, sent: photos[i].sent } : t));
      setSlots(tiles);
      fillSavedSlots(tiles, setSlots);
      setLoaded('ready');
    }).catch(() => { if (live) setLoaded('failed'); });
    return () => { live = false; };
  }, [actor]);

  const upload = useCallback((f: File) => uploadBgFile(actor!.uid, f), [actor]);
  usePhotoSync(slots, setSlots, actor && loaded === 'ready' ? upload : null);

  const photos = useMemo<BgPhoto[]>(() => {
    const kept = slots.filter((s) => s.remote); // savedPhotos keeps this order
    return savedPhotos(slots).map((p, i) => ({
      name: p.name, url: p.url, path: p.path,
      ...(p.originalUrl ? { originalUrl: p.originalUrl, originalPath: p.originalPath } : {}),
      cut: !!p.cut, ...(p.cutOfOriginal ? { cutOfOriginal: true } : {}),
      ...(kept[i].sent ? { sent: kept[i].sent } : {}),
      updatedAt: p.uploadedAt,
    }));
  }, [slots]);

  const { status, dirty } = useAutosave<BgPhoto[]>(
    actor && loaded === 'ready' ? photos : null,
    (list) => saveBgDraft(actor!, list),
    (list) => saveBgDraftOnExit(actor!, list),
    true, // what was loaded is already saved
  );

  const busy = slots.some(isBusySlot);
  const ready = slots.filter(isReadySlot);
  const uploading = actor ? slots.filter(needsUpload).length : 0;
  const failedUploads = slots.filter((s) => s.syncError).length;
  useUnsavedWork(dirty || uploading > 0 || status.state === 'error'
    ? 'Some photos on this page are still being saved. Closing now may lose them.'
    : !actor && slots.length
      ? 'You are not signed in, so these photos are not kept. Download them first.'
      : null);

  const add = (list: FileList | null) => addFilesAsSlots(list, setSlots);

  // ─── Send to ───────────────────────────────────────────────────────────
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<{ text: string; to?: Destination; error?: boolean } | null>(null);
  // the last destination, for Retry on a tile that failed (a new entry keeps its id)
  const last = useRef<{ target: SendTarget; removeAfter: boolean; entryId?: string } | null>(null);
  const sendable = (s: Slot) => !s.rejected && !s.working && !(s.converting && !s.remote) && s.send?.state !== 'sending' && s.send?.state !== 'waiting';
  const chosen = slots.filter((s) => selected.has(s.id) && sendable(s));
  const choosable = slots.filter(sendable);
  const allTicked = choosable.length > 0 && choosable.every((s) => selected.has(s.id));
  const someTicked = choosable.some((s) => selected.has(s.id));
  const selectAll = useRef<HTMLInputElement>(null);
  useEffect(() => { if (selectAll.current) selectAll.current.indeterminate = someTicked && !allTicked; }, [someTicked, allTicked]);

  const toggle = useCallback((id: string) => setSelected((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);

  const markSend = (ids: Set<string>, send: Slot['send']) =>
    setSlots((cur) => cur.map((s) => (ids.has(s.id) ? { ...s, send } : s)));
  const failOne = (id: string, message: string) =>
    setSlots((cur) => cur.map((s) => (s.id === id ? { ...s, send: { state: 'failed', message } } : s)));
  /** Sent: a note on the tile, or off the page when she asked for that. Nothing is deleted. */
  const settle = (ids: Set<string>, note: string, removeAfter: boolean) => {
    setSlots((cur) => (removeAfter
      ? cur.filter((s) => !ids.has(s.id))
      : cur.map((s) => (ids.has(s.id) ? { ...s, send: undefined, sent: note } : s))));
    setSelected((cur) => new Set([...cur].filter((id) => !ids.has(id))));
  };

  /** The bytes already in memory, or the draft's copy from Storage. */
  async function bytesOf(s: Slot): Promise<{ file: File; original?: File }> {
    if (isReadySlot(s) && s.file.size > 0) return { file: s.file, original: s.original };
    if (!s.remote) throw new Error('This photo is not ready yet.');
    const [file, original] = await Promise.all([
      fetchFile(s.remote.url, s.remote.name),
      s.remoteOriginal ? fetchFile(s.remoteOriginal.url, s.remote.name) : Promise.resolve(undefined),
    ]);
    return { file, original };
  }

  async function send(target: SendTarget, removeAfter: boolean, only?: Slot[]) {
    const list = only || chosen;
    if (!list.length) return;
    const retry = !!only;
    setPicking(false);
    setSending(true);
    setSendMsg(null);
    const ids = new Set(list.map((s) => s.id));
    const msg = (e: unknown) => (e instanceof Error ? e.message : 'Could not send it.');
    const run = limiter(3);
    const failedText = (n: number) => `${n} photo${n > 1 ? 's' : ''} could not be sent. ${n > 1 ? 'They stay' : 'It stays'} selected here; use Retry on the tile.`;
    try {
      if (target.to !== 'library') {
        // Entries: upload into the entry's own folder here, with progress on
        // each tile, then hand the tiles over already in the cloud.
        const kind = target.to;
        const sameNew = retry && last.current && !('entry' in last.current.target && last.current.target.entry)
          && last.current.target.to === kind ? last.current.entryId : undefined;
        const entryId = target.entry?.id || sameNew || newEntryId(kind);
        last.current = { target, removeAfter, entryId };
        markSend(ids, { state: 'sending' });
        const done = await Promise.all(list.map((s) => run(async () => {
          try {
            const { file, original } = await bytesOf(s);
            const [main, orig] = await Promise.all([
              uploadEntryPhoto(kind, entryId, file),
              original ? uploadEntryPhoto(kind, entryId, original) : Promise.resolve(null),
            ]);
            const slot: Slot = {
              id: newSlotId(), file, original, cut: s.cut, keptPct: s.keptPct, cutOfOriginal: s.cutOfOriginal,
              remote: main, remoteFor: file, ...(orig ? { remoteOriginal: orig, remoteOriginalFor: original } : {}),
            };
            return { id: s.id, slot };
          } catch (e) {
            failOne(s.id, msg(e));
            return { id: s.id, slot: null };
          }
        })));
        const ok = done.filter((d) => d.slot);
        const failed = done.length - ok.length;
        if (ok.length) {
          deliver({ id: deliveryId(), to: kind, entryId, isNew: !target.entry && !sameNew, slots: ok.map((d) => d.slot!) });
          settle(new Set(ok.map((d) => d.id)), sentNote(kind, target.entry?.customerName || 'new entry'), removeAfter);
        }
        if (failed) setSendMsg({ text: `${ok.length ? `${ok.length} sent to ${DESTINATION_LABEL[kind]}. ` : ''}${failedText(failed)}`, to: ok.length ? kind : undefined, error: true });
        else navigate(DESTINATION_PATH[kind]);
        return;
      }

      last.current = { target, removeAfter };
      // Library: fetch any photo not in memory first.
      markSend(ids, { state: 'sending' });
      const got = await Promise.all(list.map((s) => run(async () => {
        try { return { s, ...(await bytesOf(s)) }; } catch (e) { failOne(s.id, msg(e)); return null; }
      })));
      const ready = got.filter((g): g is NonNullable<typeof g> => !!g);
      if (!ready.length) { setSendMsg({ text: failedText(list.length), error: true }); return; }

      if (!target.product) {
        // New design: the form opens with these photos; they are sent when
        // she creates the design, and come back here if she closes it.
        const readyIds = new Set(ready.map((g) => g.s.id));
        markSend(readyIds, { state: 'waiting' });
        deliver({
          id: deliveryId(), to: 'library', action: 'new',
          slots: ready.map((g) => ({ id: newSlotId(), file: g.file, original: g.original, cut: g.s.cut, cutOfOriginal: g.s.cutOfOriginal })),
          onCreated: (p) => settle(readyIds, sentNote('library', p.styleNumber), removeAfter),
          onCancel: () => markSend(readyIds, undefined),
        });
        navigate(DESTINATION_PATH.library);
        return;
      }

      // Existing design: the same upload and save as Edit design.
      let product = target.product;
      let okIds = new Set<string>();
      try {
        const res = await appendDesignPhotos(target.product, ready.map((g) => g.file), designIO, (i, err) => {
          if (err) failOne(ready[i].s.id, err);
          else okIds.add(ready[i].s.id);
        });
        product = res.product;
      } catch (e) {
        okIds = new Set();
        ready.forEach((g) => failOne(g.s.id, msg(e)));
      }
      const failed = list.length - okIds.size;
      if (okIds.size) {
        deliver({ id: deliveryId(), to: 'library', action: 'open', product });
        settle(okIds, sentNote('library', product.styleNumber), removeAfter);
      }
      if (failed) setSendMsg({ text: `${okIds.size ? `${okIds.size} sent to Library. ` : ''}${failedText(failed)}`, to: okIds.size ? 'library' : undefined, error: true });
      else navigate(DESTINATION_PATH.library);
    } finally {
      setSending(false);
    }
  }

  const retry = (id: string) => {
    const s = slots.find((x) => x.id === id);
    if (!s || !last.current) { setPicking(true); return; }
    void send(last.current.target, last.current.removeAfter, [s]);
  };

  async function downloadAll() {
    setZipping(true);
    setError('');
    try {
      await saveZip(ready.map((s) => ({ name: s.file.name, blob: s.file })), `photos-${today()}.zip`);
    } catch {
      setError('Could not make the zip. Try downloading the photos one at a time.');
    } finally {
      setZipping(false);
    }
  }

  return (
    <div className="min-h-full bg-white text-neutral-900">
      <main className="mx-auto w-full max-w-[1100px] px-4 pb-16 sm:px-7">
        <div className="mt-8 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="font-serif text-[26px] font-normal">Background Removal</h1>
          {actor && <SaveStatus status={status} uploading={uploading} failed={failedUploads} />}
        </div>
        <p className="mt-1.5 max-w-[640px] text-[13.5px] text-neutral-500">
          Drop photos here, remove their backgrounds, then click a photo to fix skew, straighten,
          crop or adjust the tone. Download them one by one or all together. The processing runs on
          your computer; the photos are kept as your draft in the portal until you clear them, so a
          refresh does not lose them.
        </p>

        {loaded === 'loading' ? (
          <p className="mt-7 text-[13px] text-neutral-400">Opening your draft…</p>
        ) : loaded === 'failed' ? (
          <p role="alert" className="mt-7 text-[13px] text-red-700">
            Could not open your saved draft. Reload the page to try again. Nothing in it has been changed.
          </p>
        ) : slots.length === 0 ? (
          <label
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
            className={
              'mt-7 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed px-6 py-16 text-center transition-colors focus-within:border-[#2F4C69] ' +
              (over ? 'border-[#2F4C69] bg-[#2F4C69]/5' : 'border-neutral-300 hover:border-neutral-500')
            }>
            <ImagePlus className="h-7 w-7 text-neutral-400" strokeWidth={1.5} />
            <span className="text-[14px] font-semibold">Drop photos here, or click to choose</span>
            <span className="text-[12.5px] text-neutral-400">JPG, PNG, HEIC, TIFF, WebP and most camera RAW files work.</span>
            <input type="file" accept={ACCEPT} multiple className="sr-only" onChange={(e) => add(e.target.files)} />
          </label>
        ) : (
          <div className="mt-7">
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                <input ref={selectAll} type="checkbox" checked={allTicked} disabled={!choosable.length || sending}
                  onChange={() => setSelected(allTicked ? new Set() : new Set(choosable.map((s) => s.id)))}
                  className="h-4 w-4 accent-[#2F4C69]" />
                Select all
              </label>
              <span className="text-[12.5px] text-neutral-400" aria-live="polite">
                {chosen.length ? `${chosen.length} selected` : 'Tick photos to send them on'}
              </span>
              <button type="button" onClick={() => setPicking(true)} disabled={!chosen.length || sending}
                aria-haspopup="dialog"
                className="flex items-center gap-1.5 rounded-sm border border-[#2F4C69] px-3 py-1.5 text-[12.5px] font-semibold text-[#2F4C69] hover:bg-[#2F4C69]/5 disabled:border-neutral-200 disabled:text-neutral-400">
                <Send className="h-3.5 w-3.5" strokeWidth={2} />
                {sending ? 'Sending…' : 'Send to'}
              </button>
            </div>
            {sendMsg && (
              <div role="status" className={'mb-3 flex flex-wrap items-center gap-3 border-l-2 px-3 py-2 text-[12.5px] ' +
                (sendMsg.error ? 'border-red-700 bg-red-50 text-red-800' : 'border-[#2F4C69] bg-neutral-50')}>
                <span className="flex-1">{sendMsg.text}</span>
                {sendMsg.to && (
                  <button type="button" onClick={() => navigate(DESTINATION_PATH[sendMsg.to!])}
                    className="font-semibold text-[#2F4C69] hover:underline">Open {DESTINATION_LABEL[sendMsg.to]}</button>
                )}
                <button type="button" onClick={() => setSendMsg(null)} className="text-neutral-500 hover:text-neutral-900">Dismiss</button>
              </div>
            )}
            <PhotoPicker slots={slots} onChange={setSlots} noMain showSync={!!actor}
              select={{ selected, toggle, onRetry: retry }}
              onDownload={(i) => saveBlob(slots[i].file, slots[i].file.name)} />
          </div>
        )}

        {slots.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-neutral-100 pt-5">
            <button type="button" onClick={downloadAll} disabled={zipping || busy || !ready.length}
              className="flex items-center gap-2 rounded-sm bg-[#2F4C69] px-[18px] py-2.5 text-[13px] font-semibold text-white disabled:opacity-60">
              <Download className="h-4 w-4" strokeWidth={2} />
              {zipping ? 'Making the zip…' : `Download all (${ready.length})`}
            </button>
            <button type="button" disabled={busy} onClick={() => setClearing(true)}
              className="text-[13px] text-neutral-500 hover:text-neutral-900 disabled:opacity-50">
              Clear all
            </button>
            {error && <span role="alert" className="text-[12.5px] text-red-600">{error}</span>}
          </div>
        )}
      </main>

      {picking && (
        <SendToDialog count={chosen.length} onClose={() => setPicking(false)}
          onSend={(target, removeAfter) => void send(target, removeAfter)} />
      )}

      {clearing && (
        <ConfirmDialog
          title="Clear all photos?"
          message="They are taken off this page and out of your draft. Download anything you need first."
          confirmLabel="Clear all" danger
          onCancel={() => setClearing(false)}
          onConfirm={() => { setClearing(false); setSlots([]); }}
        />
      )}
    </div>
  );
}
