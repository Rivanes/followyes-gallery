import fs from 'node:fs';
import crypto from 'node:crypto';

const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
const minified = fs.readFileSync(new URL('../src/Gallery_V0_11.min.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bootstrap = fs.readFileSync(new URL('../src/bootstrap/gallery-viewer-bootstrap.js', import.meta.url), 'utf8');
const editorBootstrap = fs.readFileSync(new URL('../src/bootstrap/gallery-editor-bootstrap.js', import.meta.url), 'utf8');
const txt = fs.readFileSync(new URL('../Gallery_V0_11_STAGE12C66C6A_MOBILE_QUALITY_FOUNDATION_LOGIN_DISABLED.txt', import.meta.url), 'utf8');

function assert(condition, message) { if (!condition) throw new Error(message); }
function count(haystack, needle) { return haystack.split(needle).length - 1; }
function sha(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function extractFunction(text, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const marker of markers) { start = text.indexOf(marker); if (start >= 0) break; }
  assert(start >= 0, `Missing function ${name}`);
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

// Stage identity and protected boot flow.
assert(index.includes('stage: "12C66C6A"'), 'Boot Guard C5 identity missing');
assert(bootstrap.includes('const STAGE = "12C66C6A"'), 'Viewer runtime C5 identity missing');
assert(bootstrap.includes('stage12c66c6a_mobile_quality_foundation_artwork_always_visible_20260724'), 'C5 cache key missing');
assert(index.includes('gallery-viewer-bootstrap.js?v=stage12c66c6a_mobile_quality_foundation_artwork_always_visible_20260724'), 'Index C5 cache key missing');
assert(editorBootstrap.includes('Stage 12C66C6A'), 'Editor bootstrap C5 label missing');
assert(source.includes('Stage 12C66C6A: Mobile Quality Foundation / Artwork Always Visible'), 'C6A source history missing');
assert(source.includes('stage: "12C66C6A"'), 'C5 engine/save identity missing');
assert(source.includes('stage: "12C65E"'), 'Protected streaming identity changed');
assert(sha(extractFunction(source, 'createViewerIntroOverlayStyles')) === '93595efee4b7f720f32b5a8b739f6212bcea793ed8bdc88e939ea243b74262d6', 'Accepted intro CSS changed');
assert(sha(extractFunction(source, 'showViewerIntroOverlay')) === 'fb4b8f6a0b72653489b10564492ffad9f52ba461bf67cb1992bd21e655aaf537', 'Accepted intro behavior changed');
assert(bootstrap.includes('gallery-instruction-popup-confirmed') && bootstrap.includes('instruction-popup-missing'), 'Original popup guard changed');

// Exactly one active grounded collision pipeline.
assert(count(source, 'function resolveGalleryGroundMovement(') === 1, 'Unified resolver duplicated/missing');
assert(count(source, 'function moveViewerCameraWithUnifiedGroundCollision(') === 1, 'Unified movement entry duplicated/missing');
assert(!source.includes('.moveWithCollisions('), 'Native moveWithCollisions remains active');
assert(!source.includes('resolveViewerWallCollisionAfterMovement'), 'Old post-move rollback remains');
assert(!source.includes('updateViewerWallCollisionIfCameraMoved'), 'Old post-move observer remains');
assert(!source.includes('moveCameraWithViewerCollisionIfActive'), 'Old preflight wrapper remains');
assert(source.includes('scene.collisionsEnabled = false;') && source.includes('camera.checkCollisions = false;'), 'Native collision solver is not disabled');
const resolver = extractFunction(source, 'resolveGalleryGroundMovement');
assert(resolver.includes('{ name: "full"') && resolver.includes('{ name: "slide-x"') && resolver.includes('{ name: "slide-z"'), 'Full/X/Z resolution order missing');
assert(resolver.includes('getGalleryGroundedCameraYAtPosition'), 'Resolver does not preserve grounded camera height');
const groundedY = extractFunction(source, 'getGalleryGroundedCameraYAtPosition');
assert(groundedY.includes('getGalleryDefaultWalkCameraY()'), 'C4 walking eye level is not restored');
assert(!groundedY.includes('getGalleryFloorYAtPosition('), 'Ground movement still recalculates camera Y from floor geometry');
assert(resolver.includes('getGalleryGroundCollisionBlock'), 'Resolver does not check unified obstacles');
assert(resolver.includes('camera.position.copyFrom(chosen)'), 'Resolver lacks authoritative final write');
assert(resolver.includes('recordGalleryGroundMovement'), 'Movement telemetry missing');
const block = extractFunction(source, 'getGalleryGroundCollisionBlock');
assert(block.includes('isViewerWallHitBetweenPositions') && block.includes('findViewerSculptureCollisionRecord'), 'Walls and sculptures are not checked together');

// Every grounded input source routes into the same resolver.
assert(extractFunction(source, 'updateViewerWASDMovement').includes('moveViewerCameraWithGroundedCollision(movementDelta)'), 'Viewer WASD/joystick/hold path bypasses resolver');
assert(extractFunction(source, 'moveViewerCameraWithGroundedCollision').includes('moveViewerCameraWithUnifiedGroundCollision'), 'Grounded wrapper bypasses unified resolver');
const editMove = extractFunction(source, 'updateEditModeMovementFrame');
assert(editMove.includes('moveViewerCameraWithUnifiedGroundCollision(editMoveDelta'), 'Edit walk bypasses resolver');
assert(editMove.includes('moveGalleryCameraInIntentionalFly(editMoveDelta, "edit-fly")'), 'Intentional Edit fly is not explicit');
assert(extractFunction(source, 'moveGalleryCameraInIntentionalFly').includes('resolution: "intentional-fly-bypass"'), 'Edit fly telemetry missing');
for (const sourceName of ['viewer-wasd','desktop-dpad','mobile-joystick','mobile-hold-drag','edit-wasd','edit-dpad','click-to-move']) {
  assert(source.includes(`"${sourceName}"`), `Movement source missing: ${sourceName}`);
}
const clickStart = extractFunction(source, 'startGalleryClickToMove');
const clickFrame = extractFunction(source, 'updateGalleryClickToMoveFrame');
assert(clickFrame.includes('resolveGalleryGroundMovement(step, { source: "click-to-move" })'), 'Click-to-move does not use stepped resolver');
assert(clickFrame.includes('Math.min(distance, runtime.speed * dt, 0.22)'), 'Click-to-move step cap missing');
assert(!source.includes('CreateAndStartAnimation("cameraMove"'), 'Direct camera.position click animation remains');
assert(extractFunction(source, 'runGalleryFrameTick').includes('updateGalleryClickToMoveFrame()'), 'Click-to-move frame runner missing');

// Sculpture collider ownership and runtime hierarchy.
assert(source.includes('schema: "gallery-sculpture-core.v2"'), 'C5 sculpture core schema missing');
assert(source.includes('slotRegistry: Object.create(null)') && source.includes('colliderRegistry: Object.create(null)'), 'Slot/collider registries missing');
const proxy = extractFunction(source, 'refreshSculptureCollisionProxy');
assert(proxy.includes('getSculpturePedestalLocalBounds(slot)'), 'Explicit pedestal footprint missing');
assert(proxy.includes('proxy.parent = slot'), 'Collider is not slot-owned');
assert(proxy.includes('gallerySculptureCoreRuntime.colliderRegistry[slotId]'), 'Collider not registered by slotId');
assert(proxy.includes('sculptureModelCollisionLocalBoundsCache'), 'Streaming-safe local bounds cache missing');
assert(proxy.includes('runtime+pedestal') && proxy.includes('cache+pedestal'), 'Collider source telemetry missing');
assert(source.includes('sculpturePedestalFootprint:'), 'Pedestal footprint not serialized');
assert(source.includes('setSculptureCollisionDebugVisible'), 'Runtime collider visualizer missing');
const load = extractFunction(source, 'loadModel3dIntoSlot');
assert(load.includes('collectGalleryModel3dRuntimeNodes(result)'), 'Full GLB hierarchy collector missing');
assert(load.includes('pendingRuntime.rootNodes') && load.includes('pendingRuntime.transformNodes') && load.includes('pendingRuntime.nodes'), 'Runtime does not retain complete hierarchy');
assert(load.includes('collected.rootNodes.forEach') && load.includes('importedRoot.parent = root'), 'Imported roots are not owned by wrapper');
assert(load.includes('isCurrentModel3dSlotLoad(slot, generation)'), 'Async generation guard missing');
assert(load.includes('disposeLateResult(result)'), 'Late result cleanup missing');
const collect = extractFunction(source, 'collectGalleryModel3dRuntimeNodes');
assert(collect.includes('result && result.transformNodes') && collect.includes('result && result.meshes'), 'TransformNodes or meshes ignored');
const dispose = extractFunction(source, 'disposeModel3dSlotRuntime');
for (const collection of ['runtime.nodes','runtime.rootNodes','runtime.transformNodes','runtime.meshes']) assert(dispose.includes(collection), `Disposal ignores ${collection}`);
assert(dispose.includes('Deepest nodes first'), 'Robust hierarchy disposal missing');
const queue = extractFunction(source, 'queueGalleryFastStartModelLoad');
assert(queue.includes('var key = ensureModel3dSlotIdentity(slot)'), 'Streaming queue still keys by name');
assert(queue.includes('slotId: key'), 'Streaming queue slotId missing');

// Selection and operation ownership.
const picked = extractFunction(source, 'getModel3dSlotFromPickedMesh');
assert(picked.includes('_galleryModel3dOwnerSlot') && picked.includes('model3dOwnerSlotId'), 'Direct owner resolution missing');
assert(picked.indexOf('model3dOwnerSlotId') < picked.indexOf('model3dSlotName'), 'Legacy name still wins over slotId');
assert(source.includes('activeSculptureDragSlot') && source.includes('activeDragSlotId'), 'Fixed drag owner missing');
assert(source.includes('if (editMode && isDraggingSphere && activeSculptureDragSlot)'), 'Drag still reads live selection');
const duplicate = extractFunction(source, 'duplicateSelectedModel3dSlot');
assert(duplicate.includes('selectionRevisionAtStart') && duplicate.includes('sourceSlotId'), 'Duplicate async selection guard missing');
assert(duplicate.includes('await applyModel3dStateToSlot'), 'Duplicate does not await its own load');
const preview = extractFunction(source, 'scheduleModel3dTransformSliderPreview');
assert(preview.includes('model3dTransformSliderPreviewSlotId') && preview.includes('getModel3dSlotById'), 'Transform preview does not preserve slot owner');
const deletion = extractFunction(source, 'deleteModel3dSlotRuntime');
assert(deletion.includes('disposeSculptureCollisionProxy(slot)') && deletion.includes('unregisterModel3dSlotIdentity(slot)'), 'Delete leaves collider/registry state');

// Frozen systems remain present.
assert(source.includes('galleryEditorSaveBar.appendChild(sharedSaveStateButton)'), 'Sticky Save changed');
assert(source.includes('ownerTabId: gallerySaveIntegrityRuntime.tabId'), 'Save Integrity ownership changed');
assert(source.includes('STAGE 12C65E — GALLERY ZONES / CRITICAL → NEARBY → DEFERRED'), 'Streaming architecture changed');
assert(source.includes('function applyLocalLightUserState(item)'), 'Local Lights persistent state changed');
assert(!source.includes('Ctrl + S'), 'Unrequested Ctrl+S path added');

// Build/login contract.
assert(count(source, 'var galleryEditorLoginEnabled = true;') === 1, 'Production login marker invalid');
assert(count(txt, 'var galleryEditorLoginEnabled = false;') === 1, 'Login-disabled TXT marker invalid');
assert(txt.replace('var galleryEditorLoginEnabled = false;', 'var galleryEditorLoginEnabled = true;') === source, 'TXT differs beyond login switch');
assert(sha(minified) !== sha(source) && minified.length < source.length * 0.85, 'Production minification invalid');
assert(minified.includes('12C66C6A') && minified.includes('gallery-ground-collision.v1') && minified.includes('gallery-sculpture-core.v2'), 'C5 runtime missing from production build');

// Stage 12C66C6A — artwork visibility and lifecycle foundation.
assert(source.includes('schema: "gallery-artwork-runtime.v1"'), 'Artwork runtime registry missing');
assert(source.includes('registry: Object.create(null)'), 'Artwork registry missing');
assert(source.includes('function ensureArtworkIdentity('), 'Stable artworkId resolver missing');
assert(source.includes('artworkId: ensureArtworkIdentity(artwork)'), 'artworkId is not serialized');
assert(extractFunction(source, 'createMissingArtworkFromState').includes('artworkState.artworkId'), 'artworkId is not restored');
assert(extractFunction(source, 'queueGalleryFastStartArtworkLoad').includes('artworkId === artworkId'), 'Artwork queue is not keyed by artworkId');
assert(extractFunction(source, 'queueGalleryFastStartArtworkLoad').includes('_galleryArtworkLoadGeneration'), 'Artwork queue generation missing');
assert(extractFunction(source, 'applyArtworkImageState').includes('isArtworkTextureLoadCurrent'), 'Async texture callbacks lack generation guard');
assert(extractFunction(source, 'applyArtworkImageState').includes('Atomic swap'), 'Artwork atomic swap contract missing');
assert(extractFunction(source, 'deleteArtworkRuntimeNoLights').includes('invalidateArtworkTextureLoad'), 'Delete does not invalidate pending texture loads');
assert(extractFunction(source, 'removeArtworkImageFromMesh').includes('invalidateArtworkTextureLoad'), 'Remove image does not invalidate pending texture loads');
assert(!source.includes('function suspendArtworkTextureForStreaming('), 'Obsolete artwork unload system remains');
assert(!source.includes('maxResidentArtworkTextures'), 'Artwork resident texture limit remains');
assert(!source.includes('textureUnloadGraceMs'), 'Artwork texture grace unload remains');
const memoryBudget = extractFunction(source, 'maintainGalleryStreamingMemoryBudget');
assert(memoryBudget.includes('artwork textures are permanent residents once assigned'), 'Always-visible artwork policy missing');
assert(!memoryBudget.includes('disposeArtworkImageMaterial'), 'Memory budget can still dispose artwork textures');
const pump = extractFunction(source, 'pumpGalleryZoneStreamingQueues');
assert(pump.includes('["critical", "nearby", "deferred"]'), 'Deferred artwork previews are not drained');
const fullDrain = extractFunction(source, 'drainGalleryFastStartFullArtworkQueue');
assert(!fullDrain.includes('getGalleryStreamingTierForObject(entry.artwork) !== "critical"'), 'Full upgrade still requires current zone');
assert(!extractFunction(source, 'isGalleryViewerBusyForFullArtworkUpgrade').includes('viewerMoveKeys'), 'Normal walking still blocks full artwork upgrades');
assert(source.includes('schema: "gallery-mobile-quality-inspector.v1"'), 'Mobile Quality Inspector missing');
assert(source.includes('blankAssignedFrames'), 'Inspector does not detect empty assigned frames');
assert(source.includes('owner: "applyGalleryRenderResolution"'), 'Single render-resolution owner missing');
assert(count(source, 'engine.setHardwareScalingLevel(') === 1, 'More than one active hardware scaling writer remains');
assert(source.includes('BerryboyMobileQualityInspector'), 'Public inspector API missing');
assert(txt.includes('var galleryEditorLoginEnabled = false;'), 'Login-disabled C6A build missing');
assert(!txt.includes('var galleryEditorLoginEnabled = true;'), 'Login remains enabled in C6A TXT');

console.log('Stage 12C66C6A verifier passed.');
