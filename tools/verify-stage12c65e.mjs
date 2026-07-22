import fs from 'node:fs';
import crypto from 'node:crypto';

const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
const minified = fs.readFileSync(new URL('../src/Gallery_V0_11.min.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bootstrap = fs.readFileSync(new URL('../src/bootstrap/gallery-viewer-bootstrap.js', import.meta.url), 'utf8');
const editorBootstrap = fs.readFileSync(new URL('../src/bootstrap/gallery-editor-bootstrap.js', import.meta.url), 'utf8');
const txt = fs.readFileSync(new URL('../Gallery_V0_11_STAGE12C65E_FIRST_LIGHT_MODE_EXIT_STALL_FIX_LOGIN_DISABLED.txt', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

function sha(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function extractFunction(text, name) {
  const marker = `function ${name}(`;
  const start = text.indexOf(marker);
  assert(start >= 0, `Missing function ${name}`);
  const brace = text.indexOf('{', start);
  let depth = 0;
  let state = 'code';
  let quote = null;

  for (let i = brace; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1] || '';
    if (state === 'code') {
      if (char === '"' || char === "'" || char === '`') {
        state = 'string'; quote = char;
      } else if (char === '/' && next === '/') {
        state = 'line'; i += 1;
      } else if (char === '/' && next === '*') {
        state = 'block'; i += 1;
      } else if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) return text.slice(start, i + 1);
      }
    } else if (state === 'string') {
      if (char === '\\') i += 1;
      else if (char === quote) { state = 'code'; quote = null; }
    } else if (state === 'line') {
      if (char === '\n') state = 'code';
    } else if (state === 'block') {
      if (char === '*' && next === '/') { state = 'code'; i += 1; }
    }
  }
  throw new Error(`Unterminated function ${name}`);
}

// Stage identity / cache busting.
assert(index.includes('Stage 12C65E'), 'Index stage label missing');
assert(index.includes('stage: "12C65E"'), 'Boot Guard stage missing');
assert(source.includes('Stage 12C65E: Mobile Asset Streaming / Memory Budget'), 'Stage E source history missing');
assert(source.includes('stage: "12C65E"'), 'Source Stage E runtime identity missing');
assert(bootstrap.includes('Stage 12C65E Mobile Asset Streaming / Memory Budget'), 'Viewer bootstrap Stage E label missing');
assert(bootstrap.includes('stage12c65e_light_mode_exit_stall_fix_20260720'), 'Light Mode exit fix cache key missing');
assert(index.includes('gallery-viewer-bootstrap.js?v=stage12c65e_light_mode_exit_stall_fix_20260720'), 'Page bootstrap cache key missing');
assert(bootstrap.includes('stage: "12C65E"'), 'Viewer runtime Stage E identity missing');
assert(editorBootstrap.includes('Stage 12C65E'), 'Editor bootstrap Stage E label missing');
assert(!bootstrap.includes('stage12c65d'), 'Old Stage D cache key remains');
assert(!bootstrap.includes('stage12c65e_mobile_asset_streaming_20260716'), 'Pre-fix Stage E cache key remains');

// Stage C/D mobile viewport + Inspect foundations stay present.
assert(index.includes('viewport-fit=cover'), 'viewport-fit=cover missing');
assert(index.includes('--gallery-visual-viewport-height: 100dvh'), 'Visual viewport fallback missing');
assert(count(index, 'id="galleryMobileHud"') === 1, 'galleryMobileHud duplicated');
assert(count(index, 'class="galleryMobileHudLayer"') === 4, 'HUD layer count changed');
assert(source.includes('function updateGalleryMobileInspectSafeFrame(reason)'), 'Stage D Inspect safe-frame missing');
assert(source.includes('artworkInfoPopupInner.appendChild(galleryInspectNavigation)'), 'Stage D internal Inspect navigation missing');
assert(source.includes('mode = "above-joystick"'), 'Portrait Inspect safe-frame missing');
assert(source.includes('mode = "side"'), 'Landscape Inspect safe-frame missing');
assert(!source.includes('galleryMobileStartupSurvival'), 'Legacy Mobile Survival Mode returned');
assert(!source.includes('mobileFocusActive'), 'Legacy Mobile Focus returned');

// True critical → nearby → deferred architecture.
assert(source.includes('STAGE 12C65E — GALLERY ZONES / CRITICAL → NEARBY → DEFERRED'), 'Zone architecture marker missing');
assert(source.includes('var galleryZoneStreamingRuntime = {'), 'Zone runtime missing');
assert(source.includes('function rebuildGalleryStreamingZones(reason)'), 'Zone builder missing');
assert(source.includes('function getGalleryStreamingActiveZoneIds(currentZoneId)'), 'Zone adjacency resolver missing');
assert(source.includes('if (zoneId === galleryZoneStreamingRuntime.currentZoneId) return "critical";'), 'Critical classification missing');
assert(source.includes('if (galleryZoneStreamingRuntime.activeZoneIds.indexOf(zoneId) !== -1) return "nearby";'), 'Nearby classification missing');
assert(source.includes('return "deferred";'), 'Deferred classification missing');
assert(source.includes('takeGalleryStreamingQueueEntry(galleryFastStartRuntime.deferredArtworkLoads, "artwork", ["critical"])'), 'Critical artwork gate drains more than current zone');
assert(source.includes('takeGalleryStreamingQueueEntry(galleryFastStartRuntime.deferredModelLoads, "slot", ["critical"])'), 'Critical model gate drains more than current zone');
assert(source.includes('takeGalleryStreamingQueueEntry(galleryFastStartRuntime.deferredArtworkLoads, "artwork", ["critical", "nearby"])'), 'Nearby artwork pump missing');
assert(source.includes('takeGalleryStreamingQueueEntry(galleryFastStartRuntime.deferredModelLoads, "slot", ["critical", "nearby"])'), 'Nearby model pump missing');
assert(source.includes('startGalleryZoneStreamingRuntime("12C65E-interaction-ready")'), 'Zone runtime not started after Interaction Ready');
assert(source.includes('releaseGalleryStartupDeferredOptionalAssetImports("12C65E-interaction-ready-nearby-stream")'), 'Props are not released after Interaction Ready');
assert(!extractFunction(source, 'drainGalleryFastStartBackgroundQueue').includes('releaseGalleryStartupDeferredOptionalAssetImports'), 'Critical gate releases Props too early');
assert(source.includes('getGalleryStreamingTierForObject(queuedEntry.artwork) === "critical"'), 'Full artwork upgrades are not current-zone-only');

// Texture memory lifecycle and KTX2 fallback.
assert(source.includes('function suspendArtworkTextureForStreaming(artwork, reason)'), 'Artwork texture suspension missing');
assert(source.includes('disposeArtworkImageMaterial(artwork);'), 'Artwork texture/material disposal missing');
assert(source.includes('function maintainGalleryStreamingMemoryBudget(reason)'), 'Streaming memory budget missing');
assert(source.includes('maxResidentArtworkTextures'), 'Artwork resident budget missing');
assert(source.includes('maxResidentModels'), 'Model resident budget missing');
assert(source.includes('function refreshGalleryStreamingBudgetsFromQuality(profileName, reason)'), 'Quality-aware streaming budgets missing');
assert(extractFunction(source, 'applyGalleryMobileQualityProfile').includes('refreshGalleryStreamingBudgetsFromQuality'), 'Adaptive Quality does not refresh streaming budgets');
assert(source.includes('BABYLON.KhronosTextureContainer2'), 'KTX2 decoder configuration missing');
assert(source.includes('imageUrlKtx2Preview'), 'KTX2 preview field missing');
assert(source.includes('imageUrlKtx2Mobile'), 'KTX2 mobile field missing');
assert(source.includes('imageUrlKtx2Web'), 'KTX2 web field missing');
assert(source.includes('_galleryKtx2FallbackUrl'), 'KTX2 fallback URL missing');
assert(source.includes('_galleryKtx2FallbackAttempted'), 'KTX2 retry guard missing');
assert(source.includes('applyArtworkImageStateSafely(artwork, fallbackState, "12C65E KTX2 fallback")'), 'KTX2 normal-image fallback missing');

// Model memory and real optional low/high asset selection.
assert(source.includes('function suspendModel3dForStreaming(slot, reason)'), 'Model suspension missing');
assert(source.includes('disposeModel3dRuntimeMaterialsForStreaming(slot)'), 'Model material/texture disposal missing');
assert(source.includes('if (!galleryDeviceProfile.mobile)'), 'Mobile model cache bypass branch missing');
assert(source.includes('lodUrl: modelState.lodUrl || modelState.modelUrlLow || modelState.lowUrl || ""'), 'Low LOD state normalization missing');
assert(source.includes('function getGalleryModelStreamingAssetChoice(modelState, streamingTier)'), 'Model LOD asset selector missing');
assert(source.includes('tier === "nearby" && lowUrl'), 'Nearby low-LOD selection missing');
assert(source.includes('needsCriticalUpgrade'), 'Low-to-high critical-zone upgrade missing');
assert(source.includes('critical-high-lod-upgrade'), 'Critical model LOD upgrade queue missing');
assert(source.includes('mesh.addLODLevel(distance, null)'), 'Distance model LOD/culling missing');
assert(source.includes('configureGalleryPropStreamingLod(mesh)'), 'Props distance LOD missing');

// Zone-based Props and Local Lights.
assert(source.includes('function updateGalleryPropZoneActivation()'), 'Props zone activation missing');
assert(source.includes('isGalleryStreamingZoneActive(zoneId)'), 'Active-zone check missing');
const localLightGate = extractFunction(source, 'shouldLocalLightBeRuntimeEnabled');
assert(localLightGate.includes('outsideActiveGalleryZone'), 'Local Light zone culling missing');
assert(localLightGate.includes('selectedForEditing'), 'Selected Local Light edit bypass missing');
assert(source.includes('updateGalleryZoneStreamingRuntime(false)'), 'Frame zone update missing');

// B1 profile transition safety remains.
assert(source.includes('initialHardwareScalingLevel: 0.96'), 'High B1 baseline changed');
assert(source.includes('initialHardwareScalingLevel: 1.00'), 'Balanced B1 baseline changed');
assert(source.includes('initialHardwareScalingLevel: 1.18'), 'Safe B1 baseline changed');
assert(source.includes('Math.max(safeCurrentLevel, profile.initialHardwareScalingLevel)'), 'Monotonic downshift guard missing');
assert(source.includes('pauseGalleryAdaptiveQualityMeasurement("asset-work-active", assetWorkState)'), 'Asset-aware FPS pause missing');

// Protected Stage C/D Inspect and path functions remain byte-identical.
const protectedHashes = {
  focusCameraOnObject: '2df1a12cac5f6032ad8e212e78b97d8ce96e2e3690cf8fa94f77d6577f855b76',
  animateViewerFocusPositionPath: '030b26be6ffdf3148341fcd4e7ee547765c88759aec3ac32f46ee66c3fa9cdbf',
  showArtworkInfoPopup: 'a9a1b2a2dc1c54e25403c8607e417edd54c3dc0abea962206faaf9414988dfe6',
  hideArtworkInfoPopup: '743c785216f36e16c58cd7e32018bb9bb760b79eaa6a9a03fd8c3c442d55b3fb',
  openGalleryInspectTarget: 'ba079d23996711e4028f7637e3de3bfef4805fb975f628e6c46bf8bfa53ecbce',
  runGalleryFastStartFinalizationNow: '697bbb0d4f7a3eefd76fff9195c0a7162b9ffcee0f82719f1a3ab147a82d67ab'
};
for (const [name, expected] of Object.entries(protectedHashes)) {
  assert(sha(extractFunction(source, name)) === expected, `Protected function changed: ${name}`);
}


// Stable Inspect navigation geometry: camera travel may lock buttons, but must not remove the mobile row.
const navigationState = extractFunction(source, 'setGalleryInspectNavigationButtonState');
assert(navigationState.includes('var missingTarget = !target;'), 'Missing-target state split missing');
assert(navigationState.includes('var temporarilyLocked = !!target && galleryInspectRuntime.opening;'), 'Transition lock state missing');
assert(navigationState.includes('button.classList.toggle("is-hidden", missingTarget);'), 'Buttons are still hidden during transition');
assert(navigationState.includes('is-transition-locked'), 'Transition-lock class missing');
assert(source.includes('#galleryInspectNavigation.is-visible {\n                min-height: var(--gallery-inspect-navigation-size) !important;'), 'Visible mobile navigation row height is not reserved');
assert(!source.includes('.gallery-inspect-navigation-button.is-hidden,\n            .gallery-inspect-navigation-button:disabled {\n                display: none !important;'), 'Mobile disabled buttons still collapse layout');
assert(source.includes('.gallery-inspect-navigation-button:disabled:not(.is-hidden)'), 'Visible disabled transition style missing');


// Edit Mode button remains interactive after moving into the click-through HUD controls layer.
assert(index.includes('#galleryMobileControlsLayer > #editModeButton'), 'Page-level Edit Mode hit-target rule missing');
assert(index.includes(`pointer-events: auto;
      touch-action: manipulation;`), 'Page-level Edit Mode pointer recovery missing');
assert(source.includes('STAGE 12C65E UI FIX — the button lives inside a HUD layer'), 'Engine Edit Mode pointer fix marker missing');
const floatingButtonCssStart = source.indexOf('.gallery-editor-floating-mode-button {', source.indexOf('.gallery-editor-floating-mode-button {') + 1);
const floatingButtonCss = source.slice(floatingButtonCssStart, floatingButtonCssStart + 900);
assert(floatingButtonCss.includes('pointer-events: auto;'), 'Floating Edit Mode button does not restore pointer events');
assert(floatingButtonCss.includes('touch-action: manipulation;'), 'Floating Edit Mode button touch policy missing');
assert(minified.includes('pointer-events: auto;\\n            touch-action: manipulation;'), 'Minified Edit Mode pointer recovery missing');


// First Local Lights BACK TO EDIT stall fix.
assert(count(source, 'restoredFromState: true') === 2, 'Restored manual lights are not marked explicitly');
const registerLocalLight = extractFunction(source, 'registerLocalLight');
assert(registerLocalLight.includes('options.deferInitialTargetCommit !== false && !options.restoredFromState'), 'Restored lights still enter deferred manual spawn retarget queue');
assert(registerLocalLight.includes('item._localLightNeedsFinalRetarget = false;'), 'Restored pending-retarget flag is not cleared');
const batchCommit = extractFunction(source, 'commitSegmentAwareLocalLightTargetsBatchImmediate');
assert(batchCommit.includes('buildLocalLightSegmentToLightMap(batchReason + "Before")'), 'Batch commit does not build the segment map once');
assert(batchCommit.includes('commitLocalLightFinalTargetGroupImmediate(affectedItems, batchReason'), 'Batch commit does not use one unified final group commit');
assert(batchCommit.includes('scope: "backToEditSegmentAwareBatch"'), 'Back-to-edit batch scope missing');
assert(source.includes(`commitSegmentAwareLocalLightTargetsBatchImmediate(\n                backCommitItems,\n                "backToEditSegmentAwareBatch"`), 'BACK TO EDIT does not call the batch commit');
assert(!source.includes(`backCommitItems.forEach(function (item) {\n            commitSegmentAwareLocalLightTargetsImmediate`), 'BACK TO EDIT still repeats the single-light resolver');
assert(minified.includes('backToEditSegmentAwareBatch'), 'Minified back-to-edit batch missing');
assert(minified.includes('restoredFromState'), 'Minified restored-light guard missing');

// Production/login-disabled exact contract.
assert(count(source, 'var galleryEditorLoginEnabled = true;') === 1, 'Production source login must be enabled exactly once');
assert(count(txt, 'var galleryEditorLoginEnabled = false;') === 1, 'Root TXT login must be disabled exactly once');
const normalizedTxt = txt.replace('var galleryEditorLoginEnabled = false;', 'var galleryEditorLoginEnabled = true;');
assert(normalizedTxt === source, 'Root TXT differs from source beyond login switch');

// Minified production output contains Stage E systems.
assert(minified.includes('12C65E'), 'Minified Stage E identity missing');
assert(minified.includes('BerryboyArtGalleryStreaming'), 'Minified streaming debug API missing');
assert(minified.includes('KhronosTextureContainer2'), 'Minified KTX2 runtime missing');
assert(minified.includes('critical-high-lod-upgrade'), 'Minified low/high LOD upgrade missing');
assert(minified.includes('outsideActiveGalleryZone'), 'Minified zone light gate missing');
assert(!minified.includes('galleryMobileStartupSurvival'), 'Legacy Survival Mode remains in minified build');

console.log('Stage 12C65E verifier passed.');
