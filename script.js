// ==============================================
// CONFIGURATION - CHANGE THIS URL AFTER DEPLOYING BACKEND
// ==============================================
const BACKEND_URL = "https://supreme-yt-downloader-backend-zbl1.onrender.com"; // ← UPDATE THIS AFTER DEPLOYING

// ==============================================
// STATE MANAGEMENT
// ==============================================
let currentVideoInfo = null;
let selectedFormatId = null;
let downloadId = null;
let progressInterval = null;

// ==============================================
// DOM ELEMENTS
// ==============================================
const videoUrlInput = document.getElementById('videoUrl');
const videoInfoCard = document.getElementById('videoInfoCard');
const progressCard = document.getElementById('progressCard');
const loadingOverlay = document.getElementById('loading');
const downloadBtn = document.getElementById('downloadBtn');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const statusMessage = document.getElementById('statusMessage');

// ==============================================
// UTILITY FUNCTIONS
// ==============================================
function showLoading() {
    loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    loadingOverlay.style.display = 'none';
}

function showError(message) {
    alert('Error: ' + message);
}

function showMessage(message) {
    alert(message);
}

function isValidYouTubeUrl(url) {
    const patterns = [
        /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=[\w-]{11}/,
        /^(https?:\/\/)?youtu\.be\/[\w-]{11}/,
        /^(https?:\/\/)?(www\.)?youtube\.com\/embed\/[\w-]{11}/
    ];
    return patterns.some(pattern => pattern.test(url));
}

function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes) {
    if (!bytes) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}

// ==============================================
// MAIN FUNCTIONS
// ==============================================
async function getVideoInfo() {
    const url = videoUrlInput.value.trim();
    
    if (!url) {
        showError('Please enter a YouTube URL');
        return;
    }
    
    if (!isValidYouTubeUrl(url)) {
        showError('Please enter a valid YouTube URL');
        return;
    }
    
    showLoading();
    
    try {
        // Call our Python backend
        const response = await fetch(`${BACKEND_URL}/info`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: url })
        });
        
        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to get video info');
        }
        
        // Store video info
        currentVideoInfo = data;
        
        // Update UI
        updateVideoInfo(data);
        displayQualityOptions(data.formats);
        
        // Show video info card
        videoInfoCard.style.display = 'block';
        videoInfoCard.scrollIntoView({ behavior: 'smooth' });
        
        hideLoading();
        
    } catch (error) {
        hideLoading();
        showError(error.message || 'Failed to get video information');
        console.error('Error:', error);
    }
}

function updateVideoInfo(info) {
    document.getElementById('videoTitle').textContent = info.title || 'Unknown Title';
    document.getElementById('author').textContent = info.uploader || 'Unknown Author';
    document.getElementById('duration').textContent = formatDuration(info.duration);
    
    const thumbnail = document.getElementById('thumbnail');
    if (info.thumbnail) {
        thumbnail.src = info.thumbnail;
        thumbnail.style.display = 'block';
    } else {
        thumbnail.style.display = 'none';
    }
}

function displayQualityOptions(formats) {
    const qualityGrid = document.getElementById('qualityGrid');
    qualityGrid.innerHTML = '';
    
    // Filter for video formats with audio
    const videoFormats = formats.filter(f => 
        f.vcodec !== 'none' && 
        f.acodec !== 'none'
    );
    
    // Sort by quality (highest first)
    videoFormats.sort((a, b) => {
        const getQuality = (format) => {
            const match = format.quality?.match(/(\d+)/);
            return match ? parseInt(match[1]) : 0;
        };
        return getQuality(b) - getQuality(a);
    });
    
    // Display options
    videoFormats.forEach((format, index) => {
        const option = document.createElement('div');
        option.className = 'quality-option';
        option.onclick = () => selectQuality(format, option);
        
        option.innerHTML = `
            <div class="quality-label">${format.quality || 'Unknown'}</div>
            <div class="quality-size">${format.filesize_fmt || 'Unknown size'}</div>
            <div style="font-size: 0.8rem; color: #888; margin-top: 5px;">
                ${format.ext || 'mp4'}
            </div>
        `;
        
        qualityGrid.appendChild(option);
        
        // Select first option by default
        if (index === 0) {
            selectQuality(format, option);
        }
    });
}

