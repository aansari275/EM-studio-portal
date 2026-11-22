import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, X } from 'lucide-react';
import { EntryDialog } from '../components/EntryDialog';
import {
  listEntries, listCustomers, restoreEntry, sortEntries, formatDate, type EntryKind, type StudioEntry,
} from '../lib/studioEntries';
import { addStudioCustomer } from '../lib/options';
import { thumb } from '../lib/img';
import { useTabGuard } from '../lib/tabContext';

/**
 * Custom Rugs and Sample Dispatch: one page, two kinds. Entries are grouped
 * by customer, the customer with the most recent entry first.
 */
const COPY: Record<EntryKind, { title: string; blurb: string; empty: string }> = {
  'custom-rug': {
    title: 'Custom Rugs',
    blurb: 'Photos of custom rugs, filed by customer and date.',
    empty: 'No custom rugs filed yet.',
  },
  'sample-dispatch': {
    title: 'Sample Dispatch',
    blurb: 'Photos of samples sent out, filed by customer and date. Separate from the Orders app dispatches.',
    empty: 'No sample dispatches filed yet.',
  },
};

type Open = { mode: 'new' } | { mode: 'open'; id: string } | null;

export function StudioEntries({ kind }: { kind: EntryKind }) {
  const qc = useQueryClient();
  const copy = COPY[kind];
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState<Open>(null);
  const [undo, setUndo] = useState<StudioEntry | null>(null);
  const [undoError, setUndoError] = useState('');
  useTabGuard(open?.mode === 'new' ? 'The new entry you started has not been saved and will be lost.' : null);

  const key = ['studio-entries', kind];
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: key,
    queryFn: () => listEntries(kind),
  });
  const customersQ = useQuery({ queryKey: ['studio-customers'], queryFn: listCustomers, staleTime: 10 * 60 * 1000 });

  const entries = useMemo(() => data || [], [data]);
  const groups = useMemo(() => {
    const t = term.trim().toLowerCase();
    const shown = t ? entries.filter((e) => e.customerName.toLowerCase().includes(t)) : entries;
    const by = new Map<string, StudioEntry[]>();
    for (const e of shown) {
      const k = e.customerName.trim().toLowerCase();
      by.set(k, [...(by.get(k) || []), e]);
    }
    // entries arrive newest first, so each group's first entry is its newest
    return [...by.values()].sort((a, b) => b[0].date.localeCompare(a[0].date));
  }, [entries, term]);

  const opened = open?.mode === 'open' ? entries.find((e) => e.id === open.id) : undefined;

  const put = (e: StudioEntry) =>
    qc.setQueryData<StudioEntry[]>(key, (cur) => sortEntries([...(cur || []).filter((x) => x.id !== e.id), e]));
  const drop = (e: StudioEntry) =>
    qc.setQueryData<StudioEntry[]>(key, (cur) => (cur || []).filter((x) => x.id !== e.id));

  async function addCustomer(name: string) {
    await addStudioCustomer(name);
    qc.invalidateQueries({ queryKey: ['studio-customers'] });
  }

  async function restore() {
    if (!undo) return;
    setUndoError('');
    try {
      await restoreEntry(kind, undo.id);
      put({ ...undo, deleted: false });
      setUndo(null);
    } catch {
      setUndoError('Could not undo. Try again.');
    }
  }

  return (
    <div className="min-h-full bg-white text-neutral-900">
      <main className="mx-auto w-full max-w-[1100px] px-4 pb-16 sm:px-7">
        <div className="mt-8 flex flex-wrap items-end gap-4">
          <div className="flex-1">
            <h1 className="font-serif text-[26px] font-normal">{copy.title}</h1>
            <p className="mt-1 text-[13.5px] text-neutral-500">{copy.blurb}</p>
          </div>
          <button type="button" onClick={() => setOpen({ mode: 'new' })}
            className="flex items-center gap-1.5 rounded-sm bg-[#2F4C69] px-[18px] py-2.5 text-[13px] font-semibold text-white">
            <Plus className="h-4 w-4" strokeWidth={2.5} /> New entry
          </button>
        </div>

        {entries.length > 0 && (
          <label className="mt-7 flex items-center gap-3 rounded-md border border-neutral-200 px-4 focus-within:border-[#2F4C69]">
            <Search className="h-[18px] w-[18px] shrink-0 text-neutral-400" strokeWidth={1.6} />
            <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search by customer"
              aria-label="Search by customer"
              className="w-full border-0 bg-transparent py-3 text-[15px] outline-none placeholder:text-neutral-400" />
            {term && (
              <button type="button" onClick={() => setTerm('')} aria-label="Clear search"
                className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900">
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
        )}

        {undo && (
          <div role="status" className="mt-5 flex flex-wrap items-center gap-3 border-l-2 border-[#2F4C69] bg-neutral-50 px-4 py-2.5 text-[13px]">
            <span className="flex-1">Entry for {undo.customerName} on {formatDate(undo.date)} deleted.</span>
            {undoError && <span className="text-red-600">{undoError}</span>}
            <button type="button" onClick={restore} className="font-semibold text-[#2F4C69] hover:underline">Undo</button>
            <button type="button" onClick={() => setUndo(null)} aria-label="Dismiss"
              className="rounded p-1 text-neutral-400 hover:text-neutral-900"><X className="h-4 w-4" /></button>
          </div>
        )}

        {isLoading ? (
          <div className="mt-8 space-y-8" aria-busy="true" aria-label="Loading entries">
            {[0, 1, 2].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 w-40 rounded-sm bg-neutral-100" />
                <div className="mt-4 flex gap-2">{[0, 1, 2, 3].map((j) => <div key={j} className="h-16 w-16 rounded-sm bg-neutral-100" />)}</div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="mt-10 text-[14px] text-neutral-600">
            Could not load the entries.{' '}
            <button type="button" onClick={() => refetch()} disabled={isFetching}
              className="font-semibold text-[#2F4C69] hover:underline">Try again</button>
          </div>
        ) : !entries.length ? (
          <div className="mt-10 rounded-md border border-dashed border-neutral-200 px-6 py-14 text-center">
            <p className="font-serif text-[19px]">{copy.empty}</p>
            <p className="mt-1.5 text-[13px] text-neutral-500">Start with New entry: pick the customer, the date and add photos.</p>
          </div>
        ) : !groups.length ? (
          <p className="mt-10 text-[14px] text-neutral-500">No customer matches {term.trim()}.</p>
        ) : (
          <div className="mt-6 divide-y divide-neutral-100">
            {groups.map((list) => (
              <section key={list[0].customerName.toLowerCase()} className="py-6">
                <h2 className="flex items-baseline gap-3">
                  <span className="font-serif text-[19px]">{list[0].customerName}</span>
                  {list[0].customerCode && <span className="text-[11.5px] text-neutral-400">{list[0].customerCode}</span>}
                  <span className="text-[12px] text-neutral-400">{list.length} {list.length > 1 ? 'entries' : 'entry'}</span>
                </h2>
                <ul className="mt-3 space-y-2">
                  {list.map((e) => (
                    <li key={e.id}>
                      <button type="button" onClick={() => setOpen({ mode: 'open', id: e.id })}
                        className="flex w-full flex-col gap-3 rounded-sm px-3 py-3 text-left hover:bg-neutral-50 sm:flex-row sm:items-center sm:gap-5">
                        <div className="sm:w-36 sm:shrink-0">
                          <div className="text-[14px] font-semibold">{formatDate(e.date)}</div>
                          <div className="text-[12px] text-neutral-400">
                            {e.photos.length} photo{e.photos.length === 1 ? '' : 's'}
                          </div>
                          {e.note && <div className="mt-0.5 line-clamp-2 text-[12.5px] text-neutral-500">{e.note}</div>}
                        </div>
                        <div className="flex min-w-0 flex-1 gap-2 overflow-hidden">
                          {e.photos.slice(0, 8).map((p) => (
                            <img key={p.path || p.url} src={thumb(p.url, 160)} alt="" loading="lazy"
                              className="h-16 w-16 shrink-0 rounded-sm bg-neutral-50 object-contain shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]" />
                          ))}
                          {e.photos.length > 8 && (
                            <span className="grid h-16 w-12 shrink-0 place-items-center text-[12px] text-neutral-400">+{e.photos.length - 8}</span>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>

      {open && (open.mode === 'new' || opened) && (
        <EntryDialog
          key={open.mode === 'new' ? 'new' : open.id}
          kind={kind}
          entry={opened}
          customers={customersQ.data || []}
          customersLoading={customersQ.isLoading}
          onAddCustomer={addCustomer}
          onClose={() => setOpen(null)}
          onSaved={(e) => {
            put(e);
            setUndo(null);
            // a new entry opens straight away, so she sees what was saved
            if (open.mode === 'new') setOpen({ mode: 'open', id: e.id });
          }}
          onDeleted={(e) => { drop(e); setUndo(e); setOpen(null); }}
        />
      )}
    </div>
  );
}
