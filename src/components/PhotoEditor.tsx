import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  DEFAULT_SETTINGS, MAX_ANGLE, NEUTRAL_TONE, applyTone, autoLevels, isDefaultSettings, plan, render,
  startQuad, warp, type EditSettings, type Pt, type Px, type Quad, type Rect, type Tone,
} from '../lib/photoEdit';
import { decode, encode, paint, pixelsOf } from '../lib/canvasImage';
import { useTabActive } from '../lib/tabContext';

/**
 * The photo editor: fix skew, straighten, crop and tone, in a modal.
 *
 * UI only. Every pixel operation is in lib/photoEdit.ts, and the preview
 * (about 1000px) runs the same code as the final render, so what she sees is
 * what gets saved. Apply hands back a new File; the caller keeps the original
 * so the tile's undo can restore it.
 */

type Tool = 'skew' | 'straighten' | 'crop' | 'tone';
const TOOLS: { id: Tool; label: string }[] = [
  { id: 'skew', label: 'Fix skew' },
  { id: 'straighten', label: 'Straighten' },
  { id: 'crop', label: 'Crop' },
  { id: 'tone', label: 'Tone' },
];
const CORNER_NAMES = ['Top left', 'Top right', 'Bottom right', 'Bottom left'];
const PREVIEW_SIDE = 1000;
const MIN_CROP = 0.05;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export default function PhotoEditor({
  file, onApply, onClose,
}: {
  file: File;
  onApply: (edited: File) => void;
  onClose: () => void;
}) {
  const [bmp, setBmp] = useState<ImageBitmap | null>(null);
  const [preview, setPreview] = useState<Px | null>(null);
  const [error, setError] = useState('');
  const [tool, setTool] = useState<Tool>('skew');
  const [settings, setSettings] = useState<EditSettings>(DEFAULT_SETTINGS);
  const [comparing, setComparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  // Decode once. The bitmap is kept for the full size render on Apply.
  useEffect(() => {
    let live = true;
    let made: ImageBitmap | null = null;
    decode(file)
      .then((b) => {
        made = b;
        if (!live) return b.close();
        setBmp(b);
        setPreview(pixelsOf(b, PREVIEW_SIDE));
      })
      .catch(() => live && setError('This photo could not be opened for editing.'));
    return () => { live = false; made?.close(); };
  }, [file]);

  useEffect(() => { dialog.current?.focus(); }, []);

  const start = useMemo(() => (preview ? startQuad(preview) : null), [preview]);
  const set = (patch: Partial<EditSettings>) => setSettings((s) => ({ ...s, ...patch }));
  const setTone = (patch: Partial<Tone>) => setSettings((s) => ({ ...s, tone: { ...s.tone, ...patch } }));

  // The view lags the sliders by a frame rather than making them stutter.
  const view = useDeferredValue(settings);
  const geometry = useMemo(() => {
    if (!preview) return null;
    if (tool === 'skew') return preview;
    try {
      return warp(preview, plan(preview.width, preview.height, view, PREVIEW_SIDE, tool === 'tone' ? 'all' : 'straighten'));
    } catch {
      return preview; // corners in a line: show the photo until they are moved apart
    }
  }, [preview, tool, view]);
  const shown = useMemo(
    () => (comparing ? preview : geometry && applyTone(geometry, view.tone)),
    [comparing, preview, geometry, view.tone]
  );

  const apply = useCallback(async () => {
    if (!bmp || busy) return;
    if (isDefaultSettings(settings)) { onClose(); return; }
    setBusy(true);
    setError('');
    // let the busy state paint before the main thread is taken for a second or two
    await new Promise((r) => setTimeout(r, 30));
    try {
      // Crop zooms in, so start from enough source pixels to fill 2000px.
      const zoom = settings.crop ? 1 / Math.max(settings.crop.w, settings.crop.h) : 1;
      const full = pixelsOf(bmp, Math.min(4000, 2000 * zoom));
      const out = render(full, settings, 2000);
      const { blob, type, ext } = await encode(out);
      const base = file.name.replace(/\.[^.]+$/, '').replace(/-edit$/, '');
      onApply(new File([blob], `${base}-edit.${ext}`, { type }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not apply the changes.');
      setBusy(false);
    }
  }, [bmp, busy, settings, file.name, onApply, onClose]);

  // Escape and Enter belong to the editor while it is open, not to the form
  // under it, and only while its tab is the visible one.
  const tabActive = useTabActive();
  useEffect(() => {
    if (!tabActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        if (!busy) onClose();
      } else if (e.key === 'Enter') {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'TEXTAREA')) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        apply();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [apply, busy, onClose, tabActive]);

  const changed = !isDefaultSettings(settings);

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/60 sm:items-center sm:p-6"
      role="dialog" aria-modal="true" aria-label="Edit photo" onClick={() => !busy && onClose()}>
      <div ref={dialog} tabIndex={-1} onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-[1100px] flex-col overflow-hidden bg-white outline-none sm:rounded-md sm:shadow-xl">
        <div className="flex items-center gap-4 border-b border-neutral-100 px-5 py-4">
          <h2 className="font-serif text-[21px]">Edit photo</h2>
          <span className="hidden truncate text-[12px] text-neutral-400 sm:block">{file.name}</span>
          <div className="flex-1" />
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close"
            className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <Stage px={shown} tool={comparing ? null : tool} settings={settings} start={start}
            onQuad={(quad) => set({ quad })} onCrop={(crop) => set({ crop })} />

          <div className="flex shrink-0 flex-col border-t border-neutral-100 md:w-[300px] md:border-l md:border-t-0">
            <div role="tablist" aria-label="Tools" className="flex border-b border-neutral-100">
              {TOOLS.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tool === t.id}
                  onClick={() => setTool(t.id)}
                  className={
                    'flex-1 border-b-[1.5px] px-1 py-3 text-[12.5px] transition-colors ' +
                    (tool === t.id
                      ? 'border-[#2F4C69] font-semibold text-neutral-900'
                      : 'border-transparent text-neutral-400 hover:text-neutral-700')
                  }>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="max-h-[38vh] overflow-y-auto px-5 py-4 md:max-h-none md:flex-1">
              {tool === 'skew' && (
                <div className="space-y-3 text-[12.5px] text-neutral-500">
                  <p>Drag the four corners onto the corners of the rug. Apply squares it up.</p>
                  {start && !settings.quad && (
                    <button type="button" onClick={() => set({ quad: start })}
                      className="font-semibold text-[#2F4C69] hover:underline">
                      Use these corners
                    </button>
                  )}
                  {settings.quad && (
                    <button type="button" onClick={() => set({ quad: null })}
                      className="font-semibold text-[#2F4C69] hover:underline">
                      Clear skew fix
                    </button>
                  )}
                </div>
              )}

              {tool === 'straighten' && (
                <Slider label="Angle" min={-MAX_ANGLE} max={MAX_ANGLE} step={0.1} value={settings.angle}
                  format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}°`} onChange={(angle) => set({ angle })} />
              )}

              {tool === 'crop' && (
                <div className="space-y-3 text-[12.5px] text-neutral-500">
                  <p>Drag the corners, or drag inside the box to move it.</p>
                  {settings.crop && (
                    <button type="button" onClick={() => set({ crop: null })}
                      className="font-semibold text-[#2F4C69] hover:underline">
                      Clear crop
                    </button>
                  )}
                </div>
              )}

              {tool === 'tone' && (
                <div className="space-y-4">
                  <div className="flex items-center">
                    <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400">Levels</span>
                    <button type="button" disabled={!geometry}
                      onClick={() => geometry && setTone(autoLevels(geometry))}
                      className="rounded-sm border border-neutral-200 px-2.5 py-1 text-[12px] font-semibold hover:border-neutral-400">
                      Auto
                    </button>
                  </div>
                  <Slider label="Black point" min={0} max={254} value={settings.tone.black}
                    onChange={(black) => setTone({ black: Math.min(black, settings.tone.white - 1) })} />
                  <Slider label="Midtones" min={-100} max={100} value={Math.round(Math.log2(settings.tone.gamma) * 50)}
                    onChange={(v) => setTone({ gamma: Math.pow(2, v / 50) })} />
                  <Slider label="White point" min={1} max={255} value={settings.tone.white}
                    onChange={(white) => setTone({ white: Math.max(white, settings.tone.black + 1) })} />
                  <div className="border-t border-neutral-100" />
                  <Slider label="Brightness" min={-100} max={100} value={settings.tone.brightness} onChange={(brightness) => setTone({ brightness })} />
                  <Slider label="Contrast" min={-100} max={100} value={settings.tone.contrast} onChange={(contrast) => setTone({ contrast })} />
                  <Slider label="Saturation" min={-100} max={100} value={settings.tone.saturation} onChange={(saturation) => setTone({ saturation })} />
                  <Slider label="Warmth" min={-100} max={100} value={settings.tone.warmth} onChange={(warmth) => setTone({ warmth })} />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-neutral-100 px-5 py-3.5">
          <button type="button" onClick={() => setSettings({ ...DEFAULT_SETTINGS, tone: NEUTRAL_TONE })}
            disabled={!changed || busy} className="text-[13px] text-neutral-500 hover:text-neutral-900 disabled:opacity-40">
            Reset
          </button>
          <button type="button" disabled={!changed || busy}
            onPointerDown={() => setComparing(true)}
            onPointerUp={() => setComparing(false)}
            onPointerLeave={() => setComparing(false)}
            onKeyDown={(e) => { if (e.key === ' ') { e.preventDefault(); setComparing(true); } }}
            onKeyUp={(e) => { if (e.key === ' ') setComparing(false); }}
            onContextMenu={(e) => e.preventDefault()}
            aria-pressed={comparing}
            className="select-none rounded-sm border border-neutral-200 px-3 py-1.5 text-[12.5px] font-semibold hover:border-neutral-400 disabled:opacity-40">
            Hold to compare
          </button>
          {error && <span role="alert" className="text-[12.5px] text-red-600">{error}</span>}
          <div className="flex-1" />
          <button type="button" onClick={onClose} disabled={busy} className="text-[13px] text-neutral-500 hover:text-neutral-900">
            Cancel
          </button>
          <button type="button" onClick={apply} disabled={!bmp || busy}
            className="rounded-sm bg-[#2F4C69] px-[18px] py-2.5 text-[13px] font-semibold text-white disabled:opacity-60">
            {busy ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Slider({
  label, min, max, step = 1, value, onChange, format,
}: {
  label: string; min: number; max: number; step?: number; value: number;
  onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <label className="block">
      <span className="flex text-[12.5px]">
        <span className="flex-1 text-neutral-600">{label}</span>
        <span className="tabular-nums text-neutral-400">{format ? format(value) : value}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(min < 0 ? 0 : value)}
        className="mt-1.5 h-6 w-full cursor-pointer accent-[#2F4C69]" />
    </label>
  );
}

/**
 * The canvas, sized to fit the space it has, with the overlay for the tool in
 * use drawn on top in fractions of the image (so it matches at any size).
 */
function Stage({
  px, tool, settings, start, onQuad, onCrop,
}: {
  px: Px | null;
  tool: Tool | null;
  settings: EditSettings;
  start: Quad | null;
  onQuad: (q: Quad) => void;
  onCrop: (r: Rect) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [room, setRoom] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setRoom({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { if (px && cv.current) paint(cv.current, px); }, [px]);

  const size = useMemo(() => {
    if (!px || !room.w || !room.h) return null;
    const k = Math.min(room.w / px.width, room.h / px.height);
    return { w: Math.floor(px.width * k), h: Math.floor(px.height * k) };
  }, [px, room]);

  return (
    <div ref={box} className="relative grid min-h-[280px] flex-1 place-items-center bg-neutral-100 p-4 sm:min-h-[420px]">
      {!px && <p className="text-[13px] text-neutral-400">Opening the photo…</p>}
      <div className="absolute inset-4 grid place-items-center">
        <div className="relative bg-[conic-gradient(#e8e8e8_0_25%,#fff_0_50%,#e8e8e8_0_75%,#fff_0)] bg-[length:16px_16px]"
          style={size ? { width: size.w, height: size.h } : { display: 'none' }}>
          <canvas ref={cv} className="block h-full w-full" />
          {tool === 'skew' && start && (
            <QuadOverlay quad={settings.quad || start} onChange={onQuad} />
          )}
          {(tool === 'straighten' || tool === 'crop') && <Grid fine={tool === 'straighten'} />}
          {tool === 'crop' && (
            <CropOverlay rect={settings.crop || { x: 0, y: 0, w: 1, h: 1 }} onChange={onCrop} />
          )}
        </div>
      </div>
    </div>
  );
}

function Grid({ fine }: { fine: boolean }) {
  const lines = fine ? [1, 2, 3, 4, 5, 6, 7].map((i) => i / 8) : [1 / 3, 2 / 3];
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
      {lines.map((v) => (
        <g key={v} stroke="rgba(255,255,255,0.75)" strokeWidth="1" vectorEffect="non-scaling-stroke">
          <line x1={v} y1={0} x2={v} y2={1} vectorEffect="non-scaling-stroke" />
          <line x1={0} y1={v} x2={1} y2={v} vectorEffect="non-scaling-stroke" />
        </g>
      ))}
    </svg>
  );
}

/** Position of a pointer as a fraction of the element it is over. */
function fracOf(el: HTMLElement, e: { clientX: number; clientY: number }): Pt {
  const r = el.getBoundingClientRect();
  return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) };
}

/** Arrow keys move a handle: a small step, or a big one with Shift. */
function nudge(e: React.KeyboardEvent): Pt | null {
  const step = e.shiftKey ? 0.02 : 0.004;
  const d: Record<string, Pt> = {
    ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 },
    ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step },
  };
  return d[e.key] || null;
}

function Handle({
  at, label, onMove, onNudge,
}: {
  at: Pt; label: string; onMove: (p: Pt) => void; onNudge: (d: Pt) => void;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <button ref={btn} type="button" aria-label={label}
      title={`${label}. Drag, or use the arrow keys.`}
      style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }}
      className="group absolute z-10 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 touch-none place-items-center rounded-full outline-none"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.current?.setPointerCapture(e.pointerId);
        btn.current?.focus();
      }}
      onPointerMove={(e) => {
        if (!btn.current?.hasPointerCapture(e.pointerId)) return;
        const surface = btn.current.parentElement;
        if (surface) onMove(fracOf(surface, e));
      }}
      onKeyDown={(e) => {
        const d = nudge(e);
        if (!d) return;
        e.preventDefault();
        onNudge(d);
      }}>
      <span className="block h-4 w-4 rounded-full border-2 border-white bg-[#2F4C69] shadow-[0_0_0_1px_rgba(0,0,0,0.35)] group-focus-visible:ring-2 group-focus-visible:ring-[#2F4C69] group-focus-visible:ring-offset-2" />
    </button>
  );
}

function QuadOverlay({ quad, onChange }: { quad: Quad; onChange: (q: Quad) => void }) {
  const move = (i: number, p: Pt) => onChange(quad.map((c, j) => (j === i ? p : c)) as Quad);
  return (
    <div className="absolute inset-0">
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
        <path fillRule="evenodd" fill="rgba(0,0,0,0.35)"
          d={`M0 0H1V1H0Z M${quad.map((p) => `${p.x} ${p.y}`).join(' L')}Z`} />
        <polygon points={quad.map((p) => `${p.x},${p.y}`).join(' ')} fill="none"
          stroke="#fff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      {quad.map((p, i) => (
        <Handle key={i} at={p} label={`${CORNER_NAMES[i]} corner`}
          onMove={(q) => move(i, q)}
          onNudge={(d) => move(i, { x: clamp01(p.x + d.x), y: clamp01(p.y + d.y) })} />
      ))}
    </div>
  );
}

function CropOverlay({ rect, onChange }: { rect: Rect; onChange: (r: Rect) => void }) {
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ from: Pt; rect: Rect } | null>(null);

  // Corners are moved by setting that corner and keeping the opposite one fixed.
  const corners: Pt[] = [
    { x: rect.x, y: rect.y }, { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h }, { x: rect.x, y: rect.y + rect.h },
  ];
  const setCorner = (i: number, p: Pt) => {
    const opp = corners[(i + 2) % 4];
    const left = i === 0 || i === 3, top = i === 0 || i === 1;
    const x = left ? Math.min(p.x, opp.x - MIN_CROP) : Math.max(p.x, opp.x + MIN_CROP);
    const y = top ? Math.min(p.y, opp.y - MIN_CROP) : Math.max(p.y, opp.y + MIN_CROP);
    const nx = clamp01(x), ny = clamp01(y);
    onChange({
      x: Math.min(nx, opp.x), y: Math.min(ny, opp.y),
      w: Math.abs(opp.x - nx), h: Math.abs(opp.y - ny),
    });
  };

  return (
    <div ref={surface} className="absolute inset-0">
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
        <path fillRule="evenodd" fill="rgba(0,0,0,0.45)"
          d={`M0 0H1V1H0Z M${rect.x} ${rect.y}H${rect.x + rect.w}V${rect.y + rect.h}H${rect.x}Z`} />
        <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="none"
          stroke="#fff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div aria-hidden className="absolute cursor-move touch-none"
        style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}
        onPointerDown={(e) => {
          if (!surface.current) return;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { from: fracOf(surface.current, e), rect };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !surface.current) return;
          const p = fracOf(surface.current, e);
          onChange({
            ...d.rect,
            x: Math.min(1 - d.rect.w, Math.max(0, d.rect.x + p.x - d.from.x)),
            y: Math.min(1 - d.rect.h, Math.max(0, d.rect.y + p.y - d.from.y)),
          });
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }} />
      {corners.map((p, i) => (
        <Handle key={i} at={p} label={`Crop ${CORNER_NAMES[i].toLowerCase()} corner`}
          onMove={(q) => setCorner(i, q)}
          onNudge={(d) => setCorner(i, { x: p.x + d.x, y: p.y + d.y })} />
      ))}
    </div>
  );
}
