import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  SCULPTURE_MODEL_VALIDATION_SCHEMA,
  SCULPTURE_MODEL_VALIDATOR_VERSION,
  hasRenderableSculptureGeometry
} from '../src/validation/sculpture-model-validation.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workerPath = path.join(root, 'src/workers/shared-asset-glb-validator-worker.js');
const engineSource = fs.readFileSync(path.join(root, 'src/Gallery_V0_11.js'), 'utf8');
const validationSource = fs.readFileSync(path.join(root, 'src/validation/sculpture-model-validation.js'), 'utf8');

function pad4(bytes, pad = 0x20) {
  const length = (bytes.length + 3) & ~3;
  const out = new Uint8Array(length);
  out.fill(pad);
  out.set(bytes);
  return out;
}

function makeGlb(gltf, binBytes = new Uint8Array(36)) {
  const json = pad4(new TextEncoder().encode(JSON.stringify(gltf)), 0x20);
  const bin = pad4(binBytes, 0);
  const total = 12 + 8 + json.length + (bin.length ? 8 + bin.length : 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  let o = 12;
  dv.setUint32(o, json.length, true);
  dv.setUint32(o + 4, 0x4e4f534a, true);
  o += 8;
  out.set(json, o);
  o += json.length;
  if (bin.length) {
    dv.setUint32(o, bin.length, true);
    dv.setUint32(o + 4, 0x004e4942, true);
    o += 8;
    out.set(bin, o);
  }
  return out;
}

function validSculptureGltf(overrides = {}) {
  return {
    asset: { version: '2.0', generator: 'V14.1.5.1 sculpture fixture' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'SculptureMesh', mesh: 0 }],
    meshes: [{ name: 'SculptureMesh', primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 1] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
    buffers: [{ byteLength: 36 }],
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
  return new Worker(wrapper, { eval: true, type: 'module' });
}

async function validateBytes(bytes) {
  const worker = createValidatorWorker();
  const id = 'sculpture-' + Math.random().toString(36).slice(2);
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('sculpture validator timeout')), 10000);
      worker.on('error', reject);
      worker.on('message', (message) => {
        if (!message || message.id !== id) return;
        if (message.type === 'result') {
          clearTimeout(timer);
          resolve(message.report);
        } else if (message.type === 'failure') {
          clearTimeout(timer);
          reject(new Error(message.error || 'validator failure'));
        }
      });
      worker.postMessage({
        type: 'validate',
        id,
        assetType: 'sculpture',
        source: { kind: 'blob', blob: new Blob([bytes], { type: 'model/gltf-binary' }), name: 'sculpture.glb' },
        expectedSize: bytes.length
      });
    });
  } finally {
    await worker.terminate();
  }
}

assert.equal(SCULPTURE_MODEL_VALIDATION_SCHEMA, 'exhibition-platform-sculpture-model-validation.v1');
assert.equal(SCULPTURE_MODEL_VALIDATOR_VERSION, 'V14.1.5.1');
assert.ok(validationSource.includes('assetType: "sculpture"'));

const valid = await validateBytes(makeGlb(validSculptureGltf()));
assert.equal(valid.assetType, 'sculpture');
assert.equal(valid.valid, true, JSON.stringify(valid.errors));
assert.equal(valid.glb.meshCount, 1);
assert.equal(valid.glb.renderablePrimitiveCount, 1);
assert.equal(valid.glb.reachableRenderablePrimitiveCount, 1);
assert.equal(hasRenderableSculptureGeometry({
  ...valid,
  schema: SCULPTURE_MODEL_VALIDATION_SCHEMA,
  validatorVersion: SCULPTURE_MODEL_VALIDATOR_VERSION,
  modelType: 'sculpture'
}), true);

const empty = await validateBytes(makeGlb(validSculptureGltf({
  scenes: [{ nodes: [] }],
  nodes: [],
  meshes: [],
  accessors: []
})));
assert.equal(empty.valid, false);
assert.ok(empty.errors.some((item) => item.code === 'GLTF_GEOMETRY_MISSING'));
assert.equal(hasRenderableSculptureGeometry({
  ...empty,
  schema: SCULPTURE_MODEL_VALIDATION_SCHEMA,
  validatorVersion: SCULPTURE_MODEL_VALIDATOR_VERSION,
  modelType: 'sculpture'
}), false);

const unreachable = await validateBytes(makeGlb(validSculptureGltf({
  scenes: [{ nodes: [] }]
})));
assert.equal(unreachable.valid, false);
assert.ok(unreachable.errors.some((item) => item.code === 'GLTF_SCENE_GEOMETRY_MISSING'));

assert.ok(engineSource.includes('if (loadedMeshes.length < 1)'));
assert.ok(engineSource.includes('Sculpture/model GLB contains no renderable mesh geometry.'));
assert.ok(engineSource.includes('createGalleryModel3dApplyResult(queued ? "queued" : "failed"'));
assert.ok(engineSource.includes('validateSculptureModelFile(file)'));
assert.ok(engineSource.includes('MODEL UNAVAILABLE — reference preserved'));
assert.ok(engineSource.includes('RETRY MODEL'));
assert.ok(engineSource.includes('model3dHydrationStatus = status'));

console.log('V14.1.5.1 Sculpture GLB runtime-truth validation passed.');
