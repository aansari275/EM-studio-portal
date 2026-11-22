import { useEffect, useRef } from 'react';

/**
 * An in-page confirm, in place of window.confirm. Escape and the first button
 * cancel. It sits above every dialog (z 80), and takes Escape before any
 * dialog under it does.
 */
export function ConfirmDialog({ title, message, confirmLabel, cancelLabel = 'Cancel', danger, onConfirm, onCancel }: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    cancel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onCancel(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); back?.focus?.(); };
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" role="alertdialog"
      aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text"
      onClick={(e) => { e.stopPropagation(); onCancel(); }}>
      <div className="w-full max-w-sm rounded-md bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-title" className="font-serif text-[19px]">{title}</h2>
        <p id="confirm-text" className="mt-2 text-[13.5px] text-neutral-600">{message}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button ref={cancel} type="button" onClick={onCancel}
            className="rounded-sm border border-neutral-300 px-3 py-1.5 text-[13px] hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2F4C69]">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm}
            className={'rounded-sm px-3 py-1.5 text-[13px] font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F4C69] ' +
              (danger ? 'bg-red-700 hover:bg-red-800' : 'bg-[#2F4C69] hover:bg-[#243b52]')}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
