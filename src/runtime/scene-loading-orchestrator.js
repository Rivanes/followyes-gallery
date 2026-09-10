/*
  Exhibition Platform — V14.1.5.1 Scene Loading Orchestrator
  Compatibility shell above SceneLifecycleController. It owns high-level loading request/session
  identity and policy resolution while delegating the existing physical Scene behavior unchanged.
*/

import { createSceneLifecycleController, getRuntimeVenueVersionKey } from "./scene-lifecycle-controller.js";
import {
  SCENE_LOADING_POLICY_SCHEMA,
  createSceneLoadingPolicy,
  resolveSceneLoadingPolicyFromRuntimeOptions
} from "./scene-loading-policies.js";

export const SCENE_LOADING_ORCHESTRATOR_SCHEMA = "exhibition-platform-scene-loading-orchestrator.v1";
export const SCENE_LOADING_SESSION_SCHEMA = "exhibition-platform-scene-loading-session.v1";
export const SCENE_LOADING_REQUEST_SCHEMA = "exhibition-platform-scene-loading-request.v1";

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
    },
    cancel(reason, details) {
      if (cancelled) return false;
      cancelled = true;
      cancelledAt = wallNow();
      cancelReason = text(reason) || "scene-loading-session-cancelled";
      cancelDetails = details && typeof details === "object" ? { ...details } : null;
      lifecycleTasks.forEach((entry) => {
        if (entry && entry.status === "pending") settleLifecycleTask(entry, "superseded", cancelReason, { cancelled: true });
      });
      return true;
    },
    isCancelled() { return cancelled; },
    canContinue(lifecycleId) {
      return !cancelled && session.isOwnedByLifecycle(lifecycleId);
    },
    registerTask(input = {}) {
      const phase = text(input.phase) || "runtime";
      const family = text(input.family) || "unknown";
      const key = text(input.key) || `${family}-${++taskGeneration}`;
      const compositeKey = `${phase}:${family}:${key}`;
      const existing = lifecycleTasks.get(compositeKey);
      if (existing) return existing.handle;
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
  const lifecycleController = options.lifecycleController || createSceneLifecycleController(options);
  if (!lifecycleController || typeof lifecycleController.start !== "function" || typeof lifecycleController.switchTo !== "function") {
    throw new Error("Scene loading orchestrator requires a SceneLifecycleController-compatible authority.");
  }

  let requestGeneration = 0;
  let transitionGeneration = 0;
  let loadingGeneration = 0;
  let activeRequest = null;
  let resolvingSwitch = false;
  let disposed = false;
  const recentSessions = [];
  const debug = {
    stage: "V14.1.5.1",
    schema: SCENE_LOADING_ORCHESTRATOR_SCHEMA,
    requests: 0,
    starts: 0,
    switches: 0,
    adopts: 0,
    busyRejects: 0,
    failures: 0,
    latestWinsEnabled: false,
    pendingLatestRequest: null,
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

  function publishSession(session) {
    recentSessions.push(session);
    while (recentSessions.length > 12) recentSessions.shift();
  }

  function beginRequest(kind, runtime, operationOptions = {}) {
    const ids = nextId(kind);
    const policy = resolvePolicy(runtime, operationOptions);
    const session = createLoadingSession({
      id: ids.loadingSessionId,
      requestId: ids.requestId,
      transitionId: ids.transitionId,
      kind,
      policy,
      runtime
    });
    const startedAt = nowMs();
    const request = Object.freeze({
      schema: SCENE_LOADING_REQUEST_SCHEMA,
      ...ids,
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

  function finishRequest(request, result, error) {
    if (!request) return result;
    const lifecycleId = result && result.lifecycleId
      ? result.lifecycleId
      : (typeof lifecycleController.getActiveLifecycleId === "function" ? lifecycleController.getActiveLifecycleId() : "");
    request.session.bindSceneLifecycleId(lifecycleId);
    request.session.markSettled(!error, error && (error.message || error));
    if (error && typeof request.session.cancel === "function") {
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

  async function start(runtime, createOptions = {}) {
    if (disposed) throw new Error("Scene loading orchestrator is disposed.");
    const request = beginRequest("start", runtime, createOptions);
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

  async function switchTo(reference, switchOptions = {}) {
    if (disposed) throw new Error("Scene loading orchestrator is disposed.");
    if (activeRequest || resolvingSwitch || (typeof lifecycleController.isSwitching === "function" && lifecycleController.isSwitching())) {
      debug.busyRejects += 1;
      return { ok: false, mode: "busy", scene: getActiveScene(), runtime: getActiveRuntime() };
    }
    let targetRuntime = null;
    resolvingSwitch = true;
    try {
      targetRuntime = await resolveTarget(reference, switchOptions);
    } catch (error) {
      debug.failures += 1;
      debug.lastMode = "resolve-failed";
      debug.lastError = text(error && (error.message || error));
      throw error;
    } finally {
      resolvingSwitch = false;
    }
    const policyRuntime = targetRuntime || switchOptions.runtime || getActiveRuntime();
    const request = beginRequest("switch", policyRuntime, switchOptions);
    debug.switches += 1;
    request.session.markDelegated();
    try {
      const delegatedOptions = decorateOptions(switchOptions, request);
      if (targetRuntime || switchOptions.runtime) delegatedOptions.runtime = targetRuntime || switchOptions.runtime;
      else delete delegatedOptions.runtime;
      const result = await lifecycleController.switchTo(reference, delegatedOptions);
      return finishRequest(request, result, null);
    } catch (error) {
      finishRequest(request, null, error);
      throw error;
    }
  }

  function adoptRuntime(runtime, reason = "same-scene-runtime-adopt") {
    if (disposed) throw new Error("Scene loading orchestrator is disposed.");
    if (activeRequest) {
      debug.busyRejects += 1;
      return { ok: false, mode: "busy", scene: getActiveScene(), runtime: getActiveRuntime() };
    }
    const request = beginRequest("adopt", runtime, { loadingContext: runtime && runtime.context });
    debug.adopts += 1;
    request.session.markDelegated();
    try {
      const result = lifecycleController.adoptRuntime(runtime, reason);
      return finishRequest(request, result, null);
    } catch (error) {
      finishRequest(request, null, error);
      throw error;
    }
  }

  function getActiveScene() { return typeof lifecycleController.getActiveScene === "function" ? lifecycleController.getActiveScene() : null; }
  function getActiveRuntime() { return typeof lifecycleController.getActiveRuntime === "function" ? lifecycleController.getActiveRuntime() : null; }
  function getActiveLifecycleId() { return typeof lifecycleController.getActiveLifecycleId === "function" ? lifecycleController.getActiveLifecycleId() : ""; }
  function isSwitching() { return !!activeRequest || resolvingSwitch || (typeof lifecycleController.isSwitching === "function" && lifecycleController.isSwitching()); }

  function dispose() {
    disposed = true;
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
