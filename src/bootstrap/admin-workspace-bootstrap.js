/*
  Exhibition Platform — Stage 12C66C6C8C12 Admin Workspace / Hard Space Visual Ready
  Authenticated exhibition management + constrained 3D editor viewport.
*/
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { gallerySpaceDefinition } from "../config/gallery-space-config.js?v=stage12c66c6c8c12_hard_space_visual_ready_20260813";
import { registerExhibitionAssetCache, getExhibitionAssetCacheStatus, getExhibitionAssetDeliveryStats, evictExhibitionAssetCacheUrl } from "./asset-cache-bootstrap.js?v=stage12c66c6c8c12_hard_space_visual_ready_20260813";
import { beginTransitionGuard, endTransitionGuard, isTransitionGuardActive } from "./transition-guard.js?v=stage12c66c6c8c12_hard_space_visual_ready_20260813";

const STAGE = "12C66C6C8C12";
const ENGINE_CACHE_KEY = "stage12c66c6c8c12_hard_space_visual_ready_20260813";
const SUPABASE_URL = "https://bazbszvhoxmuekxahokc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_iCDi8Ls8ZMvqQgcAuE78MQ_OnPVWqfn";
const inlineRuntimeContext = window.__EXHIBITION_INLINE_ADMIN_CONTEXT__ || null;
const inlineWorkspaceMode = !!(inlineRuntimeContext && inlineRuntimeContext.engine && inlineRuntimeContext.scene);
const STORAGE_BUCKET = "gallery-artworks";
const MAX_POSTER_BYTES = 14 * 1024 * 1024;
const POSTER_DELIVERY_MAX_SIDE = 1400;
const POSTER_DELIVERY_QUALITY = 0.82;

const supabase = inlineRuntimeContext && inlineRuntimeContext.supabase
  ? inlineRuntimeContext.supabase
  : createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
window.gallerySupabase = supabase;
const assetCacheReadyPromise = registerExhibitionAssetCache();

const el = (id) => document.getElementById(id);
const canvas = el("renderCanvas");
const authGate = el("authGate");
const adminLoginForm = el("adminLoginForm");
const adminLoginError = el("adminLoginError");
const adminUser = el("adminUser");
const logoutButton = el("logoutButton");
const publicPageButton = el("publicPageButton");
const exhibitionList = el("exhibitionList");
const refreshExhibitionsButton = el("refreshExhibitionsButton");
const createExhibitionForm = el("createExhibitionForm");
const newExhibitionName = el("newExhibitionName");
const createExhibitionButton = el("createExhibitionButton");
const detailsForm = el("detailsForm");
const exhibitionName = el("exhibitionName");
const exhibitionDescription = el("exhibitionDescription");
const exhibitionSlug = el("exhibitionSlug");
const exhibitionSortOrder = el("exhibitionSortOrder");
const exhibitionPublished = el("exhibitionPublished");
const exhibitionSpaceId = el("exhibitionSpaceId");
const saveMetadataButton = el("saveMetadataButton");
const choosePosterButton = el("choosePosterButton");
const removePosterButton = el("removePosterButton");
const posterFileInput = el("posterFileInput");
const posterPreview = el("posterPreview");
const posterStatus = el("posterStatus");
const viewportStatus = el("viewportStatus");
const assetDeliveryStatus = el("assetDeliveryStatus");
const networkDiagnostics = el("networkDiagnostics");
const workspaceLoading = el("workspaceLoading");
const startupError = el("startupError");
const galleryToast = el("galleryToast");
const saveStateButton = el("saveStateButton");

let session = null;
let catalog = [];
let selectedExhibition = null;
let engine = null;
let scene = null;
let engineReady = false;
let sceneSaveState = { dirty: false, saveInFlight: false };
let toastTimer = 0;
let assetCacheStatusSnapshot = null;
let assetCacheStatusReadAt = 0;
let assetDeliveryInterval = 0;
let resizeCleanup = null;
let workspaceActive = true;
let metadataBaseline = "";
let metadataDirty = false;
let metadataBeforeUnloadInstalled = false;

function formatDeliveryBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function deliveryStatsDelta(before, after) {
  before = before || {};
  after = after || {};
  return {
    assetRequests: Math.max(0, Number(after.assetRequests || 0) - Number(before.assetRequests || 0)),
    cacheHits: Math.max(0, Number(after.cacheHits || 0) - Number(before.cacheHits || 0)),
    networkFetches: Math.max(0, Number(after.networkFetches || 0) - Number(before.networkFetches || 0)),
    networkKnownBytes: Math.max(0, Number(after.networkKnownBytes || 0) - Number(before.networkKnownBytes || 0)),
    supabaseNetworkFetches: Math.max(0, Number(after.supabaseNetworkFetches || 0) - Number(before.supabaseNetworkFetches || 0)),
    supabaseNetworkKnownBytes: Math.max(0, Number(after.supabaseNetworkKnownBytes || 0) - Number(before.supabaseNetworkKnownBytes || 0))
  };
}

function publishTransitionNetworkDiagnostic(record) {
  window.ExhibitionNetworkDiagnostics = window.ExhibitionNetworkDiagnostics || {};
  window.ExhibitionNetworkDiagnostics.lastTransition = record;
  try { window.dispatchEvent(new CustomEvent("exhibition-network-diagnostic", { detail: record })); } catch (_error) {}
  return record;
}

