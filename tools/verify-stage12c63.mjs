import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const enginePath = path.join(root, "src", "Gallery_V0_11.js");
const minPath = path.join(root, "src", "Gallery_V0_11.min.js");
const indexPath = path.join(root, "index.html");
const viewerBootstrapPath = path.join(root, "src", "bootstrap", "gallery-viewer-bootstrap.js");
const editorBootstrapPath = path.join(root, "src", "bootstrap", "gallery-editor-bootstrap.js");

for (const filePath of [enginePath, minPath, indexPath, viewerBootstrapPath, editorBootstrapPath]) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${path.relative(root, filePath)}`);
  }
}

const engine = fs.readFileSync(enginePath, "utf8");
const index = fs.readFileSync(indexPath, "utf8");
const viewerBootstrap = fs.readFileSync(viewerBootstrapPath, "utf8");

const requiredEngineFragments = [
  'var galleryCriticalAssetNames = ["floor", "wall", "ceiling"]',
  "var assetsToLoad = galleryCriticalAssetNames.length",
  "var galleryAssetAttemptTimeoutMs = 0",
  "var galleryCriticalAssetMaxAttempts = 2",
  "return assetName === \"props\"",
  "targetMeshNames:",
  "restoreLocalLightTargetsFromSavedState",
  "queueGalleryFastStartArtworkLoad",
  "queueGalleryFastStartModelLoad",
  "galleryModel3dAssetContainerCache",
  "releaseGalleryFastStartBackgroundContent",
  'stage: "12C63"'
];

for (const fragment of requiredEngineFragments) {
  if (!engine.includes(fragment)) {
    throw new Error(`Engine verification failed. Missing fragment: ${fragment}`);
  }
}

if (engine.includes("Timed out after \" + galleryAssetAttemptTimeoutMs")) {
  throw new Error("Synthetic per-attempt timeout logic is still active.");
}

if (!index.includes("gallery-viewer-bootstrap.js?v=stage12c63")) {
  throw new Error("index.html does not use the Stage 12C63 viewer bootstrap.");
}

if (!viewerBootstrap.includes('import("./gallery-editor-bootstrap.js?v=stage12c63")')) {
  throw new Error("Editor bootstrap is not dynamically imported.");
}

if (!viewerBootstrap.includes("Gallery_V0_11.min.js")) {
  throw new Error("Public bootstrap is not using the minified production engine.");
}

console.log("Stage 12C63 static verification passed.");
