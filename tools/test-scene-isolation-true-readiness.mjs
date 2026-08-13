import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/Gallery_V0_11.js", import.meta.url), "utf8");
const viewer = fs.readFileSync(new URL("../src/bootstrap/gallery-viewer-bootstrap.js", import.meta.url), "utf8");
const admin = fs.readFileSync(new URL("../src/bootstrap/admin-workspace-bootstrap.js", import.meta.url), "utf8");
const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function expect(label, value) { if (!value) throw new Error(`C6C8C9 regression: ${label}`); }

expect("package stage", pkg.version.includes("c6c8c12"));
expect("runtime stage", source.includes('stage: "12C66C6C8C12"') && source.includes('exhibition-platform-multi-exhibition.v10'));
expect("owner scene scan", source.includes("function getGallerySceneOwnerEntities(") && source.includes("scene.transformNodes") && source.includes("scene.lights"));
expect("inactive owner sweep", source.includes("function sweepGalleryInactiveExhibitionOwners(") && source.includes("active-context-change") && source.includes("post-hydration-orphan-sweep"));
expect("stale artwork callback gate", source.includes("inactive-owner-texture-loaded") && source.includes("staleOwnerCallbacksBlocked"));
expect("space cannot be swept", source.includes('galleryOwnerType === "exhibition"') && source.includes('galleryOwnerType === "space"'));
expect("GPU warmup", source.includes("function runGallerySpaceGpuWarmup(") && source.includes("forceCompilationAsync"));

expect("resident owner trees restore recursively", source.includes("function restoreGalleryKnownOwnerEntityTree(") && source.includes("restoreGalleryKnownOwnerEntityTree(frameRuntime.root") && source.includes("restoreGalleryKnownOwnerEntityTree(node, getGalleryNodeOwnerId(slot))"));
expect("hydration crosses paint boundaries", source.includes("async function applyGallerySameSpaceExhibitionState(") && source.includes("await yieldGalleryForegroundFrame(0)") && source.includes("async function applyGalleryStartupStatePreloadResult("));
expect("Tour paths are lazy after hydration", source.includes("path precomputation is debug/navigation work, not a readiness dependency") && !source.includes('ensureGalleryExhibitTourCurrent("same-runtime-admin-enter")') && source.includes('lastRebuildReason = "scene-ready-lazy"'));
expect("readiness retries unstable foreground", source.includes("quietRetry") && source.includes("retried: true"));
expect("foreground bounded artwork queue", source.includes("function getGalleryForegroundPendingSnapshot(") && source.includes("foregroundArtworkQueue") && source.includes("backgroundModelQueue"));
expect("quiet frame gate", source.includes("function waitForGalleryForegroundQuietFrames(") && source.includes("stable >= 6"));
expect("long task observer", source.includes("PerformanceObserver") && source.includes('entryTypes: ["longtask"]'));
expect("startup true readiness", source.includes('setGalleryInteractionReady(true, "C6C8C12-hard-space-visual-ready")'));
expect("switch cooperative yield", source.includes("await yieldGalleryForegroundFrame(0)") && source.includes('markGalleryForegroundNotReady("exhibition-switch-start")'));
expect("viewer mode guards wait", viewer.includes('waitForForegroundReady("admin-to-public"') && viewer.includes('waitForForegroundReady("public-to-admin"'));
expect("exhibition switch guard waits", admin.includes('waitForForegroundReady(`switch:${fromId}->${id}`'));
expect("diagnostics expose foreground", admin.includes("FG ${foreground.ready ?") && source.includes("getForegroundReadiness:"));
console.log("C6C8C9 Scene Isolation / True Readiness regression passed.");
