import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  SHARED_ASSET_VALIDATION_SCHEMA,
  SHARED_ASSET_VALIDATOR_VERSION,
  getDefaultSharedAssetRuntimeMetadata,
  normalizeSharedAssetRuntimeMetadata,
  isCurrentSharedAssetValidation
} from '../src/validation/shared-asset-validation.js';
import {
  SHARED_ASSET_STATE_SCHEMA,
  buildSharedAssetManifest,
  collectSharedAssetReferences,
  findLegacyFrameCatalogMatch
} from '../src/runtime/shared-asset-state.js';
import { createSharedAssetApi, SHARED_ASSET_BUCKET, SHARED_ASSET_STAGE } from '../src/data/shared-asset-api.js';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'));
const apiSource = fs.readFileSync(new URL('src/data/shared-asset-api.js', root), 'utf8');
const validationSource = fs.readFileSync(new URL('src/validation/shared-asset-validation.js', root), 'utf8');
const workerSource = fs.readFileSync(new URL('src/workers/shared-asset-glb-validator-worker.js', root), 'utf8');
const stateSource = fs.readFileSync(new URL('src/runtime/shared-asset-state.js', root), 'utf8');
const assetWorkspaceSource = fs.readFileSync(new URL('src/bootstrap/admin-asset-workspace.js', root), 'utf8');
const adminSource = fs.readFileSync(new URL('src/bootstrap/admin-workspace-bootstrap.js', root), 'utf8');
const gallerySource = fs.readFileSync(new URL('src/Gallery_V0_11.js', root), 'utf8');

function expect(label, ok) {
  if (!ok) throw new Error(`V13.1 Shared Asset invariant failed: ${label}`);
  console.log(`✓ ${label}`);
}

