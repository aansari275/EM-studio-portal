import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { SLOW_MS, STILL_WORKING, jobLine, position, type Job } from '../lib/jobStatus';

/** Seconds since mount, ticking once a second. */
function useElapsed(): number {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now - start;
}

/**
 * A moving indicator with plain words: a spinner (a CSS transform, so it keeps
 * turning even while the page is busy), what is happening, "Photo 2 of 5",
 * a progress bar when the share is known, and after 20 s a line saying it is
 * still working (timed per step: give it a `key` of the label). With reduced motion the spinner stands still and a seconds
 * counter moves instead. Not a live region itself: the picker reads out one
 * summary for all tiles, so a screen reader is not flooded.
 */
export function Working({ job, compact = false }: { job: Job; compact?: boolean }) {
  const ms = useElapsed();
  const at = position(job);
  const secs = Math.floor(ms / 1000);
  return (
    <span className={'flex min-w-0 max-w-full flex-col items-center gap-0.5 text-center leading-tight ' + (compact ? 'text-[9px]' : 'text-[10px]')}>
      <span className="flex items-center gap-1 font-semibold">
        {job.label !== 'Waiting' && (
          <Loader2 aria-hidden className={(compact ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5') + ' shrink-0 animate-spin motion-reduce:animate-none'} strokeWidth={2.5} />
        )}
        <span className="min-w-0 [overflow-wrap:anywhere]">{jobLine(job)}</span>
        {secs >= 2 && job.label !== 'Waiting' && <span className="hidden font-normal tabular-nums motion-reduce:inline">{secs} s</span>}
      </span>
      {at && <span className="font-normal">{at}</span>}
      {job.detail && <span className="max-w-full truncate font-normal">{job.detail}</span>}
      {job.pct !== undefined && (
        <span className="mt-0.5 block h-1 w-4/5 overflow-hidden rounded-full bg-black/15" aria-hidden>
          <span className="block h-full rounded-full bg-[#2F4C69] transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${Math.max(4, Math.round(job.pct * 100))}%` }} />
        </span>
      )}
      {ms >= SLOW_MS && job.label !== 'Waiting' && <span className="font-normal italic">{STILL_WORKING}</span>}
    </span>
  );
}

/** A small spinner for buttons, still under reduced motion (the button text says what runs). */
export function Spinner({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return <Loader2 aria-hidden className={className + ' shrink-0 animate-spin motion-reduce:animate-none'} strokeWidth={2.5} />;
}
