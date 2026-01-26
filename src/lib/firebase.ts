import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
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
          emDesignName: p.emDesignName || '',
          clientDesignName: p.clientDesignName,
          quality: p.rawMaterials?.undyedYarn || p.construction?.quality || '',
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
        emDesignName: p.emDesignName || '',
        clientDesignName: p.clientDesignName,
        quality: p.rawMaterials?.undyedYarn || p.construction?.quality || '',
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
