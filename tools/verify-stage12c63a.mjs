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
  'stage: "12C63A"',
  'entryGateMode: "balanced-ready"',
  'entryGateMaxWaitMs: isGalleryMobileStartupSurvivalEnabled() ? 45000 : 30000',
  'function waitForGalleryBalancedEntryReadiness',
  'function getGalleryBalancedEntrySnapshot',
  'function runGalleryFastStartFinalizationNow',
  'galleryStartupVisibleTextureDebug',
  'pendingVisibleTextures === 0',
  'releaseGalleryMobileDeferredOptionalAssetImports(reason || "12C63A-entry-gate")',
  'return waitForGalleryBalancedEntryReadiness("12C63A-balanced-entry")',
  'galleryFastStartRuntime.viewerReady = true',
  'var galleryAssetAttemptTimeoutMs = 0',
  'targetMeshNames:',
  'galleryModel3dAssetContainerCache'
];

for (const fragment of required) {
  if (!engine.includes(fragment)) throw new Error(`Engine verification failed. Missing fragment: ${fragment}`);
}

const forbidden = [
  'firstPaintBudgetMs: 1800',
  'Promise.race([preloadPromise, deadlinePromise])',
  'status: "deferred-to-background"',
  'Timed out after " + galleryAssetAttemptTimeoutMs'
];

for (const fragment of forbidden) {
  if (engine.includes(fragment)) throw new Error(`Forbidden legacy startup fragment remains: ${fragment}`);
}

if (!index.includes('gallery-viewer-bootstrap.js?v=stage12c63a_balanced_ready_gate_20260713')) {
  throw new Error("index.html does not use the Stage 12C63A bootstrap.");
}

if (!viewer.includes('Gallery_V0_11.min.js?v=stage12c63a_balanced_ready_gate_20260713')) {
  throw new Error("Viewer bootstrap does not use the Stage 12C63A production engine.");
}

if (!viewer.includes('import("./gallery-editor-bootstrap.js?v=stage12c63a")')) {
  throw new Error("Editor bootstrap query version was not updated.");
}

console.log("Stage 12C63A static verification passed.");
