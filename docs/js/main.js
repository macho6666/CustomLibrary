const NO_IMAGE_SVG = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%22%20height%3D%22100%22%20viewBox%3D%220%200%20100%20100%22%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20fill%3D%22%23333%22%2F%3E%3Ctext%20x%3D%2250%22%20y%3D%2250%22%20font-family%3D%22Arial%22%20font-size%3D%2212%22%20fill%3D%22%23666%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%3ENo%20Image%3C%2Ftext%3E%3C%2Fsvg%3E";

const DEFAULT_DOMAINS = {
    newtoki: '469',
    manatoki: '469',
    booktoki: '469'
};

const VIEWER_VERSION = "v1.1.3";
window.TOKI_VIEWER_VERSION = VIEWER_VERSION;

let allSeries = [];
const thumbnailQueue = [];
let isLoadingThumbnail = false;
const THUMBNAIL_DELAY_MS = 250;
let activeBlobUrls = [];

function clearBlobUrls() {
    activeBlobUrls.forEach(url => URL.revokeObjectURL(url));
    activeBlobUrls = [];
}

window.addEventListener('DOMContentLoaded', () => {
    window.addEventListener("message", handleMessage, false);
    
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

        renderGrid(seriesList);
        showToast("📚 라이브러리 업데이트 완료");

    } catch (e) {
        console.error("Library Fetch Error:", e);
        showToast(`❌ 로드 실패: ${e.message}`, 5000);
    } finally {
        if(loader) loader.style.display = 'none';
    }
}

function renderGrid(seriesList) {
    if (Array.isArray(seriesList)) {
        allSeries = seriesList;
    } else {
        allSeries = [];
    }
    const grid = document.getElementById('grid');
    clearBlobUrls();
    grid.innerHTML = '';

    if (!allSeries || allSeries.length === 0) {
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

    allSeries.forEach((series, index) => {
        try {
            const card = document.createElement('div');
            card.className = 'card';

            const meta = series.metadata || {};
            const authors = meta.authors || [];
            const status = meta.status || '';
            const publisher = meta.publisher || '';
            
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
                    <span class="author" title="${authors.join(', ')}">${authors.join(', ') || '작가 미상'}</span>
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
}

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

function saveManualConfig() {
    const url = document.getElementById('configApiUrl').value.trim();
    const id = document.getElementById('configFolderId').value.trim();
    const apiKey = document.getElementById('configApiKey')?.value?.trim() || '';
    
    if (!url || !id) return alert("URL과 Folder ID를 모두 입력해주세요.");
    
    API.setConfig(url, id, apiKey);
    document.getElementById('configModal').style.display = 'none';
    refreshDB();
}

let currentTab = 'all';

function switchTab(tabName) {
    currentTab = tabName;
    
    document.querySelectorAll('.sidebar-item[data-tab]').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.tab === tabName) item.classList.add('active');
    });

    const calPage = document.getElementById('calendarPage');
    const grid = document.getElementById('grid');
    if (calPage) calPage.style.display = 'none';
    if (grid) grid.style.display = 'grid';

    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        toggleSidebar();
    }

    filterData();
}

