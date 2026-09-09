/* Exhibition Platform — V13.1 Shared Asset GLB validation browser coordinator. */

export const SHARED_ASSET_VALIDATION_SCHEMA = "exhibition-platform-shared-asset-validation.v1";
export const SHARED_ASSET_VALIDATOR_VERSION = "V13.1";
export const SHARED_ASSET_TYPES = Object.freeze(["prop", "frame"]);
export const SHARED_ASSET_BUCKET = "shared-assets";

const DEFAULT_PROP_RUNTIME_METADATA = Object.freeze({
  placementMode: "floor",
  collisionMode: "none",
  defaultScale: 1
});

const DEFAULT_FRAME_RUNTIME_METADATA = Object.freeze({
  placementMode: "artwork-only",
  innerWidthRatio: 0.68,
  innerHeightRatio: 0.68,
  depthOverlapRatio: 0.92,
  zRotationDegrees: 180,
  yFacingDegrees: 180
});

let sequence = 0;
function nextId() { sequence += 1; return `shared-asset-${Date.now().toString(36)}-${sequence}`; }
function text(value) { return String(value == null ? "" : value).trim(); }
function workerUrl() { return new URL("../workers/shared-asset-glb-validator-worker.js?v=v13_2_left_workspace_asset_manager", import.meta.url); }

export function normalizeSharedAssetType(assetType) {
  const value = text(assetType).toLowerCase();
  if (!SHARED_ASSET_TYPES.includes(value)) throw new Error(`Unsupported Shared Asset type: ${value || "(missing)"}.`);
  return value;
}

export function getDefaultSharedAssetRuntimeMetadata(assetType) {
  const type = normalizeSharedAssetType(assetType);
  return { ...(type === "frame" ? DEFAULT_FRAME_RUNTIME_METADATA : DEFAULT_PROP_RUNTIME_METADATA) };
}

export function normalizeSharedAssetRuntimeMetadata(assetType, metadata = {}) {
  const type = normalizeSharedAssetType(assetType);
  const source = metadata && typeof metadata === "object" ? metadata : {};
  const value = { ...getDefaultSharedAssetRuntimeMetadata(type), ...source };

  if (type === "frame") {
    if (value.placementMode !== "artwork-only") throw new Error("Frame placementMode must be artwork-only.");
    for (const key of ["innerWidthRatio", "innerHeightRatio"]) {
      const n = Number(value[key]);
      if (!Number.isFinite(n) || n <= 0 || n >= 1) throw new Error(`${key} must be between 0 and 1.`);
      value[key] = n;
    }
    for (const key of ["depthOverlapRatio", "zRotationDegrees", "yFacingDegrees"]) {
      const n = Number(value[key]);
      if (!Number.isFinite(n)) throw new Error(`${key} must be finite.`);
      value[key] = n;
    }
  } else {
    if (value.placementMode !== "floor") throw new Error("V13.1 Prop placementMode must be floor.");
    const defaultScale = Number(value.defaultScale);
    if (!Number.isFinite(defaultScale) || defaultScale <= 0) throw new Error("Prop defaultScale must be greater than zero.");
    value.defaultScale = defaultScale;
    value.collisionMode = text(value.collisionMode || "none") || "none";
  }
  return value;
}

function validateWithWorker(payload, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl(), { type: "classic", name: "shared-asset-glb-validator" });
    const id = nextId();
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      try { worker.terminate(); } catch (_) {}
      fn(value);
    };
    worker.onerror = (event) => finish(reject, new Error(event.message || "Shared Asset validator worker failed."));
    worker.onmessage = (event) => {
      const message = event.data || {};
      if (message.id !== id) return;
      if (message.type === "progress") {
        if (typeof onProgress === "function") onProgress({ loaded: Number(message.loaded) || 0, total: Number(message.total) || null });
        return;
      }
      if (message.type === "result") finish(resolve, message.report);
      else if (message.type === "failure") finish(reject, new Error(message.error || "Shared Asset validation failed."));
    };
    worker.postMessage({ type: "validate", id, ...payload });
  });
}

export function validateSharedAssetFile(file, { assetType, onProgress } = {}) {
  if (!file) return Promise.reject(new Error("Choose a GLB file."));
  const type = normalizeSharedAssetType(assetType);
  return validateWithWorker({
    assetType: type,
    source: { kind: "blob", blob: file, name: file.name || "model.glb" },
    expectedSize: Number(file.size) || 0,
    mimeType: file.type || "model/gltf-binary",
    sourceName: file.name || "model.glb"
  }, onProgress);
}

export function validateSharedAssetUrl(url, { assetType, expectedSize = null, sourceStoragePath = null, sourceName = "", onProgress } = {}) {
  if (!url) return Promise.reject(new Error("Shared Asset delivery URL is missing."));
  const type = normalizeSharedAssetType(assetType);
  return validateWithWorker({
    assetType: type,
    source: { kind: "url", url, name: sourceName },
    expectedSize,
    sourceStoragePath,
    sourceName
  }, onProgress);
}

export function isCurrentSharedAssetValidation(report, { assetType = null, fileHash = null, fileSize = null, sourceStoragePath = null } = {}) {
  if (!report || typeof report !== "object") return false;
  if (report.schema !== SHARED_ASSET_VALIDATION_SCHEMA || report.validatorVersion !== SHARED_ASSET_VALIDATOR_VERSION || report.valid !== true) return false;
  if (assetType && report.assetType !== normalizeSharedAssetType(assetType)) return false;
  if (!/^sha256:[0-9a-f]{64}$/i.test(text(report.fileHash))) return false;
  if (fileHash && text(report.fileHash).toLowerCase() !== text(fileHash).toLowerCase()) return false;
  if (fileSize != null && Number(report.fileSize) !== Number(fileSize)) return false;
  if (sourceStoragePath && report.sourceStoragePath && text(report.sourceStoragePath) !== text(sourceStoragePath)) return false;
  const glb = report.glb && typeof report.glb === "object" ? report.glb : null;
  if (!glb || Number(glb.meshCount || 0) <= 0 || Number(glb.renderablePrimitiveCount || 0) <= 0 || Number(glb.reachableRenderablePrimitiveCount || 0) <= 0) return false;
  return true;
}
