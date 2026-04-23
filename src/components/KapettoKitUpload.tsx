import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2, Loader2, Camera, Lock, Pencil, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../lib/utils';
import { compressImage } from '../lib/utils';
import {
  getKapettoSampleKit,
  uploadKitPhoto,
  uploadKitProductImage,
  deleteKitPhoto,
  createKapettoSampleKit,
  upsertKapettoKitProduct,
  deleteKapettoKitProduct,
} from '../lib/firebase';
import type { KapettoKit, KapettoSampleKitProduct } from '../lib/firebase';

// 5 kits already shared with customers — read-only, no uploads allowed
const GUARDED_KIT_IDS = new Set([
  'RaSNrUEDKPB2vrVifpNP', // Tobi Fairley
  'SdtBzAlT6ELqPK1Qe6WQ', // Cecilia P / Lucas Interior
  'dw6TgLCi9PTUcGYoYGuM', // Ali Brooks / Sketch Design
  'eV6vhfMuos70FUy5SxZT', // Danielle / Deojay Design
  'oUKPjCBOQeClPsfRx8J5', // Dani Boyd
]);

const STAGE_LABEL: Record<string, string> = {
  sample_requested: 'Requested',
  sample_sent: 'Sent',
  follow_up: 'Follow Up',
  won: 'Won',
  delivered_no_reply: 'No Reply',
  sample_resend: 'Resend',
};

interface KapettoKitUploadProps {
  kit: KapettoKit;
  onClose: () => void;
}

interface ProductFormState {
  productName: string;
  material: string;
  construction: string;
  leadTime: string;
  psfPrice: string;
}

const EMPTY_FORM: ProductFormState = {
  productName: '',
  material: '',
  construction: '',
  leadTime: '',
  psfPrice: '',
};

function productToForm(p: KapettoSampleKitProduct): ProductFormState {
  return {
    productName: p.productName,
    material: p.material,
    construction: p.construction,
    leadTime: p.leadTime ?? '',
    psfPrice: p.psfPrice != null ? String(p.psfPrice) : '',
  };
}