function selectQuality(format, element) {
    // Remove selection from all options
    document.querySelectorAll('.quality-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    
    // Add selection to clicked option
    element.classList.add('selected');
    
    // Store selected format
    selectedFormatId = format.format_id;
    
    // Enable download button
    downloadBtn.disabled = false;
}

async function startDownload() {
    if (!currentVideoInfo || !selectedFormatId) {
        showError('Please select a video quality first');
        return;
    }
    
    const url = videoUrlInput.value.trim();
    
    showLoading();
    progressCard.style.display = 'block';
    progressCard.scrollIntoView({ behavior: 'smooth' });
    
    try {
        // Start download on backend
        const response = await fetch(`${BACKEND_URL}/download`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: url,
                format_id: selectedFormatId
            })
        });
        
        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to start download');
        }
        
        // Store download ID
        downloadId = data.download_id;
        
        // Start monitoring progress
        hideLoading();
        monitorDownloadProgress();
        
    } catch (error) {
        hideLoading();
        showError(error.message || 'Failed to start download');
        console.error('Error:', error);
    }
}

async function monitorDownloadProgress() {
    if (!downloadId) return;
    
    // Clear any existing interval
    if (progressInterval) {
        clearInterval(progressInterval);
    }
    
    progressInterval = setInterval(async () => {
        try {
            // Check progress
            const response = await fetch(`${BACKEND_URL}/progress/${downloadId}`);
            const progress = await response.json();
            
            // Update progress bar
            const progressPercent = progress.progress || 0;
            progressBar.style.width = `${progressPercent}%`;
            progressText.textContent = `${progressPercent}%`;
            
            // Update status message
            if (progress.message) {
                statusMessage.textContent = progress.message;
            }
            
            // Check if download is complete
            if (progress.status === 'completed') {
                clearInterval(progressInterval);
                downloadFile();
            } else if (progress.status === 'error') {
                clearInterval(progressInterval);
                showError(progress.message || 'Download failed');
                progressCard.style.display = 'none';
            }
            
        } catch (error) {
            console.error('Progress check error:', error);
        }
    }, 1000); // Check every second
}

async function downloadFile() {
    if (!downloadId) return;
    
    try {
        // Get the file from backend
        const response = await fetch(`${BACKEND_URL}/get_file/${downloadId}`);
        
        if (!response.ok) {
            throw new Error('File not ready yet');
        }
        
        // Get filename
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'youtube_video.mp4';
        
        if (contentDisposition) {
            const match = contentDisposition.match(/filename="(.+)"/);
            if (match) filename = match[1];
        }
        
        // Create blob and download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // Cleanup
        window.URL.revokeObjectURL(url);
        
        // Update UI
        statusMessage.textContent = 'Download complete! Check your downloads folder.';
        progressBar.style.width = '100%';
        progressText.textContent = '100%';
        
        // Reset after 3 seconds
        setTimeout(() => {
            progressCard.style.display = 'none';
            videoInfoCard.style.display = 'none';
            videoUrlInput.value = '';
            downloadBtn.disabled = true;
        }, 3000);
        
    } catch (error) {
        showError('Failed to download file: ' + error.message);
        progressCard.style.display = 'none';
    }
}

// ==============================================
// EVENT LISTENERS
// ==============================================
document.addEventListener('DOMContentLoaded', function() {
    // Enter key support
    videoUrlInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            getVideoInfo();
        }
    });
    
    // Update backend URL from localStorage (for testing)
    const savedBackendUrl = localStorage.getItem('backend_url');
    if (savedBackendUrl) {
        BACKEND_URL = savedBackendUrl;
        console.log('Using saved backend URL:', BACKEND_URL);
    }
});

// For testing: allow setting backend URL from console
window.setBackendUrl = function(url) {
    localStorage.setItem('backend_url', url);
    BACKEND_URL = url;
    alert('Backend URL updated to: ' + url);
    location.reload();
};