expect('current package identity is V14.1.10', pkg.version === '0.14.2-v14-2-2-exhibition-creation-targeting');
expect('Shared Asset constants expose V13.1 / shared-assets', SHARED_ASSET_STAGE === 'V13.1' && SHARED_ASSET_BUCKET === 'shared-assets');
expect('independent Shared Asset validator schema is frozen', SHARED_ASSET_VALIDATION_SCHEMA === 'exhibition-platform-shared-asset-validation.v1' && SHARED_ASSET_VALIDATOR_VERSION === 'V13.1');
expect('renderable GLB worker preserves Shared Asset prop/frame and adds Sculpture validation without Gallery Space roles', workerSource.includes('["prop","frame","sculpture"]') && workerSource.includes('assetType') && !workerSource.includes('["floor","walls","ceiling","props"]'));
expect('Shared Asset API uses guarded canonical RPCs', apiSource.includes('admin_create_shared_asset') && apiSource.includes('admin_create_shared_asset_version') && apiSource.includes('admin_register_shared_asset_version_binary') && apiSource.includes('admin_publish_shared_asset_version'));
expect('immutable upload uses UUID version path returned by server and no upsert', apiSource.includes('version.storage_path') && apiSource.includes('upsert: false'));
expect('Shared Asset state contract remains separate from Venue props', stateSource.includes('exhibition-platform-state-assets.v1') && !stateSource.includes('venue_assets'));
expect('V13.2 Asset Manager is a separate left-workspace module', assetWorkspaceSource.includes('ADMIN_ASSET_WORKSPACE_STAGE = "V13.6"') && assetWorkspaceSource.includes('Asset Library') && assetWorkspaceSource.includes('UPLOAD NEW GLB VERSION'));
expect('V13.2 admin exposes three left top-level sections', adminSource.includes('data-section=\"exhibitions\"') && adminSource.includes('data-section=\"galleries\"') && adminSource.includes('data-section=\"assets\"'));
expect('V13.2 thumbnail API uses guarded Shared Asset RPCs', apiSource.includes('admin_register_shared_asset_thumbnail') && apiSource.includes('admin_clear_shared_asset_thumbnail') && apiSource.includes('/thumbnails/'));
expect('V13.3 catalog exposes desktop drag and tap PLACE without async dragstart', assetWorkspaceSource.includes('application/x-exhibition-shared-asset') && assetWorkspaceSource.includes('PLACE PROP') && !assetWorkspaceSource.includes('tile.addEventListener("dragstart", async'));
expect('V13.3 left workspace delegates placement to the live exact Gallery runtime identity', adminSource.includes('beginSharedAssetPropPlacement') && adminSource.includes('getPlacementContext') && adminSource.includes('GalleryApp.getActiveExhibition') && adminSource.includes('GalleryApp.getSpaceDefinition') && adminSource.includes('venueVersionId'));
expect('V13.3 serializes Props separately from sculptures', gallerySource.includes('assetInstances: artSpheres.filter(isSharedAssetPropSlot)') && gallerySource.includes('spheres: artSpheres.filter(function (sphere) { return !isSharedAssetPropSlot(sphere); }'));
expect('V13.3 Shared Prop deletion never queues Shared Asset binary cleanup', gallerySource.includes('if (isSharedAssetPropSlot(slot))') && gallerySource.includes('deleteSharedAssetPropInstance(slot') && gallerySource.includes('Shared Asset binary remains untouched'));
expect('V13.3 Props are excluded from Sculpture Tour/Inspect semantics', gallerySource.includes('if (isSharedAssetPropSlot(object)) return false') && gallerySource.includes('if (sculptureSlot && isSharedAssetPropSlot(sculptureSlot)) return null'));
expect('V13.3 Prop runtime exposes placement bridge and contextual inspector', gallerySource.includes('beginSharedAssetPropPlacement: beginSharedAssetPropPlacement') && gallerySource.includes('createEditorSection("PROP")') && gallerySource.includes('PROP TRANSFORM'));
expect('V13.4 Frame tiles expose artwork-only drag and click binding', assetWorkspaceSource.includes('exhibition-platform-frame-binding.v1') && assetWorkspaceSource.includes('application/x-exhibition-shared-frame') && assetWorkspaceSource.includes('bindFrameToTarget'));
expect('V13.4 FRAME CHANGE opens left Frames Browser without changing Scene context', gallerySource.includes('exhibition-platform:open-frame-browser') && adminSource.includes('assetWorkspace.beginFrameBinding(target)') && adminSource.includes('updateAssetsUrl({ filter: "frame" })'));
expect('V13.4 right artwork inspector is compact CHANGE/REMOVE only', gallerySource.includes('artworkFrameChangeButton.innerText = "CHANGE"') && gallerySource.includes('artworkFrameRemoveButton.innerText = "REMOVE"') && !gallerySource.includes('var artworkFrameGrid = document.createElement("div")'));
expect('V13.4 Frame state writes stable Asset IDs while retaining legacy storage fallback', gallerySource.includes('assetId: frameState.assetId || null') && gallerySource.includes('assetVersionId: frameState.assetVersionId || null') && gallerySource.includes('storagePath: frameState.storagePath'));
expect('V13.4 Frame drag accepts artwork targets only', gallerySource.includes('sharedAssetFrameDrop') && gallerySource.includes('pickGalleryArtworkFromPointer') && gallerySource.includes('Drop the Frame directly on an artwork.'));

assert.deepEqual(getDefaultSharedAssetRuntimeMetadata('prop'), { placementMode: 'floor', collisionMode: 'none', defaultScale: 1 });
assert.equal(getDefaultSharedAssetRuntimeMetadata('frame').placementMode, 'artwork-only');
assert.equal(normalizeSharedAssetRuntimeMetadata('frame', { innerWidthRatio: 0.75 }).innerWidthRatio, 0.75);
assert.throws(() => normalizeSharedAssetRuntimeMetadata('frame', { placementMode: 'floor' }), /artwork-only/);
assert.throws(() => normalizeSharedAssetRuntimeMetadata('prop', { defaultScale: 0 }), /greater than zero/);

