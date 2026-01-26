import { useState, useRef, useEffect, useCallback } from 'react';
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
  FileImage,
  CheckSquare,
  Square,
} from 'lucide-react';
import {
  getShowroomProducts,
  searchShowroomProducts,
  getShowroomProductById,
  getShowroomProductsByDesign,
  getEmplDesign,
  uploadDesignPhoto,
  type ShowroomProduct,
} from '../lib/firebase';
import { cn, compressImage } from '../lib/utils';
import { generateProductPPT } from '../lib/pptGenerator';

const PAGE_SIZE = 60;

// ============================================
// Rug Gallery Grid (Main List View)
// ============================================
export function RugGallery() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [allProducts, setAllProducts] = useState<ShowroomProduct[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Debounce search
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
      setAllProducts([]);
      setHasMore(true);
    }, 300);
  };

  // Fetch products - either search or paginated list
  const { data: initialProducts, isLoading, isFetching } = useQuery({
    queryKey: ['showroom-products', debouncedSearch, 1],
    queryFn: () => debouncedSearch
      ? searchShowroomProducts(debouncedSearch, 200)
      : getShowroomProducts(PAGE_SIZE),
    staleTime: 60000,
  });

  // Set initial products
  useEffect(() => {
    if (initialProducts && page === 1) {
      setAllProducts(initialProducts);
      setHasMore(initialProducts.length >= PAGE_SIZE && !debouncedSearch);
    }
  }, [initialProducts, page, debouncedSearch]);

  // Load more function
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || debouncedSearch) return;

    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const moreProducts = await getShowroomProducts(PAGE_SIZE * nextPage);

      // Get only new products
      const existingIds = new Set(allProducts.map(p => p.id));
      const newProducts = moreProducts.filter(p => !existingIds.has(p.id));

      if (newProducts.length > 0) {
        setAllProducts(prev => [...prev, ...newProducts]);
        setPage(nextPage);
      }

      // Check if we've loaded all
      if (moreProducts.length < PAGE_SIZE * nextPage) {
        setHasMore(false);
      }
    } catch (error) {
      console.error('Error loading more:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [page, loadingMore, hasMore, debouncedSearch, allProducts]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [loadMore, hasMore, loadingMore]);

  // Toggle select
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Select all visible
  const selectAll = () => {
    setSelectedIds(new Set(allProducts.map(p => p.id)));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  // Create PPT state
  const [creatingPPT, setCreatingPPT] = useState(false);

  // Create PPT
  const createPPT = async () => {
    const selected = allProducts.filter(p => selectedIds.has(p.id));
    if (selected.length === 0) return;

    setCreatingPPT(true);
    try {
      await generateProductPPT(selected, 'Eastern Mills - Rug Gallery');
      // Clear selection after successful PPT creation
      clearSelection();
    } catch (error) {
      console.error('Error creating PPT:', error);
      alert('Failed to create PPT. Please try again.');
    } finally {
      setCreatingPPT(false);
    }
  };

  const displayProducts = allProducts.length > 0 ? allProducts : (initialProducts || []);

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
                  {displayProducts.length} design{displayProducts.length !== 1 ? 's' : ''} loaded
                  {hasMore && !debouncedSearch && ' • Scroll for more'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isFetching && !isLoading && (
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              )}
              <button
                onClick={() => setSelectMode(!selectMode)}
                className={cn(
                  "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  selectMode
                    ? "bg-primary text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                {selectMode ? 'Done' : 'Select'}
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by design name, color, construction..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-100 rounded-xl border-0 focus:ring-2 focus:ring-primary focus:bg-white transition-all"
            />
          </div>

          {/* Selection bar */}
          {selectMode && (
            <div className="flex items-center justify-between mt-3 py-2 px-3 bg-gray-100 rounded-lg">
              <div className="flex items-center gap-3">
                <button
                  onClick={selectAll}
                  className="text-sm text-primary font-medium hover:underline"
                >
                  Select All
                </button>
                <button
                  onClick={clearSelection}
                  className="text-sm text-gray-500 hover:underline"
                >
                  Clear
                </button>
              </div>
              <span className="text-sm text-gray-600">
                {selectedIds.size} selected
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-6 pb-24">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin mb-3" />
            <p className="text-sm text-gray-500">Loading designs...</p>
          </div>
        ) : !displayProducts.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Grid3X3 className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {debouncedSearch ? 'No designs found' : 'No designs yet'}
            </h3>
            <p className="text-sm text-gray-500">
              {debouncedSearch ? 'Try a different search term' : 'Showroom products will appear here'}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {displayProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  selectMode={selectMode}
                  isSelected={selectedIds.has(product.id)}
                  onSelect={() => toggleSelect(product.id)}
                  onClick={() => !selectMode && navigate(`/rug-gallery/${encodeURIComponent(product.id)}`)}
                />
              ))}
            </div>

            {/* Load more trigger */}
            {hasMore && !debouncedSearch && (
              <div ref={loadMoreRef} className="flex justify-center py-8">
                {loadingMore ? (
                  <div className="flex items-center gap-2 text-gray-500">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Loading more...</span>
                  </div>
                ) : (
                  <button
                    onClick={loadMore}
                    className="px-4 py-2 bg-gray-100 rounded-lg text-sm text-gray-600 hover:bg-gray-200 transition-colors"
                  >
                    Load More
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Floating action bar for selection */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg z-20">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <span className="font-medium text-gray-900">
              {selectedIds.size} product{selectedIds.size !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={createPPT}
              disabled={creatingPPT}
              className={cn(
                "flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg font-medium transition-colors",
                creatingPPT ? "opacity-70 cursor-not-allowed" : "hover:bg-primary/90"
              )}
            >
              {creatingPPT ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating PPT...
                </>
              ) : (
                <>
                  <FileImage className="w-5 h-5" />
                  Create PPT
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Full screen loading overlay for PPT creation */}
      {creatingPPT && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 flex flex-col items-center gap-4 max-w-sm mx-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <div className="text-center">
              <h3 className="font-semibold text-gray-900">Creating Presentation</h3>
              <p className="text-sm text-gray-500 mt-1">
                Generating {selectedIds.size} slide{selectedIds.size !== 1 ? 's' : ''}...
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Product Card Component (with lazy loading & selection)
// ============================================
function ProductCard({
  product,
  onClick,
  selectMode = false,
  isSelected = false,
  onSelect,
}: {
  product: ShowroomProduct;
  onClick: () => void;
  selectMode?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
}) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const photoCount = 1 + (product.additionalImages?.length || 0);

  const handleClick = () => {
    if (selectMode && onSelect) {
      onSelect();
    } else {
      onClick();
    }
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        "bg-white rounded-xl border overflow-hidden transition-all cursor-pointer group",
        isSelected
          ? "border-primary ring-2 ring-primary/20"
          : "border-gray-200 hover:shadow-lg hover:border-primary/30"
      )}
    >
      {/* Image with lazy loading */}
      <div className="aspect-square bg-gray-100 relative overflow-hidden">
        {product.firebaseUrl && !imageError ? (
          <>
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-gray-200 border-t-primary rounded-full animate-spin" />
              </div>
            )}
            <img
              src={product.firebaseUrl}
              alt={product.displayName}
              loading="lazy"
              decoding="async"
              className={cn(
                "w-full h-full object-cover group-hover:scale-105 transition-all duration-300",
                !imageLoaded && "opacity-0"
              )}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Image className="w-12 h-12 text-gray-300" />
          </div>
        )}

        {/* Selection checkbox */}
        {selectMode && (
          <div className="absolute top-2 left-2">
            {isSelected ? (
              <div className="w-6 h-6 bg-primary rounded-md flex items-center justify-center">
                <CheckSquare className="w-5 h-5 text-white" />
              </div>
            ) : (
              <div className="w-6 h-6 bg-white/90 border border-gray-300 rounded-md flex items-center justify-center">
                <Square className="w-4 h-4 text-gray-400" />
              </div>
            )}
          </div>
        )}

        {/* Photo count badge */}
        {photoCount > 0 && !selectMode && (
          <div className="absolute top-2 right-2 px-2 py-1 bg-black/60 text-white rounded-full text-xs font-medium flex items-center gap-1">
            <Camera className="w-3 h-3" />
            {photoCount}
          </div>
        )}

        {/* Source badge (Heimtextil 2026) - only show when not in select mode */}
        {product.source && !selectMode && (
          <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-purple-500 text-white rounded-full text-[10px] font-medium">
            HT26
          </div>
        )}

        {/* Color badge */}
        {product.color && (
          <div className="absolute bottom-2 left-2 px-2 py-1 bg-white/90 text-gray-700 rounded-full text-xs font-medium">
            {product.color}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="font-semibold text-gray-900 text-sm truncate">{product.displayName}</h3>
        {(product.construction || product.category) && (
          <p className="text-xs text-gray-500 truncate mt-0.5">
            {[product.construction, product.category].filter(Boolean).join(' | ')}
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
  const { designName: productId } = useParams<{ designName: string }>();
  const decodedProductId = decodeURIComponent(productId || '');
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Fetch the main product
  const { data: product, isLoading: loadingProduct } = useQuery({
    queryKey: ['showroom-product', decodedProductId],
    queryFn: () => getShowroomProductById(decodedProductId),
    enabled: !!decodedProductId,
  });

  // Fetch color variants (other products with same baseStyleNumber)
  const { data: variants, isLoading: loadingVariants } = useQuery({
    queryKey: ['showroom-products-by-design', product?.baseStyleNumber],
    queryFn: () => getShowroomProductsByDesign(product?.baseStyleNumber || ''),
    enabled: !!product?.baseStyleNumber,
  });

  // Fetch EMPL design for additional uploaded photos
  const { data: emplDesign } = useQuery({
    queryKey: ['empl-design', product?.baseStyleNumber],
    queryFn: () => getEmplDesign(product?.baseStyleNumber || ''),
    enabled: !!product?.baseStyleNumber,
  });

  const isLoading = loadingProduct || loadingVariants;

  // Collect all photos from this product
  const allPhotos: { url: string; source: string; label?: string }[] = [];

  // Add main photo from current product
  if (product?.firebaseUrl) {
    allPhotos.push({
      url: product.firebaseUrl,
      source: 'showroom',
      label: 'Main',
    });
  }

  // Add additional images from current product
  product?.additionalImages?.forEach((url, i) => {
    allPhotos.push({
      url,
      source: 'showroom',
      label: `Image ${i + 2}`,
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
    if (!file || !product?.baseStyleNumber) return;

    try {
      setUploading(true);

      // Compress image before upload
      const compressedFile = await compressImage(file);

      // Upload to Firebase
      await uploadDesignPhoto(product.baseStyleNumber, compressedFile, 'gallery');

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['empl-design', product.baseStyleNumber] });
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
              <h1 className="text-xl font-bold text-gray-900 truncate">{product?.displayName || 'Loading...'}</h1>
              {product && (
                <p className="text-sm text-gray-500 truncate">
                  {[product.construction, product.category, product.color].filter(Boolean).join(' | ')}
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
        ) : !product ? (
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
            {variants && variants.length > 1 && (
              <section>
                <h2 className="text-sm font-medium text-gray-600 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Palette className="w-4 h-4" />
                  Color Variants ({variants.length})
                </h2>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {variants.map((variant) => (
                    <VariantChip key={variant.id} variant={variant} isActive={variant.id === product.id} />
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
            <section className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-medium text-gray-600 uppercase tracking-wide mb-3">
                Design Details
              </h2>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                {product.baseStyleNumber && (
                  <div>
                    <dt className="text-gray-500">Base Style</dt>
                    <dd className="font-medium text-gray-900">{product.baseStyleNumber}</dd>
                  </div>
                )}
                {product.construction && (
                  <div>
                    <dt className="text-gray-500">Construction</dt>
                    <dd className="font-medium text-gray-900">{product.construction}</dd>
                  </div>
                )}
                {product.category && (
                  <div>
                    <dt className="text-gray-500">Category</dt>
                    <dd className="font-medium text-gray-900">{product.category}</dd>
                  </div>
                )}
                {product.color && (
                  <div>
                    <dt className="text-gray-500">Color</dt>
                    <dd className="font-medium text-gray-900">{product.color}</dd>
                  </div>
                )}
                {product.size && (
                  <div>
                    <dt className="text-gray-500">Size</dt>
                    <dd className="font-medium text-gray-900">{product.size}</dd>
                  </div>
                )}
                {product.materials && (
                  <div className="col-span-2">
                    <dt className="text-gray-500">Materials</dt>
                    <dd className="font-medium text-gray-900">{product.materials}</dd>
                  </div>
                )}
              </dl>
            </section>
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
function VariantChip({ variant, isActive }: { variant: ShowroomProduct; isActive?: boolean }) {
  const [imageError, setImageError] = useState(false);
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/rug-gallery/${encodeURIComponent(variant.id)}`)}
      className={cn(
        "flex-shrink-0 rounded-xl border p-2 flex items-center gap-3 min-w-[140px] cursor-pointer transition-all",
        isActive
          ? "bg-primary/5 border-primary"
          : "bg-white border-gray-200 hover:border-primary/50"
      )}
    >
      <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
        {variant.firebaseUrl && !imageError ? (
          <img
            src={variant.firebaseUrl}
            alt={variant.color || variant.styleNumber}
            loading="lazy"
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
        <p className="text-xs text-gray-500 truncate">{variant.displayName}</p>
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
  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <button
      onClick={onClick}
      className="aspect-square rounded-xl bg-gray-100 overflow-hidden relative group hover:ring-2 hover:ring-primary transition-all"
    >
      {!imageError ? (
        <>
          {!imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-gray-200 border-t-primary rounded-full animate-spin" />
            </div>
          )}
          <img
            src={url}
            alt={label || 'Photo'}
            loading="lazy"
            decoding="async"
            className={cn(
              "w-full h-full object-cover group-hover:scale-105 transition-all duration-300",
              !imageLoaded && "opacity-0"
            )}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        </>
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
