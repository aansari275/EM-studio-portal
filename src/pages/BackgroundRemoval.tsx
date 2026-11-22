import { useState } from 'react';
import { Download, ImagePlus } from 'lucide-react';
import { PhotoPicker, type Slot } from '../components/PhotoPicker';
import { saveBlob, saveZip, today } from '../lib/download';
import { useTabGuard } from '../lib/tabContext';

/**
 * Background removal on its own page, for photos that are not going into the
 * library. Drop photos, remove backgrounds, edit, download. Nothing is saved
 * to Firestore or Storage: everything stays in this browser tab.
 */
export function BackgroundRemoval() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [zipping, setZipping] = useState(false);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const busy = slots.some((s) => s.working);
  useTabGuard(slots.length
    ? `The ${slots.length === 1 ? 'photo' : `${slots.length} photos`} on this page will be lost unless you download ${slots.length === 1 ? 'it' : 'them'} first.`
    : null);

  const add = (list: FileList | null) => {
    const picked = [...(list || [])].filter((f) => f.type.startsWith('image/'));
    if (picked.length) setSlots((cur) => [...cur, ...picked.map((file) => ({ file }))]);
  };

  async function downloadAll() {
    setZipping(true);
    setError('');
    try {
      await saveZip(slots.map((s) => ({ name: s.file.name, blob: s.file })), `photos-${today()}.zip`);
    } catch {
      setError('Could not make the zip. Try downloading the photos one at a time.');
    } finally {
      setZipping(false);
    }
  }

  return (
    <div className="min-h-full bg-white text-neutral-900">
      <main className="mx-auto w-full max-w-[1100px] px-4 pb-16 sm:px-7">
        <h1 className="mt-8 font-serif text-[26px] font-normal">Background Removal</h1>
        <p className="mt-1.5 max-w-[620px] text-[13.5px] text-neutral-500">
          Drop photos here, remove their backgrounds, then click a photo to fix skew, straighten,
          crop or adjust the tone. Download them one by one or all together. Photos are not saved
          to the portal, so download them before you leave this page.
        </p>

        {slots.length === 0 ? (
          <label
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
            className={
              'mt-7 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed px-6 py-16 text-center transition-colors ' +
              (over ? 'border-[#2F4C69] bg-[#2F4C69]/5' : 'border-neutral-300 hover:border-neutral-500')
            }>
            <ImagePlus className="h-7 w-7 text-neutral-400" strokeWidth={1.5} />
            <span className="text-[14px] font-semibold">Drop photos here, or click to choose</span>
            <span className="text-[12.5px] text-neutral-400">Runs on this computer. Nothing is sent anywhere.</span>
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => add(e.target.files)} />
          </label>
        ) : (
          <div className="mt-7">
            <PhotoPicker slots={slots} onChange={setSlots} noMain
              onDownload={(i) => saveBlob(slots[i].file, slots[i].file.name)} />
          </div>
        )}

        {slots.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-neutral-100 pt-5">
            <button type="button" onClick={downloadAll} disabled={zipping || busy}
              className="flex items-center gap-2 rounded-sm bg-[#2F4C69] px-[18px] py-2.5 text-[13px] font-semibold text-white disabled:opacity-60">
              <Download className="h-4 w-4" strokeWidth={2} />
              {zipping ? 'Making the zip…' : `Download all (${slots.length})`}
            </button>
            <button type="button" disabled={busy}
              onClick={() => window.confirm('Clear all photos from this page? Anything not downloaded is lost.') && setSlots([])}
              className="text-[13px] text-neutral-500 hover:text-neutral-900 disabled:opacity-50">
              Clear all
            </button>
            {error && <span role="alert" className="text-[12.5px] text-red-600">{error}</span>}
          </div>
        )}
      </main>
    </div>
  );
}
