/*
  Exhibition Platform — C6C8C24 Gallery Management data adapter.
  This is the only C23 Admin layer that knows concrete Venue/Gallery RPC and Storage names.
*/

export const GALLERY_MANAGEMENT_STAGE = "C6C8C24";
export const GALLERY_RUNTIME_BUCKET = "venue-runtime";
export const CONTROLLED_GALLERY_ASSET_ROLES = Object.freeze(["floor", "walls", "ceiling", "props"]);
export const REQUIRED_GALLERY_ASSET_ROLES = Object.freeze(["floor", "walls", "ceiling"]);
export const OPTIONAL_GALLERY_ASSET_ROLES = Object.freeze(["props"]);

function text(value) {
  return String(value == null ? "" : value).trim();
}

function rows(response) {
  if (!response) return [];
  if (response.error) throw response.error;
  return Array.isArray(response.data) ? response.data : response.data == null ? [] : [response.data];
}

function one(response) {
  return rows(response)[0] || null;
}

function uuid() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function safeFileName(name) {
  const value = text(name || "asset.glb").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const cleaned = value.replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96);
  return cleaned || "asset.glb";
}

function roleName(role) {
  const value = text(role).toLowerCase();
  if (!CONTROLLED_GALLERY_ASSET_ROLES.includes(value)) throw new Error(`Unsupported Gallery asset role: ${value || "(missing)"}.`);
  return value;
}

function buildAssetUploadPathValue({ venueId, venueVersionId, role, fileName }) {
  const normalizedRole = roleName(role);
  const venue = text(venueId);
  const version = text(venueVersionId);
  if (!venue || !version) throw new Error("Gallery and Gallery Version IDs are required for upload path construction.");
  return `venues/${venue}/versions/${version}/assets/${normalizedRole}/${uuid()}-${safeFileName(fileName)}`;
}

function finiteVec3(value, label) {
  value = value && typeof value === "object" ? value : {};
  const result = { x: Number(value.x), y: Number(value.y), z: Number(value.z) };
  if (![result.x, result.y, result.z].every(Number.isFinite)) throw new Error(`${label || "Vector"} requires finite X / Y / Z values.`);
  return result;
}

async function removeStoragePathsBestEffort(supabase, paths) {
  const unique = [...new Set((Array.isArray(paths) ? paths : []).map(text).filter(Boolean))];
  if (!unique.length) return { removed: [], warnings: [] };
  const response = await supabase.storage.from(GALLERY_RUNTIME_BUCKET).remove(unique);
  if (response.error) return { removed: [], warnings: [`Storage cleanup failed: ${response.error.message || response.error}`] };
  return { removed: unique, warnings: [] };
}