async function captureExhibitionTransitionDiagnostic(before, startedAt, fromId, toId) {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await new Promise((resolve) => setTimeout(resolve, 180));
  const after = await getExhibitionAssetDeliveryStats().catch(() => null);
  const delta = deliveryStatsDelta(before, after);
  const engineDebug = window.BerryboyArtGalleryExhibitions && typeof window.BerryboyArtGalleryExhibitions.getDebug === "function"
    ? window.BerryboyArtGalleryExhibitions.getDebug()
    : null;
  const record = {
    type: "exhibition",
    from: fromId || "?",
    to: toId || "?",
    mode: engineDebug && engineDebug.lastSwitchMode ? engineDebug.lastSwitchMode : "unknown",
    residentHit: !!(engineDebug && engineDebug.lastSwitchMode === "resident-layer-resume"),
    durationMs: engineDebug && Number.isFinite(Number(engineDebug.lastSwitchDurationMs))
      ? Math.round(Number(engineDebug.lastSwitchDurationMs) * 10) / 10
      : Math.round((performance.now() - startedAt) * 10) / 10,
    network: delta,
    zeroStorageNetwork: delta.supabaseNetworkFetches === 0,
    at: Date.now()
  };
  publishTransitionNetworkDiagnostic(record);
  return record;
}

async function updateNetworkDiagnosticsStatus() {
  if (!workspaceActive || !networkDiagnostics) return;
  try {
    const stats = await getExhibitionAssetDeliveryStats();
    const last = window.ExhibitionNetworkDiagnostics && window.ExhibitionNetworkDiagnostics.lastTransition;
    const sessionPart = `Storage session: ${stats.supabaseNetworkFetches || 0} net · ${formatDeliveryBytes(stats.supabaseNetworkKnownBytes || 0)} known · ${stats.cacheHits || 0} local hits`;
    let transitionPart = "Last transition: waiting for a switch";
    if (last) {
      const net = last.network || {};
      transitionPart = `Last: ${last.from} → ${last.to} · ${net.supabaseNetworkFetches || 0} net · ${formatDeliveryBytes(net.supabaseNetworkKnownBytes || 0)} · ${last.mode || "transition"} · ${Math.round(Number(last.durationMs) || 0)} ms`;
    }
    const engineDebug = window.BerryboyArtGalleryExhibitions && typeof window.BerryboyArtGalleryExhibitions.getDebug === "function"
      ? window.BerryboyArtGalleryExhibitions.getDebug()
      : null;
    const hydration = engineDebug && engineDebug.lastHydrationProfile;
    const integrity = engineDebug && engineDebug.lastSpaceIntegrity;
    const cpuPart = hydration
      ? `CPU: prepare ${Math.round(Number(hydration.prepareMs) || 0)} · hydrate ${Math.round(Number(hydration.hydrateMs) || 0)} · finalize ${Math.round(Number(hydration.finalizeMs) || 0)} ms`
      : "CPU: waiting";
    const spacePart = integrity ? `Space ${integrity.ok ? "OK" : "FAIL"}` : "Space guard ready";
    const foreground = window.GalleryApp && typeof window.GalleryApp.getForegroundReadiness === "function"
      ? window.GalleryApp.getForegroundReadiness()
      : null;
    const fgLast = foreground && foreground.last;
    const warmup = foreground && foreground.spaceGpuWarmup;
    const owner = foreground && foreground.ownerSweep;
    const critical = foreground && foreground.startupCriticalPath;
    const background = foreground && foreground.backgroundHydration;
    const foregroundPart = foreground
      ? `FG ${foreground.ready ? "ready" : "busy"} · ready ${Math.round(Number(critical && critical.lastForegroundReadyMs) || 0)} ms · GPU ${Math.round(Number(warmup && warmup.lastMs) || 0)} ms · orphan ${Number(owner && owner.detected) || 0} · long ${Number(foreground.longTasks) || 0}`
      : "FG pending";
    const backgroundPart = background
      ? `BG slices ${Number(background.slices) || 0} · art ${Number(background.artworkStarts) || 0} · model ${Number(background.modelStarts) || 0} · pauses ${Number(background.motionPauses) || 0}`
      : "BG waiting";
    networkDiagnostics.textContent = `${sessionPart} | ${transitionPart} | ${cpuPart} | ${foregroundPart} | ${backgroundPart} | ${spacePart}`;
    networkDiagnostics.title = "Storage is measured by the local Service Worker. C6C8C12 requires the full static Space shell (Walls/Floor/Ceiling/Props), per-mesh GPU warmup and Preview presence before interaction. Full textures and sculpture/model hydration remain background-budgeted and motion-aware.";
  } catch (_error) {
    networkDiagnostics.textContent = "Network: diagnostics unavailable";
  }
}

function showToast(message) {
  if (!message) return;
  galleryToast.textContent = message;
  galleryToast.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { galleryToast.style.display = "none"; }, 3200);
}

function setBusy(element, busy) {
  if (element) element.disabled = !!busy;
}

function updatePublicPageHref(exhibitionId) {
  if (!publicPageButton) return;
  const id = String(exhibitionId || "main").trim() || "main";
  publicPageButton.href = `./index.html?exhibition=${encodeURIComponent(id)}`;
}

