# TokiSync v1.2.0 설치 가이드

이 가이드는 **TokiSync v1.2.0** (API Key 보안 적용 버전)의 설치 및 설정 방법을 안내합니다.

## ✅ 사전 준비

1. **Google 계정**: Google Drive 및 Apps Script 사용.
2. **Google Drive 폴더**: 만화를 저장할 폴더를 생성하고 **Folder ID**를 메모해두세요.
   - (폴더 주소 `.../folders/1ABC_xE...` 에서 뒷부분 ID)

---

## 1단계: Google Apps Script (서버) 설정

### 1-1. 프로젝트 생성 및 코드 복사

1. [Google Apps Script](https://script.google.com/) 접속 -> **새 프로젝트**.
2. 프로젝트 이름: `TokiSync Server v1.2.0`.
3. `google_app_script/TokiSync_Server_Bundle.gs` 파일 내용을 복사하여 `Code.gs`에 붙여넣기.
4. **저장** (Ctrl+S).

### 1-2. 라이브러리 추가 (Drive API)

1. 좌측 **서비스(Services)** 옆 `+` 클릭.
2. **Drive API** 선택 -> **추가**.

### 1-3. 🔒 API Key 설정 (중요)

**v1.2.0부터 API Key가 필수입니다.**

1. 좌측 **프로젝트 설정** (톱니바퀴 아이콘) 클릭.
2. 스크롤을 내려 **스크립트 속성 (Script Properties)** 섹션 찾기.
3. **스크립트 속성 수정** -> **행 추가** 클릭.
   - **속성 (Property)**: `API_KEY`
   - **값 (Value)**: `toki_secret_1234` (본인이 원하는 비밀번호 입력)
4. **스크립트 속성 저장** 클릭.

### 1-4. 배포

1. 우측 상단 **배포 (Deploy)** -> **새 배포**.
2. 유형: **웹 앱 (Web app)**.
3. 다음 사용자로 실행: **`나 (Me)`**.
4. 액세스 권한 승인: **`모든 사용자 (Anyone)`** (⚠️ 필수).
   - _뷰어에서 로그인 없이 접근하기 위해 '모든 사용자'가 필요하지만, 실제로는 위에서 설정한 API Key가 없으면 접근이 불가능하므로 안전합니다._
5. **배포** 클릭 -> 권한 승인 진행.
6. **웹 앱 URL** 복사 (`.../exec`로 끝남).

---

## 2단계: UserScript (수집기) 설치

1. 브라우저에 [Tampermonkey](https://www.tampermonkey.net/) 설치.
2. `docs/tokiSync.user.js` 파일 내용 전체 복사.
3. Tampermonkey -> **새 스크립트 추가** -> 붙여넣기 -> **저장**.
4. **동작 확인 및 설정**:
   - 뉴토끼/북토끼 사이트 접속.
   - Tampermonkey 메뉴 -> `TokiSync` -> **⚙️ 설정** 클릭.
   - **GAS URL**: 1-4에서 복사한 URL 입력.
   - **Folder ID**: 사전 준비한 폴더 ID 입력.
   - **API Key**: 1-3에서 설정한 값 입력.
   - **저장** 클릭.

---

## 3단계: 뷰어 (Viewer) 설정

### A. 간편 연동 (UserScript 이용) - 권장

1. 뷰어 페이지(`docs/index.html`)를 엽니다. (로컬 또는 웹 호스팅)
2. **UserScript가 설치된 브라우저**라면, 자동으로 설정이 주입됩니다.
   - _"⚡️ Auto-Config Injected"_ 메시지와 함께 즉시 사용 가능합니다.

### B. 수동 설정 (Standalone)

1. 뷰어 페이지 접속 시 설정 모달이 뜹니다.
2. **GAS 웹 앱 URL**, **루트 폴더 ID**, **API Key**를 직접 입력합니다.
3. **저장**하면 브라우저에 설정이 영구 저장됩니다.

---

## 🔧 문제 해결

**Q. 401 Unauthorized 에러가 떠요.**
A. 입력한 `API Key`가 GAS 스크립트 속성의 `API_KEY` 값과 일치하는지 확인하세요.

**Q. 429 Too Many Requests 에러가 떠요.**
A. 구글 API 호출 제한입니다. 잠시 기다리면 해결됩니다. v1.2.0 뷰어는 이미지 로딩 시 자동으로 이를 감지하고 재시도합니다.

**Q. UserScript에서 설정 메뉴가 안 보여요.**
A. 지원되는 사이트(뉴토끼 등)에 접속해야 메뉴가 활성화됩니다.
