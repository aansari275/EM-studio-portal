import { Routes, Route, Navigate } from 'react-router-dom';
import { Library } from './pages/Library';
import { MyLinks } from './pages/MyLinks';
import { More } from './pages/More';
import { StudioDashboard } from './pages/StudioDashboard';
import { UploadPhotos } from './pages/UploadPhotos';
import { RugGallery, RugGalleryDetail } from './pages/RugGallery';
import { AdminMigrate } from './pages/AdminMigrate';

/**
 * Signed-in routes. The buyer-facing /c/:id lives in main.tsx, outside AuthGate.
 */
function App() {
  return (
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
  );
}

export default App;
