import { Camera, Image, CheckCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import type { KapettoKit } from '../lib/firebase';

interface KapettoKitsListProps {
  kits: KapettoKit[];
  onSelect: (kit: KapettoKit) => void;
}

export function KapettoKitsList({ kits, onSelect }: KapettoKitsListProps) {
  if (!kits.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">No kits yet</h3>
        <p className="text-sm text-gray-500">No sample kits in the pipeline</p>
      </div>
    );
  }

  const requested = kits.filter(k => k.stage === 'sample_requested');
  const sent = kits.filter(k => k.stage === 'sample_sent');

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Left column: Sample Requested */}
      <div>
        <div className="flex items-center gap-2 mb-3 px-1">
          <div className="w-2 h-2 rounded-full bg-amber-400" />
          <h2 className="text-sm font-medium text-amber-600 uppercase tracking-wide">
            Sample Requested
          </h2>
          <span className="px-1.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
            {requested.length}
          </span>
        </div>
        <div className="space-y-3">
          {requested.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-amber-200 p-6 text-center">
              <p className="text-sm text-gray-400">None pending</p>
            </div>
          ) : (
            requested.map((kit) => (
              <KitCard key={kit.id} kit={kit} onSelect={onSelect} />
            ))
          )}
        </div>
      </div>

      {/* Right column: Sample Sent */}
      <div>
        <div className="flex items-center gap-2 mb-3 px-1">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <h2 className="text-sm font-medium text-green-600 uppercase tracking-wide">
            Sample Sent
          </h2>
          <span className="px-1.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">
            {sent.length}
          </span>
        </div>
        <div className="space-y-3">
          {sent.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-green-200 p-6 text-center">
              <p className="text-sm text-gray-400">None sent</p>
            </div>
          ) : (
            sent.map((kit) => (
              <KitCard key={kit.id} kit={kit} onSelect={onSelect} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function KitCard({ kit, onSelect }: { kit: KapettoKit; onSelect: (kit: KapettoKit) => void }) {
  const photoCount = kit.kitPhotos?.length || 0;
  const isRequested = kit.stage === 'sample_requested';

  return (
    <div
      onClick={() => onSelect(kit)}
      className={cn(
        'bg-white rounded-xl p-4 hover:shadow-lg transition-all cursor-pointer',
        isRequested
          ? 'border-2 border-amber-200 hover:border-amber-300'
          : 'border border-gray-200 hover:border-green-300'
      )}
    >
      <div className="flex items-start justify-between mb-2">
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
