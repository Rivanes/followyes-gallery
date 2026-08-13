/*
  Exhibition Platform — Stage 12C66C6C8C14 — Zero-Work Public Return
  Save Integrity Repair / Correct Startup Rebuild.
  Babylon, GLB loaders and the gallery engine start only after an explicit visitor click.
  The accepted engine-owned instructional popup is shown unchanged after true interaction readiness.
*/

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { gallerySpaceDefinition } from "../config/gallery-space-config.js?v=stage12c66c6c8c14_zero_work_public_return_20260813";
import { registerExhibitionAssetCache, getExhibitionAssetDeliveryStats } from "./asset-cache-bootstrap.js?v=stage12c66c6c8c14_zero_work_public_return_20260813";
import { beginTransitionGuard, endTransitionGuard, isTransitionGuardActive } from "./transition-guard.js?v=stage12c66c6c8c14_zero_work_public_return_20260813";

const STAGE = "12C66C6C8C14";
const ENGINE_CACHE_KEY = "stage12c66c6c8c14_zero_work_public_return_20260813";
const SUPABASE_URL = "https://bazbszvhoxmuekxahokc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_iCDi8Ls8ZMvqQgcAuE78MQ_OnPVWqfn";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
window.gallerySupabase = supabase;

async function resolvePublishedExhibitionId(requestedId) {
  const requested = String(requestedId || "main").trim() || "main";
  try {
    const exact = await supabase.from("gallery_exhibitions")
      .select("id")
      .eq("id", requested)
      .eq("is_published", true)
      .limit(1);
    if (!exact.error && Array.isArray(exact.data) && exact.data[0] && exact.data[0].id) {
      return String(exact.data[0].id);
    }

    const fallback = await supabase.from("gallery_exhibitions")
      .select("id")
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1);
    if (!fallback.error && Array.isArray(fallback.data) && fallback.data[0] && fallback.data[0].id) {
      return String(fallback.data[0].id);
    }
  } catch (_error) {}
  return requested;
}

const assetCacheReadyPromise = registerExhibitionAssetCache();

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

async function finishModeTransitionDiagnostic(beforeOrPromise, startedAt, fromLabel, toLabel) {
  const before = await Promise.resolve(beforeOrPromise).catch(() => null);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await new Promise((resolve) => setTimeout(resolve, 120));
  const after = await getExhibitionAssetDeliveryStats().catch(() => null);
  const delta = deliveryStatsDelta(before, after);
  return publishTransitionNetworkDiagnostic({
    type: "workspace-mode",
    from: fromLabel,
    to: toLabel,
    mode: "instant-workspace-ui-only",
    durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
    network: delta,
    zeroStorageNetwork: delta.supabaseNetworkFetches === 0,
    at: Date.now()
  });
}


function publishInstantWorkspaceModeDiagnostic(startedAt, fromLabel, toLabel, engineRecord) {
  // C6C8C14: never query the Service Worker on the click path. The Asset Delivery
  // panel keeps session-level network telemetry; this record measures UI latency only.
  return publishTransitionNetworkDiagnostic({
    type: "workspace-mode",
    from: fromLabel,
    to: toLabel,
    mode: "zero-work-public-return",
    durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
    engineDurationMs: engineRecord && Number.isFinite(Number(engineRecord.durationMs))
      ? Number(engineRecord.durationMs)
      : null,
    corePresentationMs: engineRecord && Number.isFinite(Number(engineRecord.corePresentationMs))
      ? Number(engineRecord.corePresentationMs)
      : null,
    networkMeasuredOnClickPath: false,
    zeroStorageNetwork: null,
    at: Date.now()
  });
}

function canUseInstantWorkspaceModeSwitch() {
  if (!activeEngine || !activeScene || !window.GalleryApp) return false;
  if (typeof window.GalleryApp.canUseInstantWorkspaceModeSwitch === "function") {
    try { return window.GalleryApp.canUseInstantWorkspaceModeSwitch() === true; } catch (_error) {}
  }
  if (typeof window.GalleryApp.getForegroundReadiness === "function") {
    try {
      const readiness = window.GalleryApp.getForegroundReadiness();
      return !!(readiness && readiness.ready);
    } catch (_error) {}
  }
  return false;
}

let inlineWorkspaceModeSwitchActive = false;

function getRequestedExhibitionId() {
  try { const params = new URLSearchParams(window.location.search); return (params.get("exhibition") || "main").trim() || "main"; } catch (error) { return "main"; }
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
    if (!parsed.state || typeof parsed.state !== "object") return null;
    if (Date.now() - Number(parsed.createdAt || 0) > 120000) return null;
    if (String(parsed.spaceId || gallerySpaceDefinition.id) !== String(gallerySpaceDefinition.id)) return null;
    return parsed;
  } catch (_error) {
    try { sessionStorage.removeItem(key); } catch (_ignore) {}
    return null;
  }
}

const canvas = document.getElementById("renderCanvas");
const startupError = document.getElementById("startupError");
const galleryToast = document.getElementById("galleryToast");
const loginButton = document.getElementById("loginButton");
const logoutButton = document.getElementById("logoutButton");
const adminWorkspaceButton = document.getElementById("adminWorkspaceButton");
const saveStateButton = document.getElementById("saveStateButton");
const exploreBelowButton = document.getElementById("exploreBelowButton");
const authStatus = document.getElementById("authStatus");
const submitLoginButton = document.getElementById("submitLoginButton");
const cancelLoginButton = document.getElementById("cancelLoginButton");
const authModalTitle = document.getElementById("authModalTitle");
const authEmailLabel = document.getElementById("authEmailLabel");
const authPasswordLabel = document.getElementById("authPasswordLabel");
const mobileQualitySelect = document.getElementById("mobileQualitySelect");
const mobileQualityLabel = document.getElementById("mobileQualityLabel");
const mobileQualityOptionAuto = document.getElementById("mobileQualityOptionAuto");
const mobileQualityOptionHigh = document.getElementById("mobileQualityOptionHigh");
const mobileQualityOptionBalanced = document.getElementById("mobileQualityOptionBalanced");
const mobileQualityOptionSafe = document.getElementById("mobileQualityOptionSafe");

