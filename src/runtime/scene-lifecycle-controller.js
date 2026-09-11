/*
  Exhibition Platform — C6C8C25 Cross-Space Runtime
  Owns one mutable Babylon Scene on one persistent Engine/canvas. Same immutable Venue Version
  stays on the existing Exhibition fast path; another Venue Version gets a full Scene lifecycle.
*/

function text(value) { return String(value == null ? "" : value).trim(); }

export function getRuntimeVenueVersionKey(runtime) {
  const exhibition = runtime && runtime.exhibition ? runtime.exhibition : {};
  const space = runtime && runtime.spaceDefinition ? runtime.spaceDefinition : {};
  const version = runtime && runtime.venueVersion ? runtime.venueVersion : {};
  return text(exhibition.venue_version_id || space.venueVersionId || version.id);
}

export function areRuntimesSameVenueVersion(first, second) {
  const a = getRuntimeVenueVersionKey(first);
  const b = getRuntimeVenueVersionKey(second);
  return !!(a && b && a === b);
}

function isSceneDisposed(scene) {
  if (!scene) return true;
  try { return typeof scene.isDisposed === "function" ? scene.isDisposed() : !!scene._isDisposed; }
  catch (_error) { return false; }
}

function resolveReadinessWaitContract(operationOptions = {}) {
  const sceneOptions = operationOptions.sceneOptions && typeof operationOptions.sceneOptions === "object"
    ? operationOptions.sceneOptions
    : {};
  const policy = operationOptions.loadingPolicy || sceneOptions.loadingPolicy || null;
  const readiness = policy && policy.readiness && typeof policy.readiness === "object" ? policy.readiness : {};
  return Object.freeze({
    authorityEvent: text(readiness.authorityEvent) || "gallery-scene-readiness",
    authorityPhase: text(readiness.authorityPhase) || "scene-visually-settled",
    failureEvent: text(readiness.failureEvent) || "gallery-startup-failure"
  });
}

function createLifecycleWaiter(lifecycleId, timeoutMs, waitContract = {}) {
  const authorityEvent = text(waitContract.authorityEvent) || "gallery-scene-readiness";
  const authorityPhase = text(waitContract.authorityPhase) || "scene-visually-settled";
  const failureEvent = text(waitContract.failureEvent) || "gallery-startup-failure";
  let timeoutId = 0;
  let settled = false;
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });

  function cleanup() {
    window.removeEventListener(authorityEvent, onReady);
    window.removeEventListener(failureEvent, onFailure);
    if (timeoutId) window.clearTimeout(timeoutId);
    timeoutId = 0;
  }
  function finish(ok, value) {
    if (settled) return;
    settled = true;
    cleanup();
    if (ok) resolvePromise(value); else rejectPromise(value instanceof Error ? value : new Error(String(value || "Gallery lifecycle failed.")));
  }
  function matches(event) {
    const detail = event && event.detail ? event.detail : {};
    return text(detail.lifecycleId) === text(lifecycleId);
  }
  function onReady(event) {
    if (!matches(event)) return;
    const detail = event && event.detail ? event.detail : {};
    if (authorityPhase && text(detail.phase) !== authorityPhase) return;
    finish(true, detail);
  }
  function onFailure(event) {
    if (!matches(event)) return;
    const detail = event.detail || {};
    const error = new Error(detail.technicalMessage || detail.message || "Gallery startup failed.");
    error.code = detail.code || "gallery-startup-failure";
    finish(false, error);
  }

  window.addEventListener(authorityEvent, onReady);
  window.addEventListener(failureEvent, onFailure);
  timeoutId = window.setTimeout(() => {
    const error = new Error(`Gallery lifecycle ${lifecycleId} timed out.`);
    error.code = "gallery-lifecycle-timeout";
    finish(false, error);
  }, Math.max(1000, Number(timeoutMs) || 120000));

  return Object.freeze({
    promise,
    cancel(reason) {
      const error = reason instanceof Error ? reason : new Error(String(reason || "Gallery lifecycle cancelled."));
      error.code = error.code || "gallery-lifecycle-cancelled";
      finish(false, error);
    }
  });
}

