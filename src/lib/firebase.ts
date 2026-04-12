import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  Timestamp,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';

// Firebase configuration for easternmillscom project
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDummyKeyForDevelopment',
  authDomain: 'easternmillscom.firebaseapp.com',
  projectId: 'easternmillscom',
  storageBucket: 'easternmillscom.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

// Initialize Firebase — Eastern Mills (dispatches, sample bazar, showroom, rug gallery)
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);

// ─── Kapetto (kapetto-daa5e) — separate Firebase project for kapetto_* data ───
const kapettoConfig = {
  apiKey: import.meta.env.VITE_KAPETTO_API_KEY || '',
  authDomain: 'kapetto-daa5e.firebaseapp.com',
  projectId: 'kapetto-daa5e',
  storageBucket: 'kapetto-daa5e.firebasestorage.app',
};
const kapettoApp = initializeApp(kapettoConfig, 'kapetto');
export const dbKapetto = getFirestore(kapettoApp);
// Storage stays on EM bucket (kapetto assets live there by design)

// Collection references
const DISPATCHES_COLLECTION = 'sample_dispatches_to_buyers';
const SAMPLE_BAZAR_COLLECTION = 'sample_bazar';
const SHOWROOM_COLLECTION = 'showroom_products';
const EMPL_DESIGNS_COLLECTION = 'empl_designs';
const KAPETTO_PIPELINE_COLLECTION = 'kapetto_pipeline';
const KAPETTO_SAMPLE_KITS_COLLECTION = 'kapetto_sample_kits';

// ============================================
// Types
// ============================================

export interface DispatchPhoto {
  type: string;
  url: string;
  carpetNo: string;
  uploadedAt: string;
}

export interface DispatchProduct {
  carpetNo: string;
  emDesignName: string;
  clientDesignName?: string;
  quality?: string;
  // Raw photos from dispatch (reference only)
  rawPhotos: {
    frontPhoto?: string;
    backPhoto?: string;
    labelPhoto?: string;
    dyedHankPhoto?: string;
  };
  // Studio quality photos (uploaded by photographer)
  studioPhotos: DispatchPhoto[];
}

export interface DispatchForPhotos {
  id: string;
  buyerName: string;
  buyerCode: string;
  dispatchDate: string;
  products: DispatchProduct[];
  hasStudioPhotos: boolean;
  studioPhotoCount: number;
  pptFile?: {
    url: string;
    name: string;
    uploadedAt: string;
  };
}

export interface SampleBazarPhoto {
  type: string;
  url: string;
  uploadedAt: string;
}

export interface SampleBazarForPhotos {
  id: string;
  carpetNo: string;
  emDesignName: string;
  quality: string;
  createdAt: string;
  photos: SampleBazarPhoto[];
  hasPhotos: boolean;
  photoCount: number;
}

// ============================================
// Kapetto Kits Types
// ============================================

export interface KapettoKit {
  id: string;
  name: string;
  company: string;
  title?: string;
  segment?: string;
  stage: string;
  kitPhotos?: string[];
  sampleKitId?: string;
  updatedAt: any;
}

export interface KapettoSampleKitProduct {
  productName: string;
  collectionName: string;
  imageUrl: string;
  material: string;
  construction: string;
  quantity: number;
}

export interface KapettoSampleKit {
  id: string;
  pipelineLeadId: string;
  products: KapettoSampleKitProduct[];
}

// ============================================
// Utility Functions
// ============================================

function timestampToString(timestamp: Timestamp | Date | { seconds: number; nanoseconds: number } | string | null | undefined): string {
  const UNKNOWN_DATE = '2020-01-01T00:00:00.000Z';

  if (!timestamp) return UNKNOWN_DATE;
  if (typeof timestamp === 'string') return timestamp;
  if (timestamp instanceof Date) return timestamp.toISOString();
  if (typeof timestamp === 'object' && 'toDate' in timestamp && typeof timestamp.toDate === 'function') {
    return timestamp.toDate().toISOString();
  }
  if (typeof timestamp === 'object' && 'seconds' in timestamp) {
    return new Date(timestamp.seconds * 1000).toISOString();
  }
  return UNKNOWN_DATE;
}

// ============================================
// Sample Dispatches - For Studio Portal
// ============================================

/**
 * Get all dispatches that need photos
 */