let currentSession = null;
let editorModulePromise = null;
let activeEngine = null;
let activeScene = null;
let galleryStartPromise = null;
let currentLang = localStorage.getItem("berryboy_art_gallery_lang") || "en";

let inlineAdminModulePromise = null;
let inlineAdminWorkspaceMounted = false;
let gallerySectionHomeParent = null;
let gallerySectionHomeNextSibling = null;

function ensureInlineAdminWorkspaceStyles() {
  if (document.getElementById("inlineAdminWorkspaceStyles")) return;
  const style = document.createElement("style");
  style.id = "inlineAdminWorkspaceStyles";
  style.textContent = `
    #inlineAdminWorkspace { position:fixed; inset:0; z-index:19000; display:none; grid-template-rows:64px minmax(0,1fr); background:#0b0d0c; color:rgba(255,255,255,.92); font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    #inlineAdminWorkspace.active { display:grid; }
    body.inline-admin-workspace-active { overflow:hidden !important; }
    body.inline-admin-workspace-active #siteHeader, body.inline-admin-workspace-active #siteContent, body.inline-admin-workspace-active #siteFooter { visibility:hidden !important; pointer-events:none !important; }
    #inlineAdminTopbar { display:flex; align-items:center; justify-content:space-between; gap:20px; padding:0 22px; border-bottom:1px solid rgba(255,255,255,.10); background:rgba(13,15,14,.98); }
    #inlineAdminTopbar .adminBrand { display:flex; align-items:center; gap:12px; min-width:0; }
    #inlineAdminTopbar .adminBrandMark { width:30px; height:30px; border:1px solid rgba(255,255,255,.18); border-radius:9px; display:grid; place-items:center; font-weight:800; font-size:11px; }
    #inlineAdminTopbar .adminBrandText strong { display:block; font-size:13px; letter-spacing:.07em; text-transform:uppercase; }
    #inlineAdminTopbar .adminBrandText span { display:block; margin-top:2px; color:rgba(255,255,255,.57); font-size:11px; }
    #inlineAdminTopbar .topActions { display:flex; align-items:center; gap:8px; }
    #inlineAdminTopbar .topUser { color:rgba(255,255,255,.57); font-size:12px; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    #inlineAdminWorkspace .adminButton { min-height:36px; padding:0 13px; border:1px solid rgba(255,255,255,.18); border-radius:10px; background:rgba(255,255,255,.055); color:rgba(255,255,255,.92) !important; cursor:pointer; font-weight:700; font-size:11px; letter-spacing:.04em; text-decoration:none !important; display:inline-flex; align-items:center; justify-content:center; }
    #inlineAdminWorkspace .adminButton:visited { color:rgba(255,255,255,.92) !important; }
    #inlineAdminWorkspace #publicPageButton, #inlineAdminWorkspace #publicPageButton:link, #inlineAdminWorkspace #publicPageButton:visited, #inlineAdminWorkspace #publicPageButton:hover, #inlineAdminWorkspace #publicPageButton:active { color:rgba(255,255,255,.92) !important; text-decoration:none !important; }
    #inlineAdminWorkspace .adminButton:hover { background:rgba(255,255,255,.09); }
    #inlineAdminWorkspace .adminButton.primary { background:rgba(125,160,127,.16); border-color:rgba(154,180,155,.45); }
    #inlineAdminWorkspace .adminButton.danger { color:#f0b5b5 !important; }
    #inlineAdminWorkspace .adminButton:disabled { opacity:.4; cursor:default; }
    #inlineAdminBody { min-height:0; display:grid; grid-template-columns:360px minmax(0,1fr); }
    #inlineAdminSidebar { min-height:0; overflow:auto; border-right:1px solid rgba(255,255,255,.10); background:rgba(17,19,18,.98); padding:18px; }
    #inlineAdminWorkspace .workspaceSection { border:1px solid rgba(255,255,255,.10); border-radius:14px; background:rgba(255,255,255,.035); overflow:hidden; margin-bottom:14px; }
    #inlineAdminWorkspace .sectionHead { padding:14px 14px 10px; display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
    #inlineAdminWorkspace .sectionHead h2 { margin:0; font-size:12px; letter-spacing:.08em; text-transform:uppercase; }
    #inlineAdminWorkspace .sectionHead p { margin:5px 0 0; color:rgba(255,255,255,.57); font-size:11px; line-height:1.45; }
    #inlineAdminWorkspace .sectionBody { padding:0 14px 14px; }
    #inlineAdminWorkspace #createExhibitionForm { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:7px; }
    #inlineAdminWorkspace .adminInput, #inlineAdminWorkspace .adminTextarea { width:100%; border:1px solid rgba(255,255,255,.18); border-radius:10px; background:rgba(255,255,255,.055); color:rgba(255,255,255,.92); outline:none; font:inherit; }
    #inlineAdminWorkspace .adminInput { height:38px; padding:0 11px; }
    #inlineAdminWorkspace .adminTextarea { min-height:92px; resize:vertical; padding:10px 11px; line-height:1.45; }
    #inlineAdminWorkspace #exhibitionList { display:grid; gap:7px; max-height:280px; overflow:auto; padding-right:2px; }
    #inlineAdminWorkspace .exhibitionRow { width:100%; display:grid; grid-template-columns:48px minmax(0,1fr); gap:10px; align-items:center; text-align:left; padding:7px; border:1px solid transparent; border-radius:10px; background:transparent; color:rgba(255,255,255,.92); cursor:pointer; }
    #inlineAdminWorkspace .exhibitionRow:hover { background:rgba(255,255,255,.045); }
    #inlineAdminWorkspace .exhibitionRow.active { border-color:rgba(154,180,155,.38); background:rgba(125,160,127,.16); }
    #inlineAdminWorkspace .exhibitionThumb { width:48px; height:48px; border-radius:8px; border:1px solid rgba(255,255,255,.10); object-fit:cover; background:rgba(255,255,255,.035); }
    #inlineAdminWorkspace .exhibitionMeta { min-width:0; }
    #inlineAdminWorkspace .exhibitionMeta strong { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }
    #inlineAdminWorkspace .exhibitionMeta span { display:block; margin-top:4px; color:rgba(255,255,255,.57); font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    #inlineAdminWorkspace .statusDot { display:inline-block; width:6px; height:6px; border-radius:50%; background:#777; margin-right:5px; vertical-align:1px; }
    #inlineAdminWorkspace .statusDot.published { background:#7fa982; }
    #inlineAdminWorkspace #detailsForm { display:grid; gap:11px; }
    #inlineAdminWorkspace .fieldLabel { display:grid; gap:6px; color:rgba(255,255,255,.57); font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; }
    #inlineAdminWorkspace .fieldMeta { color:rgba(255,255,255,.57); font-size:10px; line-height:1.4; }
    #inlineAdminWorkspace .inlineFields { display:grid; grid-template-columns:1fr 110px; gap:9px; }
    #inlineAdminWorkspace .checkRow { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:38px; border:1px solid rgba(255,255,255,.10); border-radius:10px; padding:0 10px; }
    #inlineAdminWorkspace .checkRow span { font-size:11px; color:rgba(255,255,255,.57); }
    #inlineAdminWorkspace .posterCard { display:grid; grid-template-columns:94px minmax(0,1fr); gap:11px; align-items:start; }
    #inlineAdminWorkspace #posterPreview { width:94px; aspect-ratio:4/5; object-fit:cover; border-radius:10px; border:1px solid rgba(255,255,255,.18); background:#101210; }
    #inlineAdminWorkspace .posterActions { display:grid; gap:7px; }
    #inlineAdminWorkspace #posterFileInput { display:none; }
    #inlineAdminMain { min-width:0; min-height:0; padding:18px; background:radial-gradient(circle at 30% 10%,rgba(255,255,255,.035),transparent 36%),#0b0d0c; }
    #inlineAdminViewportCard { height:100%; min-height:0; display:grid; grid-template-rows:56px minmax(0,1fr); border:1px solid rgba(255,255,255,.10); border-radius:16px; overflow:hidden; background:#050606; box-shadow:0 28px 90px rgba(0,0,0,.22); }
    #inlineAdminViewportToolbar { display:flex; align-items:center; justify-content:space-between; gap:14px; padding:0 12px; border-bottom:1px solid rgba(255,255,255,.10); background:rgba(20,22,21,.96); }
    #inlineAdminWorkspace #viewportStatus { min-width:0; color:rgba(255,255,255,.57); font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    #inlineAdminWorkspace #viewportStatus strong { color:rgba(255,255,255,.92); }
    #adminViewportStage { position:relative; min-width:0; min-height:0; overflow:hidden; isolation:isolate; }
    #inlineAdminWorkspace #gallerySection { width:100% !important; height:100% !important; min-height:0 !important; }
    #inlineAdminWorkspace .workspaceLoading { position:absolute; inset:0; z-index:45; display:grid; place-items:center; pointer-events:none; background:rgba(5,6,6,.72); backdrop-filter:blur(4px); }
    #inlineAdminWorkspace .workspaceLoading.hidden { display:none; }
    #inlineAdminWorkspace .loadingCard { padding:13px 16px; border:1px solid rgba(255,255,255,.10); border-radius:10px; background:#161918; color:rgba(255,255,255,.57); font-size:11px; }
    @media (max-width:980px) { #inlineAdminBody { grid-template-columns:1fr; overflow:auto; } #inlineAdminSidebar { max-height:45vh; border-right:0; border-bottom:1px solid rgba(255,255,255,.10); } #inlineAdminMain { min-height:680px; } }
  `;
  document.head.appendChild(style);
}

