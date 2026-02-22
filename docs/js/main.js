const NO_IMAGE_SVG = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%22%20height%3D%22100%22%20viewBox%3D%220%200%20100%20100%22%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20fill%3D%22%23333%22%2F%3E%3Ctext%20x%3D%2250%22%20y%3D%2250%22%20font-family%3D%22Arial%22%20font-size%3D%2212%22%20fill%3D%22%23666%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%3ENo%20Image%3C%2Ftext%3E%3C%2Fsvg%3E";

const DEFAULT_DOMAINS = {
    newtoki: '469',
    manatoki: '469',
    booktoki: '469'
};

const VIEWER_VERSION = "v2.0.0";
window.TOKI_VIEWER_VERSION = VIEWER_VERSION;

let allSeries = [];
const thumbnailQueue = [];
let isLoadingThumbnail = false;
const THUMBNAIL_DELAY_MS = 250;
let activeBlobUrls = [];

// 태그 & 캘린더 & 즐겨찾기 데이터
let customTags = [];
let seriesTags = {};
let calendarData = {};
let favorites = [];
let adultFilterEnabled = false;

// 현재 상태
let currentTab = 'all';
let currentTagFilter = null;
let currentCalendarMonth = new Date();
let selectedCalendarDate = null;

// ===== 초기화 =====
window.addEventListener('DOMContentLoaded', () => {
    window.addEventListener("message", handleMessage, false);
    
    loadSavedTheme();
    loadLocalData();
    
    const el = document.getElementById('viewerVersionDisplay');
    if(el) el.innerText = `Viewer ${VIEWER_VERSION}`;
    
    if (API.isConfigured()) {
        showToast("🚀 저장된 설정으로 연결합니다...");
        refreshDB(null, true);
        loadDomains();
    } else {
        setTimeout(() => {
            if (!API.isConfigured()) {
                document.getElementById('configModal').style.display = 'flex';
            } else {
                showToast("🚀 저장된 설정으로 연결합니다...");
                refreshDB(null, true);
            }
            loadDomains();
        }, 1000);
    }
});

function handleMessage(event) {
    if (event.data.type === 'TOKI_CONFIG') {
        const { url, folderId, apiKey } = event.data;
        if (url && folderId) {
            API.setConfig(url, folderId, apiKey);
            document.getElementById('configModal').style.display = 'none';
            showToast("⚡️ 자동 설정 완료!");
            refreshDB();
        }
    }
}

// ===== 로컬 데이터 관리 =====
function loadLocalData() {
    try {
        customTags = JSON.parse(localStorage.getItem('toki_tags')) || [];
        seriesTags = JSON.parse(localStorage.getItem('toki_series_tags')) || {};
        calendarData = JSON.parse(localStorage.getItem('toki_calendar')) || {};
        favorites = JSON.parse(localStorage.getItem('toki_favorites')) || [];
        adultFilterEnabled = localStorage.getItem('toki_adult_filter') === 'true';
        
        updateAdultToggle();
        updateSidebarTags();
    } catch (e) {
        console.error('Local data load error:', e);
    }
}

function saveLocalData() {
    localStorage.setItem('toki_tags', JSON.stringify(customTags));
    localStorage.setItem('toki_series_tags', JSON.stringify(seriesTags));
    localStorage.setItem('toki_calendar', JSON.stringify(calendarData));
    localStorage.setItem('toki_favorites', JSON.stringify(favorites));
    localStorage.setItem('toki_adult_filter', adultFilterEnabled);
}

function clearBlobUrls() {
    activeBlobUrls.forEach(url => URL.revokeObjectURL(url));
    activeBlobUrls = [];
}

// ===== 사이드바 =====
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const toggle = document.querySelector('.sidebar-toggle');
    
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('show');
    if (toggle) toggle.classList.toggle('hidden');
}

// ===== 테마 =====
function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('toki_theme', next);
    
    const indicator = document.getElementById('themeIndicator');
    const headerIcon = document.getElementById('headerThemeIcon');
    const icon = next === 'dark' ? '🌙' : '☀️';
    
    if (indicator) indicator.textContent = icon;
    if (headerIcon) headerIcon.textContent = icon;
}

