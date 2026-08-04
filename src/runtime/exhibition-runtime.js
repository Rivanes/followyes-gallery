/*
  Berryboy Art Gallery — Exhibition Runtime
  Multi-Venue / Multi-Exhibition Data Architecture.

  This module is the only browser-side boundary allowed to know D2 table/RPC names.
  Babylon runtime receives a resolved exhibition context and repository services only.
*/

import { normalizeVenueManifest } from "./venue-runtime.js";

export const EXHIBITION_STATE_SCHEMA = "berryboy-exhibition-state.v1";
export const EXHIBITION_RUNTIME_SCHEMA = "berryboy-exhibition-runtime.v2";
export const EXHIBITION_ROUTE_SCHEMA = "berryboy-exhibition-route.v1";
export const EXHIBITION_STATUS = Object.freeze(["draft", "scheduled", "published", "hidden", "archived"]);
export const PUBLIC_EXHIBITION_STATUSES = Object.freeze(["published"]);

const DEFAULT_EXHIBITION_ID = "00000000-0000-4000-8000-000000000001";
const DEFAULT_EXHIBITION_SLUG = "berryboy-main";

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stringValue(value) {
  return String(value == null ? "" : value).trim();
}

function numberValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function firstRow(response) {
  const rows = asArray(response && response.data);
  return rows[0] || null;
}

function responsePayload(response) {
  const data = response && response.data;
  if (Array.isArray(data)) return data[0] || null;
  return isObject(data) ? data : null;
}

function isMissingRelationError(error) {
  const code = stringValue(error && error.code);
  const message = stringValue(error && error.message).toLowerCase();
  return code === "42P01" || code === "42883" || code === "PGRST202" || code === "PGRST205" || code === "PGRST204" || message.includes("does not exist") || message.includes("could not find the table") || message.includes("could not find the function");
}

function isConflictError(error) {
  const code = stringValue(error && error.code);
  const message = stringValue(error && error.message).toLowerCase();
  return code === "40001" || code === "P0001" && (message.includes("revision") || message.includes("lock")) || message.includes("revision conflict") || message.includes("lock conflict");
}

function normalizeStatus(status) {
  const value = stringValue(status).toLowerCase();
  return EXHIBITION_STATUS.includes(value) ? value : "draft";
}

function createFallbackExhibition(manifestUrl) {
  return {
    id: DEFAULT_EXHIBITION_ID,
    slug: DEFAULT_EXHIBITION_SLUG,
    title: "Berryboy Art Gallery",
    subtitle: "Main exhibition",
    shortDescription: "The first exhibition running on the multi-venue platform.",
    longDescription: "",
    status: "published",
    displayOrder: 0,
    buttonLabel: "Enter gallery",
    curator: "",
    startDate: null,
    endDate: null,
    databaseVenueId: null,
    databaseVenueVersionId: null,
    venueId: "berryboy-main",
    venueVersionId: "v1",
    venueName: "Berryboy Main",
    manifestUrl,
    manifest: null,
    storageScope: `exhibitions/${DEFAULT_EXHIBITION_ID}`,
    legacyStateRecordId: "main",
    legacyPreviousStateRecordId: "main_previous",
    source: "controlled-local-seed",
    cover: null,
    mobileCover: null,
    logo: null,
    theme: null
  };
}

export function readExhibitionRoute(locationLike, runtimeConfig) {
  const locationObject = locationLike || (typeof window !== "undefined" ? window.location : { search: "", pathname: "" });
  const params = new URLSearchParams(locationObject.search || "");
  const config = isObject(runtimeConfig) ? runtimeConfig : {};
  const exhibitionConfig = isObject(config.exhibition) ? config.exhibition : {};
  const platformConfig = isObject(config.platform) ? config.platform : {};
  const venueConfig = isObject(config.venue) ? config.venue : {};
  const pathParts = stringValue(locationObject.pathname).split("/").filter(Boolean);
  const pathExhibitionIndex = pathParts.indexOf("exhibitions");
  const pathSlug = pathExhibitionIndex >= 0 ? stringValue(pathParts[pathExhibitionIndex + 1]) : "";
  const requestedChannel = stringValue(params.get("channel") || exhibitionConfig.channel || "").toLowerCase();

  return Object.freeze({
    schema: EXHIBITION_ROUTE_SCHEMA,
    exhibitionId: stringValue(params.get("exhibitionId") || platformConfig.exhibitionId || exhibitionConfig.id) || null,
    exhibitionSlug: stringValue(params.get("exhibition") || pathSlug || platformConfig.exhibitionSlug || exhibitionConfig.slug) || null,
    requestedChannel: requestedChannel === "draft" || requestedChannel === "previous" ? requestedChannel : "published",
    venueId: stringValue(params.get("venueId") || venueConfig.venueId) || null,
    venueVersionId: stringValue(params.get("venueVersion") || venueConfig.versionId) || null,
    venueTestVersionId: stringValue(params.get("venueTestVersionId") || venueConfig.testVersionId) || null,
    manifestUrl: stringValue(params.get("venueManifest") || venueConfig.manifestUrl) || null,
    forceLegacy: params.get("legacyState") === "1" || exhibitionConfig.forceLegacy === true
  });
}

