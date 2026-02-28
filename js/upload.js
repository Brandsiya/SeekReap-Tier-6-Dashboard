document.addEventListener('DOMContentLoaded', function() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const urlInput = document.getElementById('urlInput');
    const uploadBtn = document.getElementById('uploadBtn');
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const errorMessage = document.getElementById('errorMessage');

    let selectedFile = null;

    // Handle drag & drop
    uploadArea.addEventListener('click', () => fileInput.click());
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelect(files[0]);
        }
    });

    // Handle file input
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });

    // Handle URL input
    urlInput.addEventListener('input', () => {
        if (urlInput.value) {
            selectedFile = null;
            fileInfo.style.display = 'none';
        }
    });

    // Handle upload button
    uploadBtn.addEventListener('click', async () => {
        errorMessage.textContent = '';
        
        if (selectedFile) {
            await uploadFile(selectedFile);
        } else if (urlInput.value) {
            await submitUrl(urlInput.value);
        } else {
            errorMessage.textContent = 'Please select a file or enter a URL';
        }
    });

    function handleFileSelect(file) {
        // Validate file type
        if (!CONFIG.ALLOWED_TYPES.includes(file.type)) {
            errorMessage.textContent = 'Invalid file type. Please upload MP4, MOV, or AVI.';
            return;
        }
        
        // Validate file size
        if (file.size > CONFIG.MAX_FILE_SIZE) {
            errorMessage.textContent = 'File too large. Maximum size is 500MB.';
            return;
        }
        
        selectedFile = file;
        fileName.textContent = `Name: ${file.name}`;
        fileSize.textContent = `Size: ${(file.size / (1024 * 1024)).toFixed(2)} MB`;
        fileInfo.style.display = 'block';
        urlInput.value = ''; // Clear URL input
        errorMessage.textContent = '';
    }

    async function uploadFile(file) {
        const formData = new FormData();
        formData.append('video', file);
        
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Uploading...';
        
        try {
            const response = await fetch(`${CONFIG.API_BASE}/api/upload`, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`Upload failed: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Upload response:', data);
            
            // Redirect to verification page with job ID
            window.location.href = `/verification.html?jobId=${data.job_id}`;
            
        } catch (error) {
            console.error('Upload error:', error);
            errorMessage.textContent = 'Upload failed. Please try again.';
            uploadBtn.disabled = false;
            uploadBtn.textContent = 'Start Upload';
        }
    }

    async function submitUrl(url) {
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Submitting...';
        
        try {
            const response = await fetch(`${CONFIG.API_BASE}/api/upload/url`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url })
            });
            
            if (!response.ok) {
                throw new Error(`Submission failed: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('URL submission response:', data);
            
            // Redirect to verification page with job ID
            window.location.href = `/verification.html?jobId=${data.job_id}`;
            
        } catch (error) {
            console.error('URL submission error:', error);
            errorMessage.textContent = 'Submission failed. Please check the URL and try again.';
            uploadBtn.disabled = false;
            uploadBtn.textContent = 'Start Upload';
        }
    }
});
