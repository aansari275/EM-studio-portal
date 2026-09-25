import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCatalog } from '../lib/catalogs';
import { thumb } from '../lib/img';

/**
 * The page a buyer opens. Public, no sign-in, no tracking.
 *
 * Reads only the frozen catalog document, never the product collection, so a
 * shared link cannot leak the wider library and cannot change after sending.
 */
export function CatalogView() {
  const { id = '' } = useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['catalog', id],
    queryFn: () => getCatalog(id),
    retry: false,
  });

  if (isLoading) {
    return <Centered>Loading…</Centered>;
  }
  if (isError || !data) {
    return (
      <Centered>
        <p className="font-serif text-2xl text-neutral-900">Eastern Mills</p>
        <p className="mt-2 text-sm text-neutral-500">
          This selection is no longer available. Please ask for a fresh link.
        </p>
      </Centered>
    );
  }

  const when = data.createdAt
    ? new Date(data.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="border-b border-neutral-100 px-8 pb-9 pt-14">
        <h1 className="font-serif text-[clamp(24px,3vw,32px)] font-normal">{data.title}</h1>
        <p className="mt-1.5 text-[13.5px] text-neutral-500">
          {data.buyer ? `Selection for ${data.buyer}` : 'Selection'}
          {when ? ` · ${when}` : ''}
        </p>
      </header>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(205px,1fr))] gap-x-6 gap-y-9 p-8">
        {data.items.map((it, i) => (
          <figure key={`${it.styleNumber}-${i}`} className="m-0">
            <div className="aspect-[4/5] overflow-hidden rounded-sm bg-neutral-100 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)]">
              {/* The first row is what the buyer sees on opening, so it must not
                  wait on an intersection check. Everything below stays lazy. */}
              <img
                src={thumb(it.image, 700)}
                alt={it.displayName}
                loading={i < 4 ? 'eager' : 'lazy'}
                fetchPriority={i < 4 ? 'high' : 'auto'}
                decoding="async"
                className="h-full w-full object-cover"
              />
            </div>
            <figcaption className="pt-3">
              <div className="text-sm font-semibold leading-tight">{it.displayName}</div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {it.construction}
                {it.construction && it.materials ? <br /> : null}
                {it.materials}
                {it.size ? <><br />{it.size}</> : null}
              </div>
            </figcaption>
          </figure>
        ))}
      </div>

      <footer className="flex flex-wrap justify-between gap-3 border-t border-neutral-100 px-8 pb-9 pt-7 text-[12.5px] text-neutral-400">
        <span>Eastern Mills Pvt. Ltd. · Bhadohi, India</span>
        <a href="mailto:abdulansari@easternmills.com" className="hover:text-neutral-700">
          abdulansari@easternmills.com
        </a>
      </footer>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 text-center">
      <div>{children}</div>
    </div>
  );
}
