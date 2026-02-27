import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import UploadPage from './pages/UploadPage';
import VerificationPage from './pages/VerificationPage';

function App() {
  return (
    <Router>
      <nav style={{ padding: '1rem', background: '#f5f5f5' }}>
        <Link to="/upload" style={{ marginRight: '1rem' }}>Upload</Link>
        <Link to="/dashboard">Dashboard</Link>
      </nav>

      <Routes>
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/verify/:jobId" element={<VerificationPage />} />
        <Route path="*" element={<h2>Welcome to SeekReap</h2>} />
      </Routes>
    </Router>
  );
}

export default App;
// Force clean deploy - Fri Feb 27 19:06:36 UTC 2026
