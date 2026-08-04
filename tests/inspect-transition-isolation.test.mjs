import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../src/gallery-engine.js', import.meta.url), 'utf8');

function extractFunction(text, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const marker of markers) { start = text.indexOf(marker); if (start >= 0) break; }
  assert.ok(start >= 0, `Missing function ${name}`);
  const brace = text.indexOf('{', start);
  let depth = 0, state = 'code', quote = null;
  for (let i = brace; i < text.length; i += 1) {
    const char = text[i], next = text[i + 1] || '';
    if (state === 'code') {
      if (char === '"' || char === "'" || char === '`') { state = 'string'; quote = char; }
      else if (char === '/' && next === '/') { state = 'line'; i += 1; }
      else if (char === '/' && next === '*') { state = 'block'; i += 1; }
      else if (char === '{') depth += 1;
      else if (char === '}') { depth -= 1; if (depth === 0) return text.slice(start, i + 1); }
    } else if (state === 'string') {
      if (char === '\\') i += 1; else if (char === quote) { state = 'code'; quote = null; }
    } else if (state === 'line') { if (char === '\n') state = 'code'; }
    else if (state === 'block' && char === '*' && next === '/') { state = 'code'; i += 1; }
  }
  throw new Error(`Unterminated function ${name}`);
}

// Full-texture upgrades must pause during transition and input activity, but not forever when idle.
const busyContext = {
  Date,
  galleryFastStartRuntime: {
    viewerReady: true,
    interactionReady: true,
    backgroundDrainActive: false,
    lastViewerActivityAt: 0,
    fullArtworkIdleDelayMs: 1800
  },
  editMode: false,
  viewerIntroOverlayMovementUnlocked: true,
  document: { hidden: false },
  galleryInspectRuntime: { opening: false },
  isDraggingArtwork: false,
  isDraggingSphere: false,
  desktopViewerMiddleLookActive: false,
  mobileLookActive: false,
  mobileJoystickActive: false,
  mobileCanvasMoveActive: false,
  editMoveKeys: {},
  viewerMovementVelocity: { length: () => 0 },
  viewerMoveKeys: {},
  transition: false,
  isGalleryInspectCameraTransitionActive: () => busyContext.transition
};
vm.createContext(busyContext);
vm.runInContext(extractFunction(source, 'isGalleryViewerBusyForFullArtworkUpgrade'), busyContext);
assert.equal(busyContext.isGalleryViewerBusyForFullArtworkUpgrade(), false, 'Idle viewer should allow a Full upgrade');
busyContext.transition = true;
assert.equal(busyContext.isGalleryViewerBusyForFullArtworkUpgrade(), true, 'TRANSITION must pause Full upgrades');
busyContext.transition = false;
busyContext.galleryInspectRuntime.opening = true;
assert.equal(busyContext.isGalleryViewerBusyForFullArtworkUpgrade(), true, 'Opening Inspect must pause Full upgrades');
busyContext.galleryInspectRuntime.opening = false;
busyContext.mobileJoystickActive = true;
assert.equal(busyContext.isGalleryViewerBusyForFullArtworkUpgrade(), true, 'Joystick movement must pause Full upgrades');
busyContext.mobileJoystickActive = false;
busyContext.galleryFastStartRuntime.lastViewerActivityAt = Date.now();
assert.equal(busyContext.isGalleryViewerBusyForFullArtworkUpgrade(), true, 'Recent interaction must respect the idle delay');

