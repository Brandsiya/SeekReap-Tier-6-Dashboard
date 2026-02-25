import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const UploadPage = () => {
  const navigate = useNavigate();
  const [videoFile, setVideoFile] = useState(null);
  const [videoURL, setVideoURL] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [debugInfo, setDebugInfo] = useState("");

  const API_BASE = process.env.REACT_APP_API_URL || "https://seekreap.onrender.com";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setDebugInfo("");

    try {
      const formData = new FormData();
      
      if (videoFile) {
        // For file upload - use 'video' field name (matches multer)
        formData.append("video", videoFile);
        // Also add required database fields
        formData.append("creator_id", "1"); // Default creator
        formData.append("job_type", "video");
        console.log("Uploading file:", videoFile.name);
      } else if (videoURL) {
        // For URL submission - send as JSON instead of FormData
        const response = await fetch(`${API_BASE}/api/submit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: videoURL,
            creator_id: 1,
            job_type: "url",
            content_id: `url-${Date.now()}`,
            params: { url: videoURL }
          }),
        });

        const data = await response.json();
        console.log("Response:", data);

        if (!response.ok) {
          throw new Error(data.error || "Submission failed");
        }

        setMessage(`Job submitted successfully! Job ID: ${data.job_id || data.id}`);
        navigate(`/verify/${data.job_id || data.id}`);
        return;
      } else {
        setMessage("Please select a file or provide a video URL.");
        setLoading(false);
        return;
      }

      // For file upload - use FormData
      console.log("Sending FormData to:", `${API_BASE}/api/submit`);
      const res = await fetch(`${API_BASE}/api/submit`, {
        method: "POST",
        body: formData,
      });

      console.log("Response status:", res.status);
      
      let data;
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error("Non-JSON response:", text);
        throw new Error(`Server returned ${res.status}: ${text}`);
      }

      if (!res.ok) {
        throw new Error(data.error || `Submission failed with status ${res.status}`);
      }

      console.log("Success data:", data);
      setMessage(`Job submitted successfully! Job ID: ${data.job_id || data.id}`);
      
      // Navigate to verification page
      navigate(`/verify/${data.job_id || data.id}`);
      
    } catch (err) {
      console.error("Error submitting job:", err);
      setMessage(`Error: ${err.message}`);
      setDebugInfo(err.stack);
    } finally {
      setLoading(false);
      // Don't clear the form immediately so user can see what they submitted
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Upload Video for Verification</h1>
      
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            Select video file:
          </label>
          <input
            type="file"
            accept="video/*"
            onChange={(e) => {
              setVideoFile(e.target.files[0]);
              setVideoURL(""); // Clear URL when file is selected
            }}
          />
          {videoFile && (
            <p style={{ fontSize: '12px', color: '#666' }}>
              Selected: {videoFile.name} ({(videoFile.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          )}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            Or enter YouTube URL:
          </label>
          <input
            type="url"
            placeholder="https://www.youtube.com/watch?v=..."
            value={videoURL}
            onChange={(e) => {
              setVideoURL(e.target.value);
              setVideoFile(null); // Clear file when URL is entered
            }}
            style={{ width: '100%', padding: '8px' }}
          />
        </div>

        <button 
          type="submit" 
          disabled={loading}
          style={{
            padding: '10px 20px',
            background: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '16px'
          }}
        >
          {loading ? "Submitting..." : "Submit"}
        </button>
      </form>

      {message && (
        <div style={{ 
          marginTop: '20px', 
          padding: '10px', 
          background: message.includes('Error') ? '#ffebee' : '#e8f5e8',
          border: `1px solid ${message.includes('Error') ? '#ffcdd2' : '#c8e6c9'}`,
          borderRadius: '4px',
          color: message.includes('Error') ? '#c62828' : '#2e7d32'
        }}>
          {message}
        </div>
      )}

      {debugInfo && (
        <div style={{ 
          marginTop: '20px', 
          padding: '10px', 
          background: '#f5f5f5', 
          border: '1px solid #ddd',
          borderRadius: '4px',
          fontFamily: 'monospace',
          fontSize: '12px',
          whiteSpace: 'pre-wrap',
          maxHeight: '200px',
          overflow: 'auto'
        }}>
          <strong>Debug:</strong>
          <pre style={{ margin: '5px 0 0' }}>{debugInfo}</pre>
        </div>
      )}
    </div>
  );
};

export default UploadPage;
