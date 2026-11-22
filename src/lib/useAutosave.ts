import { useCallback, useEffect, useRef, useState } from 'react';
import { createAutosaver, type Autosaver, type SaveStatus } from './autosave';

/**
 * React glue for createAutosaver. `value` null means nothing to save yet.
 * With `alreadySaved`, the first non-null value seen is the baseline (what is
 * in the cloud), so opening a draft writes nothing until something changes;
 * without it, the first value is written (a new draft). Changes are compared
 * by JSON, so a re-render with the same content is not a write.
 *
 * Pending changes are written on pagehide and when the browser tab is hidden
 * (keepalive REST), and on unmount (closing the dialog). Timers keep running
 * while the studio tab holding this page is in the background, so a hidden
 * tab still saves.
 */
export function useAutosave<T>(
  value: T | null,
  save: (v: T) => Promise<void>,
  saveOnExit: (v: T) => void,
  alreadySaved: boolean,
) {
  const saveRef = useRef(save);
  const exitRef = useRef(saveOnExit);
  useEffect(() => { saveRef.current = save; exitRef.current = saveOnExit; });

  const [status, setStatus] = useState<SaveStatus>({ state: 'idle' });
  const [dirty, setDirty] = useState(false);

  // Made on first use, which is always in an effect or an event, never in render.
  const saverRef = useRef<Autosaver<T> | null>(null);
  const saver = useCallback(() => {
    if (!saverRef.current) {
      saverRef.current = createAutosaver<T>({
        save: (v) => saveRef.current(v),
        saveOnExit: (v) => exitRef.current(v),
        onStatus: setStatus,
        onDirty: setDirty,
      });
    }
    return saverRef.current;
  }, []);

  const last = useRef<string | null>(null);
  useEffect(() => {
    if (value === null) return;
    const k = JSON.stringify(value);
    if (last.current === null && alreadySaved) { last.current = k; return; }
    if (k === last.current) return;
    last.current = k;
    saver().set(value);
  }, [value, saver, alreadySaved]);

  useEffect(() => {
    const onHide = () => saver().flushOnExit();
    const onVis = () => { if (document.visibilityState === 'hidden') saver().flushOnExit(); };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVis);
      void saver().flush(); // closing: write what is pending (and keep retrying if it fails)
    };
  }, [saver]);

  const flush = useCallback(() => saver().flush(), [saver]);
  return { status, dirty, flush };
}
