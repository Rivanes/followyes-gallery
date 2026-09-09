import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  REQUIRED_SPACE_ASSET_ROLES,
  OPTIONAL_SPACE_ASSET_ROLES,
  validateVenueManifest,
  buildSpaceDefinition
} from '../src/runtime/space-definition-resolver.js';
import {
  GALLERY_MODEL_VALIDATION_SCHEMA,
  GALLERY_MODEL_VALIDATOR_VERSION,
  isCurrentGalleryModelValidation,
  summarizeGalleryModelValidation
} from '../src/validation/gallery-model-validation.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workerPath = path.join(root, 'src/workers/gallery-glb-validator-worker.js');
const apiSource = fs.readFileSync(path.join(root, 'src/data/gallery-management-api.js'), 'utf8');
const adminSource = fs.readFileSync(path.join(root, 'src/bootstrap/admin-workspace-bootstrap.js'), 'utf8');
const engineSource = fs.readFileSync(path.join(root, 'src/Gallery_V0_11.js'), 'utf8');

function pad4(bytes, pad=0x20) {
  const length = (bytes.length + 3) & ~3;
  const out = new Uint8Array(length); out.fill(pad); out.set(bytes); return out;
}
function makeGlb(gltf, binBytes = new Uint8Array(36)) {
  const json = pad4(new TextEncoder().encode(JSON.stringify(gltf)), 0x20);
  const bin = pad4(binBytes, 0);
  const total = 12 + 8 + json.length + (bin.length ? 8 + bin.length : 0);
  const out = new Uint8Array(total); const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  let o=12; dv.setUint32(o,json.length,true); dv.setUint32(o+4,0x4e4f534a,true); o+=8; out.set(json,o); o+=json.length;
  if (bin.length) { dv.setUint32(o,bin.length,true); dv.setUint32(o+4,0x004e4942,true); o+=8; out.set(bin,o); }
  return out;
}
function makeRawJsonGlb(jsonText) {
  const json = jsonText === "" ? new Uint8Array(0) : pad4(new TextEncoder().encode(jsonText), 0x20);
  const total = 12 + 8 + json.length;
  const out = new Uint8Array(total); const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12,json.length,true); dv.setUint32(16,0x4e4f534a,true); out.set(json,20);
  return out;
}
function baseGltf(overrides={}) {
  return {
    asset:{version:'2.0',generator:'C23 test fixture'},
    scene:0,
    scenes:[{nodes:[0]}],
    nodes:[{name:'Floor_segment_001',mesh:0}],
    meshes:[{name:'FloorMesh',primitives:[{attributes:{POSITION:0}}]}],
    accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,0,1]}],
    bufferViews:[{buffer:0,byteOffset:0,byteLength:36}],
    buffers:[{byteLength:36}],
    ...overrides
  };
}

function createValidatorWorker() {
  const wrapper = `
    import { parentPort } from 'node:worker_threads';
    globalThis.self = globalThis;
    globalThis.postMessage = (value) => parentPort.postMessage(value);
    await import(${JSON.stringify(pathToFileURL(workerPath).href)});
    parentPort.on('message', (data) => globalThis.self.onmessage({ data }));
  `;
  return new Worker(wrapper, { eval:true, type:'module' });
}
async function validateBytes(bytes, role='floor') {
  const worker=createValidatorWorker();
  const id='test-'+Math.random().toString(36).slice(2);
  try {
    return await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('validator timeout')),10000);
      worker.on('error',reject);
      worker.on('message',(message)=>{
        if(message.id!==id)return;
        if(message.type==='result'){clearTimeout(timer);resolve(message.report);}
        if(message.type==='failure'){clearTimeout(timer);reject(new Error(message.error));}
      });
      worker.postMessage({type:'validate',id,role,source:{kind:'blob',blob:new Blob([bytes],{type:'model/gltf-binary'}),name:`${role}.glb`},expectedSize:bytes.length});
    });
  } finally { await worker.terminate(); }
}