export function normalizeExhibitionRecord(row, extras) {
  const source = isObject(row) ? row : {};
  const joinedVenue = isObject(source.venues) ? source.venues : (isObject(source.venue) ? source.venue : {});
  const extra = isObject(extras) ? extras : {};
  const id = stringValue(source.id || source.exhibition_id || extra.id);
  const slug = stringValue(source.slug || source.exhibition_slug || extra.slug);
  if (!id) throw new Error("Exhibition record requires id");
  if (!slug) throw new Error("Exhibition record requires slug");

  const databaseVenueId = stringValue(source.database_venue_id || source.venue_id || joinedVenue.id || extra.databaseVenueId);
  const runtimeVenueId = stringValue(source.runtime_venue_id || source.venue_slug || joinedVenue.slug || source.venueId || extra.venueId || databaseVenueId);

  return Object.freeze({
    id,
    slug,
    title: stringValue(source.title || source.exhibition_title || extra.title) || slug,
    subtitle: stringValue(source.subtitle || extra.subtitle),
    shortDescription: stringValue(source.short_description || source.shortDescription || extra.shortDescription),
    longDescription: stringValue(source.long_description || source.longDescription || extra.longDescription),
    status: normalizeStatus(source.status || extra.status),
    displayOrder: numberValue(source.display_order ?? source.displayOrder ?? extra.displayOrder, 0),
    buttonLabel: stringValue(source.button_label || source.buttonLabel || extra.buttonLabel) || "Enter gallery",
    curator: stringValue(source.curator || extra.curator),
    startDate: source.start_date || source.startDate || extra.startDate || null,
    endDate: source.end_date || source.endDate || extra.endDate || null,
    scheduledAt: source.scheduled_at || source.scheduledAt || extra.scheduledAt || null,
    databaseVenueId: databaseVenueId || null,
    venueId: runtimeVenueId || null,
    venueName: stringValue(source.venue_name || joinedVenue.name || source.venueName || extra.venueName),
    cover: source.cover_media_id || source.cover || extra.cover || null,
    mobileCover: source.mobile_cover_media_id || source.mobileCover || extra.mobileCover || null,
    logo: source.logo_media_id || source.logo || extra.logo || null,
    theme: source.theme || extra.theme || null,
    source: stringValue(extra.source || source.source) || "supabase"
  });
}

export function createExhibitionStateEnvelope(options) {
  const source = isObject(options) ? options : {};
  const content = isObject(source.content) ? cloneJson(source.content) : {};
  const exhibitionId = stringValue(source.exhibitionId);
  const venueId = stringValue(source.venueId);
  const venueVersionId = stringValue(source.venueVersionId);
  const channel = ["draft", "published", "previous"].includes(source.channel) ? source.channel : "draft";
  if (!exhibitionId || !venueId || !venueVersionId) {
    throw new Error("Exhibition state envelope requires exhibitionId, venueId and venueVersionId");
  }
  return {
    schema: EXHIBITION_STATE_SCHEMA,
    schemaVersion: 1,
    exhibitionId,
    venueId,
    venueVersionId,
    channel,
    revision: Math.max(0, numberValue(source.revision, 0)),
    basedOnRevision: Math.max(0, numberValue(source.basedOnRevision, 0)),
    savedAt: source.savedAt || new Date().toISOString(),
    savedBy: source.savedBy || null,
    content
  };
}

export function unwrapExhibitionState(value, context) {
  const source = isObject(value) ? value : {};
  const runtime = isObject(context) ? context : {};
  const exhibition = isObject(runtime.exhibition) ? runtime.exhibition : runtime;
  const venue = isObject(runtime.venue) ? runtime.venue : {};
  if (source.schema === EXHIBITION_STATE_SCHEMA && isObject(source.content)) {
    const expectedExhibitionId = stringValue(exhibition.exhibitionId || exhibition.id);
    const expectedVenueId = stringValue(venue.venueId || exhibition.venueId);
    const expectedVenueVersionId = stringValue(venue.versionId || exhibition.venueVersionId);
    const expectedChannel = stringValue(exhibition.channel || runtime.channel);
    const mismatch =
      (expectedExhibitionId && stringValue(source.exhibitionId) !== expectedExhibitionId) ||
      (expectedVenueId && stringValue(source.venueId) !== expectedVenueId) ||
      (expectedVenueVersionId && stringValue(source.venueVersionId) !== expectedVenueVersionId) ||
      (["draft", "published", "previous"].includes(expectedChannel) && stringValue(source.channel) !== expectedChannel);
    if (mismatch) {
      const error = new Error("Exhibition state envelope does not belong to the requested runtime context");
      error.code = "EXHIBITION_STATE_BINDING_MISMATCH";
      throw error;
    }
    return {
      envelope: cloneJson(source),
      content: cloneJson(source.content),
      migrated: false,
      sourceSchema: source.schema
    };
  }

  const envelope = createExhibitionStateEnvelope({
    exhibitionId: exhibition.exhibitionId || exhibition.id || DEFAULT_EXHIBITION_ID,
    venueId: venue.venueId || exhibition.venueId || "berryboy-main",
    venueVersionId: venue.versionId || exhibition.venueVersionId || "v1",
    channel: exhibition.channel || "published",
    revision: source.saveIntegrity && source.saveIntegrity.revision || 0,
    savedAt: source.savedAt || new Date().toISOString(),
    content: source
  });
  envelope.migration = {
    from: stringValue(source.version) || "legacy-gallery-state",
    migratedAt: new Date().toISOString()
  };
  return { envelope, content: cloneJson(source), migrated: true, sourceSchema: stringValue(source.version) || "legacy" };
}

