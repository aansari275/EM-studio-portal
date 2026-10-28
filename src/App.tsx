import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Library } from './pages/Library';

// Only the library loads up front. The rest are opened rarely and carry heavy
// dependencies, so they download when first visited.
const MyLinks = lazy(() => import('./pages/MyLinks').then((m) => ({ default: m.MyLinks })));
const More = lazy(() => import('./pages/More').then((m) => ({ default: m.More })));
const StudioDashboard = lazy(() => import('./pages/StudioDashboard').then((m) => ({ default: m.StudioDashboard })));
const UploadPhotos = lazy(() => import('./pages/UploadPhotos').then((m) => ({ default: m.UploadPhotos })));
const RugGallery = lazy(() => import('./pages/RugGallery').then((m) => ({ default: m.RugGallery })));
const RugGalleryDetail = lazy(() => import('./pages/RugGallery').then((m) => ({ default: m.RugGalleryDetail })));
const AdminMigrate = lazy(() => import('./pages/AdminMigrate').then((m) => ({ default: m.AdminMigrate })));

/**
 * Signed-in routes. The buyer-facing /c/:id lives in main.tsx, outside AuthGate.
 */
function App() {
  return (
    <Suspense fallback={<p className="py-16 text-center text-sm text-neutral-400">Loading…</p>}>
    <Routes>
      <Route path="/" element={<Library />} />
      <Route path="/links" element={<MyLinks />} />
      <Route path="/more" element={<More />} />

      {/* the older workflows, now reached from More */}
      <Route path="/dispatches" element={<StudioDashboard initialTab="dispatches" />} />
      <Route path="/sample-bazar" element={<StudioDashboard initialTab="sample-bazar" />} />
      <Route path="/kapetto" element={<StudioDashboard initialTab="kapetto-kits" />} />

      <Route path="/upload/:type/:id" element={<UploadPhotos />} />
      <Route path="/rug-gallery" element={<RugGallery />} />
      <Route path="/rug-gallery/:designName" element={<RugGalleryDetail />} />
      <Route path="/admin/migrate" element={<AdminMigrate />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}

export default App;
