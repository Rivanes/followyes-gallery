import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createSceneLoadingOrchestrator,
  SCENE_LOADING_SESSION_SCHEMA
} from '../src/runtime/scene-loading-orchestrator.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function runtime(id, versionId = 'version-shared', mode = 'public', context = null) {
  return {
    mode,
    ...(context ? { context } : {}),
    exhibition: { id, slug: id, name: id, venue_version_id: versionId, space_id: 'gallery-a' },
    venueVersion: { id: versionId },
    spaceDefinition: { id: 'gallery-a', venueVersionId: versionId, assets: {} }
  };
}

const runtimeA = runtime('A');
const runtimeB = runtime('B');
const runtimeC = runtime('C');
const runtimeD = runtime('D');
const runtimeE = runtime('E');
const runtimeF = runtime('F');
const runtimeG = runtime('G');
const runtimeMap = new Map([['A', runtimeA], ['B', runtimeB], ['C', runtimeC], ['D', runtimeD], ['E', runtimeE], ['F', runtimeF], ['G', runtimeG]]);

let activeRuntime = null;
let activeLifecycleId = 'scene-lifecycle-shared';
let activeScene = { id: 'scene-shared', isDisposed: () => false };
let controllerSwitching = false;
const delegatedTargets = [];
let currentCoreSession = null;
const sessionRebinds = [];
const contextRebinds = [];
const resolveCalls = [];

const app = {
  rebindSceneLoadingContext(options) {
    const next = options.loadingPolicy && options.loadingPolicy.contextKind;
    contextRebinds.push(next);
    return { supported: true, changed: true, to: next };
  },
  rebindSceneLoadingSession(options) {
    const next = options.loadingSession;
    assert.ok(next && next.schema === SCENE_LOADING_SESSION_SCHEMA);
    if (currentCoreSession && currentCoreSession !== next && typeof currentCoreSession.retire === 'function') {
      currentCoreSession.retire('test-core-session-rebind', { replacementSessionId: next.id });
    }
    currentCoreSession = next;
    sessionRebinds.push(next.id);
    return { supported: true, changed: true, to: next.id };
  }
};

const lifecycleController = {
  async start(rt, options) {
    activeRuntime = rt;
    currentCoreSession = options.loadingSession || (options.sceneOptions && options.sceneOptions.loadingSession) || null;
    if (currentCoreSession && typeof currentCoreSession.bindSceneLifecycleId === 'function') currentCoreSession.bindSceneLifecycleId(activeLifecycleId);
    return { ok: true, mode: 'scene-start', scene: activeScene, runtime: activeRuntime, lifecycleId: activeLifecycleId };
  },
  async switchTo(_reference, options) {
    controllerSwitching = true;
    const rt = options.runtime;
    delegatedTargets.push(rt.exhibition.id);
    try {
      if (rt.exhibition.id === 'E') await sleep(45);
      if (rt.exhibition.id === 'F') await sleep(15);
      if (rt.exhibition.id === 'G') throw new Error('synthetic same-space switch failure');
      activeRuntime = rt;
      return { ok: true, mode: 'same-venue-version', scene: activeScene, runtime: activeRuntime, lifecycleId: activeLifecycleId };
    } finally {
      controllerSwitching = false;
    }
  },
  adoptRuntime(rt, reason) {
    activeRuntime = rt;
    return { ok: true, mode: reason, scene: activeScene, runtime: activeRuntime, lifecycleId: activeLifecycleId };
  },
  dispose() {},
  getActiveScene: () => activeScene,
  getActiveRuntime: () => activeRuntime,
  getActiveLifecycleId: () => activeLifecycleId,
  isSwitching: () => controllerSwitching,
  getDebug: () => ({ activeExhibitionId: activeRuntime && activeRuntime.exhibition.id })
};

const orchestrator = createSceneLoadingOrchestrator({
  lifecycleController,
  resolveRuntime: async (reference) => {
    resolveCalls.push(reference);
    if (reference === 'B') await sleep(55);
    else await sleep(3);
    const rt = runtimeMap.get(reference);
    if (!rt) throw new Error(`unknown runtime ${reference}`);
    return rt;
  },
  getApp: () => app
});

await orchestrator.start(runtimeA, { sceneOptions: { adminWorkspace: false } });
const sceneStartSession = currentCoreSession;
assert.ok(sceneStartSession);
assert.equal(sceneStartSession.getSnapshot().acceptingTasks, false, 'settled start session must be closed for new task registration');

// Slow older resolution must not win over a newer requested target. C is itself
// superseded by D before it ever needs to resolve/delegate.
const pB = orchestrator.switchTo('B', { forceRemote: true });
await sleep(5);
const pC = orchestrator.switchTo('C', { forceRemote: true });
await sleep(2);
const pD = orchestrator.switchTo('D', { forceRemote: true });
const [resultB, resultC, resultD] = await Promise.all([pB, pC, pD]);

