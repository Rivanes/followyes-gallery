/* Exhibition Platform — V14.1.5.1 direct Sculpture GLB validation coordinator.
   Reuses the hardened streaming GLB parser used by Shared Asset models, but keeps
   Sculpture upload semantics separate from the Shared Asset catalog. */

export const SCULPTURE_MODEL_VALIDATION_SCHEMA = "exhibition-platform-sculpture-model-validation.v1";
export const SCULPTURE_MODEL_VALIDATOR_VERSION = "V14.1.5.1";

let sequence = 0;
function nextId() { sequence += 1; return `sculpture-model-${Date.now().toString(36)}-${sequence}`; }
function workerUrl() { return new URL("../workers/shared-asset-glb-validator-worker.js?v=v14_1_5_1_glb_runtime_truth_20260910", import.meta.url); }

function validateWithWorker(payload, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl(), { type: "classic", name: "sculpture-model-glb-validator" });
    const id = nextId();
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      try { worker.terminate(); } catch (_) {}
      fn(value);
    };
    worker.onerror = (event) => finish(reject, new Error(event.message || "Sculpture model validator worker failed."));
    worker.onmessage = (event) => {
      const message = event.data || {};
      if (message.id !== id) return;
      if (message.type === "progress") {
        if (typeof onProgress === "function") onProgress({ loaded: Number(message.loaded) || 0, total: Number(message.total) || null });
        return;
      }
      if (message.type === "result") {
        const raw = message.report && typeof message.report === "object" ? message.report : {};
        finish(resolve, {
          ...raw,
          schema: SCULPTURE_MODEL_VALIDATION_SCHEMA,
          validatorVersion: SCULPTURE_MODEL_VALIDATOR_VERSION,
          modelType: "sculpture"
        });
      } else if (message.type === "failure") {
        finish(reject, new Error(message.error || "Sculpture model validation failed."));
      }
    };
    worker.postMessage({ type: "validate", id, assetType: "sculpture", ...payload });
  });
}

export function validateSculptureModelFile(file, { onProgress } = {}) {
  if (!file) return Promise.reject(new Error("Choose a GLB file."));
  return validateWithWorker({
    source: { kind: "blob", blob: file, name: file.name || "sculpture.glb" },
    expectedSize: Number(file.size) || 0,
    mimeType: file.type || "model/gltf-binary",
    sourceName: file.name || "sculpture.glb"
  }, onProgress);
}

export function hasRenderableSculptureGeometry(report) {
  const glb = report && report.glb && typeof report.glb === "object" ? report.glb : null;
  return !!(
    report &&
    report.schema === SCULPTURE_MODEL_VALIDATION_SCHEMA &&
    report.validatorVersion === SCULPTURE_MODEL_VALIDATOR_VERSION &&
    report.modelType === "sculpture" &&
    report.valid === true &&
    glb &&
    Number(glb.meshCount || 0) > 0 &&
    Number(glb.renderablePrimitiveCount || 0) > 0 &&
    Number(glb.reachableRenderablePrimitiveCount || 0) > 0
  );
}
