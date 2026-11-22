import { useId, useState } from 'react';
import { ArrowLeftRight, Lock, Unlock } from 'lucide-react';
import {
  MAX_STRETCH, MIN_STRETCH, NO_STRETCH, isNoStretch, type EditSettings, type Plan,
} from '../lib/photoEdit';
import {
  PRESETS, activePreset, estimateNote, nearestSize, orientSize, ratioText, reconcileSize, trim,
  type SizeFields, type SizeUnit,
} from '../lib/rugSize';

/**
 * The editor's Size step: width and length set separately, a rug size, and
 * Auto. Everything here only changes `stretch` and `shape` in the edit
 * settings, so Reset, hold to compare and the tile's Undo work as for any
 * other tool, and the stretch is part of the one output-to-source matrix.
 */

const clampStretch = (v: number) => Math.min(MAX_STRETCH, Math.max(MIN_STRETCH, v));

export function SizePanel({
  settings, info, hasSkew, cameraFrame, outSize, fields, onFields, onChange,
}: {
  settings: EditSettings;
  info: Plan['info'];
  hasSkew: boolean;
  cameraFrame: boolean;
  outSize: { w: number; h: number } | null;
  /** The Rug size fields, kept by the editor so they survive switching tools. */
  fields: SizeFields;
  onFields: (f: SizeFields) => void;
  onChange: (patch: Partial<EditSettings>) => void;
}) {
  const [lock, setLock] = useState(false);
  const ids = useId();

  // The fields only ever show a size the photo actually has: once Width or
  // Length is moved (or Auto, or Reset) they are cleared and the preset is
  // no longer marked. Picking a size again re-applies it.
  const { a, b, unit } = reconcileSize(fields, settings.shape);

  const shape = (info.base * info.sx) / info.sy;
  const landscape = info.base >= 1;
  const preset = activePreset({ a, b, unit }, settings.shape, landscape);

  const setSize = (w: string, l: string, u: SizeUnit = unit) => {
    onFields({ a: w, b: l, unit: u });
    const nw = Number(w), nl = Number(l);
    if (nw > 0 && nl > 0 && Number.isFinite(nw) && Number.isFinite(nl)) {
      onChange({ shape: nw / nl, stretch: NO_STRETCH });
    }
  };

  const pick = (p: (typeof PRESETS)[number]) => {
    const k = unit === 'cm' ? 30.48 : 1;
    const [w, l] = orientSize(p, landscape);
    setSize(trim(w * k), trim(l * k));
  };

  const changeUnit = (u: SizeUnit) => {
    if (u === unit) return;
    const k = u === 'cm' ? 30.48 : 1 / 30.48;
    onFields({ unit: u, a: Number(a) > 0 ? trim(Number(a) * k) : a, b: Number(b) > 0 ? trim(Number(b) * k) : b });
  };

  // Moving width or length takes over from a rug size, starting from the
  // stretch that size gave.
  const stretchTo = (axis: 'x' | 'y', v: number) => {
    const cur = { x: info.sx, y: info.sy };
    const next = { ...cur, [axis]: clampStretch(v) };
    if (lock) {
      const other = axis === 'x' ? 'y' : 'x';
      next[other] = clampStretch(cur[other] * (next[axis] / cur[axis]));
    }
    onChange({ stretch: next, shape: null });
  };

  const isAuto = isNoStretch(settings);

  return (
    <div className="space-y-5 text-[12.5px]">
      <div className="flex items-start gap-3">
        <p className="flex-1 text-neutral-500" aria-live="polite">
          Shape now <b className="font-semibold tabular-nums text-neutral-900">{ratioText(shape)}</b>
          <span className="block text-[11.5px]">
            width : length{nearestSize(shape) ? `, about ${nearestSize(shape)}` : ''}
            {outSize ? `. Result ${outSize.w} x ${outSize.h} px` : ''}
          </span>
        </p>
        <button type="button" onClick={() => onChange({ stretch: NO_STRETCH, shape: null })} disabled={isAuto}
          title={hasSkew ? 'Back to the proportions worked out from the corners' : 'Back to the photo as it is'}
          className="shrink-0 rounded-sm border border-neutral-200 px-2.5 py-1 text-[12px] font-semibold hover:border-neutral-400 disabled:opacity-40">
          Auto
        </button>
      </div>
      {hasSkew && info.estimate && (
        <p className="-mt-3 text-[11.5px] text-neutral-400">
          Auto is {ratioText(info.estimate.ratio)}. {estimateNote(info.estimate, cameraFrame)}
        </p>
      )}

      <Stretch label="Width" hint="left to right" value={info.sx} onChange={(v) => stretchTo('x', v)} />
      <Stretch label="Length" hint="top to bottom" value={info.sy} onChange={(v) => stretchTo('y', v)} />
      <button type="button" onClick={() => setLock((l) => !l)} aria-pressed={lock}
        className={'flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-[12px] font-semibold ' +
          (lock ? 'border-[#2F4C69] bg-[#2F4C69]/5 text-[#2F4C69]' : 'border-neutral-200 text-neutral-600 hover:border-neutral-400')}>
        {lock ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
        {lock ? 'Proportions locked' : 'Lock proportions'}
      </button>

      <fieldset className="space-y-2.5 border-t border-neutral-100 pt-4">
        <legend className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400">Rug size</legend>
        <p className="text-[11.5px] text-neutral-400">Enter the real size and the photo takes exactly that shape.</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="w-[72px]">
            <span className="block text-[11.5px] text-neutral-500">Width</span>
            <input id={`${ids}-w`} type="number" inputMode="decimal" min={0} step="any" value={a}
              onChange={(e) => setSize(e.target.value, b)}
              className="mt-0.5 w-full rounded-sm border border-neutral-200 px-2 py-1.5 text-[13px] tabular-nums outline-none focus:border-[#2F4C69]" />
          </label>
          <span className="pb-2 text-neutral-400" aria-hidden>x</span>
          <label className="w-[72px]">
            <span className="block text-[11.5px] text-neutral-500">Length</span>
            <input type="number" inputMode="decimal" min={0} step="any" value={b}
              onChange={(e) => setSize(a, e.target.value)}
              className="mt-0.5 w-full rounded-sm border border-neutral-200 px-2 py-1.5 text-[13px] tabular-nums outline-none focus:border-[#2F4C69]" />
          </label>
          <label>
            <span className="sr-only">Unit</span>
            <select value={unit} onChange={(e) => changeUnit(e.target.value as SizeUnit)}
              className="rounded-sm border border-neutral-200 bg-white px-1.5 py-1.5 text-[13px] outline-none focus:border-[#2F4C69]">
              <option value="ft">ft</option>
              <option value="cm">cm</option>
            </select>
          </label>
          <button type="button" onClick={() => setSize(b, a)} disabled={!a && !b}
            aria-label="Swap width and length" title="Swap width and length"
            className="grid h-[34px] w-[34px] place-items-center rounded-sm border border-neutral-200 text-neutral-600 hover:border-neutral-400 disabled:opacity-40">
            <ArrowLeftRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Common sizes">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => pick(p)} aria-pressed={preset === p.label}
              className={'rounded-full border px-2.5 py-1 text-[12px] hover:border-[#2F4C69] hover:text-[#2F4C69] ' +
                (preset === p.label ? 'border-[#2F4C69] bg-[#2F4C69] font-semibold text-white hover:text-white' : 'border-neutral-200')}>
              {p.label}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

/** A stretch factor as a slider (even steps either way) and a percentage box. */
function Stretch({ label, hint, value, onChange }: {
  label: string; hint: string; value: number; onChange: (v: number) => void;
}) {
  const id = useId();
  const pct = Math.round(value * 100);
  const [text, setText] = useState(String(pct));
  const [seen, setSeen] = useState(pct);
  if (seen !== pct) { setSeen(pct); setText(String(pct)); }
  return (
    <div>
      <div className="flex items-center gap-2">
        <label htmlFor={`${id}-r`} className="flex-1 text-neutral-600">
          {label} <span className="text-[11.5px] text-neutral-400">{hint}</span>
        </label>
        <input type="number" aria-label={`${label}, percent`} min={MIN_STRETCH * 100} max={MAX_STRETCH * 100} step={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const v = Number(e.target.value);
            if (v >= MIN_STRETCH * 100 && v <= MAX_STRETCH * 100) onChange(v / 100);
          }}
          onBlur={() => setText(String(pct))}
          className="w-[60px] rounded-sm border border-neutral-200 px-1.5 py-1 text-right text-[12.5px] tabular-nums outline-none focus:border-[#2F4C69]" />
        <span className="text-neutral-400" aria-hidden>%</span>
      </div>
      <input id={`${id}-r`} type="range" min={-200} max={200} step={1}
        value={Math.round(Math.log2(value) * 100)}
        aria-valuetext={`${pct} percent`}
        onChange={(e) => onChange(Math.pow(2, Number(e.target.value) / 100))}
        onDoubleClick={() => onChange(1)}
        className="mt-1.5 h-6 w-full cursor-pointer accent-[#2F4C69]" />
    </div>
  );
}