function selectStateChannel(row, channel) {
  const selectedChannel = ["draft", "previous"].includes(channel) ? channel : "published";
  const state = row ? row[`${selectedChannel}_state`] : null;
  const revision = row ? numberValue(row[`${selectedChannel}_revision`], 0) : 0;
  const venueVersionId = row ? stringValue(row[`${selectedChannel}_venue_version_id`]) : "";
  return { channel: selectedChannel, state, revision, venueVersionId };
}

export class ExhibitionStateRepository {
  constructor(options) {
    const source = isObject(options) ? options : {};
    this.supabase = source.supabase || null;
    this.exhibition = source.exhibition || null;
    this.channel = source.channel || "published";
    this.allowLegacyRead = source.allowLegacyRead !== false;
    this.legacyStateRecordId = stringValue(source.legacyStateRecordId || "main");
    this.legacyPreviousStateRecordId = stringValue(source.legacyPreviousStateRecordId || "main_previous");
    this.publicSnapshot = isObject(source.publicSnapshot) ? cloneJson(source.publicSnapshot) : null;
    this.lastLoaded = null;
    this.dataMode = source.dataMode || "d2";
  }

  get exhibitionId() {
    return stringValue(this.exhibition && this.exhibition.id);
  }

  async load(channel) {
    const selectedChannel = ["draft", "previous"].includes(channel) ? channel : "published";

    if (this.publicSnapshot && selectedChannel === "published") {
      const rawState = this.publicSnapshot.state || this.publicSnapshot.publishedState || null;
      const unwrapped = rawState ? unwrapExhibitionState(rawState, {
        exhibition: { exhibitionId: this.exhibitionId, channel: "published" },
        venue: { venueId: this.exhibition.venueId, versionId: this.exhibition.venueVersionId }
      }) : null;
      const result = {
        ok: true,
        status: rawState ? "state-ready" : "empty",
        state: unwrapped ? unwrapped.content : null,
        envelope: unwrapped ? unwrapped.envelope : null,
        channel: "published",
        revision: numberValue(this.publicSnapshot.revision, 0),
        lockVersion: numberValue(this.publicSnapshot.lockVersion, 0),
        venueId: this.exhibition.venueId,
        venueVersionId: this.exhibition.venueVersionId,
        updatedAt: this.publicSnapshot.updatedAt || null,
        source: "d2-public-rpc"
      };
      this.lastLoaded = result;
      this.dataMode = "d2-public-rpc";
      return result;
    }

    if (!this.supabase) return { ok: false, noClient: true, status: "no-client", state: null, channel: selectedChannel };
    if (selectedChannel !== "published" && !(this.exhibition && this.exhibition.authenticated)) {
      return { ok: false, status: "forbidden", reason: "private-channel-requires-auth", state: null, channel: selectedChannel };
    }

    const response = await this.supabase
      .from("exhibition_states")
      .select("exhibition_id, venue_id, draft_venue_version_id, draft_state, draft_revision, draft_updated_at, published_venue_version_id, published_state, published_revision, published_at, previous_venue_version_id, previous_state, previous_revision, previous_published_at, schema_version, lock_version, updated_at")
      .eq("exhibition_id", this.exhibitionId)
      .limit(1);

    if (response.error) {
      if (this.allowLegacyRead && isMissingRelationError(response.error)) return this.loadLegacy(selectedChannel, response.error);
      return { ok: false, status: "error", error: response.error, state: null, channel: selectedChannel };
    }

    const row = firstRow(response);
    if (!row) {
      if (this.allowLegacyRead) return this.loadLegacy(selectedChannel, null);
      return { ok: true, status: "empty", state: null, channel: selectedChannel, revision: 0, lockVersion: 0, source: "d2" };
    }

    const selected = selectStateChannel(row, selectedChannel);
    const unwrapped = selected.state ? unwrapExhibitionState(selected.state, {
      exhibition: { exhibitionId: this.exhibitionId, channel: selectedChannel },
      venue: { venueId: this.exhibition.venueId, versionId: this.exhibition.venueVersionId }
    }) : null;
    const result = {
      ok: true,
      status: selected.state ? "state-ready" : "empty",
      state: unwrapped ? unwrapped.content : null,
      envelope: unwrapped ? unwrapped.envelope : null,
      channel: selectedChannel,
      revision: selected.revision,
      lockVersion: numberValue(row.lock_version, 0),
      databaseVenueId: stringValue(row.venue_id),
      databaseVenueVersionId: selected.venueVersionId,
      venueId: this.exhibition.venueId,
      venueVersionId: this.exhibition.venueVersionId,
      updatedAt: row.updated_at || null,
      source: "d2",
      row
    };
    this.lastLoaded = result;
    this.dataMode = "d2";
    return result;
  }

  async loadLegacy(channel, relationError) {
    if (!this.supabase || !this.allowLegacyRead || this.exhibitionId !== DEFAULT_EXHIBITION_ID) {
      return { ok: false, status: "legacy-disabled", state: null, channel };
    }
    const recordId = channel === "previous" ? this.legacyPreviousStateRecordId : this.legacyStateRecordId;
    const response = await this.supabase
      .from("gallery_state")
      .select("state, updated_at")
      .eq("id", recordId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1);
    if (response.error) return { ok: false, status: "error", error: response.error, state: null, channel, legacyRelationError: relationError || null };
    const row = firstRow(response);
    const rawState = row && row.state ? row.state : null;
    const unwrapped = rawState ? unwrapExhibitionState(rawState, {
      exhibition: { exhibitionId: this.exhibitionId, channel },
      venue: { venueId: "berryboy-main", versionId: "v1" }
    }) : null;
    const result = {
      ok: true,
      status: rawState ? "state-ready" : "empty",
      state: unwrapped ? unwrapped.content : null,
      envelope: unwrapped ? unwrapped.envelope : null,
      channel,
      revision: rawState && rawState.saveIntegrity ? numberValue(rawState.saveIntegrity.revision, 0) : 0,
      lockVersion: 0,
      venueId: "berryboy-main",
      venueVersionId: "v1",
      updatedAt: row ? row.updated_at || null : null,
      source: "legacy-read-only",
      migrationRequired: true,
      legacyRecordId: recordId,
      legacyRelationError: relationError || null
    };
    this.lastLoaded = result;
    this.dataMode = "legacy-read-only";
    return result;
  }

