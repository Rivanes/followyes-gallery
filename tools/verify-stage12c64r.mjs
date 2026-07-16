import fs from "node:fs";

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), "utf8");
const source = read("../src/Gallery_V0_11.js");
const min = read("../src/Gallery_V0_11.min.js");
const viewerBootstrap = read("../src/bootstrap/gallery-viewer-bootstrap.js");
const editorBootstrap = read("../src/bootstrap/gallery-editor-bootstrap.js");
const index = read("../index.html");
const loginDisabledTxt = read("../Gallery_V0_11_STAGE12C64R_SMOOTH_INSPECT_INTERACTION_READY_LOGIN_DISABLED.txt");

const sourceModule = await import(new URL("../src/Gallery_V0_11.js?verify=stage12c64r", import.meta.url));
const minModule = await import(new URL("../src/Gallery_V0_11.min.js?verify=stage12c64r", import.meta.url));
if (typeof sourceModule.createScene !== "function" || typeof minModule.createScene !== "function") {
  console.error("createScene ES module export is missing");
  process.exit(1);
}

const required = [
  "STAGE 12C64R",
  "Smooth Inspect Playback / Interaction Readiness Gate",
  'state: "WALK"',
  'galleryInspectCameraRuntime.state = "TRANSITION"',
  'galleryInspectCameraRuntime.state = "INSPECT"',
  "single_owner_prevalidated_arc_length_slerp_exact_end",
  "prevalidated-route-blocked",
  "routePrevalidated",
  "smoothPathClear",
  "rawPathClear",
  "interactionReady: false",
  "interactionFinalizationComplete",
  "interactionWarmupComplete",
  "beginGalleryInteractionReadinessGate",
  "getGalleryInteractionReadinessSnapshot",
  "waitForGalleryStableInteractionFrames",
  'startButton.textContent = ready ? "Start exploring" : "Finishing gallery…"',
  "startButton.disabled = !ready",
  "snapshot.modelQueue === 0",
  "snapshot.propsSettled",
  "snapshot.pendingVisibleTextures === 0",
  "snapshot.prefetchActive === 0",
  "12C64R-interaction-ready-finalization",
  "scheduleGalleryFastStartFullArtworkDrainWhenIdle",
  "isGalleryViewerBusyForFullArtworkUpgrade",
  "fullArtworkIdleDelayMs: 1800",
  "markGalleryViewerActivity(\"viewer-movement\")",
  "metadata.tourOrder",
  "setGalleryExhibitTourOrder",
  "AUTO ORDER",
  "SHOW PATH",
  "editor-artwork-double-click",
  "editor-sculpture-double-click",
  "inspect-navigation-previous",
  "inspect-navigation-next",
  "--gallery-inspect-avatar-size: 132px",
  "buttonSize = mobile ? 52 : 68"
];

