import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import type { ShowroomProduct } from '../lib/firebase';

/**
 * Tearsheet in the Library preview: a one page A4 PDF of this product.
 * The builder and jsPDF load on the first click, never with the page.
 */
export function TearsheetButton({ product }: { product: ShowroomProduct }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const make = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { buildTearsheet, downloadBlob } = await import('../lib/tearsheet');
      const sheet = await buildTearsheet(product);
      downloadBlob(sheet.blob, sheet.fileName);
    } catch (e) {
      console.error('Tearsheet failed', e);
      setError('Could not make the tearsheet. Check the connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={make}
        disabled={busy}
        aria-busy={busy}
        title="Download a one page PDF of this design"
        className="flex min-h-[44px] items-center gap-1.5 rounded-sm border border-neutral-200 px-[18px] py-2.5 text-[13px] font-semibold hover:border-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F4C69] disabled:cursor-wait disabled:opacity-70"
      >
        {busy
          ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          : <FileText className="h-3.5 w-3.5" aria-hidden />}
        {busy ? 'Making tearsheet' : 'Tearsheet'}
      </button>
      <span role="status" aria-live="polite" className="sr-only">{busy ? 'Making tearsheet' : ''}</span>
      {error && <p role="alert" className="w-full text-[12.5px] text-red-600">{error}</p>}
    </>
  );
}
