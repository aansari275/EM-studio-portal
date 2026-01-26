import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Camera, Check, Loader2, X, FileText, Upload, Image, ChevronRight, AlertCircle } from 'lucide-react';
import {
  getDispatchForPhotos,
  getSampleBazarForPhotos,
  uploadDispatchPhoto,
  uploadSampleBazarPhoto,
  uploadDispatchPpt,
  type DispatchForPhotos,
  type SampleBazarForPhotos,
  type DispatchProduct,
} from '../lib/firebase';
import { cn, compressImage } from '../lib/utils';

type PhotoType = 'main' | 'detail' | 'lifestyle' | 'closeup';

const PHOTO_TYPES: { type: PhotoType; label: string; required: boolean }[] = [
  { type: 'main', label: 'Main Photo', required: true },
  { type: 'detail', label: 'Detail Shot', required: false },
  { type: 'lifestyle', label: 'Lifestyle', required: false },
  { type: 'closeup', label: 'Close-up', required: false },
];

export function UploadPhotos() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isDispatch = type === 'dispatch';

  // Separate queries for dispatch and sample-bazar
  const dispatchQuery = useQuery({
    queryKey: ['dispatch', id],
    queryFn: () => getDispatchForPhotos(id!),
    enabled: !!id && isDispatch,
  });

  const sampleBazarQuery = useQuery({
    queryKey: ['sample-bazar', id],
    queryFn: () => getSampleBazarForPhotos(id!),
    enabled: !!id && !isDispatch,
  });

  const isLoading = isDispatch ? dispatchQuery.isLoading : sampleBazarQuery.isLoading;
  const error = isDispatch ? dispatchQuery.error : sampleBazarQuery.error;
  const dispatchData = dispatchQuery.data;
  const sampleBazarData = sampleBazarQuery.data;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (error || (isDispatch && !dispatchData) || (!isDispatch && !sampleBazarData)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <X className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Not Found</h2>
          <p className="text-sm text-gray-500 mb-4">Could not load this item</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const title = isDispatch ? dispatchData!.buyerName : sampleBazarData!.emDesignName;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center hover:bg-gray-200 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-gray-900">
                {isDispatch ? 'Dispatch Photos' : 'Product Photos'}
              </h1>
              <p className="text-sm text-gray-500">{title}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {isDispatch && dispatchData ? (
          <DispatchUploader
            dispatch={dispatchData}
            onComplete={() => {
              queryClient.invalidateQueries({ queryKey: ['pending-dispatches'] });
              navigate('/');
            }}
          />
        ) : sampleBazarData ? (
          <ProductUploader
            product={sampleBazarData}
            onComplete={() => {
              queryClient.invalidateQueries({ queryKey: ['pending-sample-bazar'] });
              navigate('/');
            }}
          />
        ) : null}
      </main>
    </div>
  );
}