function loadSavedTheme() {
    const saved = localStorage.getItem('toki_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    
    const icon = saved === 'dark' ? '🌙' : '☀️';
    const indicator = document.getElementById('themeIndicator');
    const headerIcon = document.getElementById('headerThemeIcon');
    
    if (indicator) indicator.textContent = icon;
    if (headerIcon) headerIcon.textContent = icon;
}

// ===== 설정 아코디언 =====
function toggleSettingsAccordion() {
    const content = document.getElementById('settingsContent');
    const icon = document.getElementById('settingsIcon');
    
    if (content.style.maxHeight) {
        content.style.maxHeight = null;
        if (icon) icon.textContent = '▼';
    } else {
        content.style.maxHeight = content.scrollHeight + 'px';
        if (icon) icon.textContent = '▲';
    }
}
// ===== 라이브러리 로드 =====
async function refreshDB(forceId = null, silent = false, bypassCache = false) {
    const loader = document.getElementById('pageLoader');

    if (!silent && loader) {
        loader.style.display = 'flex';
    }

    try {
        const payload = { folderId: forceId || API._config.folderId };
        if (bypassCache) payload.bypassCache = true;

        const response = await API.request('view_get_library', payload);
        let seriesList = [];

        if (Array.isArray(response)) {
            seriesList = response;
        } else if (response && response.list && Array.isArray(response.list)) {
            seriesList = response.list;
        }

        allSeries = seriesList;
        renderGrid(allSeries);
        showToast("📚 라이브러리 업데이트 완료");

    } catch (e) {
        console.error("Library Fetch Error:", e);
        showToast(`❌ 로드 실패: ${e.message}`, 5000);
    } finally {
        if(loader) loader.style.display = 'none';
    }
}

// ===== 그리드 렌더링 =====
function renderGrid(seriesList) {
    const grid = document.getElementById('grid');
    const calendarPage = document.getElementById('calendarPage');
    
    if (calendarPage) calendarPage.style.display = 'none';
    if (grid) grid.style.display = 'grid';
    
    clearBlobUrls();
    grid.innerHTML = '';

    if (!seriesList || seriesList.length === 0) {
// ===== 라이브러리 로드 =====
async function refreshDB(forceId = null, silent = false, bypassCache = false) {
    const loader = document.getElementById('pageLoader');

    if (!silent && loader) {
        loader.style.display = 'flex';
    }

    try {
        const payload = { folderId: forceId || API._config.folderId };
        if (bypassCache) payload.bypassCache = true;

        const response = await API.request('view_get_library', payload);
        let seriesList = [];

        if (Array.isArray(response)) {
            seriesList = response;
        } else if (response && response.list && Array.isArray(response.list)) {
            seriesList = response.list;
        }

        allSeries = seriesList;
        renderGrid(allSeries);
        showToast("📚 라이브러리 업데이트 완료");

    } catch (e) {
        console.error("Library Fetch Error:", e);
        showToast(`❌ 로드 실패: ${e.message}`, 5000);
    } finally {
        if(loader) loader.style.display = 'none';
    }
}

// ===== 그리드 렌더링 =====
function renderGrid(seriesList) {
    const grid = document.getElementById('grid');
    const calendarPage = document.getElementById('calendarPage');
    
    if (calendarPage) calendarPage.style.display = 'none';
    if (grid) grid.style.display = 'grid';
    
    clearBlobUrls();
    grid.innerHTML = '';

    if (!seriesList || seriesList.length === 0) {
        grid.innerHTML = '<div class="no-data">저장된 작품이 없습니다.</div>';
        return;
    }

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                const url = img.dataset.thumb;
                if (url && url !== NO_IMAGE_SVG) {
                    queueThumbnail(img, url);
                }
                obs.unobserve(img);
            }
        });
    }, { rootMargin: '200px' });

    seriesList.forEach((series, index) => {
        try {
            const card = document.createElement('div');
            card.className = 'card';
            card.dataset.index = index;

            const meta = series.metadata || {};
            const authors = meta.authors || [];
            const status = meta.status || '';
            const publisher = meta.publisher || '';
            const isAdult = meta.adult === true;
            
            let thumb = NO_IMAGE_SVG;
            if (series.thumbnail && series.thumbnail.startsWith("data:image")) {
                thumb = series.thumbnail;
            } else if (series.thumbnailId) {
                thumb = `https://lh3.googleusercontent.com/d/${series.thumbnailId}=s400`;
            } else if (series.thumbnail && series.thumbnail.startsWith("http")) {
                thumb = series.thumbnail;
            }

            let statusClass = 'ongoing';
            let statusText = status;
            if (!status || status === 'Unknown') {
                statusText = '';
            } else if (status === 'COMPLETED' || status === '완결') {
                statusClass = 'completed';
            }

            // 작가명 (성인작품이면 🔞 추가)
            const authorText = authors.join(', ') || '작가 미상';
            const authorClass = isAdult ? 'author adult' : 'author';

            card.innerHTML = `
                <div class="thumb-wrapper">
                    <img src="${NO_IMAGE_SVG}" 
                         data-thumb="${thumb}" 
                         class="thumb" 
                         loading="lazy"
                         onerror="handleThumbnailError(this, '${NO_IMAGE_SVG}')"
                         onload="this.dataset.loaded='true'">
                    <div class="no-image-text">No Image</div>
                </div>
                <div class="info">
                    <div class="title" title="${series.name}">${series.name}</div>
                    <span class="${authorClass}" title="${authorText}">${authorText}</span>
                    <div class="meta">
                        ${statusText ? `<span class="badge ${statusClass}">${statusText}</span>` : ''}
                        ${publisher ? `<span class="publisher" data-platform="${publisher}">${publisher}</span>` : ''}
                    </div>
                </div>
            `;

            card.addEventListener('click', function(e) {
                openDetailModal(index);
            });
            
            grid.appendChild(card);
            
            const img = card.querySelector('img.thumb');
            if (thumb !== NO_IMAGE_SVG) {
                observer.observe(img);
            }
        } catch (err) {
            console.error("Render Error:", err);
        }
    });
    
    // 현재 필터 다시 적용
    applyFilters();
}

// ===== 필터 =====
function switchTab(tabName) {
    currentTab = tabName;
    currentTagFilter = null;
    
    document.querySelectorAll('.sidebar-item[data-tab]').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.tab === tabName) item.classList.add('active');
    });
    
    document.querySelectorAll('.sidebar-tag').forEach(tag => {
        tag.classList.remove('active');
    });

    const calPage = document.getElementById('calendarPage');
    const grid = document.getElementById('grid');
    if (calPage) calPage.style.display = 'none';
    if (grid) grid.style.display = 'grid';

    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        toggleSidebar();
    }

    applyFilters();
}

function filterData() {
    applyFilters();
}

function applyFilters() {
    const query = document.getElementById('search').value.toLowerCase();
    const cards = document.querySelectorAll('.card');
    
    cards.forEach((card) => {
        const index = parseInt(card.dataset.index);
        const series = allSeries[index];
        if (!series) return;
        
        const meta = series.metadata || {};
        const authors = meta.authors || [];
        const isAdult = meta.adult === true;
        const text = (series.name + ' ' + authors.join(' ')).toLowerCase();
        
        // 텍스트 검색
        const matchText = text.includes(query);
        
        // 카테고리 필터
        const cat = series.category || meta.category || 'Unknown';
        const matchTab = (currentTab === 'all') || (cat === currentTab);
        
        // 태그 필터
        const sTags = seriesTags[series.id] || [];
        const matchTag = !currentTagFilter || sTags.includes(currentTagFilter);
        
        // Adult 필터 (활성화되면 성인작품 숨김)
        const matchAdult = !adultFilterEnabled || !isAdult;

        if (matchText && matchTab && matchTag && matchAdult) {
            card.classList.remove('hidden');
        } else {
            card.classList.add('hidden');
        }
    });
}

// ===== Adult 필터 =====
function toggleAdultFilter() {
    adultFilterEnabled = !adultFilterEnabled;
    saveLocalData();
    updateAdultToggle();
    applyFilters();
    
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        toggleSidebar();
    }
}

function updateAdultToggle() {
    const toggle = document.getElementById('adultToggle');
    if (toggle) {
        if (adultFilterEnabled) {
            toggle.classList.add('active');
        } else {
            toggle.classList.remove('active');
        }
    }
}

    // ===== 태그 관리 =====
