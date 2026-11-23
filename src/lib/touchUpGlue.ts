import { useCallback, useEffect, useRef, useState } from 'react';
import type { Px } from './photoEdit';
import { pixelsAt, pixelsOf } from './canvasImage';
import {
  alignment, contentMismatch, pushStroke, redoStroke, renderStrokes, stepBrush, touchSource, undoStroke,
  BRUSH_DEFAULT, EMPTY_HISTORY, MISALIGNED, MISMATCH_LIMIT,
  type History, type Stroke, type TouchMode, type TouchSource,
} from './touchUp';

/**
 * The canvas side of Touch up (decoding to pixels, the full-size render, the
 * keys), kept out of the component files. Maths in touchUp.ts.
 */

/** Long side of the picture she paints on. Strokes replay at full size on Apply. */
export const TOUCH_SIDE = 1600;

export interface TouchState { history: History; mode: TouchMode; smart: boolean; size: number }
export const INITIAL_TOUCH: TouchState = { history: EMPTY_HISTORY, mode: 'restore', smart: true, size: BRUSH_DEFAULT };

export interface Prepared {
  /** The cutout at the painting size. */
  cut: Px;
  /** The original at the same size, or null when Bring back is off. */
  orig: Px | null;
  src: TouchSource;
  /** Why Bring back is off, or null. */
  reason: string | null;
  /** The cutout's own size, for showing the brush in its pixels. */
  fullLong: number;
}

/**
 * Pixels for painting: the cutout scaled to `side`, the original drawn at the
 * same size (as `removeBackground` drew it to make the cutout) when it lines
 * up, by size (`alignment`) and by content (`contentMismatch`).
 */
export function prepareTouch(
  cutImg: ImageBitmap, origImg: ImageBitmap | null, direct: boolean, side = TOUCH_SIDE
): Prepared {
  const cut = pixelsOf(cutImg, side);
  const a = alignment(cutImg, origImg, direct);
  let orig: Px | null = null;
  let reason: string | null = a.ok ? null : a.reason;
  if (a.ok && origImg) {
    orig = pixelsAt(origImg, cut.width, cut.height);
    const m = contentMismatch(cut, orig);
    if (m !== null && m > MISMATCH_LIMIT) { orig = null; reason = MISALIGNED; }
  }
  return { cut, orig, src: touchSource(cut, orig), reason, fullLong: Math.max(cutImg.width, cutImg.height) };
}

/**
 * The strokes replayed on the cutout at its own size (2000px for a normal
 * cutout), so the result never loses resolution. `useOrig` is false when
 * Bring back was off (only erase strokes then do anything).
 */
export function renderTouchFull(cutImg: ImageBitmap, origImg: ImageBitmap | null, useOrig: boolean, strokes: Stroke[]): Px {
  const cut = pixelsOf(cutImg, Math.max(cutImg.width, cutImg.height));
  const orig = useOrig && origImg ? pixelsAt(origImg, cut.width, cut.height) : null;
  return renderStrokes(cut, touchSource(cut, orig), strokes);
}

/** Pixels back to a bitmap, keeping straight (not premultiplied) colour. */
export function bitmapOf(px: Px): Promise<ImageBitmap> {
  return createImageBitmap(new ImageData(new Uint8ClampedArray(px.data), px.width, px.height), { premultiplyAlpha: 'none' });
}

/**
 * Keys while Touch up is on screen: Ctrl/Cmd Z undo, Shift Z (or Ctrl Y)
 * redo, [ and ] brush size. Not while typing in a field.
 */
export function useTouchKeys(active: boolean, on: { undo: () => void; redo: () => void; size: (dir: 1 | -1) => void }) {
  const latest = useRef(on);
  useEffect(() => { latest.current = on; });
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range' && (t as HTMLInputElement).type !== 'checkbox' || t.tagName === 'TEXTAREA')) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) latest.current.redo(); else latest.current.undo(); }
      else if (mod && k === 'y') { e.preventDefault(); latest.current.redo(); }
      else if (!mod && e.key === '[') { e.preventDefault(); latest.current.size(-1); }
      else if (!mod && e.key === ']') { e.preventDefault(); latest.current.size(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}

/** Keys, undo list and the stroke hand-over shared by the editor and the dialog. */
export function useTouchState(active: boolean, prepared: Prepared | null) {
  const [state, setState] = useState<TouchState>(INITIAL_TOUCH);
  const reason = prepared?.reason ?? null;
  // with Bring back off, every stroke is an erase
  const mode: TouchMode = reason ? 'erase' : state.mode;
  useTouchKeys(active, {
    undo: () => setState((s) => ({ ...s, history: undoStroke(s.history) })),
    redo: () => setState((s) => ({ ...s, history: redoStroke(s.history) })),
    size: (dir) => setState((s) => ({ ...s, size: stepBrush(s.size, dir) })),
  });
  const onStroke = useCallback((st: Stroke) => setState((s) => ({ ...s, history: pushStroke(s.history, st) })), []);
  return { state, setState, mode, reason, onStroke };
}


/**
 * Is `cut` a cutout made straight from `orig` (transparent, same framing,
 * same pixels where solid)? Then the editor may sample the full-resolution
 * original under the cutout's mask. Checked on small copies, so it is quick.
 */
export async function isDirectCut(cut: File, orig: File): Promise<boolean> {
  const [c, o] = await Promise.all([createImageBitmap(cut, { premultiplyAlpha: 'none' }), createImageBitmap(orig)]);
  try {
    if (!alignment(c, o, true).ok) return false;
    const small = pixelsOf(c, 500);
    let clear = false;
    for (let i = 3; i < small.data.length; i += 4) if (small.data[i] < 255) { clear = true; break; }
    if (!clear) return false;
    const m = contentMismatch(small, pixelsAt(o, small.width, small.height), 3);
    return m !== null && m <= MISMATCH_LIMIT;
  } finally {
    c.close(); o.close();
  }
}