  async saveDraft(content, options) {
    const config = isObject(options) ? options : {};
    if (!this.supabase) return { ok: false, reason: "no-client" };
    if (this.dataMode === "legacy-read-only") return { ok: false, reason: "d2-schema-required", migrationRequired: true };

    const databaseVenueId = stringValue(config.databaseVenueId || this.exhibition.databaseVenueId);
    const databaseVenueVersionId = stringValue(config.databaseVenueVersionId || this.exhibition.databaseVenueVersionId);
    if (!databaseVenueId || !databaseVenueVersionId) return { ok: false, reason: "database-venue-binding-missing" };

    const expectedRevision = Math.max(0, numberValue(config.expectedRevision, this.lastLoaded && this.lastLoaded.revision || 0));
    const expectedLockVersion = Math.max(0, numberValue(config.expectedLockVersion, this.lastLoaded && this.lastLoaded.lockVersion || 0));
    const envelope = createExhibitionStateEnvelope({
      exhibitionId: this.exhibitionId,
      venueId: stringValue(config.venueId || this.exhibition.venueId),
      venueVersionId: stringValue(config.venueVersionId || this.exhibition.venueVersionId),
      channel: "draft",
      revision: expectedRevision + 1,
      basedOnRevision: expectedRevision,
      savedBy: config.userId || null,
      content
    });

    const response = await this.supabase.rpc("save_exhibition_draft", {
      p_exhibition_id: this.exhibitionId,
      p_expected_draft_revision: expectedRevision,
      p_expected_lock_version: expectedLockVersion,
      p_venue_id: databaseVenueId,
      p_venue_version_id: databaseVenueVersionId,
      p_state: envelope
    });
    if (response.error) {
      return {
        ok: false,
        reason: isMissingRelationError(response.error) ? "d2-schema-required" : (isConflictError(response.error) ? "revision-conflict" : "save-draft-error"),
        error: response.error,
        migrationRequired: isMissingRelationError(response.error)
      };
    }
    const row = responsePayload(response) || {};
    const result = {
      ok: true,
      channel: "draft",
      revision: numberValue(row.draft_revision, expectedRevision + 1),
      lockVersion: numberValue(row.lock_version, expectedLockVersion + 1),
      savedAt: row.draft_updated_at || envelope.savedAt,
      envelope,
      state: cloneJson(content),
      source: "d2-rpc"
    };
    this.lastLoaded = result;
    this.dataMode = "d2";
    return result;
  }

  async publish(options) {
    const config = isObject(options) ? options : {};
    if (!this.supabase) return { ok: false, reason: "no-client" };
    if (this.dataMode === "legacy-read-only") return { ok: false, reason: "d2-schema-required", migrationRequired: true };
    const response = await this.supabase.rpc("publish_exhibition_state", {
      p_exhibition_id: this.exhibitionId,
      p_expected_draft_revision: Math.max(0, numberValue(config.expectedDraftRevision, this.lastLoaded && this.lastLoaded.revision || 0)),
      p_expected_lock_version: Math.max(0, numberValue(config.expectedLockVersion, this.lastLoaded && this.lastLoaded.lockVersion || 0))
    });
    if (response.error) return { ok: false, reason: isConflictError(response.error) ? "revision-conflict" : "publish-error", error: response.error };
    const row = responsePayload(response) || {};
    return {
      ok: true,
      channel: "published",
      publishedRevision: numberValue(row.published_revision, 0),
      previousRevision: numberValue(row.previous_revision, 0),
      draftRevision: numberValue(row.draft_revision, 0),
      lockVersion: numberValue(row.lock_version, 0),
      publishedAt: row.published_at || new Date().toISOString(),
      source: "d2-rpc"
    };
  }

  async rollback(options) {
    const config = isObject(options) ? options : {};
    if (!this.supabase) return { ok: false, reason: "no-client" };
    const response = await this.supabase.rpc("rollback_exhibition_state", {
      p_exhibition_id: this.exhibitionId,
      p_expected_lock_version: Math.max(0, numberValue(config.expectedLockVersion, this.lastLoaded && this.lastLoaded.lockVersion || 0))
    });
    if (response.error) return { ok: false, reason: isConflictError(response.error) ? "lock-conflict" : "rollback-error", error: response.error };
    const row = responsePayload(response) || {};
    return {
      ok: true,
      publishedRevision: numberValue(row.published_revision, 0),
      previousRevision: numberValue(row.previous_revision, 0),
      lockVersion: numberValue(row.lock_version, 0),
      source: "d2-rpc"
    };
  }
}

export class MediaRepository {
  constructor(options) {
    const source = isObject(options) ? options : {};
    this.supabase = source.supabase || null;
    this.bucket = stringValue(source.bucket) || "platform-media";
    this.exhibitionId = stringValue(source.exhibitionId);
    if (!this.exhibitionId) throw new Error("MediaRepository requires exhibitionId");
  }

