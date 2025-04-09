let videos = [];
let filteredVideos = [];
let currentPage = 1;
let videosPerPage = 12;
let cardsPerRow = 3;
const jsonFiles = ['data/pixvers.json', 'data/master_video_data.json']; // Only 2 files

// Fetch with retry logic
async function fetchWithRetry(url, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
            return await response.json();
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
        }
    }
}

// Load videos from the two JSON files
async function loadVideos() {
    const loading = document.getElementById('loading');
    const errorDiv = document.getElementById('error');
    try {
        const results = await Promise.all(jsonFiles.map(file => fetchWithRetry(file)));
        videos = results.flat(); // Flatten arrays from both files into one
        filteredVideos = videos;
        renderVideos();
    } catch (error) {
        errorDiv.textContent = 'Failed to load videos. Please try refreshing the page.';
        errorDiv.classList.remove('hidden');
        console.error('Error loading JSON:', error);
    } finally {
        loading.classList.add('hidden');
    }
}

// Search functionality
document.getElementById('searchBar').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    filteredVideos = videos.filter(video => 
        video.prompt.toLowerCase().includes(query)
    );
    currentPage = 1;
    renderVideos();
});

// Videos per page control
document.getElementById('videosPerPage').addEventListener('change', (e) => {
    videosPerPage = parseInt(e.target.value);
    currentPage = 1;
    renderVideos();
});

// Cards per row control
document.getElementById('cardsPerRow').addEventListener('change', (e) => {
    cardsPerRow = parseInt(e.target.value);
    document.getElementById('videoGrid').style.gridTemplateColumns = `repeat(${cardsPerRow}, 1fr)`;
    renderVideos();
});

function renderVideos() {
    const videoGrid = document.getElementById('videoGrid');
    videoGrid.innerHTML = '';

    const start = (currentPage - 1) * videosPerPage;
    const end = start + videosPerPage;
    const paginatedVideos = filteredVideos.slice(start, end);

    paginatedVideos.forEach(video => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <img src="${video.first_frame}" alt="Preview">
            <div class="badges">
                <span class="badge">${video.quality || 'Unknown'}</span>
                <span class="badge">${video.duration}s</span>
                ${video.is_sound ? '<span class="badge sound-badge"></span>' : ''}
                <span class="badge">${video.output_width}x${video.output_height}</span>
            </div>
            <div class="prompt">${video.prompt.substring(0, 30) || 'No prompt'}...</div>
            <div class="prompt-full">${video.prompt || 'No prompt available'}</div>
            <button class="download-btn" onclick="window.location.href='${video.url}'">Download</button>
        `;
        videoGrid.appendChild(card);
    });

    renderPagination();
}

function renderPagination() {
    const pagination = document.getElementById('pagination');
    pagination.innerHTML = '';
    const totalPages = Math.ceil(filteredVideos.length / videosPerPage);

    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.className = 'page-btn' + (i === currentPage ? ' active' : '');
        btn.textContent = i;
        btn.addEventListener('click', () => {
            currentPage = i;
            renderVideos();
        });
        pagination.appendChild(btn);
    }
}

// Initialize
loadVideos();
