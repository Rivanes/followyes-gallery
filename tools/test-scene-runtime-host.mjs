import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createSceneLoadingRuntimeHost,
  SCENE_LOADING_RUNTIME_HOST_SCHEMA
} from '../src/runtime/scene-loading-orchestrator.js';

if (!globalThis.window) globalThis.window = new EventTarget();
if (!window.setTimeout) window.setTimeout = setTimeout;
if (!window.clearTimeout) window.clearTimeout = clearTimeout;
if (!globalThis.CustomEvent) {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, options = {}) { super(type); this.detail = options.detail; }
  };
}

function makeRuntime(id, versionId, mode = 'public', context = null) {
  return {
    mode,
    ...(context ? { context } : {}),
    exhibition: { id, venue_version_id: versionId, space_id: 'gallery-a' },
    venueVersion: { id: versionId },
    spaceDefinition: { id: 'gallery-a', venueVersionId: versionId, assets: {} }
  };
}

function makeEngine() {
  return {
    runLoopCalls: 0,
    stopLoopCalls: 0,
    disposeCalls: 0,
    renderCallback: null,
    runRenderLoop(callback) { this.runLoopCalls += 1; this.renderCallback = callback; },
    stopRenderLoop() { this.stopLoopCalls += 1; },
    dispose() { this.disposeCalls += 1; }
  };
}

function makeSceneModule(createdOptions, order) {
  return {
    createScene(_engine, _canvas, options) {
      createdOptions.push(options);
      order.push(`create:${options.loadingPolicy && options.loadingPolicy.contextKind}`);
      const scene = {
        disposed: false,
        renders: 0,
        isDisposed() { return this.disposed; },
        render() { this.renders += 1; },
        dispose() { this.disposed = true; }
      };
      queueMicrotask(() => window.dispatchEvent(new CustomEvent('gallery-scene-readiness', {
        detail: { lifecycleId: options.lifecycleId, phase: 'scene-visually-settled', loadingSessionId: options.loadingSession && options.loadingSession.id }
      })));
      return scene;
    }
  };
}

const publicRuntime = makeRuntime('public-a', 'version-a', 'public', 'public-exhibition');
const adminRuntime = makeRuntime('admin-a', 'version-a', 'admin', 'admin-exhibition');
const authoringRuntime = makeRuntime('authoring-a', 'version-a', 'admin', 'gallery-authoring');
const order = [];
const createdOptions = [];
const rebindCalls = [];
const sessionRebindCalls = [];
const adapterModes = [];
const engine = makeEngine();
const canvas = { id: 'renderCanvas' };
let currentReadiness = null;
const app = {
  rebindSceneLoadingContext(options) {
    const context = options.loadingPolicy && options.loadingPolicy.contextKind;
    rebindCalls.push(context);
    order.push(`rebind:${context}`);
    return { supported: true, changed: true, to: context };
  },
  rebindSceneLoadingSession(options) {
    const sessionId = options.loadingSession && options.loadingSession.id;
    sessionRebindCalls.push(sessionId);
    order.push(`session:${sessionId}`);
    return { supported: true, changed: true, to: sessionId };
  },
  async switchExhibition(id) {
    order.push(`switch:${id}`);
    const sessionId = sessionRebindCalls.at(-1) || null;
    currentReadiness = { settled: true, lifecycleId: host && host.orchestrator ? host.orchestrator.getActiveLifecycleId() : null, loadingSessionId: sessionId, phase: 'scene-visually-settled' };
    return true;
  },
  async waitForSceneReadiness(options = {}) {
    return { ...(currentReadiness || {}), settled: true, lifecycleId: options.lifecycleId, loadingSessionId: options.loadingSessionId, phase: options.phase || 'scene-visually-settled' };
  },
  republishSceneReadiness(_reason, details = {}) {
    currentReadiness = { settled: true, lifecycleId: host && host.orchestrator ? host.orchestrator.getActiveLifecycleId() : null, loadingSessionId: details.loadingSessionId || sessionRebindCalls.at(-1) || null, phase: 'scene-visually-settled' };
    return currentReadiness;
  }
};
window.GalleryApp = app;

