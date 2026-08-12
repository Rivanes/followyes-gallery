import { payload, rows, requireClient } from "./base.js";
import { createMediaService } from "../media/media-service.js";
import { PLATFORM_MEDIA_BUCKET, VENUE_RUNTIME_BUCKET } from "../supabase-config.js";

export class MediaAdminRepository {
  constructor(client, options = {}) {
    this.client = requireClient(client);
    this.service = options.service || createMediaService({
      client: this.client,
      platformBucket: PLATFORM_MEDIA_BUCKET,
      venueBucket: VENUE_RUNTIME_BUCKET
    });
  }

  async list(filters = {}) {
    return rows(await this.client.rpc("admin_list_media", {
      p_owner_type: filters.ownerType || null,
      p_owner_id: filters.ownerId || null,
      p_media_type: filters.mediaType || null,
      p_include_archived: filters.includeArchived === true
    }));
  }

  /**
   * Canonical upload entrypoint used by all CMS modules.
   * ownerType determines the Storage root; global Media Library is explicit ownerType=platform.
   */
  async upload(file, context = {}) {
    return this.service.upload(file, {
      ownerType: context.ownerType || "platform",
      ownerId: context.ownerId || null,
      exhibitionId: context.exhibitionId || null,
      venueId: context.venueId || null,
      venueVersionId: context.venueVersionId || null,
      entityType: context.entityType || "asset",
      entityId: context.entityId || null,
      category: context.category || null,
      usageRole: context.usageRole || "asset",
      mediaType: context.mediaType || "asset",
      previousMediaId: context.previousMediaId || null,
      previousPaths: context.previousPaths || [],
      metadata: context.metadata || {},
      rasterVariants: context.rasterVariants || undefined,
      validationProfile: context.validationProfile || undefined,
      uploadLimits: context.uploadLimits || undefined
    });
  }

  async uploadSharedLibraryFile(file, mediaType = "asset", metadata = {}) {
    const result = await this.upload(file, {
      ownerType: "platform",
      entityType: "media-library",
      entityId: crypto.randomUUID(),
      category: "media-library",
      usageRole: "shared-library",
      mediaType,
      metadata
    });
    await this.service.finalize(result.operation.id, result.operationToken);
    return result;
  }

  /**
   * Uploads a canonical author photo into the explicit shared Media Library.
   * The caller must save the Author record before finalizing the operation.
   */
  async uploadAuthorPhoto(file, options = {}) {
    return this.upload(file, {
      ownerType: "platform",
      entityType: "author",
      entityId: options.authorId || crypto.randomUUID(),
      category: "media-library",
      usageRole: "author-photo",
      mediaType: "author-photo",
      validationProfile: "author",
      previousMediaId: options.previousMediaId || null,
      metadata: {
        ...(options.metadata || {}),
        title: options.title || file?.name || "Author photo",
        authorId: options.authorId || null,
        canonicalAuthorPhoto: true
      }
    });
  }

  async uploadExhibitionFile(file, exhibitionId, options = {}) {
    if (!exhibitionId) throw new Error("Exhibition id is required");
    return this.upload(file, {
      ...options,
      ownerType: "exhibition",
      ownerId: exhibitionId,
      exhibitionId,
      entityType: options.entityType || "branding",
      entityId: options.entityId || exhibitionId,
      category: options.category || "branding",
      usageRole: options.usageRole || "branding-asset"
    });
  }

  async uploadSiteFile(file, options = {}) {
    return this.upload(file, {
      ...options,
      ownerType: "site",
      ownerId: options.ownerId || "site",
      entityType: options.entityType || "homepage",
      entityId: options.entityId || "homepage",
      category: options.category || "homepage",
      usageRole: options.usageRole || "site-media"
    });
  }

  async importUrl(url, context = {}) {
    return this.service.importUrl(url, context);
  }

  async attachExisting(mediaId, context = {}) {
    return this.service.attachExisting(mediaId, context);
  }

  async repairVariants(mediaId, context = {}) {
    return this.service.repairVariants(mediaId, context);
  }

  async finalizeUpload(result) {
    if (!result?.operation?.id || !result?.operationToken) throw new Error("A committed media operation is required.");
    return this.service.finalize(result.operation.id, result.operationToken);
  }

  async discardUpload(result, reason = "owner-save-failed") {
    if (!result?.operation?.id || !result?.operationToken) return null;
    return this.service.discard(result.operation.id, result.operationToken, reason);
  }

  async finalizePending(context = {}) {
    return this.service.finalizePending(context);
  }

  async discardPending(context = {}, reason = "draft-abandoned") {
    return this.service.discardPending(context, reason);
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
