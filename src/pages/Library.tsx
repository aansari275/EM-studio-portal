import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useInfiniteQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Search, Check, X, Plus, Copy } from 'lucide-react';
import { type ShowroomProduct } from '../lib/firebase';
import {
  getLibraryProducts,
  searchLibraryPage,
  joinPages,
  getLibraryCount,
  getLibraryVariants,
  type LibraryPage,
} from '../lib/library';
import { useSelection } from '../lib/selection';
const PptDialog = lazy(() => import('../components/PptDialog'));
import { createCatalog, catalogUrl, EXPIRY_CHOICES } from '../lib/catalogs';
import { signOutUser, currentUserEmail } from '../lib/auth';
import { thumb, heroImage, orderedImages } from '../lib/img';
import { canonicalConstruction } from '../lib/library';
import { NewProduct, type NewProductInitial } from '../components/NewProduct';
import { PhotoDrop } from '../components/PhotoDrop';

/**
 * Filters are derived from the style number, because that is the only field the
 * data actually carries. `construction`, `materials` and `color` are empty on
 * essentially every product, and `category` reads "Area Rug" on all of them, so
 * filtering on those matched nothing. A style number looks like EM-23-MA-6255,
 * sometimes with spaces instead of dashes.
 */
function styleYear(styleNumber: string): string {
  // Separators are inconsistent in the data: EM-21-CO-2227, EM 21 CO 2227 and
  // EM.21.CO.2227 all occur. Normalise them all to dashes before matching.
  const m = (styleNumber || '').toUpperCase().replace(/[\s._/]+/g, '-').match(/^EM-?(\d{2})-/);
  if (!m) return '';
  const y = Number(m[1]);
  // Two typos survived into the archive as year 35 and 28. Anything beyond next
  // year is a mistype, not a real season, so it is not offered as a filter.
  return y > 26 ? '' : `20${m[1]}`;
}

