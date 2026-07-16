import fs from "node:fs";
import crypto from "node:crypto";

const root = new URL("../", import.meta.url);
const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), "utf8");
const source = read("../src/Gallery_V0_11.js");
const min = read("../src/Gallery_V0_11.min.js");
const viewerBootstrap = read("../src/bootstrap/gallery-viewer-bootstrap.js");
const editorBootstrap = read("../src/bootstrap/gallery-editor-bootstrap.js");
const index = read("../index.html");
const loginDisabledTxt = read("../Gallery_V0_11_STAGE12C64S_SINGLE_STARTUP_GATE_BATCHED_FINALIZATION_LOGIN_DISABLED.txt");

const sourceModule = await import(new URL("../src/Gallery_V0_11.js?verify=stage12c64s", import.meta.url));
const minModule = await import(new URL("../src/Gallery_V0_11.min.js?verify=stage12c64s", import.meta.url));
if (typeof sourceModule.createScene !== "function" || typeof minModule.createScene !== "function") {
  console.error("createScene ES module export is missing");
  process.exit(1);
}

const required = [
  "Stage 12C64S: Single Startup Gate / Batched Finalization",
  'stage: "12C64S"',
  'interactionStage: "12C64S"',
  "beginGalleryInteractionReadinessGate",
  "getGalleryInteractionReadinessSnapshot",
  "getGalleryInteractionReadinessBlockers",
  "waitForGalleryStableInteractionFrames",
  "artworkPreviewDrainComplete",
  "modelDrainComplete",
  "modelLoadActiveCount",
  "modelLoadConcurrency: isGalleryMobileStartupSurvivalEnabled() ? 1 : 2",
  "startupBatchHydrationActive",
  "startupBatchGlobalRefreshNeeded",
  "12C64S-single-batch-finalization",
  "12C64S-single-gate-finalized-and-warmed",
  "loadGalleryStartupAssetWithRetry",
  'startButton.textContent = ready',
  '"Finishing gallery…"',
  '"Still finishing gallery…"',
  "single_owner_prevalidated_arc_length_slerp_exact_end",
  "metadata.tourOrder",
  "setGalleryExhibitTourOrder",
  "editor-artwork-double-click",
  "editor-sculpture-double-click",
  "inspect-navigation-previous",
  "inspect-navigation-next",
  "--gallery-inspect-avatar-size: 132px",
  'photoPlaceholder.style.setProperty("display", "none", "important")'
];

const forbidden = [
  "waitForGalleryBalancedEntryReadiness",
  "getGalleryBalancedEntrySnapshot",
  "beginGalleryStartupArtworkPreviewPrefetch",
  "startupArtworkPrefetchQueue",
  "startupArtworkPrefetchActiveCount",
  "preEntryHydrationActive",
  "entryGateReady",
  "scheduleGalleryFastStartBackgroundFinalization",
  "releaseGalleryFastStartBackgroundContent",
  "runGalleryStartupFinalLightAssignmentDeferred",
  "runGalleryStartupFinalLightAssignment(",
  "waitForGalleryStartupArtworkTextures",
  "galleryAssetImportRetryPatchInstalled",
  "galleryOriginalSceneLoaderImportMesh",
  "installGalleryAssetImportRetryPatch",
  "BABYLON.SceneLoader.ImportMesh = function",
  "setTimeout(pumpModels, 180)",
  "fallback_direct_blocked",
  "galleryFocusFrameCache",
  "galleryPathCache",
  "focus-performance.c64l",
  "galleryTourRouteRuntime",
  "ADD POINT",
  "DELETE POINT",
  "REVERSE ROUTE"
];

const missing = required.filter((token) => !source.includes(token));
const stale = forbidden.filter((token) => source.includes(token));
if (missing.length || stale.length) {
  console.error({ missing, stale });
  process.exit(1);
}

