import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { thumb } from '../lib/img';
import {
  PHOTO_SLOTS, SLOT_HINTS, SLIDE_W, SLIDE_H, SPEC_BOX, LOGO_BOX,
  photoSlotsFor, fitContain, constrainBox, isDefaultSlots, type Box, type Corner, type SlideLayout,
} from '../lib/deckSlots';
import { saveSlideLayout, saveSlideLayoutOnExit, withFreshSlideLayouts } from '../lib/productEdit';
import type { ShowroomProduct } from '../lib/firebase';

const pct = (b: Box) => ({
  left: `${(b.x / SLIDE_W) * 100}%`,
  top: `${(b.y / SLIDE_H) * 100}%`,
  width: `${(b.w / SLIDE_W) * 100}%`,
  height: `${(b.h / SLIDE_H) * 100}%`,
});

/** A box placed inside another, as percentages of the outer one. */
const pctIn = (inner: Box, outer: Box) => ({
  left: `${((inner.x - outer.x) / outer.w) * 100}%`,
  top: `${((inner.y - outer.y) / outer.h) * 100}%`,
  width: `${(inner.w / outer.w) * 100}%`,
  height: `${(inner.h / outer.h) * 100}%`,
});

const CORNERS: Array<Corner & { name: string; cls: string; cursor: string }> = [
  { sx: -1, sy: -1, name: 'top left', cls: '-left-2 -top-2', cursor: 'nwse-resize' },
  { sx: 1, sy: -1, name: 'top right', cls: '-right-2 -top-2', cursor: 'nesw-resize' },
  { sx: -1, sy: 1, name: 'bottom left', cls: '-bottom-2 -left-2', cursor: 'nesw-resize' },
  { sx: 1, sy: 1, name: 'bottom right', cls: '-bottom-2 -right-2', cursor: 'nwse-resize' },
];

/** Debounce before a change is written, per the house autosave rule. */
const SAVE_DELAY = 1500;

type Drag = {
  i: number;
  mode: 'move' | Corner;
  pointerId: number;
  startX: number;
  startY: number;
  start: Box;
  moved: boolean;
};

type Status = '' | 'pending' | 'saving' | 'saved' | 'error';

/**
 * The deck slide in miniature, with this record's photos in their boxes. The
 * boxes can be dragged to move them and pulled by a corner to resize them, and
 * that layout is saved on this design or colourway only (`slideLayout`), never
 * on the house template. The deck is built from the same boxes through
 * photoSlotsFor(), and each photo is drawn with fitContain(), the maths the
 * deck places it with, so this is the slide the buyer gets.
 */
