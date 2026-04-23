import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2, Loader2, Camera, Lock } from 'lucide-react';
import { cn } from '../lib/utils';
import { compressImage } from '../lib/utils';
import {
  getKapettoSampleKit,
  uploadKitPhoto,
  uploadKitProductImage,
  deleteKitPhoto,
} from '../lib/firebase';
import type { KapettoKit } from '../lib/firebase';

// 5 kits already shared with customers — read-only, no uploads allowed
const GUARDED_KIT_IDS = new Set([
  'RaSNrUEDKPB2vrVifpNP', // Tobi Fairley
  'SdtBzAlT6ELqPK1Qe6WQ', // Cecilia P / Lucas Interior
  'dw6TgLCi9PTUcGYoYGuM', // Ali Brooks / Sketch Design
  'eV6vhfMuos70FUy5SxZT', // Danielle / Deojay Design
  'oUKPjCBOQeClPsfRx8J5', // Dani Boyd
]);

interface KapettoKitUploadProps {
  kit: KapettoKit;
  onClose: () => void;
}

export function KapettoKitUpload({ kit, onClose }: KapettoKitUploadProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [uploadingProductIdx, setUploadingProductIdx] = useState<number | null>(null);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);

  const { data: sampleKit, isLoading: loadingKit } = useQuery({
    queryKey: ['kapetto-sample-kit', kit.id],
    queryFn: () => getKapettoSampleKit(kit.id),
  });

  const isGuarded = sampleKit ? GUARDED_KIT_IDS.has(sampleKit.id) : false;

  // Flat photo upload (gallery at bottom — for leads without sample kits)
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const compressed = await compressImage(file);
      return uploadKitPhoto(kit.id, compressed);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kapetto-kits'] });
    },
  });

  // Per-product photo upload
  const productUploadMutation = useMutation({
    mutationFn: async ({ file, productIndex }: { file: File; productIndex: number }) => {
      const compressed = await compressImage(file);
      return uploadKitProductImage(kit.id, sampleKit!.id, productIndex, compressed);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kapetto-kits'] });
      queryClient.invalidateQueries({ queryKey: ['kapetto-sample-kit', kit.id] });
      setUploadingProductIdx(null);
    },
    onError: () => {
      setUploadingProductIdx(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (photoUrl: string) => deleteKitPhoto(kit.id, photoUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kapetto-kits'] });
      setDeletingUrl(null);
    },
    onError: () => {
      setDeletingUrl(null);
    },
  });

  // Flat gallery file select (for leads without sample kit)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingCount(files.length);
    for (let i = 0; i < files.length; i++) {
      try { await uploadMutation.mutateAsync(files[i]); } catch { /* logged in mutation */ }
      setUploadingCount((prev) => Math.max(0, prev - 1));
    }
    setUploadingCount(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Per-product file select
  const handleProductFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, productIndex: number) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingProductIdx(productIndex);
    productUploadMutation.mutate({ file, productIndex });
    e.target.value = ''; // reset input
  };

  const handleDelete = (photoUrl: string) => {
    if (deletingUrl) return;
    setDeletingUrl(photoUrl);
    deleteMutation.mutate(photoUrl);
  };

  const photos = kit.kitPhotos || [];
  const isUploading = uploadingCount > 0;
  const hasProducts = sampleKit && sampleKit.products.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative w-full max-w-lg max-h-[90vh] bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-gray-900 truncate">{kit.name}</h2>
            <p className="text-sm text-gray-500 truncate">{kit.company}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
            <span className={cn(
              'px-2 py-0.5 rounded-full text-xs font-medium',
              kit.stage === 'sample_requested'
                ? 'bg-amber-100 text-amber-700'
                : kit.stage === 'follow_up'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-green-100 text-green-700'
            )}>
              {kit.stage === 'sample_requested' ? 'Requested' : kit.stage === 'follow_up' ? 'Follow Up' : 'Sent'}
            </span>
            {isGuarded && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Shared
              </span>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
              <X className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

          {/* Products with per-product upload */}
          {loadingKit ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
              <span className="ml-2 text-sm text-gray-500">Loading kit products...</span>
            </div>
          ) : hasProducts ? (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Products
                {isGuarded && <span className="ml-2 text-xs text-gray-400">(already shared with customer)</span>}
              </h3>
              <div className="space-y-2">
                {sampleKit!.products.map((product, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-gray-50 rounded-lg p-2.5">
                    {/* Product image or placeholder */}
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.productName}
                        className="w-14 h-14 rounded-lg object-cover flex-shrink-0 border border-gray-200"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0 border border-dashed border-gray-300">
                        <Camera className="w-5 h-5 text-gray-400" />
                      </div>
                    )}

                    {/* Product info */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{product.productName}</p>
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        {product.material && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 font-medium">{product.material}</span>
                        )}
                        {product.construction && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 font-medium">{product.construction}</span>
                        )}
                        {product.leadTime && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">{product.leadTime}</span>
                        )}
                        {product.psfPrice != null && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">${product.psfPrice}/sqft</span>
                        )}
                      </div>
                    </div>

                    {/* Per-product upload button (hidden for guarded kits) */}
                    {!isGuarded && (
                      <label className={cn(
                        'flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors',
                        uploadingProductIdx === idx
                          ? 'bg-gray-200 text-gray-500'
                          : product.imageUrl
                          ? 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
                          : 'bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200'
                      )}>
                        {uploadingProductIdx === idx ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : product.imageUrl ? (
                          <>
                            <Camera className="w-3.5 h-3.5" />
                            Replace
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            Upload
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => handleProductFileSelect(e, idx)}
                          disabled={uploadingProductIdx !== null}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Flat photo gallery — shown for all kits (captures general photos not tied to a specific product) */}
          {!isGuarded && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                {hasProducts ? 'Additional Photos' : 'Photos'}
                {photos.length > 0 && <span className="text-gray-400 ml-1">({photos.length})</span>}
              </h3>

              <div className="grid grid-cols-3 gap-2">
                {photos.map((url) => (
                  <div key={url} className="relative aspect-square rounded-lg overflow-hidden group">
                    <img src={url} alt="Kit photo" className="w-full h-full object-cover" />
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(url); }}
                      disabled={deletingUrl === url}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ opacity: deletingUrl === url ? 1 : undefined }}
                    >
                      {deletingUrl === url ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    </button>
                  </div>
                ))}

                {isUploading && Array.from({ length: uploadingCount }).map((_, i) => (
                  <div key={`uploading-${i}`} className="aspect-square rounded-lg bg-gray-100 flex items-center justify-center border-2 border-dashed border-gray-300">
                    <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                  </div>
                ))}

                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <Plus className="w-6 h-6 text-gray-400" />
                  <span className="text-xs text-gray-400">Add</span>
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          )}

          {/* Read-only message for guarded kits */}
          {isGuarded && photos.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Photos ({photos.length})</h3>
              <div className="grid grid-cols-3 gap-2">
                {photos.map((url) => (
                  <div key={url} className="aspect-square rounded-lg overflow-hidden">
                    <img src={url} alt="Kit photo" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