function getMetadataDraftPayload() {
  return {
    name: exhibitionName ? exhibitionName.value.trim() : "",
    description: exhibitionDescription ? exhibitionDescription.value : "",
    is_published: !!(exhibitionPublished && exhibitionPublished.checked),
    sort_order: Number(exhibitionSortOrder && exhibitionSortOrder.value) || 0
  };
}

function getMetadataDraftFingerprint() {
  return JSON.stringify(getMetadataDraftPayload());
}

function updateMetadataDirtyUi() {
  if (!saveMetadataButton) return;
  saveMetadataButton.dataset.saveState = metadataDirty ? "dirty" : "clean";
  saveMetadataButton.textContent = metadataDirty ? "SAVE EXHIBITION DETAILS" : "DETAILS SAVED";
}

function syncMetadataDirtyState() {
  metadataDirty = !!selectedExhibition && !!metadataBaseline && getMetadataDraftFingerprint() !== metadataBaseline;
  updateMetadataDirtyUi();
  return metadataDirty;
}

function setMetadataBaselineFromForm() {
  metadataBaseline = selectedExhibition ? getMetadataDraftFingerprint() : "";
  metadataDirty = false;
  updateMetadataDirtyUi();
}

function discardMetadataDraft() {
  if (!selectedExhibition) {
    metadataBaseline = "";
    metadataDirty = false;
    updateMetadataDirtyUi();
    return true;
  }
  setSelectedExhibition(selectedExhibition);
  return true;
}

function hasSceneUnsavedChanges() {
  return !!(window.GalleryApp && typeof window.GalleryApp.hasUnsavedChanges === "function"
    ? window.GalleryApp.hasUnsavedChanges()
    : sceneSaveState.dirty);
}

function hasAnyAdminUnsavedChanges() {
  return !!(metadataDirty || hasSceneUnsavedChanges());
}

function discardAdminUnsavedChanges() {
  if (metadataDirty) discardMetadataDraft();
  if (hasSceneUnsavedChanges() && window.GalleryApp && typeof window.GalleryApp.discardUnsavedChanges === "function") {
    return window.GalleryApp.discardUnsavedChanges("admin-workspace-discard");
  }
  return !hasSceneUnsavedChanges();
}

function confirmAndDiscardAdminChanges(message) {
  syncMetadataDirtyState();
  if (!hasAnyAdminUnsavedChanges()) return true;
  if (!window.confirm(message || "You have unsaved Admin changes. Discard them?")) return false;
  return discardAdminUnsavedChanges();
}

function onMetadataBeforeUnload(event) {
  syncMetadataDirtyState();
  if (!workspaceActive || !metadataDirty) return;
  event.preventDefault();
  event.returnValue = "";
  return "";
}

function installMetadataBeforeUnload() {
  if (metadataBeforeUnloadInstalled) return;
  window.addEventListener("beforeunload", onMetadataBeforeUnload);
  metadataBeforeUnloadInstalled = true;
}

function removeMetadataBeforeUnload() {
  if (!metadataBeforeUnloadInstalled) return;
  window.removeEventListener("beforeunload", onMetadataBeforeUnload);
  metadataBeforeUnloadInstalled = false;
}

function startAssetDeliveryMonitoring() {
  if (assetDeliveryInterval) window.clearInterval(assetDeliveryInterval);
  assetDeliveryInterval = 0;
  if (!workspaceActive) return;
  assetDeliveryInterval = window.setInterval(updateAssetDeliveryStatus, 30000);
}

function stopAssetDeliveryMonitoring() {
  if (assetDeliveryInterval) window.clearInterval(assetDeliveryInterval);
  assetDeliveryInterval = 0;
}

async function getAssetCacheStatusThrottled(force = false) {
  const now = Date.now();
  if (!force && assetCacheStatusSnapshot && now - assetCacheStatusReadAt < 60000) {
    return assetCacheStatusSnapshot;
  }
  assetCacheStatusSnapshot = await getExhibitionAssetCacheStatus();
  assetCacheStatusReadAt = now;
  return assetCacheStatusSnapshot;
}

function getRequestedExhibitionId() {
  if (inlineRuntimeContext && inlineRuntimeContext.exhibitionId) {
    return String(inlineRuntimeContext.exhibitionId).trim() || "main";
  }
  try {
    const params = new URLSearchParams(location.search);
    return (params.get("exhibition") || localStorage.getItem("exhibition_platform_admin_active") || "main").trim() || "main";
  } catch (_error) { return "main"; }
}

function readNavigationHandoff(id) {
  const key = `exhibition_platform_handoff_${id}`;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    sessionStorage.removeItem(key);
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schema !== "exhibition-navigation-handoff.v1") return null;
    if (!parsed.exhibition || String(parsed.exhibition.id) !== String(id)) return null;
    if (Date.now() - Number(parsed.createdAt || 0) > 120000) return null;
    if (String(parsed.spaceId || gallerySpaceDefinition.id) !== String(gallerySpaceDefinition.id)) return null;
    return parsed;
  } catch (_error) {
    try { sessionStorage.removeItem(key); } catch (_ignore) {}
    return null;
  }
}

function updateUrlExhibition(id) {
  try {
    const url = new URL(location.href);
    url.searchParams.set("exhibition", id);
    history.replaceState(null, "", url);
    localStorage.setItem("exhibition_platform_admin_active", id);
    if (inlineRuntimeContext) inlineRuntimeContext.exhibitionId = id;
  } catch (_error) {}
}