export function Library() {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [year, setYear] = useState('');
  const [build, setBuild] = useState('');
  const [needsPhotos, setNeedsPhotos] = useState(false);
  const [open, setOpen] = useState<ShowroomProduct | null>(null);
  // null: closed. An object: open, prefilled from it (empty for a fresh design).
  const [creating, setCreating] = useState<NewProductInitial | null>(null);
  const tray = useSelection();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 150);
    return () => clearTimeout(t);
  }, [term]);

  // Wake the search function while the grid loads, so the first letter typed
  // does not wait on a cold start.
  useEffect(() => { fetch('/api/search?warm=1').catch(() => {}); }, []);

  const { data: total } = useQuery({ queryKey: ['library-count'], queryFn: getLibraryCount });

  // Searches come 60 at a time and the next page loads as she nears the
  // bottom. A broad term like "80" matches thousands; waiting for 300 full
  // records before showing any was the lag. Browsing with nothing typed stays
  // a single page of the newest designs.
  const {
    data, isLoading, isFetching, isPlaceholderData,
    hasNextPage, isFetchingNextPage, fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['library', debounced],
    queryFn: ({ pageParam }): Promise<LibraryPage> =>
      debounced
        ? searchLibraryPage(debounced, pageParam)
        : getLibraryProducts(200).then((items) => ({ items, nextOffset: null })),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    // Keep the last results on screen while the next letter is looked up, so
    // the grid narrows as she types instead of blinking to "Loading".
    placeholderData: keepPreviousData,
  });
  const products = useMemo(() => (data ? joinPages(data.pages) : []), [data]);
  // A new term is being looked up while the old results are still showing.
  const refreshing = isFetching && !isFetchingNextPage;

  // Chips are built from what actually loaded, never hardcoded. The first
  // version listed Hand Knotted / Silk / Wool from the TypeScript interface and
  // matched nothing, because showroom_products has those fields empty. The
  // em_products archive does carry them, so they are real again — but only the
  // values genuinely present are offered.
  const years = useMemo(() => {
    const seen = new Set<string>();
    products.forEach((p) => { const y = styleYear(p.styleNumber); if (y) seen.add(y); });
    return [...seen].sort().reverse();
  }, [products]);

  const builds = useMemo(() => {
    const c = new Map<string, number>();
    products.forEach((p) => {
      // Only recognised constructions become chips. The field also carries
      // materials, GSM numbers and variant codes, which are not filters.
      const v = canonicalConstruction(p.construction);
      if (v) c.set(v, (c.get(v) || 0) + 1);
    });
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([v]) => v);
  }, [products]);

  const shown = useMemo(
    () =>
      products.filter(
        (p) =>
          (!year || styleYear(p.styleNumber) === year) &&
          (!build || canonicalConstruction(p.construction) === build) &&
          (!needsPhotos || !heroImage(p))
      ),
    [products, year, build, needsPhotos]
  );

  const allShownSelected = shown.length > 0 && shown.every((p) => tray.has(p.id));

  // Fetch the next page when the end of the grid comes within a screen of
  // view. The observer is rebuilt after every page, because a page that fits
  // without scrolling leaves the sentinel visible and no new intersection
  // would ever fire.
  const sentinel = useRef<HTMLDivElement>(null);
  const pageCount = data?.pages.length ?? 0;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage || isFetchingNextPage || isPlaceholderData) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) fetchNextPage(); },
      { rootMargin: '0px 0px 800px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, isPlaceholderData, fetchNextPage, pageCount, shown.length]);

  return (
    <div className="flex min-h-screen flex-col bg-white text-neutral-900">
      <Header />

      <div className="mx-auto w-full max-w-[1400px] px-7">
        <label
          className={
            'mt-8 flex items-center gap-4 rounded-md border bg-white px-5 transition-colors ' +
            (term
              ? 'border-[#2F4C69]'
              : 'border-neutral-200 hover:border-neutral-300 focus-within:border-[#2F4C69]')
          }
        >
          <Search className="h-[22px] w-[22px] shrink-0 text-neutral-400" strokeWidth={1.6} />
          <input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={`Search ${total ? total.toLocaleString() : ''} designs by name or number`}
            className="w-full border-0 bg-transparent py-[18px] text-[19px] outline-none placeholder:text-neutral-400"
          />
          {term && (
            <button
              onClick={() => setTerm('')}
              aria-label="Clear search"
              className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          )}
        </label>

        <div className="flex flex-wrap items-center gap-5 pt-5">
          <button
            onClick={() => setCreating({})}
            className="flex items-center gap-1.5 rounded-sm bg-[#2F4C69] px-3 py-1.5 text-[12.5px] font-semibold text-white"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={3} /> New design
          </button>
          <Chip on={!year && !build && !needsPhotos}
            onClick={() => { setYear(''); setBuild(''); setNeedsPhotos(false); }}>
            All
          </Chip>
          {builds.map((b) => (
            <Chip key={b} on={build === b}
              onClick={() => { setBuild(build === b ? '' : b); setNeedsPhotos(false); }}>
              {b}
            </Chip>
          ))}
          {years.map((y) => (
            <Chip key={y} on={year === y}
              onClick={() => { setYear(year === y ? '' : y); setNeedsPhotos(false); }}>
              {y}
            </Chip>
          ))}
          <Chip on={needsPhotos}
            onClick={() => { setNeedsPhotos(!needsPhotos); setYear(''); setBuild(''); }}>
            Needs photos
          </Chip>

          <span className="ml-auto flex items-center gap-4 text-[12.5px] text-neutral-400">
            <span>{shown.length} shown</span>
            {shown.length > 0 && (
              <button
                onClick={() => shown.forEach((p) => { if (tray.has(p.id) === allShownSelected) tray.toggle(p); })}
                className="font-semibold text-[#2F4C69] hover:underline"
              >
                {allShownSelected ? 'Unselect all' : `Select all ${shown.length}`}
              </button>
            )}
          </span>
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-[1400px] flex-1 px-7">
        <ProgressBar on={refreshing && !isLoading} />
        {isLoading ? (
          <SkeletonGrid />
        ) : !shown.length && !hasNextPage ? (
          <p className={'py-16 text-center text-sm text-neutral-400 transition-opacity ' + (isPlaceholderData ? 'opacity-50' : '')}>
            {debounced ? `Nothing matches “${debounced}”.` : 'Nothing here.'}
          </p>
        ) : (
          <>
            <div
              aria-busy={refreshing}
              className={
                'grid grid-cols-[repeat(auto-fill,minmax(178px,1fr))] gap-x-[22px] gap-y-[30px] py-8 transition-opacity duration-150 ' +
                (isPlaceholderData ? 'opacity-60' : '')
              }
            >
              {shown.map((p) => (
                <Card
                  key={p.id}
                  product={p}
                  selected={tray.has(p.id)}
                  onToggle={() => tray.toggle(p)}
                  onOpen={() => setOpen(p)}
                />
              ))}
            </div>
            {hasNextPage && (
              <div ref={sentinel} className="pb-10 text-center text-[12.5px] text-neutral-400">
                {isFetchingNextPage ? 'Loading more…' : '\u00a0'}
              </div>
            )}
          </>
        )}
      </div>

      <Tray onDone={(id) => navigate(`/links?new=${id}`)} />
      {open && (
        <Detail
          product={open}
          onClose={() => setOpen(null)}
          onChanged={(p) => { setOpen(p); qc.invalidateQueries({ queryKey: ['library'] }); }}
          onCopy={(p) => {
            setOpen(null);
            setCreating({
              construction: p.construction, materials: p.materials,
              color: p.color, size: p.size, gsm: p.gsm,
            });
          }}
        />
      )}
      {creating && (
        <NewProduct
          initial={creating}
          onClose={() => setCreating(null)}
          onCreated={(p) => { setCreating(null); qc.invalidateQueries({ queryKey: ['library'] }); setOpen(p); }}
          onOpenExisting={(p) => { setCreating(null); setOpen(p); }}
        />
      )}
    </div>
  );
}

