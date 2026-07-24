import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const viewer = fs.readFileSync(new URL('../src/bootstrap/gallery-viewer-bootstrap.js', import.meta.url), 'utf8');
const editor = fs.readFileSync(new URL('../src/bootstrap/gallery-editor-bootstrap.js', import.meta.url), 'utf8');

function extractFunction(text, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const marker of markers) {
    start = text.indexOf(marker);
    if (start >= 0) break;
  }
  assert.ok(start >= 0, `Missing function ${name}`);
  const brace = text.indexOf('{', start);
  let depth = 0;
  let state = 'code';
  let quote = null;
  for (let i = brace; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1] || '';
    if (state === 'code') {
      if (char === '"' || char === "'" || char === '`') { state = 'string'; quote = char; }
      else if (char === '/' && next === '/') { state = 'line'; i += 1; }
      else if (char === '/' && next === '*') { state = 'block'; i += 1; }
      else if (char === '{') depth += 1;
      else if (char === '}') { depth -= 1; if (depth === 0) return text.slice(start, i + 1); }
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

function sha(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// Accepted post-load instructional popup is protected byte-for-byte.
assert.equal(sha(extractFunction(source, 'createViewerIntroOverlayStyles')), '93595efee4b7f720f32b5a8b739f6212bcea793ed8bdc88e939ea243b74262d6');
assert.equal(sha(extractFunction(source, 'showViewerIntroOverlay')), 'fb4b8f6a0b72653489b10564492ffad9f52ba461bf67cb1992bd21e655aaf537');
assert.ok(viewer.includes('gallery-instruction-popup-confirmed'));
assert.ok(viewer.includes('instruction-popup-missing'));

// Desktop mouse-only movement.
assert.ok(source.includes('galleryDesktopDpad.id = "galleryDesktopDpad"'));
for (const direction of ['forward', 'backward', 'turnLeft', 'turnRight']) {
  assert.ok(source.includes(`galleryDesktopDpadState.${direction}`), `Missing ${direction} D-pad state`);
}
assert.ok(source.includes('button.setPointerCapture(event.pointerId)'));
assert.ok(source.includes('button.addEventListener("pointercancel"'));
assert.ok(source.includes('button.addEventListener("lostpointercapture"'));
assert.ok(source.includes('registerGalleryDomEvent("galleryDesktopDpadWindowBlur"'));
assert.ok(source.includes('registerGalleryDomEvent("galleryDesktopDpadVisibility"'));

// Stage 12C66C4 procedural floor marker: first-visible floor pick, one SDF plane and shared pulse.
const floorPick = extractFunction(source, 'pickGalleryFloorFromPointer');
assert.ok(floorPick.includes('floorMeshes.indexOf(visiblePick.pickedMesh) === -1'));
assert.ok(floorPick.includes('scene.pick(x, y, null, false, camera)'), 'Floor cursor must respect the first visible occluder');
const indicatorConfig = extractFunction(source, 'configureGalleryFloorIndicatorMesh');
assert.ok(indicatorConfig.includes('mesh.isPickable = false'));
assert.ok(indicatorConfig.includes('mesh.checkCollisions = false'));
assert.ok(indicatorConfig.includes('mesh.renderOutline = false'));
assert.ok(indicatorConfig.includes('mesh.renderingGroupId = 3'));
assert.ok(source.includes('GalleryFloorCursorSdfPlane'));
assert.ok(source.includes('new BABYLON.ShaderMaterial'));
assert.ok(source.includes('float softRing(float radius, float halfWidth, float softness)'));
assert.ok(source.includes('smoothstep(halfWidth - softness, halfWidth + softness, radial)'));
assert.ok(source.includes('pulseProgress'));
assert.equal(source.includes('GalleryFloorCursorPulseRing'), false, 'Old separate pulse torus remains');
assert.equal(extractFunction(source, 'getOrCreateGalleryFloorCursorRing').includes('CreateTorus'), false, 'Marker is still geometric torus');
assert.ok(extractFunction(source, 'getOrCreateGalleryFloorCursorRing').includes('CreatePlane'));
assert.ok(source.includes('ignoreLocalLightTargeting: true'));

// Execute shader-store creation and inspect the actual fragment program.
const shaderContext = { BABYLON: { Effect: { ShadersStore: {} } } };
vm.createContext(shaderContext);
vm.runInContext(extractFunction(source, 'ensureGalleryFloorCursorShaderStore'), shaderContext);
shaderContext.ensureGalleryFloorCursorShaderStore();
const fragment = shaderContext.BABYLON.Effect.ShadersStore.galleryFloorCursorFragmentShader;
assert.ok(fragment.includes('softRing'));
assert.ok(fragment.includes('smoothstep'));
assert.ok(fragment.includes('darkHalo'));
assert.ok(fragment.includes('pulseRadius'));

// D-pad remains clear of Edit Mode and has complete pointer cancellation.
assert.ok(source.includes('body.is-editor-authenticated:not(.gallery-edit-mode-active) #galleryDesktopDpad'));
assert.ok(source.includes('right: calc(var(--gallery-editor-screen-gap, 30px) + 196px)'));
assert.ok(source.includes('button.setPointerCapture(event.pointerId)'));
assert.ok(source.includes('button.addEventListener("pointercancel"'));
assert.ok(source.includes('button.addEventListener("lostpointercapture"'));

// Mobile long-hold safety, no native Babylon touch input and hard grounded Viewer movement.
assert.ok(source.includes('touch-action: none'));
assert.ok(source.includes('-webkit-touch-callout: none'));
assert.ok(source.includes('overscroll-behavior: none'));
assert.ok(source.includes('mobileCanvasHoldDelayMs = 360'));
assert.ok(source.includes('mobileCanvasGestureMode = "move"'));
assert.ok(source.includes('mobileCanvasMoveActive = true'));
assert.ok(source.includes('mobileCanvasPointerCancelSafety'));
assert.ok(source.includes('mobileCanvasLostPointerCaptureSafety'));
assert.ok(source.includes('mobileNavigationWindowBlurSafety'));
assert.ok(source.includes('mobileNavigationPageHideSafety'));
assert.ok(source.includes('mobileNavigationVisibilitySafety'));
const touchDisable = extractFunction(source, 'disableGalleryBuiltInTouchCameraMovement');
assert.ok(touchDisable.includes('camera.inputs.removeByType("FreeCameraTouchInput")'));
const attachControl = extractFunction(source, 'attachGalleryCameraControl');
assert.ok(attachControl.includes('disableGalleryBuiltInTouchCameraMovement()'));
assert.ok(attachControl.includes('isGalleryTouchCapableDevice()'));
const mobileRefresh = extractFunction(source, 'refreshMobileViewerMode');
assert.ok(mobileRefresh.includes('disableGalleryBuiltInTouchCameraMovement()'));
assert.ok(mobileRefresh.includes('isGalleryTouchCapableDevice()'));
const grounded = extractFunction(source, 'enforceMobileViewerGroundedWalkHeight');
assert.ok(grounded.includes('getGalleryDefaultWalkCameraY()'));
assert.ok(grounded.includes('camera.position.y = Number(walkY)'));
assert.ok(grounded.includes('clearGalleryBuiltInCameraMotionResidue()'));

// Execute the central camera attach guard in mobile, touch-desktop and Edit contexts.
const cameraControlContext = {
  mobileViewerEnabled: true,
  editMode: false,
  canvas: {},
  attached: 0,
  detached: 0,
  keyboardDisabled: 0,
  touchDisabled: 0,
  residueCleared: 0,
  pointerConfigured: 0,
  camera: {
    attachControl() { cameraControlContext.attached += 1; },
    detachControl() { cameraControlContext.detached += 1; }
  },
  disableGalleryBuiltInKeyboardCameraMovement() { cameraControlContext.keyboardDisabled += 1; },
  disableGalleryBuiltInTouchCameraMovement() { cameraControlContext.touchDisabled += 1; },
  clearGalleryBuiltInCameraMotionResidue() { cameraControlContext.residueCleared += 1; },
  configureCameraPointerButtons() { cameraControlContext.pointerConfigured += 1; },
  isGalleryTouchCapableDevice() { return true; }
};
vm.createContext(cameraControlContext);
vm.runInContext(extractFunction(source, 'attachGalleryCameraControl'), cameraControlContext);
assert.equal(cameraControlContext.attachGalleryCameraControl(), false);
assert.equal(cameraControlContext.detached, 1);
assert.equal(cameraControlContext.touchDisabled, 1);
cameraControlContext.mobileViewerEnabled = false;
cameraControlContext.editMode = false;
assert.equal(cameraControlContext.attachGalleryCameraControl(), true);
assert.equal(cameraControlContext.attached, 1);
assert.equal(cameraControlContext.touchDisabled, 2, 'Touch-capable desktop layout restored native touch input');
cameraControlContext.editMode = true;
assert.equal(cameraControlContext.attachGalleryCameraControl(), true);
assert.equal(cameraControlContext.attached, 2);

// Execute the grounded-height invariant without affecting Inspect/focus previews.
const groundContext = {
  Math, Number, isFinite,
  editMode: false,
  inspectOwned: false,
  residueCleared: 0,
  camera: { position: { y: 6.5 }, rotation: { z: 0.4 } },
  galleryFocusPreviewRuntime: { active: false },
  isMobileViewerActive() { return true; },
  isGalleryInspectCameraOwnedByInspect() { return groundContext.inspectOwned; },
  getGalleryDefaultWalkCameraY() { return -2.2; },
  clearGalleryBuiltInCameraMotionResidue() { groundContext.residueCleared += 1; }
};
vm.createContext(groundContext);
vm.runInContext([
  extractFunction(source, 'shouldEnforceMobileViewerGroundedWalkHeight'),
  extractFunction(source, 'enforceMobileViewerGroundedWalkHeight')
].join('\n\n'), groundContext);
assert.equal(groundContext.enforceMobileViewerGroundedWalkHeight(), true);
assert.equal(groundContext.camera.position.y, -2.2);
assert.equal(groundContext.camera.rotation.z, 0);
groundContext.inspectOwned = true;
groundContext.camera.position.y = 4.25;
assert.equal(groundContext.enforceMobileViewerGroundedWalkHeight(), false);
assert.equal(groundContext.camera.position.y, 4.25);

// TRANSITION is a central camera-ownership lock, including capture-phase desktop mouse look.
assert.ok(source.includes('function isGalleryInspectTransitionInteractionLocked()'));
const beginLook = extractFunction(source, 'beginDesktopViewerMiddleLook');
assert.ok(beginLook.indexOf('isGalleryInspectTransitionInteractionLocked()') < beginLook.indexOf('closeGalleryInspect("desktop-manual-look")'));
const updateLook = extractFunction(source, 'updateDesktopViewerMiddleLook');
assert.ok(updateLook.includes('isGalleryInspectTransitionInteractionLocked()'));
const closeInspect = extractFunction(source, 'closeGalleryInspect');
assert.ok(closeInspect.includes('isGalleryInspectTransitionInteractionLocked() && !isGalleryInspectSystemCloseReason(reason)'));
const viewerMove = extractFunction(source, 'updateViewerWASDMovement');
assert.ok(viewerMove.includes('clearGalleryInspectTransitionInput();\n            return;'));
const editMove = extractFunction(source, 'updateEditModeMovementFrame');
assert.ok(editMove.includes('clearGalleryInspectTransitionInput();\n            return;'));

// Execute the locked close path: user input is rejected before camera/runtime mutation.
const closeContext = {
  cleared: 0,
  galleryInspectRuntime: { opening: true },
  isGalleryInspectTransitionInteractionLocked() { return true; },
  isGalleryInspectSystemCloseReason() { return false; },
  clearGalleryInspectTransitionInput() { closeContext.cleared += 1; }
};
vm.createContext(closeContext);
vm.runInContext(extractFunction(source, 'closeGalleryInspect'), closeContext);
assert.equal(closeContext.closeGalleryInspect('desktop-manual-look'), false);
assert.equal(closeContext.cleared, 1);

// Four-tab editor and a single, moved Save button.
for (const tab of ['EXHIBITS', 'SPACE', 'LIGHTING', 'SETTINGS']) {
  assert.ok(source.includes(`label: "${tab}"`), `Missing ${tab} tab`);
}
assert.ok(source.includes('galleryEditorSaveBar.appendChild(sharedSaveStateButton)'));
assert.ok(source.includes('editHelpPanel.insertBefore(galleryEditorPrimaryTabs, editorScroll)'), 'Primary tabs must remain outside both scroll modes');
assert.equal(source.includes('editorHeader.insertAdjacentElement("afterend", galleryEditorPrimaryTabs)'), false, 'Primary tabs would disappear in Lighting mode');
assert.equal(source.includes('customLoadingScreen'), false, 'Dead duplicate loading screen remains');
assert.equal(source.includes('customLoaderStyle'), false, 'Dead duplicate loader style remains');
assert.equal(source.includes('galleryLoaderStatus'), false, 'Dead technical loader status remains');
assert.equal(source.includes('editorMenuButton'), false, 'Old editor menu path remains');
assert.equal(source.includes('lightingQuickButton'), false, 'Old quick-lighting path remains');
assert.equal((source.match(/id = "saveStateButton"/g) || []).length, 0, 'Engine must move the existing header Save, not create a duplicate id');
assert.ok(index.includes('id="saveStateButton"'));
assert.ok(index.includes('#siteHeader #saveStateButton { display: none !important; }'));
assert.ok(editor.includes('button.dataset.saveState = state'));
assert.ok(editor.includes('runtimeContext.t("allSaved")'));
assert.ok(editor.includes('runtimeContext.t("saveError")'));
assert.equal(source.includes('Ctrl + S'), false);

// Dirty-state warnings and event-driven checks.
assert.ok(source.includes('confirmGalleryDiscardUnsavedChanges'));
assert.ok(source.includes('galleryUnsavedBeforeUnload'));
assert.ok(source.includes('scheduleGalleryEditorControlDraftCheck'));
assert.ok(source.includes('editor-control-button'), 'Editor buttons are not covered by event-first dirty-state checking');
assert.ok(editor.includes('confirmDiscardUnsavedChanges("Logging out")'));

// Sculpture proxy is connected to the custom sweep/slide resolver, not only native collisions.
assert.equal((source.match(/function refreshSculptureCollisionProxy\(/g) || []).length, 1);
const proxy = extractFunction(source, 'refreshSculptureCollisionProxy');
assert.ok(proxy.includes('sculptureCollisionBoundsCache'));
assert.ok(proxy.includes('getSculptureFloorYAtSlot'));
assert.ok(proxy.includes('includesPedestalFootprint'));
const streamingSuspend = extractFunction(source, 'suspendModel3dForStreaming');
assert.equal(streamingSuspend.includes('disableSculptureCollisionProxy(slot)'), false);
assert.ok(streamingSuspend.includes('applySculptureSlotVisualState(slot)'));
const collisionMode = extractFunction(source, 'isViewerCollisionActive');
assert.ok(collisionMode.includes('!editMode || !(editMoveKeys && editMoveKeys.space)'));
assert.ok(extractFunction(source, 'updateEditModeMovementFrame').includes('moveCameraWithViewerCollisionIfActive(editMoveDelta)'));
assert.ok(source.includes('function isViewerSculptureHitBetweenPositions('));
assert.ok(source.includes('function isViewerSculptureTooCloseAtPosition('));
const obstacle = extractFunction(source, 'isViewerObstacleHitBetweenPositions');
assert.ok(obstacle.includes('isViewerWallHitBetweenPositions'));
assert.ok(obstacle.includes('isViewerSculptureHitBetweenPositions'));
const resolver = extractFunction(source, 'resolveViewerWallCollisionAfterMovement');
assert.ok(resolver.includes('isViewerCustomBlockActive()'));
assert.ok(resolver.includes('isViewerCameraPositionSafeAgainstWalls(slideX)'));
assert.ok(resolver.includes('isViewerCameraPositionSafeAgainstWalls(slideZ)'));

// Execute sculpture sweep logic: crossing is blocked; moving out of a restored overlap is allowed.
const collisionContext = {
  Math,
  viewerCollisionRadius: 0.34,
  isViewerSculptureBlockActive() { return true; },
  getViewerSculptureCollisionProxies() { return [{}]; },
  getViewerSculptureProxyBounds() {
    return { minimum: { x: -1, z: -1 }, maximum: { x: 1, z: 1 } };
  }
};
vm.createContext(collisionContext);
vm.runInContext([
  extractFunction(source, 'galleryExhibitSegmentIntersectsExpandedAabb2D'),
  extractFunction(source, 'isViewerSculptureHitBetweenPositions')
].join('\n\n'), collisionContext);
assert.equal(collisionContext.isViewerSculptureHitBetweenPositions({ x: -3, z: 0 }, { x: 3, z: 0 }), true, 'Crossing sculpture proxy was not blocked');
assert.equal(collisionContext.isViewerSculptureHitBetweenPositions({ x: 0, z: 0 }, { x: 2, z: 0 }), false, 'Camera cannot escape a restored overlap');
assert.equal(collisionContext.isViewerSculptureHitBetweenPositions({ x: 0.8, z: 0 }, { x: 0, z: 0 }), true, 'Movement deeper into sculpture proxy was not blocked');

// Persistent Local Lights no longer react to camera/frustum/zone visibility.
assert.ok(source.includes('function applyLocalLightUserState(item)'));
for (const removed of ['localLightCameraCullingEnabled', 'updateLocalLightsCameraCulling', 'runtimeTargetIntensity', 'markLocalLightCameraCullingDirty']) {
  assert.equal(source.includes(removed), false, `Obsolete Local Light culling remains: ${removed}`);
}

// Cross-tab ownership is conservative and duplicated tabs receive a fresh page instance id.
assert.ok(source.includes('function createGalleryEditorPageInstanceId()'));
assert.equal(source.includes('sessionStorage.getItem(key)'), false);
assert.ok(source.includes('ownerTabId: gallerySaveIntegrityRuntime.tabId'));
assert.ok(source.includes('foreignDraftGraceMs: 24 * 60 * 60 * 1000'));
assert.ok(source.includes('backgroundTabGraceMs: 24 * 60 * 60 * 1000'));
assert.ok(source.includes('galleryCrossTabVisibilityHeartbeat'));
assert.equal(source.includes('galleryCrossTabBeforeUnloadHeartbeat'), false);

// Execute cross-tab protection logic for live, hidden and stale owners.
const storage = new Map();
const runtime = {
  tabId: 'tab-current',
  activeTabsStorageKey: 'active-tabs',
  heartbeatStaleMs: 120000,
  backgroundTabGraceMs: 86400000,
  foreignDraftGraceMs: 86400000
};
const context = {
  Date,
  JSON,
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); }
  },
  gallerySaveIntegrityRuntime: runtime
};
vm.createContext(context);
vm.runInContext([
  extractFunction(source, 'readGalleryActiveEditorTabs'),
  extractFunction(source, 'pruneGalleryActiveEditorTabs'),
  extractFunction(source, 'isGalleryEditorTabActive'),
  extractFunction(source, 'isGalleryForeignQueueEntryProtected')
].join('\n\n'), context);