function ensureInlineAdminWorkspaceDom() {
  if (inlineAdminWorkspaceMounted) return document.getElementById("inlineAdminWorkspace");
  ensureInlineAdminWorkspaceStyles();
  const gallerySection = document.getElementById("gallerySection");
  gallerySectionHomeParent = gallerySection ? gallerySection.parentNode : null;
  gallerySectionHomeNextSibling = gallerySection ? gallerySection.nextSibling : null;

  const shell = document.createElement("div");
  shell.id = "inlineAdminWorkspace";
  shell.innerHTML = `
    <header id="inlineAdminTopbar">
      <div class="adminBrand"><div class="adminBrandMark">EP</div><div class="adminBrandText"><strong>Admin Workspace</strong><span>Exhibition Platform</span></div></div>
      <div class="topActions"><span id="adminUser" class="topUser">Editor</span><a class="adminButton" id="publicPageButton" href="#">PUBLIC PAGE</a><button id="inlineAdminLogoutButton" class="adminButton danger" type="button">LOG OUT</button></div>
    </header>
    <div id="inlineAdminBody">
      <aside id="inlineAdminSidebar">
        <section class="workspaceSection"><div class="sectionHead"><div><h2>Exhibitions</h2><p>Switch the active exhibition or create a new one in the current 3D Space.</p></div><button id="refreshExhibitionsButton" class="adminButton" type="button">↻</button></div><div class="sectionBody"><form id="createExhibitionForm"><input id="newExhibitionName" class="adminInput" maxlength="120" placeholder="New exhibition name" autocomplete="off"/><button id="createExhibitionButton" class="adminButton primary" type="submit">CREATE</button></form><div style="height:10px"></div><div id="exhibitionList"><div class="fieldMeta">Loading exhibition catalog…</div></div></div></section>
        <section class="workspaceSection"><div class="sectionHead"><div><h2>Exhibition details</h2><p>Metadata used by the admin workspace and the future public carousel.</p></div></div><div class="sectionBody"><form id="detailsForm"><label class="fieldLabel">Name<input id="exhibitionName" class="adminInput" maxlength="120" required/></label><label class="fieldLabel">Description<textarea id="exhibitionDescription" class="adminTextarea" maxlength="4000" placeholder="Short exhibition description"></textarea></label><div class="inlineFields"><label class="fieldLabel">Slug<input id="exhibitionSlug" class="adminInput" readonly/></label><label class="fieldLabel">Order<input id="exhibitionSortOrder" class="adminInput" type="number" step="1"/></label></div><div class="checkRow"><span>Published / visible publicly</span><input id="exhibitionPublished" type="checkbox"/></div><div class="fieldLabel">Poster / cover</div><div class="posterCard"><img id="posterPreview" alt="Exhibition poster preview"/><div class="posterActions"><button id="choosePosterButton" class="adminButton" type="button">UPLOAD / REPLACE</button><button id="removePosterButton" class="adminButton danger" type="button">REMOVE</button><div id="posterStatus" class="fieldMeta">No poster assigned.</div><input id="posterFileInput" type="file" accept="image/jpeg,image/png,image/webp,image/avif"/></div></div><div class="fieldMeta">Space: <strong id="exhibitionSpaceId">main-space</strong></div><button id="saveMetadataButton" class="adminButton primary" type="submit">SAVE EXHIBITION DETAILS</button></form></div></section>
      </aside>
      <main id="inlineAdminMain"><section id="inlineAdminViewportCard"><div id="inlineAdminViewportToolbar"><div><div id="viewportStatus">3D preview: <strong>ready</strong></div><div id="assetDeliveryStatus" class="fieldMeta">Asset delivery: same runtime</div><div id="networkDiagnostics" class="fieldMeta">Network: measuring Storage delivery…</div></div><div class="fieldMeta">Same live 3D runtime — no scene reload.</div></div><div id="adminViewportStage"><div id="workspaceLoading" class="workspaceLoading hidden"><div class="loadingCard">Preparing Admin Workspace…</div></div></div></section></main>
    </div>`;
  document.body.appendChild(shell);
  const logout = document.getElementById("inlineAdminLogoutButton");
  if (logout) logout.addEventListener("click", async () => {
    const closed = await closeInlineAdminWorkspace({ reason: "logout" });
    if (!closed) return;
    await supabase.auth.signOut();
  });
  inlineAdminWorkspaceMounted = true;
  return shell;
}

