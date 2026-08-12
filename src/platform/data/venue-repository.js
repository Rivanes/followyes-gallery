import { payload, rows, requireClient, cleanObject } from "./base.js";
import { createMediaService } from "../media/media-service.js";
import { PLATFORM_MEDIA_BUCKET, VENUE_RUNTIME_BUCKET } from "../supabase-config.js";

export class VenueRepository {
  constructor(client, options = {}) {
    this.client = requireClient(client);
    this.mediaService = options.mediaService || createMediaService({
      client: this.client,
      platformBucket: PLATFORM_MEDIA_BUCKET,
      venueBucket: VENUE_RUNTIME_BUCKET
    });
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
    const upload = await this.mediaService.upload(file, {
      ownerType: "venue",
      ownerId: venue.id,
      venueId: venue.id,
      venueVersionId: version.id,
      entityType: role === "manifest" ? "manifest" : "venue-asset",
      entityId: assetId,
      category: role === "navigation" ? "navigation" : role === "texture" ? "textures" : role === "preview" ? "preview" : "models",
      usageRole: role,
      mediaType: role === "manifest" ? "manifest" : "venue-asset",
      metadata: { ...metadata, assetId, role, venueSlug: venue.slug, versionNumber: version.version_number }
    });
    try {
      const registered = payload(await this.client.rpc("admin_register_venue_asset_from_media", {
        p_venue_version_id: version.id,
        p_asset_id: assetId,
        p_role: role,
        p_media_id: upload.mediaId,
        p_metadata: metadata
      }));
      await this.mediaService.finalize(upload.operation.id, upload.operationToken);
      return registered;
    } catch (error) {
      try { await this.mediaService.discard(upload.operation.id, upload.operationToken, "venue-asset-registration-failed"); } catch (_) {}
      throw error;
    }
  }
}
