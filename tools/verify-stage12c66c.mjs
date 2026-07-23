import fs from 'node:fs';
import crypto from 'node:crypto';

const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
const minified = fs.readFileSync(new URL('../src/Gallery_V0_11.min.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bootstrap = fs.readFileSync(new URL('../src/bootstrap/gallery-viewer-bootstrap.js', import.meta.url), 'utf8');
const editorBootstrap = fs.readFileSync(new URL('../src/bootstrap/gallery-editor-bootstrap.js', import.meta.url), 'utf8');
const txt = fs.readFileSync(new URL('../Gallery_V0_11_STAGE12C66C_ETAP3_LOGIN_DISABLED.txt', import.meta.url), 'utf8');

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
assert(!index.includes('Gallery_V0_11 · Stage'), 'Technical Stage label is visible in the public footer');
assert(index.includes('stage: "12C66C"'), 'Boot Guard Stage 12C66C identity missing');
assert(source.includes('Stage 12C66C: Desktop D-pad / Floor Cursor / Mobile Hold Movement / Tabbed Edit Workflow / Sticky Save / Sculpture Collision Repair'), 'Stage 12C66C source history missing');
assert(source.includes('stage: "12C65E"'), 'Protected Stage 12C65E streaming runtime identity missing');
assert(source.includes('stage: "12C66C"'), 'Stage 12C66C save-integrity runtime identity missing');
assert(bootstrap.includes('Stage 12C66C'), 'Viewer bootstrap Stage 12C66C label missing');
assert(bootstrap.includes('stage12c66c_etap3_20260723'), 'Stage 12C66C engine cache key missing');
assert(index.includes('gallery-viewer-bootstrap.js?v=stage12c66c_etap3_20260723'), 'Page bootstrap Stage 12C66C cache key missing');
assert(bootstrap.includes('const STAGE = "12C66C"'), 'Viewer runtime Stage 12C66C identity missing');
assert(editorBootstrap.includes('Stage 12C66C'), 'Editor bootstrap Stage 12C66C label missing');
assert(!bootstrap.includes('stage12c66b1'), 'Rejected Stage B1 cache key remains');
assert(!bootstrap.includes('stage12c65d'), 'Old Stage D cache key remains');

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
assert(minified.includes('pointer-events: auto;'), 'Production mirror Edit Mode pointer recovery missing');


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

// Stage 12C66A1 grounded Viewer keyboard contract.
const attachCameraControl = extractFunction(source, 'attachGalleryCameraControl');
const disableBuiltInKeyboard = extractFunction(source, 'disableGalleryBuiltInKeyboardCameraMovement');
assert(source.includes('Stage 12C66A1: Viewer Grounded Keyboard Hotfix'), 'Stage 12C66A1 source history missing');
assert(attachCameraControl.includes('disableGalleryBuiltInKeyboardCameraMovement();'), 'Camera reattach does not disable the Babylon keyboard input');
assert(disableBuiltInKeyboard.includes('camera.inputs.removeByType("FreeCameraKeyboardMoveInput")'), 'Default Babylon FreeCamera keyboard input is not removed');
assert(disableBuiltInKeyboard.includes('"keysUp"'), 'Arrow-up fallback mapping is not cleared');
assert(disableBuiltInKeyboard.includes('"keysDown"'), 'Arrow-down fallback mapping is not cleared');
assert(disableBuiltInKeyboard.includes('"keysLeft"'), 'Arrow-left fallback mapping is not cleared');
assert(disableBuiltInKeyboard.includes('"keysRight"'), 'Arrow-right fallback mapping is not cleared');
assert(source.includes('if (!editMode && isArrowKey)'), 'Viewer arrow-key browser guard missing');
assert(!bootstrap.includes('stage12c66a_save_integrity_20260723'), 'Old Stage 12C66A engine cache key remains');
assert(!index.includes('gallery-viewer-bootstrap.js?v=stage12c66a_save_integrity_20260723'), 'Old Stage 12C66A page cache key remains');

// Stage 12C66C save-integrity repair contract.
assert(source.includes('var gallerySaveIntegrityRuntime = {'), 'Save integrity runtime missing');
assert(source.includes('schema: "gallery-save-integrity.v3"'), 'Save integrity v3 schema missing');
assert(source.includes('pendingStorageDeletes: []'), 'Deferred Storage cleanup queue missing');
assert(source.includes('pendingDraftUploads: []'), 'Draft upload registry missing');
assert(source.includes('pendingDraftUploadStorageKey: "berryboy_gallery_pending_draft_uploads_v1"'), 'Draft upload persistence key missing');
assert(source.includes('function registerGalleryPendingDraftUpload(bucketName, path, kind)'), 'Draft upload registration missing');
assert(source.includes('function reconcileGalleryPendingDraftUploads(publishedState, options)'), 'Draft upload reconciliation missing');
assert(source.includes('function processGalleryDeferredStorageCleanup(savedState, previousBackupState)'), 'Previous-backup-aware cleanup missing');
const cleanupFunction = extractFunction(source, 'processGalleryDeferredStorageCleanup');
assert(cleanupFunction.includes('previousBackupReferences'), 'Cleanup does not inspect previous backup references');
assert(cleanupFunction.includes('protectedByPreviousBackup'), 'Previous backup asset protection missing');
assert(source.includes('processGalleryDeferredStorageCleanup(state, currentServerState)'), 'Save does not protect the state copied to main_previous');
assert(source.includes('function setGalleryPublishedStateBaseline(runtimeState, options)'), 'Published baseline controller missing');
assert(source.includes('function createGalleryCanonicalFingerprintValue(value)'), 'Canonical JSONB-safe fingerprint normalization missing');
assert(source.includes('stateCheckIntervalMs: 5000'), 'Dirty-state fallback interval was not reduced');
assert(source.includes('draft-watch-fallback'), 'Event-first dirty-state fallback missing');
assert(source.includes('function writeGalleryRemotePreviousStateBackup(client, previousState)'), 'Remote previous-state backup missing');
const backupFunction = extractFunction(source, 'writeGalleryRemotePreviousStateBackup');
assert(!backupFunction.includes('.upsert('), 'Remote backup still assumes an onConflict upsert constraint');
assert(backupFunction.includes('.select("id, updated_at")'), 'Remote backup existence check missing');
assert(backupFunction.includes('.update({'), 'Remote backup update path missing');
assert(backupFunction.includes('.insert(backupPayload)'), 'Remote backup insert path missing');
assert(source.includes('localBackupStorageKey: "berryboy_gallery_previous_state_backup_v1"'), 'Local previous-state backup missing');
assert(source.includes('remoteBackupId: "main_previous"'), 'Remote previous-state row id missing');
assert(source.includes('reason: "revision-conflict"'), 'Concurrent revision conflict guard missing');
assert(source.includes('reason: "server-row-presence-conflict"'), 'Server row create/delete conflict guard missing');
assert(source.includes('reason: "pre-save-read-error"'), 'Pre-save server-read failure guard missing');
assert(source.includes('reason: "atomic-commit-conflict"'), 'Atomic commit race guard missing');
assert(count(source, 'saveGalleryStateToSupabase()') === 1, 'Automatic save call remains outside the explicit Save function');
assert(!source.includes('.delete()'), 'Dangerous delete fallback remains');
assert(!extractFunction(source, 'saveGalleryStateToSupabase').includes('.upsert(payload'), 'Main save still uses an unconditional upsert');
assert(count(source, '.storage.from(bucket).remove(paths)') === 1, 'Storage removal must exist only in post-save cleanup');
assert(count(source, 'registerGalleryPendingDraftUpload(') >= 6, 'Not all Storage upload paths are registered as draft uploads');
assert(source.includes('validateGalleryImageUploadFile(file, "artwork")'), 'Artwork upload limits missing');
assert(count(source, 'validateGalleryImageUploadFile(file, "author")') === 2, 'Author upload limits missing');
assert(source.includes('maxPixels: 40000000'), 'Artwork pixel budget missing');
assert(source.includes('maxPixels: 24000000'), 'Author-photo pixel budget missing');

// Correct click-start / original popup contract.
assert(!/<script[^>]+src=["']https:\/\/cdn\.babylonjs\.com\/babylon\.js/.test(index), 'Babylon still starts from a static script');
assert(!bootstrap.includes('import { createScene }'), 'Gallery engine is still statically imported');
assert(bootstrap.includes('await bootGuard.waitForStart();'), 'Explicit start wait missing');
assert(bootstrap.includes('loadClassicScript("https://cdn.babylonjs.com/babylon.js"'), 'Deferred Babylon loader missing');
assert(bootstrap.includes('window.addEventListener("gallery-interaction-ready"'), 'Bootstrap does not wait for true interaction readiness');
assert(source.includes('window.dispatchEvent(new CustomEvent("gallery-interaction-ready"'), 'Engine interaction-ready event missing');
assert(!extractFunction(source, 'finishGalleryStartup').includes('showViewerIntroOverlay'), 'Original popup is still opened before true readiness');
assert(bootstrap.includes('window.GalleryApp.showViewerIntroOverlay();'), 'Original popup is not opened after true readiness');
assert(sha(extractFunction(source, 'createViewerIntroOverlayStyles')) === '93595efee4b7f720f32b5a8b739f6212bcea793ed8bdc88e939ea243b74262d6', 'Accepted intro CSS changed');
assert(sha(extractFunction(source, 'showViewerIntroOverlay')) === 'fb4b8f6a0b72653489b10564492ffad9f52ba461bf67cb1992bd21e655aaf537', 'Accepted intro HTML/behavior changed');
assert(index.includes('id="galleryBootStart"'), 'Prestart entry button missing');
assert(index.includes('id="galleryBootTimefiller"'), 'Visitor timefiller missing');
assert(!index.includes('id="galleryBootControls"'), 'Duplicate startup instructions returned');
assert(index.includes('id="galleryBootAbout"'), 'Accepted Stage 12C66B prestart About-project action is missing');
assert(!index.includes('id="galleryBootEnter"'), 'Duplicate ready-stage entry action returned');
assert(index.includes('radial-gradient(circle at 50% 34%, rgba(111, 65, 75, 0.24), transparent 43%)'), 'Accepted Stage 12C66B prestart background changed');
assert(index.includes('width: min(560px, 100%);'), 'Accepted Stage 12C66B prestart card width changed');
assert(index.includes('.galleryBootBrand::before'), 'Accepted Stage 12C66B prestart brand marker changed');
assert(!source.includes('loadingScreen.style.display = "flex";'), 'Technical engine loader can still become public');
assert(source.includes('window.dispatchEvent(new CustomEvent("gallery-startup-failure"'), 'Friendly startup failure bridge missing');
const notifyStatus = extractFunction(source, 'notifyGalleryStatus');
assert(notifyStatus.includes('options.audience || "editor"'), 'Technical status does not default to editor audience');
assert(bootstrap.includes('window.GalleryApp.isEditModeActive()'), 'Editor messages are not restricted to active Edit Mode');
assert(!index.includes('error.stack'), 'Public BootGuard still renders stack traces');
assert(count(index, '<span>Berryboy Art Gallery</span>') === 1, 'Public footer contains a duplicate or technical Stage label');

// Stage 12C66C input, editor workflow and collision contract.
assert(source.includes('id = "galleryDesktopDpad"') || source.includes('galleryDesktopDpad.id = "galleryDesktopDpad"'), 'Desktop D-pad DOM missing');
assert(source.includes('data-direction="forward"') || source.includes('dataset.direction = definition.key'), 'D-pad direction mapping missing');
assert(source.includes('galleryDesktopDpadState.forward'), 'D-pad forward state missing');
assert(source.includes('galleryDesktopDpadState.backward'), 'D-pad backward state missing');
assert(source.includes('galleryDesktopDpadState.turnLeft'), 'D-pad left turn state missing');
assert(source.includes('galleryDesktopDpadState.turnRight'), 'D-pad right turn state missing');
assert(source.includes('pointercancel'), 'Pointer cancellation safety missing');
assert(source.includes('lostpointercapture'), 'Lost pointer capture safety missing');
assert(source.includes('GalleryFloorCursorRing'), 'Floor cursor ring missing');
const floorCursor = extractFunction(source, 'updateGalleryFloorCursorRingFromPointer');
assert(floorCursor.includes('floorMeshes.indexOf(mesh) !== -1'), 'Floor cursor can target non-floor meshes');
assert(source.includes('mobileCanvasGestureMode = "move"'), 'Mobile hold movement mode missing');
assert(source.includes('mobileCanvasHoldDelayMs = 360'), 'Mobile hold threshold missing');
assert(source.includes('mobileCanvasMoveVector'), 'Mobile hold movement vector missing');
assert(index.includes('#siteHeader #saveStateButton { display: none !important; }'), 'Header Save can flash before Edit Mode');
assert(source.includes('gallery-editor-primary-tabs'), 'Primary Edit Mode tabs missing');
assert(source.includes('{ key: "exhibits", label: "EXHIBITS" }'), 'Exhibits tab missing');
assert(source.includes('{ key: "space", label: "SPACE" }'), 'Space tab missing');
assert(source.includes('{ key: "lighting", label: "LIGHTING" }'), 'Lighting tab missing');
assert(source.includes('{ key: "settings", label: "SETTINGS" }'), 'Settings tab missing');
assert(source.includes('gallery-editor-save-bar'), 'Sticky Edit Mode save bar missing');
assert(source.includes('galleryEditorSaveBar.appendChild(sharedSaveStateButton)'), 'Existing Save button is not moved into Edit Mode');
assert(source.includes('editHelpPanel.insertBefore(galleryEditorPrimaryTabs, editorScroll)'), 'Primary tabs are not persistent across Edit and Lighting modes');
assert(!source.includes('editorHeader.insertAdjacentElement("afterend", galleryEditorPrimaryTabs)'), 'Primary tabs are still trapped inside the hidden edit scroller');
assert(!source.includes('customLoadingScreen'), 'Dead duplicate loading screen remains');
assert(!source.includes('customLoaderStyle'), 'Dead duplicate loading-screen CSS remains');
assert(!source.includes('galleryLoaderStatus'), 'Dead technical loader status remains');
assert(!source.includes('editorMenuButton'), 'Old editor-menu parallel path remains');
assert(!source.includes('lightingQuickButton'), 'Old quick-lighting parallel path remains');
assert(!source.includes('Ctrl + S'), 'Ctrl+S was added despite the agreed UI-only save flow');
assert(source.includes('confirmGalleryDiscardUnsavedChanges'), 'Unsaved-change confirmation missing');
assert(source.includes('galleryUnsavedBeforeUnload'), 'Unload warning missing');
assert(source.includes('editor-control-button'), 'Editor button changes still rely only on the periodic dirty-state scan');
const collisionActive = extractFunction(source, 'isViewerCollisionActive');
assert(collisionActive.includes('!editMode || !(editMoveKeys && editMoveKeys.space)'), 'Normal Edit walking does not use collisions');
const editMovement = extractFunction(source, 'updateEditModeMovementFrame');
assert(editMovement.includes('moveCameraWithViewerCollisionIfActive(editMoveDelta)'), 'Edit movement bypasses the common collision path');
const sculptureProxy = extractFunction(source, 'refreshSculptureCollisionProxy');
assert(sculptureProxy.includes('sculptureCollisionBoundsCache'), 'Sculpture collision bounds cache missing');
assert(sculptureProxy.includes('getSculptureFloorYAtSlot'), 'Sculpture collider does not include floor/pedestal footprint');
assert(sculptureProxy.includes('isViewerCollisionActive()'), 'Sculpture proxy collision mode is not synchronized');
assert(!extractFunction(source, 'suspendModel3dForStreaming').includes('disableSculptureCollisionProxy(slot)'), 'Streaming still disables sculpture collision');
assert(source.includes('ownerTabId: gallerySaveIntegrityRuntime.tabId'), 'Cross-tab draft ownership missing');
assert(source.includes('backgroundTabGraceMs'), 'Background-tab draft protection missing');
assert(extractFunction(source, 'pruneGalleryActiveEditorTabs').includes('backgroundTabGraceMs'), 'Hidden editor tabs are pruned before their grace window');
assert(source.includes('galleryCrossTabVisibilityHeartbeat'), 'Visibility heartbeat missing');
assert(!source.includes('galleryCrossTabBeforeUnloadHeartbeat'), 'Unsafe beforeunload heartbeat removal remains');
assert(bootstrap.includes('gallery-instruction-popup-confirmed'), 'Instruction popup runtime confirmation event missing');
assert(bootstrap.includes('instruction-popup-missing'), 'Missing-popup recovery guard missing');
assert(sha(extractFunction(source, 'createViewerIntroOverlayStyles')) === '93595efee4b7f720f32b5a8b739f6212bcea793ed8bdc88e939ea243b74262d6', 'Accepted intro CSS changed during Stage 3');
assert(sha(extractFunction(source, 'showViewerIntroOverlay')) === 'fb4b8f6a0b72653489b10564492ffad9f52ba461bf67cb1992bd21e655aaf537', 'Accepted intro behavior changed during Stage 3');

// Production/login-disabled exact contract.
assert(count(source, 'var galleryEditorLoginEnabled = true;') === 1, 'Production source login must be enabled exactly once');
assert(count(txt, 'var galleryEditorLoginEnabled = false;') === 1, 'Root TXT login must be disabled exactly once');
const normalizedTxt = txt.replace('var galleryEditorLoginEnabled = false;', 'var galleryEditorLoginEnabled = true;');
assert(normalizedTxt === source, 'Root TXT differs from source beyond login switch');

// Real production minification must be generated and retain critical contracts.
assert(sha(minified) !== sha(source), 'Production file is still a byte-identical source mirror');
assert(minified.length < source.length * 0.85, 'Production file is not materially smaller than source');
assert(minified.includes('12C66C'), 'Production Stage 12C66C identity missing');
assert(minified.includes('BerryboyArtGallerySaveIntegrity'), 'Production save-integrity API missing');
assert(minified.includes('BerryboyArtGalleryStreaming'), 'Production streaming API missing');
assert(minified.includes('KhronosTextureContainer2'), 'Production KTX2 runtime missing');
assert(!minified.includes('galleryMobileStartupSurvival'), 'Legacy Survival Mode remains in production build');

console.log('Stage 12C66C verifier passed.');