async function closeInlineAdminWorkspace(options = {}) {
  const shell = document.getElementById("inlineAdminWorkspace");
  if (!shell || !shell.classList.contains("active")) return true;
  if (inlineWorkspaceModeSwitchActive) return false;

  const adminModule = inlineAdminModulePromise ? await inlineAdminModulePromise.catch(() => null) : null;
  const metadataDirty = !!(adminModule && typeof adminModule.hasAdminMetadataUnsavedChanges === "function" && adminModule.hasAdminMetadataUnsavedChanges());
  const sceneDirty = !!(window.GalleryApp && window.GalleryApp.hasUnsavedChanges ? window.GalleryApp.hasUnsavedChanges() : false);
  let discardUnsaved = options.discardUnsaved === true;

  if ((metadataDirty || sceneDirty) && !discardUnsaved && !options.force) {
    const action = options.reason === "logout" ? "log out" : "return to the public Viewer";
    discardUnsaved = window.confirm(`You have unsaved Admin changes. Discard them and ${action}?`);
    if (!discardUnsaved) return false;
  }

  if (isTransitionGuardActive()) return false;
  inlineWorkspaceModeSwitchActive = true;
  const activeBefore = window.GalleryApp && window.GalleryApp.getActiveExhibition ? window.GalleryApp.getActiveExhibition() : null;
  const transitionStartedAt = performance.now();

  // C6C8C14: clean Admin→Public is a zero-work UI return. Do not even request
  // Service Worker delivery stats until after the public frame is visible.
  const instantFastPath = !sceneDirty && canUseInstantWorkspaceModeSwitch();
  const transitionBeforePromise = instantFastPath
    ? null
    : getExhibitionAssetDeliveryStats().catch(() => null);

  let guardToken = null;
  if (!instantFastPath) {
    guardToken = await beginTransitionGuard({
      title: "Returning to Public Page…",
      detail: "Finishing pending gallery work before returning to Viewer.",
      minVisibleMs: 120
    });
    if (!guardToken) {
      inlineWorkspaceModeSwitchActive = false;
      return false;
    }
  }

  try {
    if (discardUnsaved && metadataDirty && adminModule && typeof adminModule.discardAdminMetadataChanges === "function") {
      adminModule.discardAdminMetadataChanges();
    }

    if (window.GalleryApp && typeof window.GalleryApp.exitAdminWorkspaceMode === "function") {
      const exited = window.GalleryApp.exitAdminWorkspaceMode({ discardUnsaved });
      if (!exited) return false;
    }

    // Move the already-running canvas back first. No network, no Scene rebuild.
    const gallerySection = document.getElementById("gallerySection");
    if (gallerySection && gallerySectionHomeParent) {
      if (gallerySectionHomeNextSibling && gallerySectionHomeNextSibling.parentNode === gallerySectionHomeParent) gallerySectionHomeParent.insertBefore(gallerySection, gallerySectionHomeNextSibling);
      else gallerySectionHomeParent.appendChild(gallerySection);
    }
    shell.classList.remove("active");
    document.body.classList.remove("inline-admin-workspace-active");

    // Admin housekeeping is not allowed to delay the public frame.
    if (adminModule && typeof adminModule.suspendAdminWorkspace === "function") {
      const suspendPromise = adminModule.suspendAdminWorkspace();
      if (!instantFastPath) await suspendPromise;
      else void Promise.resolve(suspendPromise).catch(() => null);
    }

    const active = window.GalleryApp && window.GalleryApp.getActiveExhibition ? window.GalleryApp.getActiveExhibition() : activeBefore;
    try {
      const url = new URL(location.href);
      url.searchParams.set("exhibition", active && active.id ? active.id : "main");
      history.replaceState(null, "", url);
    } catch (_error) {}

    window.requestAnimationFrame(() => {
      if (activeEngine) activeEngine.resize();
      if (instantFastPath) {
        const engineRecord = window.GalleryApp && typeof window.GalleryApp.getExhibitionRuntimeDebug === "function"
          ? (window.GalleryApp.getExhibitionRuntimeDebug().lastModeTransition || null)
          : null;
        publishInstantWorkspaceModeDiagnostic(
          transitionStartedAt,
          `Admin:${active && active.id ? active.id : "main"}`,
          `Public:${active && active.id ? active.id : "main"}`,
          engineRecord
        );
      }
    });

    // Fallback only: scene changed/discarded and must really revalidate foreground.
    if (!instantFastPath && window.GalleryApp && typeof window.GalleryApp.waitForForegroundReady === "function") {
      await window.GalleryApp.waitForForegroundReady("admin-to-public-fallback", { pendingTimeoutMs: 7000, quietTimeoutMs: 3600 });
    }

    if (!instantFastPath) {
      void finishModeTransitionDiagnostic(
        transitionBeforePromise,
        transitionStartedAt,
        `Admin:${active && active.id ? active.id : "main"}`,
        `Public:${active && active.id ? active.id : "main"}`
      ).catch(() => null);
    }
    return true;
  } finally {
    if (guardToken) await endTransitionGuard(guardToken);
    inlineWorkspaceModeSwitchActive = false;
  }
}