// Real worker execution — valid GLB, incremental SHA-256 and bounds.
const validBytes=makeGlb(baseGltf());
const valid=await validateBytes(validBytes,'floor');
assert.equal(valid.schema,GALLERY_MODEL_VALIDATION_SCHEMA);
assert.equal(valid.validatorVersion,GALLERY_MODEL_VALIDATOR_VERSION);
assert.equal(valid.valid,true,JSON.stringify(valid.errors));
assert.equal(valid.glb.meshCount,1);
assert.equal(valid.glb.renderablePrimitiveCount,1);
assert.deepEqual(valid.glb.runtimeMeshNames,['Floor_segment_001']);
assert.deepEqual(valid.glb.bounds.min,[0,0,0]);
assert.deepEqual(valid.glb.bounds.max,[1,0,1]);
assert.equal(valid.fileHash,'sha256:'+crypto.createHash('sha256').update(validBytes).digest('hex'));
assert.equal(valid.glb.reachableRenderablePrimitiveCount,1);

// Streaming hash must remain correct across many reader chunks / a larger BIN payload.
const largeBin=new Uint8Array(384*1024);
for(let i=0;i<largeBin.length;i++) largeBin[i]=i%251;
const largeGltf=baseGltf({bufferViews:[{buffer:0,byteOffset:0,byteLength:largeBin.length}],buffers:[{byteLength:largeBin.length}]});
const largeBytes=makeGlb(largeGltf,largeBin);
const largeReport=await validateBytes(largeBytes,'floor');
assert.equal(largeReport.valid,true,JSON.stringify(largeReport.errors));
assert.equal(largeReport.fileHash,'sha256:'+crypto.createHash('sha256').update(largeBytes).digest('hex'));

for (const binLength of [36,40,44,48,52,56,60,64,68,72,76,80]) {
  const bin=new Uint8Array(binLength); for(let i=0;i<bin.length;i++) bin[i]=(i*17+binLength)%256;
  const gltf=baseGltf({bufferViews:[{buffer:0,byteOffset:0,byteLength:binLength}],buffers:[{byteLength:binLength}]});
  const bytes=makeGlb(gltf,bin); const report=await validateBytes(bytes,'floor');
  assert.equal(report.valid,true,JSON.stringify(report.errors));
  assert.equal(report.fileHash,'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex'));
}

const emptyJsonReport=await validateBytes(makeRawJsonGlb(''),'floor');
assert.equal(emptyJsonReport.valid,false);
assert.ok(emptyJsonReport.errors.some(x=>x.code==='GLB_JSON_EMPTY'));

const nullJsonReport=await validateBytes(makeRawJsonGlb('null'),'floor');
assert.equal(nullJsonReport.valid,false);
assert.ok(nullJsonReport.errors.some(x=>x.code==='GLTF_ROOT_INVALID'));

const missingBinReport=await validateBytes(makeGlb(baseGltf(),new Uint8Array(0)),'floor');
assert.equal(missingBinReport.valid,false);
assert.ok(missingBinReport.errors.some(x=>x.code==='GLTF_BIN_MISSING'));

const badMagic=validBytes.slice(); new DataView(badMagic.buffer).setUint32(0,0x12345678,true);
const badMagicReport=await validateBytes(badMagic,'floor');
assert.equal(badMagicReport.valid,false);
assert.ok(badMagicReport.errors.some(x=>x.code==='GLB_BAD_MAGIC'));

const external=await validateBytes(makeGlb(baseGltf({images:[{uri:'textures/albedo.png'}]})),'walls');
assert.equal(external.valid,false);
assert.ok(external.errors.some(x=>x.code==='GLTF_EXTERNAL_DEPENDENCIES'));

const duplicateGltf=baseGltf({
  scenes:[{nodes:[0,1]}],
  nodes:[{name:'Wall_segment_001',mesh:0},{name:'Wall_segment_001',mesh:0}]
});
const duplicate=await validateBytes(makeGlb(duplicateGltf),'walls');
assert.equal(duplicate.valid,false);
assert.ok(duplicate.errors.some(x=>x.code==='GLTF_DUPLICATE_RUNTIME_MESH_NAME'));

const noPosition=baseGltf({meshes:[{primitives:[{attributes:{NORMAL:0}}]}]});
const noPositionReport=await validateBytes(makeGlb(noPosition),'ceiling');
assert.equal(noPositionReport.valid,false);
assert.ok(noPositionReport.errors.some(x=>x.code==='GLTF_POSITION_MISSING'));

const accessorOverflow=baseGltf({accessors:[{bufferView:0,componentType:5126,count:4,type:'VEC3',min:[0,0,0],max:[1,1,1]}]});
const accessorOverflowReport=await validateBytes(makeGlb(accessorOverflow),'floor');
assert.equal(accessorOverflowReport.valid,false);
assert.ok(accessorOverflowReport.errors.some(x=>x.code==='GLTF_ACCESSOR_RANGE'));

