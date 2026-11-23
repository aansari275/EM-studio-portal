import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Brush, Eraser, Maximize, Minus, Plus, Redo2, RotateCcw, Undo2, X } from 'lucide-react';
import { BRUSH_MAX, BRUSH_MIN, redoStroke, renderStrokes, stampSegment, compositeStroke, undoStroke, EMPTY_HISTORY, type Stroke } from '../lib/touchUp';
import type { Pt } from '../lib/photoEdit';
import { decode, encode } from '../lib/canvasImage';
import { prepareTouch, renderTouchFull, useTouchState, type Prepared, type TouchState } from '../lib/touchUpGlue';
import { useTabActive } from '../lib/tabContext';
import { useSlow } from '../lib/useSlow';
import { Spinner } from './Working';

/**
 * Touch up: paint to bring back what background removal cut off (fringes,
 * pale end bands) from the original photo, or to erase bits of floor it
 * left. Used as the first step of the photo editor and, on its own, from the
 * Library preview after Remove background. Maths in lib/touchUp.ts.
 */

const ZOOM_MAX = 16;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
type Cam = { k: number; ox: number; oy: number };
type Box = { x0: number; y0: number; x1: number; y1: number };
const union = (a: Box | null, b: Box): Box => (a ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : b);

/**
 * The picture she paints on. The cutout sits over a checkerboard; in Bring
 * back a faint copy of the original photo shows under it, so the lost fringe
 * is visible. Painting goes straight onto this picture, stroke by stroke;
 * the strokes themselves go up to the parent, which keeps the undo list.
 */
