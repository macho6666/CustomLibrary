/* ⚙️ TokiSync Server Code Bundle v1.2.0 (Updated: 2026-02-04) */

/* ========================================================================== */
/* FILE: Main.gs */
/* ========================================================================== */

// ⚙️ TokiSync API Server v1.2.0 (Stateless & Secure)
// -----------------------------------------------------
// 🤝 Compatibility:
//    - Client v1.2.0+ (User Execution Mode)
//    - View v1.2.0+ (Secure API Key)
// -----------------------------------------------------

// [GET] 서버 상태 확인용
/**
 * [GET] 서버 상태 확인용 엔드포인트
 * 웹 앱 URL 접근 시 서버가 작동 중인지 확인하는 메시지를 반환합니다.
 *
 * @param {Object} e - 이벤트 객체
 * @returns {TextOutput} 서버 상태 메시지
 */
function doGet(e) {
  return ContentService.createTextOutput(
    "✅ TokiSync API Server v1.2.0 (Stateless) is Running...",
  );
}

// [POST] Tampermonkey & Viewer Request Handler
/**
 * [POST] API 요청 처리 핸들러
 * 클라이언트(Tampermonkey, Web App)로부터의 JSON 요청을 처리합니다.
 *
 * [요청 흐름]
 * 1. Payload 파싱 및 `folderId` 검증
 * 2. API Key 인증 (모든 요청 필수)
 * 3. Action Type(`type`)에 따라 적절한 서비스 함수 호출
 * 4. 결과 반환 (`success` or `error`)
 */

// 🔒 API Key Configuration
// =================================================================
// IMPORTANT: You MUST set 'API_KEY' in Script Properties!
// 1. Project Settings (Gear Icon) > Script Properties
// 2. Add Row: Property="API_KEY", Value="your_secret_password"
// =================================================================
const API_KEY = PropertiesService.getScriptProperties().getProperty("API_KEY");

function doPost(e) {
  Debug.start(); // 🐞 디버그 시작
  try {
    const data = JSON.parse(e.postData.contents);

    // 0. API Key Validation (Security) - All Requests Including Viewer
    if (!API_KEY) {
      return createRes(
        "error",
        "Server Configuration Error: API_KEY not set in Script Properties",
      );
    }
    if (!data.apiKey || data.apiKey !== API_KEY) {
      return createRes("error", "Unauthorized: Invalid API Key");
    }

    // 1. 필수 파라미터 검증 (folderId)
    // Stateless 방식이므로 클라이언트가 반드시 folderId를 보내야 함
    if (!data.folderId) {
      return createRes("error", "Missing folderId in request payload");
    }

    // 🔒 [New] 클라이언트 프로토콜 버전 검증 (Major Version 기준)
    // const MIN_PROTOCOL_VERSION = 3;
    // const MIN_CLIENT_VERSION = "3.0.0-beta.251215.0002";
    // const clientProtocol = data.protocolVersion || 0;

    // [Verified] Strict Check Disabled for Safety during Rollout
    /*
    if (clientProtocol < MIN_PROTOCOL_VERSION) {
        return createRes({
            status: 'error',
            error: `Client Incompatible (Requires Protocol v${MIN_PROTOCOL_VERSION}+)`,
            message: '클라이언트 업데이트가 필요합니다.'
        });
    }
    */
    const rootFolderId = data.folderId;

    // 2. 요청 타입 분기
    let result;
    try {
      if (data.type === "init")
        result = initResumableUpload(data, rootFolderId);
      else if (data.type === "upload") result = uploadChunk(data);
      else if (data.type === "check_history")
        result = checkDownloadHistory(data, rootFolderId);
      else if (data.type === "save_info")
        result = saveSeriesInfo(data, rootFolderId);
      else if (data.type === "get_library")
        result = getLibraryIndex(rootFolderId);
      else if (data.type === "update_library_status")
        result = updateLibraryStatus(data, rootFolderId);
      else if (data.type === "get_server_info") {
        result = createRes("success", {
          name: "TokiSync API",
          status: "success",
          message: "TokiSync Server is Online",
          version: SERVER_VERSION,
          timestamp: new Date().toISOString(),
          url: ScriptApp.getService().getUrl(),
          user: Session.getActiveUser().getEmail(),
        });
      } else if (data.type === "history_get")
        result = checkDownloadHistory(data, rootFolderId);
      else if (data.type === "migrate")
        result = migrateLegacyStructure(rootFolderId);
      // [Viewer Migration] Isolated Routing
      else if (data.type && data.type.startsWith("view_")) {
        result = View_Dispatcher(data);
      } else result = createRes("error", "Unknown type");
    } catch (handlerError) {
      Debug.error("❌ Handler Error", handlerError);
      return createRes("error", handlerError.toString(), Debug.getLogs());
    }

    return result;
  } catch (error) {
    return createRes("error", error.toString());
  }
}

/* ========================================================================== */
/* FILE: Utils.gs */
/* ========================================================================== */

