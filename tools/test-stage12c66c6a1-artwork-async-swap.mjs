import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');

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

class FakeMaterial {
  constructor(name) {
    this.name = name;
    this.diffuseTexture = null;
    this.emissiveTexture = null;
    this.disposed = false;
  }
  dispose() { this.disposed = true; }
}
class FakeTexture {
  static instances = [];
  static TRILINEAR_SAMPLINGMODE = 3;
  static CLAMP_ADDRESSMODE = 0;
  constructor(url, scene, noMipmap, invertY, sampling, onLoad, onError) {
    this.url = url;
    this.noMipmap = noMipmap;
    this.onLoad = onLoad;
    this.onError = onError;
    this.disposed = false;
    this.anisotropicFilteringLevel = 1;
    FakeTexture.instances.push(this);
  }
  dispose() { this.disposed = true; }
  getBaseSize() { return { width: 1024, height: 768 }; }
}

const geometryCalls = { fit: 0, record: 0, transform: 0, sync: 0, light: 0 };

const context = {
  console,
  Date,
  Math,
  JSON,
  setTimeout: callback => callback(),
  scene: {},
  galleryArtworkDefaultFitMode: 'contain',
  galleryArtworkStorageBucket: 'bucket',
  galleryFastStartRuntime: { stateApplyActive: false, deferredArtworkLoads: [], deferredFullArtworkLoads: [] },
  galleryArtworkCoreRuntime: {
    stage: '12C66C6A1', schema: 'gallery-artwork-runtime.v1', registry: Object.create(null),
    generatedIds: 0, invalidatedLoads: 0, staleCallbacksIgnored: 0, queuesCleared: 0,
    atomicSwaps: 0, lastReason: 'initial'
  },
  galleryExhibitionRuntime: { staleOwnerCallbacksBlocked: 0 },
  isGalleryEntityOwnerActive: () => true,
  setGalleryOwnedEntityDisabled: () => false,
  galleryKtx2Runtime: { successfulLoads: 0, fallbackLoads: 0, lastError: null },
  BABYLON: {
    StandardMaterial: FakeMaterial,
    Color3: class { constructor(r, g, b) { this.r = r; this.g = g; this.b = b; } },
    Texture: FakeTexture
  },
  rememberArtworkImageStateWithoutDisplay: () => true,
  queueGalleryFastStartArtworkLoad: () => true,
  getArtworkImageUrlFromState: state => state.imageUrl || '',
  removeArtworkImageFromMesh: () => false,
  applyArtworkImageBaseMaterial: artwork => { artwork.material = artwork.material || new FakeMaterial('base'); },
  setArtworkTransformState: () => { geometryCalls.transform += 1; },
  getArtworkImagePlane: artwork => artwork.metadata.imagePlane,
  getGalleryStreamingTierForObject: () => 'deferred',
  registerGalleryStartupArtworkTextureLoad: () => () => {},
  fitArtworkImagePlaneToTexture: () => { geometryCalls.fit += 1; },
  recordArtworkTextureDimensionsWithoutGeometry: () => { geometryCalls.record += 1; },
  syncDetachedArtworkImagePlane: () => { geometryCalls.sync += 1; },
  updateArtworkLight: () => { geometryCalls.light += 1; },
  updateArtworkImageUi: () => {},
  updateArtworkTransformUi: () => {},
  refreshCommonLightingMaterialSupport: () => {},
  scheduleGalleryFastStartFullArtworkUpgrade: () => {},
  isGalleryKtx2Url: () => false,
  cloneGalleryFastStartState: value => ({ ...(value || {}) }),
  restoreArtworkPlaceholderBaseMaterial: () => {},
  notifyGalleryStatus: () => {},
  getArtworkTextureNoMipmap: () => false,
  isGalleryDeviceProfileMobile: () => false,
  isArtworkDeleted: artwork => !!artwork.metadata.deletedArtwork
};
vm.createContext(context);
const names = [
  'normalizeGalleryArtworkId', 'createGalleryArtworkId', 'ensureArtworkIdentity',
  'getArtworkTextureLoadGeneration', 'removeArtworkFromStreamingQueues',
  'invalidateArtworkTextureLoad', 'prepareArtworkTextureLoadRequest',
  'isArtworkTextureLoadCurrent', 'disposeArtworkImageMaterialInstance', 'applyArtworkImageState'
];
vm.runInContext(names.map(name => extractFunction(source, name)).join('\n\n'), context);