function publicUrlFor(path) {
  if (!path) return "";
  try {
    const result = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return result && result.data ? result.data.publicUrl || "" : "";
  } catch (_error) { return ""; }
}

function normalizeExhibition(record) {
  if (!record || !record.id) return null;
  return {
    id: String(record.id),
    name: String(record.name || record.id),
    slug: String(record.slug || record.id),
    description: String(record.description || ""),
    cover_path: record.cover_path || null,
    is_published: record.is_published !== false,
    sort_order: Number(record.sort_order) || 0,
    storage_prefix: String(record.storage_prefix || (record.id === "main" ? "main" : `exhibitions/${record.id}`)),
    space_id: String(record.space_id || gallerySpaceDefinition.id),
    created_at: record.created_at || null,
    updated_at: record.updated_at || null
  };
}

async function fetchCatalog() {
  const response = await supabase.from("gallery_exhibitions")
    .select("id, name, slug, description, cover_path, is_published, sort_order, storage_prefix, space_id, created_at, updated_at")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (response.error) throw response.error;
  catalog = (response.data || []).map(normalizeExhibition).filter(Boolean);
  renderCatalog();
  return catalog;
}

function upsertLocalCatalogRecord(record) {
  const normalized = normalizeExhibition(record);
  if (!normalized) return null;
  const index = catalog.findIndex((item) => item.id === normalized.id);
  if (index >= 0) catalog[index] = normalized;
  else catalog.push(normalized);
  catalog.sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
  renderCatalog();
  return normalized;
}

function renderCatalog() {
  exhibitionList.innerHTML = "";
  if (!catalog.length) {
    exhibitionList.innerHTML = '<div class="fieldMeta">No exhibitions found.</div>';
    return;
  }
  const activeId = window.GalleryApp && window.GalleryApp.getActiveExhibition
    ? window.GalleryApp.getActiveExhibition().id
    : (selectedExhibition ? selectedExhibition.id : getRequestedExhibitionId());

  catalog.forEach((item) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "exhibitionRow" + (item.id === activeId ? " active" : "");
    row.dataset.exhibitionId = item.id;
    const img = document.createElement("img");
    img.className = "exhibitionThumb";
    img.alt = "";
    const cover = publicUrlFor(item.cover_path);
    if (cover) img.src = cover;
    const meta = document.createElement("div");
    meta.className = "exhibitionMeta";
    const title = document.createElement("strong");
    title.textContent = item.name;
    const detail = document.createElement("span");
    detail.innerHTML = `<i class="statusDot ${item.is_published ? "published" : ""}"></i>${item.is_published ? "Published" : "Draft"} · ${item.id}`;
    meta.append(title, detail);
    row.append(img, meta);
    row.addEventListener("click", () => selectAndSwitchExhibition(item.id));
    exhibitionList.appendChild(row);
  });
}

function setSelectedExhibition(record) {
  selectedExhibition = normalizeExhibition(record);
  if (!selectedExhibition) return;
  exhibitionName.value = selectedExhibition.name;
  exhibitionDescription.value = selectedExhibition.description;
  exhibitionSlug.value = selectedExhibition.slug;
  exhibitionSortOrder.value = String(selectedExhibition.sort_order);
  exhibitionPublished.checked = !!selectedExhibition.is_published;
  exhibitionSpaceId.textContent = selectedExhibition.space_id;
  const posterUrl = publicUrlFor(selectedExhibition.cover_path);
  posterPreview.src = posterUrl || "";
  posterPreview.style.visibility = posterUrl ? "visible" : "hidden";
  posterStatus.textContent = selectedExhibition.cover_path ? selectedExhibition.cover_path : "No poster assigned.";
  removePosterButton.disabled = !selectedExhibition.cover_path;
  updatePublicPageHref(selectedExhibition.id);
  setMetadataBaselineFromForm();
  renderCatalog();
}

function syncSelectedFromCatalog(id) {
  const found = catalog.find((item) => item.id === id) || null;
  if (found) setSelectedExhibition(found);
  return found;
}

async function selectAndSwitchExhibition(id) {
  const target = catalog.find((item) => item.id === id);
  if (!target || isTransitionGuardActive()) return;
  if (!engineReady || !window.GalleryApp) {
    setSelectedExhibition(target);
    updateUrlExhibition(id);
    return;
  }
  const current = window.GalleryApp.getActiveExhibition();
  if (current && current.id === id) {
    setSelectedExhibition(target);
    return;
  }
  if (!confirmAndDiscardAdminChanges("You have unsaved Admin changes. Discard them and switch exhibition?")) return;
  viewportStatus.innerHTML = `3D preview: <strong>switching to ${target.name}…</strong>`;
  const transitionBefore = await getExhibitionAssetDeliveryStats().catch(() => null);
  const fromId = current && current.id ? current.id : "?";
  const guardToken = await beginTransitionGuard({
    title: `Switching to ${target.name}…`,
    detail: "Keeping the current 3D Space resident.",
    minVisibleMs: 150
  });
  if (!guardToken) return;
  const transitionStartedAt = performance.now();
  try {
    const ok = await window.GalleryApp.switchExhibition(id, { force: true });
    if (!ok) return;
    if (typeof window.GalleryApp.waitForForegroundReady === "function") {
      await window.GalleryApp.waitForForegroundReady(`switch:${fromId}->${id}`, { pendingTimeoutMs: 7000, quietTimeoutMs: 3600 });
    }
    updateUrlExhibition(id);
    setSelectedExhibition(catalog.find((item) => item.id === id) || target);
    viewportStatus.innerHTML = `3D preview: <strong>${target.name}</strong>`;
    void captureExhibitionTransitionDiagnostic(transitionBefore, transitionStartedAt, fromId, id)
      .then(() => updateAssetDeliveryStatus())
      .catch(() => null);
  } catch (error) {
    showToast("Could not switch exhibition: " + (error.message || error));
  } finally {
    await endTransitionGuard(guardToken);
  }
}

