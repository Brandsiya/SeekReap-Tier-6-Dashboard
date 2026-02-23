import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import UploadPage from './pages/UploadPage';

function App() {
  return (
    <Router>
      <div>
        <nav style={{ padding: '1rem', background: '#f0f0f0' }}>
          <Link to="/dashboard" style={{ marginRight: '1rem' }}>Dashboard</Link>
          <Link to="/upload">Upload Video / URL</Link>
        </nav>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="*" element={<h2>Welcome! Go to <a href="/dashboard">Dashboard</a> or <a href="/upload">Upload</a></h2>} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
