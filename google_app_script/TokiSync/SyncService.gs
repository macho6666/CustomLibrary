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

// =======================================================
// 🔑 Direct Drive Access Token Provider
// =======================================================

/**
 * Provides OAuth Access Token for Client-Side Direct Drive Upload
 *
 * This endpoint enables the UserScript to bypass GAS relay and directly
 * upload files to Google Drive using GM_xmlhttpRequest.
 *
 * Security: Token is valid for 1 hour and scoped to Drive access only.
 *
 * @returns {Object} Response with access token
 */
function view_get_token() {
  Debug.log("🔑 view_get_token: Generating OAuth token");

  try {
    const token = ScriptApp.getOAuthToken();

    if (!token) {
      Debug.error("❌ Token generation failed");
      return createRes(
        "error",
        "Failed to generate OAuth token",
        Debug.getLogs(),
      );
    }

    Debug.log("✅ Token generated successfully");

    return createRes(
      "success",
      {
        token: token,
        expiresIn: 3600, // 1 hour (approximate)
        scope: "https://www.googleapis.com/auth/drive",
        timestamp: new Date().toISOString(),
      },
      Debug.getLogs(),
    );
  } catch (e) {
    Debug.error("❌ Token generation error:", e);
    return createRes("error", `Token Error: ${e.message}`, Debug.getLogs());
  }
}
