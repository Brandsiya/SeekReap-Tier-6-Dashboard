import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function UploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('');

  const handleSubmit = async () => {
    const formData = new FormData();
    
    if (file) {
      formData.append('videoFile', file);
    }
    
    if (url) {
      formData.append('youtubeUrl', url);
    }

    setStatus('Submitting...');

    try {
      const API_BASE = process.env.REACT_APP_API_URL || 'https://seekreap.onrender.com';
      const res = await fetch(`${API_BASE}/api/submit`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error('Submission failed');
      }

      navigate(`/verify/${data.id}`);
    } catch (err) {
      console.error('Upload error:', err);
      setStatus('Error submitting job. Please try again.');
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Upload Video for Verification</h1>
      
      <div style={{ marginBottom: '1rem' }}>
        <input
          type="file"
          accept="video/*"
          onChange={(e) => setFile(e.target.files[0])}
        />
      </div>
      
      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="YouTube URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{ width: '300px', padding: '0.5rem' }}
        />
      </div>
      
      <button
        onClick={handleSubmit}
        style={{
          padding: '0.5rem 1rem',
          background: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Submit
      </button>
      
      <p>{status}</p>
    </div>
  );
}
