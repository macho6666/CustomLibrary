import { cachedFileId, cachedBytes, setCachedData } from './state.js';
import { formatSize } from './utils.js';

/**
 * .cbz 파일을 다운로드하고 압축을 해제합니다.
 * 
 * [Adaptive Strategy]
 * 1. Small File (< 26MB): Single Fetch (Range-less or Full Range)
 * 2. Large File (>= 26MB): Concurrent Chunk Fetch (10MB chunks, Max 3 concurrent)
 * 
 * @param {string} fileId - 파일 ID
 * @param {number} totalSize - 파일 전체 크기 (bytes)
 * @param {Function} onProgress - 진행률 콜백
 * @returns {Promise<Array<string>>} Blob URL 리스트
 */
export async function fetchAndUnzip(fileId, totalSize, onProgress) {
    let combinedBytes = null;
    const SAFE_THRESHOLD = 26 * 1024 * 1024; // 26MB

    // Check Reuse Cache
    if (cachedFileId === fileId && cachedBytes) {
        console.log("♻️ Using cached data for re-render");
        combinedBytes = cachedBytes;
        // Skip network logic
    } else {
        // Clear old cache
        setCachedData(null, null);

        if (totalSize > 0 && totalSize < SAFE_THRESHOLD) {
        // [Mode A] Single Fetch
        console.log(`📉 Small File detected (${formatSize(totalSize)}). using Single Fetch.`);
        if (onProgress) onProgress(`다운로드 중... (0%)`);
        
        try {
            const response = await API.request('view_get_chunk', {
                fileId: fileId,
                offset: 0,
                length: totalSize 
            });
            if (response && response.data) {
                 const binaryString = atob(response.data);
                 const len = binaryString.length;
                 combinedBytes = new Uint8Array(len);
                 for (let i = 0; i < len; i++) combinedBytes[i] = binaryString.charCodeAt(i);
                 if (onProgress) onProgress(`다운로드 완료 (100%)`);
            } else {
                throw new Error("Empty Response");
            }
        } catch (e) {
            console.warn("Single Fetch failed, falling back to Chunk mode", e);
            // Fallback will happen naturally if combinedBytes remains null?
            // No, strictly separate logic. If fail, throw.
            throw new Error("다운로드 실패: " + e.message);
        }

    } else {
        // [Mode B] Concurrent Chunk Fetch
        console.log(`📈 Large File detected (${formatSize(totalSize)}). using Concurrent Chunk Fetch.`);
        
        const chunks = [];
        const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
        let offset = 0;
        
        // 1. Calculate Chunks needed
        // If totalSize is unknown (0), we can't use parallel accurately. Fallback to sequential.
        if (totalSize === 0) {
             // Sequential Fallback (Existing Logic)
             return fetchAndUnzipSequentialFallback(fileId, onProgress);
        }

        const chunkCount = Math.ceil(totalSize / CHUNK_SIZE);
        const tasks = [];
        
        for (let i = 0; i < chunkCount; i++) {
            tasks.push({ index: i, start: i * CHUNK_SIZE, length: CHUNK_SIZE });
        }

        let completed = 0;
        const results = new Array(chunkCount); 

        // Worker Pool (Max Concurrency: 3)
        const CONCURRENCY = 3;
        
        const worker = async () => {
             while (tasks.length > 0) {
                 const task = tasks.shift();
                 const currentOffset = task.start;
                 
                 // Retry Logic
                 let retries = 3;
                 while(retries > 0) {
                     try {
                         const response = await API.request('view_get_chunk', {
                            fileId: fileId,
                            offset: currentOffset,
                            length: task.length
                        });
                        
                        if (!response) throw new Error("No response");
                        
                        const binaryString = atob(response.data);
                        const len = binaryString.length;
                        const bytes = new Uint8Array(len);
                        for (let k = 0; k < len; k++) bytes[k] = binaryString.charCodeAt(k);
                        
                        results[task.index] = bytes;
                        completed++;

                        if (onProgress) {
                             const percent = Math.round((completed / chunkCount) * 100);
                             onProgress(`다운로드 중... (${percent}%)`);
                        }
                        break; // Success
                     } catch (e) {
                         console.warn(`Chunk ${task.index} failed, retrying...`, e);
                         retries--;
                         if (retries === 0) throw e;
                         await new Promise(r => setTimeout(r, 1000));
                     }
                 }
             }
        };

        const workers = [];
        for(let k=0; k<CONCURRENCY; k++) workers.push(worker());
        await Promise.all(workers);

        // Merge
        if (onProgress) onProgress('병합 중...');
        let totalLen = 0;
        results.forEach(r => totalLen += r.length);
        combinedBytes = new Uint8Array(totalLen);
        let pos = 0;
        results.forEach(r => {
            combinedBytes.set(r, pos);
            pos += r.length;
        });
    } // End of Network Fetch (if)

    } // End of Cache Check Else Block

    // Update Cache
    if (combinedBytes) {
        setCachedData(fileId, combinedBytes);
    }

    if (onProgress) onProgress('압축 해제 중...');

    // Unzip (Using JSZip global)
    if (typeof JSZip === 'undefined') throw new Error("JSZip 라이브러리가 없습니다.");
    const zip = await JSZip.loadAsync(combinedBytes);
    
    const files = Object.keys(zip.files).sort((a, b) => {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

    // Check for EPUB
    const isEpub = zip.file("OEBPS/content.opf") || zip.file("OPS/content.opf") || zip.file("mimetype");

    if (isEpub) {
        // [New] Image EPUB Detection (Comic EPUB)
        // Check if file contains mostly images
        const imageFiles = files.filter(f => f.match(/\.(jpg|jpeg|png|webp|gif)$/i));
        const textFiles = files.filter(f => f.match(/\.(xhtml|html)$/i));

        // If it looks like a Comic (Many images, or more images than text chapters)
        if (imageFiles.length > 5 && imageFiles.length >= textFiles.length) {
            console.log("📘 Comic EPUB Detected -> Using Image Mode");
            // Do NOT return here. Fall through to Image Extraction loop below.
        } else {
            // Text EPUB detected
            console.log(`📘 Text EPUB Detected (Using Built-in Viewer)`);
    
            let htmlContent = "";
            // Find chapter.xhtml or any HTML
            let targetFile = zip.file("OEBPS/Text/chapter.xhtml");
            if (!targetFile) {
                const htmlFiles = files.filter(f => f.match(/\.(xhtml|html)$/i));
                if (htmlFiles.length > 0) targetFile = zip.file(htmlFiles[0]);
            }
            if (targetFile) {
                htmlContent = await targetFile.async("string");
                return { type: 'epub_legacy', content: htmlContent };
            }
            // Fallback if no HTML found?
            throw new Error("EPUB 내에서 텍스트 파일을 찾을 수 없습니다.");
        }
    }

    const imageUrls = [];
    for (const filename of files) {
        if (filename.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
            const blob = await zip.files[filename].async('blob');
            imageUrls.push(URL.createObjectURL(blob));
        }
    }
    return { type: 'images', images: imageUrls };
}

// Fallback for unknown size (Sequential)
export async function fetchAndUnzipSequentialFallback(fileId, onProgress) {
    const chunks = [];
    let offset = 0;
    let totalLength = 0;
    const CHUNK_SIZE = 10 * 1024 * 1024; 

    while (true) {
        const response = await API.request('view_get_chunk', {
            fileId: fileId,
            offset: offset,
            length: CHUNK_SIZE
        });

        if (!response) break;

        const binaryString = atob(response.data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        chunks.push(bytes);
        totalLength += len;
        offset = response.nextOffset;

        if (onProgress) {
            const percent = Math.round((offset / response.totalSize) * 100);
            onProgress(`다운로드 중... (${percent}%)`);
        }

        if (!response.hasMore) break;
    }
    
    const combinedBytes = new Uint8Array(totalLength);
    let position = 0;
    for (const chunk of chunks) {
        combinedBytes.set(chunk, position);
        position += chunk.length;
    }

    const zip = await JSZip.loadAsync(combinedBytes);
    const files = Object.keys(zip.files).sort((a, b) => {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

    const imageUrls = [];
    for (const filename of files) {
        if (filename.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
            const blob = await zip.files[filename].async('blob');
            imageUrls.push(URL.createObjectURL(blob));
        }
    }
    return imageUrls;
}
