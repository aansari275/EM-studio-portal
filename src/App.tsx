import { Routes, Route } from 'react-router-dom';
import { StudioDashboard } from './pages/StudioDashboard';
import { UploadPhotos } from './pages/UploadPhotos';
import { RugGallery, RugGalleryDetail } from './pages/RugGallery';
import { AdminMigrate } from './pages/AdminMigrate';

function App() {
  return (
    <Routes>
      <Route path="/" element={<StudioDashboard />} />
      <Route path="/upload/:type/:id" element={<UploadPhotos />} />
      <Route path="/rug-gallery" element={<RugGallery />} />
      <Route path="/rug-gallery/:designName" element={<RugGalleryDetail />} />
      <Route path="/admin/migrate" element={<AdminMigrate />} />
    </Routes>
  );
}

export default App;