export async function getPendingDispatches(): Promise<DispatchForPhotos[]> {
  try {
    const dispatchesRef = collection(db, DISPATCHES_COLLECTION);
    const q = query(dispatchesRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data();

      // Map products from the actual dispatch structure
      const products = (data.products || []).map((p: any) => {
        // Raw photos from dispatch (for reference)
        const rawPhotos = {
          frontPhoto: p.frontPhoto || undefined,
          backPhoto: p.backPhoto || undefined,
          labelPhoto: p.labelPhoto || undefined,
          dyedHankPhoto: p.dyedHankPhoto || undefined,
        };

        // Studio photos (uploaded by photographer)
        const studioPhotos: DispatchPhoto[] = p.studioPhotos || [];

        return {
          carpetNo: p.carpetNo || '',
          emDesignName: p.emDesignName || p.designName || '',
          clientDesignName: p.clientDesignName,
          quality: p.rawMaterials?.undyedYarn || p.construction?.quality || p.quality || p.yarnType || p.material || '',
          rawPhotos,
          studioPhotos,
        };
      });

      // Count studio photos only
      const allStudioPhotos = products.flatMap((p: DispatchProduct) => p.studioPhotos);
      const hasStudioPhotos = products.length > 0 && products.every((p: DispatchProduct) =>
        p.studioPhotos.some(photo => photo.type === 'main')
      );

      return {
        id: docSnap.id,
        buyerName: data.buyerName || '',
        buyerCode: data.buyerCode || '',
        dispatchDate: timestampToString(data.dispatchDate || data.createdAt),
        products,
        hasStudioPhotos,
        studioPhotoCount: allStudioPhotos.length,
        pptFile: data.pptFile || undefined,
      };
    });
  } catch (error) {
    console.error('Error fetching dispatches:', error);
    return [];
  }
}

/**
 * Get a single dispatch for photo upload
 */
export async function getDispatchForPhotos(id: string): Promise<DispatchForPhotos | null> {
  try {
    const docRef = doc(db, DISPATCHES_COLLECTION, id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;

    const data = docSnap.data();

    // Map products from the actual dispatch structure
    const products = (data.products || []).map((p: any) => {
      // Raw photos from dispatch (for reference)
      const rawPhotos = {
        frontPhoto: p.frontPhoto || undefined,
        backPhoto: p.backPhoto || undefined,
        labelPhoto: p.labelPhoto || undefined,
        dyedHankPhoto: p.dyedHankPhoto || undefined,
      };

      // Studio photos (uploaded by photographer)
      const studioPhotos: DispatchPhoto[] = p.studioPhotos || [];

      return {
        carpetNo: p.carpetNo || '',
        emDesignName: p.emDesignName || p.designName || '',
        clientDesignName: p.clientDesignName,
        quality: p.rawMaterials?.undyedYarn || p.construction?.quality || p.quality || p.yarnType || p.material || '',
        rawPhotos,
        studioPhotos,
      };
    });

    // Count studio photos only
    const allStudioPhotos = products.flatMap((p: DispatchProduct) => p.studioPhotos);

    return {
      id: docSnap.id,
      buyerName: data.buyerName || '',
      buyerCode: data.buyerCode || '',
      dispatchDate: timestampToString(data.dispatchDate || data.createdAt),
      products,
      hasStudioPhotos: products.length > 0 && products.every((p: DispatchProduct) => p.studioPhotos.some(photo => photo.type === 'main')),
      studioPhotoCount: allStudioPhotos.length,
      pptFile: data.pptFile || undefined,
    };
  } catch (error) {
    console.error('Error fetching dispatch:', error);
    return null;
  }
}

/**
 * Upload a photo for a dispatch product
 * Saves to studioPhotos array within the product to avoid conflicts with existing photos
 */
export async function uploadDispatchPhoto(
  dispatchId: string,
  carpetNo: string,
  file: File,
  photoType: string
): Promise<string> {
  try {
    // Upload to Firebase Storage
    const extension = file.name.split('.').pop() || 'jpg';
    const fileName = `${carpetNo}_${photoType}_${Date.now()}.${extension}`;
    const storagePath = `studio-photos/dispatches/${dispatchId}/${fileName}`;

    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);

    // Update the dispatch document
    const docRef = doc(db, DISPATCHES_COLLECTION, dispatchId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) throw new Error('Dispatch not found');

    const data = docSnap.data();
    const products = data.products || [];

    // Find and update the product with studioPhotos
    const updatedProducts = products.map((p: any) => {
      if (p.carpetNo === carpetNo || (!p.carpetNo && !carpetNo)) {
        const existingStudioPhotos = p.studioPhotos || [];
        // Remove existing photo of same type
        const filteredPhotos = existingStudioPhotos.filter((photo: any) => photo.type !== photoType);
        return {
          ...p,
          studioPhotos: [
            ...filteredPhotos,
            {
              type: photoType,
              url: downloadURL,
              carpetNo,
              uploadedAt: new Date().toISOString(),
            },
          ],
        };
      }
      return p;
    });

    await updateDoc(docRef, {
      products: updatedProducts,
      updatedAt: serverTimestamp(),
    });

    return downloadURL;
  } catch (error) {
    console.error('Error uploading dispatch photo:', error);
    throw error;
  }
}