export function TouchCanvas({
  prepared, strokes, mode, smart, size, comparing, disabled, onStroke,
}: {
  prepared: Prepared;
  strokes: Stroke[];
  mode: Stroke['mode'];
  smart: boolean;
  size: number;
  /** Show the original photo (or the cutout before touch up when there is none). */
  comparing: boolean;
  disabled?: boolean;
  onStroke: (s: Stroke) => void;
}) {
  const W = prepared.cut.width, H = prepared.cut.height;
  const view = useRef<HTMLDivElement>(null);
  const pic = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const ghost = useRef<HTMLCanvasElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ w: 0, h: 0 });
  const [cam, setCam] = useState<Cam | null>(null);
  const [panning, setPanning] = useState(false);
  const descId = useId();
  const tabActive = useTabActive();

  const live = useRef<{ prepared: Prepared; done: Stroke[]; data: Uint8ClampedArray; before: Uint8ClampedArray; cov: Float32Array; img: ImageData } | null>(null);
  const stroke = useRef<{ s: Stroke; id: number } | null>(null);
  const dirty = useRef<Box | null>(null);
  const frame = useRef(0);
  const pointers = useRef(new Map<number, { x: number; y: number; type: string }>());
  const pan = useRef<{ id: number; x: number; y: number; ox: number; oy: number } | null>(null);
  const pinch = useRef<{ d: number; mx: number; my: number; cam: Cam } | null>(null);
  const space = useRef(false);

  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setRoom({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const s0 = room.w && room.h ? Math.min(room.w / W, room.h / H) : 0;
  /** Keeps the picture on screen: centred when smaller than the view, edges never past the view's when bigger. */
  const fix = useCallback((c: Cam): Cam => {
    const s = s0 * c.k, iw = W * s, ih = H * s;
    return {
      k: c.k,
      ox: iw <= room.w ? (room.w - iw) / 2 : clamp(c.ox, room.w - iw, 0),
      oy: ih <= room.h ? (room.h - ih) / 2 : clamp(c.oy, room.h - ih, 0),
    };
  }, [s0, W, H, room]);
  const shown = fix(cam || { k: 1, ox: 0, oy: 0 });
  const scale = s0 * shown.k;

  /** Zoom by `f` keeping the picture point under (mx, my) (view pixels) where it is. */
  const zoomAt = useCallback((f: number, mx: number, my: number) => {
    setCam((c) => {
      const cur = fix(c || { k: 1, ox: 0, oy: 0 });
      const k = clamp(cur.k * f, 1, ZOOM_MAX);
      const px = (mx - cur.ox) / (s0 * cur.k), py = (my - cur.oy) / (s0 * cur.k);
      return fix({ k, ox: mx - px * s0 * k, oy: my - py * s0 * k });
    });
  }, [fix, s0]);

  // Wheel or trackpad pinch zooms (needs a non-passive listener to keep the page still).
  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // Space held: drag moves the picture instead of painting.
  useEffect(() => {
    if (!tabActive) return;
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'A');
    };
    const down = (e: KeyboardEvent) => {
      if (e.key !== ' ' || typing(e.target)) return;
      e.preventDefault();
      if (!space.current) { space.current = true; setPanning(true); }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key !== ' ') return;
      space.current = false; setPanning(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [tabActive]);

  const paintNow = useCallback(() => {
    frame.current = 0;
    const L = live.current, b = dirty.current, ctx = cv.current?.getContext('2d');
    dirty.current = null;
    if (!L || !b || !ctx) return;
    ctx.putImageData(L.img, 0, 0, b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
  }, []);
  const schedule = useCallback((b: Box) => {
    dirty.current = union(dirty.current, b);
    if (!frame.current) frame.current = requestAnimationFrame(paintNow);
  }, [paintNow]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // The picture with every stroke so far. A stroke she just painted is
  // already on it; anything else (undo, redo, reset, a new photo) replays.
  useEffect(() => {
    const L = live.current;
    if (L && L.prepared === prepared && L.done.length === strokes.length && L.done.every((s, i) => s === strokes[i])) return;
    const px = renderStrokes(prepared.cut, prepared.src, strokes);
    const data = px.data as Uint8ClampedArray<ArrayBuffer>;
    live.current = {
      prepared, done: strokes, data, before: new Uint8ClampedArray(data.length),
      cov: new Float32Array(W * H), img: new ImageData(data, W, H),
    };
    const c = cv.current;
    if (c) { c.width = W; c.height = H; }
    schedule({ x0: 0, y0: 0, x1: W - 1, y1: H - 1 });
  }, [prepared, strokes, W, H, schedule]);

  useEffect(() => {
    const g = ghost.current, o = prepared.orig;
    if (!g || !o) return;
    g.width = o.width; g.height = o.height;
    g.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(o.data), o.width, o.height), 0, 0);
  }, [prepared]);

  // Comparing without an original: show the cutout as it came, then put the touched one back.
  useEffect(() => {
    if (!comparing || prepared.orig) return;
    const ctx = cv.current?.getContext('2d');
    ctx?.putImageData(new ImageData(new Uint8ClampedArray(prepared.cut.data), W, H), 0, 0);
    return () => schedule({ x0: 0, y0: 0, x1: W - 1, y1: H - 1 });
  }, [comparing, prepared, W, H, schedule]);

  /** Pointer position as a fraction of the picture. */
  const fracAt = (e: { clientX: number; clientY: number }): Pt => {
    const r = pic.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const moveRing = (e: { clientX: number; clientY: number }, show: boolean) => {
    const el = ring.current, v = view.current;
    if (!el || !v) return;
    const r = v.getBoundingClientRect();
    const d = 2 * size * Math.max(W, H) * scale;
    el.style.width = el.style.height = `${d}px`;
    el.style.transform = `translate(${e.clientX - r.left - d / 2}px, ${e.clientY - r.top - d / 2}px)`;
    el.style.opacity = show ? '1' : '0';
  };

  const extend = (p: Pt) => {
    const L = live.current, st = stroke.current;
    if (!L || !st) return;
    const pts = st.s.points;
    const prev = pts.length ? pts[pts.length - 1] : p;
    pts.push(p);
    const b = stampSegment(L.cov, W, H, prev, p, st.s.size);
    if (!b) return;
    compositeStroke(L.before, L.data, L.cov, W, b, st.s, prepared.src);
    schedule(b);
  };

  const cancelStroke = () => {
    const L = live.current;
    if (!L || !stroke.current) return;
    stroke.current = null;
    L.data.set(L.before);
    schedule({ x0: 0, y0: 0, x1: W - 1, y1: H - 1 });
  };

  const canPaint = !disabled && !(mode === 'restore' && !prepared.orig);

  const onDown = (e: React.PointerEvent) => {
    const v = view.current;
    if (!v) return;
    e.preventDefault(); // no text selection or page drag from a stroke
    v.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    const touches = [...pointers.current.values()].filter((p) => p.type === 'touch');
    if (touches.length >= 2) {
      // Two fingers: zoom and move, and the stroke the first finger started is dropped.
      cancelStroke();
      pan.current = null;
      const [a, b] = touches;
      const r = v.getBoundingClientRect();
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top, cam: shown };
      return;
    }
    if (space.current || e.button === 1) {
      e.preventDefault();
      pan.current = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: shown.ox, oy: shown.oy };
      return;
    }
    if (e.button !== 0 || !canPaint || stroke.current || !live.current) return;
    const L = live.current;
    L.before.set(L.data);
    L.cov.fill(0);
    stroke.current = { id: e.pointerId, s: { mode, smart: mode === 'restore' && smart, size, points: [] } };
    extend(fracAt(e));
    moveRing(e, true);
  };

  const onMove = (e: React.PointerEvent) => {
    const known = pointers.current.get(e.pointerId);
    if (known) { known.x = e.clientX; known.y = e.clientY; }
    if (e.pointerType !== 'touch' || stroke.current) moveRing(e, e.pointerType !== 'touch' || !!stroke.current);
    const pz = pinch.current;
    if (pz) {
      const t = [...pointers.current.values()].filter((p) => p.type === 'touch');
      if (t.length < 2) return;
      const r = view.current!.getBoundingClientRect();
      const d = Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y);
      const mx = (t[0].x + t[1].x) / 2 - r.left, my = (t[0].y + t[1].y) / 2 - r.top;
      const k = clamp(pz.cam.k * d / pz.d, 1, ZOOM_MAX);
      const px = (pz.mx - pz.cam.ox) / (s0 * pz.cam.k), py = (pz.my - pz.cam.oy) / (s0 * pz.cam.k);
      setCam(fix({ k, ox: mx - px * s0 * k, oy: my - py * s0 * k }));
      return;
    }
    const pn = pan.current;
    if (pn && pn.id === e.pointerId) {
      setCam(fix({ k: shown.k, ox: pn.ox + e.clientX - pn.x, oy: pn.oy + e.clientY - pn.y }));
      return;
    }
    const st = stroke.current;
    if (!st || st.id !== e.pointerId) return;
    const evs = typeof e.nativeEvent.getCoalescedEvents === 'function' ? e.nativeEvent.getCoalescedEvents() : [];
    for (const ev of evs.length ? evs : [e]) extend(fracAt(ev));
  };

  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
    if (pan.current?.id === e.pointerId) { pan.current = null; return; }
    const st = stroke.current, L = live.current;
    if (!st || st.id !== e.pointerId || !L) return;
    stroke.current = null;
    if (e.type === 'pointercancel') { L.data.set(L.before); schedule({ x0: 0, y0: 0, x1: W - 1, y1: H - 1 }); return; }
    if (e.pointerType === 'touch') moveRing(e, false);
    L.done = [...L.done, st.s];
    onStroke(st.s);
  };

  const zoomButton = (f: number) => zoomAt(f, room.w / 2, room.h / 2);
  const showGhost = !!prepared.orig && (comparing || mode === 'restore');

  return (
    <div className="relative flex min-h-[280px] flex-1 flex-col bg-neutral-100 sm:min-h-[420px]">
      <div ref={view}
        role="img" aria-label="Touch up picture" aria-describedby={descId}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onPointerLeave={(e) => { if (e.pointerType !== 'touch') moveRing(e, false); }}
        onContextMenu={(e) => e.preventDefault()}
        className={'relative flex-1 touch-none select-none overflow-hidden ' +
          (panning ? 'cursor-grab' : canPaint ? 'cursor-none' : 'cursor-not-allowed')}>
        <div ref={pic}
          className="absolute bg-[conic-gradient(#e8e8e8_0_25%,#fff_0_50%,#e8e8e8_0_75%,#fff_0)] bg-[length:16px_16px]"
          style={s0 ? { left: shown.ox, top: shown.oy, width: W * scale, height: H * scale } : { display: 'none' }}>
          {prepared.orig && (
            <canvas ref={ghost} aria-hidden className="absolute inset-0 h-full w-full transition-opacity duration-150 motion-reduce:transition-none"
              style={{ opacity: comparing ? 1 : showGhost ? 0.32 : 0 }} />
          )}
          <canvas ref={cv} aria-hidden className="absolute inset-0 h-full w-full"
            style={{ visibility: comparing && prepared.orig ? 'hidden' : 'visible', imageRendering: shown.k > 3 ? 'pixelated' : 'auto' }} />
        </div>
        <div ref={ring} aria-hidden
          className="pointer-events-none absolute left-0 top-0 rounded-full border border-white opacity-0 shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
          style={{ mixBlendMode: 'normal' }} />
        <p id={descId} className="sr-only">
          Painting needs a mouse, pen or finger. Every other control has a button: mode, brush size, undo, redo, zoom.
        </p>
      </div>
      {/* below the picture, so the buttons never cover a fringe she needs to paint */}
      <div className="flex items-center gap-1.5 border-t border-neutral-200 bg-neutral-50 px-2 py-1">
        <span className="flex-1 text-[12px] tabular-nums text-neutral-500" aria-live="polite">Zoom {Math.round(shown.k * 100)}%</span>
        {[
          { label: 'Zoom out', icon: <Minus className="h-4 w-4" />, on: () => zoomButton(1 / 1.5), off: shown.k <= 1 },
          { label: 'Zoom in', icon: <Plus className="h-4 w-4" />, on: () => zoomButton(1.5), off: shown.k >= ZOOM_MAX },
          { label: 'Fit to screen', icon: <Maximize className="h-4 w-4" />, on: () => setCam(null), off: shown.k === 1 },
        ].map((b) => (
          <button key={b.label} type="button" aria-label={b.label} title={b.label} onClick={b.on} disabled={b.off}
            className="grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-700 shadow-[0_1px_3px_rgba(0,0,0,0.2)] hover:text-[#2F4C69] disabled:opacity-40">
            {b.icon}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Mode, Skip the floor, brush size, undo, redo, reset, and why Bring back is off when it is. */
export function TouchPanel({
  state, onChange, reason, fullLong, disabled,
}: {
  state: TouchState;
  onChange: (fn: (s: TouchState) => TouchState) => void;
  reason: string | null;
  /** The cutout's long side, to show the brush in its pixels. */
  fullLong: number;
  disabled?: boolean;
}) {
  const restoreOff = !!reason;
  const mode = restoreOff ? 'erase' : state.mode;
  const h = state.history;
  const seg = (on: boolean) =>
    'flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-sm border px-2 text-[13px] font-semibold transition-colors disabled:opacity-40 ' +
    (on ? 'border-[#2F4C69] bg-[#2F4C69] text-white' : 'border-neutral-200 text-neutral-700 hover:border-neutral-400');
  const tool = 'flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-sm border border-neutral-200 px-2 text-[12.5px] font-semibold text-neutral-700 hover:border-neutral-400 disabled:opacity-40';
  // The slider runs on a log scale, so small brushes get as much travel as big ones.
  const lo = Math.log(BRUSH_MIN), hi = Math.log(BRUSH_MAX);
  const pos = Math.round(((Math.log(state.size) - lo) / (hi - lo)) * 100);
  return (
    <div className="space-y-3.5 text-[12.5px] text-neutral-600">
      <p>{mode === 'restore'
        ? 'Paint over the fringe or any part the cutout lost to bring it back.'
        : 'Paint over bits of floor to remove them.'}</p>
      <div role="radiogroup" aria-label="Brush" className="flex gap-2">
        <button type="button" role="radio" aria-checked={mode === 'restore'} disabled={restoreOff || disabled}
          onClick={() => onChange((s) => ({ ...s, mode: 'restore' }))} className={seg(mode === 'restore')}>
          <Brush className="h-4 w-4" /> Bring back
        </button>
        <button type="button" role="radio" aria-checked={mode === 'erase'} disabled={disabled}
          onClick={() => onChange((s) => ({ ...s, mode: 'erase' }))} className={seg(mode === 'erase')}>
          <Eraser className="h-4 w-4" /> Erase
        </button>
      </div>
      <div className="flex gap-2">
        <button type="button" className={tool} disabled={!h.done.length || disabled} onClick={() => onChange((s) => ({ ...s, history: undoStroke(s.history) }))}>
          <Undo2 className="h-4 w-4" /> Undo
        </button>
        <button type="button" className={tool} disabled={!h.undone.length || disabled} onClick={() => onChange((s) => ({ ...s, history: redoStroke(s.history) }))}>
          <Redo2 className="h-4 w-4" /> Redo
        </button>
        <button type="button" className={tool} disabled={!h.done.length || disabled} onClick={() => onChange((s) => ({ ...s, history: EMPTY_HISTORY }))}>
          <RotateCcw className="h-4 w-4" /> Reset
        </button>
      </div>
      {reason && <p className="rounded-sm bg-amber-50 px-3 py-2 text-[#7a5215]" role="note">{reason} Erase still works.</p>}
      <label className={'flex min-h-[44px] cursor-pointer items-start gap-2.5 ' + (mode !== 'restore' ? 'opacity-40' : '')}>
        <input type="checkbox" checked={state.smart} disabled={mode !== 'restore' || disabled}
          onChange={(e) => onChange((s) => ({ ...s, smart: e.target.checked }))}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[#2F4C69]" />
        <span>
          <span className="block font-semibold text-neutral-800">Skip the floor</span>
          <span className="block text-[12px] text-neutral-500">Brings back only what is not floor colour, so you can paint loosely. Turn off to bring back exactly what you paint.</span>
        </span>
      </label>
      <label className="block">
        <span className="flex">
          <span className="flex-1">Brush size</span>
          <span className="tabular-nums text-neutral-400">{Math.round(state.size * fullLong * 2)} px</span>
        </span>
        <input type="range" min={0} max={100} value={pos} disabled={disabled}
          aria-describedby={undefined}
          onChange={(e) => onChange((s) => ({ ...s, size: Math.exp(lo + (Number(e.target.value) / 100) * (hi - lo)) }))}
          className="mt-1.5 h-11 w-full cursor-pointer accent-[#2F4C69]" />
      </label>
      <p className="text-[11.5px] text-neutral-400">
        Scroll or pinch to zoom. Space and drag, or two fingers, to move. Keys: [ and ] brush size, Ctrl Z undo, Shift Ctrl Z redo.
      </p>
    </div>
  );
}

/**
 * Touch up on its own, in a modal: the Library preview's Keep / Undo bar
 * opens it on the cutout just made. Apply hands back the touched cutout at
 * the cutout's own size; nothing is saved until Keep.
 */
export default function TouchUpDialog({
  cut, original, direct, onApply, onClose,
}: {
  cut: File;
  original: File | null;
  /** The cutout is a direct cut of `original`, same framing. */
  direct: boolean;
  onApply: (file: File) => void;
  onClose: () => void;
}) {
  const [bmps, setBmps] = useState<{ cut: ImageBitmap; orig: ImageBitmap | null } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [comparing, setComparing] = useState(false);
  const slow = useSlow(busy);
  const tabActive = useTabActive();
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    const made: ImageBitmap[] = [];
    Promise.all([decode(cut), original ? decode(original).catch(() => null) : Promise.resolve(null)])
      .then(([c, o]) => {
        made.push(c); if (o) made.push(o);
        if (live) setBmps({ cut: c, orig: o }); else made.forEach((b) => b.close());
      })
      .catch(() => live && setError('This cutout could not be opened.'));
    return () => { live = false; made.forEach((b) => b.close()); };
  }, [cut, original]);

  const prepared = useMemo(() => (bmps ? prepareTouch(bmps.cut, bmps.orig, direct) : null), [bmps, direct]);
  const { state, setState, mode, reason, onStroke } = useTouchState(tabActive && !busy, prepared);
  useEffect(() => { dialog.current?.focus(); }, []);

  const apply = useCallback(async () => {
    if (!bmps || busy) return;
    if (!state.history.done.length) { onClose(); return; }
    setBusy(true);
    setError('');
    await new Promise((r) => setTimeout(r, 30)); // let "Applying touch up" paint first
    try {
      const out = renderTouchFull(bmps.cut, bmps.orig, !reason, state.history.done);
      const { blob } = await encode(out);
      const base = cut.name.replace(/\.[^.]+$/, '').replace(/-touch$/, '');
      onApply(new File([blob], `${base}-touch.png`, { type: 'image/png' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not apply the touch up.');
      setBusy(false);
    }
  }, [bmps, busy, state.history.done, reason, cut.name, onApply, onClose]);

  useEffect(() => {
    if (!tabActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); if (!busy) onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [busy, onClose, tabActive]);

  return (
    <div className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/60 sm:items-center sm:p-6"
      role="dialog" aria-modal="true" aria-label="Touch up">
      <div ref={dialog} tabIndex={-1}
        className="flex max-h-full w-full max-w-[1100px] flex-col overflow-hidden bg-white outline-none sm:h-[92vh] sm:rounded-md sm:shadow-xl">
        <div className="flex items-center gap-4 border-b border-neutral-100 px-5 py-3">
          <h2 className="font-serif text-[21px]">Touch up</h2>
          <div className="flex-1" />
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close"
            className="grid h-11 w-11 place-items-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {prepared ? (
            <TouchCanvas prepared={prepared} strokes={state.history.done} mode={mode} smart={state.smart}
              size={state.size} comparing={comparing} disabled={busy} onStroke={onStroke} />
          ) : (
            <div className="grid min-h-[280px] flex-1 place-items-center bg-neutral-100 text-[13px] text-neutral-500">
              {error || <span className="flex items-center gap-2"><Spinner /> Opening the photo</span>}
            </div>
          )}
          <div className="max-h-[40vh] shrink-0 overflow-y-auto border-t border-neutral-100 px-5 py-4 md:max-h-none md:w-[300px] md:border-l md:border-t-0">
            {prepared && (
              <TouchPanel state={{ ...state, mode }} onChange={setState} reason={reason} fullLong={prepared.fullLong} disabled={busy} />
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-neutral-100 px-5 py-3">
          <button type="button" disabled={!prepared || busy}
            onPointerDown={() => setComparing(true)} onPointerUp={() => setComparing(false)} onPointerLeave={() => setComparing(false)}
            onKeyDown={(e) => { if (e.key === ' ') { e.preventDefault(); setComparing(true); } }}
            onKeyUp={(e) => { if (e.key === ' ') setComparing(false); }}
            onContextMenu={(e) => e.preventDefault()} aria-pressed={comparing}
            className="min-h-[44px] select-none rounded-sm border border-neutral-200 px-3 text-[12.5px] font-semibold hover:border-neutral-400 disabled:opacity-40">
            Hold to compare
          </button>
          {error && prepared && <span role="alert" className="text-[12.5px] text-red-600">{error}</span>}
          <div className="flex-1" />
          <button type="button" onClick={onClose} disabled={busy} className="min-h-[44px] px-2 text-[13px] text-neutral-500 hover:text-neutral-900">
            Cancel
          </button>
          {busy && <span role="status" className="text-[12px] text-neutral-500">{slow ? 'Still working, large photo' : 'Applying touch up'}</span>}
          <button type="button" onClick={apply} disabled={!prepared || busy}
            className="flex min-h-[44px] items-center gap-1.5 rounded-sm bg-[#2F4C69] px-[18px] text-[13px] font-semibold text-white disabled:opacity-60">
            {busy && <Spinner />}
            {busy ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}
