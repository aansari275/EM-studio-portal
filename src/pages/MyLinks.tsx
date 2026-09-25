import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listCatalogs, deleteCatalog, catalogUrl, type Catalog } from '../lib/catalogs';

export function MyLinks() {
  const [params] = useSearchParams();
  const justMade = params.get('new');
  const qc = useQueryClient();
  const { data: catalogs = [], isLoading } = useQuery({ queryKey: ['catalogs'], queryFn: () => listCatalogs(50) });

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="mx-auto flex w-full max-w-[900px] flex-wrap items-center gap-4 px-7 pt-6">
        <Link to="/" className="font-serif text-[17px]">
          Eastern Mills
          <span className="ml-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
            Studio
          </span>
        </Link>
        <div className="flex-1" />
        <Link to="/" className="text-[13px] text-neutral-500 hover:text-neutral-900">
          Back to library
        </Link>
      </header>

      <div className="mx-auto w-full max-w-[900px] px-7">
        <h1 className="mt-8 font-serif text-[26px] font-normal">My links</h1>
        <p className="mt-1 text-sm text-neutral-500">Every selection you have sent to a buyer.</p>

        {justMade && (
          <div className="mt-6 flex flex-wrap items-center gap-3 border-l-2 border-[#2F4C69] bg-neutral-50 px-4 py-3">
            <span className="text-[13.5px]">Link created and copied to your clipboard.</span>
            <code className="font-mono text-[12px] text-neutral-500">{catalogUrl(justMade)}</code>
          </div>
        )}

        {isLoading ? (
          <p className="py-14 text-sm text-neutral-400">Loading…</p>
        ) : !catalogs.length ? (
          <p className="py-14 text-sm text-neutral-400">
            No links yet. Pick some rugs in the library and press Create link.
          </p>
        ) : (
          <ul className="mt-8 divide-y divide-neutral-100 border-t border-neutral-100">
            {catalogs.map((c) => (
              <Row key={c.id} catalog={c} onDeleted={() => qc.invalidateQueries({ queryKey: ['catalogs'] })} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Row({ catalog, onDeleted }: { catalog: Catalog; onDeleted: () => void }) {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const url = catalogUrl(catalog.id);
  const when = catalog.createdAt
    ? new Date(catalog.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  async function copy() {
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <li className="flex flex-wrap items-center gap-3 py-4">
      <div className="min-w-[180px] flex-1">
        <div className="text-sm font-semibold">{catalog.buyer || 'Untitled'}</div>
        <div className="text-[12px] text-neutral-400">
          {catalog.items.length} {catalog.items.length === 1 ? 'rug' : 'rugs'}
          {when ? ` · ${when}` : ''}
        </div>
      </div>
      <a href={url} target="_blank" rel="noreferrer" className="text-[13px] text-neutral-500 hover:text-neutral-900">
        Open
      </a>
      <button onClick={copy} className="text-[13px] text-neutral-500 hover:text-neutral-900">
        {copied ? 'Copied' : 'Copy link'}
      </button>
      {confirming ? (
        <>
          <button
            onClick={async () => { await deleteCatalog(catalog.id); onDeleted(); }}
            className="text-[13px] font-semibold text-red-600"
          >
            Delete for good
          </button>
          <button onClick={() => setConfirming(false)} className="text-[13px] text-neutral-500">
            Keep
          </button>
        </>
      ) : (
        <button onClick={() => setConfirming(true)} className="text-[13px] text-neutral-400 hover:text-red-600">
          Delete
        </button>
      )}
    </li>
  );
}
