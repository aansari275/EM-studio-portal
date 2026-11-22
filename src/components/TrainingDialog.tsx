import { useEffect, useId, useRef, useState } from 'react';
import { Play, X } from 'lucide-react';
import { useTabActive } from '../lib/tabContext';
import { currentChapter, formatDuration, walkthroughLength, type TrainingVideo } from '../lib/training';

const SPEEDS = [0.75, 1, 1.25, 1.5];

/**
 * The training pop-up: the video, playback speed and chapters. Starts paused
 * on the poster with a large play button (never autoplays). Pauses when it
 * closes or its tab goes to the background. Nothing is remembered but the
 * seen version, which the caller records on close.
 */
export default function TrainingDialog({ video, tab, onClose }: {
  video: TrainingVideo; tab: string; onClose: () => void;
}) {
  const active = useTabActive();
  const panel = useRef<HTMLDivElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const playBtn = useRef<HTMLButtonElement>(null);
  const [started, setStarted] = useState(false);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const titleId = useId();
  const helpId = useId();
  const chapter = currentChapter(video.chapters, time);
  const heading = video.title.trim() || `How to use ${tab}`;

  useEffect(() => { playBtn.current?.focus(); }, []);

  // pause when the tab goes to the background, and when the pop-up closes
  useEffect(() => { if (!active) player.current?.pause(); }, [active]);
  useEffect(() => {
    const v = player.current;
    return () => { v?.pause(); };
  }, []);

  // Escape and the focus trap, only while this tab is in front
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const f = Array.from(panel.current.querySelectorAll<HTMLElement>('button, video, a[href], [tabindex]:not([tabindex="-1"])'))
        .filter((el) => !el.hasAttribute('disabled') && el.getClientRects().length > 0);
      if (!f.length) return;
      const a = f[0], z = f[f.length - 1];
      const inside = panel.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === a || !inside)) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && (document.activeElement === z || !inside)) { e.preventDefault(); a.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onClose]);

  function play() {
    const v = player.current;
    if (!v) return;
    v.play().catch(() => {});
    v.focus();
  }

  function seek(t: number) {
    const v = player.current;
    if (!v) return;
    v.currentTime = t;
    setTime(t);
    v.play().catch(() => {});
  }

  function pickSpeed(r: number) {
    setSpeed(r);
    if (player.current) { player.current.playbackRate = r; player.current.defaultPlaybackRate = r; }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:items-center sm:p-6"
      onClick={onClose}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={helpId}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[1080px] rounded-md bg-white shadow-xl">
        <div className="flex items-start gap-4 border-b border-neutral-200 px-4 py-3.5 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-serif text-[21px] leading-tight">{heading}</h2>
            <p id={helpId} className="mt-1 text-[13px] text-neutral-500">
              {video.durationSec > 0 ? `${walkthroughLength(video.durationSec)}. ` : ''}
              You can watch it again any time from the Training video button.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close training video"
            className="-mr-2 grid h-9 w-9 shrink-0 place-items-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2F4C69]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-4 sm:p-6 md:flex-row">
          <div className="min-w-0 md:flex-1">
            <div className="relative overflow-hidden rounded-[4px] bg-black">
              <video
                ref={player}
                src={video.src}
                poster={video.poster || undefined}
                controls
                playsInline
                preload="metadata"
                crossOrigin={video.captions ? 'anonymous' : undefined}
                onPlay={() => setStarted(true)}
                onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
                onSeeked={(e) => setTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => { e.currentTarget.playbackRate = speed; }}
                aria-label={heading}
                className="block aspect-video w-full bg-black focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#7aa3cc]"
              >
                {video.captions && <track kind="captions" src={video.captions} srcLang="en" label="English" default />}
              </video>
              {!started && (
                <button ref={playBtn} type="button" onClick={play} aria-label="Play the training video"
                  className="group absolute inset-0 grid place-items-center bg-black/10 focus-visible:outline-none">
                  <span className="grid h-[72px] w-[72px] place-items-center rounded-full bg-white/95 shadow-lg transition-transform group-hover:scale-105 group-focus-visible:ring-4 group-focus-visible:ring-[#7aa3cc] motion-reduce:transition-none motion-reduce:group-hover:scale-100">
                    <Play className="ml-1 h-8 w-8 fill-neutral-900 text-neutral-900" aria-hidden="true" />
                  </span>
                </button>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span id={`${titleId}-speed`} className="text-[12.5px] text-neutral-500">Speed</span>
              <div role="group" aria-labelledby={`${titleId}-speed`} className="flex overflow-hidden rounded-sm border border-neutral-300">
                {SPEEDS.map((r) => (
                  <button key={r} type="button" aria-pressed={speed === r} onClick={() => pickSpeed(r)}
                    className={'min-w-[48px] border-l border-neutral-300 px-2.5 py-1.5 text-[12.5px] tabular-nums first:border-l-0 focus-visible:relative focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2F4C69] ' +
                      (speed === r ? 'bg-[#2F4C69] font-semibold text-white' : 'bg-white text-neutral-700 hover:bg-neutral-50')}>
                    {r}x
                  </button>
                ))}
              </div>
              <div className="flex-1" />
              <button type="button" onClick={onClose}
                className="rounded-sm bg-[#2F4C69] px-[18px] py-2 text-[13px] font-semibold text-white hover:bg-[#243b52] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F4C69]">
                Got it
              </button>
            </div>
          </div>

          {video.chapters.length > 0 && (
            <nav aria-label="Chapters" className="md:w-[260px] md:shrink-0">
              <h3 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Chapters</h3>
              <ol className="space-y-0.5">
                {video.chapters.map((c, i) => {
                  const on = i === chapter;
                  return (
                    <li key={`${c.t}-${i}`}>
                      <button type="button" onClick={() => seek(c.t)} aria-current={on ? 'step' : undefined}
                        className={'flex w-full items-baseline gap-3 rounded-md px-3 py-2 text-left text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2F4C69] ' +
                          (on ? 'bg-neutral-100 font-semibold text-neutral-900 shadow-[inset_2px_0_0_#2F4C69]' : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900')}>
                        <span className="w-9 shrink-0 text-[12px] tabular-nums text-neutral-400">{formatDuration(c.t)}</span>
                        <span className="min-w-0">{c.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
