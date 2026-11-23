import { Eraser, Undo2 } from 'lucide-react';
import { ROUND_BUTTON as ROUND, type CutoutApi } from '../lib/useCutout';
import { Spinner, Working } from './Working';

/** Remove background in the Library preview: the button, the status over the photo, the Keep / Undo bar. Logic in lib/useCutout.ts. */

/** The round button on the big photo: Remove background, or Restore original once a cutout was kept. */
export function CutoutButton({ cut, disabled }: { cut: CutoutApi; disabled?: boolean }) {
  const restoring = !!cut.original;
  const label = restoring ? 'Restore original' : 'Remove background';
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); if (restoring) void cut.restore(); else void cut.run(); }}
      disabled={disabled || cut.busy || !!cut.result}
      aria-label={label}
      title={restoring ? 'Restore original: put back the photo this cutout replaced' : 'Remove background from this photo'}
      className={ROUND}
    >
      {cut.busy ? <Spinner className="h-4 w-4" /> : restoring
        ? <Undo2 className="h-4 w-4" strokeWidth={2} />
        : <Eraser className="h-4 w-4" strokeWidth={2} />}
    </button>
  );
}

/** Over the photo while it runs: what is happening, never a silent wait. */
export function CutoutWorking({ cut }: { cut: CutoutApi }) {
  if (!cut.job) return null;
  return (
    <div className="absolute inset-0 grid place-items-center bg-white/75 px-4 text-neutral-800">
      <div className="rounded-md bg-white px-4 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.18)] [&>span]:text-[13px]">
        <Working key={cut.job.label} job={cut.job} />
      </div>
      <span className="sr-only" role="status" aria-live="polite">{cut.job.label}</span>
    </div>
  );
}

/** Under the photo: Keep and Undo for a cutout on show, or the error with Retry. */
export function CutoutBar({ cut }: { cut: CutoutApi }) {
  if (cut.error) {
    return (
      <div role="alert" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-l-2 border-red-600 bg-red-50 px-3 py-2 text-[12.5px] text-red-800">
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{cut.error.message} The photo is unchanged.</span>
        <button type="button" onClick={cut.error.retry} disabled={cut.busy}
          className="min-h-[44px] rounded-sm px-3 font-semibold text-red-800 underline underline-offset-2 hover:text-red-950 disabled:opacity-50">
          Retry
        </button>
        {cut.result && (
          <button type="button" onClick={cut.undo} disabled={cut.busy}
            className="min-h-[44px] rounded-sm px-3 font-semibold text-neutral-700 hover:text-neutral-950 disabled:opacity-50">
            Undo
          </button>
        )}
      </div>
    );
  }
  if (!cut.result) return null;
  return (
    <div role="group" aria-label="Background removed"
      className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-sm border border-neutral-200 bg-white px-3 py-2 text-[12.5px]">
      <span className="min-w-0 flex-1">
        {cut.result.warning
          ? <span className="font-semibold text-[#98671A]">{cut.result.warning}</span>
          : <span className="text-neutral-600">Background removed. Nothing is saved until you keep it.</span>}
      </span>
      <span className="flex gap-2">
        <button type="button" onClick={cut.undo} disabled={cut.busy}
          className="min-h-[44px] rounded-sm border border-neutral-200 px-4 font-semibold text-neutral-800 hover:border-neutral-400 disabled:opacity-50">
          Undo
        </button>
        <button type="button" onClick={() => void cut.keep()} disabled={cut.busy} autoFocus
          className="min-h-[44px] rounded-sm bg-[#2F4C69] px-4 font-semibold text-white disabled:opacity-60">
          Keep
        </button>
      </span>
    </div>
  );
}
