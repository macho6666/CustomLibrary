# Integrated Plan: GAS History Sync

**Objective**: Synchronize download history from GAS and assume visual indicators on the website list.

## 👥 Role Assignments & Tasks

### 1. [CORE DEV]

**Target Files**: `src/new_core/gas.js`
**Responsibilities**: Network logic and API interaction.

- [ ] **Implement `fetchHistory` in `gas.js`**
  - **API**: Call `check_history` endpoint on GAS.
  - **Payload**: `{ type: "check_history", folderId: ..., folderName: "[ID] Title", category: ... }`.
  - **Logic**: valid `config.url` check, error handling (return [] on fail).

### 2. [COMMON DEV]

**Target Files**: `src/new_core/ui.js`, `src/new_core/main.js`
**Responsibilities**: UI, orchestration, and DOM interaction.

- [ ] **Implement `markDownloadedItems` in `ui.js`**
  - **Logic**: Accept `historyList` (array of episode IDs).
  - **Action**: Query `.list-item` or `.list-body > li`, match `wr-num`, update UI (e.g., CSS class `.toki-done` or "✅" badge).
  - **Performance**: Use `Set` for O(1) lookups.
- [ ] **Orchestrate in `main.js`**
  - **Flow**: On page load (after site detection), async call `fetchHistory` -> `markDownloadedItems`.
  - **Timing**: Ensure non-blocking execution (fire-and-forget promise or idle callback).
- [ ] **Restore Config Injection (`openViewer`)**
  - **Goal**: Restore the missing "Zero-Config" feature where UserScript sends settings to Webview.
  - **Action**: Add "Open Viewer" menu command in `main.js`.
  - **Logic**: Open `crosssitekikyo.github.io/tokiDownloader/` and send `postMessage({type: 'TOKI_CONFIG', ...})` after load.

### 3. [SERVICE DEV]

**Target Files**: `google_app_script/TokiSync/*`, `google_app_script/TokiSync_Server_Bundle.gs`
**Responsibilities**: Backend logic and bundling.

- [ ] **Verify Server Bundle**
  - Check if `TokiSync_Server_Bundle.gs` includes the latest `SyncService.gs` (`checkDownloadHistory` logic).
  - If not, re-bundle (User to confirm deployment).

### 4. [PUB DEV]

**Target Files**: `docs/tokiDownloader.user.js`
**Responsibilities**: UserScript bundling.

- [ ] **Build UserScript**
  - Run build command/script to generate the final `tokiDownloader.user.js` from `src/new_core`.
  - Verify header/meta block integrity.

### 5. [DOCS DEV]

**Target Files**: `docs/`
**Responsibilities**: Documentation.

- [ ] **Update Guide**
  - Document the new "History Sync" feature (Green checkmarks).
  - Update screenshots/manual if applicable.

---

**Execution Order**:

1. [CORE DEV] & [COMMON DEV] (Parallel)
2. [SERVICE DEV] (Verification)
3. [PUB DEV] (Build)
4. [DOCS DEV] (Finalize)
