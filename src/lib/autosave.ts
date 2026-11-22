/**
 * Debounced cloud autosave, the house pattern (see `saveSlideLayout` in
 * productEdit.ts): changes are coalesced and written about 1.5 s after the
 * last one, never on every keystroke; a failed write retries with backoff;
 * `flush()` writes the latest state now (closing a dialog); `flushOnExit()`
 * hands the latest unsaved state to a synchronous keepalive writer when the
 * page is being hidden or unloaded, because SDK writes are dropped then.
 *
 * No storage in the browser: the cloud is the only copy.
 */

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
export type SaveStatus = { state: SaveState; at?: Date };

export type Autosaver<T> = {
  /** Records the latest state and schedules a save. */
  set(value: T): void;
  /** Saves the latest unsaved state now, once, and resolves when it is written (or has failed). */
  flush(): Promise<void>;
  /** For pagehide / hidden tab: sends the latest unsaved state with the exit writer, synchronously. */
  flushOnExit(): void;
  /** Something is not written yet (waiting, in flight or failed). */
  readonly dirty: boolean;
  dispose(): void;
};

export const RETRY_MS = [2000, 5000, 15000, 30000];

export function createAutosaver<T>(opts: {
  save: (value: T) => Promise<void>;
  saveOnExit?: (value: T) => void;
  delay?: number;
  onStatus?: (s: SaveStatus) => void;
  /** true when a change is waiting to be written, false once everything is written. */
  onDirty?: (dirty: boolean) => void;
  now?: () => Date;
}): Autosaver<T> {
  const delay = opts.delay ?? 1500;
  const now = opts.now ?? (() => new Date());
  let latest: T | undefined;
  let version = 0;   // bumped on every set
  let written = 0;   // the version last written successfully
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let failures = 0;
  let disposed = false;

  const status = (s: SaveStatus) => { if (!disposed) opts.onStatus?.(s); };
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const schedule = (ms: number) => { clear(); timer = setTimeout(() => { timer = null; void run(); }, ms); };

  async function run(): Promise<void> {
    if (disposed) return;
    if (inFlight) { await inFlight; return run(); }
    if (written === version) return;
    const v = version;
    const value = latest as T;
    status({ state: 'saving' });
    inFlight = (async () => {
      try {
        await opts.save(value);
        written = Math.max(written, v);
        failures = 0;
        if (written === version) { status({ state: 'saved', at: now() }); if (!disposed) opts.onDirty?.(false); }
      } catch {
        failures++;
        status({ state: 'error' });
        if (!disposed) schedule(RETRY_MS[Math.min(failures - 1, RETRY_MS.length - 1)]);
      }
    })();
    try { await inFlight; } finally { inFlight = null; }
    // changed while that write was out: write again after the usual pause
    if (!disposed && written !== version && failures === 0 && !timer) schedule(delay);
  }

  return {
    set(value: T) {
      latest = value;
      version++;
      opts.onDirty?.(true);
      if (failures === 0) schedule(delay); // while failing, the retry timer carries the latest
    },
    async flush() {
      clear();
      await run();
    },
    flushOnExit() {
      if (written === version || latest === undefined || !opts.saveOnExit) return;
      try { opts.saveOnExit(latest); } catch { /* the page is closing */ }
    },
    get dirty() { return written !== version; },
    dispose() { disposed = true; clear(); },
  };
}

/** "Saving", "Saved 12:04", "Could not save. Retrying" */
export function saveLabel(s: SaveStatus): string {
  if (s.state === 'saving') return 'Saving';
  if (s.state === 'error') return 'Could not save. Retrying';
  if (s.state === 'saved' && s.at) {
    return `Saved ${String(s.at.getHours()).padStart(2, '0')}:${String(s.at.getMinutes()).padStart(2, '0')}`;
  }
  return '';
}