// Transition watchdog: begin -> armed, complete -> cleared, timeout -> recovery close.
let scheduled = null;
let clearCount = 0;
let syncReasons = [];
let closeReason = null;
const cameraContext = {
  Date,
  Math,
  setTimeout(fn) { scheduled = fn; return 77; },
  clearTimeout(id) { if (id) clearCount += 1; scheduled = null; },
  galleryInspectCameraRuntime: {
    state: 'WALK', transitionId: 0, reason: 'initial', controlsDetached: false,
    startedAt: 0, completedAt: 0, watchdogTimer: null, watchdogTransitionId: 0,
    watchdogMs: 9000, watchdogArmedAt: 0, lastRecovery: null
  },
  scene: { stopAnimation() {} },
  camera: { position: { clone: () => ({}) } },
  canvas: {},
  galleryGroundCollisionRuntime: {},
  markGalleryViewerActivity() {},
  stopViewerSafeFocusRuntimeAnimation() {},
  endDesktopViewerMiddleLook() {},
  endMobileCanvasLook() {},
  clearGalleryInspectTransitionInput() {},
  detachGalleryCameraForInspectTransition() { cameraContext.galleryInspectCameraRuntime.controlsDetached = true; },
  restoreGalleryCameraAfterInspectTransition() { cameraContext.galleryInspectCameraRuntime.controlsDetached = false; },
  syncGalleryInspectCameraCollisionHandoff() {},
  syncMobileViewerUiVisibility(reason) { syncReasons.push(reason); },
  updateGalleryMobileInspectSafeFrame() {},
  closeGalleryInspect(reason) { closeReason = reason; cameraContext.galleryInspectCameraRuntime.state = 'WALK'; return true; }
};
vm.createContext(cameraContext);
for (const name of [
  'clearGalleryInspectTransitionWatchdog', 'recoverGalleryInspectTransition',
  'armGalleryInspectTransitionWatchdog', 'beginGalleryInspectCameraTransition',
  'completeGalleryInspectCameraTransition', 'releaseGalleryInspectCameraToWalk'
]) vm.runInContext(extractFunction(source, name), cameraContext);

const firstId = cameraContext.beginGalleryInspectCameraTransition('test-open');
assert.equal(firstId, 1);
assert.equal(cameraContext.galleryInspectCameraRuntime.state, 'TRANSITION');
assert.equal(cameraContext.galleryInspectCameraRuntime.watchdogTransitionId, 1);
assert.equal(typeof scheduled, 'function', 'Watchdog was not armed');
assert.ok(syncReasons.includes('inspect-transition-begin'), 'Mobile UI was not hidden before composition');
assert.equal(cameraContext.completeGalleryInspectCameraTransition(firstId), true);
assert.equal(cameraContext.galleryInspectCameraRuntime.state, 'INSPECT');
assert.equal(cameraContext.galleryInspectCameraRuntime.watchdogTimer, null, 'Watchdog was not cleared on completion');

const secondId = cameraContext.beginGalleryInspectCameraTransition('test-timeout');
assert.equal(secondId, 2);
const timeoutCallback = scheduled;
assert.equal(typeof timeoutCallback, 'function');
timeoutCallback();
assert.equal(closeReason, 'transition-watchdog', 'Timeout did not use controlled recovery');
assert.equal(cameraContext.galleryInspectCameraRuntime.state, 'WALK');
assert.equal(cameraContext.galleryInspectCameraRuntime.lastRecovery.transitionId, secondId);
assert.ok(clearCount >= 1, 'Watchdog timer was never cleared');

// Structural guarantees around texture-only upgrades and ordering.
const fullDrain = extractFunction(source, 'drainGalleryFastStartFullArtworkQueue');
assert.ok(fullDrain.includes('_galleryTextureOnlyUpgrade = true'), 'Full upgrade lacks texture-only isolation');
const apply = extractFunction(source, 'applyArtworkImageState');
assert.ok(apply.includes('if (textureOnlyUpgrade)'), 'Texture-only branch missing');
assert.ok(apply.includes('recordArtworkTextureDimensionsWithoutGeometry'), 'Texture-only upgrade does not preserve geometry');
assert.ok(apply.includes('if (!textureOnlyUpgrade) {\n                        syncDetachedArtworkImagePlane'), 'Texture-only upgrade can still resync geometry/light targets');
const open = extractFunction(source, 'openGalleryInspectTarget');
assert.ok(open.indexOf('completeGalleryInspectCameraTransition') < open.indexOf('prioritizeArtworkFullTexture'), 'Full texture is prioritized before transition completion');
assert.ok(!open.slice(0, open.indexOf('var startFocus')).includes('prioritizeArtworkFullTexture'), 'Full texture still starts before camera focus');

console.log('Inspect Transition Isolation tests passed.');