const singletonNames = [
  "beginGalleryInteractionReadinessGate",
  "getGalleryInteractionReadinessSnapshot",
  "waitForGalleryStableInteractionFrames",
  "drainGalleryFastStartBackgroundQueue",
  "runGalleryFastStartFinalizationNow",
  "loadGalleryStartupAssetWithRetry",
  "finishGalleryStartup",
  "completeGalleryStartupIfReady",
  "animateViewerFocusPositionPath",
  "focusCameraOnObject",
  "navigateGalleryInspectExhibit",
  "openGalleryInspectTarget"
];
const duplicates = singletonNames.filter((name) => {
  const count = (source.match(new RegExp(`function\\s+${name}\\s*\\(`, "g")) || []).length;
  return count !== 1;
});
if (duplicates.length) {
  console.error("Expected exactly one active implementation", duplicates);
  process.exit(1);
}

function blockBetween(startToken, endToken) {
  const a = source.indexOf(startToken);
  const b = source.indexOf(endToken, a + startToken.length);
  if (a < 0 || b < 0) throw new Error(`Cannot extract block ${startToken}`);
  return source.slice(a, b);
}

const gateBlock = blockBetween("function beginGalleryInteractionReadinessGate", "function finishGalleryStartup");
if ((gateBlock.match(/runGalleryFastStartFinalizationNow\(/g) || []).length !== 1 ||
    !gateBlock.includes("drainGalleryFastStartBackgroundQueue") ||
    !gateBlock.includes("waitForGalleryStableInteractionFrames") ||
    !gateBlock.includes("interactionGateWatchdogTimer")) {
  console.error("Single startup gate is incomplete or finalizes more than once");
  process.exit(1);
}

const completeBlock = blockBetween("function completeGalleryStartupIfReady", "function assetLoaded");
if (completeBlock.includes("waitForGalleryBalancedEntryReadiness") ||
    !completeBlock.includes("finishGalleryStartup()")) {
  console.error("Startup still contains a second entry gate");
  process.exit(1);
}

const drainBlock = blockBetween("function drainGalleryFastStartBackgroundQueue", "function isGalleryViewerBusyForFullArtworkUpgrade");
if (!drainBlock.includes("modelLoadConcurrency") ||
    !drainBlock.includes("modelLoadActiveCount") ||
    drainBlock.includes("setTimeout(pumpModels, 180)") ||
    drainBlock.includes("scheduleGalleryFastStartBackgroundFinalization")) {
  console.error("Startup model drain is not bounded-concurrency / batch-only");
  process.exit(1);
}

const modelBlock = blockBetween("async function loadModel3dIntoSlot", "function applyModel3dStateToSlot");
if (!modelBlock.includes("startupBatchHydrationActive") ||
    modelBlock.includes("scheduleGalleryFastStartBackgroundFinalization")) {
  console.error("Per-model startup finalization was not removed");
  process.exit(1);
}

const propsIndex = source.indexOf('"Props.glb"');
const propsEnd = source.indexOf('// STAGE 12C62S6D - CEILING', propsIndex);
const propsBlock = source.slice(propsIndex, propsEnd);
if (!propsBlock.includes("startupBatchGlobalRefreshNeeded") ||
    propsBlock.includes("scheduleGalleryFastStartBackgroundFinalization")) {
  console.error("Props still perform repeated startup finalization");
  process.exit(1);
}

if (/BABYLON\.SceneLoader\.ImportMesh\s*=/.test(source)) {
  console.error("Babylon SceneLoader.ImportMesh is still globally overwritten");
  process.exit(1);
}
if ((source.match(/loadGalleryStartupAssetWithRetry\(/g) || []).length !== 5) {
  console.error("Expected local loader definition plus four startup GLB calls");
  process.exit(1);
}

// Protect the working Stage R1 Inspect pipeline byte-for-byte.
function extractFunction(text, name) {
  const marker = `function ${name}(`;
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const open = text.indexOf("{", start);
  let depth = 0;
  let state = "code";
  let quote = "";
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    const n = text[i + 1] || "";
    if (state === "code") {
      if (c === "'" || c === '"' || c === "`") { state = "string"; quote = c; }
      else if (c === "/" && n === "/") { state = "line"; i += 1; }
      else if (c === "/" && n === "*") { state = "block"; i += 1; }
      else if (c === "{") depth += 1;
      else if (c === "}") {
        depth -= 1;
        if (depth === 0) return text.slice(start, i + 1);
      }
    } else if (state === "string") {
      if (c === "\\") i += 1;
      else if (c === quote) { state = "code"; quote = ""; }
    } else if (state === "line") {
      if (c === "\n") state = "code";
    } else if (state === "block") {
      if (c === "*" && n === "/") { state = "code"; i += 1; }
    }
  }
  throw new Error(`Unterminated function ${name}`);
}
const protectedHashes = {
  beginGalleryInspectCameraTransition: "b0a658270f729a0055897256194f1e3a48d95807e00461ba801b4a2ba614be18",
  completeGalleryInspectCameraTransition: "f17924d3f66fb2957c43441c831bee2bbe2d8049d489439f50aebeac26ba872d",
  releaseGalleryInspectCameraToWalk: "7cfa641ca0fec8f45642ccba3983af7de64ca6a80384817c5e29f22ba71efaad",
  animateViewerFocusPositionPath: "030b26be6ffdf3148341fcd4e7ee547765c88759aec3ac32f46ee66c3fa9cdbf",
  focusCameraOnObject: "8e8a6e7c21cdf8456effe6156cc3b37f44b188fd1a772d05ecad212304a54082",
  navigateGalleryInspectExhibit: "50eb8ff5e042533e260ed70a63ef7a4e1d78d9da227357d539fd71b33718bff3",
  openGalleryInspectTarget: "ba079d23996711e4028f7637e3de3bfef4805fb975f628e6c46bf8bfa53ecbce"
};
for (const [name, expected] of Object.entries(protectedHashes)) {
  const actual = crypto.createHash("sha256").update(extractFunction(source, name)).digest("hex");
  if (actual !== expected) {
    console.error("Protected Inspect function changed", { name, expected, actual });
    process.exit(1);
  }
}

if (!viewerBootstrap.includes("Stage 12C64S") ||
    !viewerBootstrap.includes("stage12c64s_single_startup_gate_batched_finalization_20260716") ||
    !editorBootstrap.includes("Stage 12C64S") ||
    !index.includes("Stage 12C64S") ||
    !index.includes("stage12c64s_single_startup_gate_batched_finalization_20260716")) {
  console.error("Stage 12C64S bootstrap/cache identity is incomplete");
  process.exit(1);
}

if (!source.includes("var galleryEditorLoginEnabled = true;")) {
  console.error("Production source must keep editor login enabled");
  process.exit(1);
}
if (!loginDisabledTxt.includes("var galleryEditorLoginEnabled = false;") ||
    loginDisabledTxt.includes("var galleryEditorLoginEnabled = true;")) {
  console.error("Root LOGIN_DISABLED TXT must have editor login disabled");
  process.exit(1);
}

for (const obsolete of ["../src/Gallery_V0_7.js", "../src/Gallery_V0_8.js", "../src/Gallery_V0_10.js"]) {
  if (fs.existsSync(new URL(obsolete, import.meta.url))) {
    console.error("Obsolete engine source still included", obsolete);
    process.exit(1);
  }
}

if (source === min || min.length >= source.length * 0.88 || min.length < 100000) {
  console.error("Production minification looks invalid", { sourceBytes: source.length, minBytes: min.length });
  process.exit(1);
}
if (!min.includes("12C64S") || !min.includes("Finishing gallery")) {
  console.error("Production build is missing Stage S markers");
  process.exit(1);
}

console.log("Stage 12C64S verifier passed", {
  required: required.length,
  forbidden: forbidden.length,
  sourceBytes: source.length,
  minBytes: min.length
});
