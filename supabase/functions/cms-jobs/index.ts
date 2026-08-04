import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret"
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

    const cronSecret = Deno.env.get("CMS_CRON_SECRET") || "";
    const isScheduler = !!cronSecret && request.headers.get("x-cron-secret") === cronSecret;
    if (!isScheduler) {
      const caller = createClient(url, requiredEnv("SUPABASE_ANON_KEY"), {
        global: { headers: { Authorization: request.headers.get("Authorization") || "" } },
        auth: { autoRefreshToken: false, persistSession: false }
      });
      const { data: allowed, error: permissionError } = await caller.rpc("is_platform_admin");
      if (permissionError || allowed !== true) return response({ error: "Platform Admin permission required" }, 403);
    }

    const { data: job, error: jobError } = await admin.from("cms_jobs").select("*").eq("id", jobId).single();
    if (jobError) throw jobError;
    if (!["queued", "failed"].includes(job.status)) return response({ ok: true, status: job.status });

    const running = await admin.from("cms_jobs").update({
      status: "running",
      started_at: new Date().toISOString(),
      finished_at: null,
      attempts: Number(job.attempts || 0) + 1,
      error_message: null
    }).eq("id", jobId).in("status", ["queued", "failed"]);
    if (running.error) throw running.error;

    let result: unknown;
    if (job.job_type === "duplicate_media") result = await duplicateMedia(admin, job.payload || {});
    else if (job.job_type === "permanent_delete") result = await permanentDelete(admin, job.entity_type, job.entity_id, job.payload || {});
    else throw new Error(`Unsupported job type: ${job.job_type}`);

    const completed = await admin.from("cms_jobs").update({
      status: "completed",
      result,
      error_message: null,
      finished_at: new Date().toISOString()
    }).eq("id", jobId);
    if (completed.error) throw completed.error;
    return response({ ok: true, result });
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

async function duplicateMedia(admin: any, payload: any) {
  const sourceId = String(payload.sourceExhibitionId || "");
  const targetId = String(payload.targetExhibitionId || "");
  if (!sourceId || !targetId) throw new Error("duplicate_media requires sourceExhibitionId and targetExhibitionId");

  const { data: usages, error: usageError } = await admin
    .from("media_usages")
    .select("*, media_library(*)")
    .eq("owner_type", "exhibition")
    .eq("owner_id", sourceId);
  if (usageError) throw usageError;

  const mediaMap = new Map<string, string>();
  const pathMap = new Map<string, string>();
  for (const usage of usages || []) {
    const media = usage.media_library;
    if (!media) continue;
    let newMediaId = mediaMap.get(media.id);
    if (!newMediaId) {
      newMediaId = crypto.randomUUID();
      mediaMap.set(media.id, newMediaId);
      const copied: Record<string, string | null> = {};
      for (const key of ["original_path", "desktop_avif_path", "mobile_avif_path", "preview_avif_path"]) {
        const oldPath = media[key];
        if (!oldPath) { copied[key] = null; continue; }
        const fileName = String(oldPath).split("/").pop() || "asset.bin";
        const newPath = `exhibitions/${targetId}/imported/${newMediaId}/${key}/${fileName}`;
        const { error } = await admin.storage.from(media.storage_bucket).copy(oldPath, newPath);
        if (error) throw error;
        copied[key] = newPath;
        pathMap.set(oldPath, newPath);
      }
      const { error } = await admin.from("media_library").insert({
        id: newMediaId,
        owner_type: "exhibition",
        owner_id: targetId,
        media_type: media.media_type,
        storage_bucket: media.storage_bucket,
        ...copied,
        metadata: { ...(media.metadata || {}), duplicatedFrom: media.id },
        processing_status: "ready"
      });
      if (error) throw error;
    }
    const { error } = await admin.from("media_usages").insert({
      media_id: newMediaId,
      owner_type: "exhibition",
      owner_id: targetId,
      entity_type: usage.entity_type,
      entity_id: usage.entity_id,
      usage_role: usage.usage_role
    });
    if (error && error.code !== "23505") throw error;
  }

  const { data: stateRow, error: stateError } = await admin
    .from("exhibition_states")
    .select("draft_state,draft_revision,lock_version")
    .eq("exhibition_id", targetId)
    .single();
  if (stateError) throw stateError;
  const rewritten = rewriteJson(stateRow.draft_state, mediaMap, pathMap);
  const { error: updateError } = await admin.from("exhibition_states").update({
    draft_state: rewritten,
    draft_revision: Number(stateRow.draft_revision || 0) + 1,
    lock_version: Number(stateRow.lock_version || 0) + 1,
    draft_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).eq("exhibition_id", targetId);
  if (updateError) throw updateError;
  return { copiedMedia: mediaMap.size, rewrittenPaths: pathMap.size };
}

function rewriteJson(value: any, mediaMap: Map<string, string>, pathMap: Map<string, string>): any {
  if (Array.isArray(value)) return value.map((item) => rewriteJson(item, mediaMap, pathMap));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteJson(item, mediaMap, pathMap)]));
  }
  if (typeof value === "string") return mediaMap.get(value) || pathMap.get(value) || value;
  return value;
}