expect('V13.5 unavailable Prop runtime preserves references and exposes retry', gallerySource.includes('MODEL UNAVAILABLE — reference preserved') && gallerySource.includes('retrySharedAssetPropRuntime') && gallerySource.includes('sharedAssetUnavailable'));
expect('V13.5 unavailable Frame binding preserves state and exposes retry', gallerySource.includes('MODEL UNAVAILABLE — binding preserved') && gallerySource.includes('artworkFrameRetryButton') && gallerySource.includes('artworkFrameUnavailable'));
expect('V13.5 shared asset integrity diagnostics expose unavailable Props and Frames', gallerySource.includes('exhibition-platform-shared-asset-integrity.v1') && gallerySource.includes('getSharedAssetIntegrityDebug'));
expect('V13.5 archive confirmation is reference-aware', assetWorkspaceSource.includes('indexed Exhibition reference') && assetWorkspaceSource.includes('Existing references were preserved'));


const assetId = '11111111-1111-4111-8111-111111111111';
const propVersionId = '22222222-2222-4222-8222-222222222222';
const frameVersionId = '33333333-3333-4333-8333-333333333333';
const artworkId = '44444444-4444-4444-8444-444444444444';
const propInstanceId = '55555555-5555-4555-8555-555555555555';

// V13.6 Production Closure local invariants. Real production content/switch/mobile/storage
// checks remain a manual closure gate, but the reusable state/reference contracts are
// exercised here inside the consolidated Shared Asset regression suite.
expect('V13.6 aggregate production-closure runtime snapshot is exposed', gallerySource.includes('getV13ProductionClosureDebug') && gallerySource.includes('exhibition-platform-v13-production-closure.v1') && gallerySource.includes('currentSnapshotHealthy'));
expect('V13.6 closure snapshot carries exact Space identity and lifecycle ownership counters', gallerySource.includes('venueVersionId: galleryActiveVenueVersionId') && gallerySource.includes('sameSpaceSwitchCount') && gallerySource.includes('fullRuntimeResetCount') && gallerySource.includes('ownershipViolations') && gallerySource.includes('workspaceModeAuditFailures'));

const closureTenInstances = Array.from({ length: 10 }, (_, index) => ({ instanceId: `bench-copy-${String(index + 1).padStart(2, '0')}`, assetVersionId: propVersionId }));
const closureTenRefs = collectSharedAssetReferences({ editor: { assetInstances: closureTenInstances }, artworks: [] });
assert.equal(closureTenRefs.length, 10);
assert.equal(new Set(closureTenRefs.map((entry) => entry.usageKey)).size, 10);
expect('V13.6 one immutable Prop version can back ten unique Exhibition instances', true);
assert.throws(() => collectSharedAssetReferences({ editor: { assetInstances: [{ instanceId: 'same', assetVersionId: propVersionId }, { instanceId: 'same', assetVersionId: propVersionId }] } }), /Duplicate Shared Asset prop usage key/);
expect('V13.6 duplicate Prop instance identity is rejected instead of silently collapsing usage', true);

const closureMixedRefs = collectSharedAssetReferences({
  editor: { assetInstances: closureTenInstances },
  artworks: [
    { artworkId: 'closure-artwork-a', frame: { assetVersionId: frameVersionId } },
    { artworkId: 'closure-artwork-b', frame: { assetVersionId: frameVersionId } }
  ]
});
assert.equal(closureMixedRefs.filter((entry) => entry.usageType === 'prop-instance').length, 10);
assert.equal(closureMixedRefs.filter((entry) => entry.usageType === 'artwork-frame').length, 2);
expect('V13.6 Prop and Frame reference domains stay independent in one Exhibition state', true);
expect('V13.6 hiding ASSETS cancels active Prop/Frame tools and binding target', assetWorkspaceSource.includes('onCancelPropPlacement({ reason: "workspace-hidden" })') && assetWorkspaceSource.includes('onCancelFrameDrag({ reason: "workspace-hidden" })') && assetWorkspaceSource.includes('state.frameBindingTarget = null'));
expect('V13.6 Gallery-host ASSETS remains management-only', assetWorkspaceSource.includes('Open Assets from an Exhibition to place Props.') && assetWorkspaceSource.includes('Open Assets from an Exhibition to assign Frames.'));
expect('V13.6 inline Admin remount keeps one Frame Browser handler', adminSource.includes('__exhibitionPlatformOpenFrameBrowserHandler') && adminSource.includes('removeEventListener("exhibition-platform:open-frame-browser"'));
expect('runtime metadata enforces Frame artwork-only and Prop floor contracts', true);

