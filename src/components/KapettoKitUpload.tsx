import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { compressImage } from '../lib/utils';
import {
  getKapettoSampleKit,
  uploadKitPhoto,
  deleteKitPhoto,
} from '../lib/firebase';
import type { KapettoKit } from '../lib/firebase';

interface KapettoKitUploadProps {
  kit: KapettoKit;
  onClose: () => void;
}

export function KapettoKitUpload({ kit, onClose }: KapettoKitUploadProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);

  const { data: sampleKit, isLoading: loadingKit } = useQuery({
    queryKey: ['kapetto-sample-kit', kit.id],
    queryFn: () => getKapettoSampleKit(kit.id),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const compressed = await compressImage(file);
      return uploadKitPhoto(kit.id, compressed);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kapetto-kits'] });
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingCount(files.length);

    for (let i = 0; i < files.length; i++) {
      try {
        await uploadMutation.mutateAsync(files[i]);
      } catch (err) {
        console.error('Failed to upload:', err);
      }
      setUploadingCount((prev) => Math.max(0, prev - 1));
    }

    setUploadingCount(0);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = (photoUrl: string) => {
    if (deletingUrl) return;
    setDeletingUrl(photoUrl);
    deleteMutation.mutate(photoUrl);
  };

  const photos = kit.kitPhotos || [];
  const isUploading = uploadingCount > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
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
                : 'bg-green-100 text-green-700'
            )}>
              {kit.stage === 'sample_requested' ? 'Requested' : 'Sent'}
            </span>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
            >
              <X className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* Kit Products Section */}
          {loadingKit ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
              <span className="ml-2 text-sm text-gray-500">Loading kit products...</span>
            </div>
          ) : sampleKit && sampleKit.products.length > 0 ? (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Kit Products</h3>
              <div className="space-y-2">
                {sampleKit.products.map((product, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-gray-50 rounded-lg p-2.5">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.productName}
                        className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs text-gray-400">N/A</span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{product.productName}</p>
                      <p className="text-xs text-gray-500 truncate">{product.collectionName}</p>
                    </div>
                    {product.quantity > 1 && (
                      <span className="text-xs font-medium text-gray-500 flex-shrink-0">x{product.quantity}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Photo Upload Section */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              Photos {photos.length > 0 && <span className="text-gray-400">({photos.length})</span>}
            </h3>

            <div className="grid grid-cols-3 gap-2">
              {/* Existing photos */}
              {photos.map((url) => (
                <div key={url} className="relative aspect-square rounded-lg overflow-hidden group">
                  <img
                    src={url}
                    alt="Kit photo"
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(url);
                    }}
                    disabled={deletingUrl === url}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                    style={{ opacity: deletingUrl === url ? 1 : undefined }}
                  >
                    {deletingUrl === url ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}
                  </button>
                </div>
              ))}

              {/* Upload placeholder(s) */}
              {isUploading && Array.from({ length: uploadingCount }).map((_, i) => (
                <div key={`uploading-${i}`} className="aspect-square rounded-lg bg-gray-100 flex items-center justify-center border-2 border-dashed border-gray-300">
                  <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                </div>
              ))}

              {/* Add photo button */}
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
        </div>
      </div>
    </div>
  );
}
