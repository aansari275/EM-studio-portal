import { useEffect } from 'react';
import type { ShowroomProduct } from './firebase';
import type { Slot } from './photoSlots';
import type { EntryKind, StudioEntry } from './studioEntries';

/**
 * Send to: photos handed from Background Removal to another tab, in memory,
 * with no download and re-upload by hand.
 *
 * The sender prepares what the destination needs (for entries the photos are
 * already uploaded into the entry's own folder, so the tiles arrive in the
 * cloud), puts a delivery here and opens the destination tab. The
 * destination page takes its deliveries when it mounts and whenever a new one
 * arrives, so it works whether the tab was already open or not.
 */

export type Destination = EntryKind | 'library';

export const DESTINATION_LABEL: Record<Destination, string> = {
  'custom-rug': 'Custom Rugs',
  'sample-dispatch': 'Sample Dispatch',
  library: 'Library',
};

export const DESTINATION_PATH: Record<Destination, string> = {
  'custom-rug': '/custom-rugs',
  'sample-dispatch': '/sample-dispatch',
  library: '/',
};

export type EntryDelivery = {
  id: string;
  to: EntryKind;
  /** The entry the photos are for. For a new entry, the id it will be created under. */
  entryId: string;
  isNew: boolean;
  /** Tiles that are already uploaded into the entry's folder. */
  slots: Slot[];
};

export type LibraryDelivery =
  | {
      id: string;
      to: 'library';
      action: 'new';
      /** Tiles for the New design form; uploaded by the form on Create, as usual. */
      slots: Slot[];
      onCreated: (p: ShowroomProduct) => void;
      onCancel: () => void;
    }
  | { id: string; to: 'library'; action: 'open'; product: ShowroomProduct };

export type Delivery = EntryDelivery | LibraryDelivery;

let queue: Delivery[] = [];
const listeners = new Set<() => void>();
let seq = 0;

export const deliveryId = () => `d${Date.now().toString(36)}${(seq++).toString(36)}`;

export function deliver(d: Delivery): void {
  queue = [...queue, d];
  listeners.forEach((l) => l());
}

/** Takes (and removes) every delivery waiting for `to`. */
export function takeDeliveries(to: Destination): Delivery[] {
  const mine = queue.filter((d) => d.to === to);
  if (mine.length) queue = queue.filter((d) => d.to !== to);
  return mine;
}

/** For tests. */
export function clearDeliveries(): void {
  queue = [];
}

/**
 * Calls `handle` for every delivery to `to`: those already waiting when the
 * page mounts, then each new one. `handle` should be stable (useCallback).
 */
export function useDeliveries(to: Destination, handle: (d: Delivery) => void): void {
  useEffect(() => {
    const drain = () => takeDeliveries(to).forEach(handle);
    listeners.add(drain);
    // let the page finish mounting before the first delivery opens a dialog
    const t = setTimeout(drain, 0);
    return () => { listeners.delete(drain); clearTimeout(t); };
  }, [to, handle]);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sent to Custom Rugs, ABC ITALIA AMINI, 22 Nov", shown on a tile that was sent. */
export function sentNote(to: Destination, what: string, when: Date = new Date()): string {
  const day = `${when.getDate()} ${MONTHS[when.getMonth()]}`;
  return [`Sent to ${DESTINATION_LABEL[to]}`, what.trim(), day].filter(Boolean).join(', ');
}

/** What she picked in the Send to dialog. */
export type SendTarget =
  | { to: EntryKind; entry: StudioEntry | null }
  | { to: 'library'; product: ShowroomProduct | null };
