import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createSceneLifecycleController, getRuntimeVenueVersionKey, areRuntimesSameVenueVersion } from '../src/runtime/scene-lifecycle-controller.js';
import { shouldShowPublicSpaceIntro } from '../src/runtime/public-space-entry-policy.js';
import { buildAuthoringSpaceDefinition, buildSpaceDefinition } from '../src/runtime/space-definition-resolver.js';

if (!globalThis.window) globalThis.window = new EventTarget();
if (!window.setTimeout) window.setTimeout = setTimeout;
if (!window.clearTimeout) window.clearTimeout = clearTimeout;
if (!globalThis.CustomEvent) {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, options = {}) { super(type); this.detail = options.detail; }
  };
}
window.GalleryApp = null;

function runtime(exhibitionId, versionId, options = {}) {
  return {
    mode: options.mode || 'public',
    exhibition: {
      id: exhibitionId,
      slug: exhibitionId,
      name: exhibitionId,
      space_id: options.spaceId || 'shared-gallery',
      venue_version_id: versionId
    },
    venueVersion: { id: versionId },
    spaceDefinition: {
      id: options.spaceId || 'shared-gallery',
      venueVersionId: versionId,
      failStartup: options.failStartup === true
    }
  };
}

const engine = { id: 'persistent-engine', scenes: [] };
const canvas = { id: 'renderCanvas' };
const createdScenes = [];
let staleEvents = 0;

const engineModule = {
  createScene(receivedEngine, receivedCanvas, options) {
    assert.equal(receivedEngine, engine, 'C25 must preserve the Babylon Engine');
    assert.equal(receivedCanvas, canvas, 'C25 must preserve the canvas');
    const scene = {
      id: `scene-${createdScenes.length + 1}`,
      options,
      disposed: false,
      renderCount: 0,
      isDisposed() { return this.disposed; },
      render() { if (this.disposed) throw new Error('disposed scene rendered'); this.renderCount += 1; },
      dispose() {
        if (this.disposed) return;
        this.disposed = true;
        const index = engine.scenes.indexOf(this);
        if (index >= 0) engine.scenes.splice(index, 1);
      }
    };
    createdScenes.push(scene);
    engine.scenes.push(scene);
    queueMicrotask(() => {
      // Deliberately send one event from an unrelated lifecycle first. The waiter must ignore it.
      staleEvents += 1;
      window.dispatchEvent(new CustomEvent('gallery-interaction-ready', { detail: { lifecycleId: 'stale-c24-scene' } }));
      if (options.spaceDefinition.failStartup) {
        window.dispatchEvent(new CustomEvent('gallery-startup-failure', {
          detail: { lifecycleId: options.lifecycleId, message: 'synthetic target startup failure' }
        }));
      } else {
        window.dispatchEvent(new CustomEvent('gallery-interaction-ready', {
          detail: {
            lifecycleId: options.lifecycleId,
            venueVersionId: options.spaceDefinition.venueVersionId,
            exhibitionId: options.exhibitionId
          }
        }));
      }
    });
    return scene;
  }
};

let sameSpaceSwitchCalls = 0;
window.GalleryApp = {
  async switchExhibition(id, options) {
    sameSpaceSwitchCalls += 1;
    assert.ok(id);
    assert.equal(options.force, true);
    return true;
  }
};

const runtimeA1 = runtime('ex-a', 'venue-version-a1', { spaceId: 'main-gallery' });
const runtimeA2 = runtime('ex-b', 'venue-version-a2', { spaceId: 'main-gallery' });
const runtimeSameA1 = runtime('ex-c', 'venue-version-a1', { spaceId: 'main-gallery' });

assert.equal(getRuntimeVenueVersionKey(runtimeA1), 'venue-version-a1');
assert.equal(areRuntimesSameVenueVersion(runtimeA1, runtimeSameA1), true);
assert.equal(areRuntimesSameVenueVersion(runtimeA1, runtimeA2), false, 'same Gallery slug but another immutable version must be cross-space');

