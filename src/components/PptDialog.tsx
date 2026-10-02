import { useMemo, useState } from 'react';
import type { ShowroomProduct } from '../lib/firebase';
import { orderedImages } from '../lib/img';
import { buildPptxBlob, deckFileName, deckPhotoSlots, type DeckLayout } from '../lib/pptGenerator';
import { loadDeckImages, FULL, EMAIL_STEPS, EMAIL_LIMIT, type Quality } from '../lib/deckImages';

/**
 * Options before a deck is built, and a size check after.
 *
 * The deck is built in memory first so its real size is known. Over 25 MB,
 * most mail servers bounce it, so instead of saving straight away the dialog
 * offers an email-friendly copy beside the full-quality one.
 */

type Step =
  | { kind: 'options' }
  | { kind: 'working'; label: string; done?: number; total?: number }
  | { kind: 'big'; blob: Blob }
  | { kind: 'saved'; bytes: number; note?: string }
  | { kind: 'error'; message: string };

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function save(blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = deckFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export default function PptDialog({
  products,
  title = 'Eastern Mills',
  onClose,
  onSaved,
}: {
  products: ShowroomProduct[];
  title?: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [layout, setLayout] = useState<DeckLayout>('single');
  const [extraPhotos, setExtraPhotos] = useState(true);
  const [step, setStep] = useState<Step>({ kind: 'options' });

  const extra = useMemo(() => {
    const counts = products.map((p) => Math.max(0, orderedImages(p).length - 4));
    return { photos: counts.reduce((a, b) => a + b, 0), rugs: counts.filter(Boolean).length };
  }, [products]);

  const slots = useMemo(() => deckPhotoSlots(products, { layout, extraPhotos }), [products, layout, extraPhotos]);

  async function build(quality: Quality, label: string): Promise<Blob> {
    setStep({ kind: 'working', label, done: 0, total: slots.length });
    const images = await loadDeckImages(slots, quality, (done, total) =>
      setStep({ kind: 'working', label, done, total })
    );
    setStep({ kind: 'working', label: 'Putting the slides together' });
    return buildPptxBlob(products, title, { images, layout, extraPhotos });
  }

  async function run(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (e) {
      setStep({ kind: 'error', message: e instanceof Error ? e.message : 'Could not build the PPT.' });
    }
  }

  const buildFull = () =>
    run(async () => {
      const blob = await build(FULL, 'Preparing photos');
      if (blob.size > EMAIL_LIMIT) return setStep({ kind: 'big', blob });
      save(blob);
      setStep({ kind: 'saved', bytes: blob.size });
    });

  const buildEmail = () =>
    run(async () => {
      let blob: Blob | undefined;
      for (const q of EMAIL_STEPS) {
        blob = await build(q, 'Making an email-friendly copy');
        if (blob.size <= EMAIL_LIMIT) break;
      }
      save(blob!);
      const over = blob!.size > EMAIL_LIMIT;
      setStep({
        kind: 'saved',
        bytes: blob!.size,
        note: over ? 'Still over 25 MB at the smallest size. Split the selection into two decks.' : undefined,
      });
    });

  const working = step.kind === 'working';

  // Selection is only cleared once she has seen the result, so the dialog
  // does not vanish the moment the file saves.
  const close = () => {
    if (step.kind === 'saved') onSaved?.();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={() => !working && close()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ppt-title"
        className="w-full max-w-md rounded-sm bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="ppt-title" className="font-serif text-2xl">
          PPT of {products.length} rug{products.length === 1 ? '' : 's'}
        </h2>

        {step.kind === 'options' && (
          <>
            <fieldset className="mt-5 space-y-2">
              <legend className="mb-2 text-[12px] uppercase tracking-wider text-neutral-400">Layout</legend>
              <Choice
                checked={layout === 'single'}
                onChange={() => setLayout('single')}
                title="One rug per slide"
                hint="The house slide: large photo and three more"
              />
              <Choice
                checked={layout === 'grid'}
                onChange={() => setLayout('grid')}
                title="Eight rugs per slide"
                hint="Colourway grid, colour and size under each"
              />
            </fieldset>

            {layout === 'single' && extra.photos > 0 && (
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-sm border border-neutral-200 p-3 text-sm hover:border-neutral-400">
                <input
                  type="checkbox"
                  checked={extraPhotos}
                  onChange={(e) => setExtraPhotos(e.target.checked)}
                  className="mt-0.5 accent-[#2F4C69]"
                />
                <span>
                  Add the extra photos
                  <span className="block text-[12.5px] text-neutral-500">
                    {extra.photos} more across {extra.rugs} rug{extra.rugs === 1 ? '' : 's'}, eight to a slide after
                    each rug
                  </span>
                </span>
              </label>
            )}

            <p className="mt-4 text-[12.5px] text-neutral-500">
              {slots.length} photo{slots.length === 1 ? '' : 's'}, each sized for its place on the slide. Originals stay
              untouched.
            </p>

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={onClose} className="px-3 py-2.5 text-[13px] text-neutral-500 hover:text-neutral-900">
                Cancel
              </button>
              <button
                onClick={buildFull}
                className="rounded-sm bg-[#2F4C69] px-[18px] py-2.5 text-[13px] font-semibold text-white"
              >
                Build PPT
              </button>
            </div>
          </>
        )}

        {step.kind === 'working' && (
          <div className="mt-6" aria-live="polite">
            <p className="text-sm">
              {step.label}
              {step.total ? ` ${step.done} of ${step.total}` : '…'}
            </p>
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full bg-[#2F4C69] transition-all"
                style={{ width: step.total ? `${((step.done || 0) / step.total) * 100}%` : '100%' }}
              />
            </div>
          </div>
        )}

        {step.kind === 'big' && (
          <>
            <p className="mt-4 text-sm">
              This deck is <strong>{mb(step.blob.size)}</strong>. Most email accounts refuse attachments over 25 MB.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                onClick={buildEmail}
                className="rounded-sm bg-[#2F4C69] px-[18px] py-2.5 text-[13px] font-semibold text-white"
              >
                Make an email-friendly copy, under 25 MB
              </button>
              <button
                onClick={() => {
                  save(step.blob);
                  setStep({ kind: 'saved', bytes: step.blob.size });
                            }}
                className="rounded-sm border border-neutral-200 px-[18px] py-2.5 text-[13px] font-semibold hover:border-neutral-400"
              >
                Download full quality, {mb(step.blob.size)}
              </button>
            </div>
          </>
        )}

        {step.kind === 'saved' && (
          <>
            <p className="mt-4 text-sm">Saved to your downloads, {mb(step.bytes)}.</p>
            {step.note && <p className="mt-2 text-[12.5px] text-[#98671A]">{step.note}</p>}
            <div className="mt-6 flex justify-end">
              <button
                onClick={close}
                className="rounded-sm bg-[#2F4C69] px-[18px] py-2.5 text-[13px] font-semibold text-white"
              >
                Done
              </button>
            </div>
          </>
        )}

        {step.kind === 'error' && (
          <>
            <p className="mt-4 text-sm text-red-600">{step.message}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={onClose} className="px-3 py-2.5 text-[13px] text-neutral-500 hover:text-neutral-900">
                Close
              </button>
              <button
                onClick={() => setStep({ kind: 'options' })}
                className="rounded-sm border border-neutral-200 px-[18px] py-2.5 text-[13px] font-semibold hover:border-neutral-400"
              >
                Try again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Choice({
  checked,
  onChange,
  title,
  hint,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  hint: string;
}) {
  return (
    <label
      className={
        'flex cursor-pointer items-start gap-3 rounded-sm border p-3 text-sm ' +
        (checked ? 'border-[#2F4C69]' : 'border-neutral-200 hover:border-neutral-400')
      }
    >
      <input type="radio" checked={checked} onChange={onChange} className="mt-0.5 accent-[#2F4C69]" />
      <span>
        {title}
        <span className="block text-[12.5px] text-neutral-500">{hint}</span>
      </span>
    </label>
  );
}
