
const currentLoaderVer = "1.1.3";
const MIN_LOADER_VERSION = "v1.1.2"; // Simulating what user says is required

// Function from NEW main.js
const getMajor = (v) => {
    const parts = String(v).replace(/^v/i, '').trim().split('.');
    return parseInt(parts[0]) || 0;
};

// Function likely from OLD Core (Hypothesis: String comparison)
const oldCheck = (current, required) => {
    return current < required;
}

console.log("--- New Logic Check ---");
const loaderMajor = getMajor(currentLoaderVer);
const requiredMajor = getMajor(MIN_LOADER_VERSION);
console.log(`Loader Major: ${loaderMajor}, Required Major: ${requiredMajor}`);
console.log(`Fail Check (Loader < Required): ${loaderMajor < requiredMajor}`);

console.log("\n--- Old Logic Hypothesis Check (String Compare) ---");
console.log(`"${currentLoaderVer}" < "${MIN_LOADER_VERSION}" : ${currentLoaderVer < MIN_LOADER_VERSION}`);
console.log(`Fail Check: ${currentLoaderVer < MIN_LOADER_VERSION}`);