const unreachable=baseGltf({scenes:[{nodes:[]}],nodes:[{name:'Unused',mesh:0}]});
const unreachableReport=await validateBytes(makeGlb(unreachable),'walls');
assert.equal(unreachableReport.valid,false);
assert.ok(unreachableReport.errors.some(x=>x.code==='GLTF_SCENE_GEOMETRY_MISSING'));

const badScene=baseGltf({scene:9});
const badSceneReport=await validateBytes(makeGlb(badScene),'ceiling');
assert.equal(badSceneReport.valid,false);
assert.ok(badSceneReport.errors.some(x=>x.code==='GLTF_SCENE_INDEX'));

// Browser-side staleness contract.
const asset={file_hash:valid.fileHash,file_size:valid.fileSize,storage_path:'venues/a/versions/b/assets/floor/file.glb',metadata:{c23ModelValidation:{...valid,sourceStoragePath:'venues/a/versions/b/assets/floor/file.glb'}}};
assert.equal(isCurrentGalleryModelValidation(asset,'floor'),true);
assert.equal(summarizeGalleryModelValidation(asset,'floor').state,'valid');
assert.equal(isCurrentGalleryModelValidation({...asset,file_hash:'sha256:'+'0'.repeat(64)},'floor'),false);
assert.equal(summarizeGalleryModelValidation(null,'props').state,'optional');

// Space resolver contract: Props are optional end-to-end.
assert.deepEqual(REQUIRED_SPACE_ASSET_ROLES,['floor','walls','ceiling']);
assert.deepEqual(OPTIONAL_SPACE_ASSET_ROLES,['props']);
const manifest={
  schema:'exhibition-platform-venue-manifest.v1',venueId:'gallery-test',versionId:'v1',coordinateSystem:{upAxis:'Y',units:'meters'},
  assets:REQUIRED_SPACE_ASSET_ROLES.map(role=>({assetId:role,role,storageBucket:'venue-runtime',storagePath:`Models/${role}.glb`,required:true})),
  spawnPoints:[{id:'visitor-entry',safe:true,visitor:true,position:{x:0,y:1.7,z:0},target:{x:0,y:1.7,z:1}}]
};
assert.equal(validateVenueManifest(manifest).valid,true);
const storage={from(bucket){return{getPublicUrl(p){return{data:{publicUrl:`https://example.invalid/${bucket}/${p}`}}}}}};
const def=buildSpaceDefinition({supabase:{storage},venue:{id:'v',slug:'gallery-test',name:'Test'},venueVersion:{id:'vv',version_number:'v1'},manifest});
assert.equal(def.assets.props,undefined);
assert.ok(def.assets.floor && def.assets.walls && def.assets.ceiling);
const withTwoProps={...manifest,assets:[...manifest.assets,{assetId:'props',role:'props',storageBucket:'venue-runtime',storagePath:'a.glb'},{assetId:'props2',role:'props',storageBucket:'venue-runtime',storagePath:'b.glb'}]};
assert.equal(validateVenueManifest(withTwoProps).valid,false);

// Static integration invariants around upload/publish/runtime.
assert.ok(apiSource.includes('admin_record_venue_asset_validation'));
assert.ok(apiSource.includes('admin_clear_venue_asset_slot'));
assert.ok(apiSource.includes('C23 deep validation must pass before a Gallery model can be uploaded'));
assert.ok(adminSource.includes('validateGalleryModelFile') && adminSource.includes('validateExistingGalleryAsset'));
assert.ok(adminSource.includes('../data/exhibition-api.js?v=c6c8c25_cross_space_runtime'));
assert.ok(adminSource.includes('props · optional') && adminSource.includes('CHECKING SPACE'));
assert.ok(engineSource.includes('var galleryStrictCriticalAssetNames = ["floor", "wall", "ceiling"]'));
assert.ok(engineSource.includes('var galleryAuthoringSpacePreview'));
assert.ok(engineSource.includes('if (galleryPropsSpaceAsset)'));
assert.ok(!engineSource.includes('if (!snapshot.propsSettled) blockers.push("props")'));

console.log('C6C8C23 Space Model Validation executable GLB fixtures passed.');
