/*
  Exhibition Platform — V14.1.5.1 Admin Workspace / GLB Runtime Truth
  Authenticated exhibition management + constrained 3D editor viewport.
*/
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { registerExhibitionAssetCache, getExhibitionAssetCacheStatus, getExhibitionAssetDeliveryStats, evictExhibitionAssetCacheUrl } from "./asset-cache-bootstrap.js?v=c6c8c22_gallery_management_20260908";
import { beginTransitionGuard, endTransitionGuard, isTransitionGuardActive } from "./transition-guard.js?v=c6c8c22_gallery_management_20260908";
import { createExhibitionDataAdapter, resolveInitialAdminRuntime } from "../data/exhibition-api.js?v=c6c8c25_cross_space_runtime";
import { createGalleryManagementApi, CONTROLLED_GALLERY_ASSET_ROLES } from "../data/gallery-management-api.js?v=c6c8c25_cross_space_runtime";
import {
  REQUIRED_GALLERY_MODEL_ROLES,
  validateGalleryModelFile,
  validateGalleryModelUrl,
  isCurrentGalleryModelValidation,
  summarizeGalleryModelValidation
} from "../validation/gallery-model-validation.js?v=c6c8c25_cross_space_runtime";
import { getRuntimeVenueVersionKey } from "../runtime/scene-lifecycle-controller.js?v=v14_1_5_1_glb_runtime_truth_20260910";
import { createSceneLoadingOrchestrator } from "../runtime/scene-loading-orchestrator.js?v=v14_1_5_1_glb_runtime_truth_20260910";
import { buildAuthoringSpaceDefinition } from "../runtime/space-definition-resolver.js?v=c6c8c25_2_admin_gallery_preview";
import { createAdminAssetWorkspace } from "./admin-asset-workspace.js?v=v13_6_production_closure";
import {
  galleryBindingLabel,
  isExhibitionGalleryMigrationPending,
  summarizeGalleryMigrationImpact
} from "../data/exhibition-gallery-assignment.js?v=c6c8c25_cross_space_runtime";

const STAGE = "V14.1.5.1";
const ENGINE_CACHE_KEY = "v14_1_5_1_glb_runtime_truth_20260910";
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
const exhibitionPublicationStatus = el("exhibitionPublicationStatus");
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
let sceneLifecycleController = inlineRuntimeContext && inlineRuntimeContext.lifecycle ? inlineRuntimeContext.lifecycle : null;
let galleryEngineModule = null;
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
let galleryEntryBaseline = "";
let galleryEntryDirty = false;
let galleryMutationInFlight = false;
let adminWorkspaceSection = "exhibitions";
let assetWorkspace = null;
let assetWorkspaceHost = "exhibitions";
let assetWorkspaceReturnSection = "exhibitions";
let exhibitionGalleryDetail = null;
let exhibitionGalleryDetailRequest = 0;
let exhibitionGalleryMutationInFlight = false;
let galleryAuthoringPreviewActive = false;

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
    networkDiagnostics.title = "Storage is measured by the local Service Worker. C6C8C23 requires Floor/Walls/Ceiling for Published runtime; Props are optional. Per-mesh GPU warmup and Preview presence remain part of normal Exhibition readiness. Full textures and sculpture/model hydration remain background-budgeted and motion-aware.";
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
  syncGalleryEntryDirty();
  return !!(metadataDirty || galleryMetadataDirty || galleryEntryDirty || hasSceneUnsavedChanges());
}

