import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import vm from 'node:vm';

// Consolidated regression suite. Each block is isolated so legacy variable names cannot collide.

// --- test-transition-guard-loading-feedback.mjs ---
await (async () => {
const root = new URL('../', import.meta.url);
const viewer = fs.readFileSync(new URL('src/bootstrap/gallery-viewer-bootstrap.js', root), 'utf8');
const admin = fs.readFileSync(new URL('src/bootstrap/admin-workspace-bootstrap.js', root), 'utf8');
const guard = fs.readFileSync(new URL('src/bootstrap/transition-guard.js', root), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'));
function expect(label, ok){ if(!ok) throw new Error(`FAIL: ${label}`); console.log(`OK: ${label}`); }
expect('current package keeps transition guard regression coverage', pkg.version.includes('c6c8c16') && viewer.includes('const STAGE = "12C66C6C8C16"') && admin.includes('const STAGE = "12C66C6C8C16"'));
expect('shared full-page guard exists', guard.includes('position:fixed; inset:0') && guard.includes('z-index:2147483000') && guard.includes('epTransitionSpinner'));
expect('guard blocks wheel/touch/keyboard interaction', guard.includes('document.addEventListener("wheel"') && guard.includes('document.addEventListener("touchmove"') && guard.includes('document.addEventListener("keydown"'));
expect('guard paints before transition work', guard.includes('await waitForPaint()'));
expect('exhibition switch is guarded', admin.includes('title: `Switching to ${target.name}…`') && admin.includes('await window.GalleryApp.switchExhibition'));
expect('Admin to Public clean same-runtime return bypasses the full-page guard with guarded fallback', viewer.includes('const instantFastPath = (preserveDraft || !sceneDirty) && canUseInstantWorkspaceModeSwitch()') && viewer.includes('if (!instantFastPath)') && viewer.includes('title: "Returning to Public Page…"'));
expect('Public to Admin same-runtime entry is guarded', viewer.includes('title: "Opening Admin Workspace…"') && viewer.includes('enterAdminWorkspaceMode'));
expect('network telemetry no longer extends the blocking overlay', admin.includes('void captureExhibitionTransitionDiagnostic') && viewer.includes('void finishModeTransitionDiagnostic'));
console.log('C6C8C6 Transition Guard regression passed.');

})();

// --- test-scene-ownership-atomic-hydration.mjs ---
await (async () => {
const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
const transitionGuard = fs.readFileSync(new URL('../src/bootstrap/transition-guard.js', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../src/bootstrap/admin-workspace-bootstrap.js', import.meta.url), 'utf8');

function expect(label, condition) {
  if (!condition) throw new Error(`C6C8C7 regression: ${label}`);
}
function extractFunction(text, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const marker of markers) { start = text.indexOf(marker); if (start >= 0) break; }
  if (start < 0) throw new Error(`Missing function ${name}`);
  const brace = text.indexOf('{', start);
  let depth = 0, mode = 'code', quote = '';
  for (let i = brace; i < text.length; i += 1) {
    const c = text[i], n = text[i + 1] || '';
    if (mode === 'code') {
      if (c === '"' || c === "'" || c === '`') { mode = 'string'; quote = c; }
      else if (c === '/' && n === '/') { mode = 'line'; i += 1; }
      else if (c === '/' && n === '*') { mode = 'block'; i += 1; }
      else if (c === '{') depth += 1;
      else if (c === '}' && --depth === 0) return text.slice(start, i + 1);
    } else if (mode === 'string') {
      if (c === '\\') i += 1;
      else if (c === quote) mode = 'code';
    } else if (mode === 'line' && c === '\n') mode = 'code';
    else if (mode === 'block' && c === '*' && n === '/') { mode = 'code'; i += 1; }
  }
  throw new Error(`Unterminated ${name}`);
}

expect('stage identity', source.includes('stage: "12C66C6C8C16"') && source.includes('exhibition-platform-multi-exhibition.v10'));
expect('space ownership tagging', source.includes('tagGallerySpaceCollection(wallMeshes, "wall")') && source.includes('registerGallerySpaceIntegrityBaseline("wall", wallMeshes)'));
expect('canonical Space integrity guard', source.includes('function verifyGalleryCanonicalSpaceIntegrity(') && source.includes('canonical-after-exhibition-switch-'));
expect('Space ancestor roots are owned and integrity checked', source.includes('function tagGallerySpaceAncestorChain(') && source.includes('entry.ancestors || []'));
expect('Viewer/Admin mode transition preserves Space integrity via deferred audit', source.includes('function scheduleGalleryWorkspaceModeBackgroundAudit(') && source.includes('verifyGalleryCanonicalSpaceIntegrity("workspace-mode-idle-space-integrity")'));
expect('complete artwork parking', source.includes('glowPlane') && source.includes('frameRoot'));
expect('complete sculpture parking', source.includes('runtimeRoots') && source.includes('sculptureCollisionProxy'));
expect('complete Local Light parking', source.includes('helperMeshes') && source.includes('cancelGalleryLocalLightDeferredWork(item)'));
expect('atomic first-load hydration', source.includes('galleryExhibitionRuntime.hydrationActive = true') && source.includes('galleryFastStartRuntime.stateApplyActive = true') && source.includes('startupBatchHydrationActive = true'));
expect('per-item light refresh suppressed during hydration', source.includes('!galleryExhibitionRuntime.hydrationActive && !(galleryFastStartRuntime && galleryFastStartRuntime.stateApplyActive)'));
expect('Tour is deferred', source.includes('scheduleGalleryDeferredTourAfterHydration') && !extractFunction(source, 'finalizeGallerySameSpaceExhibitionDelta').includes('rebuildGalleryExhibitTour({'));
expect('lighting retarget/shadows are deferred', extractFunction(source, 'finalizeGallerySameSpaceExhibitionDelta').includes('runGalleryFastStartIdleTask'));
expect('transition overlay crosses a real task boundary', transitionGuard.includes('setTimeout(resolve, 34)'));
expect('Admin shows CPU + Space diagnostics', admin.includes('CPU: prepare') && admin.includes('Space ${integrity.ok ? "OK" : "FAIL"}'));

// Behavioral ownership test: even if a bad runtime hierarchy accidentally puts a Space
// node below an Exhibition node, recursive Exhibition cleanup must be blocked before dispose().
const runtime = { ownershipViolations: 0, blockedSpaceDisposals: 0 };
const context = {
  galleryExhibitionRuntime: runtime,
  normalizeGalleryRuntimeId: (value, fallback) => String(value || fallback || ''),
  getActiveGalleryExhibitionId: () => 'main',
  console: { error() {}, warn() {} }
};
vm.createContext(context);
for (const name of ['isGallerySpaceOwnedNode', 'getGalleryNodeOwnerId', 'canGalleryExhibitionMutateNode', 'disposeGalleryExhibitionOwnedNode']) {
  vm.runInContext(`${extractFunction(source, name)}; this.${name}=${name};`, context);
}
const spaceChild = {
  name: 'Wall_segment_001',
  metadata: { galleryOwnerType: 'space', galleryOwnerId: 'main-space', galleryOwnerRole: 'wall' },
  disposed: false,
  isDisposed() { return this.disposed; },
  dispose() { this.disposed = true; }
};
const exhibitionRoot = {
  name: 'SculptureRuntime',
  metadata: { galleryOwnerType: 'exhibition', galleryOwnerId: 'main' },
  disposed: false,
  isDisposed() { return this.disposed; },
  getDescendants() { return [spaceChild]; },
  dispose() { this.disposed = true; }
};
const allowed = context.disposeGalleryExhibitionOwnedNode(exhibitionRoot, 'main', 'test-recursive-dispose', true);
expect('recursive dispose blocked when Space child is detected', allowed === false && !exhibitionRoot.disposed && !spaceChild.disposed);
expect('ownership violation is counted', runtime.ownershipViolations >= 1 && runtime.blockedSpaceDisposals >= 1);

console.log('C6C8C7 Scene Ownership / Atomic Exhibition Hydration regression passed.');

})();

// --- test-stable-texture-residency-no-thrash.mjs ---
await (async () => {
const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../src/bootstrap/admin-workspace-bootstrap.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function expect(label, condition) {
  if (!condition) throw new Error(`C6C8C8 regression: ${label}`);
}
function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  expect(`function ${name} exists`, start >= 0);
  const brace = source.indexOf('{', start);
  let depth = 0, quote = null, line = false, block = false;
  for (let i = brace; i < source.length; i++) {
    const c = source[i], n = source[i + 1] || '';
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

expect('package identity', pkg.version.includes('c6c8c16'));
expect('source stage identity', source.includes('stage: "12C66C6C8C16"'));
expect('residency schema v3', source.includes('schema: "gallery-artwork-residency.v3"'));
expect('workspace-independent Full budget', source.includes('desktopFullTextures: 6') && source.includes('desktopHardFullTextures: 8'));

const workspaceSync = extractFunction('syncGalleryArtworkEgressPolicyForWorkspaceMode');
expect('Admin/Public transition does not schedule residency rebalance', !workspaceSync.includes('scheduleGalleryArtworkResidencyMaintenance'));
expect('Admin/Public transition reports textureRebalance false', workspaceSync.includes('textureRebalance: false'));

const motionGate = extractFunction('isGalleryViewerTextureStreamingMotionBlocked');
expect('movement gate uses inactivity delay', motionGate.includes('idleBeforeFullMs') && motionGate.includes('lastViewerActivityAt'));
expect('movement gate covers keyboard motion', motionGate.includes('viewerMoveKeys') && motionGate.includes('editMoveKeys'));

const bypass = extractFunction('canGalleryPriorityFullArtworkBypassMovement');
expect('only Inspect can bypass idle movement gate', bypass.includes('if (!entry || !entry.inspectPriority) return false;'));
expect('critical tier no longer bypasses movement', !bypass.includes('entry.tier !== "critical"'));

const queue = extractFunction('queueGalleryArtworkFullForResidency');
expect('downgrade reentry cooldown blocks Full', queue.includes('fullReentryBlockedUntil') && queue.includes('thrashPrevented'));

const enforce = extractFunction('enforceGalleryArtworkResidencyBudget');
expect('hard ceiling drives downgrade', enforce.includes('getGalleryArtworkFullResidencyHardLimit') && enforce.includes('needsHardEviction'));
expect('distance alone cannot drive downgrade', !enforce.includes('hardOverBudget || (loadedAge'));
expect('downgrade waits for idle', enforce.includes('isGalleryViewerTextureStreamingMotionBlocked'));

expect('downgrade marks no-auto-Full', source.includes('previewState._galleryNoAutoFullQueue = true'));
expect('preview load suppresses downgrade requeue', source.includes('preview-auto-full-suppressed'));
expect('normal Preview no longer unconditionally queues Full', source.includes('Normal Preview textures do not automatically create a Full queue entry.'));
expect('diagnostic counters exported', source.includes('blockedWhileMoving: galleryArtworkResidencyRuntime.blockedWhileMoving') && source.includes('thrashPrevented: galleryArtworkResidencyRuntime.thrashPrevented'));
expect('Admin shows stability counters', admin.includes('move-block') && admin.includes('thrash'));

console.log('C6C8C8 Stable Texture Residency / No-Thrash Streaming regression passed.');

})();

// --- test-scene-isolation-true-readiness.mjs ---
await (async () => {
const source = fs.readFileSync(new URL("../src/Gallery_V0_11.js", import.meta.url), "utf8");
const viewer = fs.readFileSync(new URL("../src/bootstrap/gallery-viewer-bootstrap.js", import.meta.url), "utf8");
const admin = fs.readFileSync(new URL("../src/bootstrap/admin-workspace-bootstrap.js", import.meta.url), "utf8");
const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function expect(label, value) { if (!value) throw new Error(`C6C8C9 regression: ${label}`); }

expect("package stage", pkg.version.includes("c6c8c16"));
expect("runtime stage", source.includes('stage: "12C66C6C8C16"') && source.includes('exhibition-platform-multi-exhibition.v10'));
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
expect("viewer mode keeps readiness fallback without blocking clean fast path", viewer.includes("admin-to-public-fallback") && viewer.includes("public-to-admin-fallback") && viewer.includes("canUseInstantWorkspaceModeSwitch"));
expect("exhibition switch guard waits", admin.includes('waitForForegroundReady(`switch:${fromId}->${id}`'));
expect("diagnostics expose foreground", admin.includes("FG ${foreground.ready ?") && source.includes("getForegroundReadiness:"));
console.log("C6C8C9 Scene Isolation / True Readiness regression passed.");

})();

// --- test-startup-critical-path-background-budget.mjs ---
await (async () => {
const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const admin = fs.readFileSync(new URL('../src/bootstrap/admin-workspace-bootstrap.js', import.meta.url), 'utf8');
function expect(label, value) { if (!value) throw new Error(`C6C8C10 regression: ${label}`); }
function extract(name) {
  const marks=[`async function ${name}(`,`function ${name}(`]; let start=-1;
  for (const m of marks) { start=source.indexOf(m); if(start>=0) break; }
  expect(`function ${name}`, start>=0); const brace=source.indexOf('{',start); let d=0, state='c', quote='';
  for(let i=brace;i<source.length;i++){const c=source[i],n=source[i+1]||'';if(state==='c'){if(c==='"'||c==="'"||c==='`'){state='s';quote=c}else if(c==='/'&&n==='/'){state='l';i++}else if(c==='/'&&n==='*'){state='b';i++}else if(c==='{')d++;else if(c==='}'&&--d===0)return source.slice(start,i+1)}else if(state==='s'){if(c==='\\')i++;else if(c===quote)state='c'}else if(state==='l'&&c==='\n')state='c';else if(state==='b'&&c==='*'&&n==='/'){state='c';i++;}}
  throw new Error(`Unterminated ${name}`);
}
expect('package stage', pkg.version.includes('c6c8c16'));
expect('runtime stage', source.includes('stage: "12C66C6C8C16"') && source.includes('exhibition-platform-multi-exhibition.v10'));
expect('foreground Preview gate upgraded by C6C8C11', source.includes('previewGateMode: "all-assigned-preview"') && source.includes('function prepareGalleryForegroundArtworkBudget('));
const pending = extract('getGalleryForegroundPendingSnapshot');
expect('models not foreground blockers', !pending.includes('criticalModelQueue') && !pending.includes('modelActive:') && pending.includes('backgroundModelQueue'));
const drain = extract('drainGalleryFastStartBackgroundQueue');
expect('foreground drain artwork-only', drain.includes('takeGalleryForegroundArtworkEntry()') && !drain.includes('applyModel3dStateToSlot'));
const pump = extract('pumpGalleryZoneStreamingQueues');
expect('background active-zone only', pump.includes('["critical", "nearby"]') && !pump.includes('["critical", "nearby", "deferred"]'));
expect('background one-slice budget', pump.includes('budgetRuntime.artworkStarts += 1') && pump.includes('budgetRuntime.modelStarts += 1') && pump.includes('getGalleryBackgroundHydrationPauseReason("model")'));
expect('motion-aware pause', source.includes('function isGalleryBackgroundHydrationMotionActive(') && source.includes('model-idle-budget') && source.includes('artwork-idle-budget'));
expect('cached batched Space warmup', source.includes('gallerySpaceGpuWarmMeshCache') && source.includes('batchSize = galleryDeviceProfile.mobile ? 2 : 5') && source.includes('Promise.all(list.slice(i, i + batchSize)'));
expect('admin background diagnostics', admin.includes('BG slices') && admin.includes('Preview presence'));
console.log('C6C8C10 Startup Critical Path / Background Hydration Budget regression passed.');

})();

// --- test-guaranteed-preview-fill.mjs ---
await (async () => {
const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const admin = fs.readFileSync(new URL('../src/bootstrap/admin-workspace-bootstrap.js', import.meta.url), 'utf8');

function expect(label, value) {
  if (!value) throw new Error(`C6C8C11 regression: ${label}`);
}

function extract(name) {
  const marks = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const mark of marks) {
    start = source.indexOf(mark);
    if (start >= 0) break;
  }
  expect(`function ${name}`, start >= 0);
  const brace = source.indexOf('{', start);
  let depth = 0, state = 'code', quote = '';
  for (let i = brace; i < source.length; i++) {
    const c = source[i], n = source[i + 1] || '';
    if (state === 'code') {
      if (c === '"' || c === "'" || c === '`') { state = 'string'; quote = c; }
      else if (c === '/' && n === '/') { state = 'line'; i++; }
      else if (c === '/' && n === '*') { state = 'block'; i++; }
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return source.slice(start, i + 1);
    } else if (state === 'string') {
      if (c === '\\') i++;
      else if (c === quote) state = 'code';
    } else if (state === 'line' && c === '\n') state = 'code';
    else if (state === 'block' && c === '*' && n === '/') { state = 'code'; i++; }
  }
  throw new Error(`Unterminated ${name}`);
}

expect('package stage', pkg.version.includes('c6c8c16'));
expect('runtime stage', source.includes('stage: "12C66C6C8C16"'));
expect('all assigned Preview policy', source.includes('previewGateMode: "all-assigned-preview"'));

const budget = extract('prepareGalleryForegroundArtworkBudget');
expect('no nearest-zone limit', !budget.includes('foregroundArtworkLimit') && !budget.includes('selected >= limit'));
expect('every current queue entry promoted', budget.includes('entry.foregroundCritical = true'));
expect('missing required Preview is queued', budget.includes('queueGalleryMissingRequiredPreviews'));

const presence = extract('getGalleryActiveArtworkPreviewPresenceSnapshot');
expect('Full or Preview material satisfies presence', presence.includes('artwork.metadata.imageMaterial') && presence.includes('imagePlane.material === artwork.metadata.imageMaterial'));
expect('inactive exhibitions excluded', presence.includes('isGalleryEntityOwnerActive'));

const drain = extract('drainGalleryFastStartBackgroundQueue');
expect('Preview starts after paint, not requestIdleCallback', drain.includes('yieldGalleryForegroundFrame(0).then') && !drain.includes('runGalleryFastStartIdleTask(function'));
expect('bounded configured concurrency', drain.includes('Math.min(6, getGalleryFastStartPreviewTextureConcurrency())'));
expect('foreground Preview is forced immediate', drain.includes('_galleryFastStartForceImmediate = true') && drain.includes('_galleryFastStartPreferPreview'));

const snapshot = extract('getGalleryInteractionReadinessSnapshot');
expect('readiness counts required Preview', snapshot.includes('requiredPreviews') && snapshot.includes('readyPreviews') && snapshot.includes('missingPreviews'));
expect('ready requires complete fill', snapshot.includes('snapshot.requiredPreviews === snapshot.readyPreviews') && snapshot.includes('snapshot.missingPreviews === 0'));
expect('hard gate rejects broken Preview fill', source.includes('Artwork Preview readiness failed:') && source.includes('required-preview-hard-gate'));
expect('models remain background', !snapshot.includes('snapshot.modelQueue === 0') && !snapshot.includes('snapshot.modelActive === 0'));

expect('Full residency policy preserved', source.includes('schema: "gallery-artwork-residency.v3"') && source.includes('idleBeforeFullMs: 1800'));
expect('Admin diagnostics describe guarantee', admin.includes('Preview presence'));

console.log('C6C8C11 Guaranteed Preview Fill regression passed.');

})();

// --- test-hard-space-visual-ready.mjs ---
await (async () => {
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/Gallery_V0_11.js'), 'utf8');
const config = fs.readFileSync(path.join(root, 'src/config/gallery-space-config.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
function expect(label, value) { if (!value) throw new Error(`C6C8C12 regression: ${label}`); }
expect('package stage', pkg.version.includes('c6c8c16'));
expect('runtime stage', source.includes('stage: "12C66C6C8C16"'));
expect('props required in Space config', /props:[\s\S]*?fileName: "Props\.glb"[\s\S]*?required: true/.test(config));
expect('props part of critical shell', source.includes('var galleryCriticalAssetNames = ["floor", "wall", "props", "ceiling"]'));
expect('no current optional Space assets', source.includes('var galleryOptionalAssetNames = [];'));
expect('generic optional deferral only', source.includes('return galleryOptionalAssetNames.indexOf(assetName) !== -1;'));
expect('per mesh warmup cache', source.includes('var gallerySpaceGpuWarmMeshCache') && source.includes('getGallerySpaceGpuWarmupRevision'));
expect('every wall mesh participates', source.includes('{ kind: "wall", meshes: wallMeshes }'));
expect('props participate in warmup', source.includes('{ kind: "prop", meshes: propMeshes }'));
expect('warmup does not dedupe shared materials', !source.includes('if (seen.indexOf(material) !== -1) return;'));
expect('warmup verifies material readiness', source.includes('pair.material.isReady(pair.mesh, false)'));
expect('warmup timeout is a failure', source.includes('compileState === "timeout"'));
expect('hard warmup gate', source.includes('warmup.ok !== true') && source.includes('Space visual warmup failed for:'));
expect('props resident', source.includes('gallerySpaceAlwaysResident = true') && source.includes('mesh.setEnabled(true)'));
expect('props static freeze', source.includes('freezeStaticGalleryMeshes(propMeshes, "prop")'));
expect('props readiness blocker', source.includes('snapshot.propsSettled') && source.includes('blockers.push("props")'));
console.log('C6C8C12 Hard Space Visual Ready regression passed.');

})();
