/**
 * 🚀 TokiSync API Client
 * GAS(Google Apps Script) Backend와 통신하는 전용 클라이언트
 * google.script.run 대체용
 */

class TokiApiClient {
    /**
     * 초기화: 메모리 기반 설정 (UserScript 우선, localStorage 폴백)
     */
    constructor() {
        // In-memory storage (우선순위 1: UserScript에서 주입)
        this._config = {
            baseUrl: '',
            folderId: '',
            apiKey: ''
        };
        
        // Fallback: localStorage (단독 실행 시)
        this._loadFromLocalStorage();
    }

    /**
     * localStorage에서 설정 로드 (폴백용)
     */
    _loadFromLocalStorage() {
        this._config.baseUrl = localStorage.getItem('TOKI_API_URL') || '';
        this._config.folderId = localStorage.getItem('TOKI_ROOT_ID') || '';
        this._config.apiKey = localStorage.getItem('TOKI_API_KEY') || '';
        
        if (this._config.baseUrl) {
            console.log('📦 Config loaded from localStorage (fallback)');
        }
    }

    /**
     * API 설정 저장 (UserScript에서 주입받음)
     */
    setConfig(url, id, apiKey) {
        this._config.baseUrl = url;
        this._config.folderId = id;
        this._config.apiKey = apiKey;
        
        // localStorage에도 저장 (다음 번 단독 실행 시 사용)
        localStorage.setItem('TOKI_API_URL', url);
        localStorage.setItem('TOKI_ROOT_ID', id);
        localStorage.setItem('TOKI_API_KEY', apiKey);
        
        console.log('✅ Config set from UserScript (priority)');
    }

    /**
     * API 통신을 위한 필수 설정(URL, FolderID)이 되어 있는지 확인합니다.
     * @returns {boolean} 설정 완료 여부
     */
    isConfigured() {
        return this._config.baseUrl && this._config.folderId;
    }

    /**
     * 통합 API 요청 함수
     * @param {string} type - 요청 타입 (e.g. 'view_get_library')
     * @param {object} payload - 추가 데이터
     */
    async request(type, payload = {}) {
        if (!this._config.baseUrl) throw new Error("API URL이 설정되지 않았습니다.");

        // 기본 Payload 구성
        const bodyData = {
            ...payload,
            type: type,
            folderId: this._config.folderId,
            apiKey: this._config.apiKey,  // ✅ API Key 포함
            protocolVersion: 3
        };

        try {
            // [CORS Workaround] GAS는 application/json preflight를 거절하는 경우가 많음.
            // text/plain으로 보내면 브라우저가 preflight를 생략하고 보냄.
            // GAS 서버에서는 e.postData.contents로 파싱 가능.
            const response = await fetch(this._config.baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8', 
                },
                body: JSON.stringify(bodyData)
            });

            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.status}`);
            }

            const json = await response.json();

            if (json.status === 'error') {
                throw new Error(json.body || "Unknown Server Error");
            }

            return json.body;

        } catch (e) {
            console.error(`[API] Request Failed (${type}):`, e);
            throw e;
        }
    }
}

// 전역 인스턴스
window.API = new TokiApiClient();
const API = window.API; // Export for local use if needed, though mostly used via window in other modules now