async function openInlineAdminWorkspace(exhibitionId) {
  if (!currentSession || isTransitionGuardActive() || inlineWorkspaceModeSwitchActive) return false;
  const foregroundReadyBeforeOpen = canUseInstantWorkspaceModeSwitch();
  const guardToken = await beginTransitionGuard({
    title: "Opening Admin Workspace…",
    detail: "Reusing the live 3D scene — no building reload.",
    minVisibleMs: 150
  });
  if (!guardToken) return false;

  if (!activeEngine || !activeScene || !window.GalleryApp) {
    const target = `./admin.html?exhibition=${encodeURIComponent(exhibitionId || getRequestedExhibitionId())}`;
    location.href = target;
    return false;
  }

  try {
    const shell = ensureInlineAdminWorkspaceDom();
    const stage = document.getElementById("adminViewportStage");
    const gallerySection = document.getElementById("gallerySection");
    if (stage && gallerySection && gallerySection.parentNode !== stage) stage.appendChild(gallerySection);
    shell.classList.add("active");
    document.body.classList.add("inline-admin-workspace-active");
    if (window.GalleryApp.hideViewerIntroOverlay) window.GalleryApp.hideViewerIntroOverlay();
    const inlineContext = window.__EXHIBITION_INLINE_ADMIN_CONTEXT__ || {};
    Object.assign(inlineContext, {
      engine: activeEngine,
      scene: activeScene,
      supabase,
      session: currentSession,
      exhibitionId: exhibitionId || (window.GalleryApp.getActiveExhibition && window.GalleryApp.getActiveExhibition().id) || "main",
      close: closeInlineAdminWorkspace,
      onSessionLost: () => closeInlineAdminWorkspace({ discardUnsaved: true, force: true })
    });
    window.__EXHIBITION_INLINE_ADMIN_CONTEXT__ = inlineContext;
    if (window.GalleryApp.enterAdminWorkspaceMode) window.GalleryApp.enterAdminWorkspaceMode();
    if (!inlineAdminModulePromise) inlineAdminModulePromise = import(`./admin-workspace-bootstrap.js?v=${ENGINE_CACHE_KEY}`);
    const adminModule = await inlineAdminModulePromise;
    if (adminModule && typeof adminModule.resumeAdminWorkspace === "function") await adminModule.resumeAdminWorkspace();
    window.requestAnimationFrame(() => { if (activeEngine) activeEngine.resize(); });
    if (!foregroundReadyBeforeOpen && window.GalleryApp && typeof window.GalleryApp.waitForForegroundReady === "function") {
      await window.GalleryApp.waitForForegroundReady("public-to-admin-fallback", { pendingTimeoutMs: 7000, quietTimeoutMs: 3600 });
    }
    return true;
  } finally {
    await endTransitionGuard(guardToken);
  }
}

window.ExhibitionPlatformOpenAdminWorkspace = openInlineAdminWorkspace;
window.ExhibitionPlatformCloseAdminWorkspace = closeInlineAdminWorkspace;

