/*
  Exhibition Platform — C6C8C21 Multi-Space Foundation
  Canonical Exhibition/Venue data adapter. Runtime code talks to this adapter instead of
  reading/writing legacy gallery_exhibitions / gallery_state directly.
*/

import { buildSpaceDefinition } from "../runtime/space-definition-resolver.js";

export const EXHIBITION_STATE_SCHEMA = "exhibition-platform-exhibition-state.v1";

function text(value) { return String(value == null ? "" : value).trim(); }
function isUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value)); }
function asRows(response) {
  if (response && response.error) throw response.error;
  if (!response) return [];
  return Array.isArray(response.data) ? response.data : (response.data ? [response.data] : []);
}
function rpcOne(response) { return asRows(response)[0] || null; }
function unwrapState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.content && typeof value.content === "object" && !Array.isArray(value.content)) return value.content;
  return value;
}
function storagePrefixFor(exhibition) {
  const slug = text(exhibition && exhibition.slug);
  const id = text(exhibition && exhibition.id);
  return slug === "main" ? "main" : `exhibitions/${id}`;
}
function canonicalToRuntimeExhibition(record, options = {}) {
  if (!record || !record.id) return null;
  const status = text(record.status || "draft");
  const spaceId = text(options.spaceId || record.venue_slug || record.space_id);
  return {
    id: text(record.id),
    name: text(record.title || record.name || record.slug || record.id),
    slug: text(record.slug || record.id),
    description: text(record.short_description || record.description),
    cover_path: options.coverPath || record.cover_path || null,
    is_published: status === "published" || status === "scheduled",
    status,
    sort_order: Number(record.display_order != null ? record.display_order : record.sort_order) || 0,
    storage_prefix: options.storagePrefix || storagePrefixFor(record),
    space_id: spaceId,
    venue_id: text(record.database_venue_id || record.venue_id || options.venueId),
    venue_version_id: text(record.database_venue_version_id || options.venueVersionId),
    venue_version_number: text(record.venue_version_number || options.venueVersionNumber),
    created_at: record.created_at || null,
    updated_at: record.updated_at || null
  };
}

async function fetchCoverPath(supabase, coverMediaId) {
  if (!coverMediaId) return null;
  const response = await supabase.from("media_library")
    .select("id, storage_bucket, original_path, desktop_avif_path, preview_avif_path, archived_at, deleted_at")
    .eq("id", coverMediaId).limit(1);
  const row = rpcOne(response);
  if (!row || row.deleted_at || row.archived_at) return null;
  return row.original_path || row.desktop_avif_path || row.preview_avif_path || null;
}

async function adminListRaw(supabase) {
  const response = await supabase.rpc("admin_list_exhibitions", { p_venue_id: null, p_status: null, p_search: null });
  return asRows(response);
}

async function findAdminId(supabase, reference) {
  const ref = text(reference || "main") || "main";
  if (isUuid(ref)) return ref;
  const rows = await adminListRaw(supabase);
  const match = rows.find((row) => text(row.slug) === ref) || rows.find((row) => text(row.id) === ref);
  if (match) return text(match.id);
  if (ref === "main" && rows.length) {
    const main = rows.find((row) => text(row.slug) === "main") || rows[0];
    return text(main.id);
  }
  return "";
}

async function loadAdminRuntime(supabase, reference) {
  const id = await findAdminId(supabase, reference);
  if (!id) throw new Error(`Exhibition not found: ${text(reference)}`);
  const detail = rpcOne(await supabase.rpc("admin_get_exhibition", { p_exhibition_id: id }));
  if (!detail || !detail.exhibition) throw new Error(`Exhibition not found: ${text(reference)}`);
  const e = detail.exhibition;
  const s = detail.state || {};
  const venueDetail = rpcOne(await supabase.rpc("admin_get_venue", { p_venue_id: e.venue_id }));
  if (!venueDetail || !venueDetail.venue) throw new Error("Venue could not be resolved for Exhibition.");
  const targetVersionId = s.draft_venue_version_id || venueDetail.venue.draft_version_id || venueDetail.venue.published_version_id;
  const versions = Array.isArray(venueDetail.versions) ? venueDetail.versions : [];
  const version = versions.find((item) => text(item.id) === text(targetVersionId)) || null;
  if (!version) throw new Error("Draft Venue Version could not be resolved for Exhibition.");
  const coverPath = await fetchCoverPath(supabase, e.cover_media_id).catch(() => null);
  const exhibition = canonicalToRuntimeExhibition(e, {
    coverPath,
    spaceId: venueDetail.venue.slug,
    venueId: venueDetail.venue.id,
    venueVersionId: version.id,
    venueVersionNumber: version.version_number
  });
  return {
    mode: "admin",
    exhibition,
    state: unwrapState(s.draft_state || s.published_state),
    revision: Number(s.draft_revision) || 0,
    lockVersion: Number(s.lock_version) || 0,
    updatedAt: s.draft_updated_at || s.updated_at || null,
    rowExists: !!detail.state,
    venue: venueDetail.venue,
    venueVersion: version,
    manifest: version.manifest || null,
    spaceDefinition: buildSpaceDefinition({ supabase, venue: venueDetail.venue, venueVersion: version, manifest: version.manifest || null })
  };
}

