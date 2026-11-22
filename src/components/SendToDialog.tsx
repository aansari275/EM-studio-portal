import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { listEntries, formatDate, type EntryKind, type StudioEntry } from '../lib/studioEntries';
import { searchLibraryPage } from '../lib/library';
import type { ShowroomProduct } from '../lib/firebase';
import { currentActor } from '../lib/auth';
import { heroImage, thumb } from '../lib/img';
import { DESTINATION_LABEL, type Destination, type SendTarget } from '../lib/sendTo';
import { useTabActive } from '../lib/tabContext';

/**
 * Send to: where the ticked photos go. Custom Rugs or Sample Dispatch (a new
 * entry, or one of hers: a draft or a saved entry), or Library (a new design,
 * or an existing one found with the library search). Native radios and
 * inputs, so it works with the keyboard and a screen reader; a sheet from the
 * bottom on a phone.
 */
export function SendToDialog({
  count, onClose, onSend,
}: {
  count: number;
  onClose: () => void;
  onSend: (target: SendTarget, removeAfter: boolean) => void;
}) {
  const [to, setTo] = useState<Destination>('custom-rug');
  const [existing, setExisting] = useState(false);
  const [entry, setEntry] = useState<StudioEntry | null>(null);
  const [product, setProduct] = useState<ShowroomProduct | null>(null);
  const [term, setTerm] = useState('');
  const [removeAfter, setRemoveAfter] = useState(true);
  const ids = useId();
  const first = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLFormElement>(null);

  const tabActive = useTabActive();
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    first.current?.focus();
    return () => back?.focus?.();
  }, []);
  useEffect(() => {
    if (!tabActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onClose(); }
      if (e.key === 'Tab' && panel.current) {
        // keep focus inside while it is open
        const f = [...panel.current.querySelectorAll<HTMLElement>('input, button, select')]
          .filter((el) => !(el as HTMLInputElement).disabled && el.offsetParent !== null);
        if (!f.length) return;
        const a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, tabActive]);

  const isEntry = to !== 'library';
  const kind = isEntry ? (to as EntryKind) : null;

  // Her drafts and the saved entries, from the same cache the tab uses.
  const entriesQ = useQuery({
    queryKey: ['studio-entries', kind],
    queryFn: () => listEntries(kind!),
    enabled: !!kind && existing,
  });
  const me = currentActor()?.uid || '';
  const entryChoices = useMemo(() => {
    const t = term.trim().toLowerCase();
    return (entriesQ.data || [])
      .filter((e) => e.status !== 'draft' || e.createdByUid === me)
      .filter((e) => !t || e.customerName.toLowerCase().includes(t) || e.note.toLowerCase().includes(t))
      .sort((a, b) => (a.status === b.status ? 0 : a.status === 'draft' ? -1 : 1))
      .slice(0, 8);
  }, [entriesQ.data, term, me]);

  // Library: the same server search the Library tab uses.
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);
  const designsQ = useQuery({
    queryKey: ['send-design-search', debounced],
    queryFn: () => searchLibraryPage(debounced, 0, 8).then((p) => p.items.slice(0, 8)),
    enabled: to === 'library' && existing && debounced.length >= 2,
    staleTime: 30_000,
  });

  const pickTo = (d: Destination) => {
    setTo(d); setEntry(null); setProduct(null); setTerm('');
  };

  const ready = !existing || (isEntry ? !!entry : !!product);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    onSend(isEntry ? { to: to as EntryKind, entry: existing ? entry : null } : { to: 'library', product: existing ? product : null }, removeAfter);
  };

  const noun = isEntry ? 'entry' : 'design';
  const photos = `${count} photo${count === 1 ? '' : 's'}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-6" onClick={onClose}>
      <form ref={panel} onSubmit={submit} onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`}
        className="flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-md bg-white shadow-xl sm:rounded-md">
        <div className="flex items-center gap-3 border-b border-neutral-100 px-5 py-4">
          <h2 id={`${ids}-t`} className="flex-1 font-serif text-[20px]">Send {photos} to</h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <fieldset>
            <legend className="sr-only">Destination</legend>
            <div className="grid grid-cols-3 gap-2">
              {(['custom-rug', 'sample-dispatch', 'library'] as Destination[]).map((d, i) => (
                <label key={d}
                  className={'flex cursor-pointer items-center justify-center rounded-sm border px-2 py-2.5 text-center text-[12.5px] leading-tight focus-within:outline focus-within:outline-2 focus-within:outline-[#2F4C69] ' +
                    (to === d ? 'border-[#2F4C69] bg-[#2F4C69]/5 font-semibold text-[#2F4C69]' : 'border-neutral-200 hover:border-neutral-400')}>
                  <input ref={i === 0 ? first : undefined} type="radio" name={`${ids}-to`} value={d} checked={to === d}
                    onChange={() => pickTo(d)} className="sr-only" />
                  {DESTINATION_LABEL[d]}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400">Into</legend>
            <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px]">
              <input type="radio" name={`${ids}-into`} checked={!existing} onChange={() => setExisting(false)}
                className="h-4 w-4 accent-[#2F4C69]" />
              {isEntry ? 'A new entry' : 'A new design'}
              <span className="text-[12px] text-neutral-400">
                {isEntry ? 'customer and date still to pick' : 'number still to type'}
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px]">
              <input type="radio" name={`${ids}-into`} checked={existing} onChange={() => setExisting(true)}
                className="h-4 w-4 accent-[#2F4C69]" />
              {isEntry ? 'One of your entries' : 'An existing design'}
            </label>
          </fieldset>

          {existing && (
            <div>
              <label className="flex items-center gap-2 rounded-sm border border-neutral-200 px-3 focus-within:border-[#2F4C69]">
                <Search className="h-4 w-4 shrink-0 text-neutral-400" />
                <span className="sr-only">{isEntry ? 'Search by customer' : 'Search by design number or name'}</span>
                <input value={term} onChange={(e) => setTerm(e.target.value)}
                  placeholder={isEntry ? 'Search by customer' : 'Design number or name'}
                  className="w-full bg-transparent py-2 text-[14px] outline-none placeholder:text-neutral-400" />
              </label>

              <fieldset className="mt-2">
                <legend className="sr-only">{isEntry ? 'Entry' : 'Design'}</legend>
                {isEntry ? (
                  entriesQ.isLoading ? <p className="py-3 text-[12.5px] text-neutral-400">Loading entries…</p>
                  : entriesQ.isError ? <p className="py-3 text-[12.5px] text-red-700">Could not load the entries.</p>
                  : !entryChoices.length ? <p className="py-3 text-[12.5px] text-neutral-400">No {noun} matches.</p>
                  : (
                    <ul className="space-y-1">
                      {entryChoices.map((e) => (
                        <li key={e.id}>
                          <label className={'flex cursor-pointer items-center gap-3 rounded-sm px-2 py-2 ' + (entry?.id === e.id ? 'bg-[#2F4C69]/5' : 'hover:bg-neutral-50')}>
                            <input type="radio" name={`${ids}-entry`} checked={entry?.id === e.id} onChange={() => setEntry(e)}
                              className="h-4 w-4 shrink-0 accent-[#2F4C69]" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13.5px] font-semibold">{e.customerName || 'No customer yet'}</span>
                              <span className="block text-[12px] text-neutral-400">
                                {formatDate(e.date)}, {e.photos.length} photo{e.photos.length === 1 ? '' : 's'}
                              </span>
                            </span>
                            {e.status === 'draft' && <span className="rounded-sm bg-[#98671A]/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-[#7a5215]">Draft</span>}
                          </label>
                        </li>
                      ))}
                    </ul>
                  )
                ) : debounced.length < 2 ? (
                  <p className="py-3 text-[12.5px] text-neutral-400">Type at least two letters of the design number or name.</p>
                ) : designsQ.isLoading ? (
                  <p className="py-3 text-[12.5px] text-neutral-400">Searching…</p>
                ) : !(designsQ.data || []).length ? (
                  <p className="py-3 text-[12.5px] text-neutral-400">No design matches.</p>
                ) : (
                  <ul className="space-y-1">
                    {(designsQ.data || []).map((p) => (
                      <li key={p.id}>
                        <label className={'flex cursor-pointer items-center gap-3 rounded-sm px-2 py-1.5 ' + (product?.id === p.id ? 'bg-[#2F4C69]/5' : 'hover:bg-neutral-50')}>
                          <input type="radio" name={`${ids}-design`} checked={product?.id === p.id} onChange={() => setProduct(p)}
                            className="h-4 w-4 shrink-0 accent-[#2F4C69]" />
                          {heroImage(p)
                            ? <img src={thumb(heroImage(p), 120)} alt="" className="h-10 w-10 shrink-0 rounded-sm bg-neutral-50 object-contain" />
                            : <span className="h-10 w-10 shrink-0 rounded-sm bg-neutral-100" />}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-mono text-[13px]">{p.styleNumber}</span>
                            {p.color && <span className="block truncate text-[12px] text-neutral-400">{p.color}</span>}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-2.5 border-t border-neutral-100 pt-4 text-[13px]">
            <input type="checkbox" checked={removeAfter} onChange={(e) => setRemoveAfter(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#2F4C69]" />
            <span>
              Remove from here after sending
              <span className="block text-[12px] text-neutral-400">Only from this page. Nothing is deleted.</span>
            </span>
          </label>
        </div>

        <div className="flex items-center gap-3 border-t border-neutral-100 px-5 py-3.5">
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="text-[13px] text-neutral-500 hover:text-neutral-900">Cancel</button>
          <button type="submit" disabled={!ready}
            className="rounded-sm bg-[#2F4C69] px-[18px] py-2.5 text-[13px] font-semibold text-white disabled:opacity-50">
            Send {photos}
          </button>
        </div>
      </form>
    </div>
  );
}