const manifest = buildSharedAssetManifest([
  { assetId, assetVersionId: propVersionId, assetType: 'prop', storageBucket: 'shared-assets', storagePath: `assets/${assetId}/versions/${propVersionId}/model.glb`, fileHash: 'sha256:' + 'a'.repeat(64), runtimeMetadata: { placementMode: 'floor' } }
]);
assert.equal(manifest.schema, SHARED_ASSET_STATE_SCHEMA);
assert.equal(manifest.versions[propVersionId].assetType, 'prop');
expect('state manifest is keyed by immutable assetVersionId', true);

const refs = collectSharedAssetReferences({
  assetInstances: [{ instanceId: propInstanceId, assetVersionId: propVersionId }],
  artworks: [{ artworkId, frame: { assetVersionId: frameVersionId } }]
});
assert.deepEqual(refs, [
  { assetVersionId: propVersionId, usageType: 'prop-instance', usageKey: propInstanceId },
  { assetVersionId: frameVersionId, usageType: 'artwork-frame', usageKey: artworkId }
]);
expect('state reference extractor finds Prop instances and artwork-only Frames', true);

const legacy = findLegacyFrameCatalogMatch(
  { storageBucket: 'gallery-artworks', storagePath: 'main/frames/classic-oak.glb' },
  [{ id: assetId, published_storage_bucket: 'gallery-artworks', published_storage_path: 'main/frames/classic-oak.glb' }]
);
assert.equal(legacy.id, assetId);
expect('legacy path-based Frames map non-destructively to seeded catalog entries', true);

const report = {
  schema: SHARED_ASSET_VALIDATION_SCHEMA,
  validatorVersion: SHARED_ASSET_VALIDATOR_VERSION,
  assetType: 'prop',
  valid: true,
  fileHash: 'sha256:' + 'b'.repeat(64),
  fileSize: 1024,
  glb: { meshCount: 1, renderablePrimitiveCount: 1, reachableRenderablePrimitiveCount: 1 }
};
assert.equal(isCurrentSharedAssetValidation(report, { assetType: 'prop', fileSize: 1024 }), true);
assert.equal(isCurrentSharedAssetValidation({ ...report, validatorVersion: 'old' }, { assetType: 'prop' }), false);
expect('validation freshness binds schema/version/type/hash/size/renderable geometry', true);

const rpcCalls = [];
const mockSupabase = {
  rpc(name, args) {
    rpcCalls.push([name, args]);
    if (name === 'admin_list_shared_assets') return Promise.resolve({ data: [{ id: assetId, asset_type: 'prop' }], error: null });
    if (name === 'admin_get_shared_asset') return Promise.resolve({ data: [{ asset: { id: assetId, asset_type: 'prop' }, versions: [] }], error: null });
    throw new Error(`Unexpected mock RPC: ${name}`);
  },
  storage: { from() { return { getPublicUrl(path) { return { data: { publicUrl: `https://example.invalid/${path}` } }; } }; } }
};
const api = createSharedAssetApi({ supabase: mockSupabase });
const listed = await api.list({ assetType: 'prop', search: 'bench' });
assert.equal(listed.length, 1);
assert.equal(rpcCalls[0][0], 'admin_list_shared_assets');
assert.equal(rpcCalls[0][1].p_asset_type, 'prop');
assert.equal((await api.get(assetId)).asset.id, assetId);
expect('data adapter maps catalog/get reads to V13.1 RPC surface', true);

console.log('V13.1 foundation + V13.2 Asset Manager + V13.3 Prop placement + V13.4 Frame migration + V13.5 hardening invariants passed under V13.6 closure candidate.');