const runtimeMap = new Map([
  ['ex-a', runtimeA1],
  ['ex-b', runtimeA2],
  ['ex-c', runtimeSameA1]
]);

const sceneChanges = [];
const adapterModes = [];
const exhibitionData = { setMode(mode) { adapterModes.push(mode); return mode; } };
const controller = createSceneLifecycleController({
  engine,
  canvas,
  engineModule,
  exhibitionData,
  resolveRuntime: async (reference) => {
    if (reference === 'preflight-fail') throw new Error('synthetic preflight failure');
    const resolved = runtimeMap.get(reference);
    if (!resolved) throw new Error(`unknown runtime ${reference}`);
    return resolved;
  },
  getApp: () => window.GalleryApp,
  onSceneChanged: (scene, rt, lifecycleId, reason) => {
    sceneChanges.push({ scene, runtime: rt, lifecycleId, reason });
  },
  readinessTimeoutMs: 3000
});

const started = await controller.start(runtimeA1);
assert.equal(started.ok, true);
assert.equal(engine.scenes.length, 1);
assert.equal(controller.getActiveScene(), createdScenes[0]);
assert.equal(controller.getActiveRuntime(), runtimeA1);
assert.match(controller.getActiveLifecycleId(), /^c25-scene-/);
assert.ok(staleEvents >= 1, 'stale lifecycle event was exercised');

const firstScene = controller.getActiveScene();
const sameResult = await controller.switchTo('ex-c', { runtime: runtimeSameA1, forceRemote: true });
assert.equal(sameResult.mode, 'same-venue-version');
assert.equal(controller.getActiveScene(), firstScene, 'same immutable Gallery Version must stay resident');
assert.equal(firstScene.disposed, false);
assert.equal(engine.scenes.length, 1);
assert.equal(sameSpaceSwitchCalls, 1);

const crossResult = await controller.switchTo('ex-b', { runtime: runtimeA2, forceRemote: true });
assert.equal(crossResult.mode, 'cross-space-scene-recreate');
assert.equal(firstScene.disposed, true, 'old Scene must be disposed at a cross-version boundary');
assert.equal(engine.scenes.length, 1, 'only one live Babylon Scene may remain');
assert.notEqual(controller.getActiveScene(), firstScene);
assert.equal(controller.getActiveRuntime(), runtimeA2);

const adminSameVersion = runtime('ex-b', 'venue-version-a2', { spaceId: 'main-gallery', mode: 'admin' });
const adopted = controller.adoptRuntime(adminSameVersion, 'test-admin-adopt');
assert.equal(adopted.scene, controller.getActiveScene());
assert.equal(controller.getActiveRuntime().mode, 'admin');
assert.equal(adapterModes.at(-1), 'admin');
assert.throws(() => controller.adoptRuntime(runtimeA1), /cannot cross immutable Venue Versions/);
controller.adoptRuntime(runtimeA2, 'test-public-adopt');
assert.equal(adapterModes.at(-1), 'public');

const sceneBeforePreflightFailure = controller.getActiveScene();
await assert.rejects(
  controller.switchTo('preflight-fail', { forceRemote: true }),
  /synthetic preflight failure/
);
assert.equal(controller.getActiveScene(), sceneBeforePreflightFailure, 'preflight failure must preserve current Scene');
assert.equal(sceneBeforePreflightFailure.disposed, false);
assert.equal(engine.scenes.length, 1);

const failedTarget = runtime('ex-fail', 'venue-version-fail', { spaceId: 'broken-gallery', failStartup: true, mode: 'admin' });
await assert.rejects(
  controller.switchTo('ex-fail', { runtime: failedTarget, forceRemote: true }),
  /synthetic target startup failure/
);
assert.equal(controller.getActiveRuntime(), runtimeA2, 'post-dispose failure must restore previous canonical runtime');
assert.equal(engine.scenes.length, 1, 'rollback must still leave exactly one live Scene');
assert.equal(controller.getDebug().rollbacks, 1);
assert.equal(adapterModes.at(-1), 'public', 'rollback must restore the previous runtime data channel');

