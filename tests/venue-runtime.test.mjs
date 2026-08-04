import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  normalizeVenueManifest,
  validateVenueManifest,
  createGalleryRuntimeContext,
  createVenueRuntimeRegistry,
  registerVenueAssetResult,
  resolveVenueMeshDescriptor,
  getVenueRegistryMeshByStableId,
  getVenueRegistryAnchor,
  getVenueRegistryAnchors,
  createVenueRegistryAudit
} from '../src/runtime/venue-runtime.js';

const raw = JSON.parse(fs.readFileSync(new URL('../venues/berryboy-main/versions/v1/manifest.json', import.meta.url), 'utf8'));
assert.equal(validateVenueManifest(raw).valid, true, 'berryboy-main/v1 manifest must validate');
const manifest = normalizeVenueManifest(raw, { manifestUrl: 'https://example.test/venues/berryboy-main/versions/v1/manifest.json' });
const context = createGalleryRuntimeContext({
  venue: { venueId: 'berryboy-main', versionId: 'v1' },
  exhibition: { exhibitionId: '00000000-0000-4000-8000-000000000001', exhibitionSlug: 'berryboy-main', stateRecordId: '00000000-0000-4000-8000-000000000001', storageScope: 'exhibitions/00000000-0000-4000-8000-000000000001' }
}, manifest);
assert.equal(context.venue.venueId, 'berryboy-main');
assert.equal(context.exhibition.previousStateRecordId, '00000000-0000-4000-8000-000000000001:previous');
assert.equal(manifest.assets.length, 4, 'current venue must be data-driven from four manifest assets');

const duplicate = structuredClone(raw);
duplicate.assets.push(structuredClone(duplicate.assets[0]));
assert.equal(validateVenueManifest(duplicate).valid, false, 'duplicate assetId must be rejected');

const combinedRaw = {
  schema: 'berryboy-venue-manifest.v1', venueId: 'combined-hall', versionId: 'v7',
  assets: [{ assetId: 'single-building', role: 'building', path: './building.glb', critical: true }],
  spawnPoints: [{ id: 'safe', safe: true, position: { x: 0, y: 1.6, z: 0 }, target: { x: 0, y: 1.6, z: 1 } }],
  artworkAnchors: [{ id: 'art-anchor-1', nodeId: 'node-anchor-art' }],
  sculptureAnchors: [{ id: 'sculpt-anchor-1', nodeId: 'node-anchor-sculpt' }]
};
const combinedManifest = normalizeVenueManifest(combinedRaw, { manifestUrl: 'https://example.test/combined/manifest.json' });
const combinedContext = createGalleryRuntimeContext({ exhibition: { exhibitionId: 'exhibition-a', stateRecordId: 'exhibition-a', storageScope: 'exhibitions/exhibition-a' } }, combinedManifest);
const registry = createVenueRuntimeRegistry(combinedManifest);
const combinedAsset = combinedManifest.assets[0];
const meshes = [
  { name: 'Whatever_001', id: 'a', metadata: { berryboyType: 'wall', surfaceId: 'surface-wall-a', berryboyNodeId: 'node-wall-a' } },
  { name: 'NoNameDependency', id: 'b', metadata: { berryboyType: 'floor', surfaceId: 'surface-floor-a', berryboyNodeId: 'node-floor-a' } },
  { name: 'AnchorA', id: 'c', metadata: { berryboyType: 'artworkAnchor', anchorId: 'art-anchor-1', berryboyNodeId: 'node-anchor-art' } },
  { name: 'AnchorB', id: 'd', metadata: { berryboyType: 'sculptureAnchor', anchorId: 'sculpt-anchor-1', berryboyNodeId: 'node-anchor-sculpt' } },
  { name: 'Collider', id: 'e', metadata: { berryboyType: 'collision', berryboyNodeId: 'node-collision-a' } }
];
registerVenueAssetResult(registry, combinedAsset, meshes, combinedContext);
assert.equal(registry.visual.walls.length, 1);
assert.equal(registry.visual.floors.length, 1);
assert.equal(registry.collision.walkBlocking.length, 2, 'wall and collision role must enter collision registry');
assert.equal(getVenueRegistryMeshByStableId(registry, 'surface-wall-a'), meshes[0]);
assert.equal(getVenueRegistryMeshByStableId(registry, 'node-floor-a'), meshes[1]);
assert.equal(getVenueRegistryAnchor(registry, 'art-anchor-1').mesh, meshes[2]);
assert.equal(getVenueRegistryAnchors(registry, 'sculpture')[0].mesh, meshes[3]);
assert.throws(() => registerVenueAssetResult(registry, combinedAsset, [], combinedContext), /already registered/);

const renamedMesh = { name: 'Completely_Renamed', id: 'new', metadata: { berryboyType: 'wall', surfaceId: 'surface-wall-a' } };
assert.equal(resolveVenueMeshDescriptor(renamedMesh, combinedAsset, combinedManifest, combinedContext).stableId, 'surface-wall-a', 'stable identity must not depend on mesh name');

const legacyWall = { name: 'Wall_segment_071', id: 'legacy-wall' };
const berryboyAsset = manifest.assets.find((asset) => asset.role === 'walls');
assert.equal(resolveVenueMeshDescriptor(legacyWall, berryboyAsset, manifest, context).source, 'legacy-fallback');
const otherContext = { venue: { venueId: 'other', versionId: 'v1' } };
assert.notEqual(resolveVenueMeshDescriptor(legacyWall, { ...berryboyAsset, role: 'building' }, manifest, otherContext).source, 'legacy-fallback', 'legacy naming fallback must not leak to another venue');

const audit = createVenueRegistryAudit(registry);
assert.equal(audit.assets.length, 1);
assert.equal(audit.unresolved.length, 0);
assert.equal(audit.stableNodes, 5);
console.log('Venue Runtime tests passed.');
