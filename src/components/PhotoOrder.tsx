import { useEffect, useRef, useState } from 'react';
import { thumb } from '../lib/img';
import { reorderPhotos } from '../lib/productEdit';
import type { ShowroomProduct } from '../lib/firebase';

/** Main, 2nd, 3rd, 4th, 11th, 12th, 21st... */
export function ordinal(i: number): string {
  if (i === 0) return 'Main';
  const n = i + 1;
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] || 'th';
  return `${n}${suffix}`;
}

function move<T>(list: T[], from: number, to: number): T[] {
  const out = [...list];
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}

/**
 * The thumbnail strip in the design preview, with the order editable in place:
 * drag a thumbnail onto another to put it there, or right-click it and choose
 * its position. Every thumbnail shows its position (Main, 2nd, 3rd...), and
 * that is the order decks and buyer links use. Saves straight away.
 */
export function PhotoOrder({
  product, photos, shot, onShot, onSaved,
}: {
  product: ShowroomProduct;
  photos: string[];
  shot: string;
  onShot: (url: string) => void;
  onSaved?: (p: ShowroomProduct) => void;
}) {
  // Local order so a drop shows at once; the saved product replaces it after.
  const [order, setOrder] = useState(photos);
  useEffect(() => setOrder(photos), [photos.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ index: number; x: number; y: number } | null>(null);
  const [status, setStatus] = useState<'' | 'saving' | 'saved' | 'error'>('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof KeyboardEvent) e.stopPropagation();
      if (e.type === 'mousedown' && menuRef.current?.contains(e.target as Node)) return;
      setMenu(null);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close, true);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close, true);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu]);

  async function place(from: number, to: number) {
    setMenu(null);
    if (from === to) return;
    const before = order;
    const next = move(order, from, to);
    setOrder(next);
    setStatus('saving');
    try {
      const saved = await reorderPhotos(product, next);
      setStatus('saved');
      onSaved?.(saved);
      setTimeout(() => setStatus((s) => (s === 'saved' ? '' : s)), 2000);
    } catch {
      setOrder(before);
      setStatus('error');
    }
  }

  return (
    <>
      {order.map((g, i) => (
        <button
          key={g}
          draggable
          onClick={() => onShot(g)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ index: i, x: e.clientX, y: e.clientY });
          }}
          onDragStart={(e) => { setDragFrom(i); e.dataTransfer.effectAllowed = 'move'; }}
          onDragOver={(e) => { if (dragFrom !== null) { e.preventDefault(); setDragOver(i); } }}
          onDragLeave={() => setDragOver((o) => (o === i ? null : o))}
          onDrop={(e) => { e.preventDefault(); if (dragFrom !== null) place(dragFrom, i); setDragFrom(null); setDragOver(null); }}
          onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
          title={`${ordinal(i)} photo. Drag to reorder, or right-click to choose its place.`}
          aria-label={`${ordinal(i)} photo`}
          className={
            'relative h-14 w-14 shrink-0 cursor-grab overflow-hidden rounded-sm active:cursor-grabbing ' +
            (dragOver === i && dragFrom !== i
              ? 'shadow-[0_0_0_2px_#98671A]'
              : g === shot ? 'shadow-[0_0_0_2px_#2F4C69]' : 'shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)]') +
            (dragFrom === i ? ' opacity-40' : '')
          }
        >
          <img src={thumb(g, 120)} alt="" draggable={false} className="h-full w-full object-cover" />
          <span className={
            'absolute inset-x-0 bottom-0 text-center text-[8px] font-semibold uppercase tracking-wide text-white ' +
            (i === 0 ? 'bg-[#2F4C69]/90' : 'bg-black/55')
          }>
            {ordinal(i)}
          </span>
        </button>
      ))}

      {status && (
        <span className={'text-[11px] ' + (status === 'error' ? 'text-red-600' : 'text-neutral-400')} role="status">
          {status === 'saving' ? 'Saving order…' : status === 'saved' ? 'Order saved' : 'Could not save the order'}
        </span>
      )}

      {menu && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Photo position"
          style={{ left: Math.min(menu.x, window.innerWidth - 190), top: Math.min(menu.y, window.innerHeight - 40 - order.length * 32) }}
          className="fixed z-[60] max-h-[70vh] w-44 overflow-y-auto rounded-md border border-neutral-200 bg-white py-1 shadow-lg"
        >
          <div className="px-3 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-neutral-400">
            Now {ordinal(menu.index).toLowerCase()}
          </div>
          {order.map((_, to) => (
            <button
              key={to}
              role="menuitem"
              disabled={to === menu.index}
              onClick={() => place(menu.index, to)}
              className="block w-full px-3 py-1.5 text-left text-[13px] text-neutral-800 hover:bg-neutral-100 disabled:text-neutral-300 disabled:hover:bg-transparent"
            >
              {to === 0 ? 'Make main photo' : `Make ${ordinal(to)}`}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
