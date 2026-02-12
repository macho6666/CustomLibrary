/**
 * 🛠 TokiSync Server Bundler
 * Concatenates fragmented .gs files into a single bundle file for easy manual deployment.
 */

const fs = require("fs");
const path = require("path");

const SOURCE_DIR = path.join(__dirname, "TokiSync");
const OUTPUT_FILE = path.join(__dirname, "TokiSync_Server_Bundle.gs");

// Order matters!
const FILES = [
  "Main.gs",
  "Utils.gs",
  "SyncService.gs",
  "UploadService.gs",
  "View_Dispatcher.gs",
  "View_BookService.gs",
  "View_LibraryService.gs",
  "View_Utils.gs",
  "Debug.gs",
];

function build() {
  console.log(`📦 Bundling GAS files from ${SOURCE_DIR}...`);

  let bundleContent = `/* ⚙️ TokiSync Server Code Bundle v1.0.0 (Generated: ${new Date().toISOString()}) */\n\n`;

  FILES.forEach((fileName) => {
    const filePath = path.join(SOURCE_DIR, fileName);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      bundleContent += `/* ========================================================================== */\n`;
      bundleContent += `/* FILE: ${fileName} */\n`;
      bundleContent += `/* ========================================================================== */\n\n`;
      bundleContent += content + `\n\n`;
      console.log(`   ✅ Added: ${fileName}`);
    } else {
      console.warn(`   ⚠️ Missing: ${fileName}`);
    }
  });

  fs.writeFileSync(OUTPUT_FILE, bundleContent);
  console.log(`🎉 Bundle created: ${OUTPUT_FILE}`);
}

build();
