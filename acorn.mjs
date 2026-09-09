/* Exhibition Platform — C6C8C23 Space Model Validation browser coordinator. */
export const GALLERY_MODEL_VALIDATION_SCHEMA = "exhibition-platform-gallery-model-validation.v1";
export const GALLERY_MODEL_VALIDATOR_VERSION = "C6C8C23.1";
export const REQUIRED_GALLERY_MODEL_ROLES = Object.freeze(["floor", "walls", "ceiling"]);
export const OPTIONAL_GALLERY_MODEL_ROLES = Object.freeze(["props"]);
export const ALL_GALLERY_MODEL_ROLES = Object.freeze([...REQUIRED_GALLERY_MODEL_ROLES, ...OPTIONAL_GALLERY_MODEL_ROLES]);

let sequence = 0;
function nextId() { sequence += 1; return `gallery-model-${Date.now().toString(36)}-${sequence}`; }
function workerUrl() { return new URL("../workers/gallery-glb-validator-worker.js?v=c6c8c24_exhibition_gallery_assignment", import.meta.url); }

function validateWithWorker(payload, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl(), { type: "classic", name: "gallery-glb-validator" });
    const id = nextId();
    let settled = false;
    const finish = (fn, value) => { if (settled) return; settled = true; try { worker.terminate(); } catch (_) {} fn(value); };
    worker.onerror = (event) => finish(reject, new Error(event.message || "Gallery model validator worker failed."));
    worker.onmessage = (event) => {
      const message = event.data || {};
      if (message.id !== id) return;
      if (message.type === "progress") { if (typeof onProgress === "function") onProgress({ loaded: Number(message.loaded)||0, total: Number(message.total)||null }); return; }
      if (message.type === "result") finish(resolve, message.report);
      else if (message.type === "failure") finish(reject, new Error(message.error || "Gallery model validation failed."));
    };
    worker.postMessage({ type: "validate", id, ...payload });
  });
}

export function validateGalleryModelFile(file, { role, onProgress } = {}) {
  if (!file) return Promise.reject(new Error("Choose a GLB file."));
  return validateWithWorker({
    role,
    source: { kind: "blob", blob: file, name: file.name || "asset.glb" },
    expectedSize: Number(file.size) || 0,
    mimeType: file.type || "model/gltf-binary",
    sourceName: file.name || "asset.glb"
  }, onProgress);
}

export function validateGalleryModelUrl(url, { role, expectedSize = null, sourceStoragePath = null, sourceName = "", onProgress } = {}) {
  if (!url) return Promise.reject(new Error("Gallery model delivery URL is missing."));
  return validateWithWorker({
    role,
    source: { kind: "url", url, name: sourceName },
    expectedSize,
    sourceStoragePath,
    sourceName
  }, onProgress);
}

export function isCurrentGalleryModelValidation(asset, role) {
  const metadata = asset && asset.metadata && typeof asset.metadata === "object" ? asset.metadata : {};
  const report = metadata.c23ModelValidation && typeof metadata.c23ModelValidation === "object" ? metadata.c23ModelValidation : null;
  if (!report || report.schema !== GALLERY_MODEL_VALIDATION_SCHEMA || report.validatorVersion !== GALLERY_MODEL_VALIDATOR_VERSION) return false;
  if (report.valid !== true || report.role !== role) return false;
  if (!asset.file_hash || report.fileHash !== asset.file_hash) return false;
  if (Number(asset.file_size || 0) !== Number(report.fileSize || 0)) return false;
  if (asset.storage_path && report.sourceStoragePath && asset.storage_path !== report.sourceStoragePath) return false;
  const glb = report.glb && typeof report.glb === "object" ? report.glb : null;
  if (!glb || Number(glb.meshCount || 0) <= 0 || Number(glb.renderablePrimitiveCount || 0) <= 0 || Number(glb.reachableRenderablePrimitiveCount || 0) <= 0) return false;
  if (!Array.isArray(glb.runtimeMeshNames)) return false;
  return true;
}

export function summarizeGalleryModelValidation(asset, role) {
  const metadata = asset && asset.metadata && typeof asset.metadata === "object" ? asset.metadata : {};
  const report = metadata.c23ModelValidation && typeof metadata.c23ModelValidation === "object" ? metadata.c23ModelValidation : null;
  if (!asset) return { state: role === "props" ? "optional" : "missing", label: role === "props" ? "Optional · not assigned" : "Required · not assigned", report: null };
  if (!report) return { state: "unvalidated", label: "Needs deep validation", report: null };
  if (!isCurrentGalleryModelValidation(asset, role)) return { state: report.valid === false ? "invalid" : "stale", label: report.valid === false ? "Deep validation failed" : "Validation is stale", report };
  const meshCount = Number(report.glb && report.glb.meshCount) || 0;
  const warningCount = Array.isArray(report.warnings) ? report.warnings.length : 0;
  return { state: warningCount ? "warning" : "valid", label: `Validated · ${meshCount} mesh${meshCount===1?"":"es"}${warningCount ? ` · ${warningCount} warning${warningCount===1?"":"s"}` : ""}`, report };
}
