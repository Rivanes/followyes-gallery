import { payload, rows, requireClient, cleanObject } from "./base.js";

export class ExhibitionAdminRepository {
  constructor(client) {
    this.client = requireClient(client);
  }

  async list(filters = {}) {
    return rows(await this.client.rpc("admin_list_exhibitions", {
      p_venue_id: filters.venueId || null,
      p_status: filters.status || null,
      p_search: filters.search || null
    }));
  }

  async get(id) {
    return payload(await this.client.rpc("admin_get_exhibition", { p_exhibition_id: id }));
  }

  async create(input) {
    return payload(await this.client.rpc("admin_create_exhibition", {
      p_venue_id: input.venueId,
      p_venue_version_id: input.venueVersionId,
      p_slug: input.slug,
      p_title: input.title,
      p_patch: cleanObject(input.patch || {})
    }));
  }

  async update(id, patch, expectedRevision = null, expectedLockVersion = null) {
    return payload(await this.client.rpc("admin_save_exhibition_document", {
      p_exhibition_id: id,
      p_patch: cleanObject(patch),
      p_expected_revision: expectedRevision,
      p_expected_lock_version: expectedLockVersion
    }));
  }

  async saveCard(id, card, expectedRevision = null, expectedLockVersion = null) {
    return payload(await this.client.rpc("admin_save_exhibition_card", {
      p_exhibition_id: id,
      p_card: card,
      p_expected_revision: expectedRevision,
      p_expected_lock_version: expectedLockVersion
    }));
  }

  async validate(id) {
    return payload(await this.client.rpc("admin_validate_exhibition", { p_exhibition_id: id }));
  }

  async publish(id, expected = {}) {
    return payload(await this.client.rpc("admin_publish_exhibition_bundle", {
      p_exhibition_id: id,
      p_expected_draft_revision: expected.draftRevision ?? null,
      p_expected_card_revision: expected.cardRevision ?? null,
      p_expected_state_lock_version: expected.stateLockVersion ?? null,
      p_expected_card_lock_version: expected.cardLockVersion ?? null
    }));
  }

  async rollback(id) {
    return payload(await this.client.rpc("admin_rollback_exhibition_bundle", { p_exhibition_id: id }));
  }

  async schedule(id, scheduledAt) {
    return payload(await this.client.rpc("admin_schedule_exhibition", {
      p_exhibition_id: id,
      p_scheduled_at: scheduledAt
    }));
  }

  async assignVenue(id, venueId, venueVersionId) {
    return payload(await this.client.rpc("admin_assign_exhibition_venue", {
      p_exhibition_id: id,
      p_venue_id: venueId,
      p_venue_version_id: venueVersionId
    }));
  }

  async duplicate(id, options) {
    return payload(await this.client.rpc("admin_duplicate_exhibition", {
      p_exhibition_id: id,
      p_slug: options.slug,
      p_title: options.title,
      p_options: cleanObject(options)
    }));
  }

  async setAuthors(id, authors) {
    return payload(await this.client.rpc("admin_set_exhibition_authors", {
      p_exhibition_id: id,
      p_authors: authors || []
    }));
  }

  async archive(id) {
    return payload(await this.client.rpc("admin_archive_exhibition", { p_exhibition_id: id }));
  }

  async restore(id) {
    return payload(await this.client.rpc("admin_restore_exhibition", { p_exhibition_id: id }));
  }
}