export function createSceneLifecycleController(options = {}) {
  const engine = options.engine;
  const canvas = options.canvas;
  const engineModule = options.engineModule;
  const exhibitionData = options.exhibitionData;
  const resolveRuntime = options.resolveRuntime;
  const getApp = typeof options.getApp === "function" ? options.getApp : () => window.GalleryApp || null;
  const onSceneChanged = typeof options.onSceneChanged === "function" ? options.onSceneChanged : () => {};
  const beforeDispose = typeof options.beforeDispose === "function" ? options.beforeDispose : async () => {};
  const afterCutover = typeof options.afterCutover === "function" ? options.afterCutover : async () => {};
  const readinessTimeoutMs = Math.max(1000, Number(options.readinessTimeoutMs) || 120000);

  if (!engine || !canvas || !engineModule || typeof engineModule.createScene !== "function") {
    throw new Error("Cross-Space lifecycle controller needs engine, canvas and createScene().");
  }
  if (typeof resolveRuntime !== "function") throw new Error("Cross-Space lifecycle controller needs resolveRuntime().");

  let activeScene = null;
  let activeRuntime = null;
  let activeLifecycleId = "";
  let generation = 0;
  let switching = false;
  let disposed = false;
  const debug = {
    stage: "V14.1.10",
    schema: "exhibition-platform-scene-lifecycle.v1",
    starts: 0,
    sameVersionSwitches: 0,
    sceneRecreates: 0,
    rollbacks: 0,
    rollbackFailures: 0,
    staleLifecycleEventsIgnoredByContract: true,
    lastMode: "idle",
    lastFromVersionId: null,
    lastToVersionId: null,
    lastError: null,
    lastLifecycleId: null,
    lastDurationMs: 0
  };

  function nextLifecycleId() {
    generation += 1;
    return `c25-scene-${generation}-${Date.now().toString(36)}`;
  }

  function notifySceneChanged(scene, runtime, lifecycleId, reason) {
    activeScene = scene || null;
    activeRuntime = runtime || null;
    activeLifecycleId = lifecycleId || "";
    debug.lastLifecycleId = activeLifecycleId || null;
    try { onSceneChanged(activeScene, activeRuntime, activeLifecycleId, reason || "scene-change"); } catch (_error) {}
  }

  function setAdapterModeForRuntime(runtime) {
    if (!exhibitionData || typeof exhibitionData.setMode !== "function" || !runtime) return;
    const runtimeMode = runtime.mode === "admin" ? "admin" : "public";
    exhibitionData.setMode(runtimeMode);
  }

  function adoptRuntime(runtime, reason = "same-scene-runtime-adopt") {
    if (disposed) throw new Error("Scene lifecycle controller is disposed.");
    if (!activeScene || isSceneDisposed(activeScene)) throw new Error("Cannot adopt runtime without a live Scene.");
    if (!runtime || !runtime.exhibition || !runtime.spaceDefinition) throw new Error("Runtime adoption requires a complete runtime.");
    if (activeRuntime && !areRuntimesSameVenueVersion(activeRuntime, runtime)) {
      throw new Error("Runtime adoption cannot cross immutable Venue Versions without Scene recreation.");
    }
    setAdapterModeForRuntime(runtime);
    activeRuntime = runtime;
    debug.lastFromVersionId = debug.lastToVersionId || getRuntimeVenueVersionKey(runtime) || null;
    debug.lastToVersionId = getRuntimeVenueVersionKey(runtime) || null;
    debug.lastMode = reason;
    try { onSceneChanged(activeScene, activeRuntime, activeLifecycleId, reason); } catch (_error) {}
    return { ok: true, mode: reason, scene: activeScene, runtime: activeRuntime, lifecycleId: activeLifecycleId };
  }

  async function createSceneForRuntime(runtime, createOptions = {}) {
    if (!runtime || !runtime.exhibition || !runtime.spaceDefinition) throw new Error("Target Exhibition runtime is incomplete.");
    setAdapterModeForRuntime(runtime);
    const lifecycleId = nextLifecycleId();
    let waiter = null;
    let scene = null;
    try {
      const extraOptions = typeof options.getCreateSceneOptions === "function"
        ? (options.getCreateSceneOptions(runtime, createOptions) || {})
        : {};
      const sceneOptions = createOptions.sceneOptions && typeof createOptions.sceneOptions === "object" ? createOptions.sceneOptions : {};
      const waitContract = resolveReadinessWaitContract({
        ...createOptions,
        loadingPolicy: createOptions.loadingPolicy || sceneOptions.loadingPolicy || extraOptions.loadingPolicy,
        sceneOptions: { ...extraOptions, ...sceneOptions }
      });
      waiter = createLifecycleWaiter(lifecycleId, createOptions.timeoutMs || readinessTimeoutMs, waitContract);
      const loadingSession = sceneOptions.loadingSession && typeof sceneOptions.loadingSession === "object" ? sceneOptions.loadingSession : null;
      if (loadingSession && typeof loadingSession.bindSceneLifecycleId === "function") {
        loadingSession.bindSceneLifecycleId(lifecycleId);
      }
      const runtimeExhibitionData = sceneOptions.exhibitionData || exhibitionData;
      scene = engineModule.createScene(engine, canvas, {
        ...extraOptions,
        ...sceneOptions,
        spaceDefinition: runtime.spaceDefinition,
        exhibitionData: runtimeExhibitionData,
        exhibitionId: runtime.exhibition.id,
        initialExhibitionSnapshot: createOptions.initialSnapshot || null,
        lifecycleId
      });
      await waiter.promise;
      return { scene, runtime, lifecycleId };
    } catch (error) {
      if (waiter) waiter.cancel(error);
      if (scene && !isSceneDisposed(scene)) {
        try { scene.dispose(); } catch (_disposeError) {}
      }
      throw error;
    }
  }

  async function start(runtime, createOptions = {}) {
    if (disposed) throw new Error("Scene lifecycle controller is disposed.");
    if (activeScene && !isSceneDisposed(activeScene)) return { ok: true, mode: "already-started", scene: activeScene, runtime: activeRuntime };
    const startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    const created = await createSceneForRuntime(runtime, createOptions);
    notifySceneChanged(created.scene, runtime, created.lifecycleId, "start");
    debug.starts += 1;
    debug.lastMode = "scene-start";
    debug.lastToVersionId = getRuntimeVenueVersionKey(runtime) || null;
    debug.lastDurationMs = Math.max(0, (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt);
    return { ok: true, mode: "scene-start", ...created };
  }

  async function switchTo(reference, switchOptions = {}) {
    if (disposed) throw new Error("Scene lifecycle controller is disposed.");
    if (switching) return { ok: false, mode: "busy", scene: activeScene, runtime: activeRuntime };
    switching = true;
    const startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    const previousScene = activeScene;
    const previousRuntime = activeRuntime;
    const previousLifecycleId = activeLifecycleId;
    const previousVersionId = getRuntimeVenueVersionKey(previousRuntime);
    let targetRuntime = null;
    let targetCreated = null;
    let oldSceneDisposed = false;
    try {
      // PRE-FLIGHT: resolve exact target before touching the live Scene.
      targetRuntime = switchOptions.runtime || await resolveRuntime(reference, { force: switchOptions.forceRemote !== false });
      if (!targetRuntime || !targetRuntime.exhibition || !targetRuntime.spaceDefinition) throw new Error("Target Exhibition runtime could not be resolved.");
      const targetVersionId = getRuntimeVenueVersionKey(targetRuntime);
      if (!targetVersionId) throw new Error("Target Exhibition has no immutable Venue Version identity.");

      debug.lastFromVersionId = previousVersionId || null;
      debug.lastToVersionId = targetVersionId;
      debug.lastError = null;

      const previousIsGalleryAuthoring = previousRuntime && previousRuntime.context === "gallery-authoring";
      const targetIsGalleryAuthoring = targetRuntime && targetRuntime.context === "gallery-authoring";
      if (previousRuntime && !previousIsGalleryAuthoring && !targetIsGalleryAuthoring && areRuntimesSameVenueVersion(previousRuntime, targetRuntime) && previousScene && !isSceneDisposed(previousScene)) {
        setAdapterModeForRuntime(targetRuntime);
        const app = getApp();
        if (!app || typeof app.switchExhibition !== "function") throw new Error("Same-Space Exhibition switch API is unavailable.");
        const ok = await app.switchExhibition(targetRuntime.exhibition.id, {
          force: true,
          forceRemote: switchOptions.forceRemote === true,
          reloadCurrent: switchOptions.reloadCurrent === true
        });
        if (!ok) throw new Error("Same-Space Exhibition switch was rejected.");
        if (!app || typeof app.waitForSceneReadiness !== "function") {
          throw new Error("Canonical Scene readiness API is unavailable for Same-Space transition.");
        }
        const readinessContract = resolveReadinessWaitContract(switchOptions);
        const loadingSession = switchOptions.loadingSession || (switchOptions.sceneOptions && switchOptions.sceneOptions.loadingSession) || null;
        await app.waitForSceneReadiness({
          lifecycleId: activeLifecycleId,
          loadingSessionId: loadingSession && loadingSession.id ? loadingSession.id : null,
          phase: readinessContract.authorityPhase,
          timeoutMs: switchOptions.timeoutMs || readinessTimeoutMs,
          reason: switchOptions.reason || "same-space-switch"
        });
        activeRuntime = targetRuntime;
        debug.sameVersionSwitches += 1;
        debug.lastMode = "same-venue-version";
        debug.lastDurationMs = Math.max(0, (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt);
        await afterCutover({ mode: debug.lastMode, scene: activeScene, runtime: activeRuntime, previousRuntime });
        return { ok: true, mode: debug.lastMode, scene: activeScene, runtime: activeRuntime, lifecycleId: activeLifecycleId };
      }

      await beforeDispose({ scene: previousScene, runtime: previousRuntime, targetRuntime, reason: switchOptions.reason || "cross-space-switch" });
      if (previousScene && !isSceneDisposed(previousScene)) {
        previousScene.dispose();
        oldSceneDisposed = true;
      }
      notifySceneChanged(null, null, "", "cross-space-dispose");

      targetCreated = await createSceneForRuntime(targetRuntime, {
        initialSnapshot: switchOptions.initialSnapshot || null,
        sceneOptions: switchOptions.sceneOptions || null,
        timeoutMs: switchOptions.timeoutMs
      });
      notifySceneChanged(targetCreated.scene, targetRuntime, targetCreated.lifecycleId, "cross-space-cutover");
      debug.sceneRecreates += 1;
      debug.lastMode = "cross-space-scene-recreate";
      debug.lastDurationMs = Math.max(0, (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt);
      await afterCutover({ mode: debug.lastMode, scene: activeScene, runtime: activeRuntime, previousRuntime });
      return { ok: true, mode: debug.lastMode, scene: activeScene, runtime: activeRuntime, lifecycleId: activeLifecycleId };
    } catch (error) {
      debug.lastError = error && error.message ? error.message : String(error);
      if (targetCreated && targetCreated.scene && !isSceneDisposed(targetCreated.scene)) {
        try { targetCreated.scene.dispose(); } catch (_disposeError) {}
      }

      // If preflight failed, the old Scene was never touched.
      if (!oldSceneDisposed) {
        notifySceneChanged(previousScene, previousRuntime, previousLifecycleId, "preflight-failure-preserved");
        throw error;
      }

      // Post-dispose failure: rebuild the exact previous canonical runtime on the same Engine/canvas.
      // V14.1.7 lets the orchestrator supply a fresh recovery loading session so the
      // recreated previous Scene never inherits the failed target request session.
      if (previousRuntime) {
        try {
          let rollbackOptions = {
            initialSnapshot: switchOptions.rollbackSnapshot || null,
            sceneOptions: switchOptions.rollbackSceneOptions || switchOptions.sceneOptions || null,
            timeoutMs: switchOptions.timeoutMs
          };
          if (typeof switchOptions.createRollbackOptions === "function") {
            const preparedRollbackOptions = await switchOptions.createRollbackOptions({
              previousRuntime,
              targetRuntime,
              error,
              previousLifecycleId,
              previousVersionId
            });
            if (preparedRollbackOptions && typeof preparedRollbackOptions === "object") {
              rollbackOptions = {
                ...rollbackOptions,
                ...preparedRollbackOptions,
                sceneOptions: {
                  ...(rollbackOptions.sceneOptions && typeof rollbackOptions.sceneOptions === "object" ? rollbackOptions.sceneOptions : {}),
                  ...(preparedRollbackOptions.sceneOptions && typeof preparedRollbackOptions.sceneOptions === "object" ? preparedRollbackOptions.sceneOptions : {})
                }
              };
            }
          }
          const rollbackCreated = await createSceneForRuntime(previousRuntime, rollbackOptions);
          notifySceneChanged(rollbackCreated.scene, previousRuntime, rollbackCreated.lifecycleId, "cross-space-rollback");
          debug.rollbacks += 1;
          debug.lastMode = "cross-space-rollback";
          if (typeof switchOptions.onRollbackComplete === "function") {
            await switchOptions.onRollbackComplete({ ok: true, scene: rollbackCreated.scene, runtime: previousRuntime, lifecycleId: rollbackCreated.lifecycleId });
          }
        } catch (rollbackError) {
          debug.rollbackFailures += 1;
          debug.lastMode = "cross-space-rollback-failed";
          debug.lastError += ` | rollback: ${rollbackError && rollbackError.message ? rollbackError.message : rollbackError}`;
          notifySceneChanged(null, null, "", "cross-space-rollback-failed");
          if (typeof switchOptions.onRollbackComplete === "function") {
            try { await switchOptions.onRollbackComplete({ ok: false, scene: null, runtime: previousRuntime, lifecycleId: "", error: rollbackError }); } catch (_rollbackCallbackError) {}
          }
        }
      }
      throw error;
    } finally {
      switching = false;
    }
  }

  function dispose() {
    disposed = true;
    if (activeScene && !isSceneDisposed(activeScene)) {
      try { activeScene.dispose(); } catch (_error) {}
    }
    notifySceneChanged(null, null, "", "controller-dispose");
  }

  return Object.freeze({
    start,
    switchTo,
    adoptRuntime,
    dispose,
    getActiveScene: () => activeScene,
    getActiveRuntime: () => activeRuntime,
    getActiveLifecycleId: () => activeLifecycleId,
    isSwitching: () => switching,
    getDebug: () => ({ ...debug, switching, activeLifecycleId: activeLifecycleId || null, activeVenueVersionId: getRuntimeVenueVersionKey(activeRuntime) || null, activeExhibitionId: activeRuntime && activeRuntime.exhibition ? activeRuntime.exhibition.id : null })
  });
}
