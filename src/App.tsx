import { Routes, Route } from 'react-router-dom';
import { StudioDashboard } from './pages/StudioDashboard';
import { UploadPhotos } from './pages/UploadPhotos';

function App() {
  return (
    <Routes>
      <Route path="/" element={<StudioDashboard />} />
      <Route path="/upload/:type/:id" element={<UploadPhotos />} />
    </Routes>
  );
}

export default App;