function makeArtwork() {
  const plane = {
    material: null,
    enabled: false,
    setEnabled(value) { this.enabled = !!value; },
    isEnabled() { return this.enabled; }
  };
  return {
    name: 'Artwork_Async', uniqueId: 99, metadata: { imagePlane: plane }, material: null,
    isDisposed: () => false,
    computeWorldMatrix: () => {}
  };
}

const artwork = makeArtwork();
assert.equal(context.applyArtworkImageState(artwork, { imageUrl: 'first.webp' }), true);
const firstTexture = FakeTexture.instances.at(-1);
const firstMaterial = artwork.metadata.imageMaterial;
assert.equal(artwork.metadata.imagePlane.enabled, true, 'Assigned frame must not be hidden while first texture loads');
assert.equal(firstTexture.url, 'first.webp');

assert.equal(context.applyArtworkImageState(artwork, { imageUrl: 'second.webp' }), true);
const secondTexture = FakeTexture.instances.at(-1);
const secondLoadingMaterial = secondTexture === firstTexture ? null : secondTexture;
assert.ok(secondLoadingMaterial, 'Second generation texture was not created');
assert.equal(artwork.metadata.imageMaterial, firstMaterial, 'Previous valid/loading material must stay visible until replacement is ready');

secondTexture.onLoad();
const secondMaterial = artwork.metadata.imageMaterial;
assert.notEqual(secondMaterial, firstMaterial, 'Newest generation did not atomically take ownership');
assert.equal(artwork.metadata.imagePlane.material, secondMaterial);
assert.equal(artwork.metadata.galleryStreaming.textureUrl, 'second.webp');
assert.equal(artwork.metadata.galleryStreaming.textureState, 'full');
assert.equal(firstMaterial.disposed, true, 'Previous material must be disposed after successful swap');

firstTexture.onLoad();
assert.equal(artwork.metadata.imageMaterial, secondMaterial, 'Stale callback overwrote the newest artwork texture');
assert.equal(artwork.metadata.imagePlane.material, secondMaterial, 'Stale callback changed visible plane material');
assert.ok(context.galleryArtworkCoreRuntime.staleCallbacksIgnored >= 1, 'Stale callback was not recorded');

assert.equal(context.applyArtworkImageState(artwork, { imageUrl: 'third.webp' }), true);
const thirdTexture = FakeTexture.instances.at(-1);
context.invalidateArtworkTextureLoad(artwork, 'delete-test');
artwork.metadata.deletedArtwork = true;
thirdTexture.onLoad();
assert.equal(artwork.metadata.imageMaterial, secondMaterial, 'Late callback resurrected a deleted/replaced generation');
assert.equal(artwork.metadata.imagePlane.material, secondMaterial, 'Late callback changed the visible material after invalidation');

// A Preview -> Full upgrade must swap material/texture without changing geometry, bounds or light targets.
const isolatedArtwork = makeArtwork();
assert.equal(context.applyArtworkImageState(isolatedArtwork, { imageUrl: 'preview.webp', transform: { scale: 1 } }), true);
const previewTexture = FakeTexture.instances.at(-1);
previewTexture.onLoad();
const geometryAfterPreview = { ...geometryCalls };
const previewMaterial = isolatedArtwork.metadata.imageMaterial;
assert.equal(context.applyArtworkImageState(isolatedArtwork, {
  imageUrl: 'full.webp',
  transform: { scale: 2 },
  _galleryTextureOnlyUpgrade: true
}), true);
const fullTexture = FakeTexture.instances.at(-1);
fullTexture.onLoad();
assert.notEqual(isolatedArtwork.metadata.imageMaterial, previewMaterial, 'Full texture did not atomically replace Preview material');
assert.equal(geometryCalls.fit, geometryAfterPreview.fit, 'Texture-only Full upgrade refitted artwork geometry');
assert.equal(geometryCalls.transform, geometryAfterPreview.transform, 'Texture-only Full upgrade reapplied artwork transform');
assert.equal(geometryCalls.sync, geometryAfterPreview.sync, 'Texture-only Full upgrade resynced detached geometry');
assert.equal(geometryCalls.light, geometryAfterPreview.light, 'Texture-only Full upgrade rebuilt artwork light targets');
assert.equal(geometryCalls.record, geometryAfterPreview.record + 1, 'Texture-only Full upgrade did not record final texture dimensions');

console.log('Stage 12C66C6A1 artwork async atomic-swap, stale-callback and texture-only upgrade tests passed.');
