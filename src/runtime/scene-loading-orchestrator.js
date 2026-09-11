/*
  Exhibition Platform — V14.1.10 Scene Loading Orchestrator / No-Reload Residency & Frame-Time Closure
  Compatibility shell above SceneLifecycleController. It owns high-level loading request/session
  identity and policy resolution while delegating the existing physical Scene behavior unchanged.
*/

import { createSceneLifecycleController, getRuntimeVenueVersionKey } from "./scene-lifecycle-controller.js?v=v14_1_10_1_public_reentry_20260911";
import {
  SCENE_LOADING_POLICY_SCHEMA,
  createSceneLoadingPolicy,
  resolveSceneLoadingPolicyFromRuntimeOptions
} from "./scene-loading-policies.js?v=v14_1_10_1_public_reentry_20260911";

export const SCENE_LOADING_ORCHESTRATOR_SCHEMA = "exhibition-platform-scene-loading-orchestrator.v1";
export const SCENE_LOADING_SESSION_SCHEMA = "exhibition-platform-scene-loading-session.v1";
export const SCENE_LOADING_REQUEST_SCHEMA = "exhibition-platform-scene-loading-request.v1";
export const SCENE_LOADING_RUNTIME_HOST_SCHEMA = "exhibition-platform-scene-loading-runtime-host.v1";

function text(value) { return String(value == null ? "" : value).trim(); }
function nowMs() { return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now(); }
function wallNow() { return Date.now(); }

function runtimeIdentity(runtime) {
  const exhibition = runtime && runtime.exhibition ? runtime.exhibition : {};
  return Object.freeze({
    exhibitionId: text(exhibition.id) || null,
    venueVersionId: getRuntimeVenueVersionKey(runtime) || null,
    context: text(runtime && runtime.context) || null,
    mode: text(runtime && runtime.mode) || null
  });
}

function resolvePolicy(runtime, operationOptions = {}) {
  const sceneOptions = operationOptions.sceneOptions && typeof operationOptions.sceneOptions === "object"
    ? operationOptions.sceneOptions
    : {};
  const explicitPolicy = operationOptions.loadingPolicy || sceneOptions.loadingPolicy;
  if (explicitPolicy && explicitPolicy.schema === SCENE_LOADING_POLICY_SCHEMA) {
    return createSceneLoadingPolicy(explicitPolicy.contextKind);
  }
  return resolveSceneLoadingPolicyFromRuntimeOptions({
    ...sceneOptions,
    loadingContext: operationOptions.loadingContext || sceneOptions.loadingContext || (runtime && runtime.context) || "",
    contextKind: operationOptions.contextKind || sceneOptions.contextKind || "",
    adminWorkspace: sceneOptions.adminWorkspace === true || (runtime && runtime.mode === "admin"),
    authoringSpacePreview: sceneOptions.authoringSpacePreview === true || (runtime && runtime.context === "gallery-authoring"),
    galleryTestMode: sceneOptions.galleryTestMode === true || (runtime && runtime.context === "test-gallery") || (runtime && runtime.mode === "test-gallery")
  });
}