function sanitizeFileName(name) {
  return String(name || "poster").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "poster";
}

async function saveMetadata(patch) {
  if (!selectedExhibition) return null;
  if (window.GalleryApp && typeof window.GalleryApp.updateExhibitionMetadata === "function") {
    return window.GalleryApp.updateExhibitionMetadata(selectedExhibition.id, patch);
  }
  const response = await supabase.from("gallery_exhibitions")
    .update(patch).eq("id", selectedExhibition.id)
    .select("id, name, slug, description, cover_path, is_published, sort_order, storage_prefix, space_id, created_at, updated_at").limit(1);
  if (response.error) throw response.error;
  return normalizeExhibition((response.data || [])[0]);
}

async function decodePosterImage(file) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file); } catch (_error) {}
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not decode poster image.")); };
    image.src = url;
  });
}

async function optimizePosterForDelivery(file) {
  const source = await decodePosterImage(file);
  const width = Number(source.width || source.naturalWidth) || 1;
  const height = Number(source.height || source.naturalHeight) || 1;
  const scale = Math.min(1, POSTER_DELIVERY_MAX_SIDE / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!context) throw new Error("Could not create poster optimizer canvas.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, targetWidth, targetHeight);
  if (source && typeof source.close === "function") source.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", POSTER_DELIVERY_QUALITY));
  canvas.width = 1;
  canvas.height = 1;
  if (!blob) throw new Error("Could not encode optimized poster.");
  return { blob, width: targetWidth, height: targetHeight, size: blob.size || 0, mimeType: "image/webp" };
}

async function uploadPoster(file) {
  if (!selectedExhibition || !file) return;
  if (!/^image\//i.test(file.type || "")) throw new Error("Choose an image file.");
  if (file.size > MAX_POSTER_BYTES) throw new Error("Poster source is too large. Maximum input size is 14 MB.");
  const oldPath = selectedExhibition.cover_path;
  const base = sanitizeFileName(file.name.replace(/\.[^.]+$/, ""));
  posterStatus.textContent = "Optimizing poster for delivery…";
  const optimized = await optimizePosterForDelivery(file);
  const path = `${selectedExhibition.storage_prefix}/branding/posters/${Date.now()}-${base}-cover.webp`;
  posterStatus.textContent = `Uploading optimized poster · ${optimized.width}×${optimized.height} · ${(optimized.size / 1024).toFixed(0)} KB…`;
  const upload = await supabase.storage.from(STORAGE_BUCKET).upload(path, optimized.blob, {
    cacheControl: "31536000",
    upsert: false,
    contentType: optimized.mimeType
  });
  if (upload.error) throw upload.error;
  try {
    const updated = await saveMetadata({ cover_path: path });
    const localUpdated = upsertLocalCatalogRecord(updated || Object.assign({}, selectedExhibition, { cover_path: path }));
    setSelectedExhibition(localUpdated);
    if (oldPath && oldPath !== path) {
      const oldUrl = publicUrlFor(oldPath);
      supabase.storage.from(STORAGE_BUCKET).remove([oldPath]).catch(() => {});
      if (oldUrl) evictExhibitionAssetCacheUrl(oldUrl).catch(() => {});
    }
    showToast(`Poster optimized to ${(optimized.size / 1024).toFixed(0)} KB and updated.`);
  } catch (error) {
    await supabase.storage.from(STORAGE_BUCKET).remove([path]).catch(() => {});
    throw error;
  }
}

async function removePoster() {
  if (!selectedExhibition || !selectedExhibition.cover_path) return;
  const oldPath = selectedExhibition.cover_path;
  const updated = await saveMetadata({ cover_path: null });
  const localUpdated = upsertLocalCatalogRecord(updated || Object.assign({}, selectedExhibition, { cover_path: null }));
  setSelectedExhibition(localUpdated);
  const oldUrl = publicUrlFor(oldPath);
  supabase.storage.from(STORAGE_BUCKET).remove([oldPath]).catch(() => {});
  if (oldUrl) evictExhibitionAssetCacheUrl(oldUrl).catch(() => {});
  assetCacheStatusReadAt = 0;
  showToast("Poster removed.");
}

function loadScript(src, id) {
  if (document.getElementById(id)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load " + src));
    document.head.appendChild(script);
  });
}

async function ensureBabylon() {
  await loadScript("https://cdn.babylonjs.com/babylon.js", "adminBabylonRuntime");
  await loadScript("https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js", "adminBabylonLoaders");
  if (!window.BABYLON || !window.BABYLON.Engine) throw new Error("Babylon runtime unavailable.");
}

function waitForInteractionReady(timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error("3D workspace startup timed out.")); }, timeoutMs);
    const onReady = (event) => { cleanup(); resolve(event.detail || {}); };
    const onFailure = (event) => { cleanup(); reject(new Error((event.detail && (event.detail.technicalMessage || event.detail.message)) || "3D workspace failed.")); };
    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener("gallery-interaction-ready", onReady);
      window.removeEventListener("gallery-startup-failure", onFailure);
    }
    window.addEventListener("gallery-interaction-ready", onReady, { once: true });
    window.addEventListener("gallery-startup-failure", onFailure, { once: true });
  });
}

