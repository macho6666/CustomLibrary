
import main from './core/main.js';

// Metadata handled by Webpack BannerPlugin

(function () {
    'use strict';
    
    console.log("🚀 TokiSync Initialized (Bundled Single Script)");

    // 1. GM Context Setup (Adapter)
    // 1. GM Context Setup (Adapter)
    const GM = {
        // Core Interface
        getValue: GM_getValue,
        setValue: GM_setValue,
        deleteValue: GM_deleteValue,
        xmlhttpRequest: GM_xmlhttpRequest,
        registerMenuCommand: GM_registerMenuCommand,
        
        // Native Interface (for direct access if needed)
        GM_getValue,
        GM_setValue,
        GM_deleteValue,
        GM_xmlhttpRequest,
        GM_registerMenuCommand,

        // Optional safe check for event listener
        GM_addValueChangeListener: typeof GM_addValueChangeListener !== 'undefined' ? GM_addValueChangeListener : undefined,
        
        // Libraries
        JSZip: window.JSZip,
        
        loaderVersion: "1.2.0" // Self-reference
    };

    // 2. GitHub Pages / Frontend Bridge (Config Injection)
    const CFG_FOLDER_ID = 'TOKI_FOLDER_ID';
    if (location.hostname.includes('github.io') || location.hostname.includes('localhost') || location.hostname.includes('127.0.0.1')) {
        console.log("📂 TokiView (Frontend) detected. Injecting Config...");

        const folderId = GM.GM_getValue(CFG_FOLDER_ID);
        const customDeployId = GM.GM_getValue("TOKI_DEPLOY_ID", ""); 
        
        let derivedId = "";
        const savedGasUrl = GM.GM_getValue("TOKI_GAS_URL", "");
        if (!customDeployId && savedGasUrl) {
            const match = savedGasUrl.match(/\/s\/([^\/]+)\/exec/);
            if (match) derivedId = match[1];
        }

        const DEFAULT_ID = ""; 
        const targetId = customDeployId || derivedId || DEFAULT_ID;
        const apiUrl = `https://script.google.com/macros/s/${targetId}/exec`;

        if (folderId) {
            setTimeout(() => {
                window.postMessage({ 
                    type: 'TOKI_CONFIG', 
                    url: apiUrl, 
                    folderId: folderId,
                    deployId: targetId
                }, '*');
                console.log("✅ Config Injected to Frontend:", targetId);
            }, 500);
        }
    }

    // 3. Run Core
    main(GM);

})();