  createMediaId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      crypto.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
  }

  createPath(options) {
    const source = isObject(options) ? options : {};
    const entityType = stringValue(source.entityType).replace(/[^a-z0-9-]+/gi, "-").toLowerCase() || "media";
    const entityId = stringValue(source.entityId).replace(/[^a-z0-9:_-]+/gi, "-") || this.createMediaId();
    const mediaId = stringValue(source.mediaId) || this.createMediaId();
    const variant = stringValue(source.variant).replace(/[^a-z0-9-]+/gi, "-").toLowerCase() || "original";
    const fileName = stringValue(source.fileName).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "asset.bin";
    return `exhibitions/${this.exhibitionId}/${entityType}/${entityId}/${mediaId}/${variant}/${fileName}`;
  }

  async registerMedia(options) {
    const source = isObject(options) ? options : {};
    if (!this.supabase) return { ok: false, reason: "no-client" };
    const response = await this.supabase.rpc("register_exhibition_media", {
      p_exhibition_id: this.exhibitionId,
      p_media_id: source.mediaId,
      p_media_type: source.mediaType || "asset",
      p_bucket: source.bucket || this.bucket,
      p_original_path: source.originalPath || null,
      p_desktop_avif_path: source.desktopPath || null,
      p_mobile_avif_path: source.mobilePath || null,
      p_preview_avif_path: source.previewPath || null,
      p_entity_type: source.entityType || null,
      p_entity_id: source.entityId || null,
      p_usage_role: source.usageRole || null,
      p_metadata: isObject(source.metadata) ? source.metadata : {}
    });
    if (response.error) {
      return { ok: false, reason: isMissingRelationError(response.error) ? "d2-schema-required" : "media-register-error", error: response.error };
    }
    return { ok: true, data: response.data };
  }

  async detachUsage(options) {
    const source = isObject(options) ? options : {};
    if (!this.supabase) return { ok: false, reason: "no-client" };
    const response = await this.supabase.rpc("detach_media_usage", {
      p_media_id: source.mediaId,
      p_owner_type: "exhibition",
      p_owner_id: this.exhibitionId,
      p_entity_type: source.entityType || null,
      p_entity_id: source.entityId || null,
      p_usage_role: source.usageRole || null
    });
    return response.error ? { ok: false, reason: "usage-detach-error", error: response.error } : { ok: true, data: response.data };
  }

  async syncUsages(usages) {
    if (!this.supabase) return { ok: false, reason: "no-client" };
    const normalized = asArray(usages).map((usage) => ({
      media_id: stringValue(usage && usage.mediaId),
      entity_type: stringValue(usage && usage.entityType) || "state",
      entity_id: stringValue(usage && usage.entityId) || stringValue(usage && usage.mediaId),
      usage_role: stringValue(usage && usage.usageRole) || "state-reference"
    })).filter((usage) => usage.media_id);
    const response = await this.supabase.rpc("sync_exhibition_media_usages", {
      p_exhibition_id: this.exhibitionId,
      p_usages: normalized
    });
    if (response.error) {
      return { ok: false, reason: isMissingRelationError(response.error) ? "d2-schema-required" : "usage-sync-error", error: response.error };
    }
    return { ok: true, data: response.data, count: normalized.length };
  }

  async filterDeletablePaths(bucket, paths) {
    const normalizedPaths = Array.from(new Set(asArray(paths).map(stringValue).filter(Boolean)));
    if (!normalizedPaths.length) return { ok: true, deletable: [], protected: [] };
    if (!this.supabase) return { ok: false, reason: "no-client", deletable: [], protected: normalizedPaths };
    const response = await this.supabase.rpc("filter_deletable_media_paths", {
      p_exhibition_id: this.exhibitionId,
      p_bucket: stringValue(bucket || this.bucket),
      p_paths: normalizedPaths
    });
    if (response.error) {
      return {
        ok: false,
        reason: isMissingRelationError(response.error) ? "d2-schema-required" : "reference-check-error",
        error: response.error,
        deletable: [],
        protected: normalizedPaths
      };
    }
    const data = response.data;
    const rows = Array.isArray(data) ? data : (isObject(data) && Array.isArray(data.paths) ? data.paths : []);
    const deletable = rows.map((row) => stringValue(isObject(row) ? row.path : row)).filter(Boolean);
    const deletableSet = new Set(deletable);
    return {
      ok: true,
      deletable,
      protected: normalizedPaths.filter((path) => !deletableSet.has(path))
    };
  }

  async confirmDeletedPaths(bucket, paths) {
    const normalizedPaths = Array.from(new Set(asArray(paths).map(stringValue).filter(Boolean)));
    if (!normalizedPaths.length) return { ok: true, count: 0 };
    if (!this.supabase) return { ok: false, reason: "no-client" };
    const response = await this.supabase.rpc("confirm_deleted_media_paths", {
      p_exhibition_id: this.exhibitionId,
      p_bucket: stringValue(bucket || this.bucket),
      p_paths: normalizedPaths
    });
    return response.error
      ? { ok: false, reason: "media-delete-confirm-error", error: response.error }
      : { ok: true, count: numberValue(response.data, 0) };
  }
}

function normalizeCatalogRows(data) {
  const rows = Array.isArray(data) ? data : (isObject(data) && Array.isArray(data.exhibitions) ? data.exhibitions : []);
  return rows.map((row) => normalizeExhibitionRecord(row));
}

