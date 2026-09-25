import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Check, X } from 'lucide-react';
import {
  getShowroomProducts,
  searchShowroomProducts,
  getShowroomProductsCount,
  type ShowroomProduct,
} from '../lib/firebase';
import { useSelection } from '../lib/selection';
import { generateProductPPT } from '../lib/pptGenerator';
import { createCatalog, catalogUrl } from '../lib/catalogs';
import { signOutUser, currentUserEmail } from '../lib/auth';
import { thumb } from '../lib/img';

const FILTERS = [
  { label: 'All', match: () => true },
  { label: 'Hand Knotted', match: (p: ShowroomProduct) => /knot/i.test(p.construction || '') },
  { label: 'Hand Tufted', match: (p: ShowroomProduct) => /tuft/i.test(p.construction || '') },
  { label: 'Silk', match: (p: ShowroomProduct) => /silk/i.test(p.materials || '') },
  { label: 'Wool', match: (p: ShowroomProduct) => /wool/i.test(p.materials || '') },
  { label: 'Needs photos', match: (p: ShowroomProduct) => !p.firebaseUrl },
];

export function Library() {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState(0);
  const tray = useSelection();
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);

  const { data: total } = useQuery({
    queryKey: ['showroom-count'],
    queryFn: getShowroomProductsCount,
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['library', debounced],
    queryFn: () => (debounced ? searchShowroomProducts(debounced, 200) : getShowroomProducts(120)),
  });

  const shown = useMemo(() => products.filter(FILTERS[filter].match), [products, filter]);

  return (
    <div className="flex min-h-screen flex-col bg-white text-neutral-900">
      <Header />

      <div className="mx-auto w-full max-w-[1400px] px-7">
        <label className="mt-6 flex items-center gap-3 border-b border-neutral-200 pb-3">
          <Search className="h-4 w-4 shrink-0 text-neutral-400" strokeWidth={1.7} />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={`Search ${total ? total.toLocaleString() : ''} designs`}
            className="w-full border-0 bg-transparent text-base outline-none placeholder:text-neutral-400"
          />
          {term && (
            <button onClick={() => setTerm('')} aria-label="Clear search" className="text-neutral-400 hover:text-neutral-900">
              <X className="h-4 w-4" />
            </button>
          )}
        </label>

        <div className="flex flex-wrap gap-5 pt-4">
          {FILTERS.map((f, i) => (
            <button
              key={f.label}
              onClick={() => setFilter(i)}
              className={
                'border-b-[1.5px] pb-0.5 text-[12.5px] transition-colors ' +
                (i === filter
                  ? 'border-[#2F4C69] font-semibold text-neutral-900'
                  : 'border-transparent text-neutral-400 hover:text-neutral-700')
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1400px] flex-1 px-7">
        {isLoading ? (
          <p className="py-16 text-center text-sm text-neutral-400">Loading designs…</p>
        ) : !shown.length ? (
          <p className="py-16 text-center text-sm text-neutral-400">
            {debounced ? `Nothing matches “${debounced}”.` : 'No designs here yet.'}
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(178px,1fr))] gap-x-[22px] gap-y-[30px] py-8">
            {shown.map((p) => (
              <Card key={p.id} product={p} selected={tray.has(p.id)} onToggle={() => tray.toggle(p)} />
            ))}
          </div>
        )}
      </div>

      <Tray onDone={(id) => navigate(`/links?new=${id}`)} />
    </div>
  );
}

function Header() {
  const email = currentUserEmail();
  return (
    <header className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-4 px-7 pt-6">
      <div className="font-serif text-[17px]">
        Eastern Mills
        <span className="ml-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
          Studio
        </span>
      </div>
      <div className="flex-1" />
      <Link to="/links" className="text-[13px] text-neutral-500 hover:text-neutral-900">
        My links
      </Link>
      <Link to="/more" className="text-[13px] text-neutral-500 hover:text-neutral-900">
        More
      </Link>
      <button
        onClick={() => signOutUser()}
        title={email || undefined}
        className="text-[13px] text-neutral-400 hover:text-neutral-900"
      >
        Sign out
      </button>
    </header>
  );
}

