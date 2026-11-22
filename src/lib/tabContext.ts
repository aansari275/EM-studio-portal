import { createContext, useContext, useEffect, useId } from 'react';

/**
 * Each page opened in the studio shell lives in its own tab and stays mounted
 * while hidden. A page reads `useTabActive()` to keep window key handlers quiet
 * while its tab is in the background, and calls `useTabGuard(message)` to ask
 * the shell to confirm before its tab is closed (message null = nothing to lose).
 *
 * Outside the shell (legacy pages) the defaults apply: always active, no guard.
 */
export type TabContextValue = {
  active: boolean;
  /** Several parts of a page can guard at once (the page and its dialog), each under its own id. */
  setGuard: (id: string, message: string | null) => void;
};

export const TabContext = createContext<TabContextValue>({ active: true, setGuard: () => {} });

export function useTabActive(): boolean {
  return useContext(TabContext).active;
}

export function useTabGuard(message: string | null) {
  const { setGuard } = useContext(TabContext);
  const id = useId();
  useEffect(() => {
    setGuard(id, message);
    return () => setGuard(id, null);
  }, [id, message, setGuard]);
}

// beforeunload: one listener for the whole app, warning while anything registered is unsaved.
const unsaved = new Map<string, string>();
let listening = false;
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!unsaved.size) return;
  e.preventDefault();
  e.returnValue = ''; // older browsers need it set to show the prompt
}

/**
 * Work that is not in the cloud yet (an autosave waiting or failing, photos
 * still uploading): closing the tab asks first, and so does closing the page
 * in the browser (beforeunload).
 */
export function useUnsavedWork(message: string | null) {
  useTabGuard(message);
  const id = useId();
  useEffect(() => {
    if (!message) return;
    unsaved.set(id, message);
    if (!listening) { window.addEventListener('beforeunload', onBeforeUnload); listening = true; }
    return () => { unsaved.delete(id); };
  }, [id, message]);
}

export type TabKey = 'library' | 'custom-rugs' | 'sample-dispatch' | 'background-removal' | 'links' | 'more';

export const TAB_PATHS: Record<TabKey, string> = {
  library: '/',
  'custom-rugs': '/custom-rugs',
  'sample-dispatch': '/sample-dispatch',
  'background-removal': '/background-removal',
  links: '/links',
  more: '/more',
};

/** The shell tab a pathname belongs to, or null for routes outside the shell. */
export function tabForPath(pathname: string): TabKey | null {
  const p = pathname.replace(/\/+$/, '') || '/';
  return (Object.keys(TAB_PATHS) as TabKey[]).find((k) => TAB_PATHS[k] === p) ?? null;
}