storage.set('active-tabs', JSON.stringify({
  'tab-other': { lastSeenAt: Date.now(), visibility: 'visible' },
  'tab-hidden': { lastSeenAt: Date.now() - 10 * 60 * 1000, visibility: 'hidden' }
}));
assert.equal(context.isGalleryForeignQueueEntryProtected({ ownerTabId: 'tab-other', uploadedAt: Date.now() - 99999999 }), true);
assert.equal(context.isGalleryForeignQueueEntryProtected({ ownerTabId: 'tab-hidden', uploadedAt: Date.now() - 99999999 }), true);
const prunedRegistry = context.pruneGalleryActiveEditorTabs(JSON.parse(storage.get('active-tabs')), Date.now());
assert.ok(prunedRegistry['tab-hidden'], 'A throttled hidden editor tab must retain its 24-hour grace window');
assert.equal(context.isGalleryForeignQueueEntryProtected({ ownerTabId: 'tab-stale', uploadedAt: Date.now() - 60 * 60 * 1000 }), true, 'Fresh orphan grace should protect a closed foreign tab');
assert.equal(context.isGalleryForeignQueueEntryProtected({ ownerTabId: 'tab-stale', uploadedAt: Date.now() - 2 * 86400000 }), false, 'Old inactive foreign draft should eventually become cleanable');

// Public visitor does not see implementation versions.
assert.equal(index.includes('Gallery_V0_11 · Stage'), false);
assert.equal((index.match(/<span>Berryboy Art Gallery<\/span>/g) || []).length, 1, 'Public footer must contain one non-technical label');

console.log('Stage 12C66C4 systemic stabilization tests passed.');
