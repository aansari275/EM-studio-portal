import { useEffect, useState } from 'react';
import { SLOW_MS } from './jobStatus';

/** True once `active` has stayed on for 20 s, for a "Still working" line next to a button. */
export function useSlow(active: boolean): boolean {
  // the run that went slow, so a new run starts fresh without a reset in the effect
  const [slowRun, setSlowRun] = useState(0);
  const [run, setRun] = useState(active ? 1 : 0);
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (active) setRun((r) => r + 1);
  }
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setSlowRun(run), SLOW_MS);
    return () => clearTimeout(t);
  }, [active, run]);
  return active && slowRun === run && run > 0;
}
