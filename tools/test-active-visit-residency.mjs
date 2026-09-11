import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/Gallery_V0_11.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function functionBody(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} missing`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

assert.equal(pkg.version, '0.14.2-v14-2-3-creation-scene-lifecycle');
assert.ok(pkg.description.includes('V14.2.3 Creation to Scene Lifecycle Integration'));
assert.ok(pkg.scripts['test:residency']?.includes('test-active-visit-residency.mjs'));
assert.ok(pkg.scripts.test.includes('test:residency'));

// Physical Space shell: preserve normal scene frustum behavior globally, but force the exact
// wall/floor/ceiling meshes to remain in Babylon's active set for the active visit.
assert.ok(source.includes('scene.skipFrustumClipping = false'), 'global frustum clipping must remain enabled');
assert.ok(!source.includes('scene.skipFrustumClipping = true'), 'V14.1.10 must not globally disable frustum clipping');
assert.ok(source.includes('schema: "gallery-active-visit-residency.v1"'), 'active-visit residency authority missing');
const protect = functionBody('protectGalleryActiveVisitMesh');
assert.ok(protect.includes('mesh.alwaysSelectAsActiveMesh = true'), 'protected Space shell must support active-mesh retention');
assert.ok(protect.includes('galleryActiveVisitForceActiveSelection'), 'force-active selection metadata/debug proof missing');
const lock = functionBody('lockGalleryActiveVisitResidency');
assert.ok(lock.includes('[wallMeshes, floorMeshes, ceilingMeshes]'), 'visit lock must cover physical Space surfaces');
assert.ok(lock.includes('forceActiveSelection: true'), 'physical Space surfaces must be force-active during visit');
assert.ok(lock.includes('propMeshes'), 'assigned Venue Props must be kept resident');
assert.ok(lock.includes('artworkFrameRuntime'), 'Frame meshes must be protected');
assert.ok(lock.includes('model3dRuntime'), 'Sculpture/Shared Prop runtime meshes must be protected');
assert.ok(lock.includes('suppressGalleryActiveVisitBackgroundMutationQueues('), 'visit lock must purge stale background mutation queues');
assert.ok(source.includes('suppressedArtworkQueueEntries') && source.includes('activeArtworkQueue'), 'post-entry Preview queue suppression/debug missing');

// The residency lock must be established before final GPU + quiet proof, so readiness certifies
// the same configuration used after Start exploring.
const settle = functionBody('waitForGalleryWalkthroughFinalSettle');
const commitIndex = settle.indexOf('flushGalleryWalkthroughVisibleHydrationGlobalRefresh(');
const lockIndex = settle.indexOf('lockGalleryActiveVisitResidency(');
const warmIndex = settle.indexOf('runGalleryWalkthroughGpuWarmup(');
const quietIndex = settle.indexOf('waitForGalleryForegroundQuietFrames(');
assert.ok(commitIndex >= 0 && lockIndex > commitIndex && warmIndex > lockIndex && quietIndex > warmIndex,
  'final settle order must be visible terminal -> commit -> visit lock -> GPU warmup -> quiet proof');

// No mobile/current-visit model eviction or re-import loop.
const suspend = functionBody('suspendModel3dForStreaming');
assert.ok(suspend.includes('isGalleryActiveVisitResidencyLocked()') && suspend.includes('isGalleryEntityOwnerActive(slot)'),
  'current active model suspension must be guarded by visit residency');
assert.ok(suspend.indexOf('isGalleryActiveVisitResidencyLocked()') < suspend.indexOf('disposeModel3dRuntime'),
  'visit suspension guard must run before runtime disposal');
const queueModel = functionBody('queueModelForGalleryStreaming');
assert.ok(queueModel.includes('isGalleryActiveVisitResidencyLocked()') && queueModel.includes('isGalleryEntityOwnerActive(slot)'),
  'active visit must reject normal current-model requeue');
const memoryBudget = functionBody('maintainGalleryStreamingMemoryBudget');
assert.ok(memoryBudget.includes('if (isGalleryActiveVisitResidencyLocked())'), 'mobile memory maintenance must have active-visit no-reload branch');
assert.ok(memoryBudget.indexOf('if (isGalleryActiveVisitResidencyLocked())') < memoryBudget.indexOf('suspendModel3dForStreaming('),
  'visit no-reload branch must execute before any model eviction');
const fastLane = functionBody('tryStartGalleryCriticalModelFastLane');
assert.ok(fastLane.includes('isGalleryActiveVisitResidencyLocked()'), 'critical model fast lane must be closed after visit lock');
const pump = functionBody('pumpGalleryZoneStreamingQueues');
assert.ok(pump.includes('function hasEligibleArtwork()') && pump.includes('if (isGalleryActiveVisitResidencyLocked()) return false;'), 'zone pump must reject post-unlock Preview/model background work');
assert.ok(pump.includes('if (isGalleryActiveVisitResidencyLocked()) return false;'), 'zone pump eligibility must reject post-unlock model starts');
assert.ok(pump.includes('suppressedModelBackgroundStarts'), 'post-lock background model-start suppression must be observable');

// Normal walkthrough texture quality is stable. Full quality is still available as an explicit
// Inspect action, but distance/visibility/budget maintenance may not mutate it while walking.
const queueFull = functionBody('queueGalleryArtworkFullForResidency');
assert.ok(queueFull.includes('isGalleryActiveVisitResidencyLocked() && !inspectPriority'), 'normal Full queue must be blocked during active visit');
assert.ok(queueFull.includes('explicitInspectFullRequests'), 'explicit Inspect Full requests must remain observable');
const downgrade = functionBody('downgradeGalleryArtworkToPreview');
assert.ok(downgrade.includes('isGalleryActiveVisitResidencyLocked() && isGalleryEntityOwnerActive(artwork)'), 'Full -> Preview downgrade must be blocked for active artwork');
const enforce = functionBody('enforceGalleryArtworkResidencyBudget');
assert.ok(enforce.includes('if (isGalleryActiveVisitResidencyLocked())'), 'residency budget must have stable active-visit branch');
assert.ok(enforce.includes('entry.inspectPriority === true'), 'active-visit queue cleanup must preserve explicit Inspect Full work');
const scheduleFull = functionBody('scheduleGalleryFastStartFullArtworkUpgrade');
assert.ok(scheduleFull.includes('isGalleryActiveVisitResidencyLocked()') && scheduleFull.includes('inspectPriority'), 'automatic Full scheduler must be Inspect-only after unlock');
const drainFull = functionBody('drainGalleryFastStartFullArtworkQueue');
assert.ok(drainFull.includes('isGalleryActiveVisitResidencyLocked()') && drainFull.includes('inspectPriority'), 'Full drain must not start normal quality changes after unlock');
assert.ok(source.includes('function prioritizeArtworkFullTexture('), 'explicit Inspect Full-quality path must remain available');

// Post-unlock frame diagnostics must continuously record camera-turn spikes and surface active-set misses.
const frameTelemetry = functionBody('recordGalleryActiveVisitFrameTelemetry');
assert.ok(frameTelemetry.includes('engine.getDeltaTime'), 'rolling frame-time measurement missing');
assert.ok(frameTelemetry.includes('turningSlowFrames'), 'camera-turn spike telemetry missing');
assert.ok(frameTelemetry.includes('scene.getActiveMeshes()'), 'protected Space active-set proof missing');
assert.ok(frameTelemetry.includes('surfaceActiveSelectionMisses'), 'surface active-set miss counter missing');
const mainTick = functionBody('runGalleryFrameTick');
assert.ok(mainTick.includes('recordGalleryActiveVisitFrameTelemetry();'), 'frame telemetry must run in the main render tick');
assert.ok(source.includes('getActiveVisitResidencyDebug: function ()'), 'GalleryApp active-visit residency debug API missing');
assert.ok(source.includes('postUnlockModelImports'), 'unexpected post-unlock model import diagnostic missing');

console.log('V14.1.10 active-visit no-reload residency and frame-time regression passed.');