function showTags() {
    renderTagsList();
    document.getElementById('tagsModal').style.display = 'flex';
    
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        toggleSidebar();
    }
}

function closeTagsModal() {
    document.getElementById('tagsModal').style.display = 'none';
}

function renderTagsList() {
    const list = document.getElementById('tagsList');
    list.innerHTML = '';
    
    if (customTags.length === 0) {
        list.innerHTML = '<div style="color: var(--text-tertiary); font-size: 13px;">태그가 없습니다. 새 태그를 추가하세요.</div>';
        return;
    }
    
    customTags.forEach(tag => {
        const item = document.createElement('div');
        item.className = 'tag-item';
        item.innerHTML = `
            <span>#${tag}</span>
            <span class="tag-delete" onclick="deleteTag('${tag}')">×</span>
        `;
        list.appendChild(item);
    });
}

function createTag() {
    const input = document.getElementById('newTagInput');
    const name = input.value.trim().replace(/^#/, '');
    
    if (!name) return;
    if (customTags.includes(name)) {
        showToast('이미 존재하는 태그입니다.');
        return;
    }
    
    customTags.push(name);
    saveLocalData();
    updateSidebarTags();
    renderTagsList();
    input.value = '';
    showToast(`태그 "${name}" 추가됨`);
}

function deleteTag(name) {
    if (!confirm(`"${name}" 태그를 삭제하시겠습니까?`)) return;
    
    customTags = customTags.filter(t => t !== name);
    
    // 시리즈에서도 제거
    Object.keys(seriesTags).forEach(id => {
        seriesTags[id] = seriesTags[id].filter(t => t !== name);
    });
    
    saveLocalData();
    updateSidebarTags();
    renderTagsList();
    showToast(`태그 "${name}" 삭제됨`);
}

function updateSidebarTags() {
    const section = document.getElementById('tagSection');
    const divider = document.getElementById('tagDivider');
    const list = document.getElementById('sidebarTagList');
    
    if (customTags.length === 0) {
        if (section) section.style.display = 'none';
        if (divider) divider.style.display = 'none';
        return;
    }
    
    if (section) section.style.display = 'block';
    if (divider) divider.style.display = 'block';
    
    list.innerHTML = '';
    customTags.forEach(tag => {
        const el = document.createElement('span');
        el.className = 'sidebar-tag' + (currentTagFilter === tag ? ' active' : '');
        el.textContent = `#${tag}`;
        el.onclick = () => filterByTag(tag);
        list.appendChild(el);
    });
}

function filterByTag(tag) {
    if (currentTagFilter === tag) {
        currentTagFilter = null;
    } else {
        currentTagFilter = tag;
    }
    
    currentTab = 'all';
    document.querySelectorAll('.sidebar-item[data-tab]').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.tab === 'all') item.classList.add('active');
    });
    
    updateSidebarTags();
    applyFilters();
    
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        toggleSidebar();
    }
}

// ===== 즐겨찾기 =====
function showFavorites() {
    currentTab = 'favorites';
    currentTagFilter = null;
    
    document.querySelectorAll('.sidebar-item[data-tab]').forEach(item => {
        item.classList.remove('active');
    });
    
    document.querySelectorAll('.sidebar-tag').forEach(tag => {
        tag.classList.remove('active');
    });

    const calPage = document.getElementById('calendarPage');
    const grid = document.getElementById('grid');
    if (calPage) calPage.style.display = 'none';
    if (grid) grid.style.display = 'grid';

    // 즐겨찾기 필터 적용
    const cards = document.querySelectorAll('.card');
    cards.forEach((card) => {
        const index = parseInt(card.dataset.index);
        const series = allSeries[index];
        if (!series) return;
        
        if (favorites.includes(series.id)) {
            card.classList.remove('hidden');
        } else {
            card.classList.add('hidden');
        }
    });

    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        toggleSidebar();
    }
    
    showToast('⭐ 즐겨찾기 목록');
}

function toggleFavorite() {
    const series = window.currentDetailSeries;
    if (!series) return;
    
    const idx = favorites.indexOf(series.id);
    if (idx >= 0) {
        favorites.splice(idx, 1);
        showToast('즐겨찾기에서 제거됨');
    } else {
        favorites.push(series.id);
        showToast('⭐ 즐겨찾기에 추가됨');
    }
    
    saveLocalData();
    updateFavoriteIcon();
}

function updateFavoriteIcon() {
    const series = window.currentDetailSeries;
    const icon = document.getElementById('favoriteIcon');
    if (!series || !icon) return;
    
    if (favorites.includes(series.id)) {
        icon.textContent = '★';
        icon.classList.add('favorite-active');
    } else {
        icon.textContent = '☆';
        icon.classList.remove('favorite-active');
    }
}

// ===== 썸네일 =====
async function loadNextThumbnail() {
    if (isLoadingThumbnail || thumbnailQueue.length === 0) return;
    
    isLoadingThumbnail = true;
    const { img, url } = thumbnailQueue.shift();
    
    img.onload = () => {
        img.dataset.loaded = 'true';
        isLoadingThumbnail = false;
        setTimeout(loadNextThumbnail, THUMBNAIL_DELAY_MS);
    };
    img.onerror = () => {
        isLoadingThumbnail = false;
        setTimeout(loadNextThumbnail, THUMBNAIL_DELAY_MS);
    };
    img.src = url;
}

function queueThumbnail(img, url) {
    thumbnailQueue.push({ img, url });
    loadNextThumbnail();
}

function handleThumbnailError(img, fallbackSvg) {
    if (img.dataset.retried || img.src === fallbackSvg || img.src.startsWith('data:image/svg')) {
        img.src = fallbackSvg;
        return;
    }
    img.dataset.retried = 'true';
    const originalThumb = img.dataset.thumb;
    if (originalThumb && originalThumb !== fallbackSvg) {
        setTimeout(() => { img.src = originalThumb; }, 1000);
    } else {
        img.src = fallbackSvg;
    }
}

// ===== Toast =====
function showToast(msg, duration = 3000) {
    const toast = document.createElement('div');
    toast.className = 'toast show';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}
        // ===== Detail Modal =====
window.currentDetailIndex = -1;
window.currentDetailSeries = null;

