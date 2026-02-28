// Frontend Configuration
const CONFIG = {
    API_BASE: 'https://seekreap.onrender.com',  // Backend API URL
    POLL_INTERVAL: 3000,  // 3 seconds
    MAX_FILE_SIZE: 500 * 1024 * 1024,  // 500MB
    ALLOWED_TYPES: ['video/mp4', 'video/quicktime', 'video/x-msvideo']
};

// Check if we're in development mode
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    CONFIG.API_BASE = 'http://localhost:5000';  // Local backend
}
