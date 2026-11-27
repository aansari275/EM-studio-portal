import { useEffect, useRef, useState } from 'react';

/**
 * Click to turn a photo 90° clockwise. The turn shows at once; it saves when
 * the clicks stop, so three quick clicks are one save of 270°, not three.
 *
 * `save(url, quarterTurns)` does the real work (a Library design, or a Custom
 * Rugs / Sample Dispatch entry). A different `owner` or `url` starts from zero.
 */
export function useQuarterTurns(owner: string, url: string, save: (url: string, quarterTurns: number) => Promise<void>) {
  const [turns, setTurns] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef(0);

  // A different design or photo starts from zero.
  useEffect(() => { pending.current = 0; setTurns(0); setError(''); }, [owner, url]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function rotate() {
    if (busy || !url) return;
    setError('');
    pending.current += 1;
    setTurns(pending.current);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const n = pending.current;
      if (n % 4 === 0) { pending.current = 0; setTurns(0); return; }
      setBusy(true);
      try {
        await save(url, n);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not turn the photo.');
      } finally {
        pending.current = 0;
        setTurns(0);
        setBusy(false);
      }
    }, 900);
  }

  const style = turns
    ? { transform: `rotate(${turns * 90}deg)`, transition: 'transform 200ms ease' }
    : undefined;
  /** Turned on screen and not saved yet, or saving. */
  const pendingTurn = busy || turns !== 0;
  return { rotate, busy, error, style, pendingTurn };
}