function openDetailModal(index) {
    const series = allSeries[index];
    if (!series) return;

    const modal = document.getElementById('detailModal');
    if (!modal) return;

    const meta = series.metadata || {};
    const authors = meta.authors || [];
    const description = meta.description || '';
    const sTags = seriesTags[series.id] || [];
    const isAdult = meta.adult === true;

    document.getElementById('detailTitle').textContent = series.name || '제목 없음';

    // 커버
    const coverImg = document.getElementById('detailCover');
    const noImageEl = document.getElementById('detailCoverNoImage');
    
    let thumb = '';
    if (series.thumbnail && series.thumbnail.startsWith("data:image")) {
        thumb = series.thumbnail;
    } else if (series.thumbnailId) {
        thumb = `https://lh3.googleusercontent.com/d/${series.thumbnailId}=s400`;
    } else if (series.thumbnail && series.thumbnail.startsWith("http")) {
        thumb = series.thumbnail;
    }
    
    if (thumb) {
        coverImg.src = thumb;
        coverImg.style.display = 'block';
        if (noImageEl) noImageEl.style.display = 'none';
    } else {
        coverImg.style.display = 'none';
        if (noImageEl) noImageEl.style.display = 'flex';
    }

    // 태그 (제목 밑)
    const tagsEl = document.getElementById('detailTags');
    if (tagsEl) {
        if (sTags.length > 0) {
            tagsEl.innerHTML = sTags.map(t => `<span class="detail-tag">#${t}</span>`).join('');
            tagsEl.style.display = 'flex';
        } else {
            tagsEl.innerHTML = '';
            tagsEl.style.display = 'none';
        }
    }

    // 정보
    document.getElementById('detailInfoTitle').textContent = series.name || '-';
    
    // 작가 (성인작품이면 🔞 추가)
    const authorText = isAdult ? `🔞 ${authors.join(', ') || '작가 미상'}` : (authors.join(', ') || '작가 미상');
    document.getElementById('detailInfoAuthor').textContent = authorText;
    
    document.getElementById('detailInfoStatus').textContent = meta.status || '-';
    document.getElementById('detailInfoPlatform').textContent = meta.publisher || '-';
    
    // 작품 소개
    const descEl = document.getElementById('detailInfoDescription');
    const descWrapper = document.getElementById('descWrapper');
    
    if (descEl) {
        descEl.textContent = description || '소개 정보가 없습니다.';
    }
    if (descWrapper) {
        descWrapper.classList.remove('expanded');
    }

    // Drive 링크
    const driveLink = document.getElementById('detailDriveLink');
    if (driveLink && series.id) {
        driveLink.href = `https://drive.google.com/drive/u/0/folders/${series.id}`;
    }

    // 회차 숨김
    document.getElementById('detailEpisodes').style.display = 'none';

    window.currentDetailIndex = index;
    window.currentDetailSeries = series;
    
    // 즐겨찾기 아이콘 업데이트
    updateFavoriteIcon();

    modal.style.display = 'flex';
}

function closeDetailModal() {
    const modal = document.getElementById('detailModal');
    if (modal) modal.style.display = 'none';
}

function toggleDescription() {
    const wrapper = document.getElementById('descWrapper');
    if (wrapper) {
        wrapper.classList.toggle('expanded');
    }
}

function toggleDetailEpisodes() {
    const episodes = document.getElementById('detailEpisodes');
    const series = window.currentDetailSeries;

    if (!episodes || !series) return;

    if (episodes.style.display === 'none') {
        episodes.style.display = 'block';
        loadDetailEpisodes(series.id, series.name);
    } else {
        episodes.style.display = 'none';
    }
}

async function loadDetailEpisodes(seriesId, title) {
    const listEl = document.getElementById('detailEpisodeList');
    if (!listEl) return;

    listEl.innerHTML = '<div class="detail-episode-loading">로딩 중...</div>';

    try {
        let books = await API.request('view_get_books', { seriesId: seriesId });

        if (!books || books.length === 0) {
            listEl.innerHTML = '<div class="detail-episode-loading">캐시 재생성 중...</div>';
            books = await API.request('view_refresh_cache', { seriesId: seriesId });
        }

        if (!books || books.length === 0) {
            listEl.innerHTML = '<div class="detail-episode-loading">회차가 없습니다</div>';
            return;
        }

        if (typeof updateCurrentBookList === 'function') {
            updateCurrentBookList(books);
        }

        _currentBooks = books;
        _currentSeriesId = seriesId;
        _currentSeriesTitle = title;

        listEl.innerHTML = '';
        books.forEach((book, index) => {
            const item = document.createElement('div');
            item.className = 'detail-episode-item';
            item.innerHTML = `<span>${book.name}</span>`;
            item.onclick = () => {
                closeDetailModal();
                if (typeof loadViewer === 'function') {
                    loadViewer(index);
                }
            };
            listEl.appendChild(item);
        });
    } catch (e) {
        listEl.innerHTML = `<div class="detail-episode-loading" style="color:var(--danger);">오류: ${e.message}</div>`;
    }
}

async function refreshDetailEpisodes() {
    const series = window.currentDetailSeries;
    if (!series) return;
    
    const listEl = document.getElementById('detailEpisodeList');
    listEl.innerHTML = '<div class="detail-episode-loading">새로고침 중...</div>';
    
    try {
        const books = await API.request('view_refresh_cache', { seriesId: series.id });
        
        _currentBooks = books || [];
        _currentSeriesId = series.id;
        _currentSeriesTitle = series.name;
        
        if (!books || books.length === 0) {
            listEl.innerHTML = '<div class="detail-episode-loading">회차가 없습니다</div>';
            return;
        }
        
        listEl.innerHTML = '';
        books.forEach((book, index) => {
            const item = document.createElement('div');
            item.className = 'detail-episode-item';
            item.innerHTML = `<span>${book.name}</span>`;
            item.onclick = () => {
                closeDetailModal();
                if (typeof loadViewer === 'function') {
                    loadViewer(index);
                }
            };
            listEl.appendChild(item);
        });
        
        showToast('회차 목록 새로고침 완료');
    } catch (e) {
        listEl.innerHTML = `<div class="detail-episode-loading" style="color:var(--danger);">오류: ${e.message}</div>`;
    }
}

function openPlatformSite() {
    const series = window.currentDetailSeries;
    if (!series) return;

    const meta = series.metadata || {};
    const url = series.platformUrl || meta.platformUrl || getDynamicLink(series);
    if (url && url !== '#') {
        window.open(url, '_blank');
    } else {
        showToast('플랫폼 링크가 설정되지 않았습니다.');
    }
}