const uiText = {
  pl: {
    publicGallery: "Galeria publiczna",
    editorLoggedIn: "Edytor zalogowany: ",
    editorAccount: "konto edytora",
    login: "Zaloguj",
    logout: "Wyloguj",
    save: "Zapisz zmiany",
    saving: "Zapisywanie…",
    allSaved: "Wszystko zapisane",
    saved: "Zapisano",
    saveError: "Błąd zapisu — spróbuj ponownie",
    editorLogin: "Logowanie edytora",
    email: "Login / e-mail",
    password: "Hasło",
    cancel: "Anuluj",
    loginFailed: "Nie udało się zalogować. Sprawdź login i hasło.",
    loggedIn: "Zalogowano edytora.",
    loggedOut: "Wylogowano.",
    galleryLoading: "Galeria jeszcze się ładuje.",
    startupError: "Nie udało się uruchomić galerii.",
    exploreBelow: "O projekcie",
    quality: "Jakość",
    qualityAuto: "Auto",
    qualityHigh: "Wysoka",
    qualityBalanced: "Zbalansowana",
    qualitySafe: "Bezpieczna"
  },
  en: {
    publicGallery: "Public gallery",
    editorLoggedIn: "Editor logged in: ",
    editorAccount: "editor account",
    login: "Log in",
    logout: "Log out",
    save: "Save changes",
    saving: "Saving…",
    allSaved: "All changes saved",
    saved: "Saved",
    saveError: "Save failed — try again",
    editorLogin: "Editor login",
    email: "Login / e-mail",
    password: "Password",
    cancel: "Cancel",
    loginFailed: "Login failed. Check your login and password.",
    loggedIn: "Editor logged in.",
    loggedOut: "Logged out.",
    galleryLoading: "The gallery is still loading.",
    startupError: "The gallery could not be started.",
    exploreBelow: "About project",
    quality: "Quality",
    qualityAuto: "Auto",
    qualityHigh: "High",
    qualityBalanced: "Balanced",
    qualitySafe: "Safe"
  }
};

function t(key) {
  return uiText[currentLang][key] || uiText.en[key] || uiText.pl[key] || key;
}

function showToast(message) {
  if (!message || !galleryToast) return;
  galleryToast.textContent = message;
  galleryToast.style.display = "block";
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(function () {
    galleryToast.style.display = "none";
  }, 3600);
}

function isEditorMessageVisible() {
  return !!(
    currentSession &&
    window.GalleryApp &&
    typeof window.GalleryApp.isEditModeActive === "function" &&
    window.GalleryApp.isEditModeActive()
  );
}

function updateAuthUi() {
  const isLoggedIn = !!currentSession;
  window.galleryEditorAuthenticated = isLoggedIn;

  if (loginButton) loginButton.classList.toggle("hidden", isLoggedIn);
  if (logoutButton) logoutButton.classList.toggle("hidden", !isLoggedIn);
  // Public index is viewer-only. Saving/editing belongs exclusively to admin.html.
  if (saveStateButton) saveStateButton.classList.add("hidden");
  if (adminWorkspaceButton) adminWorkspaceButton.classList.toggle("hidden", !isLoggedIn);

  if (authStatus) {
    authStatus.textContent = isLoggedIn
      ? t("editorLoggedIn") + (currentSession.user.email || t("editorAccount"))
      : t("publicGallery");
  }

  if (window.GalleryApp) window.GalleryApp.setEditorAuthenticated(isLoggedIn);
}

function setSession(session) {
  currentSession = session || null;
  updateAuthUi();
}

function applyLanguage(lang) {
  currentLang = lang === "en" ? "en" : "pl";
  localStorage.setItem("berryboy_art_gallery_lang", currentLang);
  document.documentElement.setAttribute("lang", currentLang);
  document.documentElement.setAttribute("data-page-lang", currentLang);

  document.querySelectorAll("[data-set-lang]").forEach(function (button) {
    button.classList.toggle("active", button.getAttribute("data-set-lang") === currentLang);
  });

  if (loginButton) loginButton.textContent = t("login");
  if (logoutButton) logoutButton.textContent = t("logout");
  if (saveStateButton && !saveStateButton.dataset.saveState) saveStateButton.textContent = t("save");
  if (exploreBelowButton) exploreBelowButton.textContent = t("exploreBelow");
  if (authModalTitle) authModalTitle.textContent = t("editorLogin");
  if (authEmailLabel) authEmailLabel.textContent = t("email");
  if (authPasswordLabel) authPasswordLabel.textContent = t("password");
  if (cancelLoginButton) cancelLoginButton.textContent = t("cancel");
  if (submitLoginButton) submitLoginButton.textContent = t("login");
  if (mobileQualityLabel) mobileQualityLabel.textContent = t("quality");
  if (mobileQualityOptionAuto) mobileQualityOptionAuto.textContent = t("qualityAuto");
  if (mobileQualityOptionHigh) mobileQualityOptionHigh.textContent = t("qualityHigh");
  if (mobileQualityOptionBalanced) mobileQualityOptionBalanced.textContent = t("qualityBalanced");
  if (mobileQualityOptionSafe) mobileQualityOptionSafe.textContent = t("qualitySafe");

  if (window.BerryboyBootGuard && typeof window.BerryboyBootGuard.setLanguage === "function") {
    window.BerryboyBootGuard.setLanguage(currentLang);
  }
  updateAuthUi();
}

function getEditorContext() {
  return {
    supabase,
    t,
    showToast,
    setSession,
    getSession: function () { return currentSession; }
  };
}

async function loadEditorModule() {
  if (!editorModulePromise) {
    editorModulePromise = import(`./gallery-editor-bootstrap.js?v=${ENGINE_CACHE_KEY}`).then(function (module) {
      module.initializeEditorRuntime(getEditorContext());
      return module;
    });
  }
  return editorModulePromise;
}

document.querySelectorAll("[data-set-lang]").forEach(function (button) {
  button.addEventListener("click", function () {
    applyLanguage(button.getAttribute("data-set-lang"));
  });
});

if (adminWorkspaceButton) {
  adminWorkspaceButton.addEventListener("click", function (event) {
    event.preventDefault();
    const active = window.GalleryApp && window.GalleryApp.getActiveExhibition ? window.GalleryApp.getActiveExhibition() : null;
    openInlineAdminWorkspace(active && active.id ? active.id : getRequestedExhibitionId()).catch(function (error) {
      console.warn("Inline Admin Workspace open failed:", error);
    });
  });
}

if (loginButton) {
  loginButton.addEventListener("pointerenter", function () {
    loadEditorModule().catch(function () {});
  }, { once: true });

  loginButton.addEventListener("click", async function () {
    const editorModule = await loadEditorModule();
    editorModule.openEditorLogin();
  });
}

