import { createContext, useContext, useEffect } from 'react';

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
  setGuard: (message: string | null) => void;
};

export const TabContext = createContext<TabContextValue>({ active: true, setGuard: () => {} });

export function useTabActive(): boolean {
  return useContext(TabContext).active;
}

export function useTabGuard(message: string | null) {
  const { setGuard } = useContext(TabContext);
  useEffect(() => {
    setGuard(message);
    return () => setGuard(null);
  }, [message, setGuard]);
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