// Exercise repeated cross-space switching. Engine/canvas stay stable and old Scenes are disposed.
for (let index = 0; index < 10; index += 1) {
  const target = index % 2 === 0 ? runtimeA1 : runtimeA2;
  await controller.switchTo(target.exhibition.id, { runtime: target, forceRemote: true });
  assert.equal(engine.scenes.length, 1, `iteration ${index}: leaked live Scene`);
  assert.equal(controller.getActiveRuntime(), target);
}
assert.ok(createdScenes.filter((scene) => !scene.disposed).length === 1, 'only current Scene may be live after repeated switching');
assert.ok(controller.getDebug().sceneRecreates >= 11);

controller.dispose();
assert.equal(engine.scenes.length, 0);
assert.equal(controller.getActiveScene(), null);

// Source-level contract checks for the integration points that a controller-only fake cannot execute.
const root = new URL('../', import.meta.url);
const viewer = fs.readFileSync(new URL('src/bootstrap/gallery-viewer-bootstrap.js', root), 'utf8');
const admin = fs.readFileSync(new URL('src/bootstrap/admin-workspace-bootstrap.js', root), 'utf8');
const source = fs.readFileSync(new URL('src/Gallery_V0_11.js', root), 'utf8');
const api = fs.readFileSync(new URL('src/data/exhibition-api.js', root), 'utf8');

assert.ok(viewer.includes('createSceneLifecycleController'));
assert.ok(viewer.includes('const scene = activeScene;'), 'viewer render loop must follow mutable activeScene');
assert.ok(viewer.includes('switchPublicExhibition(reference'));
assert.ok(viewer.includes('window.ExhibitionPlatformSceneLifecycle = sceneLifecycleController'));
assert.ok(viewer.includes('sceneLifecycleController.adoptRuntime(publicRuntime'), 'same-scene Admin→Public must update lifecycle runtime identity');
assert.ok(viewer.includes('initialPublicExhibitionReference = await ensurePublicExhibitionSelection({ force: resetToHomepageAfterReload })'), 'initial discovery selection must actually drive startup');
assert.ok(admin.includes('createSceneLifecycleController'));
assert.ok(admin.includes('sceneLifecycleController.switchTo'), 'Admin Exhibition selection must use lifecycle controller');
assert.ok(source.includes('venueVersionId: galleryActiveVenueVersionId'), 'serialized/runtime identity must retain exact Venue Version');
assert.ok(source.includes('Exhibition state belongs to another Gallery Version'), 'state must reject another immutable Gallery Version');
assert.ok(source.includes('galleryDisposed = true'));
assert.ok(source.includes('gallery-scene-disposed'));
assert.ok(source.includes('galleryLifecycleId'));
assert.ok(source.includes('Cross-Space Exhibition switch requires C6C8C25 Scene lifecycle recreation'));
assert.ok(api.includes('const runtimeKey = (modeValue, id) =>'), 'Public/Admin runtime caches must be channel-qualified');
assert.ok(api.includes('public:<') === false); // implementation uses dynamic canonical key, not hard-coded one-off values
assert.ok(api.includes('requestedMode'), 'mode-specific runtime cache lookup missing');