export function KapettoKitUpload({ kit, onClose }: KapettoKitUploadProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [uploadingProductIdx, setUploadingProductIdx] = useState<number | null>(null);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);

  // Inline product editing state: index => form, or -1 for new
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<ProductFormState>(EMPTY_FORM);
  const [savingProduct, setSavingProduct] = useState(false);
  const [deletingProductIdx, setDeletingProductIdx] = useState<number | null>(null);
  const [addingProduct, setAddingProduct] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);

  const { data: sampleKit, isLoading: loadingKit } = useQuery({
    queryKey: ['kapetto-sample-kit', kit.id],
    queryFn: () => getKapettoSampleKit(kit.id),
  });

  const isGuarded = sampleKit ? GUARDED_KIT_IDS.has(sampleKit.id) : false;

  // Flat photo upload
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
      // Ensure kit exists first
      const kitId = sampleKit?.id ?? await createKapettoSampleKit(kit.id, kit.name, kit.company);
      return uploadKitProductImage(kit.id, kitId, productIndex, compressed);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kapetto-kits'] });
      queryClient.invalidateQueries({ queryKey: ['kapetto-sample-kit', kit.id] });
      setUploadingProductIdx(null);
    },
    onError: () => setUploadingProductIdx(null),
  });

  const deleteMutation = useMutation({
    mutationFn: (photoUrl: string) => deleteKitPhoto(kit.id, photoUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kapetto-kits'] });
      setDeletingUrl(null);
    },
    onError: () => setDeletingUrl(null),
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingCount(files.length);
    for (let i = 0; i < files.length; i++) {
      try { await uploadMutation.mutateAsync(files[i]); } catch { /* logged */ }
      setUploadingCount((prev) => Math.max(0, prev - 1));
    }
    setUploadingCount(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleProductFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, productIndex: number) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingProductIdx(productIndex);
    productUploadMutation.mutate({ file, productIndex });
    e.target.value = '';
  };

  const handleDelete = (photoUrl: string) => {
    if (deletingUrl) return;
    setDeletingUrl(photoUrl);
    deleteMutation.mutate(photoUrl);
  };

  const startEdit = (idx: number) => {
    const p = sampleKit!.products[idx];
    setEditForm(productToForm(p));
    setEditingIdx(idx);
    setAddingProduct(false);
  };

  const startAdd = () => {
    setEditForm(EMPTY_FORM);
    setEditingIdx(-1);
    setAddingProduct(true);
  };

  const cancelEdit = () => {
    setEditingIdx(null);
    setAddingProduct(false);
    setEditForm(EMPTY_FORM);
  };

  const saveProduct = async () => {
    if (!editForm.productName.trim()) return;
    setSavingProduct(true);
    try {
      let kitId = sampleKit?.id;
      if (!kitId) {
        kitId = await createKapettoSampleKit(kit.id, kit.name, kit.company);
      }
      await upsertKapettoKitProduct(kitId, editingIdx ?? -1, {
        productName: editForm.productName.trim(),
        material: editForm.material.trim(),
        construction: editForm.construction.trim(),
        leadTime: editForm.leadTime.trim(),
        psfPrice: editForm.psfPrice ? Number(editForm.psfPrice) : null,
      });
      queryClient.invalidateQueries({ queryKey: ['kapetto-sample-kit', kit.id] });
      cancelEdit();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingProduct(false);
    }
  };

  const deleteProduct = async (idx: number) => {
    if (!sampleKit) return;
    setDeletingProductIdx(idx);
    try {
      await deleteKapettoKitProduct(sampleKit.id, idx);
      queryClient.invalidateQueries({ queryKey: ['kapetto-sample-kit', kit.id] });
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingProductIdx(null);
    }
  };

  const photos = kit.kitPhotos || [];
  const isUploading = uploadingCount > 0;
  const products = sampleKit?.products ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative w-full max-w-lg max-h-[92vh] bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {kit.designerCode && (
                <span className="px-2 py-0.5 bg-gray-900 text-white rounded text-xs font-mono font-bold flex-shrink-0">
                  {kit.designerCode}
                </span>
              )}
              <h2 className="font-bold text-gray-900 truncate">{kit.name}</h2>
            </div>
            <p className="text-sm text-gray-500 truncate mt-0.5">{kit.company}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
            {kit.stage && STAGE_LABEL[kit.stage] && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                {STAGE_LABEL[kit.stage]}
              </span>
            )}
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
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Products section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                Products
                {products.length > 0 && <span className="ml-1.5 text-gray-400 font-normal">({products.length})</span>}
              </h3>
              {!isGuarded && (
                <button
                  onClick={startAdd}
                  disabled={addingProduct || editingIdx !== null}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-900 text-white hover:bg-gray-700 transition-colors disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Product
                </button>
              )}
            </div>

            {loadingKit ? (
              <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading...
              </div>
            ) : (
              <div className="space-y-2">
                {/* Existing products */}
                {products.map((product, idx) => (
                  <div key={idx}>
                    {editingIdx === idx ? (
                      <ProductForm
                        form={editForm}
                        onChange={setEditForm}
                        onSave={saveProduct}
                        onCancel={cancelEdit}
                        saving={savingProduct}
                      />
                    ) : (
                      <div className="flex items-start gap-3 bg-gray-50 rounded-xl p-3">
                        {/* Image */}
                        <div className="flex-shrink-0 relative">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.productName}
                              className="w-16 h-16 rounded-lg object-cover border border-gray-200"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-lg bg-gray-200 flex items-center justify-center border border-dashed border-gray-300">
                              <Camera className="w-5 h-5 text-gray-400" />
                            </div>
                          )}
                          {!isGuarded && (
                            <label className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-white border border-gray-200 shadow flex items-center justify-center cursor-pointer hover:bg-gray-50">
                              {uploadingProductIdx === idx ? (
                                <Loader2 className="w-3 h-3 animate-spin text-gray-500" />
                              ) : (
                                <Camera className="w-3 h-3 text-gray-500" />
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

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 leading-tight">
                            {product.productName || <span className="text-gray-400 italic">No name</span>}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            <DetailBadge label="Material" value={product.material} />
                            <DetailBadge label="Construction" value={product.construction} />
                            <DetailBadge label="Lead time" value={product.leadTime} />
                            <DetailBadge
                              label="Price"
                              value={product.psfPrice != null ? `$${product.psfPrice}/sqft` : ''}
                            />
                          </div>
                        </div>

                        {/* Actions */}
                        {!isGuarded && (
                          <div className="flex flex-col gap-1.5 flex-shrink-0">
                            <button
                              onClick={() => startEdit(idx)}
                              className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:bg-blue-50 hover:border-blue-200 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5 text-gray-500" />
                            </button>
                            <button
                              onClick={() => deleteProduct(idx)}
                              disabled={deletingProductIdx === idx}
                              className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:bg-red-50 hover:border-red-200 transition-colors"
                            >
                              {deletingProductIdx === idx
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                                : <Trash2 className="w-3.5 h-3.5 text-gray-400" />}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {/* Add new product form */}
                {addingProduct && editingIdx === -1 && (
                  <ProductForm
                    form={editForm}
                    onChange={setEditForm}
                    onSave={saveProduct}
                    onCancel={cancelEdit}
                    saving={savingProduct}
                    isNew
                  />
                )}

                {/* Empty state */}
                {products.length === 0 && !addingProduct && (
                  <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center">
                    <p className="text-sm text-gray-400">No products yet — add one to get started</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Photos section — collapsible */}
          {!isGuarded && (
            <div>
              <button
                onClick={() => setShowPhotos(v => !v)}
                className="flex items-center justify-between w-full text-left"
              >
                <h3 className="text-sm font-semibold text-gray-700">
                  Photos
                  {photos.length > 0 && <span className="ml-1.5 text-gray-400 font-normal">({photos.length})</span>}
                </h3>
                {showPhotos ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>

              {showPhotos && (
                <div className="mt-3">
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
                      className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 hover:border-gray-400 hover:bg-gray-50 transition-colors"
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
            </div>
          )}

          {/* Read-only photos for guarded kits */}
          {isGuarded && photos.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Photos ({photos.length})</h3>
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function DetailBadge({ label, value }: { label: string; value: string | undefined | null }) {
  return (
    <div className={cn(
      'flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px]',
      value ? 'bg-stone-100 text-stone-700' : 'bg-gray-50 border border-dashed border-gray-200 text-gray-300'
    )}>
      <span className="font-medium">{label}:</span>
      <span>{value || '—'}</span>
    </div>
  );
}

function ProductForm({
  form,
  onChange,
  onSave,
  onCancel,
  saving,
  isNew = false,
}: {
  form: ProductFormState;
  onChange: (f: ProductFormState) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isNew?: boolean;
}) {
  const field = (key: keyof ProductFormState, placeholder: string, className = '') => (
    <input
      type="text"
      value={form[key]}
      onChange={e => onChange({ ...form, [key]: e.target.value })}
      placeholder={placeholder}
      className={cn(
        'w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white',
        className
      )}
    />
  );

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
      <p className="text-xs font-semibold text-blue-700 mb-1">{isNew ? 'New product' : 'Edit product'}</p>
      {field('productName', 'Design code + colour  e.g. 19-790 - WHITE BROWN', 'font-medium')}
      <div className="grid grid-cols-2 gap-2">
        {field('material', 'Material  e.g. Cashmere')}
        {field('construction', 'Construction  e.g. Hand Knotted')}
        {field('leadTime', 'Lead time  e.g. 12-16 weeks')}
        <input
          type="number"
          value={form.psfPrice}
          onChange={e => onChange({ ...form, psfPrice: e.target.value })}
          placeholder="Price/sqft  e.g. 85"
          className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={onSave}
          disabled={saving || !form.productName.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Save
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