async function resolvePublicRuntime(supabase, reference) {
  const ref = text(reference || "main") || "main";
  let response = null;
  if (isUuid(ref)) {
    response = await supabase.rpc("resolve_published_exhibition", { p_exhibition_id: ref, p_exhibition_slug: null });
  } else {
    response = await supabase.rpc("resolve_published_exhibition", { p_exhibition_id: null, p_exhibition_slug: ref });
  }
  let row = rpcOne(response);
  if (!row) {
    const list = asRows(await supabase.rpc("list_published_exhibitions"));
    const fallback = list[0] || null;
    if (!fallback) throw new Error("No published Exhibition is available.");
    row = rpcOne(await supabase.rpc("resolve_published_exhibition", { p_exhibition_id: fallback.id, p_exhibition_slug: null }));
  }
  if (!row) throw new Error("Published Exhibition could not be resolved.");
  const venue = { id: row.database_venue_id, slug: row.venue_slug, name: row.venue_name };
  const venueVersion = { id: row.database_venue_version_id, version_number: row.venue_version_number, manifest: row.manifest };
  const exhibition = canonicalToRuntimeExhibition(row, {
    spaceId: row.venue_slug,
    venueId: row.database_venue_id,
    venueVersionId: row.database_venue_version_id,
    venueVersionNumber: row.venue_version_number
  });
  return {
    mode: "public",
    exhibition,
    state: unwrapState(row.published_state),
    revision: Number(row.published_revision) || 0,
    lockVersion: Number(row.lock_version) || 0,
    updatedAt: row.published_at || null,
    rowExists: !!row.published_state,
    venue,
    venueVersion,
    manifest: row.manifest || null,
    spaceDefinition: buildSpaceDefinition({ supabase, venue, venueVersion, manifest: row.manifest || null })
  };
}

async function saveCanonicalState(supabase, runtime, state) {
  const response = await supabase.rpc("save_exhibition_runtime_state", {
    p_exhibition_id: runtime.exhibition.id,
    p_expected_draft_revision: Number(runtime.revision) || 0,
    p_expected_lock_version: Number(runtime.lockVersion) || 0,
    p_state: state
  });
  const result = rpcOne(response);
  if (!result) throw new Error("Canonical Exhibition save returned no result.");
  runtime.revision = Number(result.draft_revision != null ? result.draft_revision : result.draftRevision) || 0;
  runtime.lockVersion = Number(result.lock_version != null ? result.lock_version : result.lockVersion) || 0;
  runtime.updatedAt = result.updated_at || result.updatedAt || new Date().toISOString();
  runtime.state = state;
  runtime.rowExists = true;
  return {
    state,
    revision: runtime.revision,
    lockVersion: runtime.lockVersion,
    updatedAt: runtime.updatedAt,
    rowExists: true,
    published: result.published === true
  };
}

export async function resolveInitialPublicRuntime(supabase, reference) {
  return resolvePublicRuntime(supabase, reference);
}

export async function resolveInitialAdminRuntime(supabase, reference) {
  return loadAdminRuntime(supabase, reference);
}

