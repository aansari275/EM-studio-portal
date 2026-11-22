import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { useTabActive } from '../lib/tabContext';
import { formatDuration, pickVideo, shouldAutoOpen, TRAINING_TABS, type SeenMap, type TrainingVideo, type TrainingVideoId } from '../lib/training';
import { loadCatalogue, loadSeen, markSeen } from '../lib/trainingStore';

// The player is its own chunk: nothing of it loads until the pop-up opens.
const TrainingDialog = lazy(() => import('./TrainingDialog'));

// Videos that already opened by themselves in this page session.
const autoOpened = new Set<string>();

/** Is any other modal dialog showing? Dialogs inside hidden tabs do not count. */
function otherDialogOpen(): boolean {
  return Array.from(document.querySelectorAll('[aria-modal="true"]'))
    .some((el) => el.getClientRects().length > 0);
}

/**
 * The Training video control at the top of a page, and the pop-up it opens.
 * Renders nothing when the catalogue has no playable video for this tab.
 * Opens by itself the first time she visits the tab at the video's current
 * version; closing records that version as seen.
 */
export function TrainingButton({ videoId, className = '' }: { videoId: TrainingVideoId; className?: string }) {
  const active = useTabActive();
  const [video, setVideo] = useState<TrainingVideo | null>(null);
  const [seen, setSeen] = useState<SeenMap | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const tab = TRAINING_TABS[videoId];

  useEffect(() => {
    let live = true;
    loadCatalogue().then((raw) => { if (live) setVideo(pickVideo(raw, videoId)); });
    return () => { live = false; };
  }, [videoId]);

  // Her seen map is only needed when there is a video to decide about.
  useEffect(() => {
    if (!video) return;
    let live = true;
    loadSeen().then((s) => { if (live) setSeen(s); });
    return () => { live = false; };
  }, [video]);

  // Auto-open: once this tab is in front and its page has painted, and not over another dialog.
  useEffect(() => {
    if (open || seen === undefined) return;
    const eligible = () => shouldAutoOpen({
      video, videoId, seen, active, otherDialogOpen: false, alreadyAutoOpened: autoOpened.has(videoId),
    });
    if (!eligible()) return;
    let timer = 0;
    const tryOpen = () => {
      if (!eligible()) return;
      if (otherDialogOpen()) { timer = window.setTimeout(tryOpen, 800); return; }
      autoOpened.add(videoId);
      setOpen(true);
    };
    timer = window.setTimeout(tryOpen, 600);
    return () => window.clearTimeout(timer);
  }, [video, videoId, seen, active, open]);

  const close = useCallback(() => {
    setOpen(false);
    if (video) {
      setSeen((s) => (s ? { ...s, [videoId]: Math.max(video.version, Number(s[videoId]) || 0) } : s));
      void markSeen(videoId, video.version);
    }
    // back to the control that opens it, whether she opened it or it opened itself
    requestAnimationFrame(() => button.current?.focus());
  }, [video, videoId]);

  if (!video) return null;

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => { autoOpened.add(videoId); setOpen(true); }}
        aria-label={`Watch the ${tab} training video`}
        aria-haspopup="dialog"
        className={'group inline-flex shrink-0 items-center gap-2.5 rounded-md border border-neutral-200 bg-white p-1 pr-3 text-left transition-colors hover:border-neutral-400 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F4C69] ' + className}
      >
        <span className="relative block h-10 w-[72px] shrink-0 overflow-hidden rounded-[3px] bg-neutral-800">
          {video.poster && <img src={video.poster} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover opacity-85" />}
          <span className="absolute inset-0 grid place-items-center bg-black/15">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-white/95 shadow-sm">
              <Play className="ml-0.5 h-3 w-3 fill-neutral-900 text-neutral-900" aria-hidden="true" />
            </span>
          </span>
        </span>
        <span className="leading-tight">
          <span className="block text-[12.5px] font-semibold text-neutral-700 group-hover:text-neutral-900">Training video</span>
          {video.durationSec > 0 && (
            <span className="block text-[11.5px] tabular-nums text-neutral-400">{formatDuration(video.durationSec)}</span>
          )}
        </span>
      </button>
      {open && (
        <Suspense fallback={null}>
          <TrainingDialog video={video} tab={tab} onClose={close} />
        </Suspense>
      )}
    </>
  );
}