// C6C8C25.2 — Gallery authoring preview is allowed to be structurally partial,
// while the public/publish Space resolver remains strict.
const fakeSupabase = { storage: { from(bucket) { return { getPublicUrl(path) { return { data: { publicUrl: `https://example.test/${bucket}/${path}` } }; } }; } } };
const previewVenue = { id: 'venue-preview', slug: 'preview-gallery', name: 'Preview Gallery' };
const previewVersion = { id: 'version-preview', version_number: 'v1', manifest: { schema:'exhibition-platform-venue-manifest.v1', venueId:'preview-gallery', versionId:'v1', coordinateSystem:{upAxis:'Y',units:'meters'}, spawnPoints:[] } };
const emptyPreviewSpace = buildAuthoringSpaceDefinition({ supabase: fakeSupabase, venue: previewVenue, venueVersion: previewVersion, manifest: previewVersion.manifest, assets: [] });
assert.equal(emptyPreviewSpace.authoringPartial, true);
assert.deepEqual(Object.keys(emptyPreviewSpace.assets), []);
const floorOnlyPreviewSpace = buildAuthoringSpaceDefinition({ supabase: fakeSupabase, venue: previewVenue, venueVersion: previewVersion, manifest: previewVersion.manifest, assets: [{ role:'floor', storage_bucket:'venue-runtime', storage_path:'venues/v/floor.glb' }] });
assert.deepEqual(Object.keys(floorOnlyPreviewSpace.assets), ['floor']);
assert.throws(() => buildSpaceDefinition({ supabase: fakeSupabase, venue: previewVenue, venueVersion: previewVersion, manifest: previewVersion.manifest }), /requires exactly one floor asset/);
assert.ok(admin.includes('buildGalleryAuthoringPreviewRuntime'));
assert.ok(admin.includes('context: "gallery-authoring"'));
assert.ok(admin.includes('authoringSpacePreview: true'));
assert.ok(admin.includes('Gallery authoring preview is read-only for Exhibition state.'));
assert.ok(admin.includes('restoreSelectedExhibitionPreview'));
assert.ok(admin.includes('--gallery-admin-text'));
assert.ok(admin.includes('--gallery-visual-viewport-height'));
assert.ok(source.includes('var galleryAuthoringSpacePreview = runtimeOptions.authoringSpacePreview === true'));
assert.ok(source.includes('var galleryStrictCriticalAssetNames = ["floor", "wall", "ceiling"]'));
assert.ok(source.includes('galleryCriticalAssetNames = galleryAuthoringSpacePreview ? [] : galleryStrictCriticalAssetNames.slice()'));
assert.ok(source.includes('galleryAuthoringSpacePreview ? optionalGallerySpaceAsset("floor") : requireGallerySpaceAsset("floor")'));
assert.ok(viewer.includes('currentRuntime && currentRuntime.context === "gallery-authoring" ? activePublicRuntime : currentRuntime'));

console.log('C6C8C25/C25.2 Cross-Space + Admin Gallery preview regression invariants passed.');


// C6C8C26 — public intro belongs to exact immutable Venue Version entry boundaries.
{
  const publicA1 = runtime('intro-a', 'venue-version-a1', { spaceId: 'gallery-a', mode: 'public' });
  const publicA1OtherExhibition = runtime('intro-a-other', 'venue-version-a1', { spaceId: 'gallery-a', mode: 'public' });
  const publicA2 = runtime('intro-a-v2', 'venue-version-a2', { spaceId: 'gallery-a', mode: 'public' });
  const publicB1 = runtime('intro-b', 'venue-version-b1', { spaceId: 'gallery-b', mode: 'public' });
  const adminA1 = runtime('intro-admin-a', 'venue-version-a1', { spaceId: 'gallery-a', mode: 'admin' });
  const authoringB = { ...runtime('intro-authoring-b', 'venue-version-b1', { spaceId: 'gallery-b', mode: 'admin' }), context: 'gallery-authoring' };

  assert.equal(shouldShowPublicSpaceIntro(null, publicA1, { initial: true }), true, 'initial public entry must show intro');
  assert.equal(shouldShowPublicSpaceIntro(publicA1, publicA1OtherExhibition), false, 'same exact Venue Version Exhibition switch must not re-show intro');
  assert.equal(shouldShowPublicSpaceIntro(publicA1, publicB1), true, 'cross-Gallery Venue Version entry must show intro');
  assert.equal(shouldShowPublicSpaceIntro(publicB1, publicA1), true, 'return to a previously visited Space must show intro again');
  assert.equal(shouldShowPublicSpaceIntro(publicA1, publicA2), true, 'same Gallery slug but a different immutable Venue Version must show intro');
  assert.equal(shouldShowPublicSpaceIntro(publicA1, authoringB), false, 'Gallery authoring preview must never show public intro');
  assert.equal(shouldShowPublicSpaceIntro(adminA1, publicA1), false, 'Admin to Public on the same exact Venue Version must not re-show intro');
  assert.equal(shouldShowPublicSpaceIntro(authoringB, publicA1), true, 'Admin authoring return across a Space boundary must show intro');
}