async function listPublishedFromSupabase(supabase) {
  if (!supabase) return { ok: false, rows: [], noClient: true };
  const response = await supabase.rpc("list_published_exhibitions");
  if (response.error) return { ok: false, rows: [], error: response.error };
  return { ok: true, rows: normalizeCatalogRows(response.data) };
}

async function fetchAuthenticatedExhibitionRow(supabase, route) {
  if (!supabase) return { ok: false, row: null, noClient: true };
  let query = supabase
    .from("exhibitions")
    .select("id, slug, title, subtitle, short_description, long_description, status, display_order, button_label, curator, start_date, end_date, scheduled_at, venue_id, cover_media_id, mobile_cover_media_id, logo_media_id, venues:venue_id(id, slug, name)");
  if (route.exhibitionId) query = query.eq("id", route.exhibitionId);
  else query = query.eq("slug", route.exhibitionSlug);
  const response = await query.limit(1);
  return response.error ? { ok: false, row: null, error: response.error } : { ok: true, row: firstRow(response) };
}

async function fetchPublicRuntime(supabase, route) {
  if (!supabase) return { ok: false, row: null, noClient: true };
  const response = await supabase.rpc("resolve_published_exhibition", {
    p_exhibition_id: route.exhibitionId || null,
    p_exhibition_slug: route.exhibitionSlug || null
  });
  return response.error ? { ok: false, row: null, error: response.error } : { ok: true, row: responsePayload(response) };
}

async function fetchStateBinding(supabase, exhibitionId, channel) {
  if (!supabase) return { ok: false, row: null, noClient: true };
  const response = await supabase
    .from("exhibition_states")
    .select("exhibition_id, venue_id, draft_venue_version_id, draft_revision, published_venue_version_id, published_revision, previous_venue_version_id, previous_revision, lock_version")
    .eq("exhibition_id", exhibitionId)
    .limit(1);
  if (response.error) return { ok: false, row: null, error: response.error };
  const row = firstRow(response);
  const selected = selectStateChannel(row, channel);
  return {
    ok: true,
    row,
    databaseVenueId: row ? stringValue(row.venue_id) : "",
    databaseVenueVersionId: selected.venueVersionId,
    revision: selected.revision,
    lockVersion: row ? numberValue(row.lock_version, 0) : 0
  };
}


async function fetchVenueTestVersion(supabase, venueVersionId) {
  if (!supabase) return { ok: false, row: null, noClient: true };
  const response = await supabase
    .from("venue_versions")
    .select("id, venue_id, version_number, manifest, manifest_url, manifest_bucket, manifest_path, schema_version, status, venues:venue_id(id, slug, name)")
    .eq("id", venueVersionId)
    .limit(1);
  return response.error ? { ok: false, row: null, error: response.error } : { ok: true, row: firstRow(response) };
}

async function fetchVenueVersion(supabase, databaseVenueId, databaseVenueVersionId) {
  if (!supabase) return { ok: false, row: null, noClient: true };
  let response = await supabase
    .from("venue_versions")
    .select("id, venue_id, version_number, manifest, manifest_url, manifest_bucket, manifest_path, schema_version, status, venues:venue_id(id, slug, name)")
    .eq("venue_id", databaseVenueId)
    .eq("id", databaseVenueVersionId)
    .limit(1);
  if (response.error && !isMissingRelationError(response.error)) return { ok: false, row: null, error: response.error };
  if (!response.error && firstRow(response)) return { ok: true, row: firstRow(response) };

  response = await supabase
    .from("venue_versions")
    .select("id, venue_id, version_number, manifest, manifest_url, manifest_bucket, manifest_path, schema_version, status, venues:venue_id(id, slug, name)")
    .eq("venue_id", databaseVenueId)
    .eq("version_number", databaseVenueVersionId)
    .limit(1);
  if (response.error) return { ok: false, row: null, error: response.error };
  return { ok: true, row: firstRow(response) };
}

function resolveManifestFromRow(row, route, supabase) {
  const manifestBucket = stringValue(row && (row.manifest_bucket || row.manifestBucket)) || "venue-runtime";
  const manifestPath = stringValue(row && (row.manifest_path || row.manifestPath));
  let manifestUrl = stringValue(row && (row.manifest_url || row.manifestUrl) || route.manifestUrl);
  if (!manifestUrl && manifestPath && supabase && supabase.storage && typeof supabase.storage.from === "function") {
    try {
      const publicUrlResult = supabase.storage.from(manifestBucket).getPublicUrl(manifestPath);
      manifestUrl = stringValue(publicUrlResult && publicUrlResult.data && publicUrlResult.data.publicUrl);
    } catch (_error) {}
  }
  let manifest = null;
  if (isObject(row && row.manifest)) manifest = normalizeVenueManifest(row.manifest, { manifestUrl });
  return { manifestUrl, manifestBucket, manifestPath, manifest };
}

function buildResolvedExhibition(exhibition, data) {
  const source = isObject(data) ? data : {};
  const manifest = source.manifest || null;
  const runtimeVenueId = stringValue(manifest && manifest.venueId || source.venueSlug || exhibition.venueId);
  const runtimeVersionId = stringValue(manifest && manifest.versionId || source.venueVersionNumber || source.databaseVenueVersionId);
  if (!runtimeVenueId || !runtimeVersionId) throw new Error("Resolved exhibition requires runtime Venue id and version id");
  return Object.freeze(Object.assign({}, exhibition, {
    authenticated: !!source.authenticated,
    databaseVenueId: stringValue(source.databaseVenueId || exhibition.databaseVenueId) || null,
    databaseVenueVersionId: stringValue(source.databaseVenueVersionId) || null,
    venueId: runtimeVenueId,
    venueVersionId: runtimeVersionId,
    venueName: stringValue(source.venueName || exhibition.venueName),
    manifestUrl: source.manifestUrl || null,
    manifest,
    storageScope: `exhibitions/${exhibition.id}`,
    legacyStateRecordId: "main",
    legacyPreviousStateRecordId: "main_previous"
  }));
}

