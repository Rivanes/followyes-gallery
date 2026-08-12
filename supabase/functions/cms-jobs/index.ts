import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processCanonicalMediaCleanup } from "../_shared/media-cleanup.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret"
};

const MEDIA_PATH_COLUMNS = ["original_path", "desktop_avif_path", "mobile_avif_path", "preview_avif_path"] as const;

type MediaRow = Record<string, any> & { id: string; storage_bucket: string };

type CanonicalCloneResult = {
  mediaId: string;
  pathMap: Map<string, string>;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  let jobId = "";
  try {
    const url = requiredEnv("SUPABASE_URL");
    const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const body = await request.json().catch(() => ({}));
    jobId = String(body.jobId || "");
    if (!jobId) return response({ error: "jobId is required" }, 400);

    await assertCallerMayRunJob(request, url);

    const { data: job, error: jobError } = await admin.from("cms_jobs").select("*").eq("id", jobId).single();
    if (jobError) throw jobError;
    if (!["queued", "failed"].includes(job.status)) return response({ ok: true, status: job.status });

    const { data: claimed, error: claimError } = await admin
      .from("cms_jobs")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
        finished_at: null,
        attempts: Number(job.attempts || 0) + 1,
        error_message: null
      })
      .eq("id", jobId)
      .in("status", ["queued", "failed"])
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return response({ ok: true, status: "already-claimed" });

    let result: unknown;
    if (job.job_type === "duplicate_media") result = await duplicateMedia(admin, job.payload || {});
    else if (job.job_type === "permanent_delete") result = await permanentDelete(admin, job.entity_type, job.entity_id, job.payload || {});
    else throw new Error(`Unsupported job type: ${job.job_type}`);

    const cleanup = await processCanonicalMediaCleanup(admin, 50);
    const finalResult = { ...(isPlainObject(result) ? result : { value: result }), cleanup };
    const completed = await admin.from("cms_jobs").update({
      status: "completed",
      result: finalResult,
      error_message: null,
      finished_at: new Date().toISOString()
    }).eq("id", jobId);
    if (completed.error) throw completed.error;
    return response({ ok: true, result: finalResult });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    if (jobId) {
      try {
        const client = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
          auth: { autoRefreshToken: false, persistSession: false }
        });
        await client.from("cms_jobs").update({
          status: "failed",
          error_message: message,
          finished_at: new Date().toISOString()
        }).eq("id", jobId);
      } catch (_) {}
    }
    return response({ error: message }, 500);
  }
});

async function assertCallerMayRunJob(request: Request, url: string) {
  const cronSecret = Deno.env.get("CMS_CRON_SECRET") || "";
  const isScheduler = !!cronSecret && request.headers.get("x-cron-secret") === cronSecret;
  if (isScheduler) return;
  const caller = createClient(url, requiredEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: request.headers.get("Authorization") || "" } },
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: allowed, error } = await caller.rpc("is_platform_admin");
  if (error || allowed !== true) throw new HttpError("Platform Admin permission required", 403);
}