function openEditFromDetail() {
    const index = window.currentDetailIndex;
    if (index >= 0) {
        closeDetailModal();
        openEditModal(index);
    }
}
        // ===== Edit Modal =====
let editingSeriesIndex = -1;
let editingSeriesId = '';
let editCoverFile = null;
let editSelectedTags = [];

function openEditModal(index) {
    const series = allSeries[index];
    if (!series) return;

    editingSeriesIndex = index;
    editingSeriesId = series.id;
    editCoverFile = null;
    editSelectedTags = seriesTags[series.id] ? [...seriesTags[series.id]] : [];

    const meta = series.metadata || {};

    document.getElementById('editTitle').value = series.name || '';
    document.getElementById('editSourceId').value = series.sourceId || '';
    document.getElementById('editAuthor').value = (meta.authors || []).join(', ');
    document.getElementById('editStatus').value = meta.status || 'Unknown';
    document.getElementById('editPublisher').value = meta.publisher || '';
    document.getElementById('editCategory').value = series.category || meta.category || 'Manga';
    document.getElementById('editUrl').value = series.sourceUrl || '';
    document.getElementById('editPlatformUrl').value = series.platformUrl || meta.platformUrl || '';
    document.getElementById('editDescription').value = meta.description || '';
    document.getElementById('editAdult').checked = meta.adult === true;

    // 커버
    const preview = document.getElementById('editCoverPreview');
    const noImage = document.getElementById('editCoverNoImage');
    const filenameEl = document.getElementById('editCoverFilename');
    filenameEl.textContent = '';

    if (series.thumbnailId) {
        preview.src = `https://lh3.googleusercontent.com/d/${series.thumbnailId}=s400`;
        preview.style.display = 'block';
        noImage.style.display = 'none';
    } else {
        preview.style.display = 'none';
        noImage.style.display = 'flex';
    }

    // 태그
    renderEditTags();

    document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
    editingSeriesIndex = -1;
    editingSeriesId = '';
    editCoverFile = null;
    editSelectedTags = [];
}

function renderEditTags() {
    const container = document.getElementById('editTagsContainer');
    const selectEl = document.getElementById('editTagsSelect');
    
    // 선택된 태그
    container.innerHTML = '';
    editSelectedTags.forEach(tag => {
        const el = document.createElement('span');
        el.className = 'edit-tag';
        el.innerHTML = `#${tag} <span class="edit-tag-remove" onclick="removeEditTag('${tag}')">×</span>`;
        container.appendChild(el);
    });
    
    // 선택 가능한 태그
    selectEl.innerHTML = '';
    const available = customTags.filter(t => !editSelectedTags.includes(t));
    available.forEach(tag => {
        const el = document.createElement('span');
        el.className = 'edit-tag-option';
        el.textContent = `#${tag}`;
        el.onclick = () => addEditTag(tag);
        selectEl.appendChild(el);
    });
}

function addEditTag(tag) {
    if (!editSelectedTags.includes(tag)) {
        editSelectedTags.push(tag);
        renderEditTags();
    }
}

function removeEditTag(tag) {
    editSelectedTags = editSelectedTags.filter(t => t !== tag);
    renderEditTags();
}

function handleCoverSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    editCoverFile = file;
    document.getElementById('editCoverFilename').textContent = file.name;

    const reader = new FileReader();
    reader.onload = function(e) {
        const preview = document.getElementById('editCoverPreview');
        const noImage = document.getElementById('editCoverNoImage');
        preview.src = e.target.result;
        preview.style.display = 'block';
        noImage.style.display = 'none';
    };
    reader.readAsDataURL(file);
}

