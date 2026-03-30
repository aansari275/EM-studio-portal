import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Camera, Package, Truck, RefreshCw, Image, CheckCircle, Grid3X3, Gift } from 'lucide-react';
import { getPendingDispatches, getPendingSampleBazar, getShowroomProductsGrouped, getKapettoKits } from '../lib/firebase';
import type { KapettoKit } from '../lib/firebase';
import { cn, formatDate } from '../lib/utils';
import { KapettoKitsList } from '../components/KapettoKitsList';
import { KapettoKitUpload } from '../components/KapettoKitUpload';

type Tab = 'dispatches' | 'sample-bazar' | 'rug-gallery' | 'kapetto-kits';

export function StudioDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('dispatches');

  const { data: dispatches, isLoading: loadingDispatches, refetch: refetchDispatches } = useQuery({
    queryKey: ['pending-dispatches'],
    queryFn: getPendingDispatches,
    refetchInterval: 30000,
  });

  const { data: sampleBazar, isLoading: loadingSampleBazar, refetch: refetchSampleBazar } = useQuery({
    queryKey: ['pending-sample-bazar'],
    queryFn: getPendingSampleBazar,
    refetchInterval: 30000,
  });

  const { data: showroomProducts, isLoading: loadingShowroom } = useQuery({
    queryKey: ['showroom-products-grouped'],
    queryFn: getShowroomProductsGrouped,
    refetchInterval: 60000,
  });

  const { data: kapettoKits, isLoading: loadingKapettoKits, refetch: refetchKapettoKits } = useQuery({
    queryKey: ['kapetto-kits'],
    queryFn: getKapettoKits,
    refetchInterval: 30000,
  });

  const [selectedKit, setSelectedKit] = useState<KapettoKit | null>(null);

  const isLoading = activeTab === 'dispatches'
    ? loadingDispatches
    : activeTab === 'sample-bazar'
      ? loadingSampleBazar
      : activeTab === 'kapetto-kits'
        ? loadingKapettoKits
        : loadingShowroom;

  const handleRefresh = () => {
    if (activeTab === 'dispatches') {
      refetchDispatches();
    } else if (activeTab === 'sample-bazar') {
      refetchSampleBazar();
    } else if (activeTab === 'kapetto-kits') {
      refetchKapettoKits();
    }
    // Rug gallery navigates to its own page, no need to refresh here
  };

  const pendingDispatchCount = dispatches?.filter(d => !d.hasStudioPhotos).length || 0;
  const pendingSampleBazarCount = sampleBazar?.filter(s => !s.hasPhotos).length || 0;
  const showroomCount = showroomProducts?.length || 0;
  const kapettoKitsCount = kapettoKits?.length || 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
                <Camera className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Studio Portal</h1>
                <p className="text-sm text-gray-500">Eastern Mills Photography</p>
              </div>
            </div>
            <button
              onClick={handleRefresh}
              className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center hover:bg-gray-200 transition-colors"
            >
              <RefreshCw className={cn('w-5 h-5 text-gray-600', isLoading && 'animate-spin')} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('dispatches')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-3 rounded-lg font-medium transition-colors text-sm',
                activeTab === 'dispatches'
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              <Truck className="w-4 h-4" />
              <span className="hidden sm:inline">Dispatches</span>
              <span className="sm:hidden">Dispatch</span>
              {pendingDispatchCount > 0 && (
                <span className={cn(
                  'px-1.5 py-0.5 rounded-full text-xs font-bold',
                  activeTab === 'dispatches' ? 'bg-white/20' : 'bg-amber-100 text-amber-700'
                )}>
                  {pendingDispatchCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('sample-bazar')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-3 rounded-lg font-medium transition-colors text-sm',
                activeTab === 'sample-bazar'
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              <Package className="w-4 h-4" />
              <span className="hidden sm:inline">Sample Bazar</span>
              <span className="sm:hidden">Bazar</span>
              {pendingSampleBazarCount > 0 && (
                <span className={cn(
                  'px-1.5 py-0.5 rounded-full text-xs font-bold',
                  activeTab === 'sample-bazar' ? 'bg-white/20' : 'bg-amber-100 text-amber-700'
                )}>
                  {pendingSampleBazarCount}
                </span>
              )}
            </button>
            <button
              onClick={() => navigate('/rug-gallery')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-3 rounded-lg font-medium transition-colors text-sm',
                'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              <Grid3X3 className="w-4 h-4" />
              <span className="hidden sm:inline">Rug Gallery</span>
              <span className="sm:hidden">Gallery</span>
              {showroomCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                  {showroomCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('kapetto-kits')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-3 rounded-lg font-medium transition-colors text-sm',
                activeTab === 'kapetto-kits'
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              <Gift className="w-4 h-4" />
              <span className="hidden sm:inline">Kapetto Kits</span>
              <span className="sm:hidden">Kits</span>
              {kapettoKitsCount > 0 && (
                <span className={cn(
                  'px-1.5 py-0.5 rounded-full text-xs font-bold',
                  activeTab === 'kapetto-kits' ? 'bg-white/20' : 'bg-violet-100 text-violet-700'
                )}>
                  {kapettoKitsCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className={cn('mx-auto px-4 py-6', activeTab === 'kapetto-kits' ? 'max-w-4xl' : 'max-w-2xl')}>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mb-3" />
            <p className="text-sm text-gray-500">Loading...</p>
          </div>
        ) : activeTab === 'dispatches' ? (
          <DispatchesList
            dispatches={dispatches || []}
            onSelect={(id) => navigate(`/upload/dispatch/${id}`)}
          />
        ) : activeTab === 'sample-bazar' ? (
          <SampleBazarList
            items={sampleBazar || []}
            onSelect={(id) => navigate(`/upload/sample-bazar/${id}`)}
          />
        ) : activeTab === 'kapetto-kits' ? (
          <KapettoKitsList
            kits={kapettoKits || []}
            onSelect={(kit) => setSelectedKit(kit)}
          />
        ) : null}
      </main>

      {/* Kapetto Kit Upload Modal */}
      {selectedKit && (
        <KapettoKitUpload
          kit={selectedKit}
          onClose={() => setSelectedKit(null)}
        />
      )}
    </div>
  );
}

// Dispatches List Component
function DispatchesList({
  dispatches,
  onSelect
}: {
  dispatches: Array<{
    id: string;
    buyerName: string;
    buyerCode: string;
    dispatchDate: string;
    products: Array<{ carpetNo: string; emDesignName: string }>;
    hasStudioPhotos: boolean;
    studioPhotoCount: number;
  }>;
  onSelect: (id: string) => void;
}) {
  if (!dispatches.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle className="w-8 h-8 text-green-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">All caught up!</h3>
        <p className="text-sm text-gray-500">No dispatches waiting for photos</p>
      </div>
    );
  }

  const pending = dispatches.filter(d => !d.hasStudioPhotos);
  const completed = dispatches.filter(d => d.hasStudioPhotos);

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-amber-600 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Camera className="w-4 h-4" />
            Needs Photos ({pending.length})
          </h2>
          <div className="space-y-3">
            {pending.map((dispatch) => (
              <div
                key={dispatch.id}
                onClick={() => onSelect(dispatch.id)}
                className="bg-white rounded-xl border-2 border-amber-200 p-4 hover:shadow-lg hover:border-amber-300 transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">{dispatch.buyerName}</h3>
                    <p className="text-sm text-gray-500">{dispatch.buyerCode}</p>
                  </div>
                  <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                    Pending
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>{dispatch.products.length} product{dispatch.products.length !== 1 ? 's' : ''}</span>
                  <span>{formatDate(dispatch.dispatchDate)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-green-600 uppercase tracking-wide mb-3 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Completed ({completed.length})
          </h2>
          <div className="space-y-3">
            {completed.map((dispatch) => (
              <div
                key={dispatch.id}
                onClick={() => onSelect(dispatch.id)}
                className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-all cursor-pointer opacity-75"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">{dispatch.buyerName}</h3>
                    <p className="text-sm text-gray-500">{dispatch.buyerCode}</p>
                  </div>
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium flex items-center gap-1">
                    <Image className="w-3 h-3" />
                    {dispatch.studioPhotoCount}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>{dispatch.products.length} product{dispatch.products.length !== 1 ? 's' : ''}</span>
                  <span>{formatDate(dispatch.dispatchDate)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Sample Bazar List Component
function SampleBazarList({
  items,
  onSelect
}: {
  items: Array<{
    id: string;
    carpetNo: string;
    emDesignName: string;
    quality: string;
    createdAt: string;
    hasPhotos: boolean;
    photoCount: number;
  }>;
  onSelect: (id: string) => void;
}) {
  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle className="w-8 h-8 text-green-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">All caught up!</h3>
        <p className="text-sm text-gray-500">No products waiting for photos</p>
      </div>
    );
  }

  const pending = items.filter(i => !i.hasPhotos);
  const completed = items.filter(i => i.hasPhotos);

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-amber-600 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Camera className="w-4 h-4" />
            Needs Photos ({pending.length})
          </h2>
          <div className="space-y-3">
            {pending.map((item) => (
              <div
                key={item.id}
                onClick={() => onSelect(item.id)}
                className="bg-white rounded-xl border-2 border-amber-200 p-4 hover:shadow-lg hover:border-amber-300 transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">{item.emDesignName}</h3>
                    <p className="text-sm text-gray-500">{item.carpetNo}</p>
                  </div>
                  <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                    Pending
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>{item.quality}</span>
                  <span>{formatDate(item.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-green-600 uppercase tracking-wide mb-3 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Has Photos ({completed.length})
          </h2>
          <div className="space-y-3">
            {completed.map((item) => (
              <div
                key={item.id}
                onClick={() => onSelect(item.id)}
                className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-all cursor-pointer opacity-75"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">{item.emDesignName}</h3>
                    <p className="text-sm text-gray-500">{item.carpetNo}</p>
                  </div>
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium flex items-center gap-1">
                    <Image className="w-3 h-3" />
                    {item.photoCount}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>{item.quality}</span>
                  <span>{formatDate(item.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
