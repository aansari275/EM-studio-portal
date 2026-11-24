import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Presentation, Trash2, X } from 'lucide-react';
import { PhotoPicker, type Slot } from './PhotoPicker';
import {
  fillSavedSlots, isSyncedSlot, needsUpload, placeholderSlots, savedPhotos,
} from '../lib/photoSlots';
import { usePhotoSync, type SyncUpload } from '../lib/usePhotoSync';
import { useAutosave } from '../lib/useAutosave';
import { CustomerPicker } from './CustomerPicker';
import { ConfirmDialog } from './ConfirmDialog';
import { SaveStatus } from './SaveStatus';
import { Label } from './NewProduct';
import {
  discardDraft, fetchPhoto, newEntryId, promoteEntry, saveEntryFields, saveEntryFieldsOnExit, softDeleteEntry,
  uploadEntryPhoto, KIND_NOUN, formatDate,
  type Customer, type EntryFields, type EntryKind, type EntryPhoto, type StudioEntry,
} from '../lib/studioEntries';
import { currentActor, type Actor } from '../lib/auth';
import { saveZip, today } from '../lib/download';
import { useTabActive, useUnsavedWork } from '../lib/tabContext';
import { PhotoStrip } from './PhotoOrder';
import { SlideBoxes } from './SlidePreview';
import { photoSlotsFor, isDefaultSlots, toFrac, type Box, type SlideLayout } from '../lib/deckSlots';
import { entryDeckFileName, entryDeckRecord, reorderBy } from '../lib/studioEntryDeck';

// pptxgenjs is large: the deck dialog loads only when Download PPT is pressed.
const PptDialog = lazy(() => import('./PptDialog'));

/**
 * New entry, a draft being continued, or a saved entry. Everything autosaves
 * (cloud only, ~1.5 s after the last change, keepalive write on pagehide):
 *
 * - New: nothing is written until the form has something in it (customer,
 *   note or a photo); then the entry is created as a draft. Photos upload in
 *   the background as they are added, each tile showing its own state.
 *   Cutouts and edits upload too, with the pre-edit original kept, so Undo
 *   still works after a reload. Closing keeps the draft. Save entry flips it
 *   to saved; Discard draft soft deletes it.
 * - Saved: details save as she types (when they are complete), added photos
 *   join the entry once uploaded, removed photos are taken off (files kept).
 */

const lineCls =
  'mt-1 w-full border-b border-neutral-200 bg-transparent pb-1.5 text-[15px] outline-none focus:border-[#2F4C69]';

type Confirm = { title: string; message: string; confirmLabel: string; cancelLabel?: string; danger?: boolean; run: () => void };

