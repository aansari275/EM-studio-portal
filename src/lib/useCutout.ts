import { useEffect, useRef, useState } from 'react';
import type { ShowroomProduct } from './firebase';
import { fixStorageUrl, orderedImages } from './img';
import { originalOf } from './photoOriginals';
import { CUT_LABEL, stepJob, type Job } from './jobStatus';
import { keepCutoutPhoto, restoreOriginalPhoto } from './productEdit';

/**
 * Remove background on the photo shown in the Library preview, in place.
 *
 * Run: the stored file (the best copy there is) goes through the same
 * pipeline as Background Removal (`removeBackground`: model, crop re-run,
 * clean up). The cutout is shown on a checkerboard with Keep and Undo;
 * nothing is written until Keep. Keep uploads the PNG through Edit design's
 * upload (3 MB rule) and swaps it into the same position, noting the photo it
 * replaced (`photoOriginals`), so the button then reads Restore original.
 *
 * Closing the dialog while it runs throws the result away (nothing was
 * written). A Keep or Restore already sent finishes on its own: it is one
 * upload and then one document write, so there is no half state to leave.
 */

export type CutoutApi = ReturnType<typeof useCutout>;

type Result = { file: File; preview: string; warning: string | null };

export function useCutout(
  product: ShowroomProduct, url: string,
  /** After a Keep or Restore: the saved record and the position of the photo. */
  onSaved: (p: ShowroomProduct, at: number) => void
) {
  const [job, setJob] = useState<Job | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<{ message: string; retry: () => void } | null>(null);
  const gen = useRef(0);
  const mounted = useRef(true);
  const resultRef = useRef<Result | null>(null);
  resultRef.current = result;

  const reset = () => {
    gen.current += 1;
    if (resultRef.current) URL.revokeObjectURL(resultRef.current.preview);
    setJob(null); setResult(null); setError(null);
  };
  // Another photo or design starts clean; a result for the old one is dropped.
  // Keyed on id and url only, so a slide layout saved meanwhile does not drop it.
  useEffect(reset, [product.id, url]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      gen.current += 1;
      if (resultRef.current) URL.revokeObjectURL(resultRef.current.preview);
    };
  }, []);

  const original = originalOf(product.photoOriginals, url);
  const busy = !!job;

  async function run() {
    if (busy || !url) return;
    reset();
    const mine = gen.current;
    const live = () => mine === gen.current;
    const say = (label: string) => { if (live()) setJob({ label }); };
    const t0 = performance.now();
    try {
      say('Getting the photo');
      const res = await fetch(fixStorageUrl(url));
      if (!res.ok) throw new Error(`Could not load the photo (${res.status}).`);
      const blob = await res.blob();
      const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'photo').split('/').pop() || 'photo.jpg';
      const { normaliseImage } = await import('./imageIntake');
      const file = await normaliseImage(new File([blob], name, { type: blob.type }));
      if (!live()) return;
      const t1 = performance.now();
      say(CUT_LABEL.finding);
      // Loaded only now: the model runtime is large (see bgremove.ts).
      const { removeBackground } = await import('./bgremove');
      const cut = await removeBackground(file, 2000, (st) => say(CUT_LABEL[st]));
      const t2 = performance.now();
      try {
        performance.measure('libcut:fetch', { start: t0, end: t1 });
        performance.measure('libcut:remove', { start: t1, end: t2 });
      } catch { /* older browsers */ }
      if (!live()) return;
      setResult({ file: cut.file, preview: URL.createObjectURL(cut.file), warning: cut.warning });
      setJob(null);
    } catch (e) {
      if (!live()) return;
      setJob(null);
      setError({ message: e instanceof Error ? e.message : 'Could not remove the background.', retry: run });
    }
  }

  function undo() {
    reset();
  }

  async function keep() {
    const r = result;
    if (!r || busy) return;
    setError(null);
    const at = orderedImages(product).indexOf(url);
    const t0 = performance.now();
    setJob({ label: 'Getting ready' });
    try {
      const saved = await keepCutoutPhoto(product, url, r.file, (st) => {
        if (mounted.current) setJob(stepJob(st) || { label: 'Saving to the design' });
      });
      try { performance.measure('libcut:keep', { start: t0, end: performance.now() }); } catch { /* older browsers */ }
      onSaved(saved, at);
      // The record now shows the kept PNG; the effect on the new url clears the rest.
    } catch (e) {
      if (!mounted.current) return;
      setJob(null);
      setError({ message: e instanceof Error ? e.message : 'Could not save the cutout.', retry: keep });
    }
  }

  async function restore() {
    if (busy || !original) return;
    reset();
    const at = orderedImages(product).indexOf(url);
    setJob({ label: 'Putting the original back' });
    try {
      onSaved(await restoreOriginalPhoto(product, url), at);
    } catch (e) {
      if (!mounted.current) return;
      setJob(null);
      setError({ message: e instanceof Error ? e.message : 'Could not put the original back.', retry: restore });
    }
  }

  return { run, undo, keep, restore, busy, job, result, error, original };
}

/** The round buttons on the big photo in the preview (rotate, remove background): 44px targets. */
export const ROUND_BUTTON = 'grid h-11 w-11 place-items-center rounded-full bg-white/95 text-neutral-700 shadow-[0_1px_3px_rgba(0,0,0,0.2)] hover:text-[#2F4C69] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F4C69]';