const publicSwitchStart = viewer.indexOf('async function switchPublicExhibition(');
const publicSwitchEnd = viewer.indexOf('function readNavigationHandoff', publicSwitchStart);
const publicSwitchSource = viewer.slice(publicSwitchStart, publicSwitchEnd);
assert.ok(publicSwitchSource.includes('applyPublicSpaceIntroPolicy(currentRuntime'), 'public switch does not use centralized C26 intro policy');
assert.equal(publicSwitchSource.includes('hideViewerIntroOverlay'), false, 'public switch still unconditionally hides intro');
assert.ok(viewer.includes('c26HomepageExhibitionCarousel'), 'C26 carousel missing');
assert.equal(viewer.includes('c25HomepageExhibitionGrid'), false, 'temporary C25 grid remains');
assert.ok(viewer.includes('c26ExhibitionCard--titleOnly'), 'coverless title-only card missing');
assert.ok(viewer.includes('touch-action:pan-x pan-y'), 'mobile swipe contract missing');
assert.ok(viewer.includes('event.key === "ArrowRight"') && viewer.includes('event.key === "ArrowLeft"'), 'carousel keyboard navigation missing');
assert.ok(viewer.includes('justify-content:center') && viewer.includes('width:max-content;min-width:100%'), 'carousel does not dynamically center a fitting card set');
assert.ok(viewer.includes('function isHardDocumentReload()') && viewer.includes('entries[0].type === "reload"'), 'hard document reload detection missing');
assert.ok(viewer.includes('url.searchParams.delete("exhibition")') && viewer.includes('ensurePublicExhibitionSelection({ force: resetToHomepageAfterReload })'), 'hard reload does not return to Exhibition homepage');
console.log('C6C8C26 carousel + public Space intro policy invariants passed.');

