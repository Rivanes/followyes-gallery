import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = {
  engine: path.join(root, "src", "Gallery_V0_11.js"),
  min: path.join(root, "src", "Gallery_V0_11.min.js"),
  index: path.join(root, "index.html"),
  viewer: path.join(root, "src", "bootstrap", "gallery-viewer-bootstrap.js"),
  editor: path.join(root, "src", "bootstrap", "gallery-editor-bootstrap.js")
};

for (const filePath of Object.values(files)) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing required file: ${path.relative(root, filePath)}`);
}

const engine = fs.readFileSync(files.engine, "utf8");
const index = fs.readFileSync(files.index, "utf8");
const viewer = fs.readFileSync(files.viewer, "utf8");

const required = [
  'stage: "12C63B"',
  'entryGateMode: "image-first-ready"',
  'beginGalleryStartupArtworkPreviewPrefetch',
  'startupArtworkPrefetchQueue',
  'startupArtworkPrefetchActiveCount',
  'image-first-ready-gate',
  'return waitForGalleryBalancedEntryReadiness("12C63B-image-first-entry")',
  'pendingVisibleTextures === 0',
  'targetMeshNames:',
  'galleryModel3dAssetContainerCache'
];

for (const fragment of required) {
  if (!engine.includes(fragment)) throw new Error(`Engine verification failed. Missing fragment: ${fragment}`);
}

const forbidden = [
  'releaseGalleryMobileDeferredOptionalAssetImports(reason || "12C63A-entry-gate")',
  'stage: "12C63A"',
  'entryGateMode: "balanced-ready"'
];

for (const fragment of forbidden) {
  if (engine.includes(fragment)) throw new Error(`Forbidden legacy startup fragment remains: ${fragment}`);
}

if (!index.includes('gallery-viewer-bootstrap.js?v=stage12c63b_image_first_startup_queue_20260713')) {
  throw new Error("index.html does not use the Stage 12C63B bootstrap.");
}

if (!viewer.includes('Gallery_V0_11.min.js?v=stage12c63b_image_first_startup_queue_20260713')) {
  throw new Error("Viewer bootstrap does not use the Stage 12C63B production engine.");
}

if (!viewer.includes('import("./gallery-editor-bootstrap.js?v=stage12c63b")')) {
  throw new Error("Editor bootstrap query version was not updated.");
}

console.log("Stage 12C63B static verification passed.");
