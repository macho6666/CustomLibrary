
export class CbzBuilder {
    constructor() {
        this.chapters = [];
    }

    addChapter(title, images) {
        // images: array of { blob, ext }
        this.chapters.push({ title, images });
    }

    async build(metadata = {}) {
        const zip = new JSZip();
        
        this.chapters.forEach((chapter) => {
            // Folder name: "{ChapterTitle}" (Cleaned Title)
            const folderName = chapter.title; 

            chapter.images.forEach((img, idx) => {
                if (img && img.blob) {
                    // File name: "image{0000}{ext}" (No redundant title)
                    const filename = `image${String(idx).padStart(4, '0')}${img.ext}`;
                    zip.folder(folderName).file(filename, img.blob);
                }
            });
        });

        return zip;
    }
}
