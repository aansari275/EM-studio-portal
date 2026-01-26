import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Search,
  Image,
  Camera,
  Upload,
  X,
  Loader2,
  Grid3X3,
  Palette,
  CheckCircle,
} from 'lucide-react';
import {
  getShowroomProductsGrouped,
  getShowroomProductsByDesign,
  getEmplDesign,
  uploadDesignPhoto,
  type DesignGroup,
  type ShowroomProduct,
} from '../lib/firebase';
import { cn, compressImage } from '../lib/utils';

// ============================================
// Rug Gallery Grid (Main List View)
// ============================================
export function RugGallery() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: designGroups, isLoading } = useQuery({
    queryKey: ['showroom-products-grouped'],
    queryFn: getShowroomProductsGrouped,
    refetchInterval: 60000,
  });

  // Filter by search query
  const filteredGroups = designGroups?.filter((group) =>
    group.designName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    group.materials?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    group.construction?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/')}
                className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Rug Gallery</h1>
                <p className="text-sm text-gray-500">
                  {filteredGroups.length} design{filteredGroups.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search designs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-100 rounded-xl border-0 focus:ring-2 focus:ring-primary focus:bg-white transition-all"
            />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin mb-3" />
            <p className="text-sm text-gray-500">Loading designs...</p>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Grid3X3 className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {searchQuery ? 'No designs found' : 'No designs yet'}
            </h3>
            <p className="text-sm text-gray-500">
              {searchQuery ? 'Try a different search term' : 'Showroom products will appear here'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {filteredGroups.map((group) => (
              <DesignCard
                key={group.designName}
                group={group}
                onClick={() => navigate(`/rug-gallery/${encodeURIComponent(group.designName)}`)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ============================================
// Design Card Component
// ============================================
function DesignCard({ group, onClick }: { group: DesignGroup; onClick: () => void }) {
  const [imageError, setImageError] = useState(false);

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer group"
    >
      {/* Image */}
      <div className="aspect-square bg-gray-100 relative overflow-hidden">
        {group.mainImage && !imageError ? (
          <img
            src={group.mainImage}
            alt={group.displayName}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Image className="w-12 h-12 text-gray-300" />
          </div>
        )}

        {/* Photo count badge */}
        <div className="absolute top-2 right-2 px-2 py-1 bg-black/60 text-white rounded-full text-xs font-medium flex items-center gap-1">
          <Camera className="w-3 h-3" />
          {group.photoCount}
        </div>

        {/* Variants badge */}
        {group.colorVariants.length > 1 && (
          <div className="absolute bottom-2 left-2 px-2 py-1 bg-primary/90 text-white rounded-full text-xs font-medium flex items-center gap-1">
            <Palette className="w-3 h-3" />
            {group.colorVariants.length} colors
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="font-semibold text-gray-900 text-sm truncate">{group.designName}</h3>
        {(group.materials || group.construction) && (
          <p className="text-xs text-gray-500 truncate mt-0.5">
            {[group.construction, group.materials].filter(Boolean).join(' | ')}
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================
// Rug Gallery Detail View
// ============================================
export function RugGalleryDetail() {
  const navigate = useNavigate();
  const { designName } = useParams<{ designName: string }>();
  const decodedDesignName = decodeURIComponent(designName || '');
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Fetch color variants from Showroom_Products
  const { data: variants, isLoading: loadingVariants } = useQuery({
    queryKey: ['showroom-products-by-design', decodedDesignName],
    queryFn: () => getShowroomProductsByDesign(decodedDesignName),
    enabled: !!decodedDesignName,
  });

  // Fetch EMPL design for additional uploaded photos
  const { data: emplDesign, isLoading: loadingEmplDesign } = useQuery({
    queryKey: ['empl-design', decodedDesignName],
    queryFn: () => getEmplDesign(decodedDesignName),
    enabled: !!decodedDesignName,
  });

  const isLoading = loadingVariants || loadingEmplDesign;
  const firstVariant = variants?.[0];

  // Collect all photos
  const allPhotos: { url: string; source: string; label?: string }[] = [];

  // Add photos from Showroom_Products variants
  variants?.forEach((v) => {
    if (v.firebaseUrl) {
      allPhotos.push({
        url: v.firebaseUrl,
        source: 'showroom',
        label: v.color || v.styleNumber,
      });
    }
    v.additionalImages?.forEach((url, i) => {
      allPhotos.push({
        url,
        source: 'showroom',
        label: `${v.color || v.styleNumber} - ${i + 1}`,
      });
    });
  });

  // Add photos from empl_designs
  emplDesign?.photos?.forEach((photo) => {
    allPhotos.push({
      url: photo.url,
      source: 'uploaded',
      label: photo.type,
    });
  });

  // Handle photo upload
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !decodedDesignName) return;

    try {
      setUploading(true);

      // Compress image before upload
      const compressedFile = await compressImage(file);

      // Upload to Firebase
      await uploadDesignPhoto(decodedDesignName, compressedFile, 'gallery');

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['empl-design', decodedDesignName] });
      queryClient.invalidateQueries({ queryKey: ['showroom-products-grouped'] });
    } catch (error) {
      console.error('Error uploading photo:', error);
      alert('Failed to upload photo. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/rug-gallery')}
              className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center hover:bg-gray-200 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-900 truncate">{decodedDesignName}</h1>
              {firstVariant && (
                <p className="text-sm text-gray-500 truncate">
                  {[firstVariant.construction, firstVariant.materials].filter(Boolean).join(' | ')}
                </p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin mb-3" />
            <p className="text-sm text-gray-500">Loading design...</p>
          </div>
        ) : !variants?.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Image className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Design not found</h3>
            <p className="text-sm text-gray-500">This design may have been removed</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Color Variants Section */}
            {variants.length > 1 && (
              <section>
                <h2 className="text-sm font-medium text-gray-600 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Palette className="w-4 h-4" />
                  Color Variants ({variants.length})
                </h2>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {variants.map((variant) => (
                    <VariantChip key={variant.id} variant={variant} />
                  ))}
                </div>
              </section>
            )}

            {/* All Photos Section */}
            <section>
              <h2 className="text-sm font-medium text-gray-600 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Camera className="w-4 h-4" />
                All Photos ({allPhotos.length})
              </h2>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {allPhotos.map((photo, index) => (
                  <PhotoThumbnail
                    key={`${photo.url}-${index}`}
                    url={photo.url}
                    label={photo.label}
                    source={photo.source}
                    onClick={() => setSelectedImage(photo.url)}
                  />
                ))}

                {/* Upload button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className={cn(
                    'aspect-square rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all',
                    uploading && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {uploading ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <>
                      <Upload className="w-6 h-6" />
                      <span className="text-xs font-medium">Add Photo</span>
                    </>
                  )}
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            </section>

            {/* Design Info Section */}
            {firstVariant && (
              <section className="bg-white rounded-xl border border-gray-200 p-4">
                <h2 className="text-sm font-medium text-gray-600 uppercase tracking-wide mb-3">
                  Design Details
                </h2>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  {firstVariant.construction && (
                    <div>
                      <dt className="text-gray-500">Construction</dt>
                      <dd className="font-medium text-gray-900">{firstVariant.construction}</dd>
                    </div>
                  )}
                  {firstVariant.materials && (
                    <div>
                      <dt className="text-gray-500">Materials</dt>
                      <dd className="font-medium text-gray-900">{firstVariant.materials}</dd>
                    </div>
                  )}
                  {firstVariant.category && (
                    <div>
                      <dt className="text-gray-500">Category</dt>
                      <dd className="font-medium text-gray-900">{firstVariant.category}</dd>
                    </div>
                  )}
                  {firstVariant.size && (
                    <div>
                      <dt className="text-gray-500">Size</dt>
                      <dd className="font-medium text-gray-900">{firstVariant.size}</dd>
                    </div>
                  )}
                </dl>
              </section>
            )}
          </div>
        )}
      </main>

      {/* Lightbox */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <button
            onClick={() => setSelectedImage(null)}
            className="absolute top-4 right-4 w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={selectedImage}
            alt="Full size"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

// ============================================
// Variant Chip Component
// ============================================
function VariantChip({ variant }: { variant: ShowroomProduct }) {
  const [imageError, setImageError] = useState(false);

  return (
    <div className="flex-shrink-0 bg-white rounded-xl border border-gray-200 p-2 flex items-center gap-3 min-w-[140px]">
      <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
        {variant.firebaseUrl && !imageError ? (
          <img
            src={variant.firebaseUrl}
            alt={variant.color || variant.styleNumber}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Image className="w-5 h-5 text-gray-300" />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="font-medium text-gray-900 text-sm truncate">
          {variant.color || 'Default'}
        </p>
        <p className="text-xs text-gray-500 truncate">{variant.styleNumber}</p>
      </div>
    </div>
  );
}

// ============================================
// Photo Thumbnail Component
// ============================================
function PhotoThumbnail({
  url,
  label,
  source,
  onClick,
}: {
  url: string;
  label?: string;
  source: string;
  onClick: () => void;
}) {
  const [imageError, setImageError] = useState(false);

  return (
    <button
      onClick={onClick}
      className="aspect-square rounded-xl bg-gray-100 overflow-hidden relative group hover:ring-2 hover:ring-primary transition-all"
    >
      {!imageError ? (
        <img
          src={url}
          alt={label || 'Photo'}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={() => setImageError(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Image className="w-8 h-8 text-gray-300" />
        </div>
      )}

      {/* Source badge */}
      {source === 'uploaded' && (
        <div className="absolute top-1 right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
          <CheckCircle className="w-3 h-3 text-white" />
        </div>
      )}
    </button>
  );
}
