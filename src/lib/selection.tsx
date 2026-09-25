import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ShowroomProduct } from './firebase';

/**
 * The selection tray.
 *
 * Selection lives above any single page so one set of rugs can become a PPT
 * today and a shareable link tomorrow. It survives a refresh via sessionStorage
 * so a half-built catalog is not lost by a stray reload.
 */

const KEY = 'studio.tray.v1';

type Ctx = {
  items: ShowroomProduct[];
  ids: Set<string>;
  has: (id: string) => boolean;
  toggle: (p: ShowroomProduct) => void;
  remove: (id: string) => void;
  clear: () => void;
  count: number;
};

const SelectionContext = createContext<Ctx | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ShowroomProduct[]>(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as ShowroomProduct[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* private mode, or over quota: the tray still works for this page view */
    }
  }, [items]);

  const value = useMemo<Ctx>(() => {
    const ids = new Set(items.map((p) => p.id));
    return {
      items,
      ids,
      count: items.length,
      has: (id) => ids.has(id),
      toggle: (p) =>
        setItems((cur) => (cur.some((x) => x.id === p.id) ? cur.filter((x) => x.id !== p.id) : [...cur, p])),
      remove: (id) => setItems((cur) => cur.filter((x) => x.id !== id)),
      clear: () => setItems([]),
    };
  }, [items]);

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useSelection must be used inside SelectionProvider');
  return ctx;
}