async function saveEditInfo() {
    if (!editingSeriesId) return;

    showToast("저장 중...", 5000);

    const saveBtn = document.querySelector('.edit-btn-save');
    if (saveBtn) {
        saveBtn.textContent = '저장 중...';
        saveBtn.disabled = true;
    }

    try {
        const authorsRaw = document.getElementById('editAuthor').value.trim();
        const authors = authorsRaw ? authorsRaw.split(',').map(a => a.trim()).filter(a => a) : [];

        // 원본 형식에 맞춘 infoData
        const infoData = {
            id: document.getElementById('editSourceId').value.trim() || '',
            title: document.getElementById('editTitle').value.trim(),
            author: authors.length > 0 ? authors[0] : 'Unknown',
            metadata: {
                authors: authors.length > 0 ? authors : ['Unknown'],
                status: document.getElementById('editStatus').value,
                category: document.getElementById('editCategory').value,
                publisher: document.getElementById('editPublisher').value,
                description: document.getElementById('editDescription').value.trim(),
                adult: document.getElementById('editAdult').checked,
                platformUrl: document.getElementById('editPlatformUrl').value.trim()
            },
            url: document.getElementById('editUrl').value.trim(),
            platformUrl: document.getElementById('editPlatformUrl').value.trim(),
            last_episode: 0,
            file_count: 0,
            last_updated: new Date().toISOString()
        };

        await API.request('edit_save_info', {
            folderId: editingSeriesId,
            infoData: infoData
        });

        if (editCoverFile) {
            const base64 = await fileToBase64(editCoverFile);
            await API.request('edit_upload_cover', {
                folderId: editingSeriesId,
                fileName: 'cover.jpg',
                base64Data: base64,
                mimeType: editCoverFile.type
            });
        }

        // 태그 저장 (로컬)
        seriesTags[editingSeriesId] = editSelectedTags;
        saveLocalData();
        updateSidebarTags();

        // 로컬 데이터 업데이트
        if (editingSeriesIndex >= 0 && allSeries[editingSeriesIndex]) {
            const series = allSeries[editingSeriesIndex];
            series.name = infoData.title;
            series.sourceId = infoData.id;
            series.sourceUrl = infoData.url;
            series.platformUrl = infoData.platformUrl;
            series.category = infoData.metadata.category;
            series.metadata = {
                ...series.metadata,
                authors: infoData.metadata.authors,
                status: infoData.metadata.status,
                publisher: infoData.metadata.publisher,
                category: infoData.metadata.category,
                description: infoData.metadata.description,
                adult: infoData.metadata.adult,
                platformUrl: infoData.metadata.platformUrl
            };
        }

        renderGrid(allSeries);
        showToast("저장 완료");
        closeEditModal();

        setTimeout(() => { refreshDB(null, true, true); }, 1000);

    } catch (e) {
        console.error('Save Error:', e);
        showToast(`저장 실패: ${e.message}`, 5000);
    } finally {
        if (saveBtn) {
            saveBtn.textContent = '저장';
            saveBtn.disabled = false;
        }
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ===== Episode Modal (기존 호환) =====
let _currentBooks = [];
let _currentSeriesId = '';
let _currentSeriesTitle = '';

async function openEpisodeList(seriesId, title, seriesIndex) {
    document.getElementById('episodeModal').style.display = 'flex';
    document.querySelector('#episodeModal .modal-title').innerText = title;
    const listEl = document.getElementById('episodeList');
    listEl.innerHTML = '<div style="padding:20px; color:var(--text-tertiary);">로딩 중...</div>';

    try {
        let books = await API.request('view_get_books', { seriesId: seriesId });

        if (!books || books.length === 0) {
            listEl.innerHTML = '<div style="padding:20px; color:var(--warning);">캐시 재생성 중...</div>';
            books = await API.request('view_refresh_cache', { seriesId: seriesId });
        }

        document.querySelector('#episodeModal .modal-title').innerText = `${title} (${books ? books.length : 0})`;
        renderEpisodeList(books, seriesId, title);
    } catch (e) {
        listEl.innerHTML = `<div style="padding:20px; color:var(--danger);">오류: ${e.message}</div>`;
    }
}

function closeEpisodeModal() {
    document.getElementById('episodeModal').style.display = 'none';
}

function renderEpisodeList(books, seriesId, title) {
    const listEl = document.getElementById('episodeList');
    listEl.innerHTML = '';

    if (!books || books.length === 0) {
        listEl.innerHTML = `
            <div style="padding:20px; text-align:center; color:var(--text-tertiary);">
                <div>에피소드가 없습니다</div>
                <button onclick="refreshEpisodeCache('${seriesId}', '${title || ''}')" 
                        style="margin-top:10px; padding:8px 16px; background:var(--warning); color:black; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">
                    캐시 재생성
                </button>
            </div>`;
        return;
    }

    if (typeof updateCurrentBookList === 'function') {
        updateCurrentBookList(books);
    }

    _currentBooks = books;
    _currentSeriesId = seriesId;
    _currentSeriesTitle = title;

    books.forEach((book, index) => {
        const size = book.size ? (book.size / 1024 / 1024).toFixed(1) + ' MB' : '';
        const item = document.createElement('div');
        item.className = 'episode-item';
        item.innerHTML = `
            <div>
                <span class="ep-name">${book.name}</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <span class="ep-meta">${size}</span>
                <button onclick="event.stopPropagation(); openEpisodeEdit(${index})" class="ep-edit-btn" title="이름 변경">✏️</button>
            </div>
        `;
        item.onclick = () => {
            if (typeof loadViewer === 'function') {
                loadViewer(index);
            }
        };
        listEl.appendChild(item);
    });
}

async function refreshEpisodeCache(seriesId, title) {
    const listEl = document.getElementById('episodeList');
    listEl.innerHTML = '<div style="padding:20px; color:var(--warning);">폴더 스캔 중...</div>';

    try {
        const books = await API.request('view_refresh_cache', { seriesId: seriesId });
        document.querySelector('#episodeModal .modal-title').innerText = `${title} (${books ? books.length : 0})`;
        renderEpisodeList(books, seriesId, title);
        showToast('캐시 재생성 완료');
    } catch (e) {
        listEl.innerHTML = `<div style="padding:20px; color:var(--danger);">오류: ${e.message}</div>`;
    }
}

function openEpisodeEdit(index) {
    const book = _currentBooks[index];
    if (!book) return;

    const lastDot = book.name.lastIndexOf('.');
    const nameOnly = lastDot > 0 ? book.name.substring(0, lastDot) : book.name;
    const ext = lastDot > 0 ? book.name.substring(lastDot) : '';

    const newName = prompt('파일 이름 수정:', nameOnly);
    if (newName === null || newName.trim() === '' || newName.trim() === nameOnly) return;

    const fullName = newName.trim() + ext;
    showToast("이름 변경 중...", 3000);

    API.request('view_rename_file', {
        fileId: book.id,
        newName: fullName,
        seriesId: _currentSeriesId
    }).then(() => {
        showToast('파일 이름 변경 완료');
        refreshEpisodeCache(_currentSeriesId, _currentSeriesTitle);
    }).catch(e => {
        showToast(`수정 실패: ${e.message}`, 5000);
    });
}
        // ===== 캘린더 =====
function showCalendar() {
    document.getElementById('calendarModal').style.display = 'flex';
    renderCalendar();
    updateCalendarStats();
    
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        toggleSidebar();
    }
}

function closeCalendarModal() {
    document.getElementById('calendarModal').style.display = 'none';
}

function changeMonth(delta) {
    currentCalendarMonth.setMonth(currentCalendarMonth.getMonth() + delta);
    renderCalendar();
}

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const title = document.getElementById('calendarTitle');
    
    const year = currentCalendarMonth.getFullYear();
    const month = currentCalendarMonth.getMonth();
    
    title.textContent = `${year}년 ${month + 1}월`;
    
    grid.innerHTML = '';
    
    // 요일 헤더
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    days.forEach(d => {
        const el = document.createElement('div');
        el.className = 'cal-day-header';
        el.textContent = d;
        grid.appendChild(el);
    });
    
    // 날짜
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const today = new Date();
    
    // 이전 달
    const prevLastDay = new Date(year, month, 0).getDate();
    for (let i = startDay - 1; i >= 0; i--) {
        const el = document.createElement('div');
        el.className = 'cal-day other-month';
        el.textContent = prevLastDay - i;
        grid.appendChild(el);
    }
    
    // 현재 달
    for (let i = 1; i <= totalDays; i++) {
        const el = document.createElement('div');
        el.className = 'cal-day';
        el.textContent = i;
        
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        
        if (calendarData[dateStr] && calendarData[dateStr].length > 0) {
            el.classList.add('has-record');
        }
        
        if (today.getFullYear() === year && today.getMonth() === month && today.getDate() === i) {
            el.classList.add('today');
        }
        
        if (selectedCalendarDate === dateStr) {
            el.classList.add('selected');
        }
        
        el.onclick = () => selectCalendarDate(dateStr);
        grid.appendChild(el);
    }
    
    // 다음 달
    const remaining = 42 - (startDay + totalDays);
    for (let i = 1; i <= remaining; i++) {
        const el = document.createElement('div');
        el.className = 'cal-day other-month';
        el.textContent = i;
        grid.appendChild(el);
    }
}