/** A thin sweep along the top of the results while a search is in flight. */
function ProgressBar({ on }: { on: boolean }) {
  return (
    <div
      role="progressbar"
      aria-label="Searching"
      aria-hidden={!on}
      className={
        'pointer-events-none absolute inset-x-7 top-3 h-[2px] overflow-hidden rounded-full bg-[#2F4C69]/10 transition-opacity duration-200 ' +
        (on ? 'opacity-100' : 'opacity-0')
      }
    >
      <div className="h-full w-1/3 animate-[em-sweep_1.1s_ease-in-out_infinite] rounded-full bg-[#2F4C69]" />
    </div>
  );
}

/** Placeholder tiles shaped like Card, for the first load when nothing is on screen yet. */
function SkeletonGrid() {
  return (
    <div
      aria-label="Loading designs"
      className="grid grid-cols-[repeat(auto-fill,minmax(178px,1fr))] gap-x-[22px] gap-y-[30px] py-8"
    >
      {Array.from({ length: 18 }, (_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-[4/5] rounded-sm bg-neutral-100" />
          <div className="mt-3 h-3.5 w-3/4 rounded-sm bg-neutral-100" />
          <div className="mt-1.5 h-2.5 w-1/2 rounded-sm bg-neutral-100" />
          <div className="mt-2 h-2.5 w-1/3 rounded-sm bg-neutral-100" />
        </div>
      ))}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        'border-b-[1.5px] pb-0.5 text-[13px] transition-colors ' +
        (on
          ? 'border-[#2F4C69] font-semibold text-neutral-900'
          : 'border-transparent text-neutral-400 hover:text-neutral-700')
      }
    >
      {children}
    </button>
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
      <Link to="/links" className="text-[13px] text-neutral-500 hover:text-neutral-900">My links</Link>
      <Link to="/more" className="text-[13px] text-neutral-500 hover:text-neutral-900">More</Link>
      <button onClick={() => signOutUser()} title={email || undefined} className="text-[13px] text-neutral-400 hover:text-neutral-900">
        Sign out
      </button>
    </header>
  );
}

function Card({
  product, selected, onToggle, onOpen,
}: {
  product: ShowroomProduct; selected: boolean; onToggle: () => void; onOpen: () => void;
}) {
  const hasPhoto = !!product.firebaseUrl;
  return (
    <div className="group">
      <div
        className={
          'relative aspect-[4/5] overflow-hidden rounded-sm bg-neutral-100 transition-shadow ' +
          (selected
            ? 'shadow-[0_0_0_2px_#2F4C69]'
            : 'shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)] group-hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)]')
        }
      >
        {/* The image opens the detail. The checkbox selects. Two jobs, two targets. */}
        <button onClick={onOpen} className="block h-full w-full" aria-label={`Open ${product.displayName}`}>
          {hasPhoto ? (
            <img src={thumb(heroImage(product), 420)} alt={product.displayName} loading="lazy"
              className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[11px] text-neutral-400">
              No photo
            </span>
          )}
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          role="checkbox"
          aria-checked={selected}
          aria-label={selected ? `Unselect ${product.displayName}` : `Select ${product.displayName}`}
          className={
            'absolute left-2 top-2 grid h-6 w-6 place-items-center rounded border transition-colors ' +
            (selected
              ? 'border-[#2F4C69] bg-[#2F4C69] text-white'
              : 'border-neutral-300 bg-white/95 text-transparent hover:border-neutral-500')
          }
        >
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </button>
      </div>

      <div className="pt-3">
        <button onClick={onOpen} className="block text-left text-sm font-semibold leading-tight hover:underline">
          {product.displayName}
        </button>
        {product.styleNumber && product.styleNumber !== product.displayName && (
          <div className="font-mono text-[10.5px] text-neutral-400">{product.styleNumber}</div>
        )}
        {(product.construction || product.materials || product.color || product.size) && (
          <div className="mt-1 text-[11.5px] leading-snug text-neutral-500">
            {[product.construction, product.materials].filter(Boolean).join(' · ')}
            {(product.construction || product.materials) && (product.color || product.size) ? <br /> : null}
            {[product.color, product.size].filter(Boolean).join(' · ')}
          </div>
        )}
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-neutral-500">
          <i className={'h-[5px] w-[5px] shrink-0 rounded-full ' + (hasPhoto ? 'bg-[#4C7459]' : 'bg-[#98671A]')} />
          {hasPhoto ? 'Photo ready' : 'Needs photo'}
        </div>
      </div>
    </div>
  );
}