export function EntryDialog({
  kind, entry, presetId, incoming, customers, customersLoading, onAddCustomer, onClose, onSaved, onChanged, onDeleted, onDiscarded,
}: {
  kind: EntryKind;
  /** Absent for a new entry. A draft or a saved entry otherwise. */
  entry?: StudioEntry;
  /** The id a new entry is created under (Send to uploads into its folder first). */
  presetId?: string;
  /**
   * Photos sent here from Background Removal, already uploaded into this
   * entry's folder. Each new `nonce` adds its tiles once, also while the
   * dialog is already open.
   */
  incoming?: { nonce: number; slots: Slot[] } | null;
  customers: Customer[];
  customersLoading?: boolean;
  onAddCustomer: (name: string) => Promise<void>;
  onClose: () => void;
  /** Save entry finished: the entry is now saved. */
  onSaved: (e: StudioEntry) => void;
  /** An autosave was written: the list can show the latest. */
  onChanged: (e: StudioEntry) => void;
  /** A saved entry was deleted (soft). */
  onDeleted: (e: StudioEntry) => void;
  /** A draft was discarded (soft). */
  onDiscarded: (id: string) => void;
}) {
  const [mode] = useState<'new' | 'draft' | 'saved'>(() => (!entry ? 'new' : entry.status));
  const [id] = useState(() => entry?.id || presetId || newEntryId(kind));
  const [created, setCreated] = useState(!!entry);
  const createdRef = useRef(!!entry); // read by the save callbacks, which can run back to back
  const actor = useMemo<Actor>(() => currentActor() || { uid: '', email: 'studio' }, []);

  const [customer, setCustomer] = useState<Customer | null>(
    entry && entry.customerName ? { name: entry.customerName, code: entry.customerCode } : null
  );
  const [date, setDate] = useState(entry?.date || today());
  const [note, setNote] = useState(entry?.note || '');
  // saved entries: the photos already on the entry; new ones join once uploaded
  const [photos, setPhotos] = useState<EntryPhoto[]>(() => (mode === 'saved' ? entry!.photos : []));
  // drafts: every photo is a tile, so it can still be cut out or edited
  const [initial] = useState<Slot[]>(() => (mode === 'draft' ? placeholderSlots(entry!.photos) : []));
  const [slots, setSlots] = useState<Slot[]>(initial);
  useEffect(() => { fillSavedSlots(initial, setSlots); }, [initial]);
  // Photos sent from Background Removal join the tiles (they are already in
  // the cloud, so they save with the next autosave and need no upload).
  const [seenIncoming, setSeenIncoming] = useState<number | null>(null);
  if (incoming && incoming.nonce !== seenIncoming) {
    setSeenIncoming(incoming.nonce);
    setSlots((cur) => [...cur, ...incoming.slots]);
  }

  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [shot, setShot] = useState('');
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [pptOpen, setPptOpen] = useState(false);

  // This entry's own photo boxes on its deck slide, saved with the entry by
  // the autosave below (no field = the house layout).
  const [slideLayout, setSlideLayout] = useState<SlideLayout | undefined>(entry?.slideLayout);
  const [boxes, setBoxes] = useState<Box[]>(() => photoSlotsFor(entry?.slideLayout));
  const commitBoxes = useCallback((b: Box[]) => {
    setSlideLayout(isDefaultSlots(b) ? undefined : {
      v: 1, slots: b.map(toFrac), updatedAt: new Date().toISOString(), updatedBy: actor.email || 'studio',
    });
  }, [actor]);

  // ─── photos upload in the background ──────────────────────────────────
  const upload = useCallback<SyncUpload>((f, on) => uploadEntryPhoto(kind, id, f, on), [kind, id]);
  usePhotoSync(slots, setSlots, upload);

  // A saved entry has no tile editing for its photos, so an uploaded tile
  // moves straight onto the entry (the saved list is the same either way).
  useEffect(() => {
    if (mode !== 'saved') return;
    const done = slots.filter((s) => s.remote && isSyncedSlot(s) && !s.syncing && !s.working);
    if (!done.length) return;
    const ids = new Set(done.map((s) => s.id));
    setPhotos((p) => [...p, ...(savedPhotos(done) as EntryPhoto[])]);
    setSlots((cur) => cur.filter((s) => !ids.has(s.id)));
  }, [mode, slots]);

  // ─── autosave ──────────────────────────────────────────────────────────
  const fields = useMemo<EntryFields>(() => ({
    customerName: customer?.name || '',
    customerCode: customer?.code || null,
    date,
    note,
    photos: [...photos, ...(savedPhotos(slots) as EntryPhoto[])],
    ...(slideLayout ? { slideLayout } : {}),
  }), [customer, date, note, photos, slots, slideLayout]);
  const hasContent = !!customer || !!note.trim() || slots.length > 0;
  const complete = !!customer && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const value = mode === 'new' && !hasContent ? null : mode === 'saved' && !complete ? null : fields;

  const snapshot = useCallback((f: EntryFields): StudioEntry => ({
    id, kind,
    createdBy: entry?.createdBy || actor.email,
    createdByUid: entry?.createdByUid || actor.uid,
    createdAt: entry?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updatedBy: actor.email,
    deleted: false,
    status: mode === 'saved' ? 'saved' : 'draft',
    ...f,
  }), [id, kind, entry, actor, mode]);

  const { status, dirty, flush } = useAutosave<EntryFields>(
    value,
    async (f) => {
      await saveEntryFields(kind, id, f, actor, !createdRef.current);
      createdRef.current = true;
      setCreated(true);
      onChanged(snapshot(f));
    },
    (f) => saveEntryFieldsOnExit(kind, id, f, actor, !createdRef.current),
    mode !== 'new',
  );

  const uploading = slots.filter(needsUpload).length;
  const failedUploads = slots.filter((s) => s.syncError).length;
  const unsaved = dirty || uploading > 0 || status.state === 'error';
  useUnsavedWork(unsaved
    ? `This ${KIND_NOUN[kind]} still has changes or photos being saved. Closing now may lose them.`
    : null);

  // ─── actions ──────────────────────────────────────────────────────────
  const requestClose = useCallback(() => {
    if (busy) return;
    if (uploading > 0) {
      setConfirm({
        title: 'Photos still uploading',
        message: `${uploading} photo${uploading > 1 ? 's are' : ' is'} still uploading. If you close now, ${uploading > 1 ? 'they' : 'it'} will not be in the ${mode === 'saved' ? 'entry' : 'draft'}.`,
        confirmLabel: 'Close anyway', cancelLabel: 'Keep it open', danger: true,
        run: onClose,
      });
      return;
    }
    onClose(); // unmounting writes anything still waiting
  }, [busy, uploading, mode, onClose]);

  const tabActive = useTabActive();
  useEffect(() => {
    if (!tabActive) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !pptOpen && requestClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [requestClose, tabActive, pptOpen]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError('');
    try { await fn(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    finally { setBusy(''); }
  }

  const promote = () => run('Saving…', async () => {
    if (!customer) throw new Error('Choose a customer.');
    if (uploading) throw new Error('Wait for the photos to finish uploading.');
    if (slots.some((s) => s.working)) throw new Error('Wait for the backgrounds to finish.');
    if (!fields.photos.length) throw new Error('Add at least one photo.');
    await flush();
    const made = await promoteEntry(kind, id, fields, actor);
    onSaved(made);
  });

  const discard = () => {
    if (!created) { onClose(); return; }
    setConfirm({
      title: 'Discard this draft?',
      message: 'It is taken off the Drafts list. The photos stay in storage.',
      confirmLabel: 'Discard draft', danger: true,
      run: () => run('Discarding…', async () => {
        await discardDraft(kind, id, actor);
        onDiscarded(id);
      }),
    });
  };

  const downloadAll = () => run('Making the zip…', async () => {
    const files = await Promise.all(photos.map(async (p) => ({ name: p.name, blob: await fetchPhoto(p) })));
    const who = (customer?.name || 'photos').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
    await saveZip(files, `${who}-${date}.zip`);
  });

  const remove = () => setConfirm({
    title: `Delete this ${KIND_NOUN[kind]} entry?`,
    message: 'You can undo it straight after.',
    confirmLabel: 'Delete entry', danger: true,
    run: () => run('Deleting…', async () => {
      await flush();
      await softDeleteEntry(kind, id);
      onDeleted(snapshot(fields));
    }),
  });

  const isSaved = mode === 'saved';

  // ─── photo order (the strip) ──────────────────────────────────────────
  // The order of the entry's photos is the deck order: 1 is main. A saved
  // entry orders its photos list; a draft orders its tiles (the ones already
  // uploaded; tiles still uploading stay at the end until they are saved).
  const stash = useRef(new Map<string, unknown>());
  const ordered = useMemo(() => (isSaved ? photos : (savedPhotos(slots) as EntryPhoto[])), [isSaved, photos, slots]);
  const orderUrls = useMemo(() => ordered.map((p) => p.url), [ordered]);
  const reorder = (next: string[]) => {
    const shown = orderUrls;
    if (isSaved) {
      setPhotos((cur) => reorderBy(cur, (p) => p.url, next, shown, stash.current as Map<string, EntryPhoto>));
    } else {
      setSlots((cur) => reorderBy(cur, (s) => s.remote?.url, next, shown, stash.current as Map<string, Slot>));
    }
  };
  const viewing = Math.max(0, photos.findIndex((p) => p.url === shot));
  const big = photos[viewing];

  // ─── Download PPT ─────────────────────────────────────────────────────
  const working = slots.some((s) => s.working);
  const pptBlocked = uploading > 0
    ? `Waiting for ${uploading} photo${uploading > 1 ? 's' : ''} to upload.`
    : working ? 'Waiting for the backgrounds to finish.'
      : !fields.photos.length ? 'Add a photo to make a PPT.' : '';
  const deck = useMemo(() => entryDeckRecord({ id, ...fields }), [id, fields]);
  const title = isSaved ? (customer?.name || entry!.customerName) : `${mode === 'draft' ? 'Draft' : 'New'} ${KIND_NOUN[kind]}`;

  const pptButton = (
    <button type="button" onClick={() => setPptOpen(true)} disabled={!!busy || !!pptBlocked}
      aria-describedby={pptBlocked ? `ppt-why-${id}` : undefined}
      className="flex min-h-[44px] items-center gap-1.5 text-[13px] text-neutral-500 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50">
      <Presentation className="h-4 w-4" strokeWidth={1.8} /> Download PPT
    </button>
  );
  const pptWhy = pptBlocked && (fields.photos.length > 0 || slots.length > 0) ? (
    <p id={`ppt-why-${id}`} className="w-full text-[12px] text-[#98671A]">PPT: {pptBlocked}</p>
  ) : null;

  // One place for the order and the slide, for drafts and saved entries alike:
  // the same strip and diagram as the Library preview.
  const orderAndSlide = (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <PhotoStrip photos={orderUrls} shot={isSaved ? (big?.url || '') : shot} onShot={setShot} save={reorder}
          quiet minPhotos={isSaved ? 1 : 0} menuOnSecondTap />
      </div>
      <p className="mt-1.5 text-[11.5px] text-neutral-400">
        Drag a photo onto another to change the order, or right-click it for Make main, Make 2nd. On a phone, tap a photo, then tap it again.
        {!isSaved && slots.length > ordered.length && ' Photos still uploading join the order once they are saved.'}
      </p>
      <SlideBoxes photos={orderUrls} boxes={boxes} onBoxes={setBoxes} onCommit={commitBoxes} onPick={setShot}
        which="this entry" hint="Drag a box to move it, pull a corner to resize." />
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 sm:p-10"
      onClick={requestClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={'w-full bg-white shadow-xl sm:rounded-md ' + (isSaved ? 'max-w-3xl' : 'max-w-lg')}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-neutral-100 px-6 py-5">
          <h2 className="font-serif text-[22px]">{title}</h2>
          {isSaved && <span className="text-[12.5px] text-neutral-400">{formatDate(date)}</span>}
          <div className="flex-1" />
          <SaveStatus status={status} uploading={uploading} failed={failedUploads} />
          <button onClick={requestClose} disabled={!!busy} aria-label="Close"
            className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 px-6 py-6">
          {isSaved && photos.length > 0 && (
            <div>
              <div className="relative grid h-[min(56vh,520px)] place-items-center overflow-hidden rounded-sm bg-[conic-gradient(#f3f3f3_0_25%,#fff_0_50%,#f3f3f3_0_75%,#fff_0)] bg-[length:16px_16px]">
                {big && <img src={big.url} alt={`Photo ${viewing + 1} of ${photos.length}`} className="max-h-full max-w-full object-contain" />}
                {photos.length > 1 && (
                  <>
                    <button type="button" aria-label="Previous photo" onClick={() => setShot(photos[(viewing - 1 + photos.length) % photos.length].url)}
                      className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-neutral-700 shadow hover:text-neutral-900">
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button type="button" aria-label="Next photo" onClick={() => setShot(photos[(viewing + 1) % photos.length].url)}
                      className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-neutral-700 shadow hover:text-neutral-900">
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                )}
              </div>
              {orderAndSlide}
            </div>
          )}

          <div>
            <Label required>Customer</Label>
            <CustomerPicker value={customer} customers={customers} loading={customersLoading}
              onChange={setCustomer} onAdd={onAddCustomer} autoFocus={mode === 'new'} />
          </div>

          <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
            <label className="block">
              <Label required>Date</Label>
              <input type="date" value={date} required onChange={(e) => setDate(e.target.value)} className={lineCls} />
            </label>
            <label className="block">
              <Label>Note</Label>
              <textarea value={note} rows={1} onChange={(e) => setNote(e.target.value)}
                placeholder={kind === 'custom-rug' ? 'Size, quality, anything to remember' : 'Courier, what was sent'}
                className={lineCls + ' resize-y'} />
            </label>
          </div>

          <div>
            <Label required={!isSaved}>{isSaved ? 'Add photos' : 'Photos'}</Label>
            <div className="mt-2">
              <PhotoPicker slots={slots} onChange={setSlots} disabled={!!busy} noMain showSync />
            </div>
          </div>

          {!isSaved && ordered.length > 0 && (
            <div>
              <Label>Order on the deck</Label>
              {orderAndSlide}
            </div>
          )}

          {isSaved && !complete && (
            <p className="text-[12.5px] text-[#98671A]">Choose a customer and a date to save these changes.</p>
          )}
          {error && <p role="alert" className="text-[13px] text-red-600">{error}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-neutral-100 px-6 py-4">
          {pptWhy}
          {!isSaved ? (
            <>
              <p className="min-w-0 basis-full text-[12.5px] text-neutral-400 sm:basis-auto sm:flex-1">
                {busy || (created
                  ? 'Saved as draft. Close any time and carry on from Drafts.'
                  : 'Nothing is saved until you add something.')}
              </p>
              <button onClick={discard} disabled={!!busy}
                className="min-h-[44px] text-[13px] text-neutral-500 hover:text-red-700">
                {created ? 'Discard draft' : 'Cancel'}
              </button>
              {pptButton}
              <button onClick={promote} disabled={!!busy || uploading > 0 || slots.some((s) => s.working)}
                className="rounded-sm bg-[#2F4C69] px-[18px] py-2.5 text-[13px] font-semibold text-white disabled:opacity-60">
                {busy || 'Save entry'}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={remove} disabled={!!busy}
                className="flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-red-600">
                <Trash2 className="h-4 w-4" strokeWidth={1.8} /> Delete entry
              </button>
              <button type="button" onClick={downloadAll} disabled={!!busy || !photos.length}
                className="flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-neutral-900">
                <Download className="h-4 w-4" strokeWidth={1.8} /> Download all
              </button>
              {pptButton}
              <div className="flex-1" />
              {busy && <span className="text-[12.5px] text-neutral-400">{busy}</span>}
              <button onClick={requestClose} disabled={!!busy}
                className="rounded-sm bg-[#2F4C69] px-[18px] py-2.5 text-[13px] font-semibold text-white disabled:opacity-40">
                Done
              </button>
            </>
          )}
        </div>
      </div>

      {pptOpen && (
        // Clicks inside must not reach the entry's backdrop (which closes the entry).
        <div onClick={(e) => e.stopPropagation()}>
          <Suspense fallback={null}>
            <PptDialog
              products={[deck]}
              title={fields.customerName || 'Eastern Mills'}
              heading={`PPT of this ${KIND_NOUN[kind]}`}
              fileName={entryDeckFileName(fields)}
              singleOnly
              freshen={async (p) => p}
              onClose={() => setPptOpen(false)}
            />
          </Suspense>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title} message={confirm.message}
          confirmLabel={confirm.confirmLabel} cancelLabel={confirm.cancelLabel} danger={confirm.danger}
          onCancel={() => setConfirm(null)}
          onConfirm={() => { const c = confirm; setConfirm(null); c.run(); }}
        />
      )}
    </div>
  );
}
