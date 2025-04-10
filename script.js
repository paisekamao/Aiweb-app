


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
        this.paginationContainer = null;
        this.allVideos = [];
        this.filteredVideos = [];
        this.cache = new Map();
        this.debounceTimeout = null;
        this.currentPage = this.getSavedPage() || 1; // Load saved page or default to 1
        this.pageSize = 40;
        this.isLoading = false;
        this.searchTerm = '';

        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupPaginationContainer();
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
        window.addEventListener('beforeunload', () => this.savePage());

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

    setupPaginationContainer() {
        this.paginationContainer = document.createElement('div');
        this.paginationContainer.className = 'pagination sticky-pagination';
        this.videoGrid.after(this.paginationContainer);
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
                this.allVideos = cachedData.map(this.normalizeVideoData.bind(this));
                this.filteredVideos = this.allVideos;
                console.log('Loaded from cache:', this.allVideos.length, 'videos');
                this.displayVideos();
                this.renderPagination();
                return;
            }

            const responses = await Promise.all(
                files.map(async file => {
                    try {
                        const res = await fetch(file, { cache: 'force-cache' });
                        if (!res.ok) throw new Error(`HTTP ${res.status} for ${file}`);
                        const data = await res.json();
                        console.log(`Loaded ${file}:`, data.length, 'videos');
                        return data.map(this.normalizeVideoData.bind(this));
                    } catch (err) {
                        console.warn(`Failed to load ${file}:`, err);
                        return [];
                    }
                })
            );

            this.allVideos = responses.flat().filter(Boolean);
            console.log('Total videos loaded:', this.allVideos.length);
            if (this.allVideos.length === 0) {
                throw new Error('No videos loaded from either JSON file');
            }
            this.filteredVideos = this.allVideos;
            this.setToCache('videoData', this.allVideos);
            this.displayVideos();
            this.renderPagination();
        } catch (error) {
            this.handleError('Failed to load videos', error);
        } finally {
            this.showLoading(false);
        }
    }

    normalizeVideoData(video) {
        // Normalize keys to a consistent format
        return {
            video_id: video.video_id || video.Id || crypto.randomUUID(),
            prompt: video.prompt || video.Prompt || 'No description',
            first_frame: video.first_frame || video.FirstFrame || 'placeholder.jpg',
            last_frame: video.last_frame || video.LastFrame || 'placeholder.jpg',
            url: video.url || video.Url || '#',
            output_width: video.output_width || video.OutputWidth || 0,
            output_height: video.output_height || video.OutputHeight || 0,
            quality: video.quality || video.Quality || 'Unknown'
        };
    }

    createVideoCard(video) {
        const card = document.createElement('div');
        card.className = 'video-card';
        card.dataset.videoId = video.video_id;

        const promptText = video.prompt.substring(0, 100) + (video.prompt.length > 100 ? '...' : '');

        card.innerHTML = `
            <div class="img-container">
                <img 
                    src="${video.first_frame}" 
                    class="preview-img" 
                    alt="Video preview"
                    loading="lazy"
                    onerror="this.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg=='"
                >
                <img 
                    src="${video.last_frame}" 
                    class="hover-img" 
                    alt="Video end frame"
                    loading="lazy"
                    onerror="this.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg=='"
                >
            </div>
            <p title="${video.prompt}">${promptText}</p>
            <p>Resolution: ${video.output_width}x${video.output_height}</p>
            <p>Quality: ${video.quality}</p>
            <div class="actions">
                <button 
                    class="play-btn" 
                    aria-label="Play video ${video.video_id}"
                    onclick="videoLibrary.playVideo('${video.url}')"
                >Play</button>
                <button 
                    class="download-btn" 
                    aria-label="Download video ${video.video_id}"
                    onclick="videoLibrary.downloadVideo('${video.url}', 'video_${video.video_id}.mp4')"
                >Download</button>
                <button 
                    class="share-btn" 
                    onclick="videoLibrary.shareVideo('${video.url}')"
                >Share</button>
            </div>
        `;

        return card;
    }

    displayVideos() {
        if (this.isLoading) return;
        this.isLoading = true;
        this.showLoading(true);

        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        const pageVideos = this.filteredVideos.slice(start, end);

        this.videoGrid.innerHTML = '';

        if (!pageVideos.length) {
            this.videoGrid.innerHTML = '<p>No videos found</p>';
            this.updateStats(this.filteredVideos.length);
            this.renderPagination();
            this.showLoading(false);
            this.isLoading = false;
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
            this.renderPagination();
            this.showLoading(false);
            this.isLoading = false;
        });
    }

    renderPagination() {
        const totalPages = Math.ceil(this.filteredVideos.length / this.pageSize);
        if (totalPages <= 1) {
            this.paginationContainer.innerHTML = '';
            return;
        }

        const fragment = document.createDocumentFragment();

        // First Page
        const firstBtn = document.createElement('button');
        firstBtn.textContent = 'First';
        firstBtn.className = 'page-btn';
        firstBtn.disabled = this.currentPage === 1;
        firstBtn.addEventListener('click', () => this.changePage(1));
        fragment.appendChild(firstBtn);

        // Previous Button
        const prevBtn = document.createElement('button');
        prevBtn.textContent = 'Previous';
        prevBtn.className = 'page-btn';
        prevBtn.disabled = this.currentPage === 1;
        prevBtn.addEventListener('click', () => this.changePage(this.currentPage - 1));
        fragment.appendChild(prevBtn);

        // Page Numbers
        const maxVisiblePages = 10;
        let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.textContent = i;
            pageBtn.className = `page-btn ${i === this.currentPage ? 'active' : ''}`;
            pageBtn.addEventListener('click', () => this.changePage(i));
            fragment.appendChild(pageBtn);
        }

        // Next Button
        const nextBtn = document.createElement('button');
        nextBtn.textContent = 'Next';
        nextBtn.className = 'page-btn';
        nextBtn.disabled = this.currentPage === totalPages;
        nextBtn.addEventListener('click', () => this.changePage(this.currentPage + 1));
        fragment.appendChild(nextBtn);

        // Last Page
        const lastBtn = document.createElement('button');
        lastBtn.textContent = 'Last';
        lastBtn.className = 'page-btn';
        lastBtn.disabled = this.currentPage === totalPages;
        lastBtn.addEventListener('click', () => this.changePage(totalPages));
        fragment.appendChild(lastBtn);

        // Go To Page
        const goToContainer = document.createElement('span');
        goToContainer.className = 'goto-container';
        goToContainer.innerHTML = `
            <input type="number" id="gotoPage" min="1" max="${totalPages}" placeholder="Page" aria-label="Go to page">
            <button id="gotoBtn" class="page-btn">Go</button>
        `;
        fragment.appendChild(goToContainer);

        this.paginationContainer.innerHTML = '';
        this.paginationContainer.appendChild(fragment);

        // Add event listener for "Go" button
        const gotoBtn = this.paginationContainer.querySelector('#gotoBtn');
        const gotoInput = this.paginationContainer.querySelector('#gotoPage');
        gotoBtn.addEventListener('click', () => {
            const page = parseInt(gotoInput.value, 10);
            if (page >= 1 && page <= totalPages) {
                this.changePage(page);
                gotoInput.value = '';
            } else {
                this.showError(`Please enter a page between 1 and ${totalPages}`);
            }
        });
    }

    changePage(pageNumber) {
        const totalPages = Math.ceil(this.filteredVideos.length / this.pageSize);
        if (pageNumber < 1 || pageNumber > totalPages) return;
        this.currentPage = pageNumber;
        this.displayVideos();
    }

    handleSearch() {
        this.searchTerm = this.searchInput.value.trim().toLowerCase();
        this.filteredVideos = this.searchTerm
            ? this.allVideos.filter(video => video.prompt.toLowerCase().includes(this.searchTerm))
            : this.allVideos;
        this.currentPage = 1;
        this.displayVideos();
    }

    getSavedPage() {
        return parseInt(localStorage.getItem('currentPage'), 10) || 1;
    }

    savePage() {
        localStorage.setItem('currentPage', this.currentPage);
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
            this.videoPlayer.play().catch(err => console.warn('Auto-play failed:', err));
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
        navigator.share({ title: 'Video from Library', url })
            .catch(err => this.handleError('Share failed', err));
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
        const start = (this.currentPage - 1) * this.pageSize + 1;
        const end = Math.min(this.currentPage * this.pageSize, total);
        this.stats.textContent = `Showing ${start}-${end} of ${total} videos`;
    }

    showError(message) {
        alert(message);
    }

    handleError(message, error) {
        console.error(message, error);
        this.videoGrid.innerHTML = `<p>${message}. Please try again later.</p>`;
    }

    cleanup() {
        clearTimeout(this.debounceTimeout);
        this.closeVideoModal();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.videoLibrary = new VideoLibrary();
});