// Public visitors only receive visitor-facing messages. Technical/editor notices are
// visible only to an authenticated user who is actually inside Edit Mode.
window.addEventListener("gallery-status", function (event) {
  const detail = event.detail || {};
  const audience = detail.audience || "editor";

  if (audience === "debug") {
    if (isEditorMessageVisible()) console.info("Gallery debug status:", detail);
    return;
  }

  if (audience === "editor" && !isEditorMessageVisible()) return;
  if (audience !== "editor" && audience !== "visitor" && audience !== "all") return;
  showToast(detail.message);
});

window.addEventListener("gallery-debug-status", function (event) {
  if (isEditorMessageVisible()) console.info("Gallery startup diagnostic:", event.detail || {});
});

function getStoredMobileQualityMode() {
  try {
    const value = String(localStorage.getItem("berryboy_mobile_quality_mode") || "auto").toLowerCase();
    return ["auto", "high", "balanced", "safe"].includes(value) ? value : "auto";
  } catch (_error) {
    return "auto";
  }
}

function syncMobileQualityControl(detail) {
  if (!mobileQualitySelect) return;
  let mode = detail && detail.mode ? detail.mode : null;

  if (!mode && window.GalleryApp && typeof window.GalleryApp.getMobileQuality === "function") {
    const state = window.GalleryApp.getMobileQuality();
    mode = state && state.mode;
  }

  mobileQualitySelect.value = ["auto", "high", "balanced", "safe"].includes(mode)
    ? mode
    : getStoredMobileQualityMode();
}

if (mobileQualitySelect) {
  mobileQualitySelect.value = getStoredMobileQualityMode();
  mobileQualitySelect.addEventListener("change", function () {
    const mode = mobileQualitySelect.value;
    try { localStorage.setItem("berryboy_mobile_quality_mode", mode); } catch (_error) {}

    if (window.GalleryApp && typeof window.GalleryApp.setMobileQualityMode === "function") {
      const state = window.GalleryApp.setMobileQualityMode(mode);
      syncMobileQualityControl(state);
    }
  });
}

window.addEventListener("gallery-mobile-quality-change", function (event) {
  syncMobileQualityControl(event.detail || null);
});

applyLanguage(currentLang);

const bootGuard = window.BerryboyBootGuard || {
  setLanguage: function () {},
  setPhase: function () {},
  waitForStart: function () { return Promise.resolve(); },
  ready: function () {},
  fail: function () {}
};

function failGalleryBoot(code, message, error) {
  console.error("Gallery boot failure:", code, error || "");
  bootGuard.fail(code, message || t("startupError"), error);
  if (startupError) {
    startupError.style.display = "none";
    startupError.textContent = "";
  }
}

function loadClassicScript(src, id) {
  const existing = id ? document.getElementById(id) : null;
  if (existing && existing.dataset.loaded === "true") return Promise.resolve(existing);

  return new Promise(function (resolve, reject) {
    const script = existing || document.createElement("script");
    script.src = src;
    script.async = true;
    if (id) script.id = id;

    function cleanup() {
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    }

    function onLoad() {
      cleanup();
      script.dataset.loaded = "true";
      resolve(script);
    }

    function onError() {
      cleanup();
      reject(new Error(`Could not load dependency: ${src}`));
    }

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!existing) document.head.appendChild(script);
  });
}

async function ensureBabylonDependencies() {
  bootGuard.setPhase("dependencies", "Babylon runtime");
  await loadClassicScript("https://cdn.babylonjs.com/babylon.js", "berryboyBabylonRuntime");
  await loadClassicScript("https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js", "berryboyBabylonLoaders");

  if (!window.BABYLON || !window.BABYLON.Engine) {
    throw new Error("BABYLON.Engine is unavailable after dependency loading.");
  }
}

function installCanvasContextRecovery(targetCanvas, getEngine) {
  targetCanvas.addEventListener("webglcontextcreationerror", function (event) {
    failGalleryBoot("webgl-context-creation", t("startupError"), event && event.statusMessage ? event.statusMessage : event);
  });

  targetCanvas.addEventListener("webglcontextlost", function (event) {
    event.preventDefault();
    const engine = typeof getEngine === "function" ? getEngine() : null;
    if (engine && engine.stopRenderLoop) engine.stopRenderLoop();
    failGalleryBoot("webgl-context-lost", t("startupError"), event);
  });

  targetCanvas.addEventListener("webglcontextrestored", function () {
    failGalleryBoot("webgl-context-restored-reload", t("startupError"));
  });
}

installCanvasContextRecovery(canvas, function () { return activeEngine; });

function waitForInteractionReady(timeoutMs) {
  return new Promise(function (resolve, reject) {
    let timeoutId = 0;

    function cleanup() {
      window.removeEventListener("gallery-interaction-ready", onReady);
      window.removeEventListener("gallery-startup-failure", onFailure);
      window.clearTimeout(timeoutId);
    }

    function onReady(event) {
      cleanup();
      resolve(event.detail || {});
    }

    function onFailure(event) {
      cleanup();
      const detail = event.detail || {};
      reject(new Error(detail.technicalMessage || detail.message || "Gallery startup failed."));
    }

    window.addEventListener("gallery-interaction-ready", onReady, { once: true });
    window.addEventListener("gallery-startup-failure", onFailure, { once: true });
    timeoutId = window.setTimeout(function () {
      cleanup();
      reject(new Error("Gallery interaction-ready gate timed out."));
    }, timeoutMs || 120000);
  });
}