export async function listPublishedExhibitions(options) {
  const source = isObject(options) ? options : {};
  const fallback = createFallbackExhibition(source.defaultManifestUrl);
  const result = await listPublishedFromSupabase(source.supabase);
  if (result.ok && result.rows.length) return { ok: true, source: "supabase-public-rpc", exhibitions: result.rows };
  if (result.error && !isMissingRelationError(result.error)) return { ok: false, source: "supabase-public-rpc", exhibitions: [], error: result.error };
  return {
    ok: true,
    source: "controlled-local-seed",
    exhibitions: [normalizeExhibitionRecord(fallback, fallback)],
    migrationRequired: true,
    databaseError: result.error || null
  };
}

export async function resolveExhibitionRuntime(options) {
  const source = isObject(options) ? options : {};
  const route = source.route || readExhibitionRoute(source.location, source.runtimeConfig);
  const authenticated = !!source.session;
  const requestedChannel = authenticated ? (route.requestedChannel === "previous" ? "previous" : "draft") : "published";
  const fallback = createFallbackExhibition(source.defaultManifestUrl);

  if (route.venueTestVersionId) {
    if (!authenticated || !source.supabase) {
      const error = new Error("Venue Test requires an authenticated Venue Admin or Platform Admin session");
      error.code = "VENUE_TEST_AUTH_REQUIRED";
      throw error;
    }
    const testVersion = await fetchVenueTestVersion(source.supabase, route.venueTestVersionId);
    if (!testVersion.ok) throw testVersion.error;
    if (!testVersion.row) {
      const error = new Error(`Venue Version not found or not accessible: ${route.venueTestVersionId}`);
      error.code = "VENUE_TEST_VERSION_NOT_FOUND";
      throw error;
    }
    const row = testVersion.row;
    const joinedVenue = isObject(row.venues) ? row.venues : {};
    const manifestData = resolveManifestFromRow(row, route, source.supabase);
    if (!manifestData.manifest && !manifestData.manifestUrl) throw new Error("Venue Test requires an inline manifest or manifest URL");
    const exhibition = normalizeExhibitionRecord({
      id: row.id,
      slug: `venue-test-${stringValue(joinedVenue.slug || row.venue_id)}`,
      title: `${stringValue(joinedVenue.name || joinedVenue.slug || "Venue")} — Test`,
      subtitle: `Venue Version ${stringValue(row.version_number)}`,
      short_description: "Read-only technical Venue test. Exhibition content is not loaded.",
      status: "draft",
      venue_id: row.venue_id,
      venue_slug: joinedVenue.slug,
      venue_name: joinedVenue.name
    }, { source: "venue-test" });
    const resolvedExhibition = buildResolvedExhibition(exhibition, {
      authenticated: false,
      databaseVenueId: row.venue_id,
      databaseVenueVersionId: row.id,
      venueSlug: joinedVenue.slug,
      venueName: joinedVenue.name,
      venueVersionNumber: row.version_number,
      manifestUrl: manifestData.manifestUrl,
      manifest: manifestData.manifest
    });
    return {
      schema: EXHIBITION_RUNTIME_SCHEMA,
      selectionRequired: false,
      route,
      authenticated: true,
      venueTest: true,
      channel: "published",
      exhibition: resolvedExhibition,
      publicSnapshot: { state: null, revision: 0, lockVersion: 0, updatedAt: null },
      stateBinding: { revision: 0, lockVersion: 0, databaseVenueId: row.venue_id, databaseVenueVersionId: row.id },
      source: "venue-test"
    };
  }

  if (!route.exhibitionId && !route.exhibitionSlug) {
    const catalog = await listPublishedExhibitions({ supabase: source.supabase, defaultManifestUrl: source.defaultManifestUrl });
    return { schema: EXHIBITION_RUNTIME_SCHEMA, selectionRequired: true, route, channel: requestedChannel, catalog, authenticated };
  }

  if (!route.forceLegacy && source.supabase) {
    if (!authenticated) {
      const publicResult = await fetchPublicRuntime(source.supabase, route);
      if (publicResult.ok && publicResult.row) {
        const row = publicResult.row;
        const exhibition = normalizeExhibitionRecord(row, { source: "supabase-public-rpc" });
        const manifestData = resolveManifestFromRow(row, route, source.supabase);
        const resolvedExhibition = buildResolvedExhibition(exhibition, {
          authenticated: false,
          databaseVenueId: row.database_venue_id || row.venue_id,
          databaseVenueVersionId: row.database_venue_version_id || row.venue_version_id,
          venueSlug: row.venue_slug,
          venueName: row.venue_name,
          venueVersionNumber: row.venue_version_number,
          manifestUrl: manifestData.manifestUrl,
          manifest: manifestData.manifest
        });
        const publicSnapshot = {
          state: row.published_state || row.state || null,
          revision: numberValue(row.published_revision || row.revision, 0),
          lockVersion: numberValue(row.lock_version, 0),
          updatedAt: row.published_at || row.updated_at || null
        };
        return {
          schema: EXHIBITION_RUNTIME_SCHEMA,
          selectionRequired: false,
          route,
          authenticated: false,
          channel: "published",
          exhibition: resolvedExhibition,
          stateBinding: {
            revision: publicSnapshot.revision,
            lockVersion: publicSnapshot.lockVersion,
            databaseVenueId: resolvedExhibition.databaseVenueId,
            databaseVenueVersionId: resolvedExhibition.databaseVenueVersionId
          },
          publicSnapshot,
          source: "supabase-public-rpc"
        };
      }
      if (publicResult.error && !isMissingRelationError(publicResult.error)) throw publicResult.error;
    } else {
      const fetched = await fetchAuthenticatedExhibitionRow(source.supabase, route);
      if (fetched.ok && fetched.row) {
        const exhibition = normalizeExhibitionRecord(fetched.row, { source: "supabase-authenticated" });
        const stateBinding = await fetchStateBinding(source.supabase, exhibition.id, requestedChannel);
        if (!stateBinding.ok) {
          if (!isMissingRelationError(stateBinding.error)) throw stateBinding.error;
        } else {
          const databaseVenueId = stateBinding.databaseVenueId || exhibition.databaseVenueId;
          const databaseVenueVersionId = stateBinding.databaseVenueVersionId;
          if (!databaseVenueId || !databaseVenueVersionId) throw new Error("Exhibition state does not bind an exact Venue version");
          const venueVersion = await fetchVenueVersion(source.supabase, databaseVenueId, databaseVenueVersionId);
          if (!venueVersion.ok) throw venueVersion.error;
          if (!venueVersion.row) throw new Error(`Venue version not found: ${databaseVenueId}/${databaseVenueVersionId}`);
          const manifestData = resolveManifestFromRow(venueVersion.row, route, source.supabase);
          const joinedVenue = isObject(venueVersion.row.venues) ? venueVersion.row.venues : {};
          const resolvedExhibition = buildResolvedExhibition(exhibition, {
            authenticated: true,
            databaseVenueId,
            databaseVenueVersionId: stringValue(venueVersion.row.id || databaseVenueVersionId),
            venueSlug: joinedVenue.slug || exhibition.venueId,
            venueName: joinedVenue.name || exhibition.venueName,
            venueVersionNumber: venueVersion.row.version_number,
            manifestUrl: manifestData.manifestUrl,
            manifest: manifestData.manifest
          });
          return {
            schema: EXHIBITION_RUNTIME_SCHEMA,
            selectionRequired: false,
            route,
            authenticated: true,
            channel: requestedChannel,
            exhibition: resolvedExhibition,
            stateBinding,
            source: "supabase-authenticated"
          };
        }
      }
      if (fetched.error && !isMissingRelationError(fetched.error)) throw fetched.error;
    }
  }

  const selector = route.exhibitionId || route.exhibitionSlug;
  if (selector !== fallback.id && selector !== fallback.slug && selector !== "main") {
    const error = new Error(`Exhibition not found or not public: ${selector}`);
    error.code = "EXHIBITION_NOT_FOUND";
    throw error;
  }
  const resolvedFallback = Object.freeze(Object.assign({}, fallback, {
    authenticated,
    manifestUrl: route.manifestUrl || fallback.manifestUrl,
    venueVersionId: route.venueVersionId || fallback.venueVersionId,
    venueId: route.venueId || fallback.venueId
  }));
  return {
    schema: EXHIBITION_RUNTIME_SCHEMA,
    selectionRequired: false,
    route,
    authenticated,
    channel: requestedChannel,
    exhibition: resolvedFallback,
    stateBinding: { revision: 0, lockVersion: 0, databaseVenueId: null, databaseVenueVersionId: null },
    source: "controlled-local-seed",
    migrationRequired: true,
    databaseError: null
  };
}