// ============================================
// Sample Bazar - For Studio Portal
// ============================================

/**
 * Get all sample bazar items that need photos
 */
export async function getPendingSampleBazar(): Promise<SampleBazarForPhotos[]> {
  try {
    const sampleBazarRef = collection(db, SAMPLE_BAZAR_COLLECTION);
    const q = query(sampleBazarRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      const photos = data.photos || [];
      const hasMainPhoto = photos.some((p: any) => p.type === 'main');

      return {
        id: docSnap.id,
        carpetNo: data.carpetNo || '',
        emDesignName: data.emDesignName || data.designName || '',
        quality: data.quality || '',
        createdAt: timestampToString(data.createdAt),
        photos,
        hasPhotos: hasMainPhoto,
        photoCount: photos.length,
      };
    });
  } catch (error) {
    console.error('Error fetching sample bazar:', error);
    return [];
  }
}

/**
 * Get a single sample bazar item for photo upload
 */
export async function getSampleBazarForPhotos(id: string): Promise<SampleBazarForPhotos | null> {
  try {
    const docRef = doc(db, SAMPLE_BAZAR_COLLECTION, id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;

    const data = docSnap.data();
    const photos = data.photos || [];

    return {
      id: docSnap.id,
      carpetNo: data.carpetNo || '',
      emDesignName: data.emDesignName || data.designName || '',
      quality: data.quality || '',
      createdAt: timestampToString(data.createdAt),
      photos,
      hasPhotos: photos.some((p: any) => p.type === 'main'),
      photoCount: photos.length,
    };
  } catch (error) {
    console.error('Error fetching sample bazar item:', error);
    return null;
  }
}

/**
 * Upload a PPT file for a dispatch
 */
export async function uploadDispatchPpt(
  dispatchId: string,
  file: File
): Promise<string> {
  try {
    // Upload to Firebase Storage
    const extension = file.name.split('.').pop() || 'pptx';
    const fileName = `presentation_${Date.now()}.${extension}`;
    const storagePath = `studio-photos/dispatches/${dispatchId}/ppt/${fileName}`;

    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);

    // Update the dispatch document
    const docRef = doc(db, DISPATCHES_COLLECTION, dispatchId);

    await updateDoc(docRef, {
      pptFile: {
        url: downloadURL,
        name: file.name,
        uploadedAt: new Date().toISOString(),
      },
      updatedAt: serverTimestamp(),
    });

    return downloadURL;
  } catch (error) {
    console.error('Error uploading PPT:', error);
    throw error;
  }
}

/**
 * Upload a photo for a sample bazar product
 */
export async function uploadSampleBazarPhoto(
  productId: string,
  file: File,
  photoType: string
): Promise<string> {
  try {
    // Upload to Firebase Storage
    const extension = file.name.split('.').pop() || 'jpg';
    const fileName = `${photoType}_${Date.now()}.${extension}`;
    const storagePath = `sample-bazar/${productId}/${fileName}`;

    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);

    // Update the sample bazar document
    const docRef = doc(db, SAMPLE_BAZAR_COLLECTION, productId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) throw new Error('Product not found');

    const data = docSnap.data();
    const existingPhotos = data.photos || [];

    // Remove existing photo of same type
    const filteredPhotos = existingPhotos.filter((photo: any) => photo.type !== photoType);

    await updateDoc(docRef, {
      photos: [
        ...filteredPhotos,
        {
          type: photoType,
          url: downloadURL,
          uploadedAt: new Date().toISOString(),
        },
      ],
      updatedAt: serverTimestamp(),
    });

    return downloadURL;
  } catch (error) {
    console.error('Error uploading sample bazar photo:', error);
    throw error;
  }
}

/**
 * Upload a STUDIO photo for a sample bazar product
 * This writes to the new `studioImages` array field (NOT the legacy photos array)
 * Studio photos are professional photos taken by the studio team
 */
