import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, ImagePlus } from 'lucide-react';
import { PhotoPicker, type Slot } from '../components/PhotoPicker';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SaveStatus } from '../components/SaveStatus';
import { saveBlob, saveZip, today } from '../lib/download';
import { useUnsavedWork } from '../lib/tabContext';
import { ACCEPT } from '../lib/imageIntake';
import {
  addFilesAsSlots, fillSavedSlots, isBusySlot, isReadySlot, needsUpload, placeholderSlots, savedPhotos,
} from '../lib/photoSlots';
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
      const tiles = placeholderSlots(photos.map((p) => ({ ...p, uploadedAt: p.updatedAt })));
      setSlots(tiles);
      fillSavedSlots(tiles, setSlots);
      setLoaded('ready');
    }).catch(() => { if (live) setLoaded('failed'); });
    return () => { live = false; };
  }, [actor]);

  const upload = useCallback((f: File) => uploadBgFile(actor!.uid, f), [actor]);
  usePhotoSync(slots, setSlots, actor && loaded === 'ready' ? upload : null);

  const photos = useMemo<BgPhoto[]>(() => savedPhotos(slots).map((p) => ({
    name: p.name, url: p.url, path: p.path,
    ...(p.originalUrl ? { originalUrl: p.originalUrl, originalPath: p.originalPath } : {}),
    cut: !!p.cut, updatedAt: p.uploadedAt,
  })), [slots]);

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
            <PhotoPicker slots={slots} onChange={setSlots} noMain showSync={!!actor}
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
