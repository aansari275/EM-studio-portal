import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Check, X } from 'lucide-react';
import {
  getShowroomProducts,
  searchShowroomProducts,
  getShowroomProductsCount,
  getDesignVariants,
  type ShowroomProduct,
} from '../lib/firebase';
import { useSelection } from '../lib/selection';
import { generateProductPPT } from '../lib/pptGenerator';
import { createCatalog, catalogUrl } from '../lib/catalogs';
import { signOutUser, currentUserEmail } from '../lib/auth';
import { thumb, heroImage, orderedImages } from '../lib/img';

/**
 * Filters are derived from the style number, because that is the only field the
 * data actually carries. `construction`, `materials` and `color` are empty on
 * essentially every product, and `category` reads "Area Rug" on all of them, so
 * filtering on those matched nothing. A style number looks like EM-23-MA-6255,
 * sometimes with spaces instead of dashes.
 */
function styleYear(styleNumber: string): string {
  const m = (styleNumber || '').toUpperCase().replace(/\s+/g, '-').match(/^EM-?(\d{2})-/);
  return m ? `20${m[1]}` : '';
}

export function Library() {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [year, setYear] = useState('');
  const [needsPhotos, setNeedsPhotos] = useState(false);
  const [open, setOpen] = useState<ShowroomProduct | null>(null);
  const tray = useSelection();
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);

  const { data: total } = useQuery({ queryKey: ['showroom-count'], queryFn: getShowroomProductsCount });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['library', debounced],
    queryFn: () => (debounced ? searchShowroomProducts(debounced, 300) : getShowroomProducts(200)),
  });

  // Only offer years that are actually present in what loaded.
  const years = useMemo(() => {
    const seen = new Set<string>();
    products.forEach((p) => { const y = styleYear(p.styleNumber); if (y) seen.add(y); });
    return [...seen].sort().reverse();
  }, [products]);

  const shown = useMemo(
    () =>
      products.filter(
        (p) => (!year || styleYear(p.styleNumber) === year) && (!needsPhotos || !p.firebaseUrl)
      ),
    [products, year, needsPhotos]
  );

  const allShownSelected = shown.length > 0 && shown.every((p) => tray.has(p.id));

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
          <Chip on={!year && !needsPhotos} onClick={() => { setYear(''); setNeedsPhotos(false); }}>
            All
          </Chip>
          {years.map((y) => (
            <Chip key={y} on={year === y} onClick={() => { setYear(year === y ? '' : y); setNeedsPhotos(false); }}>
              {y}
            </Chip>
          ))}
          <Chip on={needsPhotos} onClick={() => { setNeedsPhotos(!needsPhotos); setYear(''); }}>
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

      <div className="mx-auto w-full max-w-[1400px] flex-1 px-7">
        {isLoading ? (
          <p className="py-16 text-center text-sm text-neutral-400">Loading designs…</p>
        ) : !shown.length ? (
          <p className="py-16 text-center text-sm text-neutral-400">
            {debounced ? `Nothing matches “${debounced}”.` : 'Nothing here.'}
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(178px,1fr))] gap-x-[22px] gap-y-[30px] py-8">
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
        )}
      </div>

      <Tray onDone={(id) => navigate(`/links?new=${id}`)} />
      {open && <Detail product={open} onClose={() => setOpen(null)} />}
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
        <div className="font-mono text-[10.5px] text-neutral-400">{product.styleNumber}</div>
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-neutral-500">
          <i className={'h-[5px] w-[5px] shrink-0 rounded-full ' + (hasPhoto ? 'bg-[#4C7459]' : 'bg-[#98671A]')} />
          {hasPhoto ? 'Photo ready' : 'Needs photo'}
        </div>
      </div>
    </div>
  );
}

function Detail({ product, onClose }: { product: ShowroomProduct; onClose: () => void }) {
  const tray = useSelection();
  const selected = tray.has(product.id);
  const [shot, setShot] = useState(heroImage(product));

  const { data: variants = [] } = useQuery({
    queryKey: ['variants', product.baseStyleNumber],
    queryFn: () => getDesignVariants(product.baseStyleNumber),
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
            {gallery.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {gallery.map((g) => (
                  <button
                    key={g}
                    onClick={() => setShot(g)}
                    className={
                      'h-14 w-14 overflow-hidden rounded-sm ' +
                      (g === shot ? 'shadow-[0_0_0_2px_#2F4C69]' : 'shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)]')
                    }
                  >
                    <img src={thumb(g, 120)} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
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

            <div className="mt-6 flex flex-wrap gap-3">
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
              <Link
                to={`/rug-gallery/${encodeURIComponent(product.baseStyleNumber)}`}
                className="rounded-sm border border-neutral-200 px-[18px] py-2.5 text-[13px] font-semibold hover:border-neutral-400"
              >
                Upload photos
              </Link>
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
    setBusy('ppt'); setError('');
    try { await generateProductPPT(tray.items, 'Eastern Mills'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not build the PPT.'); }
    finally { setBusy(null); }
  }

  async function makeLink() {
    if (!buyer.trim()) return setError('Type who this is for.');
    setBusy('link'); setError('');
    try {
      const id = await createCatalog(tray.items, buyer, currentUserEmail() || undefined);
      await navigator.clipboard.writeText(catalogUrl(id)).catch(() => {});
      tray.clear(); setAsking(false); setBuyer(''); onDone(id);
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
            <button onClick={makePpt} disabled={busy !== null}
              className="rounded-sm border border-neutral-200 px-[18px] py-2.5 text-[13px] font-semibold hover:border-neutral-400 disabled:opacity-60">
              {busy === 'ppt' ? 'Building…' : 'Download PPT'}
            </button>
            <button onClick={() => setAsking(true)}
              className="rounded-sm bg-[#2F4C69] px-[18px] py-2.5 text-[13px] font-semibold text-white">
              Create link
            </button>
          </>
        )}
      </div>
      {error && <p className="px-7 pb-3 text-[12.5px] text-red-600">{error}</p>}
    </div>
  );
}