export async function uploadSampleBazarStudioPhoto(
  productId: string,
  file: File,
  photoType: string = 'main'
): Promise<string> {
  try {
    // Upload to Firebase Storage - use studio subfolder
    const extension = file.name.split('.').pop() || 'jpg';
    const fileName = `studio_${photoType}_${Date.now()}.${extension}`;
    const storagePath = `sample-bazar/${productId}/studio/${fileName}`;

    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);

    // Update the sample bazar document - append to studioImages array
    const docRef = doc(db, SAMPLE_BAZAR_COLLECTION, productId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) throw new Error('Product not found');

    const data = docSnap.data();
    const existingStudioImages = data.studioImages || [];

    // For 'main' type, replace existing main photo; for others, append
    let newStudioImages;
    if (photoType === 'main') {
      // Replace existing main photo
      newStudioImages = existingStudioImages.filter((img: any) => img.type !== 'main');
    } else {
      newStudioImages = [...existingStudioImages];
    }

    // Add the new photo
    newStudioImages.push({
      url: downloadURL,
      uploadedAt: new Date().toISOString(),
      uploadedBy: 'Studio Team',
      type: photoType,
    });

    await updateDoc(docRef, {
      studioImages: newStudioImages,
      updatedAt: serverTimestamp(),
    });

    return downloadURL;
  } catch (error) {
    console.error('Error uploading sample bazar studio photo:', error);
    throw error;
  }
}

/**
 * Get sample bazar items that need studio photos
 * Returns items that don't have any studioImages yet
 */
export async function getSampleBazarNeedingStudioPhotos(): Promise<SampleBazarForPhotos[]> {
  try {
    const sampleBazarRef = collection(db, SAMPLE_BAZAR_COLLECTION);
    const q = query(sampleBazarRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);

    return snapshot.docs
      .map((docSnap) => {
        const data = docSnap.data();
        const studioImages = data.studioImages || [];
        const photos = data.photos || [];
        const hasStudioMain = studioImages.some((img: any) => img.type === 'main');

        return {
          id: docSnap.id,
          carpetNo: data.carpetNo || '',
          emDesignName: data.designName || data.emDesignName || '',
          quality: data.quality || data.construction || '',
          createdAt: timestampToString(data.createdAt),
          photos,
          hasPhotos: hasStudioMain,
          photoCount: studioImages.length,
          // Additional fields for studio context
          studioImages,
          factoryImages: data.images || {},
        };
      })
      .filter((item) => !item.hasPhotos); // Only show items needing studio photos
  } catch (error) {
    console.error('Error fetching sample bazar for studio photos:', error);
    return [];
  }
}

// ============================================
// Showroom Products - Rug Gallery
// ============================================

export interface ShowroomProduct {
  id: string;
  baseStyleNumber: string; // Design identifier (e.g., "EM-17-AM-418")
  styleNumber: string; // Full ID with color (e.g., "EM-17-AM-418-GREY-YELLOW")
  displayName: string;
  firebaseUrl: string; // Main image URL
  additionalImages?: string[];
  color?: string;
  materials?: string;
  construction?: string;
  category?: string;
  size?: string;
  gsm?: string; // Grams per square meter
  createdAt?: string;
  // Source tracking
  source?: string; // e.g., "Heimtextil 2026"
  tags?: string[]; // e.g., ["Heimtextil 2026"]
}

export interface DesignGroup {
  designName: string; // baseStyleNumber
  displayName: string;
  mainImage: string;
  photoCount: number;
  colorVariants: ShowroomProduct[];
  materials?: string;
  construction?: string;
}

export interface EmplDesignPhoto {
  url: string;
  type: string;
  uploadedAt: string;
}