// =======================================================
// 🛠 유틸리티 함수
// =======================================================

/**
 * 폴더명으로 Google Drive 폴더 ID를 검색합니다.
 * Advanced Drive Service를 사용하여 빠르고 정확하게 검색합니다.
 * [ID] 태그가 있는 경우 해당 태그를 우선적으로 검색합니다.
 *
 * @param {string} folderName - 검색할 폴더명 (e.g. "[123] 제목")
 * @param {string} rootFolderId - 검색 대상 루트 폴더 ID
 * @returns {string|null} 검색된 폴더 ID 또는 null
 */
function findFolderId(folderName, rootFolderId) {
  const idMatch = folderName.match(/^\[(\d+)\]/);
  const root = DriveApp.getFolderById(rootFolderId);

  console.log(`🔍 findFolderId: "${folderName}"`); // Stackdriver Log
  Debug.log(`🔍 findFolderId: "${folderName}"`);

  console.log(`🔍 findFolderId: "${folderName}"`);
  Debug.log(`🔍 findFolderId (Advanced): "${folderName}"`);

  let query = "";
  // 1. [ID] 포함된 폴더 검색 (제목 변경 대응 및 정확성 향상)
  if (idMatch) {
    Debug.log(`   -> Detected ID: [${idMatch[1]}]`);
    query = `'${rootFolderId}' in parents and name contains '[${idMatch[1]}]' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  } else {
    Debug.log(`   -> Exact Name Search`);
    const safeName = folderName.replace(/'/g, "\\'");
    query = `'${rootFolderId}' in parents and name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  }
  Debug.log(`   -> Query: ${query}`);

  try {
    const response = Drive.Files.list({
      q: query,
      fields: "files(id, name)",
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    if (response.files && response.files.length > 0) {
      Debug.log(
        `   ✅ Found: ${response.files[0].name} (${response.files[0].id})`,
      );
      return response.files[0].id;
    }
    Debug.log(`   ⚠️ Primary Search returned 0 results.`);

    // 2. Fallback: ID 검색 실패 시, 제목만으로(Exact Name) 재검색 (Legacy 지원)
    if (idMatch) {
      Debug.log(`⚠️ Primary search failed. Trying fallback (Exact Name)...`);
      const titleOnly = folderName.replace(idMatch[0], "").trim();
      const safeTitle = titleOnly.replace(/'/g, "\\'");
      const fallbackQuery = `'${rootFolderId}' in parents and name = '${safeTitle}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

      const fallbackRes = Drive.Files.list({
        q: fallbackQuery,
        fields: "files(id, name)",
        pageSize: 1,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      if (fallbackRes.files && fallbackRes.files.length > 0) {
        Debug.log(
          `   ✅ Fallback Found: ${fallbackRes.files[0].name} (${fallbackRes.files[0].id})`,
        );
        return fallbackRes.files[0].id;
      }
    }
  } catch (e) {
    Debug.error("❌ Advanced Search Failed", e);
  }

  return null;
}

/**
 * [New] 카테고리(Webtoon/Novel) 구조를 반영하여 시리즈 폴더를 찾거나 생성합니다.
 * Legacy(Root 직속) 폴더가 있으면 그걸 우선 사용(마이그레이션 전 호환성).
 */
function getOrCreateSeriesFolder(
  rootFolderId,
  folderName,
  category = "Webtoon",
  createIfMissing = true,
) {
  const root = DriveApp.getFolderById(rootFolderId);

  // 1. Check Legacy (Root Direct)
  const legacyId = findFolderId(folderName, rootFolderId);
  if (legacyId) {
    Debug.log(`♻️ Found Legacy Series Folder in Root: ${legacyId}`);
    return DriveApp.getFolderById(legacyId);
  }

  // 2. Check/Create Category Folder
  // category should be "Webtoon" or "Novel"
  const catName = category || "Webtoon";
  let catFolder;
  const catIter = root.getFoldersByName(catName);

  if (catIter.hasNext()) {
    catFolder = catIter.next();
  } else {
    // If scanning (read-only) and category missing -> Not Found
    if (!createIfMissing) return null;
    Debug.log(`📂 Creating Category Folder: ${catName}`);
    catFolder = root.createFolder(catName);
  }

  // 3. Check Series in Category
  // Note: if catFolder was just created, this is redundant but safe
  const seriesId = findFolderId(folderName, catFolder.getId());
  if (seriesId) {
    return DriveApp.getFolderById(seriesId);
  }

  if (!createIfMissing) return null;

  // 4. Create New Series in Category
  Debug.log(`🆕 Creating New Series Folder in ${catName}: ${folderName}`);
  return catFolder.createFolder(folderName);
}

/**
 * JSON 응답 객체(TextOutput)를 생성합니다.
 *
 * @param {string} status - 응답 상태 ('success' | 'error')
 * @param {any} body - 응답 데이터
 * @param {Array} [debugLogs=null] - 디버그 로그 (옵션)
 * @returns {TextOutput} JSON TextOutput
 */
function createRes(status, body, debugLogs = null) {
  const payload = { status: status, body: body };
  if (debugLogs) payload.debugLogs = debugLogs;

  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

// 권한 승인용 더미 함수
function authorizeCheck() {
  DriveApp.getRootFolder();
  UrlFetchApp.fetch("https://www.google.com");
  console.log("✅ 권한 승인 완료!");
}

/* ========================================================================== */
/* FILE: SyncService.gs */
/* ========================================================================== */

// =======================================================
// 📂 동기화 및 라이브러리 서비스
// =======================================================

// 기능: 다운로드 기록 확인 (폴더/파일 스캔)
// 기능: 다운로드 기록 확인 (폴더/파일 스캔)
function checkDownloadHistory(data, rootFolderId) {
  Debug.log(`🚀 checkDownloadHistory Start`);
  // Use Helper with Category support (Create=false)
  const seriesFolder = getOrCreateSeriesFolder(
    rootFolderId,
    data.folderName,
    data.category,
    false,
  );

  if (!seriesFolder) {
    Debug.log(
      `❌ Folder not found in Root(${rootFolderId}) or Category(${data.category})`,
    );
    return createRes("success", [], Debug.getLogs());
  }
  const folderId = seriesFolder.getId();

  Debug.log(`📂 Scanning Files in: ${folderId}`);
  // const seriesFolder = DriveApp.getFolderById(folderId); // Redundant
  const existingEpisodes = [];

  // 🚀 Optimization: Drive Advanced Service (Drive.Files.list)
  let pageToken = null;
  let fetchCount = 0;

  try {
    do {
      Debug.log(`☁️ Fetching file list (Page: ${fetchCount + 1})...`);
      const response = Drive.Files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "nextPageToken, files(name)",
        pageSize: 1000,
        pageToken: pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      if (response.files) {
        Debug.log(`   -> Retrieved ${response.files.length} files.`);
        response.files.forEach((file) => {
          const match = file.name.match(/^(\d+)/);
          if (match) existingEpisodes.push(parseInt(match[1]));
        });
      }
      pageToken = response.nextPageToken;
      fetchCount++;
    } while (pageToken);

    Debug.log(`🎉 Scan Complete. Found ${existingEpisodes.length} episodes.`);
  } catch (e) {
    Debug.error("❌ Drive Scan Failed (Advanced)", e);
    // Fallback? No, we want to see if this fails.
    return createRes("error", `Scan Error: ${e.message}`, Debug.getLogs());
  }

  // 폴더 스캔 (구버전 호환) - 이건 DriveApp 그대로 유지 (보조)
  // const subFolders = seriesFolder.getFolders(); ... (생략 또는 필요시 추가)

  // 중복 제거 및 정렬
  const uniqueEpisodes = [...new Set(existingEpisodes)].sort((a, b) => a - b);
  Debug.log(`✅ Total Unique Episodes: ${uniqueEpisodes.length}`);

  return createRes("success", uniqueEpisodes, Debug.getLogs());
}

// 기능: 작품 정보(info.json) 저장
function saveSeriesInfo(data, rootFolderId) {
  // Use Helper with Category support (Create=true)
  const seriesFolder = getOrCreateSeriesFolder(
    rootFolderId,
    data.folderName,
    data.category,
    true,
  );
  // const root = DriveApp.getFolderById(rootFolderId); // Unused

  const fileName = "info.json";
  const files = seriesFolder.getFilesByName(fileName);

  const infoData = {
    id: data.id,
    title: data.title,
    metadata: {
      authors: [data.author || "Unknown"],
      status: data.status || "Unknown",
      category: data.category || "Unknown",
      publisher: data.site || "",
    },
    thumbnail: data.thumbnail || "",
    url: data.url,

    // Legacy / Convenience fields
    author: data.author || "Unknown", // for backward compat if needed during migration
    last_episode: data.last_episode || 0,
    file_count: data.file_count || 0,
    last_updated: new Date().toISOString(),
  };

  const jsonString = JSON.stringify(infoData, null, 2);

  if (files.hasNext()) {
    files.next().setContent(jsonString);
  } else {
    seriesFolder.createFile(fileName, jsonString, MimeType.PLAIN_TEXT);
  }

  return createRes("success", "Info saved");
}

// 기능: 라이브러리 인덱스 조회 (TokiView 캐시 공유)
function getLibraryIndex(rootFolderId) {
  const root = DriveApp.getFolderById(rootFolderId);
  const files = root.getFilesByName("library_index.json");

  if (files.hasNext()) {
    const content = files.next().getBlob().getDataAsString();
    try {
      return createRes("success", JSON.parse(content));
    } catch (e) {
      return createRes("success", []);
    }
  }
  return createRes("success", []); // 파일 없으면 빈 배열
}

// 기능: 라이브러리 상태 업데이트 (클라이언트 결과 저장)
function updateLibraryStatus(data, rootFolderId) {
  const root = DriveApp.getFolderById(rootFolderId);
  const files = root.getFilesByName("library_index.json");

  if (!files.hasNext()) return createRes("error", "Index not found");

  const file = files.next();
  let library = [];
  try {
    library = JSON.parse(file.getBlob().getDataAsString());
    if (!Array.isArray(library)) library = [];
  } catch (e) {
    return createRes("error", "Invalid JSON");
  }

  // 업데이트 반영
  const updates = data.updates;
  let changedCount = 0;

  updates.forEach((u) => {
    const item = library.find((i) => i.id === u.id);
    if (item) {
      item.latest_episode_in_site = u.latestEpisode;
      item.last_checked_at = new Date().toISOString();
      changedCount++;
    }
  });

  if (changedCount > 0) {
    file.setContent(JSON.stringify(library));
  }
}

// =======================================================
// 📦 마이그레이션 서비스 (Legacy -> v3.1 Structure)
// =======================================================

function migrateLegacyStructure(rootFolderId) {
  const root = DriveApp.getFolderById(rootFolderId);
  const webtoonFolder = getOrCreateSeriesFolder(
    rootFolderId,
    "Webtoon",
    "Webtoon",
    true,
  ); // Ensure Cat Folder
  const novelFolder = getOrCreateSeriesFolder(
    rootFolderId,
    "Novel",
    "Novel",
    true,
  ); // Ensure Cat Folder

  // Reuse helper? getOrCreateSeriesFolder creates Series folder.
  // We just want ensure Category folders exist.
  // Let's do it manually for clarity.
  const ensureCat = (name) => {
    const iter = root.getFoldersByName(name);
    return iter.hasNext() ? iter.next() : root.createFolder(name);
  };

  const catWebtoon = ensureCat("Webtoon");
  const catNovel = ensureCat("Novel");
  const catManga = ensureCat("Manga");

  const folders = root.getFolders();
  const toMigrate = [];
  const EXT = ["Webtoon", "Novel", "Manga", "Libraries", "System"];

  // 1. Collect Valid Folders (Snapshot)
  while (folders.hasNext()) {
    const folder = folders.next();
    const name = folder.getName();
    if (
      !EXT.includes(name) &&
      name !== "info.json" &&
      name !== "library_index.json"
    ) {
      toMigrate.push(folder);
    }
  }

  // 2. Process Migration
  toMigrate.forEach((folder) => {
    try {
      const name = folder.getName();
      Debug.log(`🔄 Migrating: ${name}`);

      let category = "Webtoon"; // Default

      // 1. Analyze info.json for Category & Thumbnail
      const infoFiles = folder.getFilesByName("info.json");
      if (infoFiles.hasNext()) {
        const infoFile = infoFiles.next();
        const content = infoFile.getBlob().getDataAsString();
        try {
          const json = JSON.parse(content);
          const metaPublisher = (
            json.publisher ||
            (json.metadata && json.metadata.publisher) ||
            ""
          ).toString();
          const metaSite = (json.site || "").toString();

          // Category Detection
          if (
            json.category === "Novel" ||
            (json.metadata && json.metadata.category === "Novel")
          ) {
            category = "Novel";
          } else if (
            json.category === "Manga" ||
            metaPublisher.includes("마나토끼") ||
            metaSite.includes("마나토끼")
          ) {
            category = "Manga";
          }

          // Extract Thumbnail
          let needsUpdate = false;
          // Force Update Category in info.json if it changed
          if (json.category !== category) {
            json.category = category;
            // Also update metadata.category if exists
            if (json.metadata) json.metadata.category = category;
            needsUpdate = true;
          }

          if (json.thumbnail && json.thumbnail.length > 500) {
            // Assume Base64
            const blob = Utilities.newBlob(
              Utilities.base64Decode(json.thumbnail),
              "image/jpeg",
              "cover.jpg",
            );
            folder.createFile(blob);

            // Update info.json to remove Base64
            json.thumbnail = ""; // Clear it
            needsUpdate = true;
            fixedThumbnails++;
            Debug.log(`   -> Extracted Thumbnail`);
          }

          if (needsUpdate) {
            infoFile.setContent(JSON.stringify(json, null, 2));
            Debug.log(`   -> Updated info.json (Category/Thumbnail)`);
          }
        } catch (e) {
          Debug.log(`   -> JSON Parse Error: ${e}`);
        }
      }

      // 2. Move Folder
      let targetCat = catWebtoon;
      if (category === "Novel") targetCat = catNovel;
      else if (category === "Manga") targetCat = catManga;

      folder.moveTo(targetCat);
      movedCount++;
      Debug.log(`   -> Moved to ${category}`);
    } catch (e) {
      Debug.log(`   -> Migration Failed: ${e}`);
    }
  });

  return createRes(
    "success",
    `Migration Complete. Moved: ${movedCount}, Thumbnails: ${fixedThumbnails}`,
    Debug.getLogs(),
  );
}

/* ========================================================================== */
/* FILE: UploadService.gs */
/* ========================================================================== */

// =======================================================
// ☁️ 업로드 서비스 (대용량 업로드)
// =======================================================

function initResumableUpload(data, rootFolderId) {
  // Use new helper with Category support
  const seriesFolder = getOrCreateSeriesFolder(
    rootFolderId,
    data.folderName,
    data.category,
    true,
  );
  const folderId = seriesFolder.getId();

  // [Fix] Prevent Duplicate Covers: Delete existing cover.jpg if uploading a new one
  if (data.fileName === "cover.jpg") {
    const existing = seriesFolder.getFilesByName("cover.jpg");
    while (existing.hasNext()) {
      existing.next().setTrashed(true);
    }
  }

  const url =
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";

  const metadata = {
    name: data.fileName,
    parents: [folderId],
    mimeType:
      data.fileName.endsWith(".jpg") || data.fileName.endsWith(".jpeg")
        ? "image/jpeg"
        : data.fileName.endsWith(".epub")
          ? "application/epub+zip"
          : "application/zip",
  };

  const params = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(metadata),
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(url, params);

  if (response.getResponseCode() === 200) {
    return createRes("success", {
      uploadUrl: response.getHeaders()["Location"],
      folderId: folderId,
    });
  } else {
    return createRes("error", response.getContentText());
  }
}

function uploadChunk(data) {
  const uploadUrl = data.uploadUrl;
  const chunkData = Utilities.base64Decode(data.chunkData);
  const blob = Utilities.newBlob(chunkData);

  const start = data.start;
  const total = data.total;
  const size = blob.getBytes().length;
  const end = start + size - 1;

  const rangeHeader = `bytes ${start}-${end}/${total}`;

  const params = {
    method: "put",
    payload: blob,
    headers: { "Content-Range": rangeHeader },
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(uploadUrl, params);
  const code = response.getResponseCode();

  if (code === 308 || code === 200 || code === 201) {
    return createRes("success", "Chunk uploaded");
  } else {
    return createRes("error", `Drive API Error: ${code}`);
  }
}

/* ========================================================================== */
/* FILE: View_Dispatcher.gs */
/* ========================================================================== */

// =======================================================
// 📡 Viewer Action Dispatcher (Controller)
// =======================================================

/**
 * Viewer 관련 요청을 처리하는 중앙 라우터
 * `view_` 접두사가 붙은 요청(`view_get_library`, `view_get_books` 등)을 적절한 서비스 함수로 연결합니다.
 *
 * @param {Object} data - 클라이언트 요청 페이로드
 * @returns {TextOutput} JSON 응답
 */
function View_Dispatcher(data) {
  try {
    const action = data.type; // Use 'type' to match TokiSync Main.gs convention
    const folderId = data.folderId;

    let resultBody = null;

    // Route Actions
    if (action === "view_get_library") {
      if (!data.folderId) throw new Error("folderId is required for library");
      const bypassCache = data.bypassCache === true;
      resultBody = View_getSeriesList(data.folderId, bypassCache);
    } else if (action === "view_get_books" || action === "view_refresh_cache") {
      if (!data.seriesId) throw new Error("seriesId is required for books");
      const bypassCache =
        data.bypassCache === true || action === "view_refresh_cache";
      resultBody = View_getBooks(data.seriesId, bypassCache);
    } else if (action === "view_get_chunk") {
      if (!data.fileId) throw new Error("fileId is required");
      // Chunk logic
      const offset = data.offset || 0;
      const length = data.length || 10 * 1024 * 1024;
      resultBody = View_getFileChunk(data.fileId, offset, length);
    } else {
      throw new Error("Unknown Viewer Action: " + action);
    }

    return createRes("success", resultBody, Debug.getLogs());
  } catch (e) {
    return createRes("error", e.toString());
  }
}

/* ========================================================================== */
/* FILE: View_BookService.gs */
/* ========================================================================== */

// =======================================================
// 📚 Viewer Book Service (Isolated)
// =======================================================

/**
 * 특정 시리즈(폴더) 내의 책(파일/폴더) 목록을 반환합니다.
 * - info.json / _toki_cache.json 캐시 처리 추가
 *
 * @param {string} seriesId - 시리즈 폴더 ID
 * @param {boolean} bypassCache - 캐시 무시 여부 (새로고침)
 * @returns {Array<Object>} 책 목록
 */
function View_getBooks(seriesId, bypassCache = false) {
  try {
    if (!seriesId) throw new Error("Series ID is required");

    const CACHE_FILE_NAME = "_toki_cache.json";
    const folder = DriveApp.getFolderById(seriesId);

    // 1. Check Cache
    if (!bypassCache) {
      const cacheFiles = folder.getFilesByName(CACHE_FILE_NAME);
      if (cacheFiles.hasNext()) {
        const cacheFile = cacheFiles.next();
        try {
          const content = cacheFile.getBlob().getDataAsString();
          const cacheData = JSON.parse(content);
          Debug.log(`[Cache Hit] Series: ${seriesId}`);
          return cacheData;
        } catch (e) {
          console.error("Cache Parse Error, falling back to scan");
        }
      }
    }

    // 2. Full Scan (Existing Logic)
    const files = folder.getFiles();
    const folders = folder.getFolders();
    const books = [];
    let totalFiles = 0;

    const createBook = (fileOrFolder, type) => {
      const name = fileOrFolder.getName();
      let number = 0;
      const match = name.match(/(\d+)/);
      if (match) number = parseFloat(match[1]);

      const created = fileOrFolder.getDateCreated();
      const updated = fileOrFolder.getLastUpdated();

      return {
        id: fileOrFolder.getId(),
        seriesId: seriesId,
        name: name,
        number: number,
        url: fileOrFolder.getUrl(),
        size: type === "file" ? fileOrFolder.getSize() : 0,
        media: {
          status: "READY",
          mediaType:
            type === "file" ? fileOrFolder.getMimeType() : "application/folder",
        },
        created: created ? created.toISOString() : new Date().toISOString(),
        lastModified: updated
          ? updated.toISOString()
          : new Date().toISOString(),
      };
    };

    while (folders.hasNext()) {
      const f = folders.next();
      if (f.getName() === "info.json" || f.getName() === CACHE_FILE_NAME)
        continue;
      books.push(createBook(f, "folder"));
    }

    while (files.hasNext()) {
      totalFiles++;
      const f = files.next();
      const name = f.getName();
      const mime = f.getMimeType();
      const lowerName = name.toLowerCase();

      // Filter: System Files & Images
      if (
        name === "info.json" ||
        name === INDEX_FILE_NAME ||
        name === CACHE_FILE_NAME ||
        name === "cover.jpg" ||
        lowerName.endsWith(".jpg") ||
        lowerName.endsWith(".png") ||
        lowerName.endsWith(".json")
      )
        continue;

      if (
        lowerName.endsWith(".cbz") ||
        lowerName.endsWith(".zip") ||
        lowerName.endsWith(".epub") ||
        mime.includes("zip") ||
        mime.includes("archive") ||
        mime.includes("epub")
      ) {
        books.push(createBook(f, "file"));
      }
    }

    books.sort((a, b) => {
      const numA = a.number || 0;
      const numB = b.number || 0;
      if (numA === numB) {
        return a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      }
      return numA - numB;
    });

    // 3. Write Cache
    const cacheContent = JSON.stringify(books);
    const existingCache = folder.getFilesByName(CACHE_FILE_NAME);
    if (existingCache.hasNext()) {
      existingCache.next().setContent(cacheContent);
    } else {
      folder.createFile(CACHE_FILE_NAME, cacheContent, MimeType.PLAIN_TEXT);
    }

    console.log(
      `[View_getBooks] Series: ${seriesId}, Total: ${totalFiles}, Returned: ${books.length} (Cache Updated)`,
    );
    return books;
  } catch (e) {
    console.error(`[View_getBooks] Error: ${e.toString()}`);
    throw e;
  }
}

/**
 * 파일을 청크(Chunk) 단위로 분할하여 반환합니다.
 * 대용량 파일(CBZ 등)을 브라우저로 전송하기 위해 사용됩니다.
 *
 * @param {string} fileId - 대상 파일 ID
 * @param {number} offset - 시작 바이트 위치
 * @param {number} length - 읽을 바이트 길이
 * @returns {Object} { data: Base64String, hasMore: boolean, totalSize: number, nextOffset: number }
 */
/**
 * 파일을 청크(Chunk) 단위로 분할하여 반환합니다.
 * Drive API (Advanced Service)를 사용하여 메모리 효율적으로 다운로드합니다.
 */
function View_getFileChunk(fileId, offset, length) {
  // Use Drive API for partial download (Range Header)
  // Note: Drive API v2/v3 support 'Range' header but GAS wrapper behavior varies.
  // Using UrlFetchApp with user token is the most reliable way to enforce Range.
  const token = ScriptApp.getOAuthToken();
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  // Calculate End
  // Note: Range is inclusive (start-end). However, we usually don't know total size here efficiently without extra call.
  // Ideally, we fetch a bit more or exact.
  // "bytes=0-1048575"
  const end = offset + length - 1;

  try {
    const response = UrlFetchApp.fetch(url, {
      headers: {
        Authorization: "Bearer " + token,
        Range: `bytes=${offset}-${end}`,
      },
      muteHttpExceptions: true,
    });

    if (
      response.getResponseCode() === 206 ||
      response.getResponseCode() === 200
    ) {
      const blob = response.getBlob();
      const bytes = blob.getBytes();
      const totalSizeStr =
        response.getHeaders()["Content-Range"]?.split("/")[1] || "*";
      const totalSize =
        totalSizeStr === "*" ? offset + bytes.length : parseInt(totalSizeStr);

      // If we got full content (200 OK) but requested partial? Usually Drive returns 200 if file small? No, Drive with Range usually returns 206.

      return {
        data: Utilities.base64Encode(bytes),
        hasMore: offset + bytes.length < totalSize,
        totalSize: totalSize,
        nextOffset: offset + bytes.length,
      };
    } else {
      throw new Error(
        `Drive API Failed: ${response.getResponseCode()} ${response.getContentText()}`,
      );
    }
  } catch (e) {
    // Fallback to DriveApp if API fails (e.g. scope issue) - Optional but Risky for memory
    console.warn(
      "Drive API Partial Fetch failed, falling back to DriveApp (High Memory Risk): " +
        e,
    );
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    const bytes = blob.getBytes();

    if (offset >= bytes.length) return null;
    const chunkEnd = Math.min(offset + length, bytes.length);
    const chunk = bytes.slice(offset, chunkEnd);

    return {
      data: Utilities.base64Encode(chunk),
      hasMore: chunkEnd < bytes.length,
      totalSize: bytes.length,
      nextOffset: chunkEnd,
    };
  }
}

/* ========================================================================== */
/* FILE: View_LibraryService.gs */
/* ========================================================================== */

// =======================================================
// 🚀 Viewer Library Service (Isolated)
// =======================================================

/**
 * 해당 폴더(Libraries)의 시리즈 목록을 반환합니다.
 * 성능을 위해 `index.json` 캐시 파일을 우선 확인하고, 없으면 재구축합니다.
 *
 * @param {string} folderId - 라이브러리 루트 폴더 ID
 * @returns {Array<Object>} 시리즈 목록 (JSON)
 */
function View_getSeriesList(folderId, bypassCache = false) {
  if (!folderId) throw new Error("Folder ID is required");

  // 1. Check Cache (if not bypassed)
  if (!bypassCache) {
    const root = DriveApp.getFolderById(folderId);
    const files = root.getFilesByName(INDEX_FILE_NAME);

    if (files.hasNext()) {
      const file = files.next();
      const content = file.getBlob().getDataAsString();
      if (content && content.trim() !== "") {
        try {
          return JSON.parse(content);
        } catch (e) {}
      }
    }
  }

  // 2. Rebuild if missing or bypassed
  return View_rebuildLibraryIndex(folderId);
}

/**
 * 라이브러리 폴더 구조를 스캔하여 인덱스(시리즈 목록)를 생성합니다.
 * `info.json` 메타데이터를 우선순위로 하며, 폴더명 파싱도 지원합니다.
 * 생성된 인덱스는 `index.json` 파일로 저장됩니다.
 *
 * @param {string} folderId - 라이브러리 루트 폴더 ID
 * @returns {Array<Object>} 생성된 시리즈 목록
 */
/**
 * 라이브러리 폴더 구조를 스캔하여 인덱스(시리즈 목록)를 생성합니다.
 * Root > Category > Series 구조와 Legacy(Root > Series) 구조를 모두 지원합니다.
 */
function View_rebuildLibraryIndex(folderId) {
  if (!folderId) throw new Error("Folder ID is required");

  const root = DriveApp.getFolderById(folderId);
  const folders = root.getFolders();
  const seriesList = [];

  // Known Categories
  const CATEGORIES = ["Webtoon", "Manga", "Novel"];

  while (folders.hasNext()) {
    const folder = folders.next();
    const name = folder.getName();

    if (name === INDEX_FILE_NAME) continue;

    // 1. Check if it's a Category Folder
    if (CATEGORIES.includes(name)) {
      const subFolders = folder.getFolders();
      while (subFolders.hasNext()) {
        try {
          const s = processSeriesFolder(subFolders.next(), name);
          if (s) seriesList.push(s);
        } catch (e) {
          Debug.log(`Error processing series in ${name}: ${e}`);
        }
      }
    }
    // 2. Otherwise/Fallback: Treat as Legacy Series in Root
    else {
      try {
        // Simple check: does it look like a series? (Has [ID] or info.json)
        // We do a full process check, if valid it returns object, else null/partial
        // But for performance, maybe check name pattern first?
        // [ID] pattern is strong indicator.
        if (name.match(/^\[(\d+)\]/)) {
          const s = processSeriesFolder(folder, "Uncategorized");
          if (s) seriesList.push(s);
        }
      } catch (e) {
        Debug.log(`Error processing legacy series: ${e}`);
      }
    }
  }

  seriesList.sort(
    (a, b) => new Date(b.lastModified) - new Date(a.lastModified),
  ); // Sort by Recent

  // Save Lightweight Index
  const jsonString = JSON.stringify(seriesList);
  const indexFiles = root.getFilesByName(INDEX_FILE_NAME);
  if (indexFiles.hasNext()) {
    indexFiles.next().setContent(jsonString);
  } else {
    root.createFile(INDEX_FILE_NAME, jsonString, MimeType.PLAIN_TEXT);
  }

  return seriesList;
}

/**
 * [Helper] 단일 시리즈 폴더를 처리하여 메타데이터 객체를 반환합니다.
 */
function processSeriesFolder(folder, categoryContext) {
  const folderName = folder.getName();
  // Debug.log(`[Scan] Processing: ${folderName}`); // Too noisy for all, maybe enable if needed

  let metadata = {
    status: "ONGOING",
    authors: [],
    summary: "",
    category: categoryContext,
  };
  let seriesName = folderName;
  let thumbnailId = "";
  let thumbnailOld = "";
  let sourceId = "";
  let booksCount = 0;

  // ID Parsing
  const idMatch = folderName.match(/^\[(\d+)\]/);
  if (idMatch) sourceId = idMatch[1];

  // 1. Check for 'cover.jpg'
  // Try exact match first
  let coverFiles = folder.getFilesByName("cover.jpg");
  if (coverFiles.hasNext()) {
    const f = coverFiles.next();
    thumbnailId = f.getId();
    // Debug.log(`  -> Found cover.jpg: ${thumbnailId}`);
  } else {
    // Try Case-Insensitive / Alternative names
    const altNames = ["Cover.jpg", "cover.png", "Cover.png", "cover.jpeg"];
    for (const alt of altNames) {
      const alts = folder.getFilesByName(alt);
      if (alts.hasNext()) {
        thumbnailId = alts.next().getId();
        break;
      }
    }
  }

  // 2. Parse info.json
  const infoFiles = folder.getFilesByName("info.json");
  if (infoFiles.hasNext()) {
    try {
      const content = infoFiles.next().getBlob().getDataAsString();
      const parsed = JSON.parse(content);

      if (parsed.title) seriesName = parsed.title;
      if (parsed.id) sourceId = parsed.id;
      if (parsed.file_count) booksCount = parsed.file_count;

      if (
        parsed.category &&
        (!categoryContext || categoryContext === "Uncategorized")
      ) {
        metadata.category = parsed.category;
      }
      if (parsed.status) metadata.status = parsed.status;
      if (parsed.metadata && parsed.metadata.authors)
        metadata.authors = parsed.metadata.authors;
      else if (parsed.author) metadata.authors = [parsed.author];

      // Dual Strategy: Base64 from info.json (temp store in thumbnailId if we want, but let's use separate field)
      if (parsed.thumbnail) thumbnailOld = parsed.thumbnail; // Base64 or URL
    } catch (e) {}
  } else {
    const match = folderName.match(/^\[(\d+)\]\s*(.+)/);
    if (match) seriesName = match[2];
  }

  // Refine Dual Strategy Return
  let base64Thumb = "";
  if (thumbnailOld && thumbnailOld.startsWith("data:image")) {
    base64Thumb = thumbnailOld;
  }
  // If thumbnailOld is http url, we keep it in 'thumbnail' field anyway.

  return {
    id: folder.getId(),
    sourceId: sourceId,
    name: seriesName,
    booksCount: booksCount,
    metadata: metadata,
    thumbnail: base64Thumb || thumbnailOld, // Base64 or External URL
    thumbnailId: thumbnailId, // Drive ID (cover.jpg)
    hasCover: !!thumbnailId,
    lastModified: folder.getLastUpdated(),
    category: metadata.category,
  };
}

/* ========================================================================== */
/* FILE: View_Utils.gs */
/* ========================================================================== */

// =======================================================
// 🛠 Viewer Utility Functions (Isolated)
// =======================================================

const INDEX_FILE_NAME = "library_index.json";

/**
 * Viewer 전용 권한 확인 함수
 * 이 함수를 실행하여 View 관련 스코프(DriveApp) 권한을 승인받습니다.
 */
function View_authorizeCheck() {
  DriveApp.getRootFolder();
  console.log("✅ [Viewer] Auth Check Complete");
}

/* ========================================================================== */
/* FILE: Debug.gs */
/* ========================================================================== */

// =====================================================
// 🐞 디버깅 모듈 (In-Memory Log Collector)
// =====================================================

const Debug = {
  logs: [],
  startTime: 0,

  start: function () {
    this.logs = [];
    this.startTime = new Date().getTime();
    this.log("🕒 Execution Started");
  },

  log: function (msg) {
    const elapsed = new Date().getTime() - this.startTime;
    const timestamp = `[+${elapsed}ms]`;
    console.log(msg); // Stackdriver에도 남김
    this.logs.push(`${timestamp} ${msg}`);
  },

  error: function (msg, err) {
    const elapsed = new Date().getTime() - this.startTime;
    const timestamp = `[+${elapsed}ms]`;
    const errMsg = err ? ` | Error: ${err.message}\nStack: ${err.stack}` : "";
    console.error(msg + errMsg);
    this.logs.push(`❌ ${timestamp} ${msg}${errMsg}`);
  },

  getLogs: function () {
    return this.logs;
  },
};

// 테스트용 함수 (유지)
function testSetup() {
  Debug.start();
  Debug.log("Test Log 1");
  try {
    throw new Error("Test Error");
  } catch (e) {
    Debug.error("Test Exception catch", e);
  }
  return Debug.getLogs();
}