async function deleteMediaRecord(admin: any, media: any) {
  const { count, error: usageError } = await admin.from("media_usages").select("id", { count: "exact", head: true }).eq("media_id", media.id);
  if (usageError) throw usageError;
  if ((count || 0) > 0) throw new Error(`Media ${media.id} is still referenced by ${count} usages`);
  const paths = [media.original_path, media.desktop_avif_path, media.mobile_avif_path, media.preview_avif_path].filter(Boolean);
  if (paths.length) {
    const removed = await admin.storage.from(media.storage_bucket).remove([...new Set(paths)]);
    if (removed.error) throw removed.error;
  }
  const deleted = await admin.from("media_library").delete().eq("id", media.id);
  if (deleted.error) throw deleted.error;
  return paths.length;
}

async function permanentDelete(admin: any, entityType: string, entityId: string, payload: any) {
  if (!entityId) throw new Error("permanent_delete requires entityId");
  if (entityType === "media") {
    const { data: media, error } = await admin.from("media_library").select("*").eq("id", entityId).single();
    if (error) throw error;
    const paths = await deleteMediaRecord(admin, media);
    return { deleted: entityType, paths };
  }
  if (entityType === "exhibition") {
    const { count, error: refsError } = await admin.from("media_usages").select("id", { count: "exact", head: true }).eq("owner_type", "exhibition").eq("owner_id", entityId);
    if (refsError) throw refsError;
    if ((count || 0) > 0) throw new Error(`Exhibition still owns ${count} media usages`);
    const { data: owned, error: ownedError } = await admin.from("media_library").select("*").eq("owner_type", "exhibition").eq("owner_id", entityId);
    if (ownedError) throw ownedError;
    let removedPaths = 0;
    for (const media of owned || []) removedPaths += await deleteMediaRecord(admin, media);
    const deleted = await admin.from("exhibitions").delete().eq("id", entityId);
    if (deleted.error) throw deleted.error;
    return { deleted: entityType, id: entityId, media: (owned || []).length, paths: removedPaths };
  }
  if (entityType === "venue") {
    const { count, error: exhibitionError } = await admin.from("exhibitions").select("id", { count: "exact", head: true }).eq("venue_id", entityId);
    if (exhibitionError) throw exhibitionError;
    if ((count || 0) > 0) throw new Error(`Venue is still referenced by ${count} exhibitions`);
    const { data: versions, error: versionError } = await admin.from("venue_versions").select("id").eq("venue_id", entityId);
    if (versionError) throw versionError;
    const versionIds = (versions || []).map((item: any) => item.id);
    let assets: any[] = [];
    if (versionIds.length) {
      const assetResult = await admin.from("venue_assets").select("storage_bucket,storage_path").in("venue_version_id", versionIds);
      if (assetResult.error) throw assetResult.error;
      assets = assetResult.data || [];
    }
    const byBucket = new Map<string, string[]>();
    for (const asset of assets || []) {
      if (!asset.storage_bucket || !asset.storage_path) continue;
      const paths = byBucket.get(asset.storage_bucket) || [];
      paths.push(asset.storage_path);
      byBucket.set(asset.storage_bucket, paths);
    }
    for (const [bucket, paths] of byBucket) {
      const removed = await admin.storage.from(bucket).remove([...new Set(paths)]);
      if (removed.error) throw removed.error;
    }
    const deleted = await admin.from("venues").delete().eq("id", entityId);
    if (deleted.error) throw deleted.error;
    return { deleted: entityType, id: entityId, assets: (assets || []).length };
  }
  if (entityType === "author") {
    const { count, error: referenceError } = await admin.from("exhibition_authors").select("exhibition_id", { count: "exact", head: true }).eq("author_id", entityId);
    if (referenceError) throw referenceError;
    if ((count || 0) > 0) throw new Error(`Author is still referenced by ${count} exhibitions`);
    const deleted = await admin.from("authors").delete().eq("id", entityId);
    if (deleted.error) throw deleted.error;
    return { deleted: entityType, id: entityId, payload };
  }
  throw new Error(`Unsupported permanent delete entity: ${entityType}`);
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