export interface EmplDesign {
  id: string;
  designName: string;
  displayName?: string;
  photos: EmplDesignPhoto[];
  linkedShowroomProducts: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Get showroom products with pagination (latest first)
 */
export async function getShowroomProducts(limitCount: number = 100): Promise<ShowroomProduct[]> {
  try {
    const showroomRef = collection(db, SHOWROOM_COLLECTION);
    const q = query(showroomRef, orderBy('createdAt', 'desc'), limit(limitCount));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((docSnap) => mapShowroomDoc(docSnap));
  } catch (error) {
    console.error('Error fetching showroom products:', error);
    return [];
  }
}

/**
 * Get total count of showroom products
 */
export async function getShowroomProductsCount(): Promise<number> {
  try {
    const showroomRef = collection(db, SHOWROOM_COLLECTION);
    const snapshot = await getDocs(showroomRef);
    return snapshot.size;
  } catch (error) {
    console.error('Error getting count:', error);
    return 0;
  }
}

/**
 * Search showroom products by name, style number, color, etc.
 * Fetches all products and filters client-side (Firestore doesn't support full-text search)
 */
export async function searchShowroomProducts(searchTerm: string, limitCount: number = 200): Promise<ShowroomProduct[]> {
  try {
    const showroomRef = collection(db, SHOWROOM_COLLECTION);
    // Fetch all products for search (paginated)
    const allDocs: any[] = [];
    let lastDoc: any = null;
    const batchSize = 500;

    // Fetch up to 10,000 products for search
    while (allDocs.length < 10000) {
      const q = lastDoc
        ? query(showroomRef, orderBy('createdAt', 'desc'), limit(batchSize), startAfter(lastDoc))
        : query(showroomRef, orderBy('createdAt', 'desc'), limit(batchSize));

      const snapshot = await getDocs(q);
      if (snapshot.empty) break;

      allDocs.push(...snapshot.docs);
      lastDoc = snapshot.docs[snapshot.docs.length - 1];

      if (snapshot.docs.length < batchSize) break;
    }

    const term = searchTerm.toLowerCase();
    const filtered = allDocs
      .filter(doc => {
        const data = doc.data();
        // Search across all relevant fields
        return (
          data.displayName?.toLowerCase().includes(term) ||
          data.styleNumber?.toLowerCase().includes(term) ||
          data.baseStyleNumber?.toLowerCase().includes(term) ||
          data.productId?.toLowerCase().includes(term) ||
          data.construction?.toLowerCase().includes(term) ||
          data.color?.toLowerCase().includes(term) ||
          data.category?.toLowerCase().includes(term) ||
          data.materials?.toLowerCase().includes(term) ||
          data.size?.toLowerCase().includes(term) ||
          data.gsm?.toLowerCase().includes(term) ||
          doc.id?.toLowerCase().includes(term)
        );
      })
      .slice(0, limitCount)
      .map(doc => mapShowroomDoc(doc));

    return filtered;
  } catch (error) {
    console.error('Error searching showroom products:', error);
    return [];
  }
}

/**
 * Map Firestore doc to ShowroomProduct
 */
function mapShowroomDoc(docSnap: any): ShowroomProduct {
  const data = docSnap.data();

  const mainImage = data.firebaseUrl || data.imageUrl || '';
  // Support both field names: additionalImages (showroom) and additionalImageUrls (heimtextil)
  const additionalImages = data.additionalImages || data.additionalImageUrls || [];

  let baseStyleNumber = data.baseStyleNumber || '';
  if (!baseStyleNumber) {
    const name = data.styleNumber || data.displayName || '';
    const parts = name.split('-');
    baseStyleNumber = parts.length >= 4 ? parts.slice(0, 4).join('-') : name;
  }

  let materialsStr = data.materials || '';
  if (Array.isArray(data.materials)) {
    materialsStr = data.materials.map((m: any) => typeof m === 'string' ? m : m.name).filter(Boolean).join(', ');
  }

  return {
    id: docSnap.id,
    baseStyleNumber,
    styleNumber: data.styleNumber || data.displayName || '',
    displayName: data.displayName || data.styleNumber || '',
    firebaseUrl: mainImage,
    additionalImages: Array.isArray(additionalImages) ? additionalImages : [],
    color: data.color || '',
    materials: materialsStr,
    construction: data.construction || '',
    category: data.category || '',
    size: data.size || '',
    gsm: data.gsm || '',
    createdAt: timestampToString(data.createdAt),
    source: data.source || '',
    tags: data.tags || [],
  };
}

/**
 * Get showroom products grouped by design (baseStyleNumber)
 */
export async function getShowroomProductsGrouped(): Promise<DesignGroup[]> {
  const products = await getShowroomProducts();

  // Group by baseStyleNumber
  const grouped = products.reduce((acc, product) => {
    const key = product.baseStyleNumber || product.styleNumber;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(product);
    return acc;
  }, {} as Record<string, ShowroomProduct[]>);

  // Convert to DesignGroup array
  return Object.entries(grouped).map(([designName, variants]) => {
    const firstVariant = variants[0];

    // Count all photos (main + additional for all variants)
    const photoCount = variants.reduce((count, v) => {
      let c = v.firebaseUrl ? 1 : 0;
      c += v.additionalImages?.length || 0;
      return count + c;
    }, 0);

    return {
      designName,
      displayName: designName,
      mainImage: firstVariant.firebaseUrl || '',
      photoCount,
      colorVariants: variants,
      materials: firstVariant.materials,
      construction: firstVariant.construction,
    };
  }).sort((a, b) => a.designName.localeCompare(b.designName));
}

/**
 * Get a single showroom product by ID
 */
export async function getShowroomProductById(productId: string): Promise<ShowroomProduct | null> {
  try {
    const docRef = doc(db, SHOWROOM_COLLECTION, productId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;

    return mapShowroomDoc(docSnap);
  } catch (error) {
    console.error('Error fetching showroom product:', error);
    return null;
  }
}

/**
 * Get all color variants for a specific design (by baseStyleNumber)
 */
export async function getShowroomProductsByDesign(baseStyleNumber: string): Promise<ShowroomProduct[]> {
  try {
    const showroomRef = collection(db, SHOWROOM_COLLECTION);
    // Query by baseStyleNumber
    const q = query(showroomRef, orderBy('createdAt', 'desc'), limit(50));
    const snapshot = await getDocs(q);

    return snapshot.docs
      .map(doc => mapShowroomDoc(doc))
      .filter(p => p.baseStyleNumber === baseStyleNumber);
  } catch (error) {
    console.error('Error fetching products by design:', error);
    return [];
  }
}

/**
 * Get or create an EMPL design entry
 */
export async function getEmplDesign(designName: string): Promise<EmplDesign | null> {
  try {
    const docRef = doc(db, EMPL_DESIGNS_COLLECTION, designName);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;

    const data = docSnap.data();
    return {
      id: docSnap.id,
      designName: data.designName || designName,
      displayName: data.displayName,
      photos: data.photos || [],
      linkedShowroomProducts: data.linkedShowroomProducts || [],
      createdAt: timestampToString(data.createdAt),
      updatedAt: timestampToString(data.updatedAt),
    };
  } catch (error) {
    console.error('Error fetching EMPL design:', error);
    return null;
  }
}

/**
 * Get all EMPL designs
 */
export async function getEmplDesigns(): Promise<EmplDesign[]> {
  try {
    const designsRef = collection(db, EMPL_DESIGNS_COLLECTION);
    const snapshot = await getDocs(designsRef);

    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        designName: data.designName || docSnap.id,
        displayName: data.displayName,
        photos: data.photos || [],
        linkedShowroomProducts: data.linkedShowroomProducts || [],
        createdAt: timestampToString(data.createdAt),
        updatedAt: timestampToString(data.updatedAt),
      };
    });
  } catch (error) {
    console.error('Error fetching EMPL designs:', error);
    return [];
  }
}