function Card({
  product,
  selected,
  onToggle,
}: {
  product: ShowroomProduct;
  selected: boolean;
  onToggle: () => void;
}) {
  const hasPhoto = !!product.firebaseUrl;
  return (
    <div className="group">
      <button
        onClick={onToggle}
        aria-pressed={selected}
        className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F4C69] focus-visible:ring-offset-2"
      >
        <div
          className={
            'relative aspect-[4/5] overflow-hidden rounded-sm bg-neutral-100 transition-shadow ' +
            (selected
              ? 'shadow-[0_0_0_2px_#2F4C69]'
              : 'shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)] group-hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)]')
          }
        >
          {hasPhoto ? (
            <img
              src={thumb(product.firebaseUrl, 420)}
              alt={product.displayName}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[11px] text-neutral-400">
              No photo
            </div>
          )}
          <span
            className={
              'absolute left-2 top-2 grid h-[19px] w-[19px] place-items-center rounded-full text-[11px] transition-opacity ' +
              (selected
                ? 'bg-[#2F4C69] text-white opacity-100'
                : 'bg-white/90 text-neutral-900 opacity-0 group-hover:opacity-100')
            }
          >
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        </div>
      </button>

      <div className="pt-3">
        <div className="text-sm font-semibold leading-tight">{product.displayName}</div>
        <div className="font-mono text-[10.5px] text-neutral-400">{product.styleNumber}</div>
        <div className="mt-0.5 text-xs text-neutral-500">
          {product.construction}
          {product.construction && product.materials ? <br /> : null}
          {product.materials}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-neutral-500">
          <i
            className={'h-[5px] w-[5px] shrink-0 rounded-full ' + (hasPhoto ? 'bg-[#4C7459]' : 'bg-[#98671A]')}
          />
          {hasPhoto ? 'Photos ready' : 'Needs photos'}
          <Link
            to={`/rug-gallery/${encodeURIComponent(product.baseStyleNumber)}`}
            className="ml-auto text-neutral-400 underline-offset-2 hover:text-neutral-900 hover:underline"
          >
            Open
          </Link>
        </div>
      </div>
    </div>
  );
}

function Tray({ onDone }: { onDone: (id: string) => void }) {
  const tray = useSelection();
  const [busy, setBusy] = useState<'ppt' | 'link' | null>(null);
  const [asking, setAsking] = useState(false);
  const [buyer, setBuyer] = useState('');
  const [error, setError] = useState('');

  if (!tray.count) {
    return (
      <div className="sticky bottom-0 border-t border-neutral-200 bg-white py-4 text-center text-[13px] text-neutral-400">
        Tick a rug to start a catalog
      </div>
    );
  }

  const noPhotos = tray.items.filter((p) => !p.firebaseUrl).length;

  async function makePpt() {
    setBusy('ppt');
    setError('');
    try {
      await generateProductPPT(tray.items, 'Eastern Mills');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the PPT.');
    } finally {
      setBusy(null);
    }
  }

  async function makeLink() {
    if (!buyer.trim()) return setError('Type who this is for.');
    setBusy('link');
    setError('');
    try {
      const id = await createCatalog(tray.items, buyer, currentUserEmail() || undefined);
      await navigator.clipboard.writeText(catalogUrl(id)).catch(() => {});
      tray.clear();
      setAsking(false);
      setBuyer('');
      onDone(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the link.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="sticky bottom-0 border-t border-neutral-200 bg-white">
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-3 px-7 py-4">
        <span className="font-serif text-xl">{tray.count} selected</span>
        <button onClick={tray.clear} className="text-[13px] text-neutral-500 hover:text-neutral-900">
          Clear
        </button>
        {noPhotos > 0 && (
          <span className="text-[12px] text-[#98671A]">
            {noPhotos} without a photo {noPhotos === 1 ? 'is' : 'are'} left out of the link
          </span>
        )}
        <div className="flex-1" />

        {asking ? (
          <>
            <input
              autoFocus
              value={buyer}
              onChange={(e) => setBuyer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && makeLink()}
              placeholder="Who is this for?"
              className="w-52 border-b border-neutral-300 bg-transparent pb-1 text-sm outline-none placeholder:text-neutral-400 focus:border-[#2F4C69]"
            />
            <button
              onClick={() => { setAsking(false); setError(''); }}
              className="px-1 text-[13px] text-neutral-500 hover:text-neutral-900"
            >
              Cancel
            </button>
            <button
              onClick={makeLink}
              disabled={busy !== null}
              className="rounded-sm bg-[#2F4C69] px-[18px] py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
            >
              {busy === 'link' ? 'Creating…' : 'Create link'}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={makePpt}
              disabled={busy !== null}
              className="rounded-sm border border-neutral-200 px-[18px] py-2.5 text-[13px] font-semibold hover:border-neutral-400 disabled:opacity-60"
            >
              {busy === 'ppt' ? 'Building…' : 'Download PPT'}
            </button>
            <button
              onClick={() => setAsking(true)}
              className="rounded-sm bg-[#2F4C69] px-[18px] py-2.5 text-[13px] font-semibold text-white"
            >
              Create link
            </button>
          </>
        )}
      </div>
      {error && <p className="px-7 pb-3 text-[12.5px] text-red-600">{error}</p>}
    </div>
  );
}