function discardAdminUnsavedChanges() {
  if (metadataDirty) discardMetadataDraft();
  if (galleryMetadataDirty || galleryEntryDirty) discardGalleryFormDraft();
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
  syncGalleryEntryDirty();
  if ((!workspaceActive && !metadataDraftPreviewActive) || (!metadataDirty && !galleryMetadataDirty && !galleryEntryDirty)) return;
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

function readNavigationHandoff(id, spaceId, venueVersionId) {
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
    if (venueVersionId && parsed.venueVersionId && String(parsed.venueVersionId) !== String(venueVersionId)) return null;
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

function setViewportStatus(label) {
  if (!viewportStatus) return;
  viewportStatus.textContent = "3D preview: ";
  const strong = document.createElement("strong");
  strong.textContent = String(label == null ? "" : label);
  viewportStatus.appendChild(strong);
}

function ensureExhibitionGalleryAssignmentUi() {
  if (document.getElementById("exhibitionGalleryAssignment")) return document.getElementById("exhibitionGalleryAssignment");
  const anchor = exhibitionSpaceId && exhibitionSpaceId.closest ? exhibitionSpaceId.closest(".fieldMeta") : null;
  if (!anchor || !detailsForm) return null;
  if (!document.getElementById("c24ExhibitionGalleryAssignmentStyles")) {
    const style = document.createElement("style");
    style.id = "c24ExhibitionGalleryAssignmentStyles";
    style.textContent = `
      #exhibitionGalleryAssignment{display:grid;gap:9px;padding:11px;border:1px solid rgba(255,255,255,.12);border-radius:11px;background:rgba(255,255,255,.035)}
      #exhibitionGalleryAssignment .c24AssignmentTitle{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.78)}
      #exhibitionGalleryAssignment .c24BindingGrid{display:grid;gap:5px}
      #exhibitionGalleryAssignment .c24BindingRow{display:grid;grid-template-columns:72px minmax(0,1fr);gap:8px;font-size:10px;line-height:1.35}
      #exhibitionGalleryAssignment .c24BindingRow span{color:rgba(255,255,255,.48)}
      #exhibitionGalleryAssignment .c24BindingRow strong{color:rgba(255,255,255,.88);font-weight:600;overflow-wrap:anywhere}
      #exhibitionGalleryAssignment .c24Migration{padding:8px;border-radius:8px;background:rgba(255,196,92,.08);color:rgba(255,220,153,.92);font-size:10px;line-height:1.45}
      #exhibitionGalleryAssignment .c24Migration.resolved{background:rgba(125,169,130,.08);color:rgba(180,220,184,.9)}
      #exhibitionGalleryAssignment .c24AssignmentActions{display:flex;flex-wrap:wrap;gap:7px}
      #exhibitionGalleryAssignment .c25PublishValidation{display:grid;gap:5px;padding:9px;border-radius:8px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08);font-size:10px;line-height:1.45}
      #exhibitionGalleryAssignment .c25PublishValidation.valid{background:rgba(125,169,130,.08);color:rgba(180,220,184,.92)}
      #exhibitionGalleryAssignment .c25PublishValidation.blocked{background:rgba(214,96,96,.08);color:rgba(255,185,185,.94)}
      #exhibitionGalleryAssignment .c25PublishValidation .warning{color:rgba(255,220,153,.92)}
      #exhibitionGalleryTarget{width:100%;min-height:38px;border:1px solid rgba(255,255,255,.18);border-radius:10px;background:#171a18;color:rgba(255,255,255,.92);padding:0 9px;font:inherit}
    `;
    document.head.appendChild(style);
  }
  const wrap = document.createElement("div");
  wrap.id = "exhibitionGalleryAssignment";
  wrap.innerHTML = `
    <div class="c24AssignmentTitle">Gallery assignment</div>
    <div class="c24BindingGrid">
      <div class="c24BindingRow"><span>Draft</span><strong id="c24DraftGallery">Loading…</strong></div>
      <div class="c24BindingRow"><span>Published</span><strong id="c24PublishedGallery">—</strong></div>
      <div class="c24BindingRow"><span>Previous</span><strong id="c24PreviousGallery">—</strong></div>
    </div>
    <div id="c24GalleryMigration" class="c24Migration resolved">No pending Gallery migration.</div>
    <div id="c25PublishValidation" class="c25PublishValidation">Checking publication readiness…</div>
    <label class="fieldLabel">Assign Draft to Gallery<select id="exhibitionGalleryTarget"><option value="">Loading available Galleries…</option></select></label>
    <div class="c24AssignmentActions">
      <button id="assignExhibitionGalleryButton" class="adminButton" type="button">ASSIGN DRAFT</button>
      <button id="confirmExhibitionGalleryLayoutButton" class="adminButton" type="button">CONFIRM LAYOUT</button>
      <button id="publishExhibitionBundleButton" class="adminButton primary" type="button">PUBLISH EXHIBITION</button>
      <button id="unpublishExhibitionButton" class="adminButton danger" type="button">UNPUBLISH EXHIBITION</button>
      <button id="rollbackExhibitionBundleButton" class="adminButton" type="button">ROLLBACK PUBLICATION</button>
    </div>
    <div class="fieldMeta">Poster / cover is optional. Without one, public discovery uses the Exhibition title. Assignment changes the private Draft only; public cutover happens only through PUBLISH EXHIBITION.</div>`;
  anchor.insertAdjacentElement("afterend", wrap);
  document.getElementById("assignExhibitionGalleryButton")?.addEventListener("click", handleAssignExhibitionGallery);
  document.getElementById("confirmExhibitionGalleryLayoutButton")?.addEventListener("click", handleConfirmExhibitionGalleryLayout);
  document.getElementById("publishExhibitionBundleButton")?.addEventListener("click", handlePublishExhibitionBundle);
  document.getElementById("unpublishExhibitionButton")?.addEventListener("click", handleUnpublishExhibition);
  document.getElementById("rollbackExhibitionBundleButton")?.addEventListener("click", handleRollbackExhibitionBundle);
  return wrap;
}

function c24Binding(detail, channel) {
  return detail && detail.galleryBindings ? detail.galleryBindings[channel] || null : null;
}

function renderExhibitionPublishValidation(detail) {
  const box = document.getElementById("c25PublishValidation");
  if (!box) return;
  const validation = detail && detail.validation ? detail.validation : null;
  const blockers = validation && Array.isArray(validation.blockers) ? validation.blockers : [];
  const warnings = validation && Array.isArray(validation.warnings) ? validation.warnings : [];
  box.replaceChildren();
  box.classList.toggle("valid", !!(validation && validation.valid));
  box.classList.toggle("blocked", !!(validation && !validation.valid));

  const headline = document.createElement("strong");
  headline.textContent = validation && validation.valid ? "READY TO PUBLISH" : "PUBLICATION BLOCKED";
  box.appendChild(headline);

  if (!validation) {
    const line = document.createElement("div");
    line.textContent = "Publication validation is unavailable.";
    box.appendChild(line);
    return;
  }

  for (const blocker of blockers) {
    const line = document.createElement("div");
    line.textContent = `• ${String(blocker)}`;
    box.appendChild(line);
  }
  for (const warning of warnings) {
    const line = document.createElement("div");
    line.className = "warning";
    line.textContent = `• ${String(warning)}`;
    box.appendChild(line);
  }
  if (!blockers.length && !warnings.length) {
    const line = document.createElement("div");
    line.textContent = "No publication blockers.";
    box.appendChild(line);
  }
}

function renderExhibitionGalleryAssignment(detail) {
  ensureExhibitionGalleryAssignmentUi();
  if (!detail || !selectedExhibition || String(detail.exhibition && detail.exhibition.id) !== selectedExhibition.id) return;
  const draft = c24Binding(detail, "draft");
  const published = c24Binding(detail, "published");
  const previous = c24Binding(detail, "previous");
  const draftEl = document.getElementById("c24DraftGallery");
  const pubEl = document.getElementById("c24PublishedGallery");
  const prevEl = document.getElementById("c24PreviousGallery");
  if (draftEl) draftEl.textContent = galleryBindingLabel(draft);
  if (pubEl) pubEl.textContent = galleryBindingLabel(published);
  if (prevEl) prevEl.textContent = galleryBindingLabel(previous);

  const migration = detail.migration || null;
  const pending = isExhibitionGalleryMigrationPending(detail);
  const migrationEl = document.getElementById("c24GalleryMigration");
  if (migrationEl) {
    migrationEl.classList.toggle("resolved", !pending);
    migrationEl.textContent = pending
      ? "Gallery changed: spatial placement was reset. Rebuild/save the layout in this Gallery, then CONFIRM LAYOUT before publishing."
      : (migration && migration.status === "resolved" ? "Gallery migration layout confirmed." : "No pending Gallery migration.");
  }
  renderExhibitionPublishValidation(detail);

  const select = document.getElementById("exhibitionGalleryTarget");
  if (select) {
    select.innerHTML = "";
    const targets = Array.isArray(detail.availableVenues) ? detail.availableVenues : [];
    if (!targets.length) {
      const option = document.createElement("option"); option.value = ""; option.textContent = "No assignable Published Gallery Versions"; select.appendChild(option);
    } else {
      for (const venue of targets) {
        const version = venue && venue.publishedVersion;
        if (!venue || !version || !version.id) continue;
        const option = document.createElement("option");
        option.value = `${venue.id}|${version.id}`;
        option.textContent = `${venue.name || venue.slug} · ${version.version_number || version.id}`;
        option.dataset.venueId = venue.id;
        option.dataset.versionId = version.id;
        if (draft && String(draft.venueId) === String(venue.id) && String(draft.versionId) === String(version.id)) option.selected = true;
        select.appendChild(option);
      }
    }
  }
  const selectedOption = select && select.selectedOptions && select.selectedOptions[0];
  const sameTarget = !!(draft && selectedOption && selectedOption.dataset && String(draft.venueId) === String(selectedOption.dataset.venueId) && String(draft.versionId) === String(selectedOption.dataset.versionId));
  const assign = document.getElementById("assignExhibitionGalleryButton");
  const confirm = document.getElementById("confirmExhibitionGalleryLayoutButton");
  const publish = document.getElementById("publishExhibitionBundleButton");
  const unpublish = document.getElementById("unpublishExhibitionButton");
  const rollback = document.getElementById("rollbackExhibitionBundleButton");
  if (assign) assign.disabled = exhibitionGalleryMutationInFlight || !selectedOption || !selectedOption.dataset.venueId || sameTarget;
  if (confirm) confirm.disabled = exhibitionGalleryMutationInFlight || !pending;
  if (publish) publish.disabled = exhibitionGalleryMutationInFlight || pending || !(detail.validation && detail.validation.valid);
  if (unpublish) unpublish.disabled = exhibitionGalleryMutationInFlight || !selectedExhibition || !selectedExhibition.is_published;
  if (rollback) rollback.disabled = exhibitionGalleryMutationInFlight || !(detail.state && detail.state.previous_state && detail.card && detail.card.previous_value);
}

async function refreshExhibitionGalleryAssignment(exhibitionId) {
  if (!exhibitionId) return null;
  ensureExhibitionGalleryAssignmentUi();
  const request = ++exhibitionGalleryDetailRequest;
  try {
    if (!exhibitionData) exhibitionData = createExhibitionDataAdapter({ supabase, mode: "admin" });
    const detail = await exhibitionData.getAdminDetail(exhibitionId);
    if (request !== exhibitionGalleryDetailRequest || !selectedExhibition || selectedExhibition.id !== String(exhibitionId)) return detail;
    exhibitionGalleryDetail = detail;
    renderExhibitionGalleryAssignment(detail);
    return detail;
  } catch (error) {
    if (request === exhibitionGalleryDetailRequest) {
      const migrationEl = document.getElementById("c24GalleryMigration");
      if (migrationEl) { migrationEl.classList.remove("resolved"); migrationEl.textContent = `Gallery assignment unavailable: ${error.message || error}`; }
    }
    return null;
  }
}

function reloadAdminForExhibition(exhibitionId) {
  const id = String(exhibitionId || "").trim();
  const url = new URL(inlineWorkspaceMode ? "./admin.html" : location.href, location.href);
  url.searchParams.set("exhibition", id);
  url.searchParams.delete("section");
  url.searchParams.delete("gallery");
  location.href = url.href;
}

async function handleAssignExhibitionGallery() {
  if (!selectedExhibition || exhibitionGalleryMutationInFlight) return;
  const detail = exhibitionGalleryDetail || await refreshExhibitionGalleryAssignment(selectedExhibition.id);
  if (!detail) return;
  const select = document.getElementById("exhibitionGalleryTarget");
  const option = select && select.selectedOptions && select.selectedOptions[0];
  if (!option || !option.dataset.venueId || !option.dataset.versionId) return;
  const impact = summarizeGalleryMigrationImpact(detail.state && detail.state.draft_state);
  const affected = impact.artworks + impact.sculptures;
  const message = `Assign this Exhibition Draft to ${option.textContent}?\n\nGallery-specific placement will be reset${affected ? ` for ${affected} artwork/sculpture object(s)` : ""}. The current Published Exhibition will remain unchanged until PUBLISH EXHIBITION.`;
  if (!window.confirm(message)) return;
  if (!confirmAndDiscardAdminChanges("You have unsaved Admin changes. Discard them before changing Gallery?")) return;
  exhibitionGalleryMutationInFlight = true;
  renderExhibitionGalleryAssignment(detail);
  try {
    const result = await exhibitionData.assignGallery(selectedExhibition.id, { venueId: option.dataset.venueId, venueVersionId: option.dataset.versionId });
    if (result && result.changed === false) { showToast("Exhibition Draft is already assigned to this Gallery Version."); await refreshExhibitionGalleryAssignment(selectedExhibition.id); return; }
    showToast("Gallery assigned. Reopening Admin in the target Gallery…");
    reloadAdminForExhibition(selectedExhibition.id);
  } catch (error) {
    showToast(error.message || String(error));
  } finally {
    exhibitionGalleryMutationInFlight = false;
    if (exhibitionGalleryDetail) renderExhibitionGalleryAssignment(exhibitionGalleryDetail);
  }
}

async function handleConfirmExhibitionGalleryLayout() {
  if (!selectedExhibition || exhibitionGalleryMutationInFlight) return;
  if (hasSceneUnsavedChanges()) { showToast("Save the 3D layout before confirming Gallery migration."); return; }
  exhibitionGalleryMutationInFlight = true;
  if (exhibitionGalleryDetail) renderExhibitionGalleryAssignment(exhibitionGalleryDetail);
  try {
    await exhibitionData.confirmGalleryLayout(selectedExhibition.id);
    showToast("Gallery migration layout confirmed.");
    await refreshExhibitionGalleryAssignment(selectedExhibition.id);
  } catch (error) { showToast(error.message || String(error)); }
  finally { exhibitionGalleryMutationInFlight = false; if (exhibitionGalleryDetail) renderExhibitionGalleryAssignment(exhibitionGalleryDetail); }
}

async function handlePublishExhibitionBundle() {
  if (!selectedExhibition || exhibitionGalleryMutationInFlight) return;
  syncMetadataDirtyState();
  if (metadataDirty || hasSceneUnsavedChanges()) { showToast("Save Exhibition details and 3D changes before publishing."); return; }
  if (!window.confirm("Publish the current Exhibition Draft and its assigned Gallery Version? This is the explicit public cutover.")) return;
  exhibitionGalleryMutationInFlight = true;
  if (exhibitionGalleryDetail) renderExhibitionGalleryAssignment(exhibitionGalleryDetail);
  try {
    await exhibitionData.publishBundle(selectedExhibition.id);
    showToast("Exhibition published.");
    await fetchCatalog();
    syncSelectedFromCatalog(selectedExhibition.id);
    await refreshExhibitionGalleryAssignment(selectedExhibition.id);
  } catch (error) { showToast(error.message || String(error)); }
  finally { exhibitionGalleryMutationInFlight = false; if (exhibitionGalleryDetail) renderExhibitionGalleryAssignment(exhibitionGalleryDetail); }
}

async function handleUnpublishExhibition() {
  if (!selectedExhibition || exhibitionGalleryMutationInFlight || !selectedExhibition.is_published) return;
  if (!window.confirm("Hide this Exhibition from the public site? Draft, Published and Previous snapshots remain stored; this only changes public visibility/status.")) return;
  exhibitionGalleryMutationInFlight = true;
  if (exhibitionGalleryDetail) renderExhibitionGalleryAssignment(exhibitionGalleryDetail);
  try {
    if (!exhibitionData || typeof exhibitionData.unpublish !== "function") throw new Error("Explicit unpublish action is unavailable.");
    await exhibitionData.unpublish(selectedExhibition.id);
    showToast("Exhibition unpublished.");
    await fetchCatalog();
    syncSelectedFromCatalog(selectedExhibition.id);
    await refreshExhibitionGalleryAssignment(selectedExhibition.id);
  } catch (error) { showToast(error.message || String(error)); }
  finally { exhibitionGalleryMutationInFlight = false; if (exhibitionGalleryDetail) renderExhibitionGalleryAssignment(exhibitionGalleryDetail); }
}

async function handleRollbackExhibitionBundle() {
  if (!selectedExhibition || exhibitionGalleryMutationInFlight) return;
  if (!window.confirm("Rollback the public Exhibition to its Previous snapshot? The Draft authoring Gallery will not change.")) return;
  exhibitionGalleryMutationInFlight = true;
  if (exhibitionGalleryDetail) renderExhibitionGalleryAssignment(exhibitionGalleryDetail);
  try {
    await exhibitionData.rollbackBundle(selectedExhibition.id);
    showToast("Public Exhibition rolled back. Draft assignment was preserved.");
    await fetchCatalog();
    syncSelectedFromCatalog(selectedExhibition.id);
    await refreshExhibitionGalleryAssignment(selectedExhibition.id);
  } catch (error) { showToast(error.message || String(error)); }
  finally { exhibitionGalleryMutationInFlight = false; if (exhibitionGalleryDetail) renderExhibitionGalleryAssignment(exhibitionGalleryDetail); }
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
  if (exhibitionPublicationStatus) exhibitionPublicationStatus.textContent = selectedExhibition.is_published ? "PUBLISHED / PUBLIC" : "DRAFT / NOT PUBLIC";
  exhibitionSpaceId.textContent = selectedExhibition.space_id;
  const posterUrl = publicUrlFor(selectedExhibition.cover_path);
  posterPreview.src = posterUrl || "";
  posterPreview.style.visibility = posterUrl ? "visible" : "hidden";
  posterStatus.textContent = selectedExhibition.cover_path ? selectedExhibition.cover_path : "No poster assigned.";
  removePosterButton.disabled = !selectedExhibition.cover_path;
  updatePublicPageHref(selectedExhibition.id);
  setMetadataBaselineFromForm();
  renderCatalog();
  void refreshExhibitionGalleryAssignment(selectedExhibition.id);
}

function syncSelectedFromCatalog(id) {
  const found = catalog.find((item) => item.id === id) || null;
  if (found) setSelectedExhibition(found);
  return found;
}

async function selectAndSwitchExhibition(id) {
  const target = catalog.find((item) => item.id === id);
  if (!target || isTransitionGuardActive()) return;
  if (!engineReady || !window.GalleryApp || !sceneLifecycleController) {
    setSelectedExhibition(target);
    updateUrlExhibition(id);
    if (!sceneLifecycleController && !inlineWorkspaceMode) reloadAdminForExhibition(id);
    return;
  }
  const current = window.GalleryApp.getActiveExhibition();
  if (current && current.id === id) {
    setSelectedExhibition(target);
    return;
  }
  if (!confirmAndDiscardAdminChanges("You have unsaved Admin changes. Discard them and switch exhibition?")) return;
  if (!exhibitionData) exhibitionData = createExhibitionDataAdapter({ supabase, mode: "admin" });
  if (typeof exhibitionData.setMode === "function") exhibitionData.setMode("admin");

  let targetRuntime = null;
  try {
    targetRuntime = await exhibitionData.resolveRuntime(id, { force: true });
  } catch (error) {
    showToast("Could not resolve target Exhibition: " + (error.message || error));
    return;
  }
  const currentRuntime = sceneLifecycleController.getActiveRuntime();
  const crossSpace = getRuntimeVenueVersionKey(currentRuntime) !== getRuntimeVenueVersionKey(targetRuntime);
  setViewportStatus(`${crossSpace ? "opening" : "switching to"} ${target.name}…`);
  const transitionBefore = await getExhibitionAssetDeliveryStats().catch(() => null);
  const fromId = current && current.id ? current.id : "?";
  const guardToken = await beginTransitionGuard({
    title: `Switching to ${target.name}…`,
    detail: crossSpace ? "Recreating the Gallery Scene on the existing WebGL engine." : "Keeping the current immutable Gallery Version resident.",
    minVisibleMs: 150
  });
  if (!guardToken) return;
  const transitionStartedAt = performance.now();
  try {
    const result = await sceneLifecycleController.switchTo(id, {
      runtime: targetRuntime,
      forceRemote: true,
      reason: "admin-exhibition-switch",
      sceneOptions: { adminWorkspace: true }
    });
    if (!result || !result.ok) return;
    scene = sceneLifecycleController.getActiveScene();
    if (inlineRuntimeContext) inlineRuntimeContext.scene = scene;
    window.galleryEditorAuthenticated = true;
    if (window.GalleryApp) {
      if (typeof window.GalleryApp.setExhibitionDataMode === "function") window.GalleryApp.setExhibitionDataMode("admin");
      if (typeof window.GalleryApp.setEditorAuthenticated === "function") window.GalleryApp.setEditorAuthenticated(true);
      if (typeof window.GalleryApp.enterAdminWorkspaceMode === "function") window.GalleryApp.enterAdminWorkspaceMode();
    }
    if (!crossSpace && typeof window.GalleryApp.waitForForegroundReady === "function") {
      await window.GalleryApp.waitForForegroundReady(`switch:${fromId}->${id}`, { pendingTimeoutMs: 7000, quietTimeoutMs: 3600 });
    }
    updateUrlExhibition(id);
    setSelectedExhibition(catalog.find((item) => item.id === id) || target);
    setViewportStatus(target.name);
    if (engine && engine.resize) engine.resize();
    void captureExhibitionTransitionDiagnostic(transitionBefore, transitionStartedAt, fromId, id)
      .then(() => updateAssetDeliveryStatus())
      .catch(() => null);
  } catch (error) {
    scene = sceneLifecycleController.getActiveScene();
    if (inlineRuntimeContext) inlineRuntimeContext.scene = scene;
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

function installResize() {
  if (resizeCleanup) resizeCleanup();
  let raf = 0;
  let observer = null;
  const resize = () => {
    if (!workspaceActive || raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!workspaceActive) return;
      const stage = el("adminViewportStage");
      if (stage) document.documentElement.style.setProperty("--gallery-visual-viewport-height", `${Math.max(1, stage.getBoundingClientRect().height)}px`);
      if (engine) engine.resize();
    });
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
  setViewportStatus("starting…");

  if (inlineWorkspaceMode) {
    engine = inlineRuntimeContext.engine;
    sceneLifecycleController = inlineRuntimeContext.lifecycle || window.ExhibitionPlatformSceneLifecycle || sceneLifecycleController;
    scene = sceneLifecycleController && typeof sceneLifecycleController.getActiveScene === "function"
      ? sceneLifecycleController.getActiveScene()
      : inlineRuntimeContext.scene;
    inlineRuntimeContext.scene = scene;
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
      setViewportStatus(activeInline.name);
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
  galleryEngineModule = await import(`../Gallery_V0_11.min.js?v=${ENGINE_CACHE_KEY}`);
  let initialRuntime = exhibitionData && typeof exhibitionData.getRuntime === "function"
    ? exhibitionData.getRuntime(initialId, { mode: "admin" })
    : null;
  if (!initialRuntime) initialRuntime = await resolveInitialAdminRuntime(supabase, initialId);
  if (!exhibitionData) exhibitionData = createExhibitionDataAdapter({ supabase, mode: "admin", initialRuntime });
  if (typeof exhibitionData.setMode === "function") exhibitionData.setMode("admin");
  window.ExhibitionPlatformDataAdapter = exhibitionData;
  engine = new window.BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: false, stencil: true, antialias: true, powerPreference: "high-performance", adaptToDeviceRatio: false
  });
  sceneLifecycleController = createSceneLoadingOrchestrator({
    engine,
    canvas,
    engineModule: galleryEngineModule,
    exhibitionData,
    resolveRuntime: (reference, options = {}) => exhibitionData.resolveRuntime(reference, Object.assign({ mode: "admin" }, options)),
    getApp: () => window.GalleryApp || null,
    getCreateSceneOptions: () => ({ adminWorkspace: true }),
    onSceneChanged: (nextScene) => {
      scene = nextScene;
      if (inlineRuntimeContext) inlineRuntimeContext.scene = nextScene;
    }
  });
  window.ExhibitionPlatformSceneLoading = sceneLifecycleController;
  window.ExhibitionPlatformSceneLifecycle = sceneLifecycleController;
  const started = await sceneLifecycleController.start(initialRuntime, {
    initialSnapshot: initialSnapshot || null,
    sceneOptions: { adminWorkspace: true }
  });
  scene = started.scene;
  engine.runRenderLoop(() => {
    const current = sceneLifecycleController && typeof sceneLifecycleController.getActiveScene === "function"
      ? sceneLifecycleController.getActiveScene()
      : scene;
    if (!current) return;
    try {
      if (typeof current.isDisposed === "function" && current.isDisposed()) return;
      current.render();
    } catch (error) {
      if (!(typeof current.isDisposed === "function" && current.isDisposed())) console.error("Admin render loop error:", error);
    }
  });
  installResize();
  window.galleryEditorAuthenticated = true;
  if (window.GalleryApp) {
    if (typeof window.GalleryApp.setExhibitionDataMode === "function") window.GalleryApp.setExhibitionDataMode("admin");
    window.GalleryApp.setEditorAuthenticated(true);
    window.GalleryApp.hideViewerIntroOverlay();
    if (typeof window.GalleryApp.enterAdminWorkspaceMode === "function") window.GalleryApp.enterAdminWorkspaceMode();
    else window.GalleryApp.setEditMode(true);
  }
  engineReady = true;
  workspaceLoading.classList.add("hidden");
  const active = window.GalleryApp.getActiveExhibition();
  setViewportStatus(active.name);
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
  setViewportStatus(record.name);
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
  if (ok && selectedExhibition) void refreshExhibitionGalleryAssignment(selectedExhibition.id);
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
// C6C8C22.1 — Gallery Management browser-smoke hardening
// Injected into both standalone admin.html and the same-runtime inline Admin shell.
// -----------------------------------------------------------------------------
function galleryEl(id) { return document.getElementById(id); }

function ensureGalleryManagementStyles() {
  if (document.getElementById("c22GalleryManagementStyles")) return;
  const style = document.createElement("style");
  style.id = "c22GalleryManagementStyles";
  style.textContent = `
    .adminSectionTabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding:12px 14px 0}
    .adminSectionTabs,.galleryManagementSection{--gallery-admin-text:rgba(255,255,255,.92);--gallery-admin-muted:rgba(255,255,255,.62);--gallery-admin-line:rgba(255,255,255,.10);color:var(--gallery-admin-text)}
    .adminSectionTab{height:36px;border:1px solid var(--gallery-admin-line);border-radius:10px;background:rgba(255,255,255,.035);color:var(--gallery-admin-muted);font-size:10px;font-weight:800;letter-spacing:.08em;cursor:pointer}
    .adminSectionTab.active{background:rgba(125,160,127,.16);border-color:rgba(154,180,155,.38);color:var(--gallery-admin-text)}
    .galleryManagementSection.hidden{display:none!important}.exhibitionManagementSection.hidden{display:none!important}
    #galleryCreateForm{display:grid;gap:8px}.galleryList{display:grid;gap:7px;max-height:300px;overflow:auto;padding-right:2px}
    .galleryRow{width:100%;display:grid;gap:4px;text-align:left;padding:10px;border:1px solid transparent;border-radius:10px;background:transparent;color:inherit;cursor:pointer}
    .galleryRow:hover{background:rgba(255,255,255,.045)}.galleryRow.active{border-color:rgba(154,180,155,.38);background:rgba(125,160,127,.16)}
    .galleryRow strong{font-size:12px}.galleryRow span{font-size:10px;color:var(--gallery-admin-muted);line-height:1.4}
    #galleryDetailBody{display:grid;gap:13px}.gallerySubsection{display:grid;gap:9px;padding-top:4px}.gallerySubsection+.gallerySubsection{border-top:1px solid var(--gallery-admin-line);padding-top:13px}
    .gallerySubsection h3{margin:0;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--gallery-admin-text)}
    .galleryVersionLine{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px;border:1px solid var(--gallery-admin-line);border-radius:10px;background:rgba(255,255,255,.025);font-size:10px}
    .galleryActions{display:flex;flex-wrap:wrap;gap:7px}.galleryAssetGrid{display:grid;gap:7px}.galleryAssetRow{display:grid;grid-template-columns:64px minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px;border:1px solid var(--gallery-admin-line);border-radius:10px}
    .galleryAssetRole{font-size:10px;font-weight:800;text-transform:uppercase}.galleryAssetMeta{min-width:0;font-size:10px;color:var(--gallery-admin-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .galleryAssetInput{display:none}.galleryEntryGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.galleryEntryLabel{display:grid;gap:4px;font-size:9px;color:var(--gallery-admin-muted);text-transform:uppercase}
    .galleryValidation{padding:9px 10px;border:1px solid var(--gallery-admin-line);border-radius:10px;font-size:10px;line-height:1.5;color:var(--gallery-admin-muted)}.galleryValidation.valid{border-color:rgba(127,169,130,.45);background:rgba(127,169,130,.08)}.galleryValidation.invalid{border-color:rgba(209,139,139,.45);background:rgba(209,139,139,.06)}
    .galleryHistory{display:grid;gap:6px}.galleryHistoryItem{display:flex;justify-content:space-between;gap:10px;font-size:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.06)}
    .galleryMuted{color:var(--gallery-admin-muted);font-size:10px;line-height:1.45}.galleryDangerNote{color:#d7a0a0;font-size:10px;line-height:1.45}
    .galleryRenderError{display:grid;gap:9px;padding:12px;border:1px solid rgba(209,139,139,.45);border-radius:10px;background:rgba(209,139,139,.06);font-size:10px;line-height:1.5}
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

function clearGalleryUrl() {
  try {
    const url = new URL(location.href);
    url.searchParams.delete("section");
    url.searchParams.delete("gallery");
    url.searchParams.delete("assetHost");
    url.searchParams.delete("asset");
    url.searchParams.delete("assetType");
    history.replaceState(null, "", url);
  } catch (_error) {}
}

function getAssetRequestedState() {
  try {
    const params = new URLSearchParams(location.search);
    const host = params.get("assetHost") === "galleries" || (!params.get("assetHost") && !!params.get("gallery")) ? "galleries" : "exhibitions";
    const filter = ["prop","frame"].includes(params.get("assetType")) ? params.get("assetType") : null;
    return { host, assetId: params.get("asset") || "", filter };
  } catch (_error) { return { host: "exhibitions", assetId: "", filter: null }; }
}

function updateAssetsUrl({ assetId = null, filter = null } = {}) {
  try {
    const url = new URL(location.href);
    url.searchParams.set("section", "assets");
    url.searchParams.set("assetHost", assetWorkspaceHost);
    if (assetWorkspaceHost !== "galleries") url.searchParams.delete("gallery");
    else if (selectedGalleryDetail && selectedGalleryDetail.venue && selectedGalleryDetail.venue.id) url.searchParams.set("gallery", selectedGalleryDetail.venue.id);
    if (assetId) url.searchParams.set("asset", assetId); else url.searchParams.delete("asset");
    if (filter === "prop" || filter === "frame") url.searchParams.set("assetType", filter); else url.searchParams.delete("assetType");
    history.replaceState(null, "", url);
  } catch (_error) {}
}

function clearAssetUrlState() {
  try {
    const url = new URL(location.href);
    url.searchParams.delete("assetHost");
    url.searchParams.delete("asset");
    url.searchParams.delete("assetType");
    history.replaceState(null, "", url);
  } catch (_error) {}
}

function currentPreviewContextSection() {
  return adminWorkspaceSection === "assets" ? assetWorkspaceHost : adminWorkspaceSection;
}

function galleryPublishedVersion(detail) {
  if (!detail || !detail.venue) return null;
  return (detail.versions || []).find((item) => item.id === detail.venue.published_version_id) || null;
}

function galleryDraftVersion(detail) {
  if (!detail || !detail.venue) return null;
  return (detail.versions || []).find((item) => item.id === detail.venue.draft_version_id) || null;
}

function galleryWorkingVersion(detail) {
  if (!detail || !detail.venue) return null;
  const published = galleryPublishedVersion(detail);
  const draft = galleryDraftVersion(detail);
  if (detail.canManage === true) return draft || published || null;
  return published || null;
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

function galleryEntrySnapshot() {
  const read = (prefix) => ({
    x: galleryEl(`${prefix}X`) ? galleryEl(`${prefix}X`).value : "",
    y: galleryEl(`${prefix}Y`) ? galleryEl(`${prefix}Y`).value : "",
    z: galleryEl(`${prefix}Z`) ? galleryEl(`${prefix}Z`).value : ""
  });
  return JSON.stringify({ position: read("galleryEntryPos"), target: read("galleryEntryTarget") });
}

function syncGalleryMetadataDirty() {
  galleryMetadataDirty = !!(selectedGalleryDetail && galleryMetadataBaseline && galleryMetadataSnapshot() !== galleryMetadataBaseline);
  const button = galleryEl("saveGalleryDetailsButton");
  if (button) button.dataset.dirty = galleryMetadataDirty ? "true" : "false";
  return galleryMetadataDirty;
}

function syncGalleryEntryDirty() {
  galleryEntryDirty = !!(selectedGalleryDetail && galleryEntryBaseline && galleryEntrySnapshot() !== galleryEntryBaseline);
  const button = galleryEl("saveGalleryEntryButton");
  if (button) button.dataset.dirty = galleryEntryDirty ? "true" : "false";
  return galleryEntryDirty;
}

function restoreGalleryMetadataBaseline() {
  if (!galleryMetadataBaseline) return;
  try {
    const baseline = JSON.parse(galleryMetadataBaseline);
    const name = galleryEl("galleryName");
    const description = galleryEl("galleryDescription");
    if (name) name.value = baseline.name || "";
    if (description) description.value = baseline.description || "";
  } catch (_error) {}
  galleryMetadataDirty = false;
  syncGalleryMetadataDirty();
}

function restoreGalleryEntryBaseline() {
  if (!galleryEntryBaseline) return;
  try {
    const baseline = JSON.parse(galleryEntryBaseline);
    ["X","Y","Z"].forEach((axis) => {
      const key = axis.toLowerCase();
      const pos = galleryEl(`galleryEntryPos${axis}`);
      const target = galleryEl(`galleryEntryTarget${axis}`);
      if (pos) pos.value = baseline.position && baseline.position[key] !== undefined ? baseline.position[key] : "";
      if (target) target.value = baseline.target && baseline.target[key] !== undefined ? baseline.target[key] : "";
    });
  } catch (_error) {}
  galleryEntryDirty = false;
  syncGalleryEntryDirty();
}

function discardGalleryFormDraft() {
  restoreGalleryMetadataBaseline();
  restoreGalleryEntryBaseline();
  galleryMetadataDirty = false;
  galleryEntryDirty = false;
  return true;
}

function confirmAndDiscardGalleryFormChanges(message) {
  syncGalleryMetadataDirty();
  syncGalleryEntryDirty();
  if (!galleryMetadataDirty && !galleryEntryDirty) return true;
  if (!window.confirm(message || "Gallery has unsaved changes. Discard them?")) return false;
  return discardGalleryFormDraft();
}

function setGalleryMutationBusy(busy) {
  galleryMutationInFlight = !!busy;
  document.querySelectorAll(".galleryManagementSection button").forEach((button) => {
    if (busy) {
      if (!Object.prototype.hasOwnProperty.call(button.dataset, "galleryBusyWasDisabled")) {
        button.dataset.galleryBusyWasDisabled = button.disabled ? "1" : "0";
      }
      button.disabled = true;
    } else if (Object.prototype.hasOwnProperty.call(button.dataset, "galleryBusyWasDisabled")) {
      button.disabled = button.dataset.galleryBusyWasDisabled === "1";
      delete button.dataset.galleryBusyWasDisabled;
    }
  });
}

async function withGalleryMutation(button, busyLabel, operation) {
  if (galleryMutationInFlight) return null;
  const originalText = button ? button.textContent : "";
  setGalleryMutationBusy(true);
  if (button && busyLabel) button.textContent = busyLabel;
  try {
    return await operation();
  } finally {
    setGalleryMutationBusy(false);
    if (button && button.isConnected && originalText) button.textContent = originalText;
  }
}

async function ensureGalleryManagementApi() {
  if (!galleryManagement) galleryManagement = createGalleryManagementApi({ supabase });
  if (!galleryAdminContext) galleryAdminContext = await galleryManagement.getAdminContext();
  return galleryManagement;
}

function applyAdminWorkspaceVisibility(section) {
  document.querySelectorAll(".exhibitionManagementSection").forEach((node) => node.classList.toggle("hidden", section !== "exhibitions"));
  document.querySelectorAll(".galleryManagementSection").forEach((node) => node.classList.toggle("hidden", section !== "galleries"));
  document.querySelectorAll(".adminSectionTab").forEach((node) => node.classList.toggle("active", node.dataset.section === section));
  if (assetWorkspace) {
    if (section === "assets" && session) {
      const requested = getAssetRequestedState();
      void assetWorkspace.show({ hostSection: assetWorkspaceHost, returnSection: assetWorkspaceReturnSection, selectedAssetId: requested.assetId || null, filter: requested.filter || null })
        .catch((error) => showToast(error.message || String(error)));
    } else assetWorkspace.hide();
  }
  if (saveStateButton) {
    const sceneEditContext = section === "exhibitions" || (section === "assets" && assetWorkspaceHost === "exhibitions");
    saveStateButton.style.display = sceneEditContext ? "" : "none";
  }
}

function setAdminWorkspaceSection(section, { skipConfirm = false, assetHost = null } = {}) {
  const next = ["exhibitions", "galleries", "assets"].includes(section) ? section : "exhibitions";
  if (adminWorkspaceSection === next) return true;

  // V13.3: ASSETS is a sidebar tool, not a 3D preview context. Entering it from
  // Exhibition or Gallery preserves the live Scene, selection and unsaved forms.
  if (next === "assets") {
    const host = assetHost === "galleries" || assetHost === "exhibitions"
      ? assetHost
      : (adminWorkspaceSection === "galleries" ? "galleries" : adminWorkspaceSection === "exhibitions" ? "exhibitions" : assetWorkspaceHost);
    assetWorkspaceHost = host;
    assetWorkspaceReturnSection = host;
    adminWorkspaceSection = "assets";
    applyAdminWorkspaceVisibility("assets");
    const requested = getAssetRequestedState();
    updateAssetsUrl({ assetId: requested.assetId || null, filter: requested.filter || null });
    return true;
  }

  // Returning from Assets to its host is also UI-only. Do not invoke discard
  // prompts or scene lifecycle work for a round-trip that did not change preview.
  if (adminWorkspaceSection === "assets" && next === assetWorkspaceHost) {
    adminWorkspaceSection = next;
    applyAdminWorkspaceVisibility(next);
    clearAssetUrlState();
    if (next === "galleries") updateGalleryUrl(selectedGalleryDetail && selectedGalleryDetail.venue ? selectedGalleryDetail.venue.id : getGalleryRequestedId());
    else clearGalleryUrl();
    return true;
  }

  // Every other transition changes the central preview context and retains the
  // existing destructive unsaved-change guard.
  syncMetadataDirtyState();
  syncGalleryMetadataDirty();
  syncGalleryEntryDirty();
  if (!skipConfirm && hasAnyAdminUnsavedChanges()) {
    if (!window.confirm("You have unsaved Admin changes. Discard them and switch preview context?")) return false;
    discardAdminUnsavedChanges();
  }

  adminWorkspaceSection = next;
  assetWorkspaceReturnSection = next;
  applyAdminWorkspaceVisibility(next);
  clearAssetUrlState();
  if (next === "galleries") {
    updateGalleryUrl(selectedGalleryDetail && selectedGalleryDetail.venue ? selectedGalleryDetail.venue.id : getGalleryRequestedId());
    if (session) void loadGalleryCatalog().then(() => previewSelectedGallery("admin-gallery-section")).catch((error) => showToast(error.message || String(error)));
  } else {
    clearGalleryUrl();
    void restoreSelectedExhibitionPreview("admin-exhibition-section").catch((error) => showToast(error.message || String(error)));
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
  tabs.innerHTML = '<button type="button" class="adminSectionTab active" data-section="exhibitions">EXHIBITIONS</button><button type="button" class="adminSectionTab" data-section="galleries">GALLERIES</button><button type="button" class="adminSectionTab" data-section="assets">ASSETS</button>';
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

  assetWorkspace = createAdminAssetWorkspace({
    supabase,
    sidebar,
    showToast,
    loadVenueOptions: async () => {
      await ensureGalleryManagementApi();
      if (!galleryCatalog.length) galleryCatalog = await galleryManagement.list();
      return galleryCatalog;
    },
    getPlacementContext: () => {
      if (assetWorkspaceHost !== "exhibitions" || !selectedExhibition) return null;
      // V13.3 hardening: the live Babylon runtime is authoritative for placement identity.
      // The assignment detail remains a fallback only while the scene bridge is unavailable.
      const liveExhibition = window.GalleryApp && typeof window.GalleryApp.getActiveExhibition === "function"
        ? window.GalleryApp.getActiveExhibition()
        : null;
      const liveSpace = window.GalleryApp && typeof window.GalleryApp.getSpaceDefinition === "function"
        ? window.GalleryApp.getSpaceDefinition()
        : null;
      const detail = exhibitionGalleryDetail;
      const draftBinding = detail ? c24Binding(detail, "draft") : null;
      return {
        exhibitionId: liveExhibition && liveExhibition.id ? liveExhibition.id : selectedExhibition.id,
        venueId: liveSpace && liveSpace.venueId ? liveSpace.venueId : (draftBinding && draftBinding.venueId ? draftBinding.venueId : null),
        venueVersionId: liveSpace && liveSpace.venueVersionId ? liveSpace.venueVersionId : (draftBinding && draftBinding.versionId ? draftBinding.versionId : null)
      };
    },
    onBeginPropPlacement: async (descriptor, options = {}) => {
      if (assetWorkspaceHost !== "exhibitions") throw new Error("Prop placement requires an active Exhibition.");
      if (!window.GalleryApp || typeof window.GalleryApp.beginSharedAssetPropPlacement !== "function") throw new Error("Live Gallery Prop placement bridge is unavailable.");
      const result = await window.GalleryApp.beginSharedAssetPropPlacement(descriptor, options || {});
      return result !== false;
    },
    onCancelPropPlacement: (options = {}) => {
      if (window.GalleryApp && typeof window.GalleryApp.cancelSharedAssetPropPlacement === "function") window.GalleryApp.cancelSharedAssetPropPlacement(options || {});
    },
    getFrameBindingContext: () => {
      if (assetWorkspaceHost !== "exhibitions" || !window.GalleryApp || typeof window.GalleryApp.getSelectedArtworkFrameBindingContext !== "function") return null;
      return window.GalleryApp.getSelectedArtworkFrameBindingContext();
    },
    onBeginFrameDrag: async (descriptor, options = {}) => {
      if (assetWorkspaceHost !== "exhibitions") throw new Error("Frame assignment requires an active Exhibition.");
      if (!window.GalleryApp || typeof window.GalleryApp.beginSharedAssetFrameDrag !== "function") throw new Error("Live Gallery Frame binding bridge is unavailable.");
      return window.GalleryApp.beginSharedAssetFrameDrag(descriptor, options || {});
    },
    onCancelFrameDrag: () => {
      if (window.GalleryApp && typeof window.GalleryApp.cancelSharedAssetFrameDrag === "function") window.GalleryApp.cancelSharedAssetFrameDrag();
    },
    onBindFrame: async (descriptor, options = {}) => {
      if (assetWorkspaceHost !== "exhibitions") throw new Error("Frame assignment requires an active Exhibition.");
      if (!window.GalleryApp || typeof window.GalleryApp.applySharedAssetFrameToSelectedArtwork !== "function") throw new Error("Live Gallery Frame binding bridge is unavailable.");
      return window.GalleryApp.applySharedAssetFrameToSelectedArtwork(descriptor, options || {});
    },
    onFrameBindingComplete: () => {
      setAdminWorkspaceSection("exhibitions", { skipConfirm: true });
    },
    onUiStateChange: (uiState) => {
      if (adminWorkspaceSection !== "assets") return;
      updateAssetsUrl({ assetId: uiState && uiState.selectedAssetId, filter: uiState && uiState.filter });
    }
  });

  // V13.4: inline Admin can be mounted again in the same document. Keep exactly
  // one global Frame-browser bridge so a remount cannot double-apply a Frame.
  if (window.__exhibitionPlatformOpenFrameBrowserHandler) {
    window.removeEventListener("exhibition-platform:open-frame-browser", window.__exhibitionPlatformOpenFrameBrowserHandler);
  }
  const openFrameBrowserHandler = (event) => {
    try {
      const target = event && event.detail && typeof event.detail === "object" ? event.detail : null;
      if (!target || !target.artworkId || !selectedExhibition) throw new Error("Select an artwork in an active Exhibition first.");
      assetWorkspaceHost = "exhibitions";
      assetWorkspaceReturnSection = "exhibitions";
      assetWorkspace.beginFrameBinding(target);
      updateAssetsUrl({ filter: "frame" });
      setAdminWorkspaceSection("assets", { skipConfirm: true, assetHost: "exhibitions" });
    } catch (error) { showToast(error && error.message ? error.message : String(error)); }
  };
  window.__exhibitionPlatformOpenFrameBrowserHandler = openFrameBrowserHandler;
  window.addEventListener("exhibition-platform:open-frame-browser", openFrameBrowserHandler);

  galleryEl("refreshGalleriesButton").addEventListener("click", handleRefreshGalleries);
  galleryEl("galleryCreateForm").addEventListener("submit", handleCreateGallery);

  let initialSection = "exhibitions";
  try {
    const params = new URLSearchParams(location.search);
    if (params.get("section") === "galleries") initialSection = "galleries";
    else if (params.get("section") === "assets") initialSection = "assets";
  } catch (_error) {}
  if (initialSection === "galleries") setAdminWorkspaceSection("galleries", { skipConfirm: true });
  else if (initialSection === "assets") {
    const requested = getAssetRequestedState();
    assetWorkspaceHost = requested.host;
    assetWorkspaceReturnSection = requested.host;
    setAdminWorkspaceSection("assets", { skipConfirm: true, assetHost: requested.host });
  }
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
  list.replaceChildren();
  const canCreate = !!(galleryAdminContext && Array.isArray(galleryAdminContext.capabilities) && galleryAdminContext.capabilities.includes("venue.create"));
  const createForm = galleryEl("galleryCreateForm");
  if (createForm) createForm.style.display = canCreate ? "grid" : "none";
  if (!galleryCatalog.length) {
    const empty = document.createElement("div");
    empty.className = "fieldMeta";
    empty.textContent = "No Galleries found.";
    list.appendChild(empty);
    return;
  }
  galleryCatalog.forEach((item) => {
    const versions = Array.isArray(item.versions) ? item.versions : [];
    const published = versions.find((v) => v.id === item.published_version_id);
    const draft = versions.find((v) => v.id === item.draft_version_id);
    const row = document.createElement("button");
    row.type = "button";
    row.className = "galleryRow" + (selectedGalleryDetail && selectedGalleryDetail.venue.id === item.id ? " active" : "");
    const title = document.createElement("strong");
    title.textContent = item.name || item.slug || "Untitled Gallery";
    const meta = document.createElement("span");
    meta.textContent = `${item.status === "archived" ? "Archived" : published ? `Published ${published.version_number}` : "Not published"}${draft ? ` · Draft ${draft.version_number}` : ""} · Exhibitions ${Number(item.exhibition_count) || 0}`;
    row.append(title, meta);
    row.addEventListener("click", () => { void selectGallery(item.id).catch((error) => showToast(error.message || String(error))); });
    list.appendChild(row);
  });
}

function createGalleryAuthoringPreviewAdapter(runtime) {
  const exhibition = runtime.exhibition;
  return Object.freeze({
    setMode() {},
    async list() { return [exhibition]; },
    async resolve() { return exhibition; },
    async loadState() { return null; },
    async saveState() { throw new Error("Gallery authoring preview is read-only for Exhibition state."); },
    async updateMetadata() { throw new Error("Gallery authoring preview does not edit Exhibition metadata."); },
    async create() { throw new Error("Gallery authoring preview cannot create Exhibitions."); }
  });
}

function buildGalleryAuthoringPreviewRuntime(detail) {
  if (!detail || !detail.venue) throw new Error("Gallery preview requires Gallery details.");
  const version = galleryWorkingVersion(detail);
  if (!version) throw new Error("Gallery has no Draft or Published Version to preview.");
  const spaceDefinition = buildAuthoringSpaceDefinition({
    supabase, venue: detail.venue, venueVersion: version, manifest: version.manifest || {}, assets: Array.isArray(version.assets) ? version.assets : []
  });
  const exhibition = {
    id: `gallery-preview-${detail.venue.id}`, name: `${detail.venue.name || detail.venue.slug || "Gallery"} preview`,
    slug: `gallery-preview-${detail.venue.slug || detail.venue.id}`, description: "", cover_path: null, is_published: false, sort_order: 0,
    storage_prefix: `gallery-preview/${detail.venue.id}`, space_id: detail.venue.slug || spaceDefinition.id, venue_id: detail.venue.id,
    venue_version_id: version.id, venue_version_number: version.version_number || spaceDefinition.version
  };
  return { context: "gallery-authoring", mode: "admin", exhibition, venue: detail.venue, venueVersion: version, spaceDefinition };
}

async function previewSelectedGallery(reason = "admin-gallery-selection") {
  if (!engineReady || !sceneLifecycleController || !selectedGalleryDetail) return false;
  const runtime = buildGalleryAuthoringPreviewRuntime(selectedGalleryDetail);
  const adapter = createGalleryAuthoringPreviewAdapter(runtime);
  const venue = selectedGalleryDetail.venue;
  const version = galleryWorkingVersion(selectedGalleryDetail);
  setViewportStatus(`${venue.name || venue.slug} · ${version ? version.version_number : "preview"} · Gallery Draft preview`);
  const result = await sceneLifecycleController.switchTo(runtime.exhibition.id, {
    runtime, forceRemote: false, reason,
    sceneOptions: { adminWorkspace: false, authoringSpacePreview: true, exhibitionData: adapter }
  });
  if (!result || !result.ok) return false;
  galleryAuthoringPreviewActive = true;
  scene = sceneLifecycleController.getActiveScene();
  if (inlineRuntimeContext) inlineRuntimeContext.scene = scene;
  if (engine && engine.resize) engine.resize();

  // V14.1.4 — assigned authoring assets are allowed to fail terminally, but that
  // failure must be visible instead of being hidden behind generic READY.
  const policyDebug = window.GalleryApp && typeof window.GalleryApp.getSceneLoadingPolicyDebug === "function"
    ? window.GalleryApp.getSceneLoadingPolicyDebug()
    : null;
  const authoringSettle = policyDebug && policyDebug.authoringPreviewSettle ? policyDebug.authoringPreviewSettle : null;
  const failedAssigned = authoringSettle && Array.isArray(authoringSettle.failed) ? authoringSettle.failed : [];
  if (failedAssigned.length) {
    const failedLabel = failedAssigned.map((role) => role === "wall" ? "Walls" : role.charAt(0).toUpperCase() + role.slice(1)).join(", ");
    setViewportStatus(`${venue.name || venue.slug} · Gallery Draft preview · unavailable: ${failedLabel}`);
    showToast(`Gallery preview is partial. Assigned asset failed to load: ${failedLabel}.`);
  }
  return true;
}

async function restoreSelectedExhibitionPreview(reason = "admin-gallery-exit") {
  if (!galleryAuthoringPreviewActive || !selectedExhibition || !engineReady || !sceneLifecycleController) return true;
  galleryAuthoringPreviewActive = false;
  await selectAndSwitchExhibition(selectedExhibition.id);
  return true;
}

async function selectGallery(venueId, { skipConfirm = false } = {}) {
  syncGalleryMetadataDirty();
  syncGalleryEntryDirty();
  if (!skipConfirm && (galleryMetadataDirty || galleryEntryDirty) && !window.confirm("Gallery has unsaved changes. Discard them and open another Gallery?")) return;
  if (!skipConfirm && (galleryMetadataDirty || galleryEntryDirty)) discardGalleryFormDraft();
  await ensureGalleryManagementApi();
  selectedGalleryDetail = await galleryManagement.get(venueId);
  renderGalleryDetail(selectedGalleryDetail);
  renderGalleryCatalog();
  updateGalleryUrl(venueId);
  if (engineReady && currentPreviewContextSection() === "galleries") {
    try { await previewSelectedGallery("admin-gallery-select"); } catch (error) { showToast(`Gallery preview failed: ${error.message || error}`); }
  }
}

function renderGalleryDetailError(body, error) {
  body.replaceChildren();
  const box = document.createElement("div");
  box.className = "galleryRenderError";
  const title = document.createElement("strong");
  title.textContent = "Gallery details could not be rendered.";
  const message = document.createElement("div");
  message.textContent = "The Gallery panel stopped before it was fully initialized. Retry after the current deployment has finished, and inspect the browser console if the problem repeats.";
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "adminButton";
  retry.textContent = "RETRY GALLERY";
  retry.addEventListener("click", () => { void refreshSelectedGallery().catch((retryError) => showToast(retryError.message || String(retryError))); });
  box.append(title, message, retry);
  body.appendChild(box);
  console.error("[C6C8C22.1] Gallery Management render failed", error);
  showToast("Gallery details failed to render.");
}

function renderGalleryDetail(detail) {
  const body = galleryEl("galleryDetailBody");
  if (!body || !detail || !detail.venue) return;
  try {
    const venue = detail.venue;
    const canManage = detail.canManage === true;
    const metadataEditable = canManage && venue.status !== "archived";
    const draft = galleryDraftVersion(detail);
    const published = galleryPublishedVersion(detail);
    const working = galleryWorkingVersion(detail);
    const entryEditable = canManage && !!draft && venue.status !== "archived";
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
        <label class="fieldLabel">Name<input id="galleryName" class="adminInput" maxlength="120" required ${metadataEditable ? "" : "readonly"}></label>
        <label class="fieldLabel">Description<textarea id="galleryDescription" class="adminTextarea" maxlength="4000" ${metadataEditable ? "" : "readonly"}></textarea></label>
        <label class="fieldLabel">Technical slug<input id="gallerySlug" class="adminInput" readonly></label>
        <button id="saveGalleryDetailsButton" class="adminButton primary" type="submit" ${metadataEditable ? "" : "disabled"}>SAVE GALLERY DETAILS</button>
      </form>
      <div class="gallerySubsection"><h3>Version</h3>
        <div class="galleryVersionLine"><span>Published</span><strong>${published ? published.version_number : "—"}</strong></div>
        <div class="galleryVersionLine"><span>Active Draft</span><strong>${draft ? draft.version_number : "none"}</strong></div>
        <div class="galleryActions">
          <button id="beginGalleryDraftButton" class="adminButton" type="button" ${canManage && venue.status !== "archived" ? "" : "disabled"}>${draft ? "EDIT DRAFT" : "CREATE NEXT VERSION"}</button>
          <button id="discardGalleryDraftButton" class="adminButton danger" type="button" ${canManage && draft && venue.status !== "archived" ? "" : "disabled"}>DISCARD DRAFT</button>
        </div>
      </div>
      <div class="gallerySubsection"><h3>Building assets</h3><div class="galleryMuted">Floor, Walls and Ceiling are required. Props are optional. Every assigned GLB must pass C23 deep validation before Publish.</div><div id="galleryAssetGrid" class="galleryAssetGrid"></div></div>
      <div class="gallerySubsection"><h3>Entry point</h3>
        <div class="galleryMuted">Fine-adjust values here or capture the current camera from TEST GALLERY.</div>
        <div class="galleryMuted">Position</div><div class="galleryEntryGrid">${["x","y","z"].map((axis)=>`<label class="galleryEntryLabel">${axis}<input id="galleryEntryPos${axis.toUpperCase()}" class="adminInput" type="number" step="0.01" required ${entryEditable ? "" : "readonly"}></label>`).join("")}</div>
        <div class="galleryMuted">Look target</div><div class="galleryEntryGrid">${["x","y","z"].map((axis)=>`<label class="galleryEntryLabel">${axis}<input id="galleryEntryTarget${axis.toUpperCase()}" class="adminInput" type="number" step="0.01" required ${entryEditable ? "" : "readonly"}></label>`).join("")}</div>
        <div class="galleryActions"><button id="saveGalleryEntryButton" class="adminButton" type="button" ${entryEditable ? "" : "disabled"}>SAVE ENTRY POINT</button><button id="testGalleryButton" class="adminButton" type="button" ${working ? "" : "disabled"}>TEST GALLERY</button></div>
      </div>
      <div class="gallerySubsection"><h3>Validation</h3><div id="galleryValidation" class="galleryValidation ${validationValid ? "valid" : "invalid"}"></div><button id="validateGalleryButton" class="adminButton" type="button" ${canManage && draft && venue.status !== "archived" ? "" : "disabled"}>VALIDATE DRAFT</button></div>
      <div class="gallerySubsection"><h3>Actions</h3><div class="galleryActions">
        <button id="publishGalleryButton" class="adminButton primary" type="button" ${canManage && draft && venue.status !== "archived" ? "" : "disabled"}>PUBLISH VERSION</button>
        <button id="rollbackGalleryButton" class="adminButton" type="button" ${canManage && rollback.available && venue.status !== "archived" ? "" : "disabled"}>ROLLBACK</button>
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
    renderGalleryAssetSlots(detail, working, assets, entryEditable);
    renderGalleryValidation(validation, working, detail);
    renderGalleryHistory(detail);
    const actionNote = galleryEl("galleryActionNote");
    if (venue.status === "archived") actionNote.textContent = "Archived Gallery is read-only until restored.";
    else if (draft) actionNote.textContent = "Rollback and Archive are locked while an active Draft Version exists.";
    else if (activeExhibitionCount > 0) actionNote.textContent = `Archive blocked: ${activeExhibitionCount} active Exhibition(s) still belong to this Gallery.`;
    else if (venue.previous_version_id && !rollback.available) actionNote.textContent = "Previous Version is invalid or historical only; rollback is unavailable.";

    galleryEl("galleryDetailsForm").addEventListener("submit", handleSaveGalleryDetails);
    galleryEl("galleryName").addEventListener("input", syncGalleryMetadataDirty);
    galleryEl("galleryDescription").addEventListener("input", syncGalleryMetadataDirty);
    ["X","Y","Z"].forEach((axis) => {
      galleryEl(`galleryEntryPos${axis}`).addEventListener("input", syncGalleryEntryDirty);
      galleryEl(`galleryEntryTarget${axis}`).addEventListener("input", syncGalleryEntryDirty);
    });
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
    galleryEntryBaseline = galleryEntrySnapshot();
    galleryMetadataDirty = false;
    galleryEntryDirty = false;
  } catch (error) {
    renderGalleryDetailError(body, error);
  }
}

function galleryValidationIssueText(report) {
  const errors = report && Array.isArray(report.errors) ? report.errors : [];
  return errors.slice(0, 3).map((item) => item && typeof item === "object" ? (item.message || item.code || "Validation error") : String(item)).join(" · ");
}

async function validateExistingGalleryAsset(draft, role, asset, onProgress) {
  if (!draft || !asset) throw new Error(`${role.toUpperCase()} is not assigned.`);
  if (isCurrentGalleryModelValidation(asset, role)) return { reused: true, report: asset.metadata.c23ModelValidation };
  const url = galleryManagement.getAssetDeliveryUrl(asset);
  if (!url) throw new Error(`${role.toUpperCase()} delivery URL could not be resolved.`);
  const report = await validateGalleryModelUrl(url, {
    role,
    expectedSize: asset.file_size == null ? null : Number(asset.file_size),
    sourceStoragePath: asset.storage_path || null,
    sourceName: asset.metadata && asset.metadata.originalName ? asset.metadata.originalName : (asset.storage_path || `${role}.glb`),
    onProgress
  });
  if (!report.valid) throw new Error(`${role.toUpperCase()} failed deep validation: ${galleryValidationIssueText(report) || "unknown GLB error"}`);
  await galleryManagement.recordAssetValidation({ venueVersionId: draft.id, role, validation: report });
  return { reused: false, report };
}

function renderGalleryAssetSlots(detail, working, assets, editable) {
  const grid = galleryEl("galleryAssetGrid");
  if (!grid) return;
  grid.replaceChildren();
  CONTROLLED_GALLERY_ASSET_ROLES.forEach((role) => {
    const asset = assets.find((item) => item.role === role || item.asset_id === role) || null;
    const status = summarizeGalleryModelValidation(asset, role);
    const row = document.createElement("div");
    row.className = "galleryAssetRow";
    const label = document.createElement("div"); label.className = "galleryAssetRole"; label.textContent = role === "props" ? "props · optional" : role;
    const meta = document.createElement("div"); meta.className = "galleryAssetMeta";
    const pathText = asset ? `${asset.storage_path || asset.public_url || "assigned"}${asset.file_size ? ` · ${Math.round(Number(asset.file_size)/1024)} KB` : ""}` : (role === "props" ? "Not assigned · optional" : "Not assigned · required");
    meta.textContent = `${pathText} · ${status.label}`;
    if (status.report && status.state === "invalid") meta.title = galleryValidationIssueText(status.report);
    const actions = document.createElement("div"); actions.className = "galleryActions";
    const button = document.createElement("button"); button.type="button"; button.className="adminButton"; button.textContent = asset ? "REPLACE" : "UPLOAD"; button.disabled = !editable;
    const input = document.createElement("input"); input.type="file"; input.accept=".glb,model/gltf-binary"; input.className="galleryAssetInput";
    button.addEventListener("click", () => {
      if (!confirmAndDiscardGalleryFormChanges("Unsaved Gallery fields will be discarded before uploading a building asset. Continue?")) return;
      input.click();
    });
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0]; input.value=""; if (!file) return;
      await withGalleryMutation(button, "VALIDATING…", async () => {
        try {
          const draft = galleryDraftVersion(selectedGalleryDetail);
          if (!draft || !selectedGalleryDetail || !selectedGalleryDetail.venue) throw new Error("An active Gallery Draft is required before uploading a building asset.");
          let lastPercent = -1;
          const validation = await validateGalleryModelFile(file, { role, onProgress: ({ loaded, total }) => {
            if (!total) return;
            const percent = Math.min(100, Math.floor(loaded / total * 100));
            if (percent !== lastPercent) { lastPercent = percent; button.textContent = `VALIDATING ${percent}%`; }
          }});
          if (!validation.valid) throw new Error(`${role.toUpperCase()} failed deep validation: ${galleryValidationIssueText(validation) || "unknown GLB error"}`);
          button.textContent = "UPLOADING…";
          const result = await galleryManagement.uploadAssetSlot({ venueId: selectedGalleryDetail.venue.id, venueVersionId: draft.id, role, file, validation });
          const warning = result.cleanup && result.cleanup.warnings && result.cleanup.warnings[0];
          showToast(warning ? `Asset validated and updated. ${warning}` : `${role.toUpperCase()} validated and updated.`);
          await refreshSelectedGallery();
        } catch (error) {
          showToast(error.message || String(error));
        }
      });
    });
    actions.append(button);
    if (role === "props" && asset) {
      const clearButton = document.createElement("button"); clearButton.type="button"; clearButton.className="adminButton"; clearButton.textContent="CLEAR"; clearButton.disabled=!editable;
      clearButton.addEventListener("click", async () => {
        if (!window.confirm("Remove optional Props from this Draft Version?")) return;
        await withGalleryMutation(clearButton, "CLEARING…", async () => {
          try {
            const draft = galleryDraftVersion(selectedGalleryDetail); if (!draft) throw new Error("An active Gallery Draft is required.");
            const result = await galleryManagement.clearOptionalAssetSlot(draft.id, role);
            const warning = result.cleanup && result.cleanup.warnings && result.cleanup.warnings[0];
            showToast(warning ? `Optional Props removed. ${warning}` : "Optional Props removed.");
            await refreshSelectedGallery();
          } catch (error) { showToast(error.message || String(error)); }
        });
      });
      actions.append(clearButton);
    }
    row.append(label, meta, actions, input); grid.appendChild(row);
  });
}

function renderGalleryValidation(report, working, detail) {
  const box = galleryEl("galleryValidation"); if (!box) return;
  const valid = report && report.valid === true;
  const errors = report && Array.isArray(report.errors) ? report.errors : [];
  const warnings = report && Array.isArray(report.warnings) ? report.warnings : [];
  const isPublished = !!(working && detail && detail.venue && working.id === detail.venue.published_version_id);
  const state = valid ? (isPublished ? "VALID" : "READY") : (isPublished ? "INVALID" : "NOT READY");
  box.className = `galleryValidation ${valid ? "valid" : "invalid"}`;
  box.textContent = `${working ? working.version_number : "No version"} · ${state}${errors.length ? ` · ${errors.join(" · ")}` : ""}${warnings.length ? ` · Warnings: ${warnings.join(" · ")}` : ""}`;
}

function renderGalleryHistory(detail) {
  const target = galleryEl("galleryHistory"); if (!target) return;
  target.replaceChildren();
  (detail.versions || []).forEach((version) => {
    let label = version.status || "historical";
    if (version.id === detail.venue.published_version_id) label = "Published";
    else if (version.id === detail.venue.draft_version_id) label = "Draft";
    else if (version.id === detail.venue.previous_version_id) label = detail.rollback && detail.rollback.available ? "Previous — rollback available" : "Previous — invalid history";
    else if (version.status === "archived") label = "Archived Draft";
    const row = document.createElement("div");
    row.className = "galleryHistoryItem";
    const versionLabel = document.createElement("strong");
    versionLabel.textContent = version.version_number || "?";
    const status = document.createElement("span");
    status.className = "galleryMuted";
    status.textContent = label;
    row.append(versionLabel, status);
    target.appendChild(row);
  });
}

async function refreshSelectedGallery() {
  if (!selectedGalleryDetail || !selectedGalleryDetail.venue) return;
  const id = selectedGalleryDetail.venue.id;
  selectedGalleryDetail = await galleryManagement.get(id);
  galleryCatalog = await galleryManagement.list();
  renderGalleryCatalog();
  renderGalleryDetail(selectedGalleryDetail);
  if (engineReady && currentPreviewContextSection() === "galleries") {
    try { await previewSelectedGallery("admin-gallery-refresh"); } catch (error) { showToast(`Gallery preview failed: ${error.message || error}`); }
  }
}

async function handleRefreshGalleries() {
  if (!confirmAndDiscardGalleryFormChanges("Unsaved Gallery changes will be discarded before refreshing. Continue?")) return;
  const button = galleryEl("refreshGalleriesButton");
  await withGalleryMutation(button, "…", async () => {
    try { await loadGalleryCatalog(true); }
    catch (error) { showToast(error.message || String(error)); }
  });
}

async function handleCreateGallery(event) {
  event.preventDefault();
  if (!confirmAndDiscardGalleryFormChanges("Unsaved Gallery changes will be discarded before creating another Gallery. Continue?")) return;
  await ensureGalleryManagementApi();
  const name = galleryEl("newGalleryName").value.trim();
  const description = galleryEl("newGalleryDescription").value.trim();
  if (!name) return;
  const button = galleryEl("createGalleryButton");
  await withGalleryMutation(button, "CREATING…", async () => {
    try {
      const created = await galleryManagement.create({name,description});
      galleryEl("newGalleryName").value="";
      galleryEl("newGalleryDescription").value="";
      galleryCatalog = await galleryManagement.list();
      await selectGallery(created.venue.id,{skipConfirm:true});
      showToast("Gallery created with v1 Draft.");
    } catch(error) { showToast(error.message || String(error)); }
  });
}

async function handleSaveGalleryDetails(event) {
  event.preventDefault();
  if (!selectedGalleryDetail || galleryMutationInFlight) return;
  syncGalleryEntryDirty();
  if (galleryEntryDirty) {
    if (!window.confirm("Entry Point has unsaved changes. Discard them and save Gallery details?")) return;
    restoreGalleryEntryBaseline();
  }
  const name = galleryEl("galleryName").value.trim();
  if (!name) { showToast("Gallery name is required."); return; }
  const button = galleryEl("saveGalleryDetailsButton");
  await withGalleryMutation(button, "SAVING…", async () => {
    try {
      await galleryManagement.updateDetails(selectedGalleryDetail.venue.id,{name,description:galleryEl("galleryDescription").value});
      await refreshSelectedGallery();
      showToast("Gallery details saved.");
    } catch(error) { showToast(error.message || String(error)); }
  });
}

async function handleBeginGalleryDraft() {
  if (!selectedGalleryDetail || galleryMutationInFlight) return;
  if (!confirmAndDiscardGalleryFormChanges("Unsaved Gallery changes will be discarded before opening a Draft Version. Continue?")) return;
  const button = galleryEl("beginGalleryDraftButton");
  await withGalleryMutation(button, "OPENING…", async () => {
    try {
      const result = await galleryManagement.beginDraft(selectedGalleryDetail.venue.id);
      await refreshSelectedGallery();
      showToast(result.created ? `Created ${result.draftVersion.version_number} Draft.` : `Opened ${result.draftVersion.version_number} Draft.`);
    } catch(error) { showToast(error.message || String(error)); }
  });
}

async function handleDiscardGalleryDraft() {
  const draft = galleryDraftVersion(selectedGalleryDetail); if(!draft || galleryMutationInFlight) return;
  if (!confirmAndDiscardGalleryFormChanges("Unsaved Gallery changes will be discarded before discarding the Draft. Continue?")) return;
  if(!window.confirm(`Discard ${draft.version_number} Draft? Uploaded objects owned only by this Draft will be cleanup candidates.`)) return;
  const button = galleryEl("discardGalleryDraftButton");
  await withGalleryMutation(button, "DISCARDING…", async () => {
    try {
      const result = await galleryManagement.discardDraft(draft.id);
      await refreshSelectedGallery();
      const warning = result.cleanup && result.cleanup.warnings && result.cleanup.warnings[0];
      showToast(warning ? `Draft discarded. ${warning}` : "Draft discarded.");
    } catch(error) { showToast(error.message || String(error)); }
  });
}

function readRequiredFiniteGalleryNumber(id, label) {
  const input = galleryEl(id);
  const raw = input ? String(input.value).trim() : "";
  if (!raw) throw new Error(`${label} is required.`);
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  return value;
}

function readEntryForm() {
  const read = (prefix, label) => ({
    x: readRequiredFiniteGalleryNumber(`${prefix}X`, `${label} X`),
    y: readRequiredFiniteGalleryNumber(`${prefix}Y`, `${label} Y`),
    z: readRequiredFiniteGalleryNumber(`${prefix}Z`, `${label} Z`)
  });
  return { position: read("galleryEntryPos", "Entry position"), target: read("galleryEntryTarget", "Entry target") };
}

async function handleSaveGalleryEntry() {
  const draft = galleryDraftVersion(selectedGalleryDetail); if(!draft || galleryMutationInFlight) return;
  syncGalleryMetadataDirty();
  if (galleryMetadataDirty) {
    if (!window.confirm("Gallery details have unsaved changes. Discard them and save the Entry Point?")) return;
    restoreGalleryMetadataBaseline();
  }
  let entry;
  try { entry = readEntryForm(); }
  catch (error) { showToast(error.message || String(error)); return; }
  const button = galleryEl("saveGalleryEntryButton");
  await withGalleryMutation(button, "SAVING…", async () => {
    try {
      await galleryManagement.setEntryPoint(draft.id,entry.position,entry.target);
      await refreshSelectedGallery();
      showToast("Entry Point saved.");
    } catch(error) { showToast(error.message || String(error)); }
  });
}

function handleTestGallery() {
  const version = galleryWorkingVersion(selectedGalleryDetail); if(!version) return;
  if (hasAnyAdminUnsavedChanges() && !window.confirm("Unsaved Admin changes will be discarded before Test Gallery. Continue?")) return;
  if (hasAnyAdminUnsavedChanges()) discardAdminUnsavedChanges();
  const url = new URL("./gallery-test.html",location.href);
  url.searchParams.set("version",version.id);
  url.searchParams.set("gallery",selectedGalleryDetail.venue.id);
  location.href = url.href;
}

async function handleValidateGallery() {
  const draft = galleryDraftVersion(selectedGalleryDetail); if(!draft || galleryMutationInFlight) return;
  if (!confirmAndDiscardGalleryFormChanges("Unsaved Gallery changes will be discarded before validation. Continue?")) return;
  const button = galleryEl("validateGalleryButton");
  await withGalleryMutation(button, "VALIDATING…", async () => {
    try {
      const working = galleryWorkingVersion(selectedGalleryDetail);
      const assets = working && Array.isArray(working.assets) ? working.assets : [];
      for (const role of REQUIRED_GALLERY_MODEL_ROLES) {
        if (!assets.some((item) => item.role === role || item.asset_id === role)) throw new Error(`${role.toUpperCase()} is required before Gallery validation.`);
      }
      const assigned = CONTROLLED_GALLERY_ASSET_ROLES
        .map((role) => [role, assets.find((item) => item.role === role || item.asset_id === role) || null])
        .filter(([, asset]) => !!asset);
      for (let index=0; index<assigned.length; index++) {
        const [role, asset] = assigned[index];
        let lastPercent = -1;
        button.textContent = `CHECKING ${role.toUpperCase()}…`;
        await validateExistingGalleryAsset(draft, role, asset, ({ loaded, total }) => {
          if (!total) return;
          const percent = Math.min(100, Math.floor(loaded / total * 100));
          if (percent !== lastPercent) { lastPercent = percent; button.textContent = `${role.toUpperCase()} ${percent}%`; }
        });
      }
      button.textContent = "CHECKING SPACE…";
      const report = await galleryManagement.validate(draft.id);
      await refreshSelectedGallery();
      showToast(report.valid ? "Gallery Draft is READY — deep model validation passed." : "Gallery validation found blockers.");
    } catch(error) { showToast(error.message || String(error)); }
  });
}

async function handlePublishGallery() {
  const draft = galleryDraftVersion(selectedGalleryDetail); if(!draft || galleryMutationInFlight) return;
  if (!confirmAndDiscardGalleryFormChanges("Unsaved Gallery changes will be discarded before publishing. Continue?")) return;
  if(!window.confirm("Publish this Gallery Version? Existing Exhibitions stay on their currently assigned Gallery Version until deliberately migrated later.")) return;
  const button = galleryEl("publishGalleryButton");
  await withGalleryMutation(button, "PUBLISHING…", async () => {
    try {
      await galleryManagement.publish(draft.id);
      await refreshSelectedGallery();
      showToast(`${draft.version_number} published. Existing Exhibitions were not reassigned.`);
    } catch(error) { showToast(error.message || String(error)); }
  });
}

async function handleRollbackGallery() {
  if(!selectedGalleryDetail || !(selectedGalleryDetail.rollback && selectedGalleryDetail.rollback.available) || galleryMutationInFlight) return;
  if (!confirmAndDiscardGalleryFormChanges("Unsaved Gallery changes will be discarded before rollback. Continue?")) return;
  if(!window.confirm("Rollback the active Gallery Version to the validated previous Version? Existing Exhibitions remain pinned to their explicit versions.")) return;
  const button = galleryEl("rollbackGalleryButton");
  await withGalleryMutation(button, "ROLLING BACK…", async () => {
    try {
      await galleryManagement.rollback(selectedGalleryDetail.venue.id);
      await refreshSelectedGallery();
      showToast("Gallery rollback completed.");
    } catch(error) { showToast(error.message || String(error)); }
  });
}

async function handleArchiveGallery() {
  if(!selectedGalleryDetail || galleryMutationInFlight) return;
  if (!confirmAndDiscardGalleryFormChanges("Unsaved Gallery changes will be discarded before archiving. Continue?")) return;
  if(!window.confirm("Archive this Gallery?")) return;
  const button = galleryEl("archiveGalleryButton");
  await withGalleryMutation(button, "ARCHIVING…", async () => {
    try {
      await galleryManagement.archive(selectedGalleryDetail.venue.id);
      await refreshSelectedGallery();
      showToast("Gallery archived.");
    } catch(error) { showToast(error.message || String(error)); }
  });
}

async function handleRestoreGallery() {
  if(!selectedGalleryDetail || galleryMutationInFlight) return;
  if (!confirmAndDiscardGalleryFormChanges("Unsaved Gallery changes will be discarded before restoring. Continue?")) return;
  const button = galleryEl("restoreGalleryButton");
  await withGalleryMutation(button, "RESTORING…", async () => {
    try {
      await galleryManagement.restore(selectedGalleryDetail.venue.id);
      await refreshSelectedGallery();
      showToast("Gallery restored.");
    } catch(error) { showToast(error.message || String(error)); }
  });
}

ensureGalleryManagementUi();

[exhibitionName, exhibitionDescription, exhibitionSortOrder].forEach((field) => {
  if (field) field.addEventListener("input", syncMetadataDirtyState);
});

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
    if (currentPreviewContextSection() === "galleries") await loadGalleryCatalog(true);
    const requested = getRequestedExhibitionId();
    const initial = catalog.find((item) => item.id === requested || item.slug === requested) || catalog.find((item) => item.slug === "main") || catalog[0];
    if (!initial) throw new Error("No canonical Exhibition exists. Run the current platform migration and postcheck.");
    setSelectedExhibition(initial);
    let initialRuntime = exhibitionData && typeof exhibitionData.getRuntime === "function" ? exhibitionData.getRuntime(initial.id) : null;
    if (!initialRuntime) initialRuntime = await resolveInitialAdminRuntime(supabase, initial.id);
    const navigationHandoff = readNavigationHandoff(initial.id, initialRuntime.spaceDefinition.id, getRuntimeVenueVersionKey(initialRuntime));
    await startEngine(initial.id, navigationHandoff);
    if (currentPreviewContextSection() === "galleries" && selectedGalleryDetail) await previewSelectedGallery("admin-initial-gallery-section");
    applyAdminWorkspaceVisibility(adminWorkspaceSection);
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
  if (sceneLifecycleController && typeof sceneLifecycleController.getActiveScene === "function") {
    scene = sceneLifecycleController.getActiveScene();
    if (inlineRuntimeContext) inlineRuntimeContext.scene = scene;
  }
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
    setViewportStatus(active.name);
    if (sameDraftExhibition) syncMetadataDirtyState();
  }
  // C6C8C13: diagnostics are not part of the workspace mode critical path.
  // Paint the Admin shell first and refresh delivery telemetry asynchronously.
  void updateAssetDeliveryStatus().catch(() => null);
  startAssetDeliveryMonitoring();
  return true;
}