let prepared = 0;
let configured = 0;
let resizeInstalled = 0;
let resizeCleaned = 0;
const host = await createSceneLoadingRuntimeHost({
  canvas,
  prepare: async () => { prepared += 1; },
  configure: async () => {
    configured += 1;
    return {
      engine,
      engineModule: makeSceneModule(createdOptions, order),
      exhibitionData: { setMode(mode) { adapterModes.push(mode); return mode; } },
      resolveRuntime: async (reference) => reference === 'admin-a' ? adminRuntime : publicRuntime,
      initialRuntime: publicRuntime,
      initialStartOptions: { sceneOptions: { adminWorkspace: false } },
      getApp: () => app,
      getCreateSceneOptions: (runtime) => ({ adminWorkspace: runtime.mode === 'admin' })
    };
  },
  installResize: () => { resizeInstalled += 1; return () => { resizeCleaned += 1; }; }
});

assert.equal(host.schema, SCENE_LOADING_RUNTIME_HOST_SCHEMA);
assert.equal(prepared, 1);
assert.equal(configured, 1);
assert.equal(engine.runLoopCalls, 1, 'shared host must install exactly one render loop');
assert.equal(resizeInstalled, 1, 'shared host must own one resize installation');
assert.equal(createdOptions.length, 1);
assert.equal(createdOptions[0].loadingPolicy.contextKind, 'public-exhibition');
assert.equal(host.getActiveRuntime(), publicRuntime);
assert.equal(adapterModes.at(-1), 'public');
engine.renderCallback();
assert.equal(host.getActiveScene().renders, 1, 'host render loop must render the active Scene');

order.length = 0;
const switched = await host.switchTo('admin-a', { runtime: adminRuntime, forceRemote: true });
assert.equal(switched.ok, true);
assert.equal(switched.mode, 'same-venue-version');
assert.equal(createdOptions.length, 1, 'Public -> inline Admin on exact Venue Version must reuse the Scene');
assert.deepEqual(rebindCalls, ['admin-exhibition']);
assert.equal(order[0], 'rebind:admin-exhibition', 'current loading context must be rebound before same-Scene Exhibition hydration');
assert.match(order[1], /^session:v14-loading-/, 'current loading session must be rebound before same-Scene Exhibition hydration');
assert.equal(order[2], 'switch:admin-a');
assert.equal(sessionRebindCalls.length, 1);
assert.equal(host.getActiveRuntime(), adminRuntime);
assert.equal(adapterModes.at(-1), 'admin');

order.length = 0;
const adopted = host.adoptRuntime(publicRuntime, 'admin-to-public-runtime');
assert.equal(adopted.ok, true);
assert.equal(createdOptions.length, 1);
assert.equal(rebindCalls.at(-1), 'public-exhibition');
assert.equal(order[0], 'rebind:public-exhibition');
assert.match(order[1], /^session:v14-loading-/, 'same-Scene adopt must also receive a current loading session');
assert.equal(host.getActiveRuntime(), publicRuntime);

// Gallery authoring is an isolated context. Even on the same immutable Venue Version,
// transitions into or out of it must recreate the Scene and must not preflight-rebind
// the live core as if it were an Exhibition Scene.
const rebindCountBeforeAuthoring = rebindCalls.length;
const authoringSwitch = await host.switchTo('authoring-a', {
  runtime: authoringRuntime,
  forceRemote: true,
  sceneOptions: { authoringSpacePreview: true, loadingContext: 'gallery-authoring' }
});
assert.equal(authoringSwitch.ok, true);
assert.equal(authoringSwitch.mode, 'cross-space-scene-recreate');
assert.equal(createdOptions.length, 2, 'Public -> Gallery authoring must recreate the isolated Scene');
assert.equal(createdOptions[1].loadingPolicy.contextKind, 'gallery-authoring');
assert.equal(rebindCalls.length, rebindCountBeforeAuthoring, 'entering isolated authoring must not use same-Scene context rebinding');