export function buildExhibitionUrl(exhibition, options) {
  const source = isObject(options) ? options : {};
  const locationObject = source.location || (typeof window !== "undefined" ? window.location : { href: "http://localhost/" });
  const url = new URL(locationObject.href || "http://localhost/");
  url.searchParams.set("exhibition", stringValue(exhibition && exhibition.slug));
  url.searchParams.delete("exhibitionId");
  if (source.channel && source.channel !== "published") url.searchParams.set("channel", source.channel);
  else url.searchParams.delete("channel");
  return url.href;
}

export function createControlledRestartController(options) {
  const source = isObject(options) ? options : {};
  return Object.freeze({
    schema: "berryboy-runtime-restart-controller.v1",
    switchExhibition: function (exhibition, switchOptions) {
      const config = isObject(switchOptions) ? switchOptions : {};
      if (typeof window === "undefined") return false;
      if (window.GalleryApp && typeof window.GalleryApp.confirmDiscardUnsavedChanges === "function") {
        if (!window.GalleryApp.confirmDiscardUnsavedChanges("Switching exhibition")) return false;
      }
      try {
        if (source.engine && source.engine.stopRenderLoop) source.engine.stopRenderLoop();
        if (source.scene && source.scene.dispose) source.scene.dispose();
        if (source.engine && source.engine.dispose) source.engine.dispose();
      } catch (error) {
        console.warn("Controlled exhibition teardown warning:", error);
      }
      window.location.assign(buildExhibitionUrl(exhibition, { location: window.location, channel: config.channel }));
      return true;
    }
  });
}

export const __testing = Object.freeze({
  DEFAULT_EXHIBITION_ID,
  DEFAULT_EXHIBITION_SLUG,
  createFallbackExhibition,
  isMissingRelationError,
  isConflictError,
  selectStateChannel,
  buildResolvedExhibition
});
