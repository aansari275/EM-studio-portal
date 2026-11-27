import { useEffect, useMemo, useRef, useState } from 'react';
import { Sofa, X, Check, Columns2, Eye, Trash2, Star } from 'lucide-react';
import type { ShowroomProduct } from '../lib/firebase';
import type { RoomImage } from '../lib/roomImages';
import { orderedImages, thumb, fixStorageUrl, heroImage } from '../lib/img';
import {
  ROOM_STYLES, COMMON_SIZES, DEFAULT_SIZE, sizeVerdict, sizeLabel, validSize, photoLooksLikeSwatch, roomStyle, type RugFt,
} from '../lib/roomStyles';
import {
  createRoomSetting, keepRoomImage, lastRoomType, rememberRoomType, roomUsage, removeRoomImageFrom, restoreRoomImages,
  makeFirstRoom, type Candidate, type Usage,
} from '../lib/roomSettingIO';
import { ROUND_BUTTON } from '../lib/useCutout';
import { useTabActive } from '../lib/tabContext';
import { Spinner, Working } from './Working';

/**
 * Room setting in the Library preview: pick the photo, the room and the size,
 * then Create. Nothing is generated until that click (or Try again), one model
 * call per click. The result is shown large with a compare against the rug
 * photo; only Keep writes it onto the product (`roomImages`).
 */


// The highlight on the new button shows a few times per page load, then stops.
let highlightShown = false;

/** The labelled button under the big photo, with a New marker. */
export function RoomSettingButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const [glow] = useState(() => { const g = !highlightShown; highlightShown = true; return g; });
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={'mt-3 flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-sm border-2 px-4 text-[14px] font-semibold transition-colors disabled:opacity-50 ' +
        'border-[#2F4C69] bg-[#2F4C69] text-white hover:bg-[#243b52] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F4C69] ' +
        (glow ? 'motion-safe:animate-[pulse_1.4s_ease-in-out_3]' : '')}>
      <Sofa className="h-5 w-5" strokeWidth={2} aria-hidden />
      <span>Room setting</span>
      <span className="hidden text-[12.5px] font-normal text-white/80 sm:inline">Show this rug in a room</span>
      <span className="ml-1 rounded-full bg-[#F2C14E] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-[#3a2a00]">New</span>
    </button>
  );
}

/** The small round entry point in the stack on the big photo. */
export function RoomSettingRound({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} disabled={disabled}
      aria-label="Room setting" title="Room setting: show this rug in a room" className={ROUND_BUTTON}>
      <Sofa className="h-4 w-4" strokeWidth={2} />
    </button>
  );
}

type Phase =
  | { kind: 'options' }
  | { kind: 'working' }
  | { kind: 'result'; c: Candidate }
  | { kind: 'saving'; c: Candidate };

const sameSize = (a: RugFt, b: RugFt) => a.w === b.w && a.l === b.l;

