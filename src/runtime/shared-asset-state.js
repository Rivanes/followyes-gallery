/* Exhibition Platform — V13.1 Shared Asset state/reference primitives.
   V13.1 does not place props yet; this module freezes the ID/reference contract used by later V13 stages. */

export const SHARED_ASSET_STATE_SCHEMA = "exhibition-platform-state-assets.v1";
export const SHARED_ASSET_TYPES = Object.freeze(["prop", "frame"]);

function text(value) { return String(value == null ? "" : value).trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function uuidLike(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value)); }

export function normalizeSharedAssetVersionDescriptor(value) {
  const source = object(value);
  const assetId = text(source.assetId || source.asset_id);
  const assetVersionId = text(source.assetVersionId || source.asset_version_id || source.id);
  const assetType = text(source.assetType || source.asset_type).toLowerCase();
  const storageBucket = text(source.storageBucket || source.storage_bucket);
  const storagePath = text(source.storagePath || source.storage_path).replace(/^\/+/, "");
  if (!uuidLike(assetId) || !uuidLike(assetVersionId) || !SHARED_ASSET_TYPES.includes(assetType) || !storageBucket || !storagePath) return null;
  return {
    assetId,
    assetVersionId,
    assetType,
    storageBucket,
    storagePath,
    fileHash: text(source.fileHash || source.file_hash) || null,
    runtimeMetadata: object(source.runtimeMetadata || source.runtime_metadata)
  };
}

export function normalizeSharedAssetManifest(value) {
  const source = object(value);
  const versions = object(source.versions);
  const normalized = {};
  Object.keys(versions).forEach((key) => {
    const entry = normalizeSharedAssetVersionDescriptor({ assetVersionId: key, ...object(versions[key]) });
    if (entry) normalized[entry.assetVersionId] = entry;
  });
  return { schema: SHARED_ASSET_STATE_SCHEMA, versions: normalized };
}

export function buildSharedAssetManifest(versionDescriptors = []) {
  const versions = {};
  (Array.isArray(versionDescriptors) ? versionDescriptors : []).forEach((value) => {
    const entry = normalizeSharedAssetVersionDescriptor(value);
    if (!entry) throw new Error("Shared Asset manifest contains an invalid version descriptor.");
    versions[entry.assetVersionId] = {
      assetId: entry.assetId,
      assetType: entry.assetType,
      storageBucket: entry.storageBucket,
      storagePath: entry.storagePath,
      fileHash: entry.fileHash,
      runtimeMetadata: entry.runtimeMetadata
    };
  });
  return { schema: SHARED_ASSET_STATE_SCHEMA, versions };
}

export function collectSharedAssetReferences(content) {
  const state = object(content && content.content && typeof content.content === "object" ? content.content : content);
  const refs = [];
  const seen = new Set();
  const directInstances = Array.isArray(state.assetInstances) ? state.assetInstances : null;
  const nestedInstances = state.editor && Array.isArray(state.editor.assetInstances) ? state.editor.assetInstances : [];
  const instances = directInstances || nestedInstances;

  instances.forEach((item, index) => {
    const source = object(item);
    const assetVersionId = text(source.assetVersionId || source.asset_version_id);
    if (!uuidLike(assetVersionId)) return;
    const usageKey = text(source.instanceId || source.id) || `prop-${index + 1}`;
    const key = `prop-instance:${usageKey}`;
    if (seen.has(key)) throw new Error(`Duplicate Shared Asset prop usage key: ${usageKey}.`);
    seen.add(key);
    refs.push({ assetVersionId, usageType: "prop-instance", usageKey });
  });

  (Array.isArray(state.artworks) ? state.artworks : []).forEach((item, index) => {
    const artwork = object(item);
    const frame = object(artwork.frame);
    const assetVersionId = text(frame.assetVersionId || frame.asset_version_id);
    if (!uuidLike(assetVersionId)) return;
    const usageKey = text(artwork.artworkId || artwork.name) || `artwork-${index + 1}`;
    const key = `artwork-frame:${usageKey}`;
    if (seen.has(key)) throw new Error(`Duplicate Shared Asset Frame usage key: ${usageKey}.`);
    seen.add(key);
    refs.push({ assetVersionId, usageType: "artwork-frame", usageKey });
  });

  return refs;
}

export function findLegacyFrameCatalogMatch(frameState, catalogRows) {
  const frame = object(frameState);
  const bucket = text(frame.storageBucket || frame.storage_bucket || "gallery-artworks").toLowerCase();
  const path = text(frame.storagePath || frame.storage_path || frame.path).replace(/^\/+/, "").toLowerCase();
  if (!path) return null;
  return (Array.isArray(catalogRows) ? catalogRows : []).find((row) => {
    const rowBucket = text(row.published_storage_bucket || row.storage_bucket || row.storageBucket).toLowerCase();
    const rowPath = text(row.published_storage_path || row.storage_path || row.storagePath).replace(/^\/+/, "").toLowerCase();
    return rowBucket === bucket && rowPath === path;
  }) || null;
}
