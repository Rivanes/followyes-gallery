/*
  Exhibition Platform — C6C8C22 Admin Workspace / Gallery Management
  Authenticated exhibition management + constrained 3D editor viewport.
*/
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { registerExhibitionAssetCache, getExhibitionAssetCacheStatus, getExhibitionAssetDeliveryStats, evictExhibitionAssetCacheUrl } from "./asset-cache-bootstrap.js?v=c6c8c22_gallery_management_20260908";
import { beginTransitionGuard, endTransitionGuard, isTransitionGuardActive } from "./transition-guard.js?v=c6c8c22_gallery_management_20260908";
import { createExhibitionDataAdapter, resolveInitialAdminRuntime } from "../data/exhibition-api.js?v=c6c8c22_gallery_management";
import { createGalleryManagementApi } from "../data/gallery-management-api.js?v=c6c8c22_gallery_management";

const STAGE = "C6C8C22";
const ENGINE_CACHE_KEY = "c6c8c22_gallery_management_20260908";
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
let metadataDraftPreviewActive = false;
let exhibitionData = window.ExhibitionPlatformDataAdapter || null;
let galleryManagement = null;
let galleryAdminContext = null;
let galleryCatalog = [];
let selectedGalleryDetail = null;
let galleryMetadataBaseline = "";
let galleryMetadataDirty = false;
let adminWorkspaceSection = "exhibitions";

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
  const engineDebug = window.ExhibitionPlatformExhibitions && typeof window.ExhibitionPlatformExhibitions.getDebug === "function"
    ? window.ExhibitionPlatformExhibitions.getDebug()
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
    const engineDebug = window.ExhibitionPlatformExhibitions && typeof window.ExhibitionPlatformExhibitions.getDebug === "function"
      ? window.ExhibitionPlatformExhibitions.getDebug()
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
  syncGalleryMetadataDirty();
  return !!(metadataDirty || galleryMetadataDirty || hasSceneUnsavedChanges());
}

function discardAdminUnsavedChanges() {
  if (metadataDirty) discardMetadataDraft();
  if (galleryMetadataDirty) discardGalleryMetadataDraft();
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
  syncGalleryMetadataDirty();
  if ((!workspaceActive && !metadataDraftPreviewActive) || (!metadataDirty && !galleryMetadataDirty)) return;
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

function readNavigationHandoff(id, spaceId) {
  const key = `exhibition_platform_handoff_${id}`;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    sessionStorage.removeItem(key);
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schema !== "exhibition-navigation-handoff.v1") return null;
    if (!parsed.exhibition || String(parsed.exhibition.id) !== String(id)) return null;
    if (Date.now() - Number(parsed.createdAt || 0) > 120000) return null;
    if (spaceId && String(parsed.spaceId || spaceId) !== String(spaceId)) return null;
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
    space_id: String(record.space_id || ""),
    created_at: record.created_at || null,
    updated_at: record.updated_at || null
  };
}