export function SlidePreview({
  product, photos, onPick, onLayoutSaved,
}: {
  product: ShowroomProduct;
  photos: string[];
  onPick?: (url: string) => void;
  /** Called with the saved layout (undefined = back to the house layout). */
  onLayoutSaved?: (id: string, layout: SlideLayout | undefined) => void;
}) {
  const extra = Math.max(0, photos.length - PHOTO_SLOTS.length);
  const [boxes, setBoxes] = useState<Box[]>(() => photoSlotsFor(product.slideLayout));
  const [active, setActive] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>('');
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number }>>({});
  const slideRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  // --- Saving: Firestore only, ~1.5 s after the last change, flushed on pagehide.
  const target = useRef(product);
  const pending = useRef<Box[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savedCb = useRef(onLayoutSaved);
  savedCb.current = onLayoutSaved;
  const mounted = useRef(true);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    const p = target.current;
    if (mounted.current) setStatus('saving');
    try {
      const saved = await saveSlideLayout(p, next);
      if (target.current.id === p.id) target.current = { ...target.current, slideLayout: saved.slideLayout };
      savedCb.current?.(p.id, saved.slideLayout);
      if (mounted.current && !pending.current) {
        setStatus('saved');
        setTimeout(() => mounted.current && setStatus((s) => (s === 'saved' ? '' : s)), 2000);
      }
    } catch {
      if (!pending.current) pending.current = next;
      if (mounted.current) setStatus('error');
    }
  }, []);

  // The page is being hidden or closed: send what is pending in a way that
  // survives the page going away (keepalive), not through the SDK.
  const flushOnExit = useCallback(() => {
    clearTimeout(timer.current);
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    const p = target.current;
    const layout = saveSlideLayoutOnExit(p, next);
    if (target.current.id === p.id) target.current = { ...target.current, slideLayout: layout };
    savedCb.current?.(p.id, layout);
    if (mounted.current) setStatus('saved');
  }, []);

  const schedule = useCallback((next: Box[]) => {
    pending.current = next;
    setStatus('pending');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY);
  }, [flush]);

  // Switching to another design or colourway: save what is pending for the
  // old one first (cleanup runs with the old record still in `target`), then
  // load the new record's layout.
  useEffect(() => {
    target.current = product;
    setBoxes(photoSlotsFor(product.slideLayout));
    setActive(null);
    // The copy passed in can be older than the saved layout (the grid and the
    // colourway tiles are cached), so read the record's layout fresh.
    let live = true;
    withFreshSlideLayouts([product]).then(([fresh]) => {
      if (!live || pending.current || drag.current) return;
      target.current = { ...target.current, slideLayout: fresh.slideLayout };
      setBoxes(photoSlotsFor(fresh.slideLayout));
    });
    return () => { live = false; void flush(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  // Fresh copies of the same record (after a reorder or a turn) keep the
  // boxes on screen: they are what is being saved.
  useEffect(() => { if (product.id === target.current.id) target.current = { ...product, slideLayout: target.current.slideLayout }; }, [product]);

  useEffect(() => {
    mounted.current = true;
    const onHide = () => flushOnExit();
    const onVis = () => { if (document.visibilityState === 'hidden') flushOnExit(); };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      mounted.current = false;
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVis);
      void flush();
    };
  }, [flush, flushOnExit]);

  function change(i: number, box: Box, save = true) {
    setBoxes((cur) => {
      const next = cur.map((b, j) => (j === i ? box : b));
      if (save) schedule(next);
      return next;
    });
  }

  function reset() {
    const next = PHOTO_SLOTS.map((b) => ({ ...b }));
    setBoxes(next);
    schedule(next);
  }

  function fitToPhoto(i: number) {
    const url = photos[i];
    const s = url && sizes[url];
    if (!s) return;
    change(i, fitContain(boxes[i], s.w, s.h));
  }

  // --- Pointer: mouse, pen and touch alike.
  function down(e: ReactPointerEvent, i: number, mode: 'move' | Corner) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    (mode === 'move' ? (e.currentTarget as HTMLElement) : (e.currentTarget.parentElement as HTMLElement))?.focus({ preventScroll: true });
    setActive(i);
    drag.current = { i, mode, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, start: boxes[i], moved: false };
  }

  function move(e: ReactPointerEvent) {
    const d = drag.current;
    const el = slideRef.current;
    if (!d || !el || e.pointerId !== d.pointerId) return;
    const rect = el.getBoundingClientRect();
    const px = e.clientX - d.startX;
    const py = e.clientY - d.startY;
    if (!d.moved && Math.hypot(px, py) < 4) return;
    d.moved = true;
    const dx = (px / rect.width) * SLIDE_W;
    const dy = (py / rect.height) * SLIDE_H;
    const s = d.start;
    let next: Box;
    if (d.mode === 'move') {
      next = { ...s, x: s.x + dx, y: s.y + dy };
    } else {
      const { sx, sy } = d.mode;
      next = {
        x: sx === -1 ? s.x + dx : s.x,
        y: sy === -1 ? s.y + dy : s.y,
        w: s.w + sx * dx,
        h: s.h + sy * dy,
      };
    }
    setBoxes((cur) => cur.map((b, j) => (j === d.i ? constrainBox(next, b, d.mode) : b)));
  }

  function up(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    if (!d.moved) {
      if (d.mode === 'move' && photos[d.i]) onPick?.(photos[d.i]);
      return;
    }
    setBoxes((cur) => { schedule(cur); return cur; });
  }

  // --- Keyboard: arrows move a focused box, or a focused corner. Shift = bigger steps.
  function key(e: ReactKeyboardEvent, i: number, mode: 'move' | Corner) {
    const step = e.shiftKey ? 0.5 : 0.1;
    const dir: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    if (mode === 'move' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      if (photos[i]) onPick?.(photos[i]);
      return;
    }
    const v = dir[e.key];
    if (!v) return;
    e.preventDefault();
    e.stopPropagation();
    const b = boxes[i];
    const [dx, dy] = [v[0] * step, v[1] * step];
    let next: Box;
    if (mode === 'move') next = { ...b, x: b.x + dx, y: b.y + dy };
    else next = {
      x: mode.sx === -1 ? b.x + dx : b.x,
      y: mode.sy === -1 ? b.y + dy : b.y,
      w: b.w + mode.sx * dx,
      h: b.h + mode.sy * dy,
    };
    change(i, constrainBox(next, b, mode));
  }

  const custom = !isDefaultSlots(boxes);
  const isColourway = !!product.baseStyleNumber && product.styleNumber !== product.baseStyleNumber;
  const which = isColourway ? 'this colourway' : 'this design';
  const activeUrl = active !== null ? photos[active] : undefined;

  return (
    <figure className="mt-4" aria-label="Where each photo goes on the deck slide">
      <figcaption className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
        On the deck slide
        <span className="font-normal normal-case tracking-normal text-neutral-400">
          Drag a box to move it, pull a corner to resize. Drag the thumbnails above to change which photo goes where.
        </span>
      </figcaption>
      <div
        ref={slideRef}
        className="relative w-full select-none rounded-sm border border-neutral-200 bg-white"
        style={{ aspectRatio: `${SLIDE_W} / ${SLIDE_H}` }}
        onPointerDown={() => setActive(null)}
      >
        {/* The slide itself: photos in slot order, fitted exactly as the deck fits them. */}
        <div className="absolute inset-0 overflow-hidden" aria-hidden>
          {boxes.map((box, i) => {
            const url = photos[i];
            const s = url ? sizes[url] : undefined;
            return (
              <div key={i} className="absolute" style={pct(box)}>
                {url ? (
                  <img
                    src={thumb(url, 480)}
                    alt=""
                    draggable={false}
                    onLoad={(e) => {
                      const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                      if (w && h) setSizes((m) => (m[url]?.w === w && m[url]?.h === h ? m : { ...m, [url]: { w, h } }));
                    }}
                    className={s ? 'absolute' : 'h-full w-full object-contain'}
                    style={s ? pctIn(fitContain(box, s.w, s.h), box) : undefined}
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center border border-dashed border-neutral-300 bg-neutral-50 text-center text-[10px] text-neutral-400">
                    {SLOT_HINTS[i]}
                  </span>
                )}
              </div>
            );
          })}
          {/* Spec text and logo, as grey bars so the layout reads like the slide. */}
          <div className="absolute flex flex-col justify-between py-[1%]" style={pct(SPEC_BOX)}>
            {[90, 70, 80, 60, 75].map((w, i) => (
              <span key={i} className="block h-[9%] rounded-full bg-neutral-200" style={{ width: `${w}%` }} />
            ))}
          </div>
          <div className="absolute rounded-sm bg-neutral-100" style={pct(LOGO_BOX)} />
        </div>

        {/* Handles on top. Transparent, so they never change what the slide shows. */}
        {boxes.map((box, i) => {
          const url = photos[i];
          const on = active === i;
          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              aria-label={`Box ${i + 1}, ${SLOT_HINTS[i]}${url ? '' : ', empty'}. Arrow keys move it, Shift for bigger steps. Tab to its corners to resize.`}
              onPointerDown={(e) => down(e, i, 'move')}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onFocus={() => setActive(i)}
              onKeyDown={(e) => key(e, i, 'move')}
              onDoubleClick={() => fitToPhoto(i)}
              className={
                'group absolute cursor-move touch-none outline-none ' +
                (on
                  ? 'z-20 shadow-[inset_0_0_0_2px_#2F4C69]'
                  : 'z-10 shadow-[inset_0_0_0_1px_rgba(47,76,105,0.25)] hover:shadow-[inset_0_0_0_1px_#2F4C69]') +
                ' focus-visible:shadow-[inset_0_0_0_2px_#2F4C69,0_0_0_3px_rgba(47,76,105,0.35)]'
              }
              style={pct(box)}
            >
              <span className={
                'pointer-events-none absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold text-white shadow ' +
                (i === 0 ? 'bg-[#2F4C69]' : 'bg-[#98671A]')
              }>
                {i + 1}
              </span>
              {on && CORNERS.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  aria-label={`Resize box ${i + 1} from its ${c.name} corner. Arrow keys move the corner.`}
                  onPointerDown={(e) => down(e, i, c)}
                  onPointerMove={move}
                  onPointerUp={up}
                  onPointerCancel={up}
                  onKeyDown={(e) => key(e, i, c)}
                  onFocus={(e) => { e.stopPropagation(); setActive(i); }}
                  className={'absolute grid h-4 w-4 touch-none place-items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[#98671A] focus-visible:ring-offset-1 ' + c.cls}
                  style={{ cursor: c.cursor }}
                >
                  <span className="pointer-events-none block h-2.5 w-2.5 rounded-[2px] border border-white bg-[#2F4C69] shadow" />
                </button>
              ))}
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
        {custom ? (
          <span className="text-neutral-600">Own layout for {which}</span>
        ) : (
          <span className="text-neutral-400">House layout</span>
        )}
        {active !== null && activeUrl && sizes[activeUrl] && (
          <button type="button" onClick={() => fitToPhoto(active)}
            title="Trim the box to the photo's own shape, so no space is left around it"
            className="font-semibold text-[#2F4C69] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F4C69]">
            Fit box {active + 1} to its photo
          </button>
        )}
        <button type="button" onClick={reset} disabled={!custom}
          className="font-semibold text-[#2F4C69] underline-offset-2 hover:underline disabled:cursor-default disabled:text-neutral-300 disabled:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F4C69]">
          Reset to default layout
        </button>
        <span className={'ml-auto text-[11px] ' + (status === 'error' ? 'text-red-600' : 'text-neutral-400')} role="status" aria-live="polite">
          {status === 'saving' || status === 'pending' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? (
            <>Could not save. <button type="button" className="font-semibold underline" onClick={() => { void flush(); }}>Try again</button></>
          ) : ''}
        </span>
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
      <p className="mt-1.5 text-[11.5px] text-neutral-400">
        Each photo is fitted whole inside its box, as on the slide. The layout is saved for {which} only.
        {extra > 0 && ` Photos after the 4th (${extra} more) go on an extra slide when the deck has Add the extra photos ticked.`}
      </p>
    </figure>
  );
}