async function duplicateMedia(admin: any, payload: any) {
  const sourceId = String(payload.sourceExhibitionId || "");
  const targetId = String(payload.targetExhibitionId || "");
  if (!sourceId || !targetId) throw new Error("duplicate_media requires sourceExhibitionId and targetExhibitionId");

  const { data: target, error: targetError } = await admin.from("exhibitions").select("id,status,archived_at").eq("id", targetId).single();
  if (targetError) throw targetError;
  if (target.archived_at) throw new Error("Cannot copy media into an archived exhibition");

  const { data: usages, error: usageError } = await admin
    .from("media_usages")
    .select("*, media_library(*)")
    .eq("owner_type", "exhibition")
    .eq("owner_id", sourceId);
  if (usageError) throw usageError;

  const mediaMap = new Map<string, string>();
  const pathMap = new Map<string, string>();
  const copiedMedia: string[] = [];
  for (const usage of usages || []) {
    const media = usage.media_library as MediaRow | null;
    if (!media || media.deleted_at || media.archived_at || media.processing_status !== "ready") continue;
    let newMediaId = mediaMap.get(media.id);
    if (!newMediaId) {
      const clone = await cloneCanonicalMedium(admin, media, targetId, usage);
      newMediaId = clone.mediaId;
      mediaMap.set(media.id, newMediaId);
      copiedMedia.push(newMediaId);
      for (const [oldPath, newPath] of clone.pathMap) pathMap.set(oldPath, newPath);
    }
    const { error } = await admin.from("media_usages").upsert({
      media_id: newMediaId,
      owner_type: "exhibition",
      owner_id: targetId,
      entity_type: usage.entity_type,
      entity_id: usage.entity_id,
      usage_role: usage.usage_role,
      lifecycle_scope: usage.lifecycle_scope || "state"
    }, { onConflict: "media_id,owner_type,owner_id,entity_type,entity_id,usage_role", ignoreDuplicates: true });
    if (error) throw error;
  }

  const { data: stateRow, error: stateError } = await admin
    .from("exhibition_states")
    .select("draft_state,draft_revision,lock_version")
    .eq("exhibition_id", targetId)
    .single();
  if (stateError) throw stateError;
  const rewrittenState = rewriteJson(stateRow.draft_state, mediaMap, pathMap);
  const { error: stateUpdateError } = await admin.from("exhibition_states").update({
    draft_state: rewrittenState,
    draft_revision: Number(stateRow.draft_revision || 0) + 1,
    lock_version: Number(stateRow.lock_version || 0) + 1,
    draft_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).eq("exhibition_id", targetId);
  if (stateUpdateError) throw stateUpdateError;

  const { data: cardRow, error: cardError } = await admin
    .from("exhibition_cards")
    .select("draft_value,draft_revision")
    .eq("exhibition_id", targetId)
    .maybeSingle();
  if (cardError) throw cardError;
  if (cardRow) {
    const rewrittenCard = rewriteJson(cardRow.draft_value, mediaMap, pathMap);
    const { error } = await admin.from("exhibition_cards").update({
      draft_value: rewrittenCard,
      draft_revision: Number(cardRow.draft_revision || 0) + 1,
      draft_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq("exhibition_id", targetId);
    if (error) throw error;

    const { error: exhibitionError } = await admin.from("exhibitions").update({
      cover_media_id: safeUuid(rewrittenCard?.coverMediaId),
      mobile_cover_media_id: safeUuid(rewrittenCard?.mobileCoverMediaId),
      logo_media_id: safeUuid(rewrittenCard?.logoMediaId),
      updated_at: new Date().toISOString()
    }).eq("id", targetId);
    if (exhibitionError) throw exhibitionError;
  }

  await admin.rpc("cms_sync_exhibition_state_document_media_usages", { p_exhibition_id: targetId });
  await admin.rpc("cms_sync_exhibition_card_media_usages", { p_exhibition_id: targetId });
  return {
    sourceExhibitionId: sourceId,
    targetExhibitionId: targetId,
    copiedMedia: copiedMedia.length,
    rewrittenPaths: pathMap.size,
    mediaIds: copiedMedia
  };
}

async function cloneCanonicalMedium(admin: any, media: MediaRow, targetExhibitionId: string, usage: any): Promise<CanonicalCloneResult> {
  const mediaId = crypto.randomUUID();
  const operationId = crypto.randomUUID();
  const operationToken = crypto.randomUUID();
  const generation = 1;
  const variantSetId = media.variant_set_id ? crypto.randomUUID() : null;
  const category = mediaCategory(media.media_type, usage.entity_type, usage.usage_role);
  const entityId = sanitizeSegment(String(usage.entity_id || mediaId));
  const root = `exhibitions/${targetExhibitionId}/${category}/${entityId}/${mediaId}`;
  const createdPaths: string[] = [];
  const pathMap = new Map<string, string>();

  const mediaInsert = {
    id: mediaId,
    owner_type: "exhibition",
    owner_id: targetExhibitionId,
    media_type: media.media_type,
    media_kind: media.media_kind,
    variant_set_id: variantSetId,
    generation,
    operation_token: operationToken,
    storage_bucket: media.storage_bucket || "platform-media",
    metadata: { ...(media.metadata || {}), duplicatedFrom: media.id, canonicalLifecycle: true },
    processing_status: "uploading",
    mime_type: media.mime_type,
    file_size: media.file_size,
    file_hash: media.file_hash
  };
  const { error: mediaInsertError } = await admin.from("media_library").insert(mediaInsert);
  if (mediaInsertError) throw mediaInsertError;
  const { error: operationInsertError } = await admin.from("media_operations").insert({
    id: operationId,
    media_id: mediaId,
    owner_type: "exhibition",
    owner_id: targetExhibitionId,
    exhibition_id: targetExhibitionId,
    entity_type: usage.entity_type || "duplicated-media",
    entity_id: `${String(usage.entity_id || mediaId)}:${media.id}`,
    usage_role: usage.usage_role || "state-reference",
    media_type: media.media_type,
    variant_set_id: variantSetId,
    generation,
    operation_token: operationToken,
    storage_bucket: media.storage_bucket || "platform-media",
    status: "uploading",
    metadata: { sourceMediaId: media.id, jobType: "duplicate_media" }
  });
  if (operationInsertError) throw operationInsertError;

  try {
    const copied: Record<string, string | null> = {};
    for (const key of MEDIA_PATH_COLUMNS) {
      const oldPath = media[key];
      if (!oldPath) { copied[key] = null; continue; }
      const fileName = sanitizeFileName(String(oldPath).split("/").pop() || `${key}.bin`);
      const variantFolder = key === "original_path" ? "original" : key.replace("_avif_path", "").replace("_path", "");
      const newPath = `${root}/${variantFolder}/${fileName}`;
      const { error } = await admin.storage.from(media.storage_bucket || "platform-media").copy(oldPath, newPath);
      if (error) throw error;
      copied[key] = newPath;
      createdPaths.push(newPath);
      pathMap.set(oldPath, newPath);
    }
    const now = new Date().toISOString();
    const { error: commitError } = await admin.from("media_library").update({
      ...copied,
      variant_set_id: variantSetId,
      processing_status: "ready",
      processing_error: null,
      updated_at: now
    }).eq("id", mediaId).eq("operation_token", operationToken).eq("generation", generation);
    if (commitError) throw commitError;
    const { error: operationError } = await admin.from("media_operations").update({
      created_paths: createdPaths,
      status: "finalized",
      committed_at: now,
      finalized_at: now,
      updated_at: now
    }).eq("id", operationId).eq("operation_token", operationToken);
    if (operationError) throw operationError;
    return { mediaId, pathMap };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.from("media_operations").update({
      created_paths: createdPaths,
      status: "failed",
      error_message: message,
      updated_at: new Date().toISOString()
    }).eq("id", operationId);
    await admin.from("media_library").update({ processing_status: "failed", processing_error: message }).eq("id", mediaId);
    if (createdPaths.length) {
      await admin.from("media_cleanup_queue").insert({
        media_id: mediaId,
        operation_id: operationId,
        storage_bucket: media.storage_bucket || "platform-media",
        storage_paths: [...new Set(createdPaths)],
        reason: "failed-independent-copy",
        status: "pending"
      });
    }
    throw error;
  }
}

function rewriteJson(value: any, mediaMap: Map<string, string>, pathMap: Map<string, string>): any {
  if (Array.isArray(value)) return value.map((item) => rewriteJson(item, mediaMap, pathMap));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteJson(item, mediaMap, pathMap)]));
  }
  if (typeof value === "string") return mediaMap.get(value) || pathMap.get(value) || value;
  return value;
}

