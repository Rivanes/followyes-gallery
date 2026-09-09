/* Exhibition Platform — V13.1 Shared Asset Foundation data adapter. */

import {
  SHARED_ASSET_BUCKET,
  normalizeSharedAssetRuntimeMetadata,
  normalizeSharedAssetType,
  validateSharedAssetFile,
  isCurrentSharedAssetValidation
} from "../validation/shared-asset-validation.js";

export const SHARED_ASSET_STAGE = "V13.1";
export { SHARED_ASSET_BUCKET };

function text(value) { return String(value == null ? "" : value).trim(); }
function rows(response) {
  if (!response) return [];
  if (response.error) throw response.error;
  return Array.isArray(response.data) ? response.data : response.data == null ? [] : [response.data];
}
function one(response) { return rows(response)[0] || null; }
function assetFromDetail(detail) { return detail && detail.asset && typeof detail.asset === "object" ? detail.asset : detail; }

function assertGlb(file) {
  if (!file) throw new Error("Choose a GLB file.");
  const name = text(file.name).toLowerCase();
  if (!name.endsWith(".glb")) throw new Error("Shared Assets currently accept GLB files only.");
  if (Number(file.size || 0) <= 0) throw new Error("Shared Asset GLB is empty.");
  return file;
}

export function createSharedAssetApi({ supabase }) {
  if (!supabase) throw new Error("Supabase client is required for Shared Assets.");

  async function get(assetId) {
    const result = one(await supabase.rpc("admin_get_shared_asset", { p_asset_id: assetId }));
    if (!result || !result.asset) throw new Error("Shared Asset could not be loaded.");
    return result;
  }

  async function validateAssetFile(assetId, file, { onProgress = null } = {}) {
    assertGlb(file);
    const detail = await get(assetId);
    const asset = assetFromDetail(detail);
    const report = await validateSharedAssetFile(file, { assetType: asset.asset_type, onProgress });
    if (!isCurrentSharedAssetValidation(report, { assetType: asset.asset_type, fileSize: Number(file.size) || 0 })) {
      const message = Array.isArray(report && report.errors) && report.errors.length
        ? report.errors.map((entry) => entry && entry.message ? entry.message : String(entry)).join(" · ")
        : "Shared Asset GLB validation failed.";
      throw new Error(message);
    }
    return { asset, report };
  }

  async function discardDraftVersion(version, { removeBinary = false } = {}) {
    if (!version || !version.id) throw new Error("Shared Asset Draft version descriptor is required.");
    if (removeBinary && version.storage_path) {
      const bucket = text(version.storage_bucket || SHARED_ASSET_BUCKET) || SHARED_ASSET_BUCKET;
      const removal = await supabase.storage.from(bucket).remove([version.storage_path]);
      if (removal && removal.error) throw removal.error;
    }
    return one(await supabase.rpc("admin_discard_shared_asset_version", { p_asset_version_id: version.id }));
  }

  async function createAssetVersion(assetId, { runtimeMetadata = {} } = {}) {
    const detail = await get(assetId);
    const asset = assetFromDetail(detail);
    const normalizedRuntime = normalizeSharedAssetRuntimeMetadata(asset.asset_type, runtimeMetadata);
    const version = one(await supabase.rpc("admin_create_shared_asset_version", {
      p_asset_id: assetId,
      p_runtime_metadata: normalizedRuntime
    }));
    if (!version || !version.id || !version.storage_path) throw new Error("Shared Asset version creation returned an incomplete descriptor.");
    return version;
  }

  return Object.freeze({
    stage: SHARED_ASSET_STAGE,
    bucket: SHARED_ASSET_BUCKET,

    async list({ assetType = null, scopeVenueId = null, includeArchived = false, search = null } = {}) {
      const type = assetType == null || assetType === "" ? null : normalizeSharedAssetType(assetType);
      return rows(await supabase.rpc("admin_list_shared_assets", {
        p_asset_type: type,
        p_scope_venue_id: scopeVenueId || null,
        p_include_archived: includeArchived === true,
        p_search: text(search) || null
      }));
    },

    get,

    async create({ name, assetType, category = "", scopeType = "platform", scopeVenueId = null, metadata = {}, slug = null }) {
      const type = normalizeSharedAssetType(assetType);
      const scope = text(scopeType || "platform").toLowerCase();
      if (!["platform", "venue"].includes(scope)) throw new Error("Shared Asset scope must be platform or venue.");
      return one(await supabase.rpc("admin_create_shared_asset", {
        p_name: text(name),
        p_asset_type: type,
        p_category: text(category),
        p_scope_type: scope,
        p_scope_venue_id: scope === "venue" ? scopeVenueId || null : null,
        p_metadata: metadata && typeof metadata === "object" ? metadata : {},
        p_slug: text(slug) || null
      }));
    },

    async update(assetId, patch = {}) {
      return one(await supabase.rpc("admin_update_shared_asset", { p_asset_id: assetId, p_patch: patch || {} }));
    },

    async createVersion(assetId, { runtimeMetadata = {} } = {}) {
      return createAssetVersion(assetId, { runtimeMetadata });
    },

    async validateFile(assetId, file, { onProgress = null } = {}) {
      return validateAssetFile(assetId, file, { onProgress });
    },

    async uploadNewVersion(assetId, file, { runtimeMetadata = {}, onProgress = null } = {}) {
      assertGlb(file);
      const validated = await validateAssetFile(assetId, file, { onProgress });
      const normalizedRuntime = normalizeSharedAssetRuntimeMetadata(validated.asset.asset_type, runtimeMetadata);
      const version = await createAssetVersion(assetId, { runtimeMetadata: normalizedRuntime });
      const upload = await supabase.storage.from(SHARED_ASSET_BUCKET).upload(version.storage_path, file, {
        cacheControl: "31536000",
        upsert: false,
        contentType: file.type || "model/gltf-binary"
      });
      if (upload.error) {
        try { await discardDraftVersion(version); } catch (_) {}
        throw upload.error;
      }
      try {
        const registered = one(await supabase.rpc("admin_register_shared_asset_version_binary", {
          p_asset_version_id: version.id,
          p_mime_type: file.type || "model/gltf-binary",
          p_file_size: Number(file.size) || 0,
          p_file_hash: validated.report.fileHash,
          p_validation_report: { ...validated.report, sourceStoragePath: version.storage_path },
          p_runtime_metadata: normalizedRuntime
        }));
        if (!registered) throw new Error("Shared Asset version registration returned no record.");
        const serverValidation = one(await supabase.rpc("admin_validate_shared_asset_version", { p_asset_version_id: version.id }));
        if (!serverValidation || serverValidation.valid !== true) throw new Error(`Shared Asset server validation failed: ${JSON.stringify(serverValidation && serverValidation.blockers || [])}`);
        return { asset: validated.asset, version: registered, validation: serverValidation };
      } catch (error) {
        try { await discardDraftVersion(version, { removeBinary: true }); } catch (_) {}
        throw error;
      }
    },

    async discardVersion(version) {
      return discardDraftVersion(version, { removeBinary: true });
    },

    async validateVersion(assetVersionId) {
      return one(await supabase.rpc("admin_validate_shared_asset_version", { p_asset_version_id: assetVersionId }));
    },

    async publishVersion(assetVersionId) {
      return one(await supabase.rpc("admin_publish_shared_asset_version", { p_asset_version_id: assetVersionId }));
    },

    async archive(assetId) {
      return one(await supabase.rpc("admin_archive_shared_asset", { p_asset_id: assetId }));
    },

    async restore(assetId) {
      return one(await supabase.rpc("admin_restore_shared_asset", { p_asset_id: assetId }));
    },

    async listUsages(assetId) {
      return rows(await supabase.rpc("admin_list_shared_asset_usages", { p_asset_id: assetId }));
    },

    getPublicVersionUrl(version) {
      if (!version || !version.storage_path) return "";
      const bucket = text(version.storage_bucket || SHARED_ASSET_BUCKET) || SHARED_ASSET_BUCKET;
      const response = supabase.storage.from(bucket).getPublicUrl(version.storage_path);
      return response && response.data ? text(response.data.publicUrl) : "";
    }
  });
}
