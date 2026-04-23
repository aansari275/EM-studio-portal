import { Camera, Image, CheckCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import type { KapettoKit } from '../lib/firebase';

interface KapettoKitsListProps {
  kits: KapettoKit[];
  onSelect: (kit: KapettoKit) => void;
}

// Human-readable stage labels and colours
const STAGE_CONFIG: Record<string, { label: string; dot: string; header: string; border: string; badge: string }> = {
  sample_requested:   { label: 'Sample Requested',    dot: 'bg-amber-400',  header: 'text-amber-600',  border: 'border-amber-200 hover:border-amber-300',  badge: 'bg-amber-100 text-amber-700' },
  sample_sent:        { label: 'Sample Sent',          dot: 'bg-green-400',  header: 'text-green-600',  border: 'border-green-200 hover:border-green-300',   badge: 'bg-green-100 text-green-700' },
  follow_up:          { label: 'Follow Up',            dot: 'bg-blue-400',   header: 'text-blue-600',   border: 'border-blue-200 hover:border-blue-300',     badge: 'bg-blue-100 text-blue-700' },
  contacted:          { label: 'Contacted',            dot: 'bg-sky-400',    header: 'text-sky-600',    border: 'border-sky-200 hover:border-sky-300',       badge: 'bg-sky-100 text-sky-700' },
  won:                { label: 'Won',                  dot: 'bg-emerald-500',header: 'text-emerald-700',border: 'border-emerald-200 hover:border-emerald-300',badge: 'bg-emerald-100 text-emerald-700' },
  delivered_no_reply: { label: 'Delivered – No Reply', dot: 'bg-orange-400', header: 'text-orange-600', border: 'border-orange-200 hover:border-orange-300', badge: 'bg-orange-100 text-orange-700' },
  sample_resend:      { label: 'Sample Resend',        dot: 'bg-pink-400',   header: 'text-pink-600',   border: 'border-pink-200 hover:border-pink-300',     badge: 'bg-pink-100 text-pink-700' },
  not_interested:     { label: 'Not Interested',       dot: 'bg-gray-400',   header: 'text-gray-500',   border: 'border-gray-200 hover:border-gray-300',     badge: 'bg-gray-100 text-gray-500' },
  no_show:            { label: 'No Show',              dot: 'bg-gray-300',   header: 'text-gray-400',   border: 'border-gray-100 hover:border-gray-200',     badge: 'bg-gray-50 text-gray-400' },
};

const DEFAULT_STAGE = { label: 'Other', dot: 'bg-gray-300', header: 'text-gray-500', border: 'border-gray-200 hover:border-gray-300', badge: 'bg-gray-100 text-gray-500' };

// Stages to hide entirely from the Kits tab
const HIDDEN_STAGES = new Set(['contacted']);

// Preferred column order
const STAGE_ORDER = [
  'sample_requested',
  'sample_sent',
  'follow_up',
  'won',
  'delivered_no_reply',
  'sample_resend',
  'not_interested',
  'no_show',
];

export function KapettoKitsList({ kits, onSelect }: KapettoKitsListProps) {
  if (!kits.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">No kits yet</h3>
        <p className="text-sm text-gray-500">No pipeline leads found</p>
      </div>
    );
  }

  // Group by stage, skipping hidden stages
  const grouped: Record<string, KapettoKit[]> = {};
  for (const kit of kits) {
    const s = kit.stage || 'other';
    if (HIDDEN_STAGES.has(s)) continue;
    if (!grouped[s]) grouped[s] = [];
    grouped[s].push(kit);
  }

  // Build ordered stage list: known stages first (in order), then anything else
  const orderedStages = [
    ...STAGE_ORDER.filter(s => grouped[s]?.length),
    ...Object.keys(grouped).filter(s => !STAGE_ORDER.includes(s) && grouped[s]?.length),
  ];

  return (
    <div className="space-y-8">
      {orderedStages.map(stage => {
        const cfg = STAGE_CONFIG[stage] || { ...DEFAULT_STAGE, label: stage };
        const stageKits = grouped[stage];
        return (
          <div key={stage}>
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className={cn('w-2 h-2 rounded-full', cfg.dot)} />
              <h2 className={cn('text-sm font-medium uppercase tracking-wide', cfg.header)}>
                {cfg.label}
              </h2>
              <span className={cn('px-1.5 py-0.5 rounded-full text-xs font-bold', cfg.badge)}>
                {stageKits.length}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {stageKits.map(kit => (
                <KitCard key={kit.id} kit={kit} onSelect={onSelect} stageCfg={cfg} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KitCard({
  kit,
  onSelect,
  stageCfg,
}: {
  kit: KapettoKit;
  onSelect: (kit: KapettoKit) => void;
  stageCfg: typeof DEFAULT_STAGE;
}) {
  const photoCount = kit.kitPhotos?.length || 0;

  return (
    <div
      onClick={() => onSelect(kit)}
      className={cn(
        'bg-white rounded-xl p-4 hover:shadow-lg transition-all cursor-pointer border',
        stageCfg.border
      )}
    >
      <div className="flex items-start justify-between mb-1">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900 truncate">{kit.name || 'Unknown'}</h3>
          <p className="text-sm text-gray-500 truncate">{kit.company || 'No company'}</p>
        </div>
        {kit.segment && (
          <span className={cn(
            'px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ml-2',
            kit.segment === 'residential' ? 'bg-blue-50 text-blue-600' :
            kit.segment === 'commercial' ? 'bg-purple-50 text-purple-600' :
            'bg-gray-100 text-gray-600'
          )}>
            {kit.segment}
          </span>
        )}
      </div>

      {/* KD Code badge */}
      {kit.designerCode && (
        <div className="mb-2">
          <span className="inline-block px-2 py-0.5 bg-gray-900 text-white rounded text-xs font-mono font-semibold">
            {kit.designerCode}
          </span>
        </div>
      )}

      <div className="flex items-center justify-end">
        {photoCount > 0 ? (
          <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium flex items-center gap-1">
            <Image className="w-3 h-3" />
            {photoCount} photo{photoCount !== 1 ? 's' : ''}
          </span>
        ) : (
          <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium flex items-center gap-1">
            <Camera className="w-3 h-3" />
            No photos
          </span>
        )}
      </div>
    </div>
  );
}
