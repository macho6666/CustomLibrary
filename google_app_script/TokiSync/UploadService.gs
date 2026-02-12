// =======================================================
// ☁️ 업로드 서비스 (대용량 업로드)
// =======================================================

function initResumableUpload(data, rootFolderId) {
  // Use new helper with Category support
  const seriesFolder = getOrCreateSeriesFolder(
    rootFolderId,
    data.folderName,
    data.category,
    true
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
