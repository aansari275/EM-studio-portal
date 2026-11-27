import { RotateCw } from 'lucide-react';
import { rotatePhoto } from '../lib/productEdit';
import type { ShowroomProduct } from '../lib/firebase';
import { useQuarterTurns } from '../lib/useQuarterTurns';

/** The Library: turn a photo of a design and save the design. */
export function useRotate(product: ShowroomProduct, url: string, onSaved: (p: ShowroomProduct) => void) {
  return useQuarterTurns(product.id, url, async (u, n) => onSaved(await rotatePhoto(product, u, n)));
}

export function RotateButton({ onClick, busy, disabled = false, className = '', label = 'Turn photo 90° clockwise' }: {
  onClick: () => void; busy: boolean; disabled?: boolean; className?: string; label?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={busy || disabled}
      title={busy ? 'Saving the turned photo…' : label}
      aria-label={label}
      aria-busy={busy || undefined}
      className={className}
    >
      <RotateCw className={'h-3.5 w-3.5 ' + (busy ? 'animate-spin' : '')} />
    </button>
  );
}