async function fetchCatalog() {
  if (!exhibitionData) exhibitionData = createExhibitionDataAdapter({ supabase, mode: "admin" });
  if (typeof exhibitionData.setMode === "function") exhibitionData.setMode("admin");
  window.ExhibitionPlatformDataAdapter = exhibitionData;
  if (window.GalleryApp && typeof window.GalleryApp.setExhibitionDataMode === "function") window.GalleryApp.setExhibitionDataMode("admin");
  catalog = (await exhibitionData.list()).map(normalizeExhibition).filter(Boolean);
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
  if (!exhibitionData) exhibitionData = createExhibitionDataAdapter({ supabase, mode: "admin" });
  if (typeof exhibitionData.setMode === "function") exhibitionData.setMode("admin");
  return exhibitionData.updateMetadata(selectedExhibition.id, patch);
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
    const updated = await saveMetadata({ cover_path: path, cover_mime_type: optimized.mimeType, cover_file_size: optimized.size });
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
      if (typeof window.GalleryApp.setExhibitionDataMode === "function") window.GalleryApp.setExhibitionDataMode("admin");
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
  let initialRuntime = exhibitionData && typeof exhibitionData.getRuntime === "function" ? exhibitionData.getRuntime(initialId) : null;
  if (!initialRuntime) initialRuntime = await resolveInitialAdminRuntime(supabase, initialId);
  if (!exhibitionData) exhibitionData = createExhibitionDataAdapter({ supabase, mode: "admin", initialRuntime });
  if (typeof exhibitionData.setMode === "function") exhibitionData.setMode("admin");
  window.ExhibitionPlatformDataAdapter = exhibitionData;
  engine = new window.BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: false, stencil: true, antialias: true, powerPreference: "high-performance", adaptToDeviceRatio: false
  });
  scene = module.createScene(engine, canvas, { spaceDefinition: initialRuntime.spaceDefinition, exhibitionData, exhibitionId: initialRuntime.exhibition.id, adminWorkspace: true, initialExhibitionSnapshot: initialSnapshot || null });
  engine.runRenderLoop(() => scene.render());
  installResize();
  await ready;
  window.galleryEditorAuthenticated = true;
  if (window.GalleryApp) {
    if (typeof window.GalleryApp.setExhibitionDataMode === "function") window.GalleryApp.setExhibitionDataMode("admin");
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

// -----------------------------------------------------------------------------
// C6C8C22 — Gallery Management UI
// Injected into both standalone admin.html and the same-runtime inline Admin shell.
// -----------------------------------------------------------------------------
function galleryEl(id) { return document.getElementById(id); }

function ensureGalleryManagementStyles() {
  if (document.getElementById("c22GalleryManagementStyles")) return;
  const style = document.createElement("style");
  style.id = "c22GalleryManagementStyles";
  style.textContent = `
    .adminSectionTabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:12px 14px 0}
    .adminSectionTab{height:36px;border:1px solid var(--line,rgba(255,255,255,.1));border-radius:10px;background:rgba(255,255,255,.035);color:var(--muted,rgba(255,255,255,.57));font-size:10px;font-weight:800;letter-spacing:.08em;cursor:pointer}
    .adminSectionTab.active{background:var(--accent-bg,rgba(125,160,127,.16));border-color:rgba(154,180,155,.38);color:var(--text,#fff)}
    .galleryManagementSection.hidden{display:none!important}.exhibitionManagementSection.hidden{display:none!important}
    #galleryCreateForm{display:grid;gap:8px}.galleryList{display:grid;gap:7px;max-height:300px;overflow:auto;padding-right:2px}
    .galleryRow{width:100%;display:grid;gap:4px;text-align:left;padding:10px;border:1px solid transparent;border-radius:10px;background:transparent;color:inherit;cursor:pointer}
    .galleryRow:hover{background:rgba(255,255,255,.045)}.galleryRow.active{border-color:rgba(154,180,155,.38);background:rgba(125,160,127,.16)}
    .galleryRow strong{font-size:12px}.galleryRow span{font-size:10px;color:var(--muted,rgba(255,255,255,.57));line-height:1.4}
    #galleryDetailBody{display:grid;gap:13px}.gallerySubsection{display:grid;gap:9px;padding-top:4px}.gallerySubsection+.gallerySubsection{border-top:1px solid var(--line,rgba(255,255,255,.1));padding-top:13px}
    .gallerySubsection h3{margin:0;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--text,#fff)}
    .galleryVersionLine{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px;border:1px solid var(--line,rgba(255,255,255,.1));border-radius:10px;background:rgba(255,255,255,.025);font-size:10px}
    .galleryActions{display:flex;flex-wrap:wrap;gap:7px}.galleryAssetGrid{display:grid;gap:7px}.galleryAssetRow{display:grid;grid-template-columns:64px minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px;border:1px solid var(--line,rgba(255,255,255,.1));border-radius:10px}
    .galleryAssetRole{font-size:10px;font-weight:800;text-transform:uppercase}.galleryAssetMeta{min-width:0;font-size:10px;color:var(--muted,rgba(255,255,255,.57));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .galleryAssetInput{display:none}.galleryEntryGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.galleryEntryLabel{display:grid;gap:4px;font-size:9px;color:var(--muted,rgba(255,255,255,.57));text-transform:uppercase}
    .galleryValidation{padding:9px 10px;border:1px solid var(--line,rgba(255,255,255,.1));border-radius:10px;font-size:10px;line-height:1.5;color:var(--muted,rgba(255,255,255,.57))}.galleryValidation.valid{border-color:rgba(127,169,130,.45);background:rgba(127,169,130,.08)}.galleryValidation.invalid{border-color:rgba(209,139,139,.45);background:rgba(209,139,139,.06)}
    .galleryHistory{display:grid;gap:6px}.galleryHistoryItem{display:flex;justify-content:space-between;gap:10px;font-size:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.06)}
    .galleryMuted{color:var(--muted,rgba(255,255,255,.57));font-size:10px;line-height:1.45}.galleryDangerNote{color:#d7a0a0;font-size:10px;line-height:1.45}
    @media(max-width:520px){.galleryAssetRow{grid-template-columns:54px minmax(0,1fr)}.galleryAssetRow .adminButton{grid-column:1/-1}.galleryEntryGrid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function getAdminSidebarElement() {
  return galleryEl("adminSidebar") || galleryEl("inlineAdminSidebar") || (exhibitionList ? exhibitionList.closest("aside") : null);
}

function getGalleryRequestedId() {
  try { return new URLSearchParams(location.search).get("gallery") || ""; } catch (_error) { return ""; }
}

function updateGalleryUrl(venueId) {
  try {
    const url = new URL(location.href);
    url.searchParams.set("section", "galleries");
    if (venueId) url.searchParams.set("gallery", venueId); else url.searchParams.delete("gallery");
    history.replaceState(null, "", url);
  } catch (_error) {}
}

function galleryWorkingVersion(detail) {
  if (!detail || !detail.venue) return null;
  const versions = Array.isArray(detail.versions) ? detail.versions : [];
  return versions.find((item) => item.id === detail.venue.draft_version_id)
    || versions.find((item) => item.id === detail.venue.published_version_id)
    || versions[0] || null;
}

function galleryPublishedVersion(detail) {
  if (!detail || !detail.venue) return null;
  return (detail.versions || []).find((item) => item.id === detail.venue.published_version_id) || null;
}

function galleryDraftVersion(detail) {
  if (!detail || !detail.venue) return null;
  return (detail.versions || []).find((item) => item.id === detail.venue.draft_version_id) || null;
}

function galleryEntryFromManifest(manifest) {
  const points = manifest && Array.isArray(manifest.spawnPoints) ? manifest.spawnPoints : [];
  return points.find((item) => item && item.id === "visitor-entry")
    || points.find((item) => item && item.visitor === true && item.safe !== false)
    || null;
}

function galleryMetadataSnapshot() {
  const name = galleryEl("galleryName");
  const description = galleryEl("galleryDescription");
  return JSON.stringify({ name: name ? name.value : "", description: description ? description.value : "" });
}

function syncGalleryMetadataDirty() {
  galleryMetadataDirty = !!(selectedGalleryDetail && galleryMetadataBaseline && galleryMetadataSnapshot() !== galleryMetadataBaseline);
  const button = galleryEl("saveGalleryDetailsButton");
  if (button) button.dataset.dirty = galleryMetadataDirty ? "true" : "false";
  return galleryMetadataDirty;
}

function discardGalleryMetadataDraft() {
  if (selectedGalleryDetail) renderGalleryDetail(selectedGalleryDetail);
  galleryMetadataDirty = false;
  return true;
}

async function ensureGalleryManagementApi() {
  if (!galleryManagement) galleryManagement = createGalleryManagementApi({ supabase });
  if (!galleryAdminContext) galleryAdminContext = await galleryManagement.getAdminContext();
  return galleryManagement;
}

function setAdminWorkspaceSection(section, { skipConfirm = false } = {}) {
  const next = section === "galleries" ? "galleries" : "exhibitions";
  if (adminWorkspaceSection === next) return true;
  syncMetadataDirtyState();
  syncGalleryMetadataDirty();
  if (!skipConfirm && hasAnyAdminUnsavedChanges()) {
    if (!window.confirm("You have unsaved Admin changes. Discard them and switch section?")) return false;
    discardAdminUnsavedChanges();
  }
  adminWorkspaceSection = next;
  document.querySelectorAll(".exhibitionManagementSection").forEach((node) => node.classList.toggle("hidden", next !== "exhibitions"));
  document.querySelectorAll(".galleryManagementSection").forEach((node) => node.classList.toggle("hidden", next !== "galleries"));
  document.querySelectorAll(".adminSectionTab").forEach((node) => node.classList.toggle("active", node.dataset.section === next));
  if (saveStateButton) saveStateButton.style.display = next === "exhibitions" ? "" : "none";
  if (next === "galleries") {
    updateGalleryUrl(selectedGalleryDetail && selectedGalleryDetail.venue ? selectedGalleryDetail.venue.id : getGalleryRequestedId());
    if (session) void loadGalleryCatalog().catch((error) => showToast(error.message || String(error)));
  }
  return true;
}

function ensureGalleryManagementUi() {
  ensureGalleryManagementStyles();
  const sidebar = getAdminSidebarElement();
  if (!sidebar || galleryEl("adminSectionTabs")) return;
  const existingSections = [...sidebar.children].filter((node) => node.classList && node.classList.contains("workspaceSection"));
  existingSections.forEach((node) => node.classList.add("exhibitionManagementSection"));

  const tabs = document.createElement("div");
  tabs.id = "adminSectionTabs";
  tabs.className = "adminSectionTabs";
  tabs.innerHTML = '<button type="button" class="adminSectionTab active" data-section="exhibitions">EXHIBITIONS</button><button type="button" class="adminSectionTab" data-section="galleries">GALLERIES</button>';
  sidebar.insertBefore(tabs, sidebar.firstChild);
  tabs.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => setAdminWorkspaceSection(button.dataset.section)));

  const catalogSection = document.createElement("section");
  catalogSection.className = "workspaceSection galleryManagementSection hidden";
  catalogSection.innerHTML = `
    <div class="sectionHead"><div><h2>Galleries</h2><p>Manage versioned 3D spaces used by Exhibitions.</p></div><button id="refreshGalleriesButton" class="adminButton" type="button">↻</button></div>
    <div class="sectionBody">
      <form id="galleryCreateForm">
        <input id="newGalleryName" class="adminInput" maxlength="120" placeholder="New Gallery name" autocomplete="off" />
        <textarea id="newGalleryDescription" class="adminTextarea" maxlength="4000" placeholder="Description (optional)"></textarea>
        <button id="createGalleryButton" class="adminButton primary" type="submit">CREATE GALLERY</button>
      </form>
      <div style="height:10px"></div><div id="galleryList" class="galleryList"><div class="fieldMeta">Loading Galleries…</div></div>
    </div>`;
  sidebar.appendChild(catalogSection);

  const detailSection = document.createElement("section");
  detailSection.className = "workspaceSection galleryManagementSection hidden";
  detailSection.innerHTML = `
    <div class="sectionHead"><div><h2>Gallery details</h2><p>Controlled Gallery lifecycle. Raw Manifest JSON is intentionally not exposed.</p></div></div>
    <div class="sectionBody" id="galleryDetailBody"><div class="fieldMeta">Select a Gallery.</div></div>`;
  sidebar.appendChild(detailSection);

  galleryEl("refreshGalleriesButton").addEventListener("click", () => loadGalleryCatalog(true).catch((error) => showToast(error.message || String(error))));
  galleryEl("galleryCreateForm").addEventListener("submit", handleCreateGallery);

  let initialSection = "exhibitions";
  try { if (new URLSearchParams(location.search).get("section") === "galleries") initialSection = "galleries"; } catch (_error) {}
  if (initialSection === "galleries") setAdminWorkspaceSection("galleries", { skipConfirm: true });
}

async function loadGalleryCatalog(force = false) {
  await ensureGalleryManagementApi();
  if (!force && galleryCatalog.length) {
    renderGalleryCatalog();
    return galleryCatalog;
  }
  galleryCatalog = await galleryManagement.list();
  renderGalleryCatalog();
  const requested = getGalleryRequestedId();
  const currentId = selectedGalleryDetail && selectedGalleryDetail.venue ? selectedGalleryDetail.venue.id : "";
  const target = galleryCatalog.find((item) => item.id === (requested || currentId)) || galleryCatalog[0] || null;
  if (target && (!selectedGalleryDetail || selectedGalleryDetail.venue.id !== target.id || force)) await selectGallery(target.id, { skipConfirm: true });
  return galleryCatalog;
}

function renderGalleryCatalog() {
  const list = galleryEl("galleryList");
  if (!list) return;
  list.innerHTML = "";
  const canCreate = !!(galleryAdminContext && Array.isArray(galleryAdminContext.capabilities) && galleryAdminContext.capabilities.includes("venue.create"));
  const createForm = galleryEl("galleryCreateForm");
  if (createForm) createForm.style.display = canCreate ? "grid" : "none";
  if (!galleryCatalog.length) { list.innerHTML = '<div class="fieldMeta">No Galleries found.</div>'; return; }
  galleryCatalog.forEach((item) => {
    const versions = Array.isArray(item.versions) ? item.versions : [];
    const published = versions.find((v) => v.id === item.published_version_id);
    const draft = versions.find((v) => v.id === item.draft_version_id);
    const row = document.createElement("button");
    row.type = "button";
    row.className = "galleryRow" + (selectedGalleryDetail && selectedGalleryDetail.venue.id === item.id ? " active" : "");
    row.innerHTML = `<strong>${item.name || item.slug}</strong><span>${item.status === "archived" ? "Archived" : published ? `Published ${published.version_number}` : "Not published"}${draft ? ` · Draft ${draft.version_number}` : ""} · Exhibitions ${Number(item.exhibition_count) || 0}</span>`;
    row.addEventListener("click", () => selectGallery(item.id));
    list.appendChild(row);
  });
}

async function selectGallery(venueId, { skipConfirm = false } = {}) {
  syncGalleryMetadataDirty();
  if (!skipConfirm && galleryMetadataDirty && !window.confirm("Gallery details have unsaved changes. Discard them and open another Gallery?")) return;
  await ensureGalleryManagementApi();
  selectedGalleryDetail = await galleryManagement.get(venueId);
  renderGalleryDetail(selectedGalleryDetail);
  renderGalleryCatalog();
  updateGalleryUrl(venueId);
}

function renderGalleryDetail(detail) {
  const body = galleryEl("galleryDetailBody");
  if (!body || !detail || !detail.venue) return;
  const venue = detail.venue;
  const canManage = detail.canManage === true;
  const draft = galleryDraftVersion(detail);
  const published = galleryPublishedVersion(detail);
  const working = draft || published;
  const assets = working && Array.isArray(working.assets) ? working.assets : [];
  const entry = galleryEntryFromManifest(working && working.manifest);
  const validation = working && working.validation_report && typeof working.validation_report === "object" ? working.validation_report : {};
  const validationValid = validation.valid === true;
  const rollback = detail.rollback || {};
  const blockers = detail.archiveBlockers || {};
  const activeExhibitionCount = Number(blockers.activeExhibitions) || 0;

  body.innerHTML = `
    <form id="galleryDetailsForm" class="gallerySubsection">
      <h3>Gallery details</h3>
      <label class="fieldLabel">Name<input id="galleryName" class="adminInput" maxlength="120" required ${canManage ? "" : "readonly"}></label>
      <label class="fieldLabel">Description<textarea id="galleryDescription" class="adminTextarea" maxlength="4000" ${canManage ? "" : "readonly"}></textarea></label>
      <label class="fieldLabel">Technical slug<input id="gallerySlug" class="adminInput" readonly></label>
      <button id="saveGalleryDetailsButton" class="adminButton primary" type="submit" ${canManage ? "" : "disabled"}>SAVE GALLERY DETAILS</button>
    </form>
    <div class="gallerySubsection"><h3>Version</h3>
      <div class="galleryVersionLine"><span>Published</span><strong>${published ? published.version_number : "—"}</strong></div>
      <div class="galleryVersionLine"><span>Active Draft</span><strong>${draft ? draft.version_number : "none"}</strong></div>
      <div class="galleryActions">
        <button id="beginGalleryDraftButton" class="adminButton" type="button" ${canManage && venue.status !== "archived" ? "" : "disabled"}>${draft ? "EDIT DRAFT" : "CREATE NEXT VERSION"}</button>
        <button id="discardGalleryDraftButton" class="adminButton danger" type="button" ${canManage && draft ? "" : "disabled"}>DISCARD DRAFT</button>
      </div>
    </div>
    <div class="gallerySubsection"><h3>Building assets</h3><div class="galleryMuted">Four controlled Space roles. Replacing a file creates a new immutable Storage object.</div><div id="galleryAssetGrid" class="galleryAssetGrid"></div></div>
    <div class="gallerySubsection"><h3>Entry point</h3>
      <div class="galleryMuted">Fine-adjust values here or capture the current camera from TEST GALLERY.</div>
      <div class="galleryMuted">Position</div><div class="galleryEntryGrid">${["x","y","z"].map((axis)=>`<label class="galleryEntryLabel">${axis}<input id="galleryEntryPos${axis.toUpperCase()}" class="adminInput" type="number" step="0.01"></label>`).join("")}</div>
      <div class="galleryMuted">Look target</div><div class="galleryEntryGrid">${["x","y","z"].map((axis)=>`<label class="galleryEntryLabel">${axis}<input id="galleryEntryTarget${axis.toUpperCase()}" class="adminInput" type="number" step="0.01"></label>`).join("")}</div>
      <div class="galleryActions"><button id="saveGalleryEntryButton" class="adminButton" type="button" ${canManage && draft ? "" : "disabled"}>SAVE ENTRY POINT</button><button id="testGalleryButton" class="adminButton" type="button" ${working ? "" : "disabled"}>TEST GALLERY</button></div>
    </div>
    <div class="gallerySubsection"><h3>Validation</h3><div id="galleryValidation" class="galleryValidation ${validationValid ? "valid" : "invalid"}"></div><button id="validateGalleryButton" class="adminButton" type="button" ${canManage && draft ? "" : "disabled"}>VALIDATE DRAFT</button></div>
    <div class="gallerySubsection"><h3>Actions</h3><div class="galleryActions">
      <button id="publishGalleryButton" class="adminButton primary" type="button" ${canManage && draft ? "" : "disabled"}>PUBLISH VERSION</button>
      <button id="rollbackGalleryButton" class="adminButton" type="button" ${canManage && rollback.available ? "" : "disabled"}>ROLLBACK</button>
      <button id="archiveGalleryButton" class="adminButton danger" type="button" ${canManage && venue.status !== "archived" && !draft && activeExhibitionCount===0 ? "" : "disabled"}>ARCHIVE</button>
      <button id="restoreGalleryButton" class="adminButton" type="button" ${canManage && venue.status === "archived" ? "" : "disabled"}>RESTORE</button>
    </div><div id="galleryActionNote" class="galleryDangerNote"></div></div>
    <div class="gallerySubsection"><h3>Version history</h3><div id="galleryHistory" class="galleryHistory"></div></div>`;

  galleryEl("galleryName").value = venue.name || "";
  galleryEl("galleryDescription").value = venue.description || "";
  galleryEl("gallerySlug").value = venue.slug || "";
  const pos = entry && entry.position ? entry.position : {x:0,y:1.7,z:0};
  const target = entry && entry.target ? entry.target : {x:0,y:1.7,z:1};
  ["X","Y","Z"].forEach((axis) => {
    galleryEl(`galleryEntryPos${axis}`).value = String(pos[axis.toLowerCase()] ?? 0);
    galleryEl(`galleryEntryTarget${axis}`).value = String(target[axis.toLowerCase()] ?? 0);
  });
  renderGalleryAssetSlots(detail, working, assets, canManage && !!draft);
  renderGalleryValidation(validation, working);
  renderGalleryHistory(detail);
  const actionNote = galleryEl("galleryActionNote");
  if (venue.status === "archived") actionNote.textContent = "Archived Gallery is read-only until restored.";
  else if (draft) actionNote.textContent = "Rollback and Archive are locked while an active Draft Version exists.";
  else if (activeExhibitionCount > 0) actionNote.textContent = `Archive blocked: ${activeExhibitionCount} active Exhibition(s) still belong to this Gallery.`;
  else if (venue.previous_version_id && !rollback.available) actionNote.textContent = "Previous Version is invalid or historical only; rollback is unavailable.";

  galleryEl("galleryDetailsForm").addEventListener("submit", handleSaveGalleryDetails);
  galleryEl("galleryName").addEventListener("input", syncGalleryMetadataDirty);
  galleryEl("galleryDescription").addEventListener("input", syncGalleryMetadataDirty);
  galleryEl("beginGalleryDraftButton").addEventListener("click", handleBeginGalleryDraft);
  galleryEl("discardGalleryDraftButton").addEventListener("click", handleDiscardGalleryDraft);
  galleryEl("saveGalleryEntryButton").addEventListener("click", handleSaveGalleryEntry);
  galleryEl("testGalleryButton").addEventListener("click", handleTestGallery);
  galleryEl("validateGalleryButton").addEventListener("click", handleValidateGallery);
  galleryEl("publishGalleryButton").addEventListener("click", handlePublishGallery);
  galleryEl("rollbackGalleryButton").addEventListener("click", handleRollbackGallery);
  galleryEl("archiveGalleryButton").addEventListener("click", handleArchiveGallery);
  galleryEl("restoreGalleryButton").addEventListener("click", handleRestoreGallery);
  galleryMetadataBaseline = galleryMetadataSnapshot();
  galleryMetadataDirty = false;
}

function renderGalleryAssetSlots(detail, working, assets, editable) {
  const grid = galleryEl("galleryAssetGrid");
  if (!grid) return;
  grid.innerHTML = "";
  CONTROLLED_GALLERY_ASSET_ROLES.forEach((role) => {
    const asset = assets.find((item) => item.role === role || item.asset_id === role) || null;
    const row = document.createElement("div");
    row.className = "galleryAssetRow";
    const label = document.createElement("div"); label.className = "galleryAssetRole"; label.textContent = role;
    const meta = document.createElement("div"); meta.className = "galleryAssetMeta";
    meta.textContent = asset ? `${asset.storage_path || asset.public_url || "assigned"}${asset.file_size ? ` · ${Math.round(Number(asset.file_size)/1024)} KB` : ""}` : "Not assigned";
    const button = document.createElement("button"); button.type="button"; button.className="adminButton"; button.textContent = asset ? "REPLACE" : "UPLOAD"; button.disabled = !editable;
    const input = document.createElement("input"); input.type="file"; input.accept=".glb,model/gltf-binary"; input.className="galleryAssetInput";
    button.addEventListener("click", () => input.click());
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0]; input.value=""; if (!file) return;
      button.disabled=true; button.textContent="UPLOADING…";
      try {
        const draft = galleryDraftVersion(selectedGalleryDetail);
        const result = await galleryManagement.uploadAssetSlot({ venueId: detail.venue.id, venueVersionId: draft.id, role, file });
        const warning = result.cleanup && result.cleanup.warnings && result.cleanup.warnings[0];
        showToast(warning ? `Asset updated. ${warning}` : `${role.toUpperCase()} updated.`);
        await refreshSelectedGallery();
      } catch (error) { showToast(error.message || String(error)); }
      finally { button.disabled=false; button.textContent=asset ? "REPLACE" : "UPLOAD"; }
    });
    row.append(label,meta,button,input); grid.appendChild(row);
  });
}

function renderGalleryValidation(report, working) {
  const box = galleryEl("galleryValidation"); if (!box) return;
  const valid = report && report.valid === true;
  const errors = report && Array.isArray(report.errors) ? report.errors : [];
  const warnings = report && Array.isArray(report.warnings) ? report.warnings : [];
  box.className = `galleryValidation ${valid ? "valid" : "invalid"}`;
  box.textContent = `${working ? working.version_number : "No version"} · ${valid ? "READY" : "NOT READY"}${errors.length ? ` · ${errors.join(" · ")}` : ""}${warnings.length ? ` · Warnings: ${warnings.join(" · ")}` : ""}`;
}

function renderGalleryHistory(detail) {
  const target = galleryEl("galleryHistory"); if (!target) return;
  target.innerHTML="";
  (detail.versions || []).forEach((version) => {
    let label = version.status || "historical";
    if (version.id === detail.venue.published_version_id) label = "Published";
    else if (version.id === detail.venue.draft_version_id) label = "Draft";
    else if (version.id === detail.venue.previous_version_id) label = detail.rollback && detail.rollback.available ? "Previous — rollback available" : "Previous — invalid history";
    else if (version.status === "archived") label = "Archived Draft";
    const row=document.createElement("div"); row.className="galleryHistoryItem"; row.innerHTML=`<strong>${version.version_number}</strong><span class="galleryMuted">${label}</span>`; target.appendChild(row);
  });
}

async function refreshSelectedGallery() {
  if (!selectedGalleryDetail || !selectedGalleryDetail.venue) return;
  const id=selectedGalleryDetail.venue.id;
  selectedGalleryDetail=await galleryManagement.get(id);
  galleryCatalog=await galleryManagement.list();
  renderGalleryCatalog(); renderGalleryDetail(selectedGalleryDetail);
}

async function handleCreateGallery(event) {
  event.preventDefault();
  await ensureGalleryManagementApi();
  const name=galleryEl("newGalleryName").value.trim(); const description=galleryEl("newGalleryDescription").value.trim();
  if (!name) return;
  const button=galleryEl("createGalleryButton"); setBusy(button,true);
  try { const created=await galleryManagement.create({name,description}); galleryEl("newGalleryName").value=""; galleryEl("newGalleryDescription").value=""; galleryCatalog=await galleryManagement.list(); await selectGallery(created.venue.id,{skipConfirm:true}); showToast("Gallery created with v1 Draft."); }
  catch(error){showToast(error.message||String(error));} finally{setBusy(button,false);}
}

async function handleSaveGalleryDetails(event) {
  event.preventDefault(); if (!selectedGalleryDetail) return;
  const button=galleryEl("saveGalleryDetailsButton"); setBusy(button,true);
  try { await galleryManagement.updateDetails(selectedGalleryDetail.venue.id,{name:galleryEl("galleryName").value,description:galleryEl("galleryDescription").value}); await refreshSelectedGallery(); showToast("Gallery details saved."); }
  catch(error){showToast(error.message||String(error));} finally{setBusy(button,false);}
}

async function handleBeginGalleryDraft() {
  if (!selectedGalleryDetail) return;
  const button=galleryEl("beginGalleryDraftButton"); setBusy(button,true);
  try { const result=await galleryManagement.beginDraft(selectedGalleryDetail.venue.id); await refreshSelectedGallery(); showToast(result.created ? `Created ${result.draftVersion.version_number} Draft.` : `Opened ${result.draftVersion.version_number} Draft.`); }
  catch(error){showToast(error.message||String(error));} finally{setBusy(button,false);}
}

async function handleDiscardGalleryDraft() {
  const draft=galleryDraftVersion(selectedGalleryDetail); if(!draft) return;
  if(!window.confirm(`Discard ${draft.version_number} Draft? Uploaded objects owned only by this Draft will be cleanup candidates.`)) return;
  try { const result=await galleryManagement.discardDraft(draft.id); await refreshSelectedGallery(); const warning=result.cleanup&&result.cleanup.warnings&&result.cleanup.warnings[0]; showToast(warning?`Draft discarded. ${warning}`:"Draft discarded."); }
  catch(error){showToast(error.message||String(error));}
}

function readEntryForm() {
  const read=(prefix)=>({x:Number(galleryEl(`${prefix}X`).value),y:Number(galleryEl(`${prefix}Y`).value),z:Number(galleryEl(`${prefix}Z`).value)});
  return {position:read("galleryEntryPos"),target:read("galleryEntryTarget")};
}

async function handleSaveGalleryEntry() {
  const draft=galleryDraftVersion(selectedGalleryDetail); if(!draft) return;
  try { const entry=readEntryForm(); await galleryManagement.setEntryPoint(draft.id,entry.position,entry.target); await refreshSelectedGallery(); showToast("Entry Point saved."); }
  catch(error){showToast(error.message||String(error));}
}

function handleTestGallery() {
  const version=galleryWorkingVersion(selectedGalleryDetail); if(!version) return;
  if (hasAnyAdminUnsavedChanges() && !window.confirm("Unsaved Admin changes will be discarded before Test Gallery. Continue?")) return;
  if (hasAnyAdminUnsavedChanges()) discardAdminUnsavedChanges();
  const url=new URL("./gallery-test.html",location.href); url.searchParams.set("version",version.id); url.searchParams.set("gallery",selectedGalleryDetail.venue.id); location.href=url.href;
}

async function handleValidateGallery() {
  const draft=galleryDraftVersion(selectedGalleryDetail); if(!draft) return;
  try { const report=await galleryManagement.validate(draft.id); await refreshSelectedGallery(); showToast(report.valid?"Gallery Draft is READY.":"Gallery validation found blockers."); }
  catch(error){showToast(error.message||String(error));}
}

async function handlePublishGallery() {
  const draft=galleryDraftVersion(selectedGalleryDetail); if(!draft) return;
  if(!window.confirm("Publish this Gallery Version? Existing Exhibitions stay on their currently assigned Gallery Version until deliberately migrated later.")) return;
  try { await galleryManagement.publish(draft.id); await refreshSelectedGallery(); showToast(`${draft.version_number} published. Existing Exhibitions were not reassigned.`); }
  catch(error){showToast(error.message||String(error));}
}

async function handleRollbackGallery() {
  if(!selectedGalleryDetail||!(selectedGalleryDetail.rollback&&selectedGalleryDetail.rollback.available)) return;
  if(!window.confirm("Rollback the active Gallery Version to the validated previous Version? Existing Exhibitions remain pinned to their explicit versions.")) return;
  try { await galleryManagement.rollback(selectedGalleryDetail.venue.id); await refreshSelectedGallery(); showToast("Gallery rollback completed."); }
  catch(error){showToast(error.message||String(error));}
}

async function handleArchiveGallery() {
  if(!selectedGalleryDetail) return; if(!window.confirm("Archive this Gallery?")) return;
  try { await galleryManagement.archive(selectedGalleryDetail.venue.id); await refreshSelectedGallery(); showToast("Gallery archived."); }
  catch(error){showToast(error.message||String(error));}
}

async function handleRestoreGallery() {
  if(!selectedGalleryDetail) return;
  try { await galleryManagement.restore(selectedGalleryDetail.venue.id); await refreshSelectedGallery(); showToast("Gallery restored."); }
  catch(error){showToast(error.message||String(error));}
}

ensureGalleryManagementUi();

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
    syncMetadataDirtyState();

    // C6C8C15: PUBLIC PAGE is a non-destructive preview. The live scene draft and
    // metadata form stay in memory and return untouched when Admin is reopened.
    if (inlineWorkspaceMode && inlineRuntimeContext && typeof inlineRuntimeContext.close === "function") {
      await inlineRuntimeContext.close({ preserveDraft: true, reason: "public-preview" });
      return;
    }

    // Direct admin.html cannot keep the same JS heap, but the scene handoff carries
    // the unsaved scene state instead of discarding it before navigation.
    if (isTransitionGuardActive()) return;
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
    if (!exhibitionData) exhibitionData = createExhibitionDataAdapter({ supabase, mode: "admin" });
    if (typeof exhibitionData.setMode === "function") exhibitionData.setMode("admin");
    window.ExhibitionPlatformDataAdapter = exhibitionData;
    if (window.GalleryApp && typeof window.GalleryApp.setExhibitionDataMode === "function") window.GalleryApp.setExhibitionDataMode("admin");
    await fetchCatalog();
    if (adminWorkspaceSection === "galleries") await loadGalleryCatalog(true);
    const requested = getRequestedExhibitionId();
    const initial = catalog.find((item) => item.id === requested || item.slug === requested) || catalog.find((item) => item.slug === "main") || catalog[0];
    if (!initial) throw new Error("No canonical Exhibition exists. Run the current platform migration and postcheck.");
    setSelectedExhibition(initial);
    let initialRuntime = exhibitionData && typeof exhibitionData.getRuntime === "function" ? exhibitionData.getRuntime(initial.id) : null;
    if (!initialRuntime) initialRuntime = await resolveInitialAdminRuntime(supabase, initial.id);
    const navigationHandoff = readNavigationHandoff(initial.id, initialRuntime.spaceDefinition.id);
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

export async function suspendAdminWorkspace(options = {}) {
  syncMetadataDirtyState();
  metadataDraftPreviewActive = options.preserveDraft === true && metadataDirty;
  workspaceActive = false;
  stopAssetDeliveryMonitoring();
  if (!metadataDraftPreviewActive) removeMetadataBeforeUnload();
  else installMetadataBeforeUnload();
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
  const preserveMetadataDraft = metadataDraftPreviewActive && metadataDirty;
  metadataDraftPreviewActive = false;
  workspaceActive = true;
  installMetadataBeforeUnload();
  installResize();
  if (exhibitionData && typeof exhibitionData.setMode === "function") exhibitionData.setMode("admin");
  if (window.GalleryApp && typeof window.GalleryApp.setExhibitionDataMode === "function") window.GalleryApp.setExhibitionDataMode("admin");
  if (window.GalleryApp && typeof window.GalleryApp.enterAdminWorkspaceMode === "function") {
    window.GalleryApp.enterAdminWorkspaceMode();
  }
  if (engine && engine.resize) engine.resize();
  const active = window.GalleryApp && window.GalleryApp.getActiveExhibition
    ? window.GalleryApp.getActiveExhibition()
    : selectedExhibition;
  if (active) {
    updateUrlExhibition(active.id);
    const sameDraftExhibition = preserveMetadataDraft && selectedExhibition && selectedExhibition.id === active.id;
    if (catalog.length && !sameDraftExhibition) syncSelectedFromCatalog(active.id);
    else if (catalog.length) renderCatalog();
    viewportStatus.innerHTML = `3D preview: <strong>${active.name}</strong>`;
    if (sameDraftExhibition) syncMetadataDirtyState();
  }
  // C6C8C13: diagnostics are not part of the workspace mode critical path.
  // Paint the Admin shell first and refresh delivery telemetry asynchronously.
  void updateAssetDeliveryStatus().catch(() => null);
  startAssetDeliveryMonitoring();
  return true;
}
