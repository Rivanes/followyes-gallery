import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
const minified = fs.readFileSync(new URL('../src/Gallery_V0_11.min.js', import.meta.url), 'utf8');
function extractFunction(name) {
  const markers = [`    async function ${name}(`, `    function ${name}(`];
  let start = -1;
  for (const marker of markers) { start = source.indexOf(marker); if (start >= 0) break; }
  assert.ok(start >= 0, `Missing ${name}`);
  const brace = source.indexOf('{', start); let depth=0,state='code',quote=null;
  for(let i=brace;i<source.length;i+=1){const c=source[i],n=source[i+1]||'';if(state==='code'){if(c==='"'||c==="'"||c==='`'){state='string';quote=c;}else if(c==='/'&&n==='/'){state='line';i+=1;}else if(c==='/'&&n==='*'){state='block';i+=1;}else if(c==='{')depth+=1;else if(c==='}'){depth-=1;if(depth===0)return source.slice(start,i+1);}}else if(state==='string'){if(c==='\\')i+=1;else if(c===quote)state='code';}else if(state==='line'&&c==='\n')state='code';else if(state==='block'&&c==='*'&&n==='/'){state='code';i+=1;}}
  throw new Error(`Unterminated ${name}`);
}

assert.ok(source.includes('schema: "gallery-sculpture-core.v2"'));
assert.ok(source.includes('slotId: ensureModel3dSlotIdentity(sphere)'));
assert.ok(source.includes('getModel3dSlotById(sphereState.slotId) || getSphereByName(sphereState.name)'));

const picked=extractFunction('getModel3dSlotFromPickedMesh');
assert.ok(picked.includes('_galleryModel3dOwnerSlot'));
assert.ok(picked.indexOf('model3dOwnerSlotId') < picked.indexOf('model3dSlotName'));

const collector=extractFunction('collectGalleryModel3dRuntimeNodes');
assert.ok(collector.includes('result && result.transformNodes'));
assert.ok(collector.includes('result && result.meshes'));
assert.ok(collector.includes('node.getDescendants(false)'));

const load=extractFunction('loadModel3dIntoSlot');
assert.ok(load.includes('collected.rootNodes.forEach'));
assert.ok(load.includes('importedRoot.parent = root'));
assert.ok(load.includes('pendingRuntime.nodes'));
assert.ok(load.includes('pendingRuntime.transformNodes'));
assert.ok(load.includes('isCurrentModel3dSlotLoad(slot, generation)'));

const dispose=extractFunction('disposeModel3dSlotRuntime');
for(const key of ['runtime.nodes','runtime.rootNodes','runtime.transformNodes','runtime.meshes']) assert.ok(dispose.includes(key));
assert.ok(dispose.includes('nodes.sort'));

const duplicate=extractFunction('duplicateSelectedModel3dSlot');
assert.ok(duplicate.includes('selectionRevisionAtStart'));
assert.ok(duplicate.includes('sourceSlotId'));
assert.ok(duplicate.includes('await applyModel3dStateToSlot'));
assert.ok(duplicate.includes('sculpturePedestalFootprint'));

const proxy=extractFunction('refreshSculptureCollisionProxy');
assert.ok(proxy.includes('getSculpturePedestalLocalBounds(slot)'));
assert.ok(proxy.includes('worldBoundsToSlotLocalBounds'));
assert.ok(proxy.includes('proxy.parent = slot'));
assert.ok(proxy.includes('colliderRegistry[slotId]'));

const deletion=extractFunction('deleteModel3dSlotRuntime');
assert.ok(deletion.includes('removeModel3dSlotFromSelectionState(slot)'));
assert.ok(deletion.includes('disposeSculptureCollisionProxy(slot)'));
assert.ok(deletion.includes('unregisterModel3dSlotIdentity(slot)'));

assert.ok(source.includes('if (editMode && isDraggingSphere && activeSculptureDragSlot)'));
assert.ok(source.includes('gallerySculptureCoreRuntime.activeDragSlotId = ensureModel3dSlotIdentity'));
assert.ok(source.includes('model3dTransformSliderPreviewSlotId'));
assert.ok(minified.includes('gallery-sculpture-core.v2'));
assert.ok(minified.includes('model3dOwnerSlotId'));
assert.ok(minified.includes('model3dLoadGeneration'));

console.log('Stage 12C66C5 sculpture runtime integrity tests passed.');