// C6C8C25.4 — Same-Space Exhibition media hydration must finish before transition-complete.
function extractRuntimeFunction(text, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const marker of markers) {
    start = text.indexOf(marker);
    if (start >= 0) break;
  }
  assert.ok(start >= 0, `Missing function ${name}`);
  const brace = text.indexOf('{', start);
  let depth = 0;
  let state = 'code';
  let quote = null;
  for (let i = brace; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1] || '';
    if (state === 'code') {
      if (char === '"' || char === "'" || char === '`') { state = 'string'; quote = char; }
      else if (char === '/' && next === '/') { state = 'line'; i += 1; }
      else if (char === '/' && next === '*') { state = 'block'; i += 1; }
      else if (char === '{') depth += 1;
      else if (char === '}') { depth -= 1; if (depth === 0) return text.slice(start, i + 1); }
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

const previewGateSource = extractRuntimeFunction(source, 'waitForGallerySameSpaceArtworkPreviews');
const engineSwitchSource = extractRuntimeFunction(source, 'switchGalleryExhibition');

function createPreviewGateHarness(snapshotSequence, { ownerActive = true, stepMs = 250 } = {}) {
  let snapshotIndex = 0;
  let now = 0;
  let prepares = 0;
  let drains = 0;
  let yields = 0;
  const runtimeState = {
    lastError: null,
    foregroundReady: false,
    foregroundReadyReason: 'exhibition-switch-start',
    foregroundReadyAt: 0,
    foregroundReadinessLast: null
  };
  const context = {
    console,
    Date,
    Math,
    Error,
    galleryExhibitionRuntime: runtimeState,
    galleryFastStartRuntime: { backgroundDrainActive: false },
    getActiveGalleryExhibitionId: () => 'ex-main',
    getGalleryPerformanceNow: () => { now += stepMs; return now; },
    prepareGalleryForegroundArtworkBudget: () => { prepares += 1; },
    countGalleryForegroundArtworkQueue: () => {
      const snap = snapshotSequence[Math.min(snapshotIndex, snapshotSequence.length - 1)] || {};
      return Number(snap.foregroundArtworkQueue) || 0;
    },
    drainGalleryFastStartBackgroundQueue: () => { drains += 1; },
    getGalleryForegroundPendingSnapshot: () => {
      const snap = snapshotSequence[Math.min(snapshotIndex, snapshotSequence.length - 1)] || {};
      snapshotIndex += 1;
      return { foregroundArtworkQueue:0, criticalTextures:0, visibleTextures:0, loadingPreviews:0, missingPreviews:0, readyPreviews:0, requiredPreviews:0, ...snap };
    },
    isGalleryExhibitionOwnerActive: () => ownerActive,
    yieldGalleryForegroundFrame: async () => { yields += 1; },
    sweepGalleryInactiveExhibitionOwners: () => {}
  };
  vm.createContext(context);
  vm.runInContext(previewGateSource, context);
  return { context, runtimeState, stats: () => ({ prepares, drains, yields }) };
}

{
  const { context, runtimeState, stats } = createPreviewGateHarness([
    { foregroundArtworkQueue: 2, missingPreviews: 2, requiredPreviews: 2, readyPreviews: 0 },
    { criticalTextures: 2, loadingPreviews: 2, requiredPreviews: 2, readyPreviews: 0 },
    { criticalTextures: 1, loadingPreviews: 1, requiredPreviews: 2, readyPreviews: 1 },
    { requiredPreviews: 2, readyPreviews: 2 }
  ]);
  const ready = await context.waitForGallerySameSpaceArtworkPreviews('same-space-test', { timeoutMs: 6000, pollMs: 20 });
  assert.equal(ready.ok, true);
  assert.equal(ready.readyPreviews, 2);
  assert.equal(runtimeState.foregroundReady, true);
  assert.ok(stats().prepares >= 1);
  assert.ok(stats().drains >= 1);
  assert.ok(stats().yields >= 1);
}

{
  const { context, runtimeState } = createPreviewGateHarness([
    { foregroundArtworkQueue: 1, missingPreviews: 1, requiredPreviews: 1, readyPreviews: 0 }
  ], { stepMs: 1200 });
  await assert.rejects(
    context.waitForGallerySameSpaceArtworkPreviews('same-space-timeout-test', { timeoutMs: 5000, pollMs: 20 }),
    /Same-Space artwork Preview hydration failed/
  );
  assert.equal(runtimeState.foregroundReady, false);
}

const previewAwaitOffset = engineSwitchSource.indexOf('await waitForGallerySameSpaceArtworkPreviews(');
const transitionCompleteOffset = engineSwitchSource.indexOf('gallery-exhibition-transition-complete');
assert.ok(previewAwaitOffset >= 0, 'same-space switch does not await artwork Preview hydration');
assert.ok(transitionCompleteOffset > previewAwaitOffset, 'transition completes before artwork Preview hydration');
assert.ok(engineSwitchSource.includes('same-space-exhibition-rollback-preview-ready'), 'rollback does not restore artwork Preview readiness');

console.log('C6C8C25.4 same-space media hydration invariants passed.');

