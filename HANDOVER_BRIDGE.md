# Handover Plan: Viewer Direct Access Bridge (v1.3.1)

**Goal**: Extend Direct Access to the **Viewer** (Download side) using UserScript intervention.

## 📌 Problem

- **v1.3.0** implemented Direct Access for the **Downloader** (Upload) only.
- **Viewer** (`fetcher.js`) still relay traffic through GAS because `github.io` pages cannot bypass CORS to `googleapis.com`.

## 💡 Solution: "Script Intervention Bridge"

The UserScript (running on `github.io`) has privileged access (`GM_xmlhttpRequest`). We will expose this capability to the Viewer via a `window` object bridge.

### 🏗 Architecture

**[Viewer (SPA)]** ↔ **[Window Bridge]** ↔ **[UserScript]** ↔ **[Google Drive]**

### 📋 Implementation Steps

#### 1. UserScript Side (`src/core/index.js`)

- **Action**: Inject a global bridge object when running on the Viewer domain.
- **Code**:
  ```javascript
  if (
    location.host.includes("github.io") ||
    location.host.includes("localhost")
  ) {
    console.log("🌉 TokiBridge: Initializing...");
    window.TokiBridge = {
      version: "1.3.1",
      // Proxy function using GM_xmlhttpRequest
      fetchDirect: async (token, url) => {
        return new Promise((resolve, reject) => {
          GM_xmlhttpRequest({
            method: "GET",
            url: url,
            headers: { Authorization: `Bearer ${token}` },
            responseType: "arraybuffer", // Important for binary
            onload: (res) => resolve(res.response),
            onerror: (e) => reject(e),
          });
        });
      },
    };
  }
  ```

#### 2. Viewer Side (`docs/js/viewer_modules/fetcher.js`)

- **Action**: Update `fetchAndUnzip` to check for Bridge.
- **Logic**:
  1. Check `if (window.TokiBridge)`.
  2. If Yes:
     - Request Token from GAS (`view_get_token`).
     - Call `window.TokiBridge.fetchDirect(token, url)`.
     - Pass ArrayBuffer to JSZip.
  3. If No (or Error):
     - Fallback to existing `view_get_chunk` (GAS Relay).

### ✅ Expected Result

- **Performance**: Viewer image loading speed increases 2x-3x.
- **Stability**: No 6-minute GAS timeout limits for large downloads.
- **Compatibility**: Works seamlessly with existing Zero-Config setup.
