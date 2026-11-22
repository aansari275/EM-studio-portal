import { normaliseAll } from './imageIntake';

/**
 * One photo tile in a PhotoPicker. Every tile starts by going through photo
 * intake (`normaliseImage`), so `file` is a browser-decodable JPEG or PNG once
 * `converting` is false; a file that cannot be opened keeps `rejected` with
 * the message to show and is never saved.
 */
export type Slot = {
  id: string;
  file: File;
  /** The photo as it was added, before any cutout or edit. */
  original?: File;
  /** The background has been removed (the file is a cutout). */
  cut?: boolean;
  keptPct?: number;
  /** Background removal is running on it. */
  working?: boolean;
  /** Background removal failed, with the reason. */
  failed?: string;
  /** Still being converted at intake (HEIC, TIFF, RAW can take a second or two). */
  converting?: boolean;
  /** Intake could not open it: the message for the studio. */
  rejected?: string;
};

export type SlotUpdate = (update: Slot[] | ((cur: Slot[]) => Slot[])) => void;

let seq = 0;
export const newSlotId = () => `s${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Ready to save, download or process. */
export const isReadySlot = (s: Slot) => !s.converting && !s.rejected;

/** Something is still running on it. */
export const isBusySlot = (s: Slot) => !!(s.converting || s.working);

/**
 * Adds files as tiles straight away (so the grid shows them at once) and
 * converts them two at a time, each tile filling in as it finishes.
 */
export function addFilesAsSlots(list: FileList | File[] | null | undefined, update: SlotUpdate): void {
  const files = [...(list || [])];
  if (!files.length) return;
  const added: Slot[] = files.map((file) => ({ id: newSlotId(), file, converting: true }));
  update((cur) => [...cur, ...added]);
  void normaliseAll(files, (i, r) => {
    const id = added[i].id;
    update((cur) => cur.map((s) => (s.id !== id ? s
      : r.ok ? { id, file: r.file } : { ...s, converting: false, rejected: r.error })));
  });
}
