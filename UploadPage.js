// frontend/src/pages/UploadPage.js
import React, { useState } from "react";

const UploadPage = () => {
  const [videoFile, setVideoFile] = useState(null);
  const [videoURL, setVideoURL] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const API_BASE = process.env.REACT_APP_API_URL || "https://seekreap.onrender.com";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const formData = new FormData();
      if (videoFile) {
        formData.append("video", videoFile);
      } else if (videoURL) {
        formData.append("url", videoURL);
      } else {
        setMessage("Please select a file or provide a video URL.");
        setLoading(false);
        return;
      }

      const res = await fetch(`${API_BASE}/api/submit`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Submission failed.");
      }

      const data = await res.json();
      setMessage(`Job submitted successfully! Job ID: ${data.job_id}`);
    } catch (err) {
      console.error("Error submitting job:", err);
      setMessage(`Error submitting job: ${err.message}`);
    } finally {
      setLoading(false);
      setVideoFile(null);
      setVideoURL("");
    }
  };

  return (
    <div>
      <h1>Upload Video / Submit URL</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Select video file:</label>
          <input
            type="file"
            accept="video/*"
            onChange={(e) => setVideoFile(e.target.files[0])}
          />
        </div>
        <div>
          <label>Or enter YouTube URL:</label>
          <input
            type="url"
            placeholder="https://www.youtube.com/watch?v=..."
            value={videoURL}
            onChange={(e) => setVideoURL(e.target.value)}
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? "Submitting..." : "Submit"}
        </button>
      </form>
      {message && <p>{message}</p>}
    </div>
  );
};

export default UploadPage;
