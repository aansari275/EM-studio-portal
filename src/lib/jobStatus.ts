/**
 * What a tile says while something runs on it, in plain words. Pure, so the
 * wording and the rules are unit tested; `components/Working.tsx` draws it.
 * The owner's rule: no wait over about a second is silent. Every one gets
 * moving feedback, words for what is happening, and "Photo 2 of 5" when
 * several are queued.
 */

/** Upload steps, as `uploadPrep.ts` reports them, plus done. */
export type Step =
  | { stage: 'reducing' }
  | { stage: 'uploading'; pct: number; note?: string }
  | { stage: 'done' };

export type Job = {
  label: string;
  /** Second line: "5.1 MB to 2.8 MB", a file name. */
  detail?: string;
  /** 0..1 when known, for a progress bar. */
  pct?: number;
  /** Position in the batch, shown as "Photo n of m" when m > 1. */
  n?: number;
  of?: number;
};

/** After this long the tile adds a line saying it is still working. */
export const SLOW_MS = 20_000;

export const STILL_WORKING = 'Still working, large photo';

export function stepJob(s: Step, prefix = ''): Job | undefined {
  if (s.stage === 'done') return undefined;
  if (s.stage === 'reducing') return { label: `${prefix}Reducing file size` };
  return { label: `${prefix}Uploading`, pct: s.pct, ...(s.note ? { detail: s.note } : {}) };
}

/**
 * One tile uploads its photo and, beside it, the original it was cut from.
 * The tile follows the photo; once that is up, it follows the original.
 */
export function tileJob(main: Step | undefined, original: Step | undefined, pos?: { n: number; of: number }): Job | undefined {
  const at = pos && pos.of > 1 ? pos : undefined;
  const job = main && main.stage !== 'done'
    ? stepJob(main)
    : original && original.stage !== 'done'
      ? stepJob(original, 'Original: ')
      : undefined;
  return job && { ...job, ...at };
}

export const position = (j: Job) => (j.n && j.of && j.of > 1 ? `Photo ${j.n} of ${j.of}` : '');

/** "Uploading 40%". */
export const jobLine = (j: Job) =>
  j.pct !== undefined && j.label.endsWith('Uploading') ? `${j.label} ${Math.round(j.pct * 100)}%` : j.label;

/**
 * The line read out (aria-live) for the tiles that are busy. No percentages,
 * so a screen reader is not flooded while bytes move.
 */
export function busySummary(jobs: Job[]): string {
  const active = jobs.filter((j) => j.label !== 'Waiting');
  const queued = jobs.length - active.length;
  if (!active.length) return '';
  const tail = queued ? `, ${queued} waiting` : '';
  if (active.length === 1) {
    const j = active[0];
    const at = position(j);
    return `${at ? `${at}: ` : ''}${j.label}${tail}.`;
  }
  const labels = [...new Set(active.map((j) => j.label))];
  return `${active.length} photos: ${labels.join(', ')}${tail}.`;
}

/** Background removal steps, in order. */
export type CutStage = 'model' | 'finding' | 'edge' | 'cleanup' | 'saving';

export const CUT_LABEL: Record<CutStage, string> = {
  model: 'Loading the background tool, first time only',
  finding: 'Finding the rug',
  edge: 'Sharpening the edge',
  cleanup: 'Cleaning up the edge',
  saving: 'Saving the cutout',
};

/** One line for a form's button: "Photo 2 of 5: Reducing file size", "Photo 2 of 5: Uploading 40%". */
export function uploadLine(i: number, of: number, s: Step): string {
  const j = stepJob(s);
  const at = of > 1 ? `Photo ${i + 1} of ${of}: ` : '';
  return j ? `${at}${jobLine(j)}` : `${at}Saving`;
}
