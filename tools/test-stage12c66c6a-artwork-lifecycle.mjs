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

const names = [
  'normalizeGalleryArtworkId',
  'createGalleryArtworkId',
  'ensureArtworkIdentity',
  'unregisterArtworkIdentity',
  'getArtworkById',
  'getArtworkTextureLoadGeneration',
  'removeArtworkFromStreamingQueues',
  'invalidateArtworkTextureLoad',
  'prepareArtworkTextureLoadRequest',
  'isArtworkTextureLoadCurrent',
  'getArtworkImageState',
  'getArtworkImageStateForSave',
  'queueGalleryFastStartArtworkLoad'
];

const context = {
  console,
  Date,
  Math,
  JSON,
  galleryArtworkCoreRuntime: {
    stage: '12C66C6A', schema: 'gallery-artwork-runtime.v1', registry: Object.create(null),
    generatedIds: 0, invalidatedLoads: 0, staleCallbacksIgnored: 0, queuesCleared: 0,
    atomicSwaps: 0, lastReason: 'initial'
  },
  galleryFastStartRuntime: { deferredArtworkLoads: [], deferredFullArtworkLoads: [] },
  getGalleryStreamingZoneIdForObject: () => 'zone-a',
  getGalleryStreamingTierForZone: () => 'critical',
  cloneGalleryFastStartState: value => JSON.parse(JSON.stringify(value || {})),
  isArtworkDeleted: artwork => !!artwork.metadata.deletedArtwork
};
vm.createContext(context);
vm.runInContext(names.map(name => extractFunction(source, name)).join('\n\n'), context);

function artwork(name, uniqueId) {
  return { name, uniqueId, metadata: {}, isDisposed: () => false };
}

const first = artwork('Artwork_7', 7);
const second = artwork('Artwork_7', 8);
const firstId = context.ensureArtworkIdentity(first);
const secondId = context.ensureArtworkIdentity(second);
assert.equal(firstId, 'artwork:Artwork_7');
assert.notEqual(secondId, firstId, 'Registry collision must not merge two objects');
assert.equal(context.getArtworkById(firstId), first);

const request1 = context.prepareArtworkTextureLoadRequest(first, { imageUrl: 'one.jpg', _galleryTemporary: 'remove-on-save' }, 'first');
assert.equal(request1._galleryArtworkLoadGeneration, 1);
assert.equal(request1._galleryArtworkId, firstId);
context.galleryFastStartRuntime.deferredArtworkLoads.push({ artwork: first, artworkId: firstId, key: firstId, generation: 1 });
context.galleryFastStartRuntime.deferredFullArtworkLoads.push({ artwork: first, artworkId: firstId, key: firstId, generation: 1 });

const request2 = context.prepareArtworkTextureLoadRequest(first, { imageUrl: 'two.jpg' }, 'replace');
assert.equal(request2._galleryArtworkLoadGeneration, 2);
assert.equal(context.galleryFastStartRuntime.deferredArtworkLoads.length, 0, 'Replace must clear preview queue');
assert.equal(context.galleryFastStartRuntime.deferredFullArtworkLoads.length, 0, 'Replace must clear full queue');
assert.equal(context.isArtworkTextureLoadCurrent(first, 1, firstId), false, 'Old callback must be stale');
assert.equal(context.isArtworkTextureLoadCurrent(first, 2, firstId), true, 'Newest generation must own the artwork');

first.metadata.artworkImage = { imageUrl: 'two.jpg', imageUrlMobile: 'two-mobile.webp', _galleryArtworkLoadGeneration: 2, _galleryResolvedTextureUrl: 'runtime.webp' };
const saved = context.getArtworkImageStateForSave(first);
assert.equal(saved.artworkId, firstId);
assert.equal(saved.imageUrl, 'two.jpg');
assert.equal(saved._galleryArtworkLoadGeneration, undefined);
assert.equal(saved._galleryResolvedTextureUrl, undefined);

assert.equal(context.queueGalleryFastStartArtworkLoad(first, request2), true);
assert.equal(context.galleryFastStartRuntime.deferredArtworkLoads.length, 1);
assert.equal(context.galleryFastStartRuntime.deferredArtworkLoads[0].artworkId, firstId);
assert.equal(context.galleryFastStartRuntime.deferredArtworkLoads[0].generation, 2);
assert.equal(first.metadata.galleryStreaming.queued, true);

context.invalidateArtworkTextureLoad(first, 'delete');
context.unregisterArtworkIdentity(first);
assert.equal(context.getArtworkById(firstId), null);
assert.equal(context.isArtworkTextureLoadCurrent(first, 2, firstId), false);

console.log('Stage 12C66C6A artwork identity, generation and queue lifecycle tests passed.');
