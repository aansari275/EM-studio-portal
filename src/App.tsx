import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { tabForPath } from './lib/tabContext';

// The older workflows open as plain full pages outside the shell, and download
// when first visited.
const StudioDashboard = lazy(() => import('./pages/StudioDashboard').then((m) => ({ default: m.StudioDashboard })));
const UploadPhotos = lazy(() => import('./pages/UploadPhotos').then((m) => ({ default: m.UploadPhotos })));
const RugGallery = lazy(() => import('./pages/RugGallery').then((m) => ({ default: m.RugGallery })));
const RugGalleryDetail = lazy(() => import('./pages/RugGallery').then((m) => ({ default: m.RugGalleryDetail })));
const AdminMigrate = lazy(() => import('./pages/AdminMigrate').then((m) => ({ default: m.AdminMigrate })));

/**
 * Signed-in routes. The buyer-facing /c/:id lives in main.tsx, outside AuthGate.
 *
 * The six studio pages (Library, Custom Rugs, Sample Dispatch, Background
 * Removal, My links, More) are tabs inside one AppShell, rendered outside
 * <Routes> so the shell, and every open tab, stays mounted across their URLs.
 */
function App() {
  const { pathname } = useLocation();
  if (tabForPath(pathname)) return <AppShell />;

  return (
    <Suspense fallback={<p className="py-16 text-center text-sm text-neutral-400">Loading…</p>}>
    <Routes>
      {/* the older workflows, reached from More */}
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