function filterData() {
    const query = document.getElementById('search').value.toLowerCase();
    const cards = document.querySelectorAll('.card');
    
    cards.forEach((card, index) => {
        const series = allSeries[index];
        if (!series) return;
        const meta = series.metadata || { authors: [] };
        const authors = meta.authors || [];
        const text = (series.name + (authors.join(' '))).toLowerCase();
        
        const matchText = text.includes(query);
        const cat = series.category || (series.metadata ? series.metadata.category : 'Unknown');
        const matchTab = (currentTab === 'all') || (cat === currentTab);

        card.style.display = (matchText && matchTab) ? 'flex' : 'none';
    });
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

    showToast("✅ 설정이 저장되었습니다.");
    
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

function getDynamicLink(series) {
    if (series.platformUrl) return series.platformUrl;
    
    const contentId = series.sourceId;
    let cat = series.category || (series.metadata ? series.metadata.category : '');

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

async function loadNextThumbnail() {
    if (isLoadingThumbnail || thumbnailQueue.length === 0) return;
    
    isLoadingThumbnail = true;
    const { img, url } = thumbnailQueue.shift();
    
    if (window.tokiBridge && window.tokiBridge.isConnected && window.tokiBridge.fetch && url.includes('googleusercontent.com')) {
        try {
            const fileIdMatch = url.match(/\/d\/([^=]+)/);
            if (fileIdMatch) {
                const response = await window.tokiBridge.fetch(url, { method: 'GET', responseType: 'blob' });
                if (response) {
                    const blob = new Blob([response]);
                    const blobUrl = URL.createObjectURL(blob);
                    activeBlobUrls.push(blobUrl);
                    img.src = blobUrl;
                    img.onload = () => {
                        img.dataset.loaded = 'true';
                        isLoadingThumbnail = false;
                        setTimeout(loadNextThumbnail, 50);
                    };
                    img.onerror = () => {
                        isLoadingThumbnail = false;
                        setTimeout(loadNextThumbnail, THUMBNAIL_DELAY_MS);
                    };
                    return;
                }
            }
        } catch (e) {}
    }
    
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

function toggleSettings() {
    const el = document.getElementById('domainPanel');
    if (el) el.style.display = el.style.display === 'block' ? 'none' : 'block';
}

let editingSeriesIndex = -1;
let editingSeriesId = '';
let editCoverFile = null;

function openEditModal(index) {
    const series = allSeries[index];
    if (!series) return;

    editingSeriesIndex = index;
    editingSeriesId = series.id;
    editCoverFile = null;

    const meta = series.metadata || {};

    document.getElementById('editTitle').value = series.name || '';
    document.getElementById('editSourceId').value = series.sourceId || '';
    document.getElementById('editAuthor').value = (meta.authors || []).join(', ');
    document.getElementById('editStatus').value = meta.status || 'Unknown';
    document.getElementById('editPublisher').value = meta.publisher || '';
    document.getElementById('editCategory').value = series.category || meta.category || 'Manga';
    document.getElementById('editUrl').value = series.sourceUrl || '';
    document.getElementById('editPlatformUrl').value = series.platformUrl || '';
    document.getElementById('editDescription').value = meta.description || '';

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

    document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
    editingSeriesIndex = -1;
    editingSeriesId = '';
    editCoverFile = null;
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

    showToast("💾 저장 중...", 5000);

    const saveBtn = document.querySelector('.edit-btn-save');
    if (saveBtn) {
        saveBtn.textContent = '저장 중...';
        saveBtn.disabled = true;
    }

    try {
        const authorsRaw = document.getElementById('editAuthor').value.trim();
        const authors = authorsRaw ? authorsRaw.split(',').map(a => a.trim()).filter(a => a) : [];

        const infoData = {
            id: document.getElementById('editSourceId').value.trim(),
            title: document.getElementById('editTitle').value.trim(),
            metadata: {
                authors: authors.length > 0 ? authors : ['Unknown'],
                status: document.getElementById('editStatus').value,
                category: document.getElementById('editCategory').value,
                publisher: document.getElementById('editPublisher').value,
                description: document.getElementById('editDescription').value.trim()
            },
            url: document.getElementById('editUrl').value.trim(),
            platformUrl: document.getElementById('editPlatformUrl').value.trim(),
            author: authors.length > 0 ? authors[0] : 'Unknown',
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
                description: infoData.metadata.description
            };
        }

        renderGrid(allSeries);
        showToast("✅ 저장 완료");
        closeEditModal();

        setTimeout(() => { refreshDB(null, true, true); }, 1000);

    } catch (e) {
        showToast(`❌ 저장 실패: ${e.message}`, 5000);
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

let _currentBooks = [];
let _currentSeriesId = '';
let _currentSeriesTitle = '';

async function openEpisodeList(seriesId, title, seriesIndex) {
    document.getElementById('episodeModal').style.display = 'flex';
    document.querySelector('#episodeModal .modal-title').innerText = `${title}`;
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
                    🔄 캐시 재생성
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
        showToast('✅ 캐시 재생성 완료');
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
    showToast("✏️ 이름 변경 중...", 3000);

    API.request('view_rename_file', {
        fileId: book.id,
        newName: fullName,
        seriesId: _currentSeriesId
    }).then(() => {
        showToast('✅ 파일 이름 변경 완료');
        refreshEpisodeCache(_currentSeriesId, _currentSeriesTitle);
    }).catch(e => {
        showToast(`❌ 수정 실패: ${e.message}`, 5000);
    });
}

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

    document.getElementById('detailTitle').textContent = series.name || '제목 없음';

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

    document.getElementById('detailInfoTitle').textContent = series.name || '-';
    document.getElementById('detailInfoAuthor').textContent = authors.join(', ') || '작가 미상';
    document.getElementById('detailInfoStatus').textContent = meta.status || '-';
    document.getElementById('detailInfoPlatform').textContent = meta.publisher || '-';
    
    const descEl = document.getElementById('detailInfoDescription');
    const descWrapper = document.querySelector('.description-wrapper');
    const descToggle = document.getElementById('descToggleBtn');
    
    if (descEl) {
        descEl.textContent = description || '소개 정보가 없습니다.';
    }
    if (descWrapper) {
        descWrapper.classList.remove('expanded');
    }
    if (descToggle) {
        descToggle.textContent = '▽';
    }

    const driveLink = document.getElementById('detailDriveLink');
    if (driveLink && series.id) {
        driveLink.href = `https://drive.google.com/drive/u/0/folders/${series.id}`;
    }

    document.getElementById('detailEpisodes').style.display = 'none';

    window.currentDetailIndex = index;
    window.currentDetailSeries = series;

    modal.style.display = 'flex';
}

function closeDetailModal() {
    const modal = document.getElementById('detailModal');
    if (modal) modal.style.display = 'none';
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

function openEditFromDetail() {
    const index = window.currentDetailIndex;
    if (index >= 0) {
        closeDetailModal();
        openEditModal(index);
    }
}

function openPlatformSite() {
    const series = window.currentDetailSeries;
    if (!series) return;

    const url = series.platformUrl || getDynamicLink(series);
    if (url && url !== '#') {
        window.open(url, '_blank');
    }
}

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
window.openEditFromDetail = openEditFromDetail;
window.openPlatformSite = openPlatformSite;