// Dispatch Uploader - handles multiple products with list/detail navigation
function DispatchUploader({
  dispatch,
  onComplete
}: {
  dispatch: DispatchForPhotos;
  onComplete: () => void;
}) {
  // null = show product list, number = show product detail
  const [selectedProductIndex, setSelectedProductIndex] = useState<number | null>(null);
  const [uploadingPpt, setUploadingPpt] = useState(false);
  const queryClient = useQueryClient();

  const allProductsHaveMainPhoto = dispatch.products.every(p =>
    p.studioPhotos.some(photo => photo.type === 'main')
  );

  const handlePptUpload = async (file: File) => {
    setUploadingPpt(true);
    try {
      await uploadDispatchPpt(dispatch.id, file);
      queryClient.invalidateQueries({ queryKey: ['dispatch', dispatch.id] });
    } catch (error) {
      console.error('PPT upload failed:', error);
      alert('PPT upload failed. Please try again.');
    } finally {
      setUploadingPpt(false);
    }
  };

  // Product Detail View
  if (selectedProductIndex !== null) {
    const currentProduct = dispatch.products[selectedProductIndex];
    return (
      <ProductDetailView
        product={currentProduct}
        dispatchId={dispatch.id}
        onBack={() => setSelectedProductIndex(null)}
      />
    );
  }

  // Product List View (default)
  return (
    <div className="space-y-6">
      {/* PPT Upload Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Presentation File (PPT)
        </h3>
        {dispatch.pptFile ? (
          <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
            <FileText className="w-8 h-8 text-green-600" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{dispatch.pptFile.name}</p>
              <p className="text-xs text-gray-500">Uploaded</p>
            </div>
            <a
              href={dispatch.pptFile.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium"
            >
              View
            </a>
          </div>
        ) : (
          <label className="block p-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-primary transition-colors text-center">
            {uploadingPpt ? (
              <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-2" />
            ) : (
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            )}
            <span className="text-sm text-gray-600">
              {uploadingPpt ? 'Uploading...' : 'Click to upload PPT/PPTX file'}
            </span>
            <input
              type="file"
              accept=".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="hidden"
              disabled={uploadingPpt}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handlePptUpload(file);
                e.target.value = '';
              }}
            />
          </label>
        )}
      </div>

      {/* Product List */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          Products ({dispatch.products.length})
        </h3>
        <div className="space-y-3">
          {dispatch.products.map((product, index) => {
            const hasMainPhoto = product.studioPhotos.some(p => p.type === 'main');
            const photoCount = product.studioPhotos.length;

            return (
              <button
                key={product.carpetNo || index}
                onClick={() => setSelectedProductIndex(index)}
                className="w-full p-4 bg-gray-50 rounded-xl border border-gray-200 hover:border-primary hover:bg-gray-100 transition-colors text-left flex items-center gap-3"
              >
                {/* Status Icon */}
                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                  hasMainPhoto ? 'bg-green-100' : 'bg-amber-100'
                )}>
                  {hasMainPhoto ? (
                    <Check className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                  )}
                </div>

                {/* Product Info */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-gray-900 truncate">
                    {product.emDesignName || product.quality || 'Product ' + (index + 1)}
                  </h4>
                  {product.carpetNo && (
                    <p className="text-sm text-gray-500 truncate">
                      {product.carpetNo}
                    </p>
                  )}
                  {product.emDesignName && product.quality && (
                    <p className="text-sm text-gray-500 truncate">
                      {product.quality}
                    </p>
                  )}
                  <p className={cn(
                    'text-xs font-medium mt-1',
                    hasMainPhoto ? 'text-green-600' : 'text-amber-600'
                  )}>
                    {hasMainPhoto ? (
                      <>✓ {photoCount} photo{photoCount !== 1 ? 's' : ''}</>
                    ) : (
                      <>⚠️ Pending</>
                    )}
                  </p>
                </div>

                {/* Arrow */}
                <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Done Button */}
      {allProductsHaveMainPhoto && (
        <button
          onClick={onComplete}
          className="w-full py-3 bg-green-600 text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-green-700 transition-colors"
        >
          <Check className="w-5 h-5" />
          Done - All Photos Uploaded
        </button>
      )}
    </div>
  );
}

// Product Detail View - shows photo upload grid for a single product
function ProductDetailView({
  product,
  dispatchId,
  onBack
}: {
  product: DispatchProduct;
  dispatchId: string;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();

  return (
    <div className="space-y-6">
      {/* Back Button + Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-3 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Products
        </button>
        <div>
          <h3 className="font-semibold text-gray-900 text-lg">
            {product.emDesignName || product.quality || 'Product'}
          </h3>
          {product.carpetNo && (
            <p className="text-sm text-gray-500">{product.carpetNo}</p>
          )}
          {product.emDesignName && product.quality && (
            <p className="text-sm text-gray-500">{product.quality}</p>
          )}
        </div>
      </div>

      {/* Raw Photos Reference */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <RawPhotosReference rawPhotos={product.rawPhotos} />
      </div>

      {/* Studio Photos Upload */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
          <Camera className="w-4 h-4" />
          Studio Photos (Upload Here)
        </h4>
        <PhotoUploadGrid
          photos={product.studioPhotos.map(p => ({ type: p.type, url: p.url }))}
          onUpload={async (file, photoType) => {
            const compressed = await compressImage(file);
            await uploadDispatchPhoto(dispatchId, product.carpetNo, compressed, photoType);
            queryClient.invalidateQueries({ queryKey: ['dispatch', dispatchId] });
          }}
        />
      </div>

      {/* Bottom Back Button */}
      <button
        onClick={onBack}
        className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-gray-200 transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        Back to Products
      </button>
    </div>
  );
}

// Raw Photos Reference Component - shows existing dispatch photos as read-only reference
function RawPhotosReference({ rawPhotos }: { rawPhotos: DispatchProduct['rawPhotos'] }) {
  const photos = [
    { key: 'frontPhoto', label: 'Front', url: rawPhotos.frontPhoto },
    { key: 'backPhoto', label: 'Back', url: rawPhotos.backPhoto },
    { key: 'labelPhoto', label: 'Label', url: rawPhotos.labelPhoto },
    { key: 'dyedHankPhoto', label: 'Dyed Hank', url: rawPhotos.dyedHankPhoto },
  ].filter(p => p.url);

  if (photos.length === 0) {
    return (
      <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-500 text-center">
        No reference photos from dispatch
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-2">
        <Image className="w-4 h-4" />
        Reference Photos (from dispatch)
      </h4>
      <div className="grid grid-cols-4 gap-2">
        {photos.map((photo) => (
          <div key={photo.key} className="relative">
            <a href={photo.url} target="_blank" rel="noopener noreferrer">
              <img
                src={photo.url}
                alt={photo.label}
                className="w-full aspect-square object-cover rounded-lg border border-gray-200"
              />
              <span className="absolute bottom-1 left-1 right-1 text-[10px] bg-black/60 text-white px-1 py-0.5 rounded text-center truncate">
                {photo.label}
              </span>
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

// Product Uploader - single product
function ProductUploader({
  product,
  onComplete
}: {
  product: SampleBazarForPhotos;
  onComplete: () => void;
}) {
  const queryClient = useQueryClient();
  const hasMainPhoto = product.photos.some(p => p.type === 'main');

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="mb-4">
          <h3 className="font-semibold text-gray-900">{product.emDesignName}</h3>
          <p className="text-sm text-gray-500">{product.carpetNo} • {product.quality}</p>
        </div>

        <PhotoUploadGrid
          photos={product.photos.map(p => ({ type: p.type, url: p.url }))}
          onUpload={async (file, photoType) => {
            const compressed = await compressImage(file);
            await uploadSampleBazarPhoto(product.id, compressed, photoType);
            queryClient.invalidateQueries({ queryKey: ['sample-bazar', product.id] });
          }}
        />
      </div>

      {hasMainPhoto && (
        <button
          onClick={onComplete}
          className="w-full py-3 bg-green-600 text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-green-700 transition-colors"
        >
          <Check className="w-5 h-5" />
          Done
        </button>
      )}
    </div>
  );
}

// Photo Upload Grid Component
function PhotoUploadGrid({
  photos,
  onUpload
}: {
  photos: Array<{ type: string; url: string }>;
  onUpload: (file: File, photoType: PhotoType) => Promise<void>;
}) {
  const [uploading, setUploading] = useState<PhotoType | null>(null);

  const handleFileSelect = async (photoType: PhotoType, file: File) => {
    setUploading(photoType);
    try {
      await onUpload(file, photoType);
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      {PHOTO_TYPES.map(({ type, label, required }) => {
        const existingPhoto = photos.find(p => p.type === type);
        const isUploading = uploading === type;

        return (
          <div key={type} className="relative">
            <label
              className={cn(
                'block aspect-square rounded-xl border-2 border-dashed overflow-hidden cursor-pointer transition-colors',
                existingPhoto
                  ? 'border-green-300 bg-green-50'
                  : required
                  ? 'border-amber-300 bg-amber-50 hover:border-amber-400'
                  : 'border-gray-200 bg-gray-50 hover:border-gray-300'
              )}
            >
              {existingPhoto ? (
                <img
                  src={existingPhoto.url}
                  alt={label}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-2">
                  {isUploading ? (
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  ) : (
                    <>
                      <Camera className={cn(
                        'w-8 h-8 mb-2',
                        required ? 'text-amber-400' : 'text-gray-300'
                      )} />
                      <span className="text-xs text-center text-gray-500">{label}</span>
                      {required && (
                        <span className="text-xs text-amber-600 font-medium">Required</span>
                      )}
                    </>
                  )}
                </div>
              )}

              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={isUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(type, file);
                  e.target.value = '';
                }}
              />
            </label>

            {existingPhoto && (
              <div className="absolute top-2 right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                <Check className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
