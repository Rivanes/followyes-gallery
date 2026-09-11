import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SCENE_LOADING_CONTEXTS,
  SCENE_LOADING_READINESS_EVENT,
  SCENE_LOADING_READINESS_PHASE,
  createSceneLoadingPolicy
} from '../src/runtime/scene-loading-policies.js';
import { createSceneLifecycleController } from '../src/runtime/scene-lifecycle-controller.js';
import { shouldShowPublicSpaceIntro } from '../src/runtime/public-space-entry-policy.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gallerySource = fs.readFileSync(path.join(root, 'src/Gallery_V0_11.js'), 'utf8');
const viewerSource = fs.readFileSync(path.join(root, 'src/bootstrap/gallery-viewer-bootstrap.js'), 'utf8');
const controllerSource = fs.readFileSync(path.join(root, 'src/runtime/scene-lifecycle-controller.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.equal(pkg.version, '0.14.2-v14-2-2-exhibition-creation-targeting');
assert.equal(SCENE_LOADING_READINESS_EVENT, 'gallery-scene-readiness');
assert.equal(SCENE_LOADING_READINESS_PHASE, 'scene-visually-settled');

for (const contextKind of Object.values(SCENE_LOADING_CONTEXTS)) {
  const policy = createSceneLoadingPolicy(contextKind);
  assert.equal(policy.readiness.authorityEvent, SCENE_LOADING_READINESS_EVENT, `${contextKind} must use one readiness event`);
  assert.equal(policy.readiness.authorityPhase, SCENE_LOADING_READINESS_PHASE, `${contextKind} must use one readiness phase`);
  assert.equal(policy.readiness.compatibilityReadyEvent, 'gallery-interaction-ready', `${contextKind} keeps compatibility event downstream only`);
}

// The controller must no longer subscribe to the legacy compatibility-ready signal.
assert.ok(controllerSource.includes('authorityEvent'), 'controller must resolve a policy-driven authority event');
assert.ok(controllerSource.includes('authorityPhase'), 'controller must match the policy-driven authority phase');
assert.ok(!controllerSource.includes('window.addEventListener("gallery-interaction-ready"'), 'controller must not listen to the compatibility event directly');

// Prove behavior, not only source strings: compatibility, stale lifecycle and wrong phase cannot settle start().
const previousWindow = globalThis.window;
const previousCustomEvent = globalThis.CustomEvent;
class TestCustomEvent extends Event {
  constructor(type, options = {}) {
    super(type);
    this.detail = options.detail;
  }
}
const testWindow = new EventTarget();
testWindow.setTimeout = (...args) => setTimeout(...args);
testWindow.clearTimeout = (...args) => clearTimeout(...args);
globalThis.window = testWindow;
globalThis.CustomEvent = TestCustomEvent;

try {
  let lifecycleId = '';
  const runtime = {
    mode: 'public',
    exhibition: { id: 'ex-a', venue_version_id: 'vv-a' },
    venueVersion: { id: 'vv-a' },
    spaceDefinition: { venueVersionId: 'vv-a' }
  };
  const policy = createSceneLoadingPolicy(SCENE_LOADING_CONTEXTS.PUBLIC_EXHIBITION);
  const scene = {
    _disposed: false,
    isDisposed() { return this._disposed; },
    dispose() { this._disposed = true; }
  };
  const controller = createSceneLifecycleController({
    engine: {},
    canvas: {},
    engineModule: {
      createScene(_engine, _canvas, options) {
        lifecycleId = options.lifecycleId;
        return scene;
      }
    },
    resolveRuntime: async () => runtime,
    readinessTimeoutMs: 5000
  });

  let resolved = false;
  const startPromise = controller.start(runtime, { loadingPolicy: policy, sceneOptions: { loadingPolicy: policy } });
  startPromise.then(() => { resolved = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(lifecycleId, 'createScene must receive a lifecycle id');

  testWindow.dispatchEvent(new TestCustomEvent('gallery-interaction-ready', { detail: { lifecycleId } }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(resolved, false, 'legacy interaction-ready must not settle the controller');

  testWindow.dispatchEvent(new TestCustomEvent(SCENE_LOADING_READINESS_EVENT, {
    detail: { lifecycleId: 'stale-lifecycle', phase: SCENE_LOADING_READINESS_PHASE }
  }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(resolved, false, 'stale lifecycle readiness must be ignored');

  testWindow.dispatchEvent(new TestCustomEvent(SCENE_LOADING_READINESS_EVENT, {
    detail: { lifecycleId, phase: 'wrong-phase' }
  }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(resolved, false, 'wrong readiness phase must be ignored');

  testWindow.dispatchEvent(new TestCustomEvent(SCENE_LOADING_READINESS_EVENT, {
    detail: { lifecycleId, phase: SCENE_LOADING_READINESS_PHASE }
  }));
  const result = await startPromise;
  assert.equal(result.ok, true);
  assert.equal(resolved, true, 'canonical lifecycle+phase must settle start()');
  controller.dispose();
} finally {
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
  if (previousCustomEvent === undefined) delete globalThis.CustomEvent;
  else globalThis.CustomEvent = previousCustomEvent;
}

// Public entry is visit-based: explicit re-entry shows the popup even for the exact same resident Space.
const publicRuntime = {
  mode: 'public',
  exhibition: { id: 'ex-a', venue_version_id: 'vv-a' },
  venueVersion: { id: 'vv-a' },
  spaceDefinition: { venueVersionId: 'vv-a' }
};
const sameSpaceOtherExhibition = {
  mode: 'public',
  exhibition: { id: 'ex-b', venue_version_id: 'vv-a' },
  venueVersion: { id: 'vv-a' },
  spaceDefinition: { venueVersionId: 'vv-a' }
};
const otherSpace = {
  mode: 'public',
  exhibition: { id: 'ex-c', venue_version_id: 'vv-b' },
  venueVersion: { id: 'vv-b' },
  spaceDefinition: { venueVersionId: 'vv-b' }
};
assert.equal(shouldShowPublicSpaceIntro(null, publicRuntime, { initial: true }), true);
assert.equal(shouldShowPublicSpaceIntro(publicRuntime, publicRuntime, { publicEntry: true }), true, 'explicit re-entry must show intro on same resident runtime');
assert.equal(shouldShowPublicSpaceIntro(publicRuntime, sameSpaceOtherExhibition, { entry: true }), true, 'Home/list entry into same Space must show intro');
assert.equal(shouldShowPublicSpaceIntro(publicRuntime, sameSpaceOtherExhibition), false, 'in-place Exhibition switch inside open Space must not re-show intro');
assert.equal(shouldShowPublicSpaceIntro(publicRuntime, otherSpace), true, 'cross-Space switch must show intro');

assert.ok(viewerSource.includes('publicEntry: true'), 'Home/list Gallery entry must mark explicit public entry');
assert.ok(viewerSource.includes('homepage-gallery-entry'), 'Home/list Gallery entry reason must be explicit');
assert.ok(gallerySource.includes('getSceneReadinessDebug'), 'GalleryApp must expose canonical readiness debug');
assert.ok(gallerySource.includes('isGallerySceneReadinessSnapshotCurrent(getGallerySceneReadinessSnapshot())'), 'intro unlock must read canonical readiness');

const readyFunctionStart = gallerySource.indexOf('function setGalleryInteractionReady');
const readyFunctionEnd = gallerySource.indexOf('function hideViewerIntroOverlay', readyFunctionStart);
const readyFunction = gallerySource.slice(readyFunctionStart, readyFunctionEnd);
assert.ok(readyFunction.indexOf('publishGallerySceneReadiness') >= 0, 'interaction compatibility path must publish canonical readiness');
assert.ok(readyFunction.indexOf('publishGallerySceneReadiness') < readyFunction.indexOf('compatibilityReadyEvent'), 'canonical readiness must be published before compatibility event');

console.log('V14.1.8 one-readiness-authority + Public entry gate passed.');