function createLoadingSession({ id, requestId, transitionId, kind, policy, runtime }) {
  let sceneLifecycleId = "";
  let status = "created";
  let settledAt = 0;
  let error = null;
  let cancelled = false;
  let cancelledAt = 0;
  let cancelReason = null;
  let cancelDetails = null;
  let retired = false;
  let retiredAt = 0;
  let retireReason = null;
  let retireDetails = null;
  let acceptingTasks = true;
  let taskGeneration = 0;
  const lifecycleTasks = new Map();
  const createdAt = wallNow();
  const startedAt = nowMs();

  function snapshotTask(entry) {
    if (!entry) return null;
    return {
      id: entry.id,
      key: entry.key,
      phase: entry.phase,
      family: entry.family,
      status: entry.status,
      blocksSettle: entry.blocksSettle,
      referencePreserved: entry.referencePreserved,
      details: entry.details ? { ...entry.details } : null,
      error: entry.error,
      createdAt: entry.createdAt,
      settledAt: entry.settledAt || null
    };
  }

  function settleLifecycleTask(entry, nextStatus, reason, details) {
    if (!entry || entry.status !== "pending") return snapshotTask(entry);
    const allowed = new Set(["loaded", "unavailable", "error", "superseded"]);
    entry.status = allowed.has(nextStatus) ? nextStatus : "error";
    entry.error = entry.status === "loaded" ? null : (text(reason) || null);
    if (details && typeof details === "object") entry.details = { ...(entry.details || {}), ...details };
    entry.settledAt = wallNow();
    return snapshotTask(entry);
  }

  function getLifecycleTaskSnapshot(phase) {
    const phaseFilter = text(phase);
    const tasks = Array.from(lifecycleTasks.values())
      .filter((entry) => !phaseFilter || entry.phase === phaseFilter)
      .map(snapshotTask);
    const pending = tasks.filter((task) => task.status === "pending").length;
    const loaded = tasks.filter((task) => task.status === "loaded").length;
    const unavailable = tasks.filter((task) => task.status === "unavailable").length;
    const errors = tasks.filter((task) => task.status === "error").length;
    const superseded = tasks.filter((task) => task.status === "superseded").length;
    return {
      phase: phaseFilter || null,
      total: tasks.length,
      pending,
      loaded,
      unavailable,
      errors,
      superseded,
      terminal: tasks.length - pending,
      complete: pending === 0,
      tasks
    };
  }

  const session = {
    schema: SCENE_LOADING_SESSION_SCHEMA,
    id,
    requestId,
    transitionId,
    kind,
    contextKind: policy.contextKind,
    policy,
    target: runtimeIdentity(runtime),
    bindSceneLifecycleId(value) {
      const next = text(value);
      if (!next) return sceneLifecycleId;
      if (!sceneLifecycleId) sceneLifecycleId = next;
      return sceneLifecycleId;
    },
    getSceneLifecycleId() { return sceneLifecycleId || null; },
    isOwnedByLifecycle(value) {
      const candidate = text(value);
      if (!candidate || !sceneLifecycleId) return true;
      return candidate === sceneLifecycleId;
    },
    markDelegated() {
      if (status === "created") status = "delegated";
    },
    markSettled(ok, reason) {
      if (status === "settled" || status === "failed") return;
      status = ok === false ? "failed" : "settled";
      error = ok === false ? text(reason) || "scene-loading-request-failed" : null;
      settledAt = wallNow();
      acceptingTasks = false;
    },
    cancel(reason, details) {
      if (cancelled) return false;
      cancelled = true;
      acceptingTasks = false;
      cancelledAt = wallNow();
      cancelReason = text(reason) || "scene-loading-session-cancelled";
      cancelDetails = details && typeof details === "object" ? { ...details } : null;
      lifecycleTasks.forEach((entry) => {
        if (entry && entry.status === "pending") settleLifecycleTask(entry, "superseded", cancelReason, { cancelled: true });
      });
      return true;
    },
    isCancelled() { return cancelled; },
    retire(reason, details) {
      if (retired) return false;
      retired = true;
      acceptingTasks = false;
      retiredAt = wallNow();
      retireReason = text(reason) || "scene-loading-session-retired";
      retireDetails = details && typeof details === "object" ? { ...details } : null;
      lifecycleTasks.forEach((entry) => {
        if (entry && entry.status === "pending") settleLifecycleTask(entry, "superseded", retireReason, { retired: true });
      });
      return true;
    },
    isRetired() { return retired; },
    canContinue(lifecycleId) {
      return !cancelled && !retired && session.isOwnedByLifecycle(lifecycleId);
    },
    registerTask(input = {}) {
      const phase = text(input.phase) || "runtime";
      const family = text(input.family) || "unknown";
      const key = text(input.key) || `${family}-${++taskGeneration}`;
      const compositeKey = `${phase}:${family}:${key}`;
      const existing = lifecycleTasks.get(compositeKey);
      if (existing) return existing.handle;
      if (!acceptingTasks) {
        const closedAt = wallNow();
        const closedSnapshot = {
          id: `task-rejected-${++taskGeneration}`,
          key,
          phase,
          family,
          status: "superseded",
          blocksSettle: input.blocksSettle === true,
          referencePreserved: input.referencePreserved !== false,
          details: input.details && typeof input.details === "object" ? { ...input.details, registrationRejected: true } : { registrationRejected: true },
          error: retireReason || cancelReason || "scene-loading-session-closed",
          createdAt: closedAt,
          settledAt: closedAt
        };
        return Object.freeze({
          id: closedSnapshot.id, key, phase, family,
          settle() { return { ...closedSnapshot }; },
          getSnapshot() { return { ...closedSnapshot }; }
        });
      }
      const entry = {
        id: `task-${++taskGeneration}`,
        key,
        phase,
        family,
        status: cancelled ? "superseded" : "pending",
        blocksSettle: input.blocksSettle === true,
        referencePreserved: input.referencePreserved !== false,
        details: input.details && typeof input.details === "object" ? { ...input.details } : null,
        error: cancelled ? (cancelReason || "scene-loading-session-cancelled") : null,
        createdAt: wallNow(),
        settledAt: cancelled ? wallNow() : 0,
        handle: null
      };
      const handle = Object.freeze({
        id: entry.id,
        key,
        phase,
        family,
        settle(nextStatus, reason, details) {
          return settleLifecycleTask(entry, nextStatus, reason, details);
        },
        getSnapshot() { return snapshotTask(entry); }
      });
      entry.handle = handle;
      lifecycleTasks.set(compositeKey, entry);
      return handle;
    },
    getTaskSnapshot(phase) {
      return getLifecycleTaskSnapshot(phase);
    },
    getSnapshot() {
      return {
        schema: SCENE_LOADING_SESSION_SCHEMA,
        id,
        requestId,
        transitionId,
        kind,
        contextKind: policy.contextKind,
        target: runtimeIdentity(runtime),
        sceneLifecycleId: sceneLifecycleId || null,
        status,
        error,
        cancelled,
        cancelledAt: cancelledAt || null,
        cancelReason,
        cancelDetails,
        retired,
        retiredAt: retiredAt || null,
        retireReason,
        retireDetails,
        acceptingTasks,
        createdAt,
        settledAt: settledAt || null,
        durationMs: Math.max(0, nowMs() - startedAt),
        tasks: getLifecycleTaskSnapshot()
      };
    }
  };
  return Object.freeze(session);
}