function installResize() {
  if (resizeCleanup) resizeCleanup();
  let raf = 0;
  let observer = null;
  const resize = () => {
    if (!workspaceActive || raf) return;
    raf = requestAnimationFrame(() => { raf = 0; if (workspaceActive && engine) engine.resize(); });
  };
  window.addEventListener("resize", resize, { passive: true });
  if (window.ResizeObserver) {
    observer = new ResizeObserver(resize);
    const stage = el("adminViewportStage");
    if (stage) observer.observe(stage);
  }
  resizeCleanup = () => {
    window.removeEventListener("resize", resize);
    if (observer) observer.disconnect();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    resizeCleanup = null;
  };
  resize();
}

async function updateAssetDeliveryStatus() {
  if (!workspaceActive || !assetDeliveryStatus) return;
  try {
    const cache = await getAssetCacheStatusThrottled(false);
    const delivery = window.GalleryApp && typeof window.GalleryApp.getAssetDeliveryDebug === "function"
      ? window.GalleryApp.getAssetDeliveryDebug()
      : null;
    const residency = delivery && delivery.residency ? delivery.residency : null;
    const cacheText = cache && cache.controlled ? `${cache.entries || 0} cached assets` : "browser cache warming";
    const textureText = residency ? `${residency.full || 0}/${delivery.fullBudget || residency.effectiveBudget || 0} Full · ${residency.preview || 0} Preview` : "Preview-first";
    const exhibitionResidency = delivery && delivery.exhibitionResidency ? delivery.exhibitionResidency : null;
    const layerText = exhibitionResidency ? `${exhibitionResidency.parked || 0} parked exhibition layer${exhibitionResidency.parked === 1 ? "" : "s"}` : "layer residency ready";
    const stability = delivery && delivery.textureStability ? delivery.textureStability : null;
    const stabilityText = stability
      ? `stable ↑${stability.fullUpgrades || 0} ↓${stability.downgrades || 0} · move-block ${stability.blockedWhileMoving || 0} · thrash ${stability.thrashPrevented || 0}`
      : "stable streaming";
    assetDeliveryStatus.textContent = `Asset delivery: ${textureText} · ${cacheText} · ${layerText} · ${stabilityText}`;
    await updateNetworkDiagnosticsStatus();
  } catch (_error) {
    assetDeliveryStatus.textContent = "Asset delivery: Preview-first / proximity Full";
    await updateNetworkDiagnosticsStatus();
  }
}

async function startEngine(initialId, initialSnapshot) {
  if (engineReady) return;
  workspaceLoading.classList.remove("hidden");
  viewportStatus.innerHTML = "3D preview: <strong>starting…</strong>";

  if (inlineWorkspaceMode) {
    engine = inlineRuntimeContext.engine;
    scene = inlineRuntimeContext.scene;
    installResize();
    window.galleryEditorAuthenticated = true;
    if (window.GalleryApp) {
      window.GalleryApp.setEditorAuthenticated(true);
      window.GalleryApp.hideViewerIntroOverlay();
      if (typeof window.GalleryApp.enterAdminWorkspaceMode === "function") {
        window.GalleryApp.enterAdminWorkspaceMode();
      } else {
        window.GalleryApp.setEditMode(true);
      }
    }
    engineReady = true;
    workspaceLoading.classList.add("hidden");
    const activeInline = window.GalleryApp && window.GalleryApp.getActiveExhibition
      ? window.GalleryApp.getActiveExhibition()
      : selectedExhibition;
    if (activeInline) {
      viewportStatus.innerHTML = `3D preview: <strong>${activeInline.name}</strong>`;
      updateUrlExhibition(activeInline.id);
      syncSelectedFromCatalog(activeInline.id);
    }
    if (engine && engine.resize) engine.resize();
    assetCacheStatusReadAt = 0;
    await updateAssetDeliveryStatus();
    startAssetDeliveryMonitoring();
    return;
  }

  await assetCacheReadyPromise;
  await ensureBabylon();
  const ready = waitForInteractionReady();
  const module = await import(`../Gallery_V0_11.min.js?v=${ENGINE_CACHE_KEY}`);
  engine = new window.BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: false, stencil: true, antialias: true, powerPreference: "high-performance", adaptToDeviceRatio: false
  });
  scene = module.createScene(engine, canvas, { spaceDefinition: gallerySpaceDefinition, exhibitionId: initialId, adminWorkspace: true, initialExhibitionSnapshot: initialSnapshot || null });
  engine.runRenderLoop(() => scene.render());
  installResize();
  await ready;
  window.galleryEditorAuthenticated = true;
  if (window.GalleryApp) {
    window.GalleryApp.setEditorAuthenticated(true);
    window.GalleryApp.hideViewerIntroOverlay();
    window.GalleryApp.setEditMode(true);
  }
  engineReady = true;
  workspaceLoading.classList.add("hidden");
  const active = window.GalleryApp.getActiveExhibition();
  viewportStatus.innerHTML = `3D preview: <strong>${active.name}</strong>`;
  updateUrlExhibition(active.id);
  if (!catalog.length) await fetchCatalog();
  syncSelectedFromCatalog(active.id);
  assetCacheStatusReadAt = 0;
  await updateAssetDeliveryStatus();
  startAssetDeliveryMonitoring();
}