/**
 * Upload a photo to an EMPL design
 */
export async function uploadDesignPhoto(
  designName: string,
  file: File,
  photoType: string = 'gallery'
): Promise<string> {
  try {
    // Upload to Firebase Storage
    const extension = file.name.split('.').pop() || 'jpg';
    const fileName = `${photoType}_${Date.now()}.${extension}`;
    const storagePath = `empl-designs/${designName}/${fileName}`;

    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);

    // Check if design doc exists
    const docRef = doc(db, EMPL_DESIGNS_COLLECTION, designName);
    const docSnap = await getDoc(docRef);

    const newPhoto: EmplDesignPhoto = {
      url: downloadURL,
      type: photoType,
      uploadedAt: new Date().toISOString(),
    };

    if (docSnap.exists()) {
      // Update existing doc
      const data = docSnap.data();
      const existingPhotos = data.photos || [];

      await updateDoc(docRef, {
        photos: [...existingPhotos, newPhoto],
        updatedAt: serverTimestamp(),
      });
    } else {
      // Create new doc
      await setDoc(docRef, {
        designName,
        photos: [newPhoto],
        linkedShowroomProducts: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    return downloadURL;
  } catch (error) {
    console.error('Error uploading design photo:', error);
    throw error;
  }
}

/**
 * Seed empl_designs collection from Showroom_Products
 * Call this once to populate the master design library
 */
export async function seedEmplDesignsFromShowroom(): Promise<{ created: number; skipped: number }> {
  const products = await getShowroomProducts();

  // Group by baseStyleNumber
  const grouped = products.reduce((acc, product) => {
    const key = product.baseStyleNumber || product.styleNumber;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(product);
    return acc;
  }, {} as Record<string, ShowroomProduct[]>);

  let created = 0;
  let skipped = 0;

  for (const [designName, variants] of Object.entries(grouped)) {
    const docRef = doc(db, EMPL_DESIGNS_COLLECTION, designName);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      skipped++;
      continue;
    }

    // Create new design entry
    await setDoc(docRef, {
      designName,
      displayName: designName,
      photos: [],
      linkedShowroomProducts: variants.map(v => v.styleNumber),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    created++;
  }

  return { created, skipped };
}

// ============================================
// Migration: Heimtextil Products → Showroom
// ============================================

const HEIMTEXTIL_COLLECTION = 'heimtextil_products';

/**
 * Migrate all heimtextil_products to showroom_products with a tag
 * Run this once to merge the collections
 */
export async function migrateHeimtextilToShowroom(): Promise<{ migrated: number; skipped: number; errors: string[] }> {
  const heimtextilRef = collection(db, HEIMTEXTIL_COLLECTION);
  const snapshot = await getDocs(heimtextilRef);

  let migrated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const docSnap of snapshot.docs) {
    try {
      const data = docSnap.data();

      // Check if already exists in showroom_products
      const showroomDocRef = doc(db, SHOWROOM_COLLECTION, docSnap.id);
      const existingDoc = await getDoc(showroomDocRef);

      if (existingDoc.exists()) {
        // Update existing doc with tag if not already tagged
        const existingData = existingDoc.data();
        if (!existingData.source) {
          await updateDoc(showroomDocRef, {
            source: 'Heimtextil 2026',
            tags: ['Heimtextil 2026'],
            migratedAt: serverTimestamp(),
          });
        }
        skipped++;
        continue;
      }

      // Create new doc in showroom_products with Heimtextil tag
      await setDoc(showroomDocRef, {
        ...data,
        source: 'Heimtextil 2026',
        tags: ['Heimtextil 2026'],
        migratedAt: serverTimestamp(),
        createdAt: data.createdAt || serverTimestamp(),
      });

      migrated++;
    } catch (error) {
      errors.push(`Error migrating ${docSnap.id}: ${error}`);
    }
  }

  console.log(`Migration complete: ${migrated} migrated, ${skipped} skipped, ${errors.length} errors`);
  return { migrated, skipped, errors };
}

/**
 * Get count of heimtextil_products (to verify before migration)
 */
export async function getHeimtextilCount(): Promise<number> {
  const heimtextilRef = collection(db, HEIMTEXTIL_COLLECTION);
  const snapshot = await getDocs(heimtextilRef);
  return snapshot.size;
}

// ============================================
// Kapetto Kits - For Studio Portal
// ============================================

/**
 * Fetch pipeline leads where stage is 'sample_requested', 'sample_sent', or 'follow_up'
 * Reads from kapetto-daa5e (all kapetto_* collections migrated there 2026-04-11)
 */
export async function getKapettoKits(): Promise<KapettoKit[]> {
  try {
    const pipelineRef = collection(dbKapetto, KAPETTO_PIPELINE_COLLECTION);

    // Three queries: one per stage
    const q1 = query(pipelineRef, where('stage', '==', 'sample_requested'));
    const q2 = query(pipelineRef, where('stage', '==', 'sample_sent'));
    const q3 = query(pipelineRef, where('stage', '==', 'follow_up'));

    const [snap1, snap2, snap3] = await Promise.all([getDocs(q1), getDocs(q2), getDocs(q3)]);

    const mapDoc = (docSnap: any): KapettoKit => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        name: data.name || data.contactName || '',
        company: data.company || data.companyName || '',
        title: data.title || '',
        segment: data.segment || '',
        stage: data.stage || '',
        kitPhotos: data.kitPhotos || [],
        sampleKitId: data.sampleKitId || '',
        updatedAt: data.updatedAt || data.createdAt || null,
      };
    };

    const results = [
      ...snap1.docs.map(mapDoc),
      ...snap2.docs.map(mapDoc),
      ...snap3.docs.map(mapDoc),
    ];

    // Sort by updatedAt desc
    results.sort((a, b) => {
      const aTime = a.updatedAt?.seconds || 0;
      const bTime = b.updatedAt?.seconds || 0;
      return bTime - aTime;
    });

    return results;
  } catch (error) {
    console.error('Error fetching kapetto kits:', error);
    return [];
  }
}

