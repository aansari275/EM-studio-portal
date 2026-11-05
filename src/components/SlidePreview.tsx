import { thumb } from '../lib/img';
import { PHOTO_SLOTS, SLOT_HINTS, SLIDE_W, SLIDE_H, SPEC_BOX, LOGO_BOX, type Box } from '../lib/deckSlots';

const pct = (b: Box) => ({
  left: `${(b.x / SLIDE_W) * 100}%`,
  top: `${(b.y / SLIDE_H) * 100}%`,
  width: `${(b.w / SLIDE_W) * 100}%`,
  height: `${(b.h / SLIDE_H) * 100}%`,
});

/**
 * The deck slide in miniature, with this design's own photos in their slots
 * and each slot numbered. It sits under the thumbnails so whoever orders the
 * photos sees which number lands where, and which angle each slot wants.
 * Geometry comes from deckSlots.ts, the same boxes the deck is built from.
 */
export function SlidePreview({ photos, onPick }: { photos: string[]; onPick?: (url: string) => void }) {
  const extra = Math.max(0, photos.length - PHOTO_SLOTS.length);
  return (
    <figure className="mt-4" aria-label="Where each photo goes on the deck slide">
      <figcaption className="mb-1.5 flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
        On the deck slide
        <span className="font-normal normal-case tracking-normal text-neutral-400">
          Drag the thumbnails above to change which photo goes where.
        </span>
      </figcaption>
      <div className="relative w-full overflow-hidden rounded-sm border border-neutral-200 bg-white"
        style={{ aspectRatio: `${SLIDE_W} / ${SLIDE_H}` }}>
        {PHOTO_SLOTS.map((box, i) => {
          const url = photos[i];
          return (
            <button
              key={i}
              type="button"
              onClick={() => url && onPick?.(url)}
              disabled={!url}
              aria-label={url ? `Photo ${i + 1}, ${SLOT_HINTS[i]}` : `Slot ${i + 1} is empty, ${SLOT_HINTS[i]}`}
              className="absolute flex items-center justify-center"
              style={pct(box)}
            >
              {url ? (
                <img src={thumb(url, 360)} alt="" className="h-full w-full object-contain" />
              ) : (
                <span className="flex h-full w-full items-center justify-center border border-dashed border-neutral-300 bg-neutral-50 text-[10px] text-neutral-400">
                  {SLOT_HINTS[i]}
                </span>
              )}
              <span className={
                'absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold text-white shadow ' +
                (i === 0 ? 'bg-[#2F4C69]' : 'bg-[#98671A]')
              }>
                {i + 1}
              </span>
            </button>
          );
        })}
        {/* Spec text and logo, as grey bars so the layout reads like the slide. */}
        <div className="absolute flex flex-col justify-between py-[1%]" style={pct(SPEC_BOX)} aria-hidden>
          {[90, 70, 80, 60, 75].map((w, i) => (
            <span key={i} className="block h-[9%] rounded-full bg-neutral-200" style={{ width: `${w}%` }} />
          ))}
        </div>
        <div className="absolute rounded-sm bg-neutral-100" style={pct(LOGO_BOX)} aria-hidden />
      </div>
      <ol className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-neutral-600 sm:grid-cols-4">
        {SLOT_HINTS.map((hint, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span className={
              'grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ' +
              (i === 0 ? 'bg-[#2F4C69]' : 'bg-[#98671A]')
            }>{i + 1}</span>
            {hint}
          </li>
        ))}
      </ol>
      {extra > 0 && (
        <p className="mt-1.5 text-[11.5px] text-neutral-400">
          Photos after the 4th ({extra} more) go on an extra slide when the deck has Add the extra photos ticked.
        </p>
      )}
    </figure>
  );
}