export function createExhibitionDataAdapter({ supabase, mode = "public", initialRuntime = null }) {
  if (!supabase) throw new Error("Supabase client is required for canonical Exhibition data.");
  const runtimeById = new Map();
  let modeName = mode === "admin" ? "admin" : "public";
  if (initialRuntime && initialRuntime.exhibition) runtimeById.set(initialRuntime.exhibition.id, initialRuntime);

  async function resolve(reference, force = false) {
    const ref = text(reference || "main") || "main";
    if (!force) {
      for (const cached of runtimeById.values()) {
        if (cached && cached.exhibition && (cached.exhibition.id === ref || cached.exhibition.slug === ref)) return cached;
      }
    }
    const runtime = modeName === "admin" ? await loadAdminRuntime(supabase, ref) : await resolvePublicRuntime(supabase, ref);
    runtimeById.set(runtime.exhibition.id, runtime);
    return runtime;
  }

  return Object.freeze({
    schema: "exhibition-platform-canonical-data-adapter.v1",
    get mode() { return modeName; },
    setMode(nextMode) { modeName = nextMode === "admin" ? "admin" : "public"; return modeName; },
    async list() {
      if (modeName === "public") {
        const rows = asRows(await supabase.rpc("list_published_exhibitions"));
        return rows.map((row) => canonicalToRuntimeExhibition(row, { spaceId: row.venue_slug, venueId: row.database_venue_id }));
      }
      const rows = await adminListRaw(supabase);
      const results = [];
      for (const row of rows) {
        let coverPath = null;
        let spaceId = "";
        try {
          const detail = await loadAdminRuntime(supabase, row.id);
          runtimeById.set(detail.exhibition.id, detail);
          coverPath = detail.exhibition.cover_path;
          spaceId = detail.exhibition.space_id;
        } catch (_error) {}
        results.push(canonicalToRuntimeExhibition(row, { coverPath, spaceId, venueId: row.venue_id }));
      }
      return results.filter(Boolean);
    },
    async resolve(reference, options = {}) {
      const runtime = await resolve(reference, options.force === true);
      return { ...runtime.exhibition };
    },
    async loadState(reference, options = {}) {
      const runtime = await resolve(reference, options.force === true);
      return {
        id: runtime.exhibition.id,
        state: runtime.state,
        updated_at: runtime.updatedAt,
        revision: runtime.revision,
        lock_version: runtime.lockVersion,
        rowExists: runtime.rowExists !== false,
        exhibition: { ...runtime.exhibition }
      };
    },
    async saveState(reference, state) {
      if (modeName !== "admin") throw new Error("Public Viewer cannot save Exhibition state.");
      const runtime = await resolve(reference, false);
      return saveCanonicalState(supabase, runtime, state);
    },
    async create(name) {
      if (modeName !== "admin") throw new Error("Public Viewer cannot create Exhibitions.");
      const current = initialRuntime || Array.from(runtimeById.values())[0] || await loadAdminRuntime(supabase, "main");
      const id = globalThis.crypto && typeof globalThis.crypto.randomUUID === "function" ? globalThis.crypto.randomUUID() : null;
      const suffix = id ? id.slice(-6) : Date.now().toString(36).slice(-6);
      const base = text(name).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 56) || "exhibition";
      const slug = `${base}-${suffix}`;
      const created = rpcOne(await supabase.rpc("admin_create_exhibition", {
        p_venue_id: current.venue.id,
        p_venue_version_id: current.venueVersion.id,
        p_slug: slug,
        p_title: text(name),
        p_patch: { display_order: 0 }
      }));
      if (!created || !created.id) throw new Error("Exhibition creation returned no record.");
      const runtime = await loadAdminRuntime(supabase, created.id);
      runtimeById.set(runtime.exhibition.id, runtime);
      return { ...runtime.exhibition };
    },
    async updateMetadata(reference, patch = {}) {
      if (modeName !== "admin") throw new Error("Public Viewer cannot update Exhibition metadata.");
      const runtime = await resolve(reference, false);
      const detailsPatch = {};
      if (patch.name !== undefined) detailsPatch.title = text(patch.name);
      if (patch.description !== undefined) detailsPatch.short_description = text(patch.description);
      if (patch.sort_order !== undefined) detailsPatch.display_order = Number(patch.sort_order) || 0;
      if (Object.keys(detailsPatch).length) {
        const response = await supabase.rpc("admin_update_exhibition", { p_exhibition_id: runtime.exhibition.id, p_patch: detailsPatch });
        rpcOne(response);
      }
      if (patch.cover_path !== undefined) {
        const response = await supabase.rpc("admin_set_exhibition_runtime_cover", {
          p_exhibition_id: runtime.exhibition.id,
          p_storage_path: patch.cover_path ? text(patch.cover_path) : null,
          p_mime_type: patch.cover_mime_type ? text(patch.cover_mime_type) : null,
          p_file_size: patch.cover_file_size != null ? Number(patch.cover_file_size) : null
        });
        rpcOne(response);
      }
      if (patch.is_published !== undefined) {
        const response = await supabase.rpc("admin_set_exhibition_runtime_visibility", {
          p_exhibition_id: runtime.exhibition.id,
          p_published: !!patch.is_published
        });
        rpcOne(response);
      }
      const refreshed = await loadAdminRuntime(supabase, runtime.exhibition.id);
      runtimeById.set(refreshed.exhibition.id, refreshed);
      return { ...refreshed.exhibition };
    },
    getRuntime(reference) {
      const ref = text(reference);
      for (const runtime of runtimeById.values()) {
        if (runtime && runtime.exhibition && (runtime.exhibition.id === ref || runtime.exhibition.slug === ref)) return runtime;
      }
      return null;
    }
  });
}
