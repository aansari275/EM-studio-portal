/**
 * Training videos: pure helpers, no Firebase, unit tested.
 *
 * The catalogue lives in Firestore at `config/studio_training` (written by
 * whoever publishes the videos, never by this app). Which video belongs to
 * which tab is kept here in code.
 */

export type TrainingChapter = { t: number; label: string };

export type TrainingVideo = {
  title: string;
  src: string;
  poster: string;
  captions?: string;
  durationSec: number;
  version: number;
  updatedAt: string;
  chapters: TrainingChapter[];
};

export type TrainingCatalogue = Record<string, TrainingVideo>;

/** `studio_training_seen/{uid}.seen`: the version of each video she has closed. */
export type SeenMap = Record<string, number>;

export type TrainingVideoId = 'library' | 'background-removal' | 'custom-rugs' | 'sample-dispatch';

/** Video id -> the tab it is shown on (the shell's tab label). */
export const TRAINING_TABS: Record<TrainingVideoId, string> = {
  library: 'Library',
  'background-removal': 'Background Removal',
  'custom-rugs': 'Custom Rugs',
  'sample-dispatch': 'Sample Dispatch',
};

/**
 * Read one video out of a raw catalogue doc, or null when it is missing, has
 * no `src`, or is malformed. Chapters are cleaned and sorted by time.
 */
export function pickVideo(raw: unknown, id: string): TrainingVideo | null {
  const videos = (raw as { videos?: unknown } | null | undefined)?.videos;
  if (!videos || typeof videos !== 'object') return null;
  const v = (videos as Record<string, unknown>)[id] as Partial<TrainingVideo> | undefined;
  if (!v || typeof v !== 'object' || typeof v.src !== 'string' || !v.src.trim()) return null;
  const chapters = Array.isArray(v.chapters)
    ? v.chapters
        .filter((c): c is TrainingChapter => !!c && Number.isFinite(Number(c.t)) && typeof c.label === 'string' && !!c.label.trim())
        .map((c) => ({ t: Math.max(0, Number(c.t)), label: c.label.trim() }))
        .sort((a, b) => a.t - b.t)
    : [];
  return {
    title: typeof v.title === 'string' ? v.title : '',
    src: v.src,
    poster: typeof v.poster === 'string' ? v.poster : '',
    captions: typeof v.captions === 'string' && v.captions.trim() ? v.captions : undefined,
    durationSec: Number.isFinite(Number(v.durationSec)) ? Math.max(0, Number(v.durationSec)) : 0,
    version: Number.isFinite(Number(v.version)) ? Number(v.version) : 1,
    updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : '',
    chapters,
  };
}

/**
 * Should the pop-up open by itself right now?
 * - there is a playable video for this tab,
 * - its tab is the active one,
 * - the seen doc was read (null = not read or could not be read: never auto-open),
 * - she has not closed this video at this version or later,
 * - no other dialog is open on screen,
 * - it has not already opened by itself in this page session.
 */
export function shouldAutoOpen(args: {
  video: TrainingVideo | null;
  videoId: string;
  seen: SeenMap | null;
  active: boolean;
  otherDialogOpen: boolean;
  alreadyAutoOpened?: boolean;
}): boolean {
  const { video, videoId, seen, active, otherDialogOpen, alreadyAutoOpened } = args;
  if (!video || !active || !seen || otherDialogOpen || alreadyAutoOpened) return false;
  const had = Number(seen[videoId]);
  return !(Number.isFinite(had) && had >= video.version);
}

/** Index of the chapter playing at time t (seconds), or -1 before the first one. */
export function currentChapter(chapters: TrainingChapter[], t: number): number {
  let at = -1;
  for (let i = 0; i < chapters.length; i++) {
    if (chapters[i].t <= t + 0.05) at = i;
    else break;
  }
  return at;
}

/** 95 -> "1:35". */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const WORDS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

/** 120 -> "Two minute walkthrough". Under a minute counts as one. */
export function walkthroughLength(sec: number): string {
  const m = Math.max(1, Math.round(sec / 60));
  return `${WORDS[m - 1] ?? String(m)} minute walkthrough`;
}
