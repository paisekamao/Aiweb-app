// script.js
class VideoLibrary {
    constructor() {
        this.videoGrid = document.getElementById('videoGrid');
        this.searchInput = document.getElementById('searchInput');
        this.stats = document.getElementById('stats');
        this.loading = document.getElementById('loading');
        this.allVideos = [];
        this.cache = new Map();
        this.observer = null;
        this.debounceTimeout = null;
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupIntersectionObserver();
        await this.loadVideos();
    }

    setupEventListeners() {
        // Debounced search
        this.searchInput.addEventListener('input', () => {
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = setTimeout(() => this.handleSearch(), 300);
        });

        // Keyboard accessibility
        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSearch();
        });

        // Error handling for page unload
        window.addEventListener('unload', () => this.cleanup());
    }

    setupIntersectionObserver() {
        this.observer = new IntersectionObserver(
            (entries) => this.handleIntersection(entries),
            { rootMargin: '200px' }
        );
    }

    async loadVideos() {
        this.showLoading(true);
        try {
            const files = [
                'data/master_video_data.json',
                'data/pixverse.json'
            ];

            const cachedData = this.getFromCache('videoData');
            if (cachedData) {
                this.allVideos = cachedData;
                this.displayVideos();
                return;
            }

            const responses = await Promise.all(
                files.map(async file => {
                    try {
                        const res = await fetch(file, { cache: 'force-cache' });
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        return res.json();
                    } catch (err) {
                        console.warn(`Failed to load ${file}:`, err);
                        return [];
                    }
                })
            );

            this.allVideos = responses.flat().filter(Boolean);
            this.setToCache('videoData', this.allVideos);
            this.displayVideos();
        } catch (error) {
            this.handleError('Failed to load videos', error);
        } finally {
            this.showLoading(false);
        }
    }

    createVideoCard(video) {
        const card = document.createElement('div');
        card.className = 'video-card';
        card.dataset.videoId = video.video_id || crypto.randomUUID();

        const safeGet = (obj, key, defaultVal = 'N/A') => 
            obj?.[key] ?? defaultVal;

        const promptText = safeGet(video, 'prompt', '')
            .substring(0, 100) + (video.prompt?.length > 100 ? '...' : '');

        card.innerHTML = `
            <div class="img-container">
                <img 
                    data-src="${safeGet(video, 'first_frame', 'placeholder.jpg')}" 
                    class="preview-img lazy" 
                    alt="Video preview"
                >
                <img 
                    data-src="${safeGet(video, 'last_frame', 'placeholder.jpg')}" 
                    class="hover-img lazy" 
                    alt="Video end frame"
                >
            </div>
            <p title="${safeGet(video, 'prompt')}">${promptText}</p>
            <p>Resolution: ${safeGet(video, 'output_width')}x${safeGet(video, 'output_height')}</p>
            <p>Quality: ${safeGet(video, 'quality')}</p>
            <div class="actions">
                <button 
                    class="download-btn" 
                    aria-label="Download video ${video.video_id}"
                    onclick="videoLibrary.downloadVideo('${safeGet(video, 'url', '#')}', 'video_${safeGet(video, 'video_id', 'unknown')}.mp4')"
                >Download</button>
                <button 
                    class="share-btn" 
                    onclick="videoLibrary.shareVideo('${safeGet(video, 'url')}')"
                >Share</button>
            </div>
        `;

        this.observer.observe(card.querySelector('.lazy'));
        return card;
    }

    displayVideos(videos = this.allVideos) {
        this.videoGrid.innerHTML = '';
        if (!videos?.length) {
            this.videoGrid.innerHTML = '<p>No videos found</p>';
            return;
        }

        const fragment = document.createDocumentFragment();
        videos.forEach(video => {
            try {
                fragment.appendChild(this.createVideoCard(video));
            } catch (err) {
                console.warn('Failed to create card:', err);
            }
        });

        this.videoGrid.appendChild(fragment);
        this.updateStats(videos.length);
    }

    handleSearch() {
        const searchTerm = this.searchInput.value.trim().toLowerCase();
        if (!searchTerm) {
            this.displayVideos();
            return;
        }

        const filtered = this.allVideos.filter(video =>
            video.prompt?.toLowerCase().includes(searchTerm)
        );
        this.displayVideos(filtered);
    }

    handleIntersection(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.classList.remove('lazy');
                this.observer.unobserve(img);
            }
        });
    }

    async downloadVideo(url, filename) {
        if (!url || url === '#') {
            this.showError('No valid URL available');
            return;
        }

        try {
            const response = await fetch(url, { mode: 'cors' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
            this.handleError('Download failed', error);
        }
    }

    shareVideo(url) {
        if (!navigator.share) {
            this.showError('Share feature not supported');
            return;
        }

        navigator.share({
            title: 'Video from Library',
            url: url
        }).catch(err => this.handleError('Share failed', err));
    }

    // Cache management
    getFromCache(key) {
        const cached = localStorage.getItem(key);
        return cached ? JSON.parse(cached) : null;
    }

    setToCache(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (err) {
            console.warn('Cache storage failed:', err);
        }
    }

    // UI helpers
    showLoading(show) {
        this.loading.style.display = show ? 'block' : 'none';
    }

    updateStats(count) {
        this.stats.textContent = `Showing ${count} of ${this.allVideos.length} videos`;
    }

    showError(message) {
        alert(message);
    }

    handleError(message, error) {
        console.error(message, error);
        this.videoGrid.innerHTML = `<p>${message}. Please try again later.</p>`;
    }

    cleanup() {
        this.observer?.disconnect();
        clearTimeout(this.debounceTimeout);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.videoLibrary = new VideoLibrary();
});