export function createGalleryManagementApi({ supabase }) {
  if (!supabase) throw new Error("Supabase client is required for Gallery Management.");

  return Object.freeze({
    stage: GALLERY_MANAGEMENT_STAGE,
    bucket: GALLERY_RUNTIME_BUCKET,
    controlledRoles: CONTROLLED_GALLERY_ASSET_ROLES,

    async getAdminContext() {
      return one(await supabase.rpc("get_admin_context"));
    },

    async list({ status = null, search = null } = {}) {
      return rows(await supabase.rpc("admin_list_venues", { p_status: status, p_search: search }));
    },

    async get(venueId) {
      const result = one(await supabase.rpc("admin_get_venue", { p_venue_id: venueId }));
      if (!result || !result.venue) throw new Error("Gallery could not be loaded.");
      return result;
    },

    async create({ name, description = "" }) {
      const result = one(await supabase.rpc("admin_create_gallery_with_initial_draft", {
        p_name: text(name),
        p_description: text(description)
      }));
      if (!result || !result.venue || !result.draftVersion) throw new Error("Gallery creation returned an incomplete result.");
      return result;
    },

    async updateDetails(venueId, patch = {}) {
      const cleanPatch = {};
      if (patch.name !== undefined) cleanPatch.name = text(patch.name);
      if (patch.description !== undefined) cleanPatch.description = text(patch.description);
      const venue = one(await supabase.rpc("admin_update_venue", { p_venue_id: venueId, p_patch: cleanPatch }));
      if (!venue) throw new Error("Gallery details update returned no row.");
      return venue;
    },

    async beginDraft(venueId) {
      const result = one(await supabase.rpc("admin_begin_venue_draft", { p_venue_id: venueId }));
      if (!result || !result.draftVersion) throw new Error("Gallery Draft Version could not be opened.");
      return result;
    },

    async discardDraft(versionId) {
      const result = one(await supabase.rpc("admin_discard_venue_draft", { p_venue_version_id: versionId }));
      if (!result) throw new Error("Discard Draft returned no result.");
      const cleanup = await removeStoragePathsBestEffort(supabase, result.cleanupCandidates || []);
      return { ...result, cleanup };
    },

    buildAssetUploadPath(options) {
      return buildAssetUploadPathValue(options || {});
    },

    async uploadAssetSlot({ venueId, venueVersionId, role, file, validation }) {
      if (!file) throw new Error("Choose a GLB file.");
      const normalizedRole = roleName(role);
      const extension = text(file.name).toLowerCase();
      if (!extension.endsWith(".glb")) throw new Error("Gallery building asset must be a self-contained .glb file.");
      if (!validation || validation.valid !== true || validation.role !== normalizedRole || !/^sha256:[0-9a-f]{64}$/.test(text(validation.fileHash))) {
        throw new Error("C23 deep validation must pass before a Gallery model can be uploaded.");
      }
      if (Number(validation.fileSize) !== Number(file.size)) throw new Error("Validated file size does not match the selected upload.");
      const path = buildAssetUploadPathValue({ venueId, venueVersionId, role: normalizedRole, fileName: file.name });
      const contentType = file.type || "model/gltf-binary";
      const validationForStorage = { ...validation, sourceStoragePath: path };
      const upload = await supabase.storage.from(GALLERY_RUNTIME_BUCKET).upload(path, file, {
        cacheControl: "31536000",
        upsert: false,
        contentType
      });
      if (upload.error) throw upload.error;

      try {
        const response = one(await supabase.rpc("admin_set_venue_asset_slot", {
          p_venue_version_id: venueVersionId,
          p_role: normalizedRole,
          p_storage_bucket: GALLERY_RUNTIME_BUCKET,
          p_storage_path: path,
          p_public_url: null,
          p_mime_type: contentType,
          p_file_size: Number(file.size) || 0,
          p_file_hash: validationForStorage.fileHash,
          p_metadata: { originalName: file.name || "", uploadedAt: new Date().toISOString(), c22ControlledSlot: true, c23ModelValidation: validationForStorage }
        }));
        if (!response || !response.asset) throw new Error("Gallery asset slot update returned an incomplete result.");
        const cleanup = await removeStoragePathsBestEffort(supabase, response.cleanupCandidates || []);
        return { ...response, uploadedPath: path, cleanup };
      } catch (error) {
        await supabase.storage.from(GALLERY_RUNTIME_BUCKET).remove([path]).catch(() => null);
        throw error;
      }
    },

    async recordAssetValidation({ venueVersionId, role, validation }) {
      const normalizedRole = roleName(role);
      if (!validation || validation.valid !== true || validation.role !== normalizedRole) throw new Error("Only a passing C23 model validation can be recorded.");
      const result = one(await supabase.rpc("admin_record_venue_asset_validation", {
        p_venue_version_id: venueVersionId,
        p_role: normalizedRole,
        p_file_hash: validation.fileHash,
        p_validation: validation
      }));
      if (!result || !result.asset) throw new Error("Gallery model validation could not be recorded.");
      return result;
    },

    async clearOptionalAssetSlot(venueVersionId, role) {
      const normalizedRole = roleName(role);
      if (!OPTIONAL_GALLERY_ASSET_ROLES.includes(normalizedRole)) throw new Error(`${normalizedRole} is required and cannot be cleared.`);
      const result = one(await supabase.rpc("admin_clear_venue_asset_slot", { p_venue_version_id: venueVersionId, p_role: normalizedRole }));
      if (!result) throw new Error("Optional Gallery asset could not be cleared.");
      const cleanup = await removeStoragePathsBestEffort(supabase, result.cleanupCandidates || []);
      return { ...result, cleanup };
    },

    getAssetDeliveryUrl(asset) {
      asset = asset && typeof asset === "object" ? asset : {};
      if (text(asset.public_url)) return text(asset.public_url);
      const bucket = text(asset.storage_bucket);
      const path = text(asset.storage_path);
      if (!bucket || !path) return "";
      const result = supabase.storage.from(bucket).getPublicUrl(path);
      return result && result.data && result.data.publicUrl ? String(result.data.publicUrl) : "";
    },

    async setEntryPoint(versionId, position, target) {
      const result = one(await supabase.rpc("admin_set_venue_entry_point", {
        p_venue_version_id: versionId,
        p_position: finiteVec3(position, "Entry position"),
        p_target: finiteVec3(target, "Entry target")
      }));
      if (!result || !result.entry) throw new Error("Entry Point update returned no result.");
      return result;
    },

    async validate(versionId) {
      const report = one(await supabase.rpc("admin_validate_venue_version", { p_venue_version_id: versionId }));
      if (!report) throw new Error("Gallery validation returned no report.");
      return report;
    },

    async publish(versionId) {
      const result = one(await supabase.rpc("admin_publish_venue_version", { p_venue_version_id: versionId }));
      if (!result) throw new Error("Gallery publish returned no result.");
      return result;
    },

    async rollback(venueId) {
      const result = one(await supabase.rpc("admin_rollback_venue_version", { p_venue_id: venueId }));
      if (!result) throw new Error("Gallery rollback returned no result.");
      return result;
    },

    async archive(venueId) {
      const venue = one(await supabase.rpc("admin_archive_venue", { p_venue_id: venueId }));
      if (!venue) throw new Error("Gallery archive returned no result.");
      return venue;
    },

    async restore(venueId) {
      const venue = one(await supabase.rpc("admin_restore_venue", { p_venue_id: venueId }));
      if (!venue) throw new Error("Gallery restore returned no result.");
      return venue;
    },

    async resolveTest(versionId) {
      const result = one(await supabase.rpc("admin_resolve_venue_version_for_test", { p_venue_version_id: versionId }));
      if (!result || !result.venue || !result.version || !result.manifest) throw new Error("Test Gallery package is incomplete.");
      return result;
    },

    cleanupPaths(paths) {
      return removeStoragePathsBestEffort(supabase, paths);
    }
  });
}