function selectCalendarDate(dateStr) {
    selectedCalendarDate = dateStr;
    renderCalendar();
    renderCalendarRecords(dateStr);
}

function renderCalendarRecords(dateStr) {
    const dateEl = document.getElementById('recordsDate');
    const listEl = document.getElementById('recordsList');
    
    const [y, m, d] = dateStr.split('-');
    dateEl.textContent = `${y}년 ${parseInt(m)}월 ${parseInt(d)}일`;
    
    const records = calendarData[dateStr] || [];
    listEl.innerHTML = '';
    
    if (records.length === 0) {
        listEl.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-tertiary);">기록이 없습니다</div>';
        return;
    }
    
    records.forEach((record, idx) => {
        const series = allSeries.find(s => s.id === record.seriesId);
        const name = series ? series.name : '알 수 없는 작품';
        
        const statusIcon = record.status === '완독' ? '✅' : record.status === '포기' ? '❌' : '📖';
        
        const item = document.createElement('div');
        item.className = 'record-item';
        item.innerHTML = `
            <div class="record-title">${statusIcon} ${name}</div>
            <div class="record-meta">${record.progress || 0}% ${record.status} ${record.memo ? '- ' + record.memo : ''}</div>
        `;
        listEl.appendChild(item);
    });
}

function updateCalendarStats() {
    let completed = 0, dropped = 0, reading = 0;
    
    Object.values(calendarData).forEach(records => {
        records.forEach(r => {
            if (r.status === '완독') completed++;
            else if (r.status === '포기') dropped++;
            else reading++;
        });
    });
    
    document.getElementById('statCompleted').textContent = completed;
    document.getElementById('statDropped').textContent = dropped;
    document.getElementById('statReading').textContent = reading;
    document.getElementById('statTotal').textContent = completed + dropped + reading;
}

function addCalendarRecord() {
    if (!selectedCalendarDate) {
        showToast('날짜를 먼저 선택하세요');
        return;
    }
    
    const seriesName = prompt('작품 이름:');
    if (!seriesName) return;
    
    const series = allSeries.find(s => s.name.toLowerCase().includes(seriesName.toLowerCase()));
    if (!series) {
        showToast('작품을 찾을 수 없습니다');
        return;
    }
    
    const status = prompt('상태 (읽는중/완독/포기):', '읽는중');
    const progress = parseInt(prompt('진행률 (0-100):', '0')) || 0;
    const memo = prompt('메모 (선택):') || '';
    
    if (!calendarData[selectedCalendarDate]) {
        calendarData[selectedCalendarDate] = [];
    }
    
    calendarData[selectedCalendarDate].push({
        seriesId: series.id,
        status: status,
        progress: progress,
        memo: memo
    });
    
    saveLocalData();
    renderCalendar();
    renderCalendarRecords(selectedCalendarDate);
    updateCalendarStats();
    showToast('기록 추가됨');
}
        // ===== 백업/복원 =====
function showBackupRestore() {
    document.getElementById('backupModal').style.display = 'flex';
    
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        toggleSidebar();
    }
}

function closeBackupModal() {
    document.getElementById('backupModal').style.display = 'none';
}

