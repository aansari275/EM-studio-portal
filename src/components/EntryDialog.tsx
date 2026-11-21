import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Trash2, X } from 'lucide-react';
import { PhotoPicker, type Slot } from './PhotoPicker';
import { CustomerPicker } from './CustomerPicker';
import { Label } from './NewProduct';
import {
  createEntry, updateEntryDetails, addEntryPhotos, setEntryPhotos, softDeleteEntry, fetchPhoto,
  KIND_NOUN, formatDate,
  type Customer, type EntryKind, type StudioEntry,
} from '../lib/studioEntries';
import { saveZip, today } from '../lib/download';
import { thumb } from '../lib/img';

/**
 * New entry, or an open one: customer, date, note and photos. In the open
 * view the photos can be looked at large, added, removed and downloaded,
 * the details edited, and the entry deleted (soft).
 */

const lineCls =
  'mt-1 w-full border-b border-neutral-200 bg-transparent pb-1.5 text-[15px] outline-none focus:border-[#2F4C69]';

export function EntryDialog({
  kind, entry, customers, customersLoading, onAddCustomer, onClose, onSaved, onDeleted,
}: {
  kind: EntryKind;
  /** Absent for a new entry. */
  entry?: StudioEntry;
  customers: Customer[];
  customersLoading?: boolean;
  onAddCustomer: (name: string) => Promise<void>;
  onClose: () => void;
  onSaved: (e: StudioEntry) => void;
  onDeleted: (e: StudioEntry) => void;
}) {
  const isNew = !entry;
  const [customer, setCustomer] = useState<Customer | null>(
    entry ? { name: entry.customerName, code: entry.customerCode } : null
  );
  const [date, setDate] = useState(entry?.date || today());
  const [note, setNote] = useState(entry?.note || '');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState(0);

  const photos = entry?.photos || [];
  const dirty = !!entry && (
    (customer?.name || '') !== entry.customerName || date !== entry.date || note.trim() !== entry.note
  );
  const working = slots.some((s) => s.working);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose, busy]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError('');
    try { await fn(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    finally { setBusy(''); }
  }

  const details = () => ({ customerName: customer?.name || '', customerCode: customer?.code || null, date, note });
  const progress = (done: number, total: number) =>
    setBusy(done === total ? 'Finishing…' : `Uploading ${done + 1} of ${total}…`);

  const create = () => run('Saving…', async () => {
    if (!customer) throw new Error('Choose a customer.');
    if (!slots.length) throw new Error('Add at least one photo.');
    if (working) throw new Error('Wait for the backgrounds to finish.');
    const made = await createEntry(kind, details(), slots.map((s) => s.file), progress);
    onSaved(made);
  });

  const saveDetails = () => run('Saving…', async () => {
    if (!customer) throw new Error('Choose a customer.');
    const next = await updateEntryDetails(kind, entry!.id, details());
    if (next) onSaved(next);
  });

  const upload = () => run('Uploading…', async () => {
    if (working) throw new Error('Wait for the backgrounds to finish.');
    const next = await addEntryPhotos(kind, entry!.id, slots.map((s) => s.file), progress);
    setSlots([]);
    if (next) { onSaved(next); setViewing(next.photos.length - 1); }
  });

  const removePhoto = (i: number) => {
    if (!window.confirm('Take this photo off the entry? The file is kept in storage.')) return;
    run('Removing…', async () => {
      const next = await setEntryPhotos(kind, entry!.id, photos.filter((_, j) => j !== i));
      if (next) { onSaved(next); setViewing((v) => Math.max(0, Math.min(v, next.photos.length - 1))); }
    });
  };

  const downloadAll = () => run('Making the zip…', async () => {
    const files = await Promise.all(photos.map(async (p) => ({ name: p.name, blob: await fetchPhoto(p) })));
    const who = (entry!.customerName || 'photos').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
    await saveZip(files, `${who}-${entry!.date}.zip`);
  });

  const remove = () => {
    if (!window.confirm(`Delete this ${KIND_NOUN[kind]} entry? You can undo it straight after.`)) return;
    run('Deleting…', async () => {
      await softDeleteEntry(kind, entry!.id);
      onDeleted(entry!);
    });
  };

  const big = photos[viewing];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 sm:p-10"
      onClick={() => !busy && onClose()} role="dialog" aria-modal="true"
      aria-label={isNew ? `New ${KIND_NOUN[kind]}` : `${entry.customerName}, ${entry.date}`}>
      <div className={'w-full bg-white shadow-xl sm:rounded-md ' + (isNew ? 'max-w-lg' : 'max-w-3xl')}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-4 border-b border-neutral-100 px-6 py-5">
          <h2 className="font-serif text-[22px]">
            {isNew ? `New ${KIND_NOUN[kind]}` : entry.customerName}
          </h2>
          {!isNew && <span className="text-[12.5px] text-neutral-400">{formatDate(entry.date)}</span>}
          <div className="flex-1" />
          <button onClick={onClose} disabled={!!busy} aria-label="Close"
            className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 px-6 py-6">
          {!isNew && photos.length > 0 && (
            <div>
              <div className="relative grid h-[min(56vh,520px)] place-items-center overflow-hidden rounded-sm bg-[conic-gradient(#f3f3f3_0_25%,#fff_0_50%,#f3f3f3_0_75%,#fff_0)] bg-[length:16px_16px]">
                {big && <img src={big.url} alt={`Photo ${viewing + 1} of ${photos.length}`} className="max-h-full max-w-full object-contain" />}
                {photos.length > 1 && (
                  <>
                    <button type="button" aria-label="Previous photo" onClick={() => setViewing((v) => (v - 1 + photos.length) % photos.length)}
                      className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-neutral-700 shadow hover:text-neutral-900">
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button type="button" aria-label="Next photo" onClick={() => setViewing((v) => (v + 1) % photos.length)}
                      className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-neutral-700 shadow hover:text-neutral-900">
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {photos.map((p, i) => (
                  <div key={p.path || p.url} className="group relative">
                    <button type="button" onClick={() => setViewing(i)} aria-label={`Show photo ${i + 1}`}
                      aria-current={i === viewing}
                      className={'block h-16 w-16 overflow-hidden rounded-sm bg-neutral-50 ' +
                        (i === viewing ? 'shadow-[0_0_0_2px_#2F4C69]' : 'shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]')}>
                      <img src={thumb(p.url, 160)} alt="" loading="lazy" className="h-full w-full object-contain" />
                    </button>
                    {photos.length > 1 && (
                      <button type="button" onClick={() => removePhoto(i)} disabled={!!busy}
                        aria-label={`Remove photo ${i + 1}`}
                        className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-white text-neutral-600 opacity-0 shadow transition-opacity hover:text-red-600 focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                        <X className="h-3 w-3" strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label required>Customer</Label>
            <CustomerPicker value={customer} customers={customers} loading={customersLoading}
              onChange={setCustomer} onAdd={onAddCustomer} autoFocus={isNew} />
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
            <Label required={isNew}>{isNew ? 'Photos' : 'Add photos'}</Label>
            <div className="mt-2">
              <PhotoPicker slots={slots} onChange={setSlots} disabled={!!busy} noMain />
            </div>
            {!isNew && slots.length > 0 && (
              <button type="button" onClick={upload} disabled={!!busy || working}
                className="mt-3 rounded-sm border border-[#2F4C69] px-3.5 py-1.5 text-[12.5px] font-semibold text-[#2F4C69] hover:bg-[#2F4C69]/5 disabled:opacity-50">
                Upload {slots.length} photo{slots.length > 1 ? 's' : ''}
              </button>
            )}
          </div>

          {error && <p role="alert" className="text-[13px] text-red-600">{error}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-neutral-100 px-6 py-4">
          {isNew ? (
            <>
              <p className="flex-1 text-[12.5px] text-neutral-400">
                {busy || (slots.length ? `${slots.length} photo${slots.length > 1 ? 's' : ''} ready.` : 'Add at least one photo.')}
              </p>
              <button onClick={onClose} disabled={!!busy} className="text-[13px] text-neutral-500 hover:text-neutral-900">Cancel</button>
              <button onClick={create} disabled={!!busy || working}
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
              <div className="flex-1" />
              {busy && <span className="text-[12.5px] text-neutral-400">{busy}</span>}
              <button onClick={saveDetails} disabled={!!busy || !dirty}
                className="rounded-sm bg-[#2F4C69] px-[18px] py-2.5 text-[13px] font-semibold text-white disabled:opacity-40">
                Save changes
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