const adminAfterAuthoring = await host.switchTo('admin-a', {
  runtime: adminRuntime,
  forceRemote: true,
  sceneOptions: { adminWorkspace: true }
});
assert.equal(adminAfterAuthoring.ok, true);
assert.equal(adminAfterAuthoring.mode, 'cross-space-scene-recreate');
assert.equal(createdOptions.length, 3, 'Gallery authoring -> Admin must recreate even on the same Venue Version');
assert.equal(createdOptions[2].loadingPolicy.contextKind, 'admin-exhibition');
assert.equal(rebindCalls.length, rebindCountBeforeAuthoring, 'leaving isolated authoring must not preflight-rebind the disposed Scene');

host.dispose();
assert.equal(resizeCleaned, 1, 'host must clean its resize owner');
assert.equal(engine.stopLoopCalls, 1, 'host must stop its render loop');
assert.equal(engine.disposeCalls, 0, 'reused engine must not be disposed by host');

// Test Gallery must also start through the shared host and receive its isolated canonical policy.
const testRuntime = makeRuntime('gallery-test-version-t', 'version-t', 'test-gallery', 'test-gallery');
const testCreatedOptions = [];
const testOrder = [];
const testEngine = makeEngine();
window.GalleryApp = { async switchExhibition() { return true; } };
const testHost = await createSceneLoadingRuntimeHost({
  canvas,
  engine: testEngine,
  engineModule: makeSceneModule(testCreatedOptions, testOrder),
  exhibitionData: { setMode() { return 'test-gallery'; } },
  resolveRuntime: async () => testRuntime,
  initialRuntime: testRuntime,
  initialStartOptions: { sceneOptions: { galleryTestMode: true, loadingContext: 'test-gallery' } },
  getApp: () => window.GalleryApp,
  getCreateSceneOptions: () => ({ galleryTestMode: true, loadingContext: 'test-gallery' })
});
assert.equal(testEngine.runLoopCalls, 1);
assert.equal(testCreatedOptions.length, 1);
assert.equal(testCreatedOptions[0].galleryTestMode, true);
assert.equal(testCreatedOptions[0].loadingPolicy.contextKind, 'test-gallery');
assert.equal(testCreatedOptions[0].loadingSession.contextKind, 'test-gallery');
testHost.dispose();

// Bootstrap source gate: all three runtime entry points use the shared host; Test Gallery no longer owns a parallel lifecycle.
const root = new URL('../', import.meta.url);
const viewer = fs.readFileSync(new URL('src/bootstrap/gallery-viewer-bootstrap.js', root), 'utf8');
const admin = fs.readFileSync(new URL('src/bootstrap/admin-workspace-bootstrap.js', root), 'utf8');
const testBootstrap = fs.readFileSync(new URL('src/bootstrap/gallery-test-bootstrap.js', root), 'utf8');
for (const [name, source] of [['Viewer', viewer], ['Admin', admin], ['Test Gallery', testBootstrap]]) {
  assert.ok(source.includes('createSceneLoadingRuntimeHost'), `${name} must use the shared Scene runtime host`);
  assert.equal(source.includes('createSceneLifecycleController'), false, `${name} must not construct the lifecycle controller directly`);
}
assert.equal(testBootstrap.includes('waitForInteractionReady'), false, 'Test Gallery must not own a second readiness waiter');
assert.equal(testBootstrap.includes('engine.runRenderLoop'), false, 'Test Gallery must not own a second render loop');
assert.equal(testBootstrap.includes('module.createScene('), false, 'Test Gallery must not bypass the orchestrator with direct createScene');
assert.ok(testBootstrap.includes('loadingContext: "test-gallery"'));
assert.ok(testBootstrap.includes('galleryTestMode: true'));

console.log('V14.1.8 shared runtime host + canonical readiness authority passed.');