function Detail({ product, onClose, onChanged, onCopy }: {
  product: ShowroomProduct; onClose: () => void; onChanged?: (p: ShowroomProduct) => void;
  onCopy?: (p: ShowroomProduct) => void;
}) {
  const tray = useSelection();
  const selected = tray.has(product.id);
  const [shot, setShot] = useState(heroImage(product));

  const { data: variants = [] } = useQuery({
    queryKey: ['variants', product.baseStyleNumber],
    queryFn: () => getLibraryVariants(product.baseStyleNumber),
    enabled: !!product.baseStyleNumber,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  const gallery = orderedImages(product);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={product.displayName}
    >
      <div
        className="w-full max-w-4xl rounded-md bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4 border-b border-neutral-100 px-6 py-5">
          <div>
            <h2 className="font-serif text-[22px]">{product.displayName}</h2>
            <p className="font-mono text-[11px] text-neutral-400">{product.styleNumber}</p>
          </div>
          <div className="flex-1" />
          <button onClick={onClose} aria-label="Close" className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-7 p-6 sm:grid-cols-[1.2fr_1fr]">
          <div>
            <div className="aspect-[4/5] overflow-hidden rounded-sm bg-neutral-100">
              {shot ? (
                <img src={thumb(shot, 900)} alt={product.displayName} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-neutral-400">No photo yet</div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {gallery.map((g, i) => (
                <button
                  key={g}
                  onClick={() => setShot(g)}
                  title={i === 0 ? 'Main photo' : `Photo ${i + 1}`}
                  className={
                    'relative h-14 w-14 shrink-0 overflow-hidden rounded-sm ' +
                    (g === shot ? 'shadow-[0_0_0_2px_#2F4C69]' : 'shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)]')
                  }
                >
                  <img src={thumb(g, 120)} alt="" className="h-full w-full object-cover" />
                  {i === 0 && (
                    <span className="absolute inset-x-0 bottom-0 bg-black/55 text-center text-[8px] font-semibold uppercase tracking-wide text-white">
                      Main
                    </span>
                  )}
                </button>
              ))}
              <PhotoDrop product={product} onUploaded={(p) => onChanged?.(p)} />
            </div>
          </div>

          <div>
            <dl className="divide-y divide-neutral-100 border-y border-neutral-100 text-sm">
              <Row k="Design" v={product.baseStyleNumber} />
              <Row k="Style number" v={product.styleNumber} />
              <Row k="Colour" v={product.color} />
              <Row k="Construction" v={product.construction} />
              <Row k="Materials" v={product.materials} />
              <Row k="Size" v={product.size} />
              <Row k="GSM" v={product.gsm} />
              <Row k="Photos" v={`${gallery.length}`} />
            </dl>

            {variants.length > 1 && (
              <div className="mt-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                  {variants.length} colour variants
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {variants.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => tray.toggle(v)}
                      className={
                        'rounded border px-2 py-1 text-[11px] ' +
                        (tray.has(v.id)
                          ? 'border-[#2F4C69] bg-[#2F4C69] text-white'
                          : 'border-neutral-200 text-neutral-600 hover:border-neutral-400')
                      }
                    >
                      {v.color || v.styleNumber.replace(v.baseStyleNumber, '').replace(/^-/, '') || 'base'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={() => tray.toggle(product)}
                className={
                  'rounded-sm px-[18px] py-2.5 text-[13px] font-semibold ' +
                  (selected
                    ? 'border border-neutral-200 text-neutral-900 hover:border-neutral-400'
                    : 'bg-[#2F4C69] text-white')
                }
              >
                {selected ? 'Remove from selection' : 'Add to selection'}
              </button>
              {onCopy && (
                <button
                  onClick={() => onCopy(product)}
                  title="Start a new design with this construction, material, colour, size and GSM"
                  className="flex items-center gap-1.5 rounded-sm border border-neutral-200 px-[18px] py-2.5 text-[13px] font-semibold hover:border-neutral-400"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy as new design
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v?: string }) {
  return (
    <div className="flex gap-4 py-2">
      <dt className="w-32 shrink-0 text-neutral-400">{k}</dt>
      <dd className={'m-0 ' + (v ? '' : 'text-neutral-300')}>{v || 'Not recorded'}</dd>
    </div>
  );
}

function Tray({ onDone }: { onDone: (id: string) => void }) {
  const tray = useSelection();
  const [busy, setBusy] = useState<'link' | null>(null);
  const [pptOpen, setPptOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [buyer, setBuyer] = useState('');
  const [expiryDays, setExpiryDays] = useState(0);
  const [error, setError] = useState('');

  if (!tray.count) {
    return (
      <div className="sticky bottom-0 border-t border-neutral-200 bg-white py-4 text-center text-[13px] text-neutral-400">
        Tick a rug to start a catalog
      </div>
    );
  }

  const noPhotos = tray.items.filter((p) => !p.firebaseUrl).length;

  async function makeLink() {
    if (!buyer.trim()) return setError('Type who this is for.');
    setBusy('link'); setError('');
    try {
      const id = await createCatalog(tray.items, buyer, currentUserEmail() || undefined, expiryDays);
      await navigator.clipboard.writeText(catalogUrl(id)).catch(() => {});
      tray.clear(); setAsking(false); setBuyer(''); setExpiryDays(0); onDone(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the link.');
    } finally { setBusy(null); }
  }

  return (
    <div className="sticky bottom-0 border-t border-neutral-200 bg-white">
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-3 px-7 py-4">
        <span className="font-serif text-xl">{tray.count} selected</span>
        <button onClick={tray.clear} className="text-[13px] text-neutral-500 hover:text-neutral-900">Clear</button>
        {noPhotos > 0 && (
          <span className="text-[12px] text-[#98671A]">
            {noPhotos} without a photo {noPhotos === 1 ? 'is' : 'are'} left out of the link
          </span>
        )}
        <div className="flex-1" />

        {asking ? (
          <>
            <input
              autoFocus value={buyer} onChange={(e) => setBuyer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && makeLink()}
              placeholder="Who is this for?"
              className="w-52 border-b border-neutral-300 bg-transparent pb-1 text-sm outline-none placeholder:text-neutral-400 focus:border-[#2F4C69]"
            />
            <label className="flex items-center gap-1.5 text-[12.5px] text-neutral-500">
              Expires
              <select
                value={expiryDays}
                onChange={(e) => setExpiryDays(Number(e.target.value))}
                className="border-b border-neutral-300 bg-transparent pb-1 text-sm text-neutral-900 outline-none focus:border-[#2F4C69]"
              >
                {EXPIRY_CHOICES.map((c) => <option key={c.days} value={c.days}>{c.label}</option>)}
              </select>
            </label>
            <button onClick={() => { setAsking(false); setError(''); }} className="px-1 text-[13px] text-neutral-500 hover:text-neutral-900">
              Cancel
            </button>
            <button onClick={makeLink} disabled={busy !== null}
              className="rounded-sm bg-[#2F4C69] px-[18px] py-2.5 text-[13px] font-semibold text-white disabled:opacity-60">
              {busy === 'link' ? 'Creating…' : 'Create link'}
            </button>
          </>
        ) : (
          <>
            <button onClick={() => { setError(''); setPptOpen(true); }} disabled={busy !== null}
              className="rounded-sm border border-neutral-200 px-[18px] py-2.5 text-[13px] font-semibold hover:border-neutral-400 disabled:opacity-60">
              Download PPT
            </button>
            <button onClick={() => setAsking(true)}
              className="rounded-sm bg-[#2F4C69] px-[18px] py-2.5 text-[13px] font-semibold text-white">
              Create link
            </button>
          </>
        )}
      </div>
      {error && <p className="px-7 pb-3 text-[12.5px] text-red-600">{error}</p>}
      {pptOpen && <Suspense fallback={null}><PptDialog products={tray.items} onClose={() => setPptOpen(false)} /></Suspense>}
    </div>
  );
}
