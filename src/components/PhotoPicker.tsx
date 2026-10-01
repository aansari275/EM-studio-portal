import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';

/**
 * A grid of photo thumbnails with a + tile on the end.
 *
 * Files are held locally and only uploaded when the design is saved, so a
 * half-finished entry never leaves a stray folder in storage. The first tile is
 * labelled, because that one becomes the product's main photo everywhere else.
 */
export function PhotoPicker({
  files,
  onChange,
  disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const [over, setOver] = useState(false);

  useEffect(() => {
    const made = files.map((f) => URL.createObjectURL(f));
    setUrls(made);
    return () => made.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const add = (list: FileList | null) => {
    const picked = [...(list || [])].filter((f) => f.type.startsWith('image/'));
    if (picked.length) onChange([...files, ...picked]);
    if (input.current) input.current.value = '';
  };

  return (
    <div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2.5">
        {files.map((f, i) => (
          <div key={`${f.name}-${i}`} className="group relative aspect-square overflow-hidden rounded-sm bg-neutral-100">
            <img src={urls[i]} alt="" className="h-full w-full object-cover" />
            {i === 0 && (
              <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[9.5px] font-semibold uppercase tracking-wide text-white">
                Main
              </span>
            )}
            <button
              type="button"
              onClick={() => onChange(files.filter((_, j) => j !== i))}
              aria-label={`Remove photo ${i + 1}`}
              className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-white/90 text-neutral-700 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
            >
              <X className="h-3 w-3" strokeWidth={2.5} />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
          disabled={disabled}
          aria-label="Add photos"
          className={
            'flex aspect-square flex-col items-center justify-center gap-1 rounded-sm border border-dashed transition-colors ' +
            (over ? 'border-[#2F4C69] bg-[#2F4C69]/5' : 'border-neutral-300 hover:border-neutral-500')
          }
        >
          <Plus className="h-5 w-5 text-neutral-400" strokeWidth={2} />
          <span className="text-[10px] text-neutral-400">{files.length ? 'Add' : 'Photos'}</span>
        </button>
      </div>

      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} />
    </div>
  );
}
