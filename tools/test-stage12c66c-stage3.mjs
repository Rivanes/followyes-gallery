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

// Floor marker is one non-pickable scene object and can hit floor meshes only.
const floorCursor = extractFunction(source, 'updateGalleryFloorCursorRingFromPointer');
assert.ok(floorCursor.includes('floorMeshes.indexOf(mesh) !== -1'));
assert.ok(source.includes('galleryFloorCursorRing.isPickable = false'));
assert.ok(source.includes('galleryFloorCursorRing.checkCollisions = false'));
assert.ok(source.includes('ignoreLocalLightTargeting: true'));

// Mobile long-hold safety and temporary joystick movement.
assert.ok(source.includes('touch-action: none'));
assert.ok(source.includes('-webkit-touch-callout: none'));
assert.ok(source.includes('overscroll-behavior: none'));
assert.ok(source.includes('mobileCanvasHoldDelayMs = 360'));
assert.ok(source.includes('mobileCanvasGestureMode = "move"'));
assert.ok(source.includes('mobileCanvasMoveActive = true'));
assert.ok(source.includes('canvas.setPointerCapture(event.pointerId)'));
assert.ok(source.includes('mobileCanvasPointerCancelSafety'));
assert.ok(source.includes('mobileCanvasLostPointerCaptureSafety'));
assert.ok(source.includes('isGalleryTouchGestureUiTarget'));

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

// Existing sculpture proxy is repaired, not duplicated.
assert.equal((source.match(/function refreshSculptureCollisionProxy\(/g) || []).length, 1);
const proxy = extractFunction(source, 'refreshSculptureCollisionProxy');
assert.ok(proxy.includes('sculptureCollisionBoundsCache'));
assert.ok(proxy.includes('getSculptureFloorYAtSlot'));
assert.ok(proxy.includes('includesPedestalFootprint'));
assert.ok(proxy.includes('isViewerCollisionActive()'));
const streamingSuspend = extractFunction(source, 'suspendModel3dForStreaming');
assert.equal(streamingSuspend.includes('disableSculptureCollisionProxy(slot)'), false, 'Streaming must not disable the cached sculpture collider');
assert.ok(streamingSuspend.includes('applySculptureSlotVisualState(slot)'), 'Streaming suspension must refresh the cached sculpture collider');
const collisionMode = extractFunction(source, 'isViewerCollisionActive');
assert.ok(collisionMode.includes('!editMode || !(editMoveKeys && editMoveKeys.space)'));
const editMove = extractFunction(source, 'updateEditModeMovementFrame');
assert.ok(editMove.includes('moveCameraWithViewerCollisionIfActive(editMoveDelta)'));

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

console.log('Stage 12C66C Etap 3 tests passed.');