function updateSceneSaveButton() {
  if (!saveStateButton) return;
  const state = sceneSaveState.saveInFlight ? "saving" : sceneSaveState.dirty ? "dirty" : "clean";
  saveStateButton.dataset.saveState = state;
  saveStateButton.disabled = state !== "dirty";
  saveStateButton.textContent = state === "saving" ? "SAVING…" : state === "dirty" ? "SAVE CHANGES" : "ALL CHANGES SAVED";
}

window.addEventListener("gallery-draft-state", (event) => {
  const detail = event.detail || {};
  sceneSaveState.dirty = !!detail.dirty;
  sceneSaveState.saveInFlight = !!detail.saveInFlight;
  updateSceneSaveButton();
});

window.addEventListener("gallery-exhibition-context-change", async (event) => {
  if (!workspaceActive) return;
  const record = event.detail && event.detail.exhibition;
  if (!record) return;
  updateUrlExhibition(record.id);
  if (catalog.length) {
    const index = catalog.findIndex((item) => item.id === record.id);
    if (index >= 0) catalog[index] = normalizeExhibition(record);
    setSelectedExhibition(catalog.find((item) => item.id === record.id) || record);
  }
  viewportStatus.innerHTML = `3D preview: <strong>${record.name}</strong>`;
});

window.addEventListener("gallery-status", (event) => {
  if (!workspaceActive) return;
  const detail = event.detail || {};
  if (detail.message) showToast(detail.message);
});

window.addEventListener("exhibition-network-diagnostic", () => {
  if (workspaceActive) updateNetworkDiagnosticsStatus();
});

saveStateButton.addEventListener("click", async () => {
  if (!window.GalleryApp || sceneSaveState.saveInFlight) return;
  sceneSaveState.saveInFlight = true;
  updateSceneSaveButton();
  const ok = await window.GalleryApp.saveStateToSupabase();
  sceneSaveState.saveInFlight = false;
  sceneSaveState.dirty = !ok;
  updateSceneSaveButton();
});

refreshExhibitionsButton.addEventListener("click", async () => {
  syncMetadataDirtyState();
  if (metadataDirty && !window.confirm("Exhibition details have unsaved changes. Discard them and refresh the list?")) return;
  if (metadataDirty) discardMetadataDraft();
  setBusy(refreshExhibitionsButton, true);
  try { await fetchCatalog(); if (selectedExhibition) syncSelectedFromCatalog(selectedExhibition.id); }
  catch (error) { showToast(error.message || String(error)); }
  finally { setBusy(refreshExhibitionsButton, false); }
});

createExhibitionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = newExhibitionName.value.trim();
  if (!name || !window.GalleryApp) return;
  if (!confirmAndDiscardAdminChanges("You have unsaved Admin changes. Discard them and create a new exhibition?")) return;
  setBusy(createExhibitionButton, true);
  try {
    const created = await window.GalleryApp.createExhibition(name);
    if (!created) return;
    newExhibitionName.value = "";
    const localCreated = upsertLocalCatalogRecord(created);
    setSelectedExhibition(localCreated);
    updateUrlExhibition(created.id);
  } catch (error) { showToast(error.message || String(error)); }
  finally { setBusy(createExhibitionButton, false); }
});

detailsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedExhibition) return;
  setBusy(saveMetadataButton, true);
  try {
    const updated = await saveMetadata(getMetadataDraftPayload());
    const localUpdated = upsertLocalCatalogRecord(updated || selectedExhibition);
    setSelectedExhibition(localUpdated);
    showToast("Exhibition details saved.");
  } catch (error) { showToast(error.message || String(error)); }
  finally { setBusy(saveMetadataButton, false); }
});

choosePosterButton.addEventListener("click", () => {
  syncMetadataDirtyState();
  if (metadataDirty) {
    showToast("Save Exhibition Details before changing the poster.");
    return;
  }
  posterFileInput.click();
});
posterFileInput.addEventListener("change", async () => {
  const file = posterFileInput.files && posterFileInput.files[0];
  posterFileInput.value = "";
  if (!file) return;
  setBusy(choosePosterButton, true);
  try { await uploadPoster(file); }
  catch (error) { posterStatus.textContent = error.message || String(error); showToast(error.message || String(error)); }
  finally { setBusy(choosePosterButton, false); }
});
removePosterButton.addEventListener("click", async () => {
  syncMetadataDirtyState();
  if (metadataDirty) {
    showToast("Save Exhibition Details before removing the poster.");
    return;
  }
  setBusy(removePosterButton, true);
  try { await removePoster(); }
  catch (error) { showToast(error.message || String(error)); }
  finally { setBusy(removePosterButton, false); }
});