assert.equal(resultB.superseded, true);
assert.equal(resultC.superseded, true);
assert.equal(resultD.ok, true);
assert.equal(resultD.superseded, false);
assert.equal(activeRuntime, runtimeD, 'newest requested target must be the final active runtime');
assert.deepEqual(resolveCalls.slice(0, 2), ['B', 'D'], 'superseded pending C should not waste a remote resolution');
assert.deepEqual(delegatedTargets, ['D'], 'slow B must be skipped before physical delegation when D was requested while B resolved');
assert.ok(sessionRebinds.length >= 1, 'same-Space current transition must rebind the Scene loading session');
assert.notEqual(currentCoreSession.id, sceneStartSession.id);
assert.equal(currentCoreSession.getSceneLifecycleId(), activeLifecycleId);
assert.equal(sceneStartSession.isRetired(), true, 'Scene-birth session must be retired once same-Space transition gets current ownership');
const oldTaskCount = sceneStartSession.getTaskSnapshot().total;
const rejectedLateTask = sceneStartSession.registerTask({ phase: 'admin-visible-settled', family: 'sculpture-models', key: 'late-old-session-task' });
assert.equal(rejectedLateTask.getSnapshot().status, 'superseded');
assert.equal(sceneStartSession.getTaskSnapshot().total, oldTaskCount, 'retired session must not accumulate new tasks');

// New intent arriving after a physical same-Space switch has already begun is
// reconciled after that atomic operation. The older caller does not settle until
// the newest target is also finished, allowing one transition overlay to remain.
delegatedTargets.length = 0;
const pE = orchestrator.switchTo('E', { forceRemote: true });
await sleep(12);
assert.equal(delegatedTargets[0], 'E', 'E should already be inside the atomic controller switch');
let ePromiseSettled = false;
pE.finally(() => { ePromiseSettled = true; });
const pF = orchestrator.switchTo('F', { forceRemote: true });
await sleep(25);
assert.equal(ePromiseSettled, false, 'superseded active caller must stay pending until newest-target reconciliation completes');
const [resultE, resultF] = await Promise.all([pE, pF]);
assert.equal(resultE.superseded, true);
assert.equal(resultE.mode, 'superseded-after-delegate');
assert.equal(resultF.ok, true);
assert.equal(activeRuntime, runtimeF);
assert.deepEqual(delegatedTargets, ['E', 'F']);

// A failure after same-Space session rebinding must restore a fresh recovery
// session for the still-active previous runtime. The failed target session may
// never remain as current Scene ownership.
const sessionBeforeG = currentCoreSession;
await assert.rejects(
  orchestrator.switchTo('G', { forceRemote: true }),
  /synthetic same-space switch failure/
);
assert.equal(activeRuntime, runtimeF, 'failed same-Space target must preserve the previous active runtime');
assert.notEqual(currentCoreSession, sessionBeforeG, 'failure recovery must not leave the prior settled session as current ownership');
const recoverySnapshot = currentCoreSession.getSnapshot();
assert.equal(recoverySnapshot.kind, 'recovery');
assert.equal(recoverySnapshot.target.exhibitionId, 'F');
assert.equal(recoverySnapshot.status, 'settled');
assert.equal(recoverySnapshot.cancelled, false);
assert.equal(recoverySnapshot.retired, false);
assert.equal(currentCoreSession.getSceneLifecycleId(), activeLifecycleId);
assert.equal(currentCoreSession.canContinue(activeLifecycleId), true);
assert.equal(sessionBeforeG.isRetired(), true, 'previous session must be retired when failure recovery takes current ownership');

const debug = orchestrator.getDebug();
assert.equal(debug.stage, 'V14.1.10');
assert.equal(debug.latestWinsEnabled, true);
assert.ok(debug.switchIntents >= 5);
assert.ok(debug.supersededIntents >= 3);
assert.ok(debug.reconciliations >= 2);
assert.ok(debug.sameSceneSessionRebinds >= 5);
assert.ok(debug.rollbackRecoverySessions >= 1, 'same-Space failure must allocate a recovery session');
assert.equal(debug.pendingLatestRequest, null);
assert.equal(debug.activeExhibitionId, 'F');
assert.equal(debug.recentSessions.at(-1).target.exhibitionId, 'F');

// Bootstrap source gate: Public/Admin selection paths may not pre-resolve the target
// runtime before submitting it to the orchestrator. Public history failures must
// reconcile URL identity back to the actually active Scene runtime.
const root = new URL('../', import.meta.url);
const viewer = fs.readFileSync(new URL('src/bootstrap/gallery-viewer-bootstrap.js', root), 'utf8');
const admin = fs.readFileSync(new URL('src/bootstrap/admin-workspace-bootstrap.js', root), 'utf8');
const core = fs.readFileSync(new URL('src/Gallery_V0_11.js', root), 'utf8');
assert.ok(viewer.includes('V14.1.7 — request ordering belongs to the orchestrator'));
assert.ok(viewer.includes('sceneLifecycleController.switchTo(reference, {\n      forceRemote: true'));
assert.ok(viewer.includes('updatePublicRuntimeIdentity(activePublicRuntime, "replace")'), 'failed Back/Forward must reconcile URL to live runtime');
assert.ok(admin.includes('V14.1.7 — runtime resolution happens inside the orchestrator request boundary.'));
assert.ok(core.includes('rebindSceneLoadingSession: function (options)'));
assert.ok(core.includes('galleryLoadingSessionRebindDebug'));
assert.ok(core.includes('previousSession.retire("same-scene-loading-session-rebound"'));

orchestrator.dispose();
console.log('V14.1.7 latest-wins transition + current loading-session ownership passed.');