async function permanentDelete(admin: any, entityType: string, entityId: string, payload: any) {
  if (!entityId) throw new Error("permanent_delete requires entityId");
  if (entityType === "media") return deleteMediaJob(admin, entityId);
  if (entityType === "exhibition") return deleteExhibition(admin, entityId);
  if (entityType === "venue") return deleteVenue(admin, entityId);
  if (entityType === "author") return deleteAuthor(admin, entityId, payload);
  throw new Error(`Unsupported permanent delete entity: ${entityType}`);
}

async function deleteMediaJob(admin: any, mediaId: string) {
  const { data: media, error } = await admin.from("media_library").select("*").eq("id", mediaId).maybeSingle();
  if (error) throw error;
  if (!media) return { deleted: "media", id: mediaId, alreadyRemoved: true };
  const referenced = await isMediaReferenced(admin, mediaId);
  if (referenced) throw new Error(`Media ${mediaId} became referenced after delete was requested`);
  await queueMediaForCleanup(admin, media, "permanent-delete-job");
  return { deleted: "media", id: mediaId, queuedPaths: mediaPaths(media).length };
}

async function deleteExhibition(admin: any, exhibitionId: string) {
  const { data: exhibition, error } = await admin.from("exhibitions").select("*").eq("id", exhibitionId).single();
  if (error) throw error;
  if (exhibition.status !== "archived" || !exhibition.archived_at) throw new Error("Archive the exhibition before permanent delete");

  const [{ data: state }, { data: card }, { data: authors }, { data: usages }, { data: ownedMedia, error: mediaError }] = await Promise.all([
    admin.from("exhibition_states").select("*").eq("exhibition_id", exhibitionId).maybeSingle(),
    admin.from("exhibition_cards").select("*").eq("exhibition_id", exhibitionId).maybeSingle(),
    admin.from("exhibition_authors").select("*").eq("exhibition_id", exhibitionId),
    admin.from("media_usages").select("*").eq("owner_type", "exhibition").eq("owner_id", exhibitionId),
    admin.from("media_library").select("*").eq("owner_type", "exhibition").eq("owner_id", exhibitionId)
  ]);
  if (mediaError) throw mediaError;
  const backup = { exhibition, state, card, authors: authors || [], mediaUsages: usages || [], ownedMedia: ownedMedia || [] };

  const usageDelete = await admin.from("media_usages").delete().eq("owner_type", "exhibition").eq("owner_id", exhibitionId);
  if (usageDelete.error) throw usageDelete.error;
  const deleteResult = await admin.from("exhibitions").delete().eq("id", exhibitionId);
  if (deleteResult.error) throw deleteResult.error;

  let reassignedShared = 0;
  let cleanupQueued = 0;
  for (const media of ownedMedia || []) {
    if (await isMediaReferenced(admin, media.id)) {
      const { error: reassignError } = await admin.from("media_library").update({
        owner_type: "platform",
        owner_id: null,
        metadata: { ...(media.metadata || {}), detachedFromExhibition: exhibitionId },
        updated_at: new Date().toISOString()
      }).eq("id", media.id);
      if (reassignError) throw reassignError;
      reassignedShared += 1;
    } else {
      await queueMediaForCleanup(admin, media, "delete-exhibition-owned-media");
      cleanupQueued += 1;
    }
  }
  return { deleted: "exhibition", id: exhibitionId, backup, reassignedShared, cleanupQueued };
}