export function RoomSettingDialog({ product, startPhoto, onClose, onKept }: {
  product: ShowroomProduct;
  /** The photo shown in the preview when it was opened. */
  startPhoto?: string;
  onClose: () => void;
  onKept: (p: ShowroomProduct) => void;
}) {
  const photos = useMemo(() => orderedImages(product), [product]);
  const verdict = useMemo(() => sizeVerdict(product.size), [product.size]);
  const isSample = verdict.kind === 'sample';

  // Pixel sizes of the thumbnails as they load, for the square photo hint.
  const [px, setPx] = useState<Record<string, { w: number; h: number }>>({});
  const flagged = (u: string) => photoLooksLikeSwatch(u, px[u]);

  // 1 photo: the one in view (or main), only if nothing says swatch.
  const first = startPhoto && photos.includes(startPhoto) ? startPhoto : heroImage(product) || photos[0] || '';
  const [photo, setPhoto] = useState<string>(() => (!isSample && first && !photoLooksLikeSwatch(first) ? first : ''));
  const photoTouched = useRef(false);

  // 2 room, remembered per person
  const [room, setRoom] = useState('');
  useEffect(() => {
    let live = true;
    lastRoomType().then((r) => { if (live && r && roomStyle(r)) setRoom((cur) => cur || r); });
    return () => { live = false; };
  }, []);

  // 3 size
  const initial: RugFt | null = verdict.kind === 'full' ? verdict.size : verdict.kind === 'unknown' ? DEFAULT_SIZE : null;
  const [size, setSize] = useState<RugFt | null>(initial);
  const [custom, setCustom] = useState(() => !!initial && !COMMON_SIZES.some((s) => sameSize(s, initial)));
  const [cw, setCw] = useState(initial ? String(initial.w) : '');
  const [cl, setCl] = useState(initial ? String(initial.l) : '');
  const [full, setFull] = useState(verdict.kind === 'full');

  const chosenSize: RugFt | null = custom
    ? (Number(cw) > 0 && Number(cl) > 0 ? { w: Math.min(Number(cw), Number(cl)), l: Math.max(Number(cw), Number(cl)) } : null)
    : size;

  const [usage, setUsage] = useState<Usage | null>(null);
  useEffect(() => { let live = true; roomUsage().then((u) => live && setUsage(u)); return () => { live = false; }; }, []);

  const [phase, setPhase] = useState<Phase>({ kind: 'options' });
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const why = !photo ? 'Pick the photo that shows the whole rug.'
    : !room ? 'Pick a room.'
      : !chosenSize ? 'Give the real rug size.'
        : !validSize(chosenSize) ? 'Rug size must be 1.5 to 30 ft a side.'
          : !full ? 'Tick that the photo shows the full rug.'
            : usage && usage.remaining <= 0 ? `Today's limit of ${usage.limit} is used up. It resets at midnight India time.`
              : '';

  async function create() {
    if (why || !chosenSize) return;
    setError('');
    setPhase({ kind: 'working' });
    rememberRoomType(room);
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      const c = await createRoomSetting(product, photo, room, chosenSize, ctl.signal);
      if (ctl.signal.aborted) return;
      if (c.remaining !== undefined && usage) setUsage({ ...usage, remaining: c.remaining, used: usage.limit - c.remaining });
      setPhase({ kind: 'result', c });
    } catch (e) {
      if (ctl.signal.aborted) return;
      setError(e instanceof Error ? e.message : 'Could not create the room.');
      setPhase({ kind: 'options' });
      roomUsage().then((u) => u && setUsage(u));
    }
  }

  async function keep(c: Candidate) {
    if (!chosenSize) return;
    setPhase({ kind: 'saving', c });
    setError('');
    try {
      const p = await keepRoomImage(product, { url: c.url, path: c.path, roomType: room, size: sizeLabel(chosenSize), sourceUrl: photo });
      onKept(p);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not keep it.');
      setPhase({ kind: 'result', c });
    }
  }

  const working = phase.kind === 'working' || phase.kind === 'saving';
  const tabActive = useTabActive();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!tabActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      if (phase.kind !== 'saving') onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [tabActive, onClose, phase.kind]);
  useEffect(() => { panel.current?.focus(); }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-0 sm:p-6"
      onClick={() => phase.kind !== 'saving' && onClose()}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="room-title"
        className="relative w-full max-w-3xl bg-white shadow-xl outline-none sm:rounded-md"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 border-b border-neutral-100 px-5 py-4">
          <Sofa className="mt-1 h-5 w-5 shrink-0 text-[#2F4C69]" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 id="room-title" className="font-serif text-[21px] leading-tight">Room setting</h2>
            <p className="truncate font-mono text-[11px] text-neutral-400">{product.styleNumber}</p>
          </div>
          {usage && <span className="mt-1 text-[11.5px] text-neutral-400" title="Room settings left today for the studio">{usage.remaining} of {usage.limit} left today</span>}
          <button type="button" onClick={onClose} disabled={phase.kind === 'saving'} aria-label="Close"
            className="grid h-11 w-11 place-items-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900">
            <X className="h-5 w-5" />
          </button>
        </div>

        {(phase.kind === 'options') && (
          <div className="space-y-6 px-5 py-5">
            {isSample && (
              <div role="note" className="border-l-2 border-[#98671A] bg-[#98671A]/10 px-3 py-2.5 text-[13px] text-[#6b4a12]">
                <strong>This looks like a sample swatch.</strong> Room settings are for full rugs. The record says {product.size}.
                Only go on if a photo shows the full rug: tick below and give its real size.
              </div>
            )}

            <section aria-labelledby="rs-photo">
              <h3 id="rs-photo" className="text-[12px] font-semibold uppercase tracking-[0.12em] text-neutral-500">1. Photo of the whole rug</h3>
              {photos.length === 0 ? <p className="mt-2 text-sm text-neutral-500">This design has no photo yet.</p> : (
                <div role="radiogroup" aria-labelledby="rs-photo" className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {photos.map((u, i) => {
                    const on = u === photo;
                    const swatchy = flagged(u);
                    return (
                      <button key={u} type="button" role="radio" aria-checked={on}
                        aria-label={`Photo ${i + 1}${swatchy ? ', may be a sample piece' : ''}`}
                        onClick={() => { photoTouched.current = true; setPhoto(u); if (swatchy) setFull(false); }}
                        className={'relative aspect-square overflow-hidden rounded-sm bg-white ' +
                          (on ? 'shadow-[0_0_0_3px_#2F4C69]' : 'shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)] hover:shadow-[0_0_0_1px_#737373]')}>
                        <img src={thumb(u, 240)} alt="" loading="lazy" className="h-full w-full object-contain"
                          onLoad={(e) => {
                            const t = e.currentTarget;
                            const dims = { w: t.naturalWidth, h: t.naturalHeight };
                            setPx((m) => (m[u] ? m : { ...m, [u]: dims }));
                            // the preselected photo turned out square once loaded: let her choose
                            if (u === photo && !photoTouched.current && photoLooksLikeSwatch(u, dims)) { setPhoto(''); setFull(false); }
                          }} />
                        {on && <span className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-[#2F4C69] text-white"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>}
                        {swatchy && <span className="absolute inset-x-0 bottom-0 bg-[#98671A]/90 px-1 py-0.5 text-center text-[10px] font-semibold text-white">Sample piece?</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="mt-1.5 text-[12px] text-neutral-500">Choose a photo of the full rug, flat and straight on. Square photos are often a sample piece.</p>
            </section>

            <section aria-labelledby="rs-room">
              <h3 id="rs-room" className="text-[12px] font-semibold uppercase tracking-[0.12em] text-neutral-500">2. Room</h3>
              <div role="radiogroup" aria-labelledby="rs-room" className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {ROOM_STYLES.map((s) => {
                  const on = s.id === room;
                  return (
                    <button key={s.id} type="button" role="radio" aria-checked={on} onClick={() => setRoom(s.id)}
                      className={'group overflow-hidden rounded-sm text-left transition-shadow ' +
                        (on ? 'shadow-[0_0_0_3px_#2F4C69]' : 'shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)] hover:shadow-[0_0_0_1px_#737373]')}>
                      <span className="relative block aspect-[4/3] bg-neutral-100">
                        <img src={`/room-types/${s.id}.jpg`} alt="" loading="lazy" className="h-full w-full object-cover" />
                        {on && <span className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-[#2F4C69] text-white"><Check className="h-4 w-4" strokeWidth={3} /></span>}
                      </span>
                      <span className={'block px-2.5 py-2 ' + (on ? 'bg-[#2F4C69]/[0.06]' : '')}>
                        <span className="block text-[13px] font-semibold leading-snug text-neutral-900">{s.name}</span>
                        <span className="mt-0.5 block text-[11.5px] leading-snug text-neutral-500">{s.line}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[12px] text-neutral-500">Example pictures only. Each room is made new for this rug.</p>
            </section>

            <section aria-labelledby="rs-size">
              <h3 id="rs-size" className="text-[12px] font-semibold uppercase tracking-[0.12em] text-neutral-500">3. Real rug size</h3>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <label className="text-[12.5px] text-neutral-600">
                  <span className="block">Size</span>
                  <select aria-label="Rug size" value={custom ? 'custom' : size ? `${size.w}x${size.l}` : ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === 'custom') { setCustom(true); return; }
                      setCustom(false);
                      const [w, l] = v.split('x').map(Number);
                      setSize(w && l ? { w, l } : null);
                    }}
                    className="mt-1 min-h-[44px] rounded-sm border border-neutral-300 bg-white px-3 text-[14px] text-neutral-900">
                    <option value="">Choose a size</option>
                    {COMMON_SIZES.map((s) => <option key={`${s.w}x${s.l}`} value={`${s.w}x${s.l}`}>{sizeLabel(s)}{s.l / s.w > 2.6 ? ' runner' : ''}</option>)}
                    <option value="custom">Other size</option>
                  </select>
                </label>
                {custom && (
                  <>
                    <label className="text-[12.5px] text-neutral-600"><span className="block">Width, ft</span>
                      <input inputMode="decimal" value={cw} onChange={(e) => setCw(e.target.value.replace(/[^0-9.]/g, ''))}
                        className="mt-1 min-h-[44px] w-24 rounded-sm border border-neutral-300 px-3 text-[14px]" /></label>
                    <label className="text-[12.5px] text-neutral-600"><span className="block">Length, ft</span>
                      <input inputMode="decimal" value={cl} onChange={(e) => setCl(e.target.value.replace(/[^0-9.]/g, ''))}
                        className="mt-1 min-h-[44px] w-24 rounded-sm border border-neutral-300 px-3 text-[14px]" /></label>
                  </>
                )}
              </div>
              {verdict.kind === 'unknown' && <p className="mt-1.5 text-[12px] text-neutral-500">The record has no usable size{product.size ? ` (${product.size})` : ''}, so 8 x 10 ft is offered. Change it if the rug is another size.</p>}
              <label className="mt-3 flex min-h-[44px] cursor-pointer items-start gap-3 rounded-sm border border-neutral-200 p-3 text-[13px] hover:border-neutral-400">
                <input type="checkbox" checked={full} onChange={(e) => { photoTouched.current = true; setFull(e.target.checked); }}
                  className="mt-0.5 h-4 w-4 accent-[#2F4C69]" />
                <span>This photo shows the full rug, not a small sample piece
                  <span className="block text-[12px] text-neutral-500">The room shows the rug at the size above. A sample would be blown up and look wrong.</span>
                </span>
              </label>
            </section>

            <p className="text-[12.5px] text-neutral-500">Stripes and simple layouts come out exact. Complex patterns may come out slightly different, so check the result against the photo before you keep it.</p>

            {error && <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-3 py-2 text-[13px] text-red-800">{error}</p>}

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-neutral-100 pt-4">
              {why && <span className="mr-auto text-[12.5px] text-neutral-500">{why}</span>}
              <button type="button" onClick={onClose} className="min-h-[44px] px-3 text-[13px] text-neutral-500 hover:text-neutral-900">Cancel</button>
              <button type="button" onClick={() => void create()} disabled={!!why}
                className="flex min-h-[44px] items-center gap-2 rounded-sm bg-[#2F4C69] px-5 text-[13.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                <Sofa className="h-4 w-4" aria-hidden /> Create room setting
              </button>
            </div>
          </div>
        )}

        {phase.kind === 'working' && (
          <div className="px-5 py-10">
            <div className="mx-auto grid aspect-video max-w-xl place-items-center rounded-sm bg-neutral-50 text-neutral-800 [&_span]:text-[13.5px]">
              <Working job={{ label: 'Creating the room, about 30 seconds' }} />
            </div>
            <p className="sr-only" role="status" aria-live="polite">Creating the room, about 30 seconds</p>
            <p className="mt-3 text-center text-[12px] text-neutral-500">You can close this. The room will not be added to the design.</p>
          </div>
        )}

        {(phase.kind === 'result' || phase.kind === 'saving') && (
          <Result c={phase.c} rug={photo} saving={phase.kind === 'saving'} error={error}
            onKeep={() => void keep(phase.c)}
            onAgain={() => void create()}
            onDiscard={() => { setError(''); setPhase({ kind: 'options' }); }}
            againDisabled={!!why} />
        )}
        {working && <span className="sr-only" aria-live="polite">{phase.kind === 'saving' ? 'Keeping the room setting' : ''}</span>}
      </div>
    </div>
  );
}

function Result({ c, rug, saving, error, onKeep, onAgain, onDiscard, againDisabled }: {
  c: Candidate; rug: string; saving: boolean; error: string;
  onKeep: () => void; onAgain: () => void; onDiscard: () => void; againDisabled: boolean;
}) {
  const [side, setSide] = useState(false);
  const [hold, setHold] = useState(false);
  const holdKeys = {
    onPointerDown: () => setHold(true), onPointerUp: () => setHold(false), onPointerLeave: () => setHold(false), onPointerCancel: () => setHold(false),
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setHold(true); } },
    onKeyUp: (e: React.KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') setHold(false); },
  };
  return (
    <div className="px-5 py-5">
      <p className="sr-only" role="status" aria-live="polite">The room is ready. Check it against the rug photo, then Keep, Try again or Discard.</p>
      {side ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_1.6fr]">
          <figure className="grid place-items-center rounded-sm bg-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
            <img src={thumb(rug, 700)} alt="The rug photo" className="max-h-[50vh] w-full object-contain" />
            <figcaption className="py-1 text-[11px] text-neutral-500">Rug photo</figcaption>
          </figure>
          <figure>
            <img src={c.url} alt="The rug in a room" className="w-full rounded-sm" />
            <figcaption className="py-1 text-center text-[11px] text-neutral-500">Room setting</figcaption>
          </figure>
        </div>
      ) : (
        <div className="relative aspect-video w-full overflow-hidden rounded-sm bg-neutral-100">
          <img src={c.url} alt="The rug in a room" className="absolute inset-0 h-full w-full object-cover" />
          {/* always loaded, shown while held, so the compare is instant */}
          <img src={thumb(fixStorageUrl(rug), 1200)} alt={hold ? 'The rug photo' : ''} aria-hidden={!hold}
            className={'absolute inset-0 h-full w-full bg-white object-contain ' + (hold ? 'opacity-100' : 'opacity-0')} />
          {hold && <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-[11px] text-white">Rug photo</span>}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!side && (
          <button type="button" {...holdKeys} aria-pressed={hold}
            className="flex min-h-[44px] select-none items-center gap-1.5 rounded-sm border border-neutral-200 px-3 text-[13px] font-semibold text-neutral-800 hover:border-neutral-400 [touch-action:none]">
            <Eye className="h-4 w-4" aria-hidden /> Hold to compare
          </button>
        )}
        <button type="button" onClick={() => setSide((s) => !s)} aria-pressed={side}
          className="flex min-h-[44px] items-center gap-1.5 rounded-sm border border-neutral-200 px-3 text-[13px] font-semibold text-neutral-800 hover:border-neutral-400">
          <Columns2 className="h-4 w-4" aria-hidden /> {side ? 'One picture' : 'Side by side'}
        </button>
        <span className="text-[12px] text-neutral-500">Check the pattern, colours and fringe. Nothing is saved until you keep it.</span>
      </div>
      {error && <p role="alert" className="mt-3 border-l-2 border-red-600 bg-red-50 px-3 py-2 text-[13px] text-red-800">{error}</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-neutral-100 pt-4">
        <button type="button" onClick={onDiscard} disabled={saving}
          className="min-h-[44px] rounded-sm border border-neutral-200 px-4 text-[13px] font-semibold text-neutral-800 hover:border-neutral-400 disabled:opacity-50">Discard</button>
        <button type="button" onClick={onAgain} disabled={saving || againDisabled} title="Makes a new room with the same choices (one more image)"
          className="min-h-[44px] rounded-sm border border-neutral-200 px-4 text-[13px] font-semibold text-neutral-800 hover:border-neutral-400 disabled:opacity-50">Try again</button>
        <button type="button" onClick={onKeep} disabled={saving} autoFocus
          className="flex min-h-[44px] items-center gap-2 rounded-sm bg-[#2F4C69] px-5 text-[13px] font-semibold text-white disabled:opacity-60">
          {saving && <Spinner />} {saving ? 'Keeping' : 'Keep'}
        </button>
      </div>
    </div>
  );
}

/** Kept room images under the thumbnails: open, remove (with Undo), use in decks. */
export function RoomRow({ product, onChanged }: { product: ShowroomProduct; onChanged: (p: ShowroomProduct) => void }) {
  const list = product.roomImages || [];
  const [open, setOpen] = useState<RoomImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<{ before: RoomImage[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(t);
  }, [undo]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(false); }
  };
  const remove = (r: RoomImage) => run(async () => {
    const { product: p, before } = await removeRoomImageFrom(product, r.url);
    setOpen(null);
    onChanged(p);
    setUndo({ before });
  });
  const restore = () => run(async () => {
    if (!undo) return;
    onChanged(await restoreRoomImages(product, undo.before));
    setUndo(null);
  });
  const makeFirst = (r: RoomImage) => run(async () => { onChanged(await makeFirstRoom(product, r.url)); });

  if (!list.length && !undo) return null;
  return (
    <div className="mt-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">Room setting</div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {list.map((r, i) => (
          <div key={r.url} className="relative">
            <button type="button" onClick={() => setOpen(r)} aria-label={`Open room setting ${i + 1}, ${roomStyle(r.roomType)?.name || r.roomType}`}
              className="block aspect-video w-full overflow-hidden rounded-sm bg-neutral-100 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
              <img src={thumb(r.url, 400)} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
            {i === 0 && list.length > 1 && (
              <span className="pointer-events-none absolute left-1 top-1 rounded bg-[#2F4C69] px-1.5 py-0.5 text-[10px] font-semibold text-white">In decks</span>
            )}
            <button type="button" onClick={() => void remove(r)} disabled={busy} aria-label={`Remove room setting ${i + 1}`}
              className="absolute right-0 top-0 grid h-11 w-11 place-items-start justify-items-end p-1 disabled:opacity-50">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-red-600 text-white shadow"><X className="h-3.5 w-3.5" strokeWidth={3} /></span>
            </button>
            {i > 0 && (
              <button type="button" onClick={() => void makeFirst(r)} disabled={busy}
                className="mt-1 flex min-h-[44px] w-full items-center justify-center gap-1 text-[12px] font-semibold text-[#2F4C69] hover:underline disabled:opacity-50">
                <Star className="h-3.5 w-3.5" aria-hidden /> Use this one in decks
              </button>
            )}
          </div>
        ))}
      </div>
      {error && <p role="alert" className="mt-2 text-[12.5px] text-red-700">{error}</p>}
      {undo && (
        <div role="status" className="mt-2 flex items-center gap-3 rounded-sm bg-neutral-900 px-4 py-2 text-[13px] text-white">
          <span className="flex-1">Room setting removed.</span>
          <button type="button" onClick={() => void restore()} disabled={busy} className="min-h-[44px] px-2 font-semibold text-[#9cc0e3] hover:underline disabled:opacity-60">Undo</button>
          <button type="button" onClick={() => setUndo(null)} aria-label="Dismiss" className="grid h-11 w-11 place-items-center text-neutral-400 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
      )}
      {open && <RoomLightbox r={open} onClose={() => setOpen(null)} onRemove={() => void remove(open)} busy={busy} />}
    </div>
  );
}

function RoomLightbox({ r, onClose, onRemove, busy }: { r: RoomImage; onClose: () => void; onRemove: () => void; busy: boolean }) {
  const tabActive = useTabActive();
  useEffect(() => {
    if (!tabActive) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [tabActive, onClose]);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-3" onClick={onClose} role="dialog" aria-modal="true" aria-label="Room setting">
      <div className="w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
        <img src={r.url} alt="The rug in a room" className="w-full rounded-sm" />
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[12.5px] text-white/80">
          <span className="flex-1">{roomStyle(r.roomType)?.name || r.roomType}{r.size ? `, ${r.size}` : ''}{r.by ? `, kept by ${r.by.split('@')[0]}` : ''}</span>
          <button type="button" onClick={onRemove} disabled={busy}
            className="flex min-h-[44px] items-center gap-1.5 rounded-sm px-3 font-semibold text-white hover:bg-white/10 disabled:opacity-50">
            <Trash2 className="h-4 w-4" aria-hidden /> Remove
          </button>
          <button ref={closeRef} type="button" onClick={onClose} className="min-h-[44px] rounded-sm bg-white px-4 font-semibold text-neutral-900">Close</button>
        </div>
      </div>
    </div>
  );
}
