import { Routes, Route } from 'react-router-dom';
import { StudioDashboard } from './pages/StudioDashboard';
import { UploadPhotos } from './pages/UploadPhotos';
import { RugGallery, RugGalleryDetail } from './pages/RugGallery';

function App() {
  return (
    <Routes>
      <Route path="/" element={<StudioDashboard />} />
      <Route path="/upload/:type/:id" element={<UploadPhotos />} />
      <Route path="/rug-gallery" element={<RugGallery />} />
      <Route path="/rug-gallery/:designName" element={<RugGalleryDetail />} />
    </Routes>
  );
}

export default App;