function downloadBackup() {
    const data = {
        version: VIEWER_VERSION,
        exportDate: new Date().toISOString(),
        tags: customTags,
        seriesTags: seriesTags,
        calendar: calendarData,
        favorites: favorites,
        settings: {
            adultFilter: adultFilterEnabled,
            theme: localStorage.getItem('toki_theme'),
            domains: JSON.parse(localStorage.getItem('toki_domains') || '{}')
        }
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `toki_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('백업 다운로드 완료');
}

function uploadBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            if (data.tags) customTags = data.tags;
            if (data.seriesTags) seriesTags = data.seriesTags;
            if (data.calendar) calendarData = data.calendar;
            if (data.favorites) favorites = data.favorites;
            if (data.settings) {
                if (data.settings.adultFilter !== undefined) {
                    adultFilterEnabled = data.settings.adultFilter;
                }
                if (data.settings.theme) {
                    localStorage.setItem('toki_theme', data.settings.theme);
                    loadSavedTheme();
                }
                if (data.settings.domains) {
                    localStorage.setItem('toki_domains', JSON.stringify(data.settings.domains));
                    loadDomains();
                }
            }
            
            saveLocalData();
            updateSidebarTags();
            updateAdultToggle();
            applyFilters();
            
            showToast('백업 복원 완료');
        } catch (err) {
            showToast('백업 파일 오류');
        }
    };
    reader.readAsText(file);
}

async function syncToDrive() {
    showToast('Drive 동기화 중...');
    // TODO: GAS와 연동하여 Drive에 저장
    showToast('아직 구현되지 않았습니다');
}

async function syncFromDrive() {
    showToast('Drive에서 불러오는 중...');
    // TODO: GAS와 연동하여 Drive에서 불러오기
    showToast('아직 구현되지 않았습니다');
}

// ===== 기타 함수들 =====
function toggleSettings() {
    const el = document.getElementById('domainPanel');
    if (el) el.style.display = el.style.display === 'block' ? 'none' : 'block';
}

function getDynamicLink(series) {
    if (series.platformUrl) return series.platformUrl;
    
    const meta = series.metadata || {};
    if (meta.platformUrl) return meta.platformUrl;
    
    const contentId = series.sourceId;
    let cat = series.category || meta.category || '';

    if (!cat) {
        if ((series.name || "").includes("북토끼")) cat = "Novel";
        else if ((series.name || "").includes("마나토끼")) cat = "Manga";
        else cat = "Webtoon";
    }

    const saved = JSON.parse(localStorage.getItem('toki_domains')) || DEFAULT_DOMAINS;
    
    let baseUrl = `https://newtoki${saved.newtoki}.com`;
    let path = "/webtoon/";

    if (cat === "Novel") { 
        baseUrl = `https://booktoki${saved.booktoki}.com`; 
        path = "/novel/"; 
    } else if (cat === "Manga") { 
        baseUrl = `https://manatoki${saved.manatoki}.net`; 
        path = "/comic/"; 
    }

    return contentId ? (baseUrl + path + contentId) : "#";
}

function saveActiveSettings() {
    const domains = {
        newtoki: document.getElementById('url_newtoki').value.trim() || DEFAULT_DOMAINS.newtoki,
        manatoki: document.getElementById('url_manatoki').value.trim() || DEFAULT_DOMAINS.manatoki,
        booktoki: document.getElementById('url_booktoki').value.trim() || DEFAULT_DOMAINS.booktoki
    };
    localStorage.setItem('toki_domains', JSON.stringify(domains));

    const folderId = document.getElementById('setting_folderId').value.trim();
    const deployId = document.getElementById('setting_deployId').value.trim();
    const apiKey = document.getElementById('setting_apiKey').value.trim();
    
    if (folderId && deployId) {
        const apiUrl = `https://script.google.com/macros/s/${deployId}/exec`;
        API.setConfig(apiUrl, folderId, apiKey);
    }

    const vMode = document.getElementById('pref_2page').checked ? '2page' : '1page';
    const vCover = document.getElementById('pref_cover').checked;
    const vRtl = document.getElementById('pref_rtl').checked;
    const vEngine = document.querySelector('input[name="view_engine"]:checked')?.value || 'legacy';

    localStorage.setItem('toki_v_mode', vMode);
    localStorage.setItem('toki_v_cover', vCover);
    localStorage.setItem('toki_v_rtl', vRtl);
    localStorage.setItem('toki_v_engine', vEngine);

    showToast("설정이 저장되었습니다.");
    
    if(folderId && deployId) refreshDB();
}

function loadDomains() {
    const saved = JSON.parse(localStorage.getItem('toki_domains')) || DEFAULT_DOMAINS;
    const elNew = document.getElementById('url_newtoki');
    const elMana = document.getElementById('url_manatoki');
    const elBook = document.getElementById('url_booktoki');
    
    if(elNew) elNew.value = saved.newtoki;
    if(elMana) elMana.value = saved.manatoki;
    if(elBook) elBook.value = saved.booktoki;

    const elFolder = document.getElementById('setting_folderId');
    const elDeploy = document.getElementById('setting_deployId');
    const elApiKey = document.getElementById('setting_apiKey');
    
    if (API._config.folderId && elFolder) elFolder.value = API._config.folderId;
    if (API._config.baseUrl && elDeploy) {
        const match = API._config.baseUrl.match(/\/s\/([^\/]+)\/exec/);
        if (match && match[1]) elDeploy.value = match[1];
    }
    if (API._config.apiKey && elApiKey) elApiKey.value = API._config.apiKey;

    const vMode = localStorage.getItem('toki_v_mode') || '1page';
    const vCover = (localStorage.getItem('toki_v_cover') === 'true');
    const vRtl = (localStorage.getItem('toki_v_rtl') === 'true');
    const vEngine = localStorage.getItem('toki_v_engine') || 'legacy';

    if(document.getElementById('pref_2page')) document.getElementById('pref_2page').checked = (vMode === '2page');
    if(document.getElementById('pref_cover')) document.getElementById('pref_cover').checked = vCover;
    if(document.getElementById('pref_rtl')) document.getElementById('pref_rtl').checked = vRtl;
    
    const radios = document.getElementsByName('view_engine');
    for(const r of radios) r.checked = (r.value === vEngine);
}

function saveManualConfig() {
    const url = document.getElementById('configApiUrl').value.trim();
    const id = document.getElementById('configFolderId').value.trim();
    const apiKey = document.getElementById('configApiKey')?.value?.trim() || '';
    
    if (!url || !id) return alert("URL과 Folder ID를 모두 입력해주세요.");
    
    API.setConfig(url, id, apiKey);
    document.getElementById('configModal').style.display = 'none';
    refreshDB();
}

// ===== Window 등록 =====
window.refreshDB = refreshDB;
window.toggleSettings = toggleSettings;
window.switchTab = switchTab;
window.filterData = filterData;
window.saveActiveSettings = saveActiveSettings;
window.saveManualConfig = saveManualConfig;
window.showToast = showToast;
window.renderGrid = renderGrid;
window.handleThumbnailError = handleThumbnailError;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.handleCoverSelect = handleCoverSelect;
window.saveEditInfo = saveEditInfo;
window.openEpisodeList = openEpisodeList;
window.closeEpisodeModal = closeEpisodeModal;
window.renderEpisodeList = renderEpisodeList;
window.refreshEpisodeCache = refreshEpisodeCache;
window.openEpisodeEdit = openEpisodeEdit;
window.openDetailModal = openDetailModal;
window.closeDetailModal = closeDetailModal;
window.toggleDetailEpisodes = toggleDetailEpisodes;
window.loadDetailEpisodes = loadDetailEpisodes;
window.refreshDetailEpisodes = refreshDetailEpisodes;
window.openEditFromDetail = openEditFromDetail;
window.openPlatformSite = openPlatformSite;
window.toggleDescription = toggleDescription;
window.toggleSidebar = toggleSidebar;
window.toggleTheme = toggleTheme;
window.toggleSettingsAccordion = toggleSettingsAccordion;
window.toggleAdultFilter = toggleAdultFilter;
window.showTags = showTags;
window.closeTagsModal = closeTagsModal;
window.createTag = createTag;
window.deleteTag = deleteTag;
window.filterByTag = filterByTag;
window.addEditTag = addEditTag;
window.removeEditTag = removeEditTag;
window.showCalendar = showCalendar;
window.closeCalendarModal = closeCalendarModal;
window.changeMonth = changeMonth;
window.addCalendarRecord = addCalendarRecord;
window.showBackupRestore = showBackupRestore;
window.closeBackupModal = closeBackupModal;
window.downloadBackup = downloadBackup;
window.uploadBackup = uploadBackup;
window.syncToDrive = syncToDrive;
window.syncFromDrive = syncFromDrive;
window.showFavorites = showFavorites;
window.toggleFavorite = toggleFavorite;
window.showFavorites = showFavorites;
window.toggleFavorite = toggleFavorite;
