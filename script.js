// script.js
class VideoLibrary {
    constructor() {
        this.videoGrid = document.getElementById('videoGrid');
        this.searchInput = document.getElementById('searchInput');
        this.stats = document.getElementById('stats');
        this.loading = document.getElementById('loading');
        this.modal = document.getElementById('videoModal');
        this.videoPlayer = document.getElementById('videoPlayer');
        this.videoSource = document.getElementById('videoSource');
        this.closeModal = document.getElementById('closeModal');
        this.allVideos = [];
        this.filteredVideos = [];
        this.cache = new Map();
        this.observer = null;
        this.scrollObserver = null;
        this.debounceTimeout = null;
        this.scrollTimeout = null;
        this.currentPage = 0;
        this.pageSize = 20;
        this.isLoading = false;
        this.searchTerm = '';

        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupIntersectionObserver();
        this.setupScrollObserver();
        await this.loadVideos();
    }

    setupEventListeners() {
        this.searchInput.addEventListener('input', () => {
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = setTimeout(() => this.handleSearch(), 300);
        });

        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSearch();
        });

        window.addEventListener('unload', () => this.cleanup());

        this.closeModal.addEventListener('click', () => this.closeVideoModal());
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.closeVideoModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.style.display === 'block') {
                this.closeVideoModal();
            }
        });
    }

    setupIntersectionObserver() {
        this.observer = new IntersectionObserver(
            (entries) => this.handleIntersection(entries),
            { rootMargin: '100px', threshold: 0.1 }
        );
    }

    setupScrollObserver() {
        this.scrollObserver = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && !this.isLoading) {
                    clearTimeout(this.scrollTimeout);
                    this.scrollTimeout = setTimeout(() => this.loadMoreVideos(), 100);
                }
            },
            { threshold: 0.1 }
        );

        const sentinel = document.createElement('div');
        sentinel.id = 'sentinel';
        this.videoGrid.after(sentinel);
        this.scrollObserver.observe(sentinel);
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
                this.filteredVideos = cachedData;
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
            this.filteredVideos = this.allVideos;
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
                    class="play-btn" 
                    aria-label="Play video ${video.video_id}"
                    onclick="videoLibrary.playVideo('${safeGet(video, 'url', '#')}')"
                >Play</button>
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

        const lazyImages = card.querySelectorAll('.lazy');
        lazyImages.forEach(img => this.observer.observe(img));

        return card;
    }

    displayVideos(append = false) {
        const start = this.currentPage * this.pageSize;
        const end = start + this.pageSize;
        const pageVideos = this.filteredVideos.slice(start, end);

        if (!append) {
            this.videoGrid.innerHTML = '';
            this.currentPage = 0;
        }

        if (!pageVideos.length && !append) {
            this.videoGrid.innerHTML = '<p>No videos found</p>';
            return;
        }

        const fragment = document.createDocumentFragment();
        pageVideos.forEach(video => {
            try {
                fragment.appendChild(this.createVideoCard(video));
            } catch (err) {
                console.warn('Failed to create card:', err);
            }
        });

        requestAnimationFrame(() => {
            this.videoGrid.appendChild(fragment);
            this.updateStats(this.filteredVideos.length);
            this.isLoading = false;
        });
    }

    async loadMoreVideos() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.showLoading(true);
        
        this.currentPage++;
        const totalPages = Math.ceil(this.filteredVideos.length / this.pageSize);

        if (this.currentPage < totalPages) {
            this.displayVideos(true);
        } else {
            this.isLoading = false;
            this.showLoading(false);
        }
    }

    handleSearch() {
        this.searchTerm = this.searchInput.value.trim().toLowerCase();
        this.filteredVideos = this.searchTerm
            ? this.allVideos.filter(video =>
                video.prompt?.toLowerCase().includes(this.searchTerm)
              )
            : this.allVideos;
        this.currentPage = 0;
        this.displayVideos();
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

    playVideo(url) {
        if (!url || url === '#') {
            this.showError('No valid video URL available');
            return;
        }

        try {
            this.videoSource.src = url;
            this.videoPlayer.load();
            this.modal.style.display = 'block';
            this.videoPlayer.play().catch(err => {
                console.warn('Auto-play failed:', err);
            });
        } catch (error) {
            this.handleError('Failed to play video', error);
        }
    }

    closeVideoModal() {
        this.modal.style.display = 'none';
        this.videoPlayer.pause();
        this.videoPlayer.currentTime = 0;
        this.videoSource.src = '';
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

    showLoading(show) {
        this.loading.style.display = show ? 'block' : 'none';
    }

    updateStats(total) {
        const displayed = Math.min((this.currentPage + 1) * this.pageSize, total);
        this.stats.textContent = `Showing ${displayed} of ${total} videos`;
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
        this.scrollObserver?.disconnect();
        clearTimeout(this.debounceTimeout);
        clearTimeout(this.scrollTimeout);
        this.closeVideoModal();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.videoLibrary = new VideoLibrary();
});
