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
  orderBy,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Collection references
const DISPATCHES_COLLECTION = 'sample_dispatches_to_buyers';
const SAMPLE_BAZAR_COLLECTION = 'sample_bazar';
const SHOWROOM_COLLECTION = 'Showroom_Products';
const EMPL_DESIGNS_COLLECTION = 'empl_designs';

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
  createdAt?: string;
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
 * Get all showroom products from Showroom_Products collection
 */
export async function getShowroomProducts(): Promise<ShowroomProduct[]> {
  try {
    const showroomRef = collection(db, SHOWROOM_COLLECTION);
    const snapshot = await getDocs(showroomRef);

    console.log('Showroom_Products count:', snapshot.size);

    const products = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();

      // Showroom_Products schema: firebaseUrl is main image, additionalImages is array
      const mainImage = data.firebaseUrl || data.imageUrl || '';
      const additionalImages = data.additionalImages || [];

      // Use baseStyleNumber if available, otherwise extract from styleNumber/displayName
      let baseStyleNumber = data.baseStyleNumber || '';
      if (!baseStyleNumber) {
        const name = data.styleNumber || data.displayName || '';
        // Extract base style (e.g., "EM-17-AM-418" from "EM-17-AM-418-GREY-YELLOW")
        const parts = name.split('-');
        baseStyleNumber = parts.length >= 4 ? parts.slice(0, 4).join('-') : name;
      }

      // Build materials string
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
        createdAt: timestampToString(data.createdAt),
      };
    });

    // Sort by displayName alphabetically
    return products.sort((a, b) => a.displayName.localeCompare(b.displayName));
  } catch (error) {
    console.error('Error fetching showroom products:', error);
    return [];
  }
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
 * Get all color variants for a specific design
 */
export async function getShowroomProductsByDesign(designName: string): Promise<ShowroomProduct[]> {
  const products = await getShowroomProducts();
  return products.filter(p => p.baseStyleNumber === designName || p.styleNumber === designName);
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