function installResizeRuntime(engine) {
  // Stage C6C1: mobile DPR and resize are owned by Gallery_V0_11 through the
  // normalized gallery-mobile-viewport-change event. Bootstrap owns desktop resize only.
  let mobileOwner = false;
  try {
    const viewportState = window.BerryboyMobileViewport && window.BerryboyMobileViewport.read
      ? window.BerryboyMobileViewport.read()
      : null;
    mobileOwner = !!(viewportState && viewportState.mobile);
  } catch (error) {}

  if (mobileOwner) return;

  let resizeFrame = 0;
  function scheduleEngineResize() {
    if (resizeFrame) return;
    resizeFrame = window.requestAnimationFrame(function () {
      resizeFrame = 0;
      engine.resize();
    });
  }

  window.addEventListener("resize", scheduleEngineResize, { passive: true });
  window.addEventListener("orientationchange", scheduleEngineResize, { passive: true });
  scheduleEngineResize();
}

async function startGalleryRuntime() {
  if (galleryStartPromise) return galleryStartPromise;

  galleryStartPromise = (async function () {
    // Give the persistent asset cache a chance to claim this page before heavy Storage requests begin.
    await assetCacheReadyPromise;
    await ensureBabylonDependencies();

    bootGuard.setPhase("engine-module", "Gallery engine module");
    const engineModule = await import(`../Gallery_V0_11.min.js?v=${ENGINE_CACHE_KEY}`);
    if (!engineModule || typeof engineModule.createScene !== "function") {
      throw new Error("The gallery scene factory is unavailable.");
    }

    // Register the listener before createScene(), so a fast readiness signal cannot be missed.
    const interactionReadyPromise = waitForInteractionReady(120000);

    bootGuard.setPhase("engine", "WebGL engine");
    const engine = new window.BABYLON.Engine(canvas, true, {
      preserveDrawingBuffer: false,
      stencil: true,
      antialias: true,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false,
      adaptToDeviceRatio: false
    });
    activeEngine = engine;

    bootGuard.setPhase("scene", "Gallery scene");
    const requestedExhibitionId = getRequestedExhibitionId();
    const publicExhibitionId = await resolvePublishedExhibitionId(requestedExhibitionId);
    if (publicExhibitionId !== requestedExhibitionId) {
      try {
        const nextUrl = new URL(location.href);
        nextUrl.searchParams.set("exhibition", publicExhibitionId);
        history.replaceState(null, "", nextUrl);
      } catch (_error) {}
    }
    const navigationHandoff = readNavigationHandoff(publicExhibitionId);
    const scene = engineModule.createScene(engine, canvas, {
      spaceDefinition: gallerySpaceDefinition,
      exhibitionId: publicExhibitionId,
      initialExhibitionSnapshot: navigationHandoff || null
    });
    activeScene = scene;
    updateAuthUi();

    engine.runRenderLoop(function () { scene.render(); });
    installResizeRuntime(engine);
    syncMobileQualityControl();

    await interactionReadyPromise;

    if (mobileQualitySelect && window.GalleryApp && typeof window.GalleryApp.setMobileQualityMode === "function") {
      const currentState = window.GalleryApp.getMobileQuality();
      if (!currentState || currentState.mode !== mobileQualitySelect.value) {
        window.GalleryApp.setMobileQualityMode(mobileQualitySelect.value);
      }
    }
    syncMobileQualityControl();

    window.BerryboyViewerRuntime = {
      stage: STAGE,
      schema: "click-start-original-intro-stage3.v1",
      engine,
      scene,
      supabase,
      deviceProfile: window.BerryboyArtGalleryDeviceProfile || null,
      getSession: function () { return currentSession; },
      loadEditorModule,
      startedAfterExplicitClick: true,
      originalInstructionalPopupRestored: true
    };

    // Hide the page loader first, then show and verify the exact engine-owned popup from Stage 12C66A1.
    bootGuard.ready();
    window.requestAnimationFrame(function () {
      if (window.GalleryApp && typeof window.GalleryApp.showViewerIntroOverlay === "function") {
        window.GalleryApp.showViewerIntroOverlay();
      }

      window.requestAnimationFrame(function () {
        const introOverlay = document.getElementById("berryboyViewerIntroOverlay");
        const introCard = document.getElementById("berryboyViewerIntroCard");
        const introVisible = !!(
          introOverlay &&
          introCard &&
          introOverlay.style.display !== "none" &&
          window.getComputedStyle(introOverlay).display !== "none"
        );

        if (!introVisible) {
          failGalleryBoot(
            "instruction-popup-missing",
            t("startupError"),
            new Error("The accepted instructional popup was not mounted after interaction readiness.")
          );
          return;
        }

        window.dispatchEvent(new CustomEvent("gallery-instruction-popup-confirmed", {
          detail: { stage: STAGE, confirmedAt: Date.now() }
        }));
      });
    });

    return window.BerryboyViewerRuntime;
  })().catch(function (error) {
    failGalleryBoot("bootstrap-exception", t("startupError"), error);
    throw error;
  });

  return galleryStartPromise;
}

async function initializeAuthRuntime() {
  supabase.auth.onAuthStateChange(function (_event, session) {
    setSession(session);
    if (session) {
      loadEditorModule().catch(function (error) {
        console.warn("Editor bootstrap warning:", error);
      });
    }
  });

  try {
    const sessionResult = await supabase.auth.getSession();
    setSession(sessionResult.data.session || null);
    if (currentSession) await loadEditorModule();
  } catch (error) {
    // Authentication status must never block the public visitor startup.
    console.warn("Editor session bootstrap warning:", error);
    setSession(null);
  }
}

// Start the editor-session check in parallel. The public gallery remains able to
// start immediately after the explicit visitor click even if auth is slow or offline.
initializeAuthRuntime().catch(function (error) {
  console.warn("Editor auth runtime warning:", error);
});

try {
  await bootGuard.waitForStart();
  await startGalleryRuntime();
} catch (error) {
  if (!bootGuard.getState || bootGuard.getState() !== "error") {
    failGalleryBoot("bootstrap-exception", t("startupError"), error);
  }
}