export function createSceneLoadingOrchestrator(options = {}) {
  const resolveRuntime = typeof options.resolveRuntime === "function" ? options.resolveRuntime : null;
  const getApp = typeof options.getApp === "function" ? options.getApp : () => (typeof window !== "undefined" ? window.GalleryApp || null : null);
  const lifecycleController = options.lifecycleController || createSceneLifecycleController(options);
  if (!lifecycleController || typeof lifecycleController.start !== "function" || typeof lifecycleController.switchTo !== "function") {
    throw new Error("Scene loading orchestrator requires a SceneLifecycleController-compatible authority.");
  }

  let requestGeneration = 0;
  let transitionGeneration = 0;
  let loadingGeneration = 0;
  let intentGeneration = 0;
  let activeRequest = null;
  let activeIntent = null;
  let pendingLatestIntent = null;
  let switchDrainPromise = null;
  let switchCycleIntents = [];
  let resolvingSwitch = false;
  let disposed = false;
  const recentSessions = [];
  const debug = {
    stage: "V14.1.10",
    schema: SCENE_LOADING_ORCHESTRATOR_SCHEMA,
    requests: 0,
    starts: 0,
    switches: 0,
    adopts: 0,
    busyRejects: 0,
    failures: 0,
    latestWinsEnabled: true,
    switchIntents: 0,
    supersededIntents: 0,
    reconciliations: 0,
    sameSceneSessionRebinds: 0,
    rollbackRecoverySessions: 0,
    pendingLatestRequest: null,
    lastRequestedIntentId: null,
    lastRequestId: null,
    lastTransitionId: null,
    lastLoadingSessionId: null,
    lastContextKind: null,
    lastTargetExhibitionId: null,
    lastTargetVenueVersionId: null,
    lastMode: "idle",
    lastError: null,
    lastDurationMs: 0
  };

  function nextId(kind) {
    requestGeneration += 1;
    transitionGeneration += 1;
    loadingGeneration += 1;
    const stamp = wallNow().toString(36);
    return {
      requestId: `v14-request-${requestGeneration}-${stamp}`,
      transitionId: `v14-transition-${transitionGeneration}-${stamp}`,
      loadingSessionId: `v14-loading-${loadingGeneration}-${stamp}`,
      kind
    };
  }

  function nextIntentId() {
    intentGeneration += 1;
    return `v14-switch-intent-${intentGeneration}-${wallNow().toString(36)}`;
  }

  function publishSession(session) {
    recentSessions.push(session);
    while (recentSessions.length > 16) recentSessions.shift();
  }

  function createResolvedRequest(kind, runtime, operationOptions = {}, ids = null) {
    const requestIds = ids || nextId(kind);
    const policy = resolvePolicy(runtime, operationOptions);
    const session = createLoadingSession({
      id: requestIds.loadingSessionId,
      requestId: requestIds.requestId,
      transitionId: requestIds.transitionId,
      kind,
      policy,
      runtime
    });
    const startedAt = nowMs();
    const request = Object.freeze({
      schema: SCENE_LOADING_REQUEST_SCHEMA,
      ...requestIds,
      kind,
      policy,
      session,
      target: runtimeIdentity(runtime),
      startedAt
    });
    activeRequest = request;
    publishSession(session);
    debug.requests += 1;
    debug.lastRequestId = request.requestId;
    debug.lastTransitionId = request.transitionId;
    debug.lastLoadingSessionId = request.loadingSessionId;
    debug.lastContextKind = policy.contextKind;
    debug.lastTargetExhibitionId = request.target.exhibitionId;
    debug.lastTargetVenueVersionId = request.target.venueVersionId;
    debug.lastError = null;
    return request;
  }

  function decorateOptions(operationOptions, request) {
    const sceneOptions = operationOptions && operationOptions.sceneOptions && typeof operationOptions.sceneOptions === "object"
      ? operationOptions.sceneOptions
      : {};
    return {
      ...(operationOptions || {}),
      loadingPolicy: request.policy,
      loadingSession: request.session,
      sceneOptions: {
        ...sceneOptions,
        loadingPolicy: request.policy,
        loadingSession: request.session
      }
    };
  }

  function finishRequest(request, result, error, options = {}) {
    if (!request) return result;
    const lifecycleId = result && result.lifecycleId
      ? result.lifecycleId
      : (typeof lifecycleController.getActiveLifecycleId === "function" ? lifecycleController.getActiveLifecycleId() : "");
    request.session.bindSceneLifecycleId(lifecycleId);
    request.session.markSettled(!error, error && (error.message || error));
    if (error && options.keepSessionUsable !== true && typeof request.session.cancel === "function") {
      request.session.cancel("request-failed", { error: text(error && (error.message || error)) || null });
    }
    debug.lastMode = result && result.mode ? result.mode : (error ? "failed" : request.kind);
    debug.lastError = error ? text(error.message || error) : null;
    debug.lastDurationMs = Math.max(0, nowMs() - request.startedAt);
    if (error) debug.failures += 1;
    if (activeRequest && activeRequest.requestId === request.requestId) activeRequest = null;
    return result;
  }

  async function resolveTarget(reference, operationOptions = {}) {
    if (operationOptions.runtime) return operationOptions.runtime;
    if (!resolveRuntime) return null;
    return resolveRuntime(reference, { force: operationOptions.forceRemote !== false });
  }

  function mergePreparedOptions(baseOptions, preparedOptions) {
    if (!preparedOptions || typeof preparedOptions !== "object") return { ...(baseOptions || {}) };
    const baseSceneOptions = baseOptions && baseOptions.sceneOptions && typeof baseOptions.sceneOptions === "object" ? baseOptions.sceneOptions : {};
    const preparedSceneOptions = preparedOptions.sceneOptions && typeof preparedOptions.sceneOptions === "object" ? preparedOptions.sceneOptions : {};
    return {
      ...(baseOptions || {}),
      ...preparedOptions,
      sceneOptions: {
        ...baseSceneOptions,
        ...preparedSceneOptions
      }
    };
  }

  async function prepareResolvedSwitchOptions(intent, targetRuntime) {
    let operationOptions = { ...(intent.options || {}) };
    delete operationOptions.prepareResolvedOptions;
    const prepareResolvedOptions = intent.options && typeof intent.options.prepareResolvedOptions === "function"
      ? intent.options.prepareResolvedOptions
      : null;
    if (prepareResolvedOptions) {
      const prepared = await prepareResolvedOptions(targetRuntime, getActiveRuntime(), {
        intentId: intent.intentId,
        requestedAt: intent.requestedAt
      });
      operationOptions = mergePreparedOptions(operationOptions, prepared);
    }
    operationOptions.runtime = targetRuntime;
    return operationOptions;
  }

  async function start(runtime, createOptions = {}) {
    if (disposed) throw new Error("Scene loading orchestrator is disposed.");
    const request = createResolvedRequest("start", runtime, createOptions);
    debug.starts += 1;
    request.session.markDelegated();
    try {
      const result = await lifecycleController.start(runtime, decorateOptions(createOptions, request));
      return finishRequest(request, result, null);
    } catch (error) {
      finishRequest(request, null, error);
      throw error;
    }
  }

  function canReuseActiveSceneForRuntime(runtime, policy) {
    const activeRuntime = getActiveRuntime();
    const activeScene = getActiveScene();
    if (!activeScene || !activeRuntime || !runtime || !policy || !policy.sceneReuse || policy.sceneReuse.allowSameVenueVersionSceneReuse !== true) return false;
    const activePolicy = resolvePolicy(activeRuntime, { loadingContext: activeRuntime.context || activeRuntime.mode });
    if (!activePolicy || !activePolicy.sceneReuse || activePolicy.sceneReuse.allowSameVenueVersionSceneReuse !== true) return false;
    const activeVersionId = getRuntimeVenueVersionKey(activeRuntime);
    const targetVersionId = getRuntimeVenueVersionKey(runtime);
    return !!(activeVersionId && targetVersionId && activeVersionId === targetVersionId);
  }

  function rebindActiveSceneLoadingContext(policy, runtime, reason) {
    const app = getApp();
    if (!app || typeof app.rebindSceneLoadingContext !== "function") return { supported: false, changed: false };
    const result = app.rebindSceneLoadingContext({
      loadingPolicy: policy,
      loadingContext: policy && policy.contextKind ? policy.contextKind : null,
      runtimeMode: runtime && runtime.mode ? runtime.mode : null,
      reason: reason || "orchestrator-context-rebind"
    });
    return result && typeof result === "object" ? result : { supported: true, changed: result !== false };
  }

  function rebindActiveSceneLoadingSession(session, runtime, reason) {
    const app = getApp();
    if (!app || typeof app.rebindSceneLoadingSession !== "function") return { supported: false, changed: false };
    const lifecycleId = getActiveLifecycleId();
    if (session && typeof session.bindSceneLifecycleId === "function") session.bindSceneLifecycleId(lifecycleId);
    const result = app.rebindSceneLoadingSession({
      loadingSession: session,
      runtimeMode: runtime && runtime.mode ? runtime.mode : null,
      reason: reason || "orchestrator-session-rebind"
    });
    if (result && result.changed !== false) debug.sameSceneSessionRebinds += 1;
    return result && typeof result === "object" ? result : { supported: true, changed: result !== false };
  }

  function createRecoverySession(runtime, reason, parentRequest) {
    const ids = nextId("recovery");
    const policy = resolvePolicy(runtime, { loadingContext: runtime && (runtime.context || runtime.mode) });
    const session = createLoadingSession({
      id: ids.loadingSessionId,
      requestId: ids.requestId,
      transitionId: ids.transitionId,
      kind: "recovery",
      policy,
      runtime
    });
    session.bindSceneLifecycleId(getActiveLifecycleId());
    session.markDelegated();
    publishSession(session);
    debug.rollbackRecoverySessions += 1;
    return { ids, policy, session, reason: reason || "transition-recovery", parentRequestId: parentRequest ? parentRequest.requestId : null };
  }

  function createSwitchIntent(reference, switchOptions = {}) {
    const ids = nextId("switch");
    const intent = {
      intentId: nextIntentId(),
      sequence: intentGeneration,
      reference,
      options: switchOptions && typeof switchOptions === "object" ? { ...switchOptions } : {},
      ids,
      requestedAt: wallNow(),
      supersededBy: null,
      result: null,
      error: null,
      resolvePromise: null,
      rejectPromise: null,
      promise: null
    };
    intent.promise = new Promise((resolve, reject) => {
      intent.resolvePromise = resolve;
      intent.rejectPromise = reject;
    });
    debug.switchIntents += 1;
    debug.lastRequestedIntentId = intent.intentId;
    return intent;
  }

  function markIntentSuperseded(intent, newerIntent, mode) {
    if (!intent || intent.result || intent.error) return;
    intent.supersededBy = newerIntent ? newerIntent.intentId : intent.supersededBy;
    intent.result = {
      ok: false,
      mode: mode || "superseded",
      superseded: true,
      intentId: intent.intentId,
      supersededBy: intent.supersededBy || null,
      scene: getActiveScene(),
      runtime: getActiveRuntime(),
      lifecycleId: getActiveLifecycleId() || null
    };
    debug.supersededIntents += 1;
  }

  function settleSwitchCycleIntents(cycleIntents) {
    for (const intent of cycleIntents) {
      if (intent.error) intent.rejectPromise(intent.error);
      else intent.resolvePromise(intent.result || {
        ok: false,
        mode: "superseded",
        superseded: true,
        intentId: intent.intentId,
        scene: getActiveScene(),
        runtime: getActiveRuntime(),
        lifecycleId: getActiveLifecycleId() || null
      });
    }
  }

  async function executeSwitchIntent(intent) {
    let targetRuntime = null;
    let operationOptions = null;
    let request = null;
    let previousRuntime = getActiveRuntime();
    let contextRebound = false;
    let sessionRebound = false;
    let rollbackRecovery = null;

    resolvingSwitch = true;
    debug.pendingLatestRequest = pendingLatestIntent ? pendingLatestIntent.intentId : null;
    try {
      targetRuntime = await resolveTarget(intent.reference, intent.options);
    } catch (error) {
      resolvingSwitch = false;
      if (pendingLatestIntent && pendingLatestIntent.sequence > intent.sequence) {
        intent.result = {
          ok: false,
          mode: "superseded-during-resolve",
          superseded: true,
          intentId: intent.intentId,
          supersededBy: pendingLatestIntent.intentId,
          scene: getActiveScene(),
          runtime: getActiveRuntime(),
          lifecycleId: getActiveLifecycleId() || null
        };
        debug.supersededIntents += 1;
        return;
      }
      debug.failures += 1;
      debug.lastMode = "resolve-failed";
      debug.lastError = text(error && (error.message || error));
      intent.error = error;
      return;
    } finally {
      resolvingSwitch = false;
    }

    if (!targetRuntime || !targetRuntime.exhibition || !targetRuntime.spaceDefinition) {
      const error = new Error("Target Exhibition runtime could not be resolved.");
      if (pendingLatestIntent && pendingLatestIntent.sequence > intent.sequence) {
        intent.result = { ok: false, mode: "superseded-during-resolve", superseded: true, intentId: intent.intentId, supersededBy: pendingLatestIntent.intentId, scene: getActiveScene(), runtime: getActiveRuntime(), lifecycleId: getActiveLifecycleId() || null };
        debug.supersededIntents += 1;
      } else intent.error = error;
      return;
    }

    if (pendingLatestIntent && pendingLatestIntent.sequence > intent.sequence) {
      markIntentSuperseded(intent, pendingLatestIntent, "superseded-before-delegate");
      return;
    }

    try {
      operationOptions = await prepareResolvedSwitchOptions(intent, targetRuntime);
    } catch (error) {
      if (pendingLatestIntent && pendingLatestIntent.sequence > intent.sequence) {
        markIntentSuperseded(intent, pendingLatestIntent, "superseded-during-prepare");
      } else intent.error = error;
      return;
    }

    if (pendingLatestIntent && pendingLatestIntent.sequence > intent.sequence) {
      markIntentSuperseded(intent, pendingLatestIntent, "superseded-before-delegate");
      return;
    }

    try {
      previousRuntime = getActiveRuntime();
      request = createResolvedRequest("switch", targetRuntime, operationOptions, intent.ids);
      debug.switches += 1;
      request.session.markDelegated();
      const reusedSceneContext = canReuseActiveSceneForRuntime(targetRuntime, request.policy);
      if (reusedSceneContext) {
        const rebound = rebindActiveSceneLoadingContext(request.policy, targetRuntime, "orchestrator-switch-preflight");
        contextRebound = !!(rebound && rebound.changed !== false);
        const sessionResult = rebindActiveSceneLoadingSession(request.session, targetRuntime, "orchestrator-switch-current-session");
        if (!sessionResult || sessionResult.supported === false) {
          throw new Error("Same-Space Scene cannot bind the current loading session.");
        }
        sessionRebound = !!(sessionResult && sessionResult.changed !== false);
      }

      const delegatedOptions = decorateOptions(operationOptions, request);
      delegatedOptions.runtime = targetRuntime;
      delegatedOptions.createRollbackOptions = async ({ previousRuntime: rollbackRuntime }) => {
        rollbackRecovery = createRecoverySession(rollbackRuntime, "cross-space-rollback", request);
        return {
          sceneOptions: {
            loadingPolicy: rollbackRecovery.policy,
            loadingSession: rollbackRecovery.session
          }
        };
      };
      delegatedOptions.onRollbackComplete = ({ ok, lifecycleId, error }) => {
        if (!rollbackRecovery) return;
        rollbackRecovery.session.bindSceneLifecycleId(lifecycleId || getActiveLifecycleId());
        rollbackRecovery.session.markSettled(ok !== false, error && (error.message || error));
        if (ok === false && typeof rollbackRecovery.session.cancel === "function") {
          rollbackRecovery.session.cancel("rollback-recovery-failed", { error: text(error && (error.message || error)) || null });
        }
      };
      const physicalResult = await lifecycleController.switchTo(intent.reference, delegatedOptions);
      finishRequest(request, physicalResult, null);

      if (pendingLatestIntent && pendingLatestIntent.sequence > intent.sequence) {
        if (request.session && typeof request.session.retire === "function") {
          request.session.retire("superseded-after-delegate", { supersededBy: pendingLatestIntent.intentId });
        }
        intent.result = {
          ...physicalResult,
          ok: false,
          mode: "superseded-after-delegate",
          physicalMode: physicalResult && physicalResult.mode ? physicalResult.mode : null,
          superseded: true,
          intentId: intent.intentId,
          supersededBy: pendingLatestIntent.intentId
        };
        debug.supersededIntents += 1;
        return;
      }

      intent.result = { ...physicalResult, intentId: intent.intentId, superseded: false };
    } catch (error) {
      if (request) finishRequest(request, null, error, { keepSessionUsable: sessionRebound });
      if (sessionRebound && previousRuntime) {
        try {
          const recovery = createRecoverySession(previousRuntime, "same-space-switch-failure", request);
          recovery.session.bindSceneLifecycleId(getActiveLifecycleId());
          rebindActiveSceneLoadingContext(recovery.policy, previousRuntime, "orchestrator-switch-rollback");
          rebindActiveSceneLoadingSession(recovery.session, previousRuntime, "orchestrator-switch-session-rollback");
          recovery.session.markSettled(true);
        } catch (_rebindRollbackError) {}
      } else if (contextRebound && previousRuntime) {
        try {
          rebindActiveSceneLoadingContext(resolvePolicy(previousRuntime, { loadingContext: previousRuntime.context || previousRuntime.mode }), previousRuntime, "orchestrator-switch-rollback");
        } catch (_rebindRollbackError) {}
      }

      if (pendingLatestIntent && pendingLatestIntent.sequence > intent.sequence) {
        intent.result = {
          ok: false,
          mode: "superseded-after-failure",
          superseded: true,
          intentId: intent.intentId,
          supersededBy: pendingLatestIntent.intentId,
          scene: getActiveScene(),
          runtime: getActiveRuntime(),
          lifecycleId: getActiveLifecycleId() || null
        };
        debug.supersededIntents += 1;
        return;
      }
      intent.error = error;
    }
  }

  async function drainSwitchIntents(firstIntent) {
    let current = firstIntent;
    try {
      while (current && !disposed) {
        activeIntent = current;
        if (pendingLatestIntent && pendingLatestIntent.intentId === current.intentId) pendingLatestIntent = null;
        debug.pendingLatestRequest = pendingLatestIntent ? pendingLatestIntent.intentId : null;
        await executeSwitchIntent(current);
        activeIntent = null;

        if (pendingLatestIntent) {
          current = pendingLatestIntent;
          pendingLatestIntent = null;
          debug.reconciliations += 1;
          continue;
        }
        current = null;
      }
    } finally {
      activeIntent = null;
      resolvingSwitch = false;
      debug.pendingLatestRequest = null;
      switchDrainPromise = null;
      const completedCycleIntents = switchCycleIntents;
      switchCycleIntents = [];
      settleSwitchCycleIntents(completedCycleIntents);
    }
  }

  function switchTo(reference, switchOptions = {}) {
    if (disposed) return Promise.reject(new Error("Scene loading orchestrator is disposed."));
    const intent = createSwitchIntent(reference, switchOptions);
    switchCycleIntents.push(intent);

    if (pendingLatestIntent && !pendingLatestIntent.result && !pendingLatestIntent.error) {
      markIntentSuperseded(pendingLatestIntent, intent, "superseded-before-delegate");
    }
    pendingLatestIntent = intent;
    debug.pendingLatestRequest = intent.intentId;

    if (activeIntent && activeIntent.sequence < intent.sequence) activeIntent.supersededBy = intent.intentId;

    if (!switchDrainPromise) {
      const first = pendingLatestIntent;
      pendingLatestIntent = null;
      switchDrainPromise = drainSwitchIntents(first);
    }
    return intent.promise;
  }

  function adoptRuntime(runtime, reason = "same-scene-runtime-adopt") {
    if (disposed) throw new Error("Scene loading orchestrator is disposed.");
    if (activeRequest || activeIntent || switchDrainPromise) {
      debug.busyRejects += 1;
      return { ok: false, mode: "busy", scene: getActiveScene(), runtime: getActiveRuntime() };
    }
    const previousRuntime = getActiveRuntime();
    const request = createResolvedRequest("adopt", runtime, { loadingContext: runtime && (runtime.context || runtime.mode) });
    debug.adopts += 1;
    request.session.markDelegated();
    let contextRebound = false;
    let sessionRebound = false;
    if (canReuseActiveSceneForRuntime(runtime, request.policy)) {
      const rebound = rebindActiveSceneLoadingContext(request.policy, runtime, reason || "same-scene-runtime-adopt");
      contextRebound = !!(rebound && rebound.changed !== false);
      const reboundSession = rebindActiveSceneLoadingSession(request.session, runtime, `${reason || "same-scene-runtime-adopt"}-session`);
      sessionRebound = !!(reboundSession && reboundSession.changed !== false);
    }
    try {
      const result = lifecycleController.adoptRuntime(runtime, reason);
      const app = getApp();
      if (app && typeof app.republishSceneReadiness === "function") {
        app.republishSceneReadiness(reason || "same-scene-runtime-adopt", {
          source: "orchestrator-adopt",
          loadingSessionId: request.session.id
        });
      }
      return finishRequest(request, result, null);
    } catch (error) {
      if ((contextRebound || sessionRebound) && previousRuntime) {
        try {
          const recovery = createRecoverySession(previousRuntime, "adopt-rollback", request);
          rebindActiveSceneLoadingContext(recovery.policy, previousRuntime, "orchestrator-adopt-rollback");
          rebindActiveSceneLoadingSession(recovery.session, previousRuntime, "orchestrator-adopt-session-rollback");
          recovery.session.markSettled(true);
        } catch (_rebindRollbackError) {}
      }
      finishRequest(request, null, error);
      throw error;
    }
  }

  function getActiveScene() { return typeof lifecycleController.getActiveScene === "function" ? lifecycleController.getActiveScene() : null; }
  function getActiveRuntime() { return typeof lifecycleController.getActiveRuntime === "function" ? lifecycleController.getActiveRuntime() : null; }
  function getActiveLifecycleId() { return typeof lifecycleController.getActiveLifecycleId === "function" ? lifecycleController.getActiveLifecycleId() : ""; }
  function isSwitching() { return !!activeRequest || !!activeIntent || !!switchDrainPromise || resolvingSwitch || (typeof lifecycleController.isSwitching === "function" && lifecycleController.isSwitching()); }

  function dispose() {
    disposed = true;
    if (pendingLatestIntent && !pendingLatestIntent.result && !pendingLatestIntent.error) {
      pendingLatestIntent.error = new Error("Scene loading orchestrator was disposed before the requested transition ran.");
    }
    if (activeRequest && activeRequest.session && typeof activeRequest.session.cancel === "function") {
      activeRequest.session.cancel("orchestrator-dispose", { requestId: activeRequest.requestId });
    }
    if (typeof lifecycleController.dispose === "function") lifecycleController.dispose();
    activeRequest = null;
    debug.lastMode = "disposed";
  }

  function getDebug() {
    return {
      ...debug,
      disposed,
      resolvingSwitch,
      activeIntent: activeIntent ? {
        intentId: activeIntent.intentId,
        sequence: activeIntent.sequence,
        reference: text(activeIntent.reference) || null,
        supersededBy: activeIntent.supersededBy || null
      } : null,
      pendingLatestRequest: pendingLatestIntent ? {
        intentId: pendingLatestIntent.intentId,
        sequence: pendingLatestIntent.sequence,
        reference: text(pendingLatestIntent.reference) || null
      } : null,
      activeRequest: activeRequest ? {
        requestId: activeRequest.requestId,
        transitionId: activeRequest.transitionId,
        loadingSessionId: activeRequest.loadingSessionId,
        kind: activeRequest.kind,
        contextKind: activeRequest.policy.contextKind,
        target: activeRequest.target
      } : null,
      activeSceneLifecycleId: getActiveLifecycleId() || null,
      activeVenueVersionId: getRuntimeVenueVersionKey(getActiveRuntime()) || null,
      activeExhibitionId: getActiveRuntime() && getActiveRuntime().exhibition ? getActiveRuntime().exhibition.id : null,
      recentSessions: recentSessions.map((session) => session.getSnapshot()),
      controller: typeof lifecycleController.getDebug === "function" ? lifecycleController.getDebug() : null
    };
  }

  return Object.freeze({
    start,
    switchTo,
    adoptRuntime,
    dispose,
    getActiveScene,
    getActiveRuntime,
    getActiveLifecycleId,
    isSwitching,
    getDebug,
    getLifecycleController: () => lifecycleController
  });
}