[exhibitionName, exhibitionDescription, exhibitionSortOrder].forEach((field) => {
  if (field) field.addEventListener("input", syncMetadataDirtyState);
});
if (exhibitionPublished) exhibitionPublished.addEventListener("change", syncMetadataDirtyState);

if (publicPageButton) {
  publicPageButton.addEventListener("click", async (event) => {
    event.preventDefault();
    const active = window.GalleryApp && typeof window.GalleryApp.getActiveExhibition === "function"
      ? window.GalleryApp.getActiveExhibition()
      : selectedExhibition;
    updatePublicPageHref(active && active.id ? active.id : "main");

    if (!confirmAndDiscardAdminChanges("You have unsaved Admin changes. Discard them and return to the public Viewer?")) return;

    if (inlineWorkspaceMode && inlineRuntimeContext && typeof inlineRuntimeContext.close === "function") {
      await inlineRuntimeContext.close({ discardUnsaved: true, force: true });
      return;
    }

    if (isTransitionGuardActive()) return;
    const guardToken = await beginTransitionGuard({
      title: "Opening Public Page…",
      detail: "Passing the current exhibition to the Viewer.",
      minVisibleMs: 150
    });
    if (!guardToken) return;
    if (window.GalleryApp && typeof window.GalleryApp.createNavigationHandoff === "function") {
      try { window.GalleryApp.createNavigationHandoff(); } catch (_error) {}
    }
    location.href = publicPageButton.href;
  });
}

if (!inlineWorkspaceMode && logoutButton) logoutButton.addEventListener("click", async () => {
  if (!confirmAndDiscardAdminChanges("You have unsaved Admin changes. Discard them and log out?")) return;
  await supabase.auth.signOut();
  location.href = "./index.html";
});

if (adminLoginForm) adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  adminLoginError.style.display = "none";
  const email = el("adminEmail").value.trim();
  const password = el("adminPassword").value;
  const response = await supabase.auth.signInWithPassword({ email, password });
  if (response.error) {
    adminLoginError.textContent = "Login failed. Check e-mail and password.";
    adminLoginError.style.display = "block";
    return;
  }
  session = response.data.session;
  authGate.classList.remove("visible");
  await initializeWorkspace();
});

async function initializeWorkspace() {
  if (!session) return;
  workspaceActive = true;
  installMetadataBeforeUnload();
  adminUser.textContent = session.user && session.user.email ? session.user.email : "Editor";
  window.galleryEditorAuthenticated = true;
  try {
    await fetchCatalog();
    const requested = getRequestedExhibitionId();
    const initial = catalog.find((item) => item.id === requested) || catalog.find((item) => item.id === "main") || catalog[0];
    if (!initial) throw new Error("No exhibition exists. Check the Multi-Exhibition SQL migration.");
    setSelectedExhibition(initial);
    const navigationHandoff = readNavigationHandoff(initial.id);
    await startEngine(initial.id, navigationHandoff);
  } catch (error) {
    startupError.textContent = error.message || String(error);
    startupError.style.display = "grid";
    workspaceLoading.classList.add("hidden");
  }
}

supabase.auth.onAuthStateChange((_event, nextSession) => {
  session = nextSession || null;
  if (!session && engineReady) {
    if (inlineWorkspaceMode && inlineRuntimeContext && typeof inlineRuntimeContext.onSessionLost === "function") {
      inlineRuntimeContext.onSessionLost();
    } else {
      location.href = "./index.html";
    }
  }
});

if (inlineWorkspaceMode && inlineRuntimeContext.session) {
  session = inlineRuntimeContext.session;
  if (authGate) authGate.classList.remove("visible");
  await initializeWorkspace();
} else {
  const sessionResponse = await supabase.auth.getSession();
  session = sessionResponse.data.session || null;
  if (!session) {
    if (authGate) authGate.classList.add("visible");
    workspaceLoading.classList.add("hidden");
  } else {
    if (authGate) authGate.classList.remove("visible");
    await initializeWorkspace();
  }
}

export async function suspendAdminWorkspace() {
  workspaceActive = false;
  stopAssetDeliveryMonitoring();
  removeMetadataBeforeUnload();
  if (resizeCleanup) resizeCleanup();
  return true;
}

export function hasAdminMetadataUnsavedChanges() {
  return syncMetadataDirtyState();
}

export function discardAdminMetadataChanges() {
  return discardMetadataDraft();
}

export async function resumeAdminWorkspace() {
  if (!session && inlineRuntimeContext && inlineRuntimeContext.session) session = inlineRuntimeContext.session;
  if (!session) return false;
  workspaceActive = true;
  installMetadataBeforeUnload();
  installResize();
  if (window.GalleryApp && typeof window.GalleryApp.enterAdminWorkspaceMode === "function") {
    window.GalleryApp.enterAdminWorkspaceMode();
  }
  if (engine && engine.resize) engine.resize();
  const active = window.GalleryApp && window.GalleryApp.getActiveExhibition
    ? window.GalleryApp.getActiveExhibition()
    : selectedExhibition;
  if (active) {
    updateUrlExhibition(active.id);
    if (catalog.length) syncSelectedFromCatalog(active.id);
    viewportStatus.innerHTML = `3D preview: <strong>${active.name}</strong>`;
  }
  await updateAssetDeliveryStatus();
  startAssetDeliveryMonitoring();
  return true;
}
