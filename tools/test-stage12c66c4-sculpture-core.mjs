import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
const minified = fs.readFileSync(new URL('../src/Gallery_V0_11.min.js', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractFunction(name) {
  const candidates = [`    function ${name}(`, `    async function ${name}(`];
  let start = -1;
  for (const marker of candidates) {
    start = source.indexOf(marker);
    if (start >= 0) break;
  }
  assert(start >= 0, `Missing function ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  let state = 'code';
  let quote = null;
  for (let i = brace; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1] || '';
    if (state === 'code') {
      if (char === '"' || char === "'" || char === '`') { state = 'string'; quote = char; }
      else if (char === '/' && next === '/') { state = 'line'; i += 1; }
      else if (char === '/' && next === '*') { state = 'block'; i += 1; }
      else if (char === '{') depth += 1;
      else if (char === '}') { depth -= 1; if (depth === 0) return source.slice(start, i + 1); }
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

assert(source.includes('schema: "gallery-sculpture-core.v1"'), 'Sculpture core registry missing');
assert(source.includes('slotRegistry: Object.create(null)'), 'Stable slot registry missing');
assert(source.includes('colliderRegistry: Object.create(null)'), 'Collider registry missing');
assert(source.includes('slotId: ensureModel3dSlotIdentity(sphere)'), 'slotId is not serialized');
assert(source.includes('getModel3dSlotById(sphereState.slotId) || getSphereByName(sphereState.name)'), 'Restore does not prefer slotId');

const picked = extractFunction('getModel3dSlotFromPickedMesh');
assert(picked.includes('_galleryModel3dOwnerSlot'), 'Direct mesh owner reference missing');
assert(picked.includes('model3dOwnerSlotId'), 'Owner slotId lookup missing');
assert(picked.indexOf('model3dOwnerSlotId') < picked.indexOf('model3dSlotName'), 'Legacy name still wins over slotId');

const selection = extractFunction('selectModel3dSlot');
assert(selection.includes('setSculptureSelectionState'), 'Selection does not use one authoritative state');
const clearSelection = extractFunction('clearModel3dSlotSelection');
assert(clearSelection.includes('setSculptureSelectionState([], null, null)'), 'Selection clear bypasses authoritative state');
assert((source.match(/selectedSphere\s*=\s*null/g) || []).length === 1, 'selectedSphere is still cleared outside its declaration/selection state');

const load = extractFunction('loadModel3dIntoSlot');
assert(load.includes('nextModel3dSlotLoadGeneration'), 'Per-slot load generation missing');
assert(load.includes('isCurrentModel3dSlotLoad(slot, generation)'), 'Late load guard missing');
assert(load.includes('loadDiscardCount'), 'Late load disposal telemetry missing');
assert(load.includes('disposeLateResult(result)'), 'Late import is not disposed');
assert(extractFunction('replaceModel3dStateInSlotSafely').includes('replacementGeneration'), 'Replacement can restore over a newer direct load');

const duplicate = extractFunction('duplicateSelectedModel3dSlot');
assert(duplicate.startsWith('    async function'), 'Duplicate is not asynchronous');
assert(duplicate.includes('findModel3dDuplicatePlacement(sourceSlot)'), 'Bounds-aware duplicate placement missing');
assert(extractFunction('findModel3dDuplicatePlacement').includes('refreshAllSculptureCollisionProxies()'), 'Duplicate placement does not refresh all existing footprints');
assert(!extractFunction('isModel3dDuplicatePlacementFree').includes('record.slot === sourceSlot'), 'Duplicate placement incorrectly ignores overlap with its source');
assert(duplicate.includes('await applyModel3dStateToSlot'), 'Duplicate does not wait for model load');
assert(!duplicate.includes('new BABYLON.Vector3(1.4'), 'Fixed 1.4 duplicate offset returned');
assert(duplicate.indexOf('await applyModel3dStateToSlot') < duplicate.indexOf('selectModel3dSlot(newSlot)'), 'Duplicate is selected before load finishes');

const collisionRefresh = extractFunction('refreshSculptureCollisionProxy');
assert(collisionRefresh.includes('gallerySculptureCoreRuntime.colliderRegistry[slotId]'), 'Collider is not registered by slotId');
const collisionList = extractFunction('getViewerSculptureCollisionProxies');
assert(collisionList.includes('colliderRegistry'), 'Movement resolver does not read collider registry');
const movement = extractFunction('moveCameraWithViewerCollisionIfActive');
assert(movement.includes('isViewerObstacleHitBetweenPositions(from, candidate)'), 'Movement does not preflight sculpture/wall collisions');
assert(movement.includes('isViewerSculptureTooCloseAtPosition(candidate, from)'), 'Movement does not enforce sculpture footprint');

const deletion = extractFunction('deleteModel3dSlotRuntime');
assert(deletion.includes('removeModel3dSlotFromSelectionState(slot)'), 'Delete does not clean unified selection');
assert(deletion.includes('disposeSculptureCollisionProxy(slot)'), 'Delete leaves collider proxy');
assert(deletion.includes('unregisterModel3dSlotIdentity(slot)'), 'Delete leaves slot registry entry');

function overlaps(a, b) {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxZ < b.minZ || a.minZ > b.maxZ);
}
const original = { minX: -2, maxX: 2, minZ: -1.5, maxZ: 1.5 };
const oldFixedOffset = { minX: -0.6, maxX: 3.4, minZ: -1.5, maxZ: 1.5 };
const boundsOffset = { minX: 2.45, maxX: 6.45, minZ: -1.5, maxZ: 1.5 };
assert(overlaps(original, oldFixedOffset), 'Fixture should prove fixed 1.4 overlaps a large model');
assert(!overlaps(original, boundsOffset), 'Bounds-aware placement fixture should be separated');

assert(minified.includes('gallery-sculpture-core.v1'), 'Production build missing sculpture core');
assert(minified.includes('model3dOwnerSlotId'), 'Production build missing stable mesh owner');
assert(minified.includes('model3dLoadGeneration'), 'Production build missing load generation');

console.log('Stage 12C66C4 sculpture core tests passed.');