export async function createSceneLoadingRuntimeHost(options = {}) {
  let hostOptions = { ...(options || {}) };
  const prepare = typeof hostOptions.prepare === "function" ? hostOptions.prepare : null;
  const configure = typeof hostOptions.configure === "function" ? hostOptions.configure : null;
  const debug = {
    stage: "V14.1.10",
    schema: SCENE_LOADING_RUNTIME_HOST_SCHEMA,
    prepared: false,
    configured: false,
    engineCreated: false,
    engineReused: false,
    moduleLoaded: false,
    renderLoopInstalled: false,
    resizeOwnerInstalled: false,
    starts: 0,
    disposed: false
  };

  if (prepare) await prepare();
  debug.prepared = true;
  if (configure) {
    const configured = await configure();
    if (configured && typeof configured === "object") hostOptions = { ...hostOptions, ...configured };
    debug.configured = true;
  }

  const canvas = hostOptions.canvas || null;
  const createEngine = typeof hostOptions.createEngine === "function" ? hostOptions.createEngine : null;
  const loadEngineModule = typeof hostOptions.loadEngineModule === "function" ? hostOptions.loadEngineModule : null;
  const installResize = typeof hostOptions.installResize === "function" ? hostOptions.installResize : null;
  const onRenderError = typeof hostOptions.onRenderError === "function" ? hostOptions.onRenderError : null;
  const onSceneChanged = typeof hostOptions.onSceneChanged === "function" ? hostOptions.onSceneChanged : null;
  let engine = hostOptions.engine || null;
  let engineModule = hostOptions.engineModule || null;
  let orchestrator = null;
  let resizeCleanup = null;
  let renderLoopInstalled = false;
  let disposed = false;
  const ownsEngine = !engine;
  debug.engineReused = !!engine;
  debug.moduleLoaded = !!engineModule;

  if (!canvas) throw new Error("Scene loading runtime host requires a canvas.");
  if (!engineModule && loadEngineModule) {
    engineModule = await loadEngineModule();
    debug.moduleLoaded = true;
  }
  if (!engineModule || typeof engineModule.createScene !== "function") {
    throw new Error("Scene loading runtime host requires a Gallery createScene module.");
  }
  if (!engine) {
    if (!createEngine) throw new Error("Scene loading runtime host requires createEngine() when no Engine is supplied.");
    engine = await createEngine(canvas);
    debug.engineCreated = true;
  }
  if (!engine) throw new Error("Scene loading runtime host could not create or reuse an Engine.");

  orchestrator = createSceneLoadingOrchestrator({
    ...hostOptions,
    engine,
    canvas,
    engineModule,
    onSceneChanged(scene, runtime, lifecycleId, reason) {
      if (onSceneChanged) onSceneChanged(scene, runtime, lifecycleId, reason);
    }
  });

  if (typeof engine.runRenderLoop === "function") {
    engine.runRenderLoop(() => {
      if (disposed || !orchestrator) return;
      const scene = orchestrator.getActiveScene();
      if (!scene) return;
      try {
        if (typeof scene.isDisposed === "function" && scene.isDisposed()) return;
        scene.render();
      } catch (error) {
        if (onRenderError) onRenderError(error, scene);
        else if (!(typeof scene.isDisposed === "function" && scene.isDisposed())) console.error("Scene runtime host render loop error:", error);
      }
    });
    renderLoopInstalled = true;
    debug.renderLoopInstalled = true;
  }

  if (installResize) {
    const cleanup = installResize(engine, () => orchestrator ? orchestrator.getActiveScene() : null);
    resizeCleanup = typeof cleanup === "function" ? cleanup : null;
    debug.resizeOwnerInstalled = true;
  }

  let started = null;
  if (hostOptions.initialRuntime) {
    started = await orchestrator.start(hostOptions.initialRuntime, hostOptions.initialStartOptions || {});
    debug.starts += 1;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    debug.disposed = true;
    if (resizeCleanup) {
      try { resizeCleanup(); } catch (_error) {}
      resizeCleanup = null;
    }
    if (orchestrator && typeof orchestrator.dispose === "function") orchestrator.dispose();
    if (renderLoopInstalled && engine && typeof engine.stopRenderLoop === "function") {
      try { engine.stopRenderLoop(); } catch (_error) {}
    }
    if (ownsEngine && hostOptions.disposeEngine !== false && engine && typeof engine.dispose === "function") {
      try { engine.dispose(); } catch (_error) {}
    }
  }

  return Object.freeze({
    schema: SCENE_LOADING_RUNTIME_HOST_SCHEMA,
    engine,
    orchestrator,
    lifecycle: orchestrator,
    started,
    start: async (runtime, startOptions = {}) => {
      const result = await orchestrator.start(runtime, startOptions);
      debug.starts += 1;
      return result;
    },
    switchTo: (reference, switchOptions = {}) => orchestrator.switchTo(reference, switchOptions),
    adoptRuntime: (runtime, reason) => orchestrator.adoptRuntime(runtime, reason),
    getActiveScene: () => orchestrator.getActiveScene(),
    getActiveRuntime: () => orchestrator.getActiveRuntime(),
    getActiveLifecycleId: () => orchestrator.getActiveLifecycleId(),
    getDebug: () => ({ ...debug, orchestrator: orchestrator.getDebug() }),
    dispose
  });
}
