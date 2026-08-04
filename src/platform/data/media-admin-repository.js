import { payload, rows, requireClient } from "./base.js";
import { PLATFORM_MEDIA_BUCKET } from "../supabase-config.js";

export class MediaAdminRepository {
  constructor(client) {
    this.client = requireClient(client);
  }

  async list(filters = {}) {
    return rows(await this.client.rpc("admin_list_media", {
      p_owner_type: filters.ownerType || null,
      p_owner_id: filters.ownerId || null,
      p_media_type: filters.mediaType || null,
      p_include_archived: filters.includeArchived === true
    }));
  }

  async uploadPlatformFile(file, mediaType = "asset", metadata = {}) {
    if (!file) throw new Error("Media file is required");
    const mediaId = crypto.randomUUID();
    const safeName = String(file.name || "asset.bin").replace(/[^a-zA-Z0-9._-]+/g, "-");
    const path = `media-library/${mediaId}/original/${safeName}`;
    const upload = await this.client.storage.from(PLATFORM_MEDIA_BUCKET).upload(path, file, {
      cacheControl: "31536000",
      contentType: file.type || "application/octet-stream",
      upsert: false
    });
    if (upload.error) throw upload.error;
    try {
      return payload(await this.client.rpc("admin_register_platform_media", {
        p_media_id: mediaId,
        p_media_type: mediaType,
        p_storage_bucket: PLATFORM_MEDIA_BUCKET,
        p_original_path: path,
        p_metadata: metadata
      }));
    } catch (error) {
      await this.client.storage.from(PLATFORM_MEDIA_BUCKET).remove([path]);
      throw error;
    }
  }

  async archive(id) {
    return payload(await this.client.rpc("admin_archive_media", { p_media_id: id }));
  }

  async restore(id) {
    return payload(await this.client.rpc("admin_restore_media", { p_media_id: id }));
  }

  async requestPermanentDelete(id) {
    return payload(await this.client.rpc("admin_request_media_delete", { p_media_id: id }));
  }

  async listAuthors(includeArchived = false) {
    return rows(await this.client.rpc("admin_list_authors", { p_include_archived: includeArchived }));
  }

  async saveAuthor(author) {
    return payload(await this.client.rpc("admin_upsert_author", {
      p_author_id: author.id || null,
      p_slug: author.slug || null,
      p_name: author.name,
      p_biography: author.biography || "",
      p_photo_media_id: author.photoMediaId || null,
      p_metadata: author.metadata || {}
    }));
  }

  async archiveAuthor(id) {
    return payload(await this.client.rpc("admin_archive_author", { p_author_id: id }));
  }

  async restoreAuthor(id) {
    return payload(await this.client.rpc("admin_restore_author", { p_author_id: id }));
  }
}
