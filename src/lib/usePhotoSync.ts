import { useEffect, useMemo } from 'react';
import { isReadySlot, limiter, type RemoteFile, type Slot, type SlotUpdate } from './photoSlots';

/**
 * Uploads tiles in the background as soon as they are ready, and again after
 * any change of file (cutout, edit, undo). Each tile carries its own state:
 * `syncing`, `syncError` (cleared by Retry), or in the cloud (`remoteFor`
 * is its file). Pass `upload: null` to switch it off.
 */
export function usePhotoSync(slots: Slot[], update: SlotUpdate, upload: ((f: File) => Promise<RemoteFile>) | null) {
  const run = useMemo(() => limiter(3), []);
  useEffect(() => {
    if (!upload) return;
    for (const s of slots) {
      if (!isReadySlot(s) || s.working || s.syncing || s.syncError) continue;
      const needMain = s.remoteFor !== s.file;
      const needOrig = !!s.original && s.remoteOriginalFor !== s.original;
      if (!needMain && !needOrig) continue;
      const { id, file, original } = s;
      update((cur) => cur.map((x) => (x.id === id ? { ...x, syncing: true } : x)));
      void (async () => {
        try {
          const [main, orig] = await Promise.all([
            needMain ? run(() => upload(file)) : Promise.resolve(null),
            needOrig ? run(() => upload(original!)) : Promise.resolve(null),
          ]);
          update((cur) => cur.map((x) => (x.id !== id ? x : {
            ...x, syncing: false,
            // a file changed while it was uploading is uploaded again on the next pass
            ...(main && x.file === file ? { remote: main, remoteFor: file } : {}),
            ...(orig && x.original === original ? { remoteOriginal: orig, remoteOriginalFor: original } : {}),
          })));
        } catch (e) {
          update((cur) => cur.map((x) => (x.id !== id ? x
            : { ...x, syncing: false, syncError: e instanceof Error ? e.message : 'Upload failed' })));
        }
      })();
    }
  }, [slots, update, upload, run]);
}