async function deleteVenue(admin: any, venueId: string) {
  const { data: venue, error } = await admin.from("venues").select("*").eq("id", venueId).single();
  if (error) throw error;
  if (venue.status !== "archived" || !venue.archived_at) throw new Error("Archive the Venue before permanent delete");
  const { count, error: countError } = await admin.from("exhibitions").select("id", { count: "exact", head: true }).eq("venue_id", venueId);
  if (countError) throw countError;
  if ((count || 0) > 0) throw new Error(`Venue is still referenced by ${count} exhibitions`);

  const { data: versions, error: versionsError } = await admin.from("venue_versions").select("*").eq("venue_id", venueId);
  if (versionsError) throw versionsError;
  const versionIds = (versions || []).map((item: any) => item.id);
  let assets: any[] = [];
  if (versionIds.length) {
    const result = await admin.from("venue_assets").select("*").in("venue_version_id", versionIds);
    if (result.error) throw result.error;
    assets = result.data || [];
  }
  const mediaIds = [...new Set(assets.map((item) => item.media_id).filter(Boolean))];
  let mediaRows: any[] = [];
  if (mediaIds.length) {
    const result = await admin.from("media_library").select("*").in("id", mediaIds);
    if (result.error) throw result.error;
    mediaRows = result.data || [];
  }
  const backup = { venue, versions: versions || [], assets };
  const deleteResult = await admin.from("venues").delete().eq("id", venueId);
  if (deleteResult.error) throw deleteResult.error;

  let cleanupQueued = 0;
  for (const media of mediaRows) {
    if (!(await isMediaReferenced(admin, media.id))) {
      await queueMediaForCleanup(admin, media, "delete-venue-owned-media");
      cleanupQueued += 1;
    }
  }
  const mediaBackedPaths = new Set(mediaRows.flatMap(mediaPaths));
  const legacyByBucket = new Map<string, string[]>();
  for (const asset of assets) {
    if (!asset.storage_bucket || !asset.storage_path || mediaBackedPaths.has(asset.storage_path)) continue;
    const list = legacyByBucket.get(asset.storage_bucket) || [];
    list.push(asset.storage_path);
    legacyByBucket.set(asset.storage_bucket, list);
  }
  for (const version of versions || []) {
    if (!version.manifest_bucket || !version.manifest_path || mediaBackedPaths.has(version.manifest_path)) continue;
    const list = legacyByBucket.get(version.manifest_bucket) || [];
    list.push(version.manifest_path);
    legacyByBucket.set(version.manifest_bucket, list);
  }
  for (const [bucket, paths] of legacyByBucket) await queuePaths(admin, bucket, paths, "delete-venue-legacy-assets");
  return { deleted: "venue", id: venueId, backup, cleanupQueued, legacyPathGroups: legacyByBucket.size };
}