/**
 * Fetch sample kit products by pipeline lead ID
 */
export async function getKapettoSampleKit(leadId: string): Promise<KapettoSampleKit | null> {
  try {
    const kitsRef = collection(dbKapetto, KAPETTO_SAMPLE_KITS_COLLECTION);
    const q = query(kitsRef, where('pipelineLeadId', '==', leadId), limit(1));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return null;

    const docSnap = snapshot.docs[0];
    const data = docSnap.data();

    return {
      id: docSnap.id,
      pipelineLeadId: data.pipelineLeadId || leadId,
      products: (data.products || []).map((p: any) => ({
        productName: p.productName || '',
        collectionName: p.collectionName || '',
        imageUrl: p.imageUrl || '',
        material: p.material || '',
        construction: p.construction || '',
        quantity: p.quantity || 1,
      })),
    };
  } catch (error) {
    console.error('Error fetching kapetto sample kit:', error);
    return null;
  }
}

/**
 * Upload kit photo to Firebase Storage and update kitPhotos array on pipeline doc
 */
export async function uploadKitPhoto(leadId: string, file: File): Promise<string> {
  try {
    const extension = file.name.split('.').pop() || 'jpg';
    const fileName = `${Date.now()}_${file.name.replace(/\.[^.]+$/, '')}.${extension}`;
    const storagePath = `kapetto-kits/${leadId}/${fileName}`;

    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);

    // Update kapetto_pipeline doc on daa5e: add URL to kitPhotos array
    const docRef = doc(dbKapetto, KAPETTO_PIPELINE_COLLECTION, leadId);
    await updateDoc(docRef, {
      kitPhotos: arrayUnion(downloadURL),
      updatedAt: serverTimestamp(),
    });

    return downloadURL;
  } catch (error) {
    console.error('Error uploading kit photo:', error);
    throw error;
  }
}

