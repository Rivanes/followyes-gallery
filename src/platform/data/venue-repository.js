import { payload, rows, requireClient, cleanObject } from "./base.js";
import { VENUE_RUNTIME_BUCKET } from "../supabase-config.js";

export class VenueRepository {
  constructor(client) {
    this.client = requireClient(client);
  }

  async list(filters = {}) {
    return rows(await this.client.rpc("admin_list_venues", {
      p_status: filters.status || null,
      p_search: filters.search || null
    }));
  }

  async get(id) {
    return payload(await this.client.rpc("admin_get_venue", { p_venue_id: id }));
  }

  async create(input) {
    return payload(await this.client.rpc("admin_create_venue", {
      p_slug: input.slug,
      p_name: input.name,
      p_description: input.description || ""
    }));
  }

  async update(id, patch) {
    return payload(await this.client.rpc("admin_update_venue", {
      p_venue_id: id,
      p_patch: cleanObject(patch)
    }));
  }

  async archive(id) {
    return payload(await this.client.rpc("admin_archive_venue", { p_venue_id: id }));
  }

  async restore(id) {
    return payload(await this.client.rpc("admin_restore_venue", { p_venue_id: id }));
  }

  async createVersion(venueId, versionNumber, manifest = null) {
    return payload(await this.client.rpc("admin_create_venue_version", {
      p_venue_id: venueId,
      p_version_number: versionNumber,
      p_manifest: manifest
    }));
  }

  async saveManifest(versionId, manifest) {
    return payload(await this.client.rpc("admin_save_venue_manifest", {
      p_venue_version_id: versionId,
      p_manifest: manifest
    }));
  }

  async validateVersion(versionId) {
    return payload(await this.client.rpc("admin_validate_venue_version", { p_venue_version_id: versionId }));
  }

  async publishVersion(versionId) {
    return payload(await this.client.rpc("admin_publish_venue_version", { p_venue_version_id: versionId }));
  }

  async rollbackVersion(venueId) {
    return payload(await this.client.rpc("admin_rollback_venue_version", { p_venue_id: venueId }));
  }

  async uploadAsset({ venue, version, assetId, role, file, metadata = {} }) {
    if (!file) throw new Error("Asset file is required");
    const safeName = String(file.name || "asset.glb").replace(/[^a-zA-Z0-9._-]+/g, "-");
    const path = `venues/${venue.slug}/versions/${version.version_number}/models/${crypto.randomUUID()}-${safeName}`;
    const upload = await this.client.storage.from(VENUE_RUNTIME_BUCKET).upload(path, file, {
      cacheControl: "31536000",
      contentType: file.type || "model/gltf-binary",
      upsert: false
    });
    if (upload.error) throw upload.error;
    const publicUrlResult = this.client.storage.from(VENUE_RUNTIME_BUCKET).getPublicUrl(path);
    const publicUrl = publicUrlResult && publicUrlResult.data ? publicUrlResult.data.publicUrl : null;
    try {
      return payload(await this.client.rpc("admin_register_venue_asset", {
        p_venue_version_id: version.id,
        p_asset_id: assetId,
        p_role: role,
        p_storage_bucket: VENUE_RUNTIME_BUCKET,
        p_storage_path: path,
        p_public_url: publicUrl,
        p_mime_type: file.type || "model/gltf-binary",
        p_file_size: file.size || null,
        p_metadata: metadata
      }));
    } catch (error) {
      await this.client.storage.from(VENUE_RUNTIME_BUCKET).remove([path]);
      throw error;
    }
  }
}
