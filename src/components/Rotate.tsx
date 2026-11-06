import { useEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { rotatePhoto } from '../lib/productEdit';
import type { ShowroomProduct } from '../lib/firebase';

/**
 * Click to turn a photo 90° clockwise. The turn shows at once; it saves when
 * the clicks stop, so three quick clicks are one save of 270°, not three.
 */
export function useRotate(product: ShowroomProduct, url: string, onSaved: (p: ShowroomProduct) => void) {
  const [turns, setTurns] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef(0);

  // A different design or photo starts from zero.
  useEffect(() => { pending.current = 0; setTurns(0); setError(''); }, [product.id, url]);
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
        const saved = await rotatePhoto(product, url, n);
        onSaved(saved);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not turn the photo.');
      } finally {
        pending.current = 0;
        setTurns(0);
        setBusy(false);
      }
    }, 900);
  }

  // Turned sideways, a photo is scaled up so it still fills its box while it waits.
  const style = turns
    ? { transform: `rotate(${turns * 90}deg)${turns % 2 ? ' scale(1.25)' : ''}`, transition: 'transform 200ms ease' }
    : undefined;
  return { rotate, busy, error, style };
}

export function RotateButton({ onClick, busy, className = '', label = 'Turn photo 90° clockwise' }: {
  onClick: () => void; busy: boolean; className?: string; label?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={busy}
      title={busy ? 'Saving the turned photo…' : label}
      aria-label={label}
      className={className}
    >
      <RotateCw className={'h-3.5 w-3.5 ' + (busy ? 'animate-spin' : '')} />
    </button>
  );
}