/**
 * Upload a photo for a specific product in a sample kit.
 * 1. Uploads file to Firebase Storage
 * 2. Updates kapetto_sample_kits.products[index].imageUrl on daa5e
 * 3. Also appends to kitPhotos[] on the pipeline doc (backward compat for thumbnails)
 */
export async function uploadKitProductImage(
  leadId: string,
  sampleKitId: string,
  productIndex: number,
  file: File
): Promise<string> {
  try {
    const extension = file.name.split('.').pop() || 'jpg';
    const fileName = `${Date.now()}_product${productIndex}.${extension}`;
    const storagePath = `kapetto-sample-kits/${sampleKitId}/products/${fileName}`;

    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);

    // 1. Update the specific product's imageUrl in the sample kit doc (daa5e)
    const kitRef = doc(dbKapetto, KAPETTO_SAMPLE_KITS_COLLECTION, sampleKitId);
    const kitSnap = await getDoc(kitRef);
    if (kitSnap.exists()) {
      const kitData = kitSnap.data();
      const products = [...(kitData.products || [])];
      if (products[productIndex]) {
        products[productIndex] = { ...products[productIndex], imageUrl: downloadURL };
        await updateDoc(kitRef, { products, updatedAt: serverTimestamp() });
      }
    }

    // 2. Also append to kitPhotos on the pipeline doc (backward compat)
    const pipelineRef = doc(dbKapetto, KAPETTO_PIPELINE_COLLECTION, leadId);
    await updateDoc(pipelineRef, {
      kitPhotos: arrayUnion(downloadURL),
      updatedAt: serverTimestamp(),
    });

    return downloadURL;
  } catch (error) {
    console.error('Error uploading kit product image:', error);
    throw error;
  }
}

/**
 * Delete a kit photo from storage and remove from kitPhotos array
 */
export async function deleteKitPhoto(leadId: string, photoUrl: string): Promise<void> {
  try {
    // Extract storage path from download URL
    // Firebase Storage URLs contain the path encoded between /o/ and ?
    const urlObj = new URL(photoUrl);
    const pathMatch = urlObj.pathname.match(/\/o\/(.+)/);
    if (pathMatch) {
      const storagePath = decodeURIComponent(pathMatch[1]);
      const storageRef = ref(storage, storagePath);
      await deleteObject(storageRef).catch((err) => {
        console.warn('Could not delete from storage (may already be deleted):', err);
      });
    }

    // Remove URL from kitPhotos array on pipeline doc (daa5e)
    const docRef = doc(dbKapetto, KAPETTO_PIPELINE_COLLECTION, leadId);
    await updateDoc(docRef, {
      kitPhotos: arrayRemove(photoUrl),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error deleting kit photo:', error);
    throw error;
  }
}