const forbidden = [
  "findGalleryExhibitSafeStartPosition",
  "recoveredStartPosition",
  "findGalleryExhibitAuthoritativeStartRecovery",
  "findGalleryExhibitAuthoritativeDocking",
  "findGalleryExhibitSafeTargetPosition",
  "nearestSafeTarget",
  "fallback_direct_blocked",
  "galleryFocusFrameCache",
  "galleryPathCache",
  "focus-performance.c64l",
  "Enable Focus Performance Debug",
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

const singletons = [
  "animateViewerFocusPositionPath",
  "beginGalleryInteractionReadinessGate",
  "getGalleryInteractionReadinessSnapshot",
  "waitForGalleryStableInteractionFrames",
  "drainGalleryFastStartFullArtworkQueue",
  "beginGalleryInspectCameraTransition",
  "completeGalleryInspectCameraTransition",
  "releaseGalleryInspectCameraToWalk",
  "findGalleryExhibitSafePath",
  "navigateGalleryInspectExhibit",
  "openGalleryInspectTarget"
];
const duplicates = singletons.filter((name) => {
  const count = (source.match(new RegExp(`function\\s+${name}\\s*\\(`, "g")) || []).length;
  return count !== 1;
});
if (duplicates.length) {
  console.error("Expected exactly one active implementation", duplicates);
  process.exit(1);
}

const animationStart = source.indexOf("function animateViewerFocusPositionPath");
const animationEnd = source.indexOf("function focusCameraOnObject", animationStart);
const animationBlock = source.slice(animationStart, animationEnd);
if (!animationBlock.includes("isGalleryExhibitPathClear(smoothCandidate") ||
    !animationBlock.includes("isGalleryExhibitPathClear(rawPoints") ||
    !animationBlock.includes("scene.onBeforeRenderObservable.add") ||
    animationBlock.includes("isGalleryExhibitSegmentBlocked(previousSample") ||
    animationBlock.includes("runtime-segment-blocked")) {
  console.error("Inspect playback is not prevalidated-only");
  process.exit(1);
}

const observerStart = animationBlock.indexOf("scene.onBeforeRenderObservable.add");
const observerBlock = animationBlock.slice(observerStart);
if (observerBlock.includes("isGalleryExhibitSegmentBlocked") ||
    observerBlock.includes("getGalleryExhibitCollisionSnapshot") ||
    observerBlock.includes("pickWithRay")) {
  console.error("Per-frame Inspect observer still performs collision scanning");
  process.exit(1);
}

const gateStart = source.indexOf("function getGalleryInteractionReadinessSnapshot");
const gateEnd = source.indexOf("function waitForGalleryBalancedEntryReadiness", gateStart);
const gateBlock = source.slice(gateStart, gateEnd);
for (const token of [
  "modelQueue",
  "propsSettled",
  "pendingTextures",
  "pendingVisibleTextures",
  "prefetchQueue",
  "prefetchActive",
  "interactionFinalizationComplete",
  "interactionWarmupComplete"
]) {
  if (!gateBlock.includes(token)) {
    console.error("Interaction gate is missing requirement", token);
    process.exit(1);
  }
}

const finishStart = source.indexOf("function finishGalleryStartup");
const finishEnd = source.indexOf("function completeGalleryStartupIfReady", finishStart);
const finishBlock = source.slice(finishStart, finishEnd);
if (!finishBlock.includes("showViewerIntroOverlay") ||
    !finishBlock.includes("beginGalleryInteractionReadinessGate") ||
    !finishBlock.includes("interactionReady = false")) {
  console.error("Visual Ready / Interaction Ready handoff is incomplete");
  process.exit(1);
}

const fullStart = source.indexOf("function isGalleryViewerBusyForFullArtworkUpgrade");
const fullEnd = source.indexOf("var galleryAssetLoadDebug", fullStart);
const fullBlock = source.slice(fullStart, fullEnd);
if (!fullBlock.includes("!viewerIntroOverlayMovementUnlocked") ||
    !fullBlock.includes("isGalleryInspectCameraTransitionActive") ||
    !fullBlock.includes("viewerMovementVelocity") ||
    !fullBlock.includes("lastViewerActivityAt")) {
  console.error("Full artwork upgrades are not sufficiently idle-gated");
  process.exit(1);
}

if (!viewerBootstrap.includes('stage: "12C64R"') ||
    !viewerBootstrap.includes("stage12c64r_smooth_inspect_interaction_ready_20260715") ||
    !editorBootstrap.includes("Stage 12C64R") ||
    !index.includes("stage12c64r_smooth_inspect_interaction_ready_20260715")) {
  console.error("Stage 12C64R bootstrap/cache identity is incomplete");
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

if (source === min || min.length >= source.length * 0.88 || min.length < 100000) {
  console.error("Production minification looks invalid", { sourceBytes: source.length, minBytes: min.length });
  process.exit(1);
}
if (!min.includes("12C64R") || !min.includes("Finishing gallery")) {
  console.error("Production build is missing Stage R markers");
  process.exit(1);
}

console.log("Stage 12C64R verifier passed", {
  required: required.length,
  forbidden: forbidden.length,
  sourceBytes: source.length,
  minBytes: min.length
});
