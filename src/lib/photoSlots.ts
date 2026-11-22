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
  /**
   * The file is a cutout of `original` as it came in, same framing, nothing
   * else changed. The editor then warps from the full-resolution original
   * (with the cutout's transparency) instead of the 2000px cutout, and
   * trusts the frame for working out a rug's proportions.
   */
  cutOfOriginal?: boolean;
  keptPct?: number;
  /** Background removal is running on it. */
  working?: boolean;
  /** Background removal failed, with the reason. */
  failed?: string;
  /** Still being converted at intake (HEIC, TIFF, RAW can take a second or two). */
  converting?: boolean;
  /** Intake could not open it: the message for the studio. */
  rejected?: string;

  // Autosave (Custom Rugs, Sample Dispatch, Background Removal). A tile is
  // in the cloud when `remoteFor` is its current `file`; any change of file
  // (cutout, edit, undo) makes it upload again. The same for the original.
  remote?: RemoteFile;
  remoteFor?: File;
  remoteOriginal?: RemoteFile;
  remoteOriginalFor?: File;
  syncing?: boolean;
  syncError?: string;
};

/** A file in Storage. */
export type RemoteFile = { url: string; path: string; name: string; width?: number; height?: number; uploadedAt: string };

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

/** The current file and its original (if any) are both in the cloud. */
export const isSyncedSlot = (s: Slot) =>
  s.remoteFor === s.file && (!s.original || s.remoteOriginalFor === s.original);

/**
 * Waiting for or in the middle of an upload. A tile that could not be opened
 * has nothing to upload, and a saved tile still coming down from the draft is
 * already in the cloud.
 */
export const needsUpload = (s: Slot) =>
  !s.rejected && !(s.converting && s.remote) && (!!s.converting || !isSyncedSlot(s));

/**
 * A new file on a tile (cutout, editor), keeping the first original. When the
 * file being replaced is already uploaded and becomes the original, its upload
 * is reused as the original's.
 */
export function replaceFile(s: Slot, file: File, extra: Partial<Slot> = {}): Slot {
  const carry = !s.original && s.remoteFor === s.file
    ? { remoteOriginal: s.remote, remoteOriginalFor: s.file } : {};
  return { ...s, ...carry, ...extra, file, original: s.original || s.file, failed: undefined, syncError: undefined };
}

/** Undo: the tile goes back to its original, reusing the original's upload. */
export function restoreOriginal(s: Slot): Slot {
  if (!s.original) return s;
  const reuse = s.remoteOriginalFor === s.original
    ? { remote: s.remoteOriginal, remoteFor: s.original } : {};
  return {
    ...s, ...reuse, file: s.original, original: undefined, remoteOriginal: undefined, remoteOriginalFor: undefined,
    cut: false, cutOfOriginal: undefined, keptPct: undefined, failed: undefined, syncError: undefined,
  };
}

export type SavedPhoto = RemoteFile & { originalUrl?: string; originalPath?: string; cut?: boolean; cutOfOriginal?: boolean };

/** What goes in the document: every tile that has an upload, in tile order. */
export function savedPhotos(slots: Slot[]): SavedPhoto[] {
  return slots.filter((s) => s.remote).map((s) => ({
    ...s.remote!,
    ...(s.remoteOriginal ? { originalUrl: s.remoteOriginal.url, originalPath: s.remoteOriginal.path } : {}),
    ...(s.cut ? { cut: true } : {}),
    ...(s.cutOfOriginal && s.remoteOriginal ? { cutOfOriginal: true } : {}),
  }));
}

async function fetchFile(url: string, name: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || 'image/jpeg' });
}

/**
 * Tiles for photos saved in a draft, shown at once as opening. Pass them to
 * `fillSavedSlots` to bring the files down. They already carry their uploads,
 * so the draft they describe is unchanged while they load.
 */
export function placeholderSlots(photos: SavedPhoto[]): Slot[] {
  return photos.map((p) => ({
    id: newSlotId(),
    file: new File([], p.name),
    converting: true,
    cut: !!p.cut,
    ...(p.cutOfOriginal && p.originalUrl ? { cutOfOriginal: true } : {}),
    remote: { url: p.url, path: p.path, name: p.name, width: p.width, height: p.height, uploadedAt: p.uploadedAt },
    ...(p.originalUrl ? { remoteOriginal: { url: p.originalUrl, path: p.originalPath || '', name: p.name, uploadedAt: p.uploadedAt } } : {}),
  }));
}

/**
 * Fetches the files of placeholder tiles. A photo that cannot be fetched
 * keeps its place in the draft (its upload is kept) and says so on the tile.
 */
export function fillSavedSlots(slots: Slot[], update: SlotUpdate): void {
  for (const slot of slots) {
    const r = slot.remote!, o = slot.remoteOriginal;
    void (async () => {
      try {
        const [file, original] = await Promise.all([
          fetchFile(r.url, r.name),
          o ? fetchFile(o.url, r.name) : Promise.resolve(undefined),
        ]);
        update((cur) => cur.map((s) => (s.id !== slot.id ? s : {
          ...s, converting: false, file, remoteFor: file,
          ...(original ? { original, remoteOriginalFor: original } : {}),
        })));
      } catch {
        update((cur) => cur.map((s) => (s.id !== slot.id ? s
          : { ...s, converting: false, rejected: `Could not load ${r.name} from the draft. It is still saved; try reloading the page.` })));
      }
    })();
  }
}

/** At most `n` uploads at a time, so a drop of 30 photos does not open 60 connections. */
export function limiter(n: number) {
  let running = 0;
  const queue: (() => void)[] = [];
  return async function <T>(task: () => Promise<T>): Promise<T> {
    if (running >= n) await new Promise<void>((ok) => queue.push(ok));
    running++;
    try { return await task(); } finally { running--; queue.shift()?.(); }
  };
}
