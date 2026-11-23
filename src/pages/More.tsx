import { Link } from 'react-router-dom';

/**
 * Everything that is not the rug library. Off the sidebar since 23 Nov 2026
 * (owner): reached only at /more, and each page by its own URL.
 */
const ITEMS = [
  {
    to: '/dispatches',
    title: 'Dispatch photos (Orders app)',
    blurb: 'Photograph samples going out to a buyer for an Orders app dispatch. Feeds the Orders app.',
  },
  {
    to: '/sample-bazar',
    title: 'Sample Bazar',
    blurb: 'Studio thumbnails for Sample Bazar products.',
  },
];

export function More() {
  return (
    <div className="min-h-full bg-white pb-16 text-neutral-900">
      <div className="mx-auto w-full max-w-[900px] px-4 sm:px-7">
        <h1 className="mt-8 font-serif text-[26px] font-normal">More</h1>
        <ul className="mt-7 divide-y divide-neutral-100 border-t border-neutral-100">
          {ITEMS.map((i) => (
            <li key={i.to}>
              <Link to={i.to} className="block py-5 hover:bg-neutral-50">
                <div className="text-sm font-semibold">{i.title}</div>
                <div className="mt-0.5 text-[13px] text-neutral-500">{i.blurb}</div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
