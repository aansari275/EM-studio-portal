import { saveLabel, type SaveStatus as Status } from '../lib/autosave';

/** "Saving", "Saved 12:04", "Could not save. Retrying", plus photos still uploading. Announced politely. */
export function SaveStatus({ status, uploading = 0, failed = 0, className = '' }: {
  status: Status; uploading?: number; failed?: number; className?: string;
}) {
  const parts = [
    uploading ? `Uploading ${uploading} photo${uploading > 1 ? 's' : ''}` : '',
    failed ? `${failed} upload${failed > 1 ? 's' : ''} failed` : '',
    saveLabel(status),
  ].filter(Boolean);
  const bad = status.state === 'error' || failed > 0;
  return (
    <span aria-live="polite" role="status"
      className={'text-[12px] ' + (bad ? 'text-red-700' : 'text-neutral-400') + ' ' + className}>
      {parts.join('. ')}
    </span>
  );
}