async function deleteAuthor(admin: any, authorId: string, payload: any) {
  const { data: author, error } = await admin.from("authors").select("*").eq("id", authorId).single();
  if (error) throw error;
  if (!author.archived_at) throw new Error("Archive the author before permanent delete");
  const { count, error: referenceError } = await admin.from("exhibition_authors").select("exhibition_id", { count: "exact", head: true }).eq("author_id", authorId);
  if (referenceError) throw referenceError;
  if ((count || 0) > 0) throw new Error(`Author is still referenced by ${count} exhibitions`);
  const { data: authorUsages, error: usageReadError } = await admin.from("media_usages")
    .select("*")
    .eq("lifecycle_scope", "author")
    .eq("entity_type", "author")
    .eq("entity_id", authorId);
  if (usageReadError) throw usageReadError;
  const usageDelete = await admin.from("media_usages")
    .delete()
    .eq("lifecycle_scope", "author")
    .eq("entity_type", "author")
    .eq("entity_id", authorId);
  if (usageDelete.error) throw usageDelete.error;
  const deleteResult = await admin.from("authors").delete().eq("id", authorId);
  if (deleteResult.error) throw deleteResult.error;
  if (author.photo_media_id) {
    const { data: media } = await admin.from("media_library").select("*").eq("id", author.photo_media_id).maybeSingle();
    if (media && !(await isMediaReferenced(admin, media.id))) await queueMediaForCleanup(admin, media, "delete-author-photo");
  }
  return { deleted: "author", id: authorId, backup: { author, authorUsages: authorUsages || [], payload } };
}

async function queueMediaForCleanup(admin: any, media: any, reason: string) {
  const paths = mediaPaths(media);
  const now = new Date().toISOString();
  const { error: updateError } = await admin.from("media_library").update({
    processing_status: "deleting",
    deleted_at: media.deleted_at || now,
    updated_at: now
  }).eq("id", media.id);
  if (updateError) throw updateError;
  if (paths.length) await queuePaths(admin, media.storage_bucket || "platform-media", paths, reason, media.id);
}

async function queuePaths(admin: any, bucket: string, paths: string[], reason: string, mediaId: string | null = null) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return;
  const { error } = await admin.from("media_cleanup_queue").insert({
    media_id: mediaId,
    storage_bucket: bucket,
    storage_paths: unique,
    reason,
    status: "pending"
  });
  if (error) throw error;
}

async function isMediaReferenced(admin: any, mediaId: string) {
  const { data, error } = await admin.rpc("media_is_referenced", { p_media_id: mediaId });
  if (error) throw error;
  return data === true;
}

function mediaPaths(media: any) {
  return [...new Set(MEDIA_PATH_COLUMNS.map((key) => media?.[key]).filter(Boolean))];
}

function mediaCategory(mediaType: string, entityType: string, usageRole: string) {
  const value = `${mediaType || ""} ${entityType || ""} ${usageRole || ""}`.toLowerCase();
  if (value.includes("author")) return "authors";
  if (value.includes("sculpture") || value.includes("model")) return "sculptures";
  if (value.includes("cover") || value.includes("logo") || value.includes("brand")) return "branding";
  if (value.includes("document") || value.includes("pdf")) return "documents";
  return "artworks";
}

function sanitizeSegment(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96) || "item";
}

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-160) || "asset.bin";
}

function safeUuid(value: unknown) {
  const text = String(value || "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
