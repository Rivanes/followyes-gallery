/*
  Exhibition Platform — V13.5 — Reference / Runtime Hardening
  Save Integrity Repair / Correct Startup Rebuild.
  Babylon, GLB loaders and the gallery engine start only after an explicit visitor click.
  The engine-owned instructional popup is shown after true interaction readiness; C6C8C16 keeps its mobile CTA pinned.
*/

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { registerExhibitionAssetCache, getExhibitionAssetDeliveryStats } from "./asset-cache-bootstrap.js?v=c6c8c22_gallery_management_20260908";
import { beginTransitionGuard, endTransitionGuard, isTransitionGuardActive } from "./transition-guard.js?v=c6c8c22_gallery_management_20260908";
import { createExhibitionDataAdapter, resolveInitialPublicRuntime, listPublicExhibitionCards } from "../data/exhibition-api.js?v=c6c8c25_cross_space_runtime";
import { createSceneLifecycleController, getRuntimeVenueVersionKey } from "../runtime/scene-lifecycle-controller.js?v=c6c8c25_2_admin_gallery_preview";
import { shouldShowPublicSpaceIntro } from "../runtime/public-space-entry-policy.js?v=v13_2_left_workspace_asset_manager";

const STAGE = "V13.5";
const ENGINE_CACHE_KEY = "v13_5_reference_runtime_hardening_20260909";
const SUPABASE_URL = "https://bazbszvhoxmuekxahokc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_iCDi8Ls8ZMvqQgcAuE78MQ_OnPVWqfn";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
window.gallerySupabase = supabase;

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
  // C6C8C15: never query the Service Worker on the click path. The Asset Delivery
  // panel keeps session-level network telemetry; this record measures UI latency only.
  return publishTransitionNetworkDiagnostic({
    type: "workspace-mode",
    from: fromLabel,
    to: toLabel,
    mode: engineRecord && engineRecord.mode ? engineRecord.mode : "zero-work-public-return",
    draftPreserved: !!(engineRecord && engineRecord.draftPreserved),
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
let initialPublicExhibitionReference = null;

function getRequestedExhibitionId() {
  try { const params = new URLSearchParams(window.location.search); return (params.get("exhibition") || "main").trim() || "main"; } catch (error) { return "main"; }
}

function hasExplicitExhibitionSelection() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.has("exhibition") && !!String(params.get("exhibition") || "").trim();
  } catch (_error) { return false; }
}

function isHardDocumentReload() {
  try {
    const entries = performance && typeof performance.getEntriesByType === "function"
      ? performance.getEntriesByType("navigation")
      : [];
    if (entries && entries.length) return entries[0].type === "reload";
  } catch (_error) {}
  try {
    return !!(performance && performance.navigation && performance.navigation.type === 1);
  } catch (_error) { return false; }
}

function resetPublicEntryToHomepageOnReload() {
  if (!isHardDocumentReload()) return false;
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("exhibition");
    history.replaceState({ exhibition: null, homepage: true, reason: "document-reload" }, "", url);
  } catch (_error) {}
  return true;
}

function publicDiscoveryAssetUrl(value) {
  const path = String(value || "").trim();
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/storage/")) return `${SUPABASE_URL}${path}`;
  return path;
}

function ensurePublicDiscoveryStyles() {
  if (document.getElementById("c26HomepageExhibitionStyles")) return;
  const style = document.createElement("style");
  style.id = "c26HomepageExhibitionStyles";
  style.textContent = `
    #c25HomepageExhibitionSelection{position:absolute;inset:0;z-index:7600;display:grid;grid-template-rows:auto minmax(0,1fr);background:radial-gradient(circle at 50% 20%,rgba(111,65,75,.16),transparent 40%),#0d0f0e;color:#f0eade;font-family:Inter,system-ui,sans-serif;overflow:auto}
    #c25HomepageExhibitionSelection[hidden]{display:none}
    #c25HomepageExhibitionHeader{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;padding:clamp(28px,5vw,70px) clamp(20px,5vw,70px) 20px;border-bottom:1px solid rgba(255,255,255,.12)}
    #c25HomepageExhibitionHeader h1{margin:0;font-size:clamp(32px,5vw,70px);line-height:.92;letter-spacing:-.055em}
    #c25HomepageExhibitionHeader p{max-width:620px;margin:8px 0 0;color:rgba(240,234,222,.62);font-size:13px;line-height:1.55}
    #c26HomepageExhibitionCarousel{position:relative;min-height:0;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px;padding:24px clamp(16px,4vw,56px) 42px;overflow:hidden}
    #c26HomepageExhibitionViewport{min-width:0;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;scroll-padding-inline:clamp(0px,7vw,90px);overscroll-behavior-inline:contain;touch-action:pan-x pan-y;scrollbar-width:none}
    #c26HomepageExhibitionViewport::-webkit-scrollbar{display:none}
    #c26HomepageExhibitionTrack{display:flex;align-items:stretch;justify-content:center;gap:clamp(14px,1.2vw,22px);width:max-content;min-width:100%;box-sizing:border-box;padding:4px 1px 14px}
    .c26ExhibitionCard{position:relative;flex:0 0 clamp(270px,34vw,430px);min-height:clamp(320px,54vh,600px);display:flex;align-items:flex-end;scroll-snap-align:center;border:1px solid rgba(255,255,255,.14);border-radius:16px;overflow:hidden;background:#131614;color:inherit;text-align:left;cursor:pointer;padding:0;font:inherit;transition:transform 180ms ease,border-color 180ms ease,opacity 180ms ease;opacity:.72}
    .c26ExhibitionCard:hover,.c26ExhibitionCard:focus-visible,.c26ExhibitionCard.is-active{border-color:rgba(240,234,222,.54);opacity:1;transform:translateY(-2px);outline:none}
    .c26ExhibitionCover{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
    .c26ExhibitionCardBody{position:relative;z-index:2;width:100%;padding:24px;background:linear-gradient(180deg,transparent,rgba(5,6,5,.95) 36%)}
    .c26ExhibitionVenue{font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:rgba(240,234,222,.58)}
    .c26ExhibitionCard h2{margin:7px 0 8px;font-size:clamp(26px,3vw,44px);letter-spacing:-.045em;line-height:.98}
    .c26ExhibitionCard p{margin:0;color:rgba(240,234,222,.7);font-size:12px;line-height:1.5}
    .c26ExhibitionCard--titleOnly{align-items:center;justify-content:center;background:#151816}
    .c26ExhibitionCard--titleOnly .c26ExhibitionCardBody{display:grid;place-items:center;min-height:100%;padding:clamp(28px,5vw,64px);background:none;text-align:center}
    .c26ExhibitionCard--titleOnly h2{margin:0;max-width:9ch;font-size:clamp(34px,5vw,66px);line-height:.92}
    .c26CarouselNav{width:44px;height:44px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.18);border-radius:999px;background:rgba(13,15,14,.82);color:#f0eade;font:inherit;font-size:22px;cursor:pointer}
    .c26CarouselNav:hover,.c26CarouselNav:focus-visible{border-color:rgba(240,234,222,.58);outline:none}
    .c26CarouselNav:disabled{opacity:.24;cursor:default}
    @media(max-width:700px){#c25HomepageExhibitionHeader{align-items:flex-start;flex-direction:column;padding-top:22px}#c26HomepageExhibitionCarousel{grid-template-columns:minmax(0,1fr);padding:18px 0 26px}.c26CarouselNav{display:none}#c26HomepageExhibitionViewport{scroll-padding-inline:20px;padding-inline:20px}.c26ExhibitionCard{flex-basis:min(82vw,360px);min-height:min(58vh,480px)}}
  `;
  document.head.appendChild(style);
}

async function ensurePublicExhibitionSelection(options = {}) {
  if (options.force !== true && hasExplicitExhibitionSelection()) return getRequestedExhibitionId();
  let cards = [];
  try { cards = await listPublicExhibitionCards(supabase); }
  catch (error) { console.warn("Public Exhibition discovery unavailable; using canonical fallback.", error); return getRequestedExhibitionId(); }
  if (!cards.length) return getRequestedExhibitionId();
  ensurePublicDiscoveryStyles();
  const host = document.getElementById("gallerySection") || document.body;
  let landing = document.getElementById("c25HomepageExhibitionSelection");
  if (!landing) {
    landing = document.createElement("section");
    landing.id = "c25HomepageExhibitionSelection";
    landing.setAttribute("aria-label", "Exhibition selection");
    host.appendChild(landing);
  }
  const pl = currentLang === "pl";
  landing.hidden = false;
  landing.innerHTML = "";
  const header = document.createElement("div"); header.id = "c25HomepageExhibitionHeader";
  const intro = document.createElement("div");
  const title = document.createElement("h1"); title.textContent = pl ? "Wybierz wystawę" : "Choose an exhibition";
  const copy = document.createElement("p"); copy.textContent = pl ? "Wybierz wystawę, aby od razu wejść do jej opublikowanej przestrzeni 3D." : "Choose an exhibition to enter its Published 3D Gallery immediately.";
  intro.append(title, copy); header.append(intro); landing.append(header);

  const carousel = document.createElement("div"); carousel.id = "c26HomepageExhibitionCarousel";
  const previous = document.createElement("button"); previous.type = "button"; previous.className = "c26CarouselNav"; previous.setAttribute("aria-label", pl ? "Poprzednia wystawa" : "Previous exhibition"); previous.textContent = "‹";
  const viewport = document.createElement("div"); viewport.id = "c26HomepageExhibitionViewport"; viewport.setAttribute("role", "group"); viewport.setAttribute("aria-label", pl ? "Karuzela wystaw" : "Exhibition carousel");
  const track = document.createElement("div"); track.id = "c26HomepageExhibitionTrack"; viewport.append(track);
  const next = document.createElement("button"); next.type = "button"; next.className = "c26CarouselNav"; next.setAttribute("aria-label", pl ? "Następna wystawa" : "Next exhibition"); next.textContent = "›";
  carousel.append(previous, viewport, next); landing.append(carousel);

  return new Promise((resolve) => {
    const cardButtons = [];
    let activeIndex = 0;
    let scrollFrame = 0;

    function setActiveCard(index, behavior = {}) {
      const last = Math.max(0, cardButtons.length - 1);
      activeIndex = Math.max(0, Math.min(last, Number(index) || 0));
      cardButtons.forEach((cardButton, cardIndex) => {
        const active = cardIndex === activeIndex;
        cardButton.classList.toggle("is-active", active);
        if (active) cardButton.setAttribute("aria-current", "true"); else cardButton.removeAttribute("aria-current");
      });
      previous.disabled = activeIndex <= 0;
      next.disabled = activeIndex >= last;
      const activeCard = cardButtons[activeIndex];
      if (activeCard && behavior.focus === true) activeCard.focus({ preventScroll: true });
      if (activeCard && behavior.scroll !== false) activeCard.scrollIntoView({ behavior: behavior.instant === true ? "auto" : "smooth", block: "nearest", inline: "center" });
    }

    function selectReference(card) {
      landing.hidden = true;
      if (bootGuard && typeof bootGuard.start === "function" && (!bootGuard.getState || bootGuard.getState() === "prestart")) bootGuard.start();
      resolve(card.slug || card.id);
    }

    for (const card of cards) {
      const button = document.createElement("button"); button.type = "button"; button.className = "c26ExhibitionCard";
      button.setAttribute("aria-label", `${pl ? "Otwórz wystawę" : "Open exhibition"}: ${card.title}`);
      const cover = publicDiscoveryAssetUrl(card.mobileCoverUrl || card.coverUrl);
      const body = document.createElement("div"); body.className = "c26ExhibitionCardBody";
      const heading = document.createElement("h2"); heading.textContent = card.title;
      if (cover) {
        const img = document.createElement("img"); img.className = "c26ExhibitionCover"; img.alt = ""; img.src = cover; button.appendChild(img);
        const venue = document.createElement("div"); venue.className = "c26ExhibitionVenue"; venue.textContent = card.venueName || (pl ? "Galeria" : "Gallery");
        const desc = document.createElement("p"); desc.textContent = card.description || card.subtitle || "";
        body.append(venue, heading); if (desc.textContent) body.append(desc);
      } else {
        button.classList.add("c26ExhibitionCard--titleOnly");
        body.append(heading);
      }
      button.appendChild(body);
      const index = cardButtons.length;
      button.addEventListener("focus", () => setActiveCard(index, { scroll: true }));
      button.addEventListener("click", () => selectReference(card), { once: true });
      cardButtons.push(button);
      track.appendChild(button);
    }

    previous.addEventListener("click", () => setActiveCard(activeIndex - 1, { focus: true }));
    next.addEventListener("click", () => setActiveCard(activeIndex + 1, { focus: true }));
    viewport.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") { event.preventDefault(); setActiveCard(activeIndex + 1, { focus: true }); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); setActiveCard(activeIndex - 1, { focus: true }); }
      else if (event.key === "Home") { event.preventDefault(); setActiveCard(0, { focus: true }); }
      else if (event.key === "End") { event.preventDefault(); setActiveCard(cardButtons.length - 1, { focus: true }); }
    });
    viewport.addEventListener("scroll", () => {
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        const viewportBox = viewport.getBoundingClientRect();
        const viewportCenter = viewportBox.left + viewportBox.width / 2;
        let nearestIndex = activeIndex;
        let nearestDistance = Infinity;
        cardButtons.forEach((cardButton, index) => {
          const box = cardButton.getBoundingClientRect();
          const distance = Math.abs((box.left + box.width / 2) - viewportCenter);
          if (distance < nearestDistance) { nearestDistance = distance; nearestIndex = index; }
        });
        setActiveCard(nearestIndex, { scroll: false });
      });
    }, { passive: true });
    setActiveCard(0, { scroll: false });
  });
}

const publicSpaceEntryDebug = {
  stage: "V13.5",
  schema: "public-space-entry-policy.v1",
  evaluations: 0,
  shows: 0,
  hides: 0,
  last: null
};
window.ExhibitionPlatformPublicSpaceEntryDebug = publicSpaceEntryDebug;

function applyPublicSpaceIntroPolicy(previousRuntime, nextRuntime, options = {}) {
  const show = shouldShowPublicSpaceIntro(previousRuntime, nextRuntime, options);
  const app = window.GalleryApp || null;
  publicSpaceEntryDebug.evaluations += 1;
  publicSpaceEntryDebug.last = {
    reason: options.reason || "public-space-entry",
    previousVenueVersionId: getRuntimeVenueVersionKey(previousRuntime) || null,
    nextVenueVersionId: getRuntimeVenueVersionKey(nextRuntime) || null,
    show,
    at: Date.now()
  };
  if (show) {
    publicSpaceEntryDebug.shows += 1;
    if (app && typeof app.showViewerIntroOverlay === "function") app.showViewerIntroOverlay();
  } else {
    publicSpaceEntryDebug.hides += 1;
    if (app && typeof app.hideViewerIntroOverlay === "function") app.hideViewerIntroOverlay();
  }
  return show;
}

function updatePublicRuntimeIdentity(runtime, historyMode = "replace") {
  if (!runtime || !runtime.exhibition) return;
  const exhibition = runtime.exhibition;
  const ref = exhibition.slug || exhibition.id;
  try {
    const nextUrl = new URL(location.href);
    nextUrl.searchParams.set("exhibition", ref);
    if (historyMode === "push") history.pushState({ exhibition: ref }, "", nextUrl);
    else history.replaceState({ exhibition: ref }, "", nextUrl);
  } catch (_error) {}
  try { document.title = `${exhibition.name} — Exhibition Platform`; } catch (_error) {}
}

async function switchPublicExhibition(reference, options = {}) {
  if (!sceneLifecycleController || !publicExhibitionData || !activeEngine) return false;
  if (isTransitionGuardActive()) return false;
  publicExhibitionData.setMode("public");
  const targetRuntime = await publicExhibitionData.resolveRuntime(reference, { force: true });
  const currentRuntime = sceneLifecycleController.getActiveRuntime();
  if (currentRuntime && currentRuntime.mode === "public" && currentRuntime.exhibition && currentRuntime.exhibition.id === targetRuntime.exhibition.id && getRuntimeVenueVersionKey(currentRuntime) === getRuntimeVenueVersionKey(targetRuntime)) {
    updatePublicRuntimeIdentity(targetRuntime, options.historyMode || "push");
    activePublicRuntime = targetRuntime;
    return true;
  }
  const crossSpace = getRuntimeVenueVersionKey(currentRuntime) !== getRuntimeVenueVersionKey(targetRuntime);
  const guardToken = await beginTransitionGuard({
    title: `Opening ${targetRuntime.exhibition.name}…`,
    detail: crossSpace ? "Switching Gallery space without reloading the page." : "Switching exhibition in the current Gallery.",
    minVisibleMs: 150
  });
  if (!guardToken) return false;
  try {
    const result = await sceneLifecycleController.switchTo(reference, {
      runtime: targetRuntime,
      forceRemote: true,
      reason: "public-exhibition-switch",
      sceneOptions: { adminWorkspace: false }
    });
    activeScene = sceneLifecycleController.getActiveScene();
    activePublicRuntime = sceneLifecycleController.getActiveRuntime();
    if (window.GalleryApp && typeof window.GalleryApp.setExhibitionDataMode === "function") window.GalleryApp.setExhibitionDataMode("public");
    applyPublicSpaceIntroPolicy(currentRuntime, activePublicRuntime || targetRuntime, { reason: "public-exhibition-switch" });
    updatePublicRuntimeIdentity(activePublicRuntime || targetRuntime, options.historyMode || "push");
    syncMobileQualityControl();
    if (activeEngine && activeEngine.resize) activeEngine.resize();
    return !!(result && result.ok);
  } catch (error) {
    activeScene = sceneLifecycleController.getActiveScene();
    activePublicRuntime = sceneLifecycleController.getActiveRuntime();
    showToast(`Could not open exhibition: ${error && error.message ? error.message : error}`);
    return false;
  } finally {
    await endTransitionGuard(guardToken);
  }
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
    if (!parsed.state || typeof parsed.state !== "object") return null;
    if (Date.now() - Number(parsed.createdAt || 0) > 120000) return null;
    if (spaceId && String(parsed.spaceId || spaceId) !== String(spaceId)) return null;
    if (venueVersionId && parsed.venueVersionId && String(parsed.venueVersionId) !== String(venueVersionId)) return null;
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
const exhibitionsButton = document.getElementById("exhibitionsButton");
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
let activePublicRuntime = null;
let sceneLifecycleController = null;
let galleryEngineModule = null;
let publicExhibitionData = null;
let galleryStartPromise = null;
let currentLang = localStorage.getItem("berryboy_art_gallery_lang") || "en";

let inlineAdminModulePromise = null;
let inlineAdminWorkspaceMounted = false;
let crossSpaceAdminDraftSnapshot = null;
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
    #inlineAdminWorkspace #assetDeliveryStatus, #inlineAdminWorkspace #networkDiagnostics, #inlineAdminViewportToolbar > .fieldMeta { display:none !important; }
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
        <section class="workspaceSection"><div class="sectionHead"><div><h2>Exhibitions</h2><p>Switch the active exhibition or create a new one with its assigned Gallery Draft.</p></div><button id="refreshExhibitionsButton" class="adminButton" type="button">↻</button></div><div class="sectionBody"><form id="createExhibitionForm"><input id="newExhibitionName" class="adminInput" maxlength="120" placeholder="New exhibition name" autocomplete="off"/><button id="createExhibitionButton" class="adminButton primary" type="submit">CREATE</button></form><div style="height:10px"></div><div id="exhibitionList"><div class="fieldMeta">Loading exhibition catalog…</div></div></div></section>
        <section class="workspaceSection"><div class="sectionHead"><div><h2>Exhibition details</h2><p>Metadata used by the admin workspace and the future public carousel.</p></div></div><div class="sectionBody"><form id="detailsForm"><label class="fieldLabel">Name<input id="exhibitionName" class="adminInput" maxlength="120" required/></label><label class="fieldLabel">Description<textarea id="exhibitionDescription" class="adminTextarea" maxlength="4000" placeholder="Short exhibition description"></textarea></label><div class="inlineFields"><label class="fieldLabel">Slug<input id="exhibitionSlug" class="adminInput" readonly/></label><label class="fieldLabel">Order<input id="exhibitionSortOrder" class="adminInput" type="number" step="1"/></label></div><div class="fieldMeta">Public status: <strong id="exhibitionPublicationStatus">—</strong></div><div class="fieldLabel">Poster / cover</div><div class="posterCard"><img id="posterPreview" alt="Exhibition poster preview"/><div class="posterActions"><button id="choosePosterButton" class="adminButton" type="button">UPLOAD / REPLACE</button><button id="removePosterButton" class="adminButton danger" type="button">REMOVE</button><div id="posterStatus" class="fieldMeta">No poster assigned.</div><input id="posterFileInput" type="file" accept="image/jpeg,image/png,image/webp,image/avif"/></div></div><div class="fieldMeta">Gallery: <strong id="exhibitionSpaceId">—</strong></div><button id="saveMetadataButton" class="adminButton primary" type="submit">SAVE EXHIBITION DETAILS</button></form></div></section>
      </aside>
      <main id="inlineAdminMain"><section id="inlineAdminViewportCard"><div id="inlineAdminViewportToolbar"><div><div id="viewportStatus">3D preview: <strong>ready</strong></div><div id="assetDeliveryStatus" class="fieldMeta">Asset delivery: shared engine runtime</div><div id="networkDiagnostics" class="fieldMeta">Network: measuring Storage delivery…</div></div><div class="fieldMeta">One live WebGL engine — the Gallery Scene is recreated only when its immutable Version changes.</div></div><div id="adminViewportStage"><div id="workspaceLoading" class="workspaceLoading hidden"><div class="loadingCard">Preparing Admin Workspace…</div></div></div></section></main>
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
  const preserveDraft = options.preserveDraft === true;
  let discardUnsaved = options.discardUnsaved === true;

  if ((metadataDirty || sceneDirty) && !preserveDraft && !discardUnsaved && !options.force) {
    const action = options.reason === "logout" ? "log out" : "return to the public Viewer";
    discardUnsaved = window.confirm(`You have unsaved Admin changes. Discard them and ${action}?`);
    if (!discardUnsaved) return false;
  }
  if (isTransitionGuardActive()) return false;

  inlineWorkspaceModeSwitchActive = true;
  const activeBefore = window.GalleryApp && window.GalleryApp.getActiveExhibition ? window.GalleryApp.getActiveExhibition() : null;
  const transitionStartedAt = performance.now();
  const currentRuntime = sceneLifecycleController ? sceneLifecycleController.getActiveRuntime() : null;
  const returnSourceRuntime = currentRuntime && currentRuntime.context === "gallery-authoring" ? activePublicRuntime : currentRuntime;
  let publicRuntime = null;
  let crossSpaceReturn = false;

  try {
    if (publicExhibitionData && returnSourceRuntime && returnSourceRuntime.exhibition) {
      publicExhibitionData.setMode("public");
      publicRuntime = await publicExhibitionData.resolveRuntime(returnSourceRuntime.exhibition.id, { force: true });
      crossSpaceReturn = !currentRuntime || currentRuntime.context === "gallery-authoring" || getRuntimeVenueVersionKey(currentRuntime) !== getRuntimeVenueVersionKey(publicRuntime);
    }
  } catch (error) {
    if (publicExhibitionData) publicExhibitionData.setMode("admin");
    inlineWorkspaceModeSwitchActive = false;
    showToast(`Could not resolve Published Gallery: ${error && error.message ? error.message : error}`);
    return false;
  }

  const instantFastPath = !crossSpaceReturn && (preserveDraft || !sceneDirty) && canUseInstantWorkspaceModeSwitch();
  const transitionBeforePromise = instantFastPath ? null : getExhibitionAssetDeliveryStats().catch(() => null);
  let guardToken = null;
  if (!instantFastPath) {
    guardToken = await beginTransitionGuard({
      title: "Returning to Public Page…",
      detail: crossSpaceReturn ? "Restoring the Published Gallery space." : "Finishing pending gallery work before returning to Viewer.",
      minVisibleMs: 120
    });
    if (!guardToken) {
      if (publicExhibitionData) publicExhibitionData.setMode("admin");
      inlineWorkspaceModeSwitchActive = false;
      return false;
    }
  }

  try {
    if (discardUnsaved && metadataDirty && adminModule && typeof adminModule.discardAdminMetadataChanges === "function") {
      adminModule.discardAdminMetadataChanges();
    }

    if (crossSpaceReturn && preserveDraft && sceneDirty && window.GalleryApp && typeof window.GalleryApp.exportState === "function") {
      const active = window.GalleryApp.getActiveExhibition ? window.GalleryApp.getActiveExhibition() : activeBefore;
      crossSpaceAdminDraftSnapshot = {
        schema: "exhibition-navigation-handoff.v1",
        createdAt: Date.now(),
        exhibition: active ? { ...active } : null,
        state: window.GalleryApp.exportState(),
        rowExists: true,
        source: "c25-cross-space-admin-draft",
        venueVersionId: currentRuntime ? getRuntimeVenueVersionKey(currentRuntime) : null,
        spaceId: active && active.space_id ? active.space_id : null
      };
    } else if (discardUnsaved) {
      crossSpaceAdminDraftSnapshot = null;
    }

    if (window.GalleryApp && typeof window.GalleryApp.exitAdminWorkspaceMode === "function") {
      const exited = window.GalleryApp.exitAdminWorkspaceMode({ discardUnsaved, preserveDraft });
      if (!exited) return false;
    }

    if (adminModule && typeof adminModule.suspendAdminWorkspace === "function") {
      const suspendPromise = adminModule.suspendAdminWorkspace({ preserveDraft });
      if (!instantFastPath) await suspendPromise;
      else void Promise.resolve(suspendPromise).catch(() => null);
    }

    if (crossSpaceReturn) {
      if (!sceneLifecycleController || !publicRuntime) throw new Error("Published Cross-Space runtime is unavailable.");
      const result = await sceneLifecycleController.switchTo(publicRuntime.exhibition.id, {
        runtime: publicRuntime,
        forceRemote: true,
        reason: "admin-to-public-cross-space",
        sceneOptions: { adminWorkspace: false }
      });
      if (!result || !result.ok) throw new Error("Published Gallery could not be restored.");
      activeScene = sceneLifecycleController.getActiveScene();
      activePublicRuntime = sceneLifecycleController.getActiveRuntime();
      if (window.GalleryApp && typeof window.GalleryApp.setExhibitionDataMode === "function") window.GalleryApp.setExhibitionDataMode("public");
    } else {
      if (window.GalleryApp && typeof window.GalleryApp.setExhibitionDataMode === "function") window.GalleryApp.setExhibitionDataMode("public");
      if (window.ExhibitionPlatformDataAdapter && typeof window.ExhibitionPlatformDataAdapter.setMode === "function") window.ExhibitionPlatformDataAdapter.setMode("public");
      if (sceneLifecycleController && publicRuntime && typeof sceneLifecycleController.adoptRuntime === "function") {
        sceneLifecycleController.adoptRuntime(publicRuntime, "admin-to-public-same-version");
        activePublicRuntime = publicRuntime;
      }
    }

    const gallerySection = document.getElementById("gallerySection");
    if (gallerySection && gallerySectionHomeParent) {
      if (gallerySectionHomeNextSibling && gallerySectionHomeNextSibling.parentNode === gallerySectionHomeParent) gallerySectionHomeParent.insertBefore(gallerySection, gallerySectionHomeNextSibling);
      else gallerySectionHomeParent.appendChild(gallerySection);
    }
    shell.classList.remove("active");
    document.body.classList.remove("inline-admin-workspace-active");
    if (crossSpaceReturn) applyPublicSpaceIntroPolicy(currentRuntime, activePublicRuntime, { reason: "admin-to-public-cross-space" });

    const active = window.GalleryApp && window.GalleryApp.getActiveExhibition ? window.GalleryApp.getActiveExhibition() : activeBefore;
    if (activePublicRuntime) updatePublicRuntimeIdentity(activePublicRuntime, "replace");
    else if (active) {
      try {
        const url = new URL(location.href);
        url.searchParams.set("exhibition", active.id || "main");
        history.replaceState(null, "", url);
      } catch (_error) {}
    }

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

    if (!instantFastPath && !crossSpaceReturn && window.GalleryApp && typeof window.GalleryApp.waitForForegroundReady === "function") {
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
  } catch (error) {
    if (publicExhibitionData) publicExhibitionData.setMode("admin");
    showToast(`Could not return to Public Page: ${error && error.message ? error.message : error}`);
    return false;
  } finally {
    if (guardToken) await endTransitionGuard(guardToken);
    inlineWorkspaceModeSwitchActive = false;
  }
}

async function openInlineAdminWorkspace(exhibitionId) {
  if (!currentSession || isTransitionGuardActive() || inlineWorkspaceModeSwitchActive) return false;
  if (!activeEngine || !activeScene || !window.GalleryApp || !sceneLifecycleController || !publicExhibitionData) {
    const target = `./admin.html?exhibition=${encodeURIComponent(exhibitionId || getRequestedExhibitionId())}`;
    location.href = target;
    return false;
  }

  inlineWorkspaceModeSwitchActive = true;
  const targetReference = exhibitionId || (window.GalleryApp.getActiveExhibition && window.GalleryApp.getActiveExhibition().id) || "main";
  const foregroundReadyBeforeOpen = canUseInstantWorkspaceModeSwitch();
  publicExhibitionData.setMode("admin");
  let adminRuntime = null;
  try {
    adminRuntime = await publicExhibitionData.resolveRuntime(targetReference, { force: true });
  } catch (error) {
    publicExhibitionData.setMode("public");
    inlineWorkspaceModeSwitchActive = false;
    showToast(`Could not resolve Admin Draft Gallery: ${error && error.message ? error.message : error}`);
    return false;
  }
  const currentRuntime = sceneLifecycleController.getActiveRuntime();
  const crossSpace = getRuntimeVenueVersionKey(currentRuntime) !== getRuntimeVenueVersionKey(adminRuntime);
  const guardToken = await beginTransitionGuard({
    title: "Opening Admin Workspace…",
    detail: crossSpace ? "Opening the Exhibition Draft Gallery space." : "Reusing the live Gallery space.",
    minVisibleMs: 150
  });
  if (!guardToken) {
    publicExhibitionData.setMode("public");
    inlineWorkspaceModeSwitchActive = false;
    return false;
  }

  try {
    let initialSnapshot = null;
    if (crossSpaceAdminDraftSnapshot && crossSpaceAdminDraftSnapshot.exhibition &&
        String(crossSpaceAdminDraftSnapshot.exhibition.id) === String(adminRuntime.exhibition.id) &&
        String(crossSpaceAdminDraftSnapshot.venueVersionId || "") === String(getRuntimeVenueVersionKey(adminRuntime))) {
      initialSnapshot = crossSpaceAdminDraftSnapshot;
    }

    const preserveResidentDraftPreview = !crossSpace && window.GalleryApp && typeof window.GalleryApp.isDraftPreviewActive === "function" && window.GalleryApp.isDraftPreviewActive();
    const result = await sceneLifecycleController.switchTo(adminRuntime.exhibition.id, {
      runtime: adminRuntime,
      forceRemote: true,
      reloadCurrent: !!(currentRuntime && currentRuntime.mode !== "admin" && !preserveResidentDraftPreview),
      reason: "public-to-admin-runtime",
      initialSnapshot,
      sceneOptions: { adminWorkspace: crossSpace }
    });
    if (!result || !result.ok) throw new Error("Admin Draft runtime could not be opened.");
    if (initialSnapshot) crossSpaceAdminDraftSnapshot = null;
    activeScene = sceneLifecycleController.getActiveScene();

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
      lifecycle: sceneLifecycleController,
      supabase,
      session: currentSession,
      exhibitionId: adminRuntime.exhibition.id,
      close: closeInlineAdminWorkspace,
      onSessionLost: () => closeInlineAdminWorkspace({ discardUnsaved: true, force: true })
    });
    window.__EXHIBITION_INLINE_ADMIN_CONTEXT__ = inlineContext;
    window.ExhibitionPlatformDataAdapter = publicExhibitionData;
    if (window.ExhibitionPlatformDataAdapter && typeof window.ExhibitionPlatformDataAdapter.setMode === "function") window.ExhibitionPlatformDataAdapter.setMode("admin");
    if (window.GalleryApp && typeof window.GalleryApp.setExhibitionDataMode === "function") window.GalleryApp.setExhibitionDataMode("admin");
    if (window.GalleryApp.enterAdminWorkspaceMode) window.GalleryApp.enterAdminWorkspaceMode();
    if (!inlineAdminModulePromise) inlineAdminModulePromise = import(`./admin-workspace-bootstrap.js?v=${ENGINE_CACHE_KEY}`);
    const adminModule = await inlineAdminModulePromise;
    if (adminModule && typeof adminModule.resumeAdminWorkspace === "function") await adminModule.resumeAdminWorkspace();
    window.requestAnimationFrame(() => { if (activeEngine) activeEngine.resize(); });
    if (!crossSpace && !foregroundReadyBeforeOpen && window.GalleryApp && typeof window.GalleryApp.waitForForegroundReady === "function") {
      await window.GalleryApp.waitForForegroundReady("public-to-admin-fallback", { pendingTimeoutMs: 7000, quietTimeoutMs: 3600 });
    }
    return true;
  } catch (error) {
    publicExhibitionData.setMode("public");
    showToast(`Could not open Admin Workspace: ${error && error.message ? error.message : error}`);
    return false;
  } finally {
    await endTransitionGuard(guardToken);
    inlineWorkspaceModeSwitchActive = false;
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
  if (adminWorkspaceButton) adminWorkspaceButton.classList.remove("hidden");

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

  if (window.ExhibitionPlatformBootGuard && typeof window.ExhibitionPlatformBootGuard.setLanguage === "function") {
    window.ExhibitionPlatformBootGuard.setLanguage(currentLang);
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
    // Admin must be reachable from the project homepage without starting Babylon.
    // admin.html owns its own authentication gate. Inline Admin remains the fast path
    // only after an authenticated 3D runtime is already alive.
    if (!currentSession || !activeEngine || !activeScene || !sceneLifecycleController) return;
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

if (exhibitionsButton) exhibitionsButton.addEventListener("click", function (event) {
  event.preventDefault();
  if (!sceneLifecycleController || !activeScene) {
    const url = new URL("./index.html", location.href);
    location.href = url.href;
    return;
  }
  ensurePublicExhibitionSelection({ force: true })
    .then((reference) => reference ? switchPublicExhibition(reference, { historyMode: "push" }) : false)
    .catch((error) => showToast(`Could not open exhibition list: ${error && error.message ? error.message : error}`));
});

const bootGuard = window.ExhibitionPlatformBootGuard || window.BerryboyBootGuard || {
  setLanguage: function () {},
  setPhase: function () {},
  waitForStart: function () { return Promise.resolve(); },
  start: function () {},
  ready: function () {},
  fail: function () {},
  getState: function () { return "ready"; }
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

function installResizeRuntime(engine) {
  // Stage C6C1: mobile DPR and resize are owned by Gallery_V0_11 through the
  // normalized gallery-mobile-viewport-change event. Bootstrap owns desktop resize only.
  let mobileOwner = false;
  try {
    const viewportState = window.ExhibitionPlatformMobileViewport && window.ExhibitionPlatformMobileViewport.read
      ? window.ExhibitionPlatformMobileViewport.read()
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
    galleryEngineModule = await import(`../Gallery_V0_11.min.js?v=${ENGINE_CACHE_KEY}`);
    if (!galleryEngineModule || typeof galleryEngineModule.createScene !== "function") {
      throw new Error("The gallery scene factory is unavailable.");
    }

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
    const requestedExhibitionId = initialPublicExhibitionReference || getRequestedExhibitionId();
    const publicRuntime = await resolveInitialPublicRuntime(supabase, requestedExhibitionId);
    initialPublicExhibitionReference = null;
    publicExhibitionData = createExhibitionDataAdapter({ supabase, mode: "public", initialRuntime: publicRuntime });
    window.ExhibitionPlatformDataAdapter = publicExhibitionData;
    const publicExhibitionId = publicRuntime.exhibition.id;
    updatePublicRuntimeIdentity(publicRuntime, "replace");
    const navigationHandoff = readNavigationHandoff(publicExhibitionId, publicRuntime.spaceDefinition.id, getRuntimeVenueVersionKey(publicRuntime));

    sceneLifecycleController = createSceneLifecycleController({
      engine,
      canvas,
      engineModule: galleryEngineModule,
      exhibitionData: publicExhibitionData,
      resolveRuntime: (reference, options = {}) => publicExhibitionData.resolveRuntime(reference, options),
      getApp: () => window.GalleryApp || null,
      getCreateSceneOptions: (runtime) => ({ adminWorkspace: runtime && runtime.mode === "admin" }),
      onSceneChanged: (nextScene, nextRuntime) => {
        activeScene = nextScene;
        if (nextRuntime && nextRuntime.mode === "public") activePublicRuntime = nextRuntime;
        if (window.__EXHIBITION_INLINE_ADMIN_CONTEXT__) window.__EXHIBITION_INLINE_ADMIN_CONTEXT__.scene = nextScene;
        if (window.ExhibitionPlatformViewerRuntime) window.ExhibitionPlatformViewerRuntime.scene = nextScene;
      }
    });
    window.ExhibitionPlatformSceneLifecycle = sceneLifecycleController;
    const started = await sceneLifecycleController.start(publicRuntime, {
      initialSnapshot: navigationHandoff || null,
      sceneOptions: { adminWorkspace: false }
    });
    activeScene = started.scene;
    activePublicRuntime = publicRuntime;
    updateAuthUi();

    engine.runRenderLoop(function () {
      const scene = activeScene;
      if (!scene) return;
      try {
        if (typeof scene.isDisposed === "function" && scene.isDisposed()) return;
        scene.render();
      } catch (error) {
        if (!(typeof scene.isDisposed === "function" && scene.isDisposed())) console.error("Gallery render loop error:", error);
      }
    });
    installResizeRuntime(engine);
    syncMobileQualityControl();

    if (mobileQualitySelect && window.GalleryApp && typeof window.GalleryApp.setMobileQualityMode === "function") {
      const currentState = window.GalleryApp.getMobileQuality();
      if (!currentState || currentState.mode !== mobileQualitySelect.value) {
        window.GalleryApp.setMobileQualityMode(mobileQualitySelect.value);
      }
    }
    syncMobileQualityControl();

    window.ExhibitionPlatformViewerRuntime = {
      stage: STAGE,
      schema: "cross-space-viewer-runtime.v1",
      engine,
      scene: activeScene,
      lifecycle: sceneLifecycleController,
      supabase,
      deviceProfile: window.ExhibitionPlatformDeviceProfile || window.BerryboyArtGalleryDeviceProfile || null,
      getSession: function () { return currentSession; },
      loadEditorModule,
      startedAfterExhibitionSelection: true,
      originalInstructionalPopupRestored: true
    };
    window.BerryboyViewerRuntime = window.ExhibitionPlatformViewerRuntime; // legacy debug alias

    // Hide the page loader first, then show and verify the exact engine-owned popup from Stage 12C66A1.
    bootGuard.ready();
    window.requestAnimationFrame(function () {
      applyPublicSpaceIntroPolicy(null, publicRuntime, { initial: true, reason: "initial-public-entry" });

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

    return window.ExhibitionPlatformViewerRuntime;
  })().catch(function (error) {
    failGalleryBoot("bootstrap-exception", t("startupError"), error);
    throw error;
  });

  return galleryStartPromise;
}

window.addEventListener("popstate", function () {
  if (!sceneLifecycleController || !activeEngine) return;
  const reference = getRequestedExhibitionId();
  switchPublicExhibition(reference, { historyMode: "replace" }).catch(function (error) {
    console.warn("Cross-Space history navigation warning:", error);
  });
});

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
  const resetToHomepageAfterReload = resetPublicEntryToHomepageOnReload();
  initialPublicExhibitionReference = await ensurePublicExhibitionSelection({ force: resetToHomepageAfterReload });
  if (bootGuard && typeof bootGuard.start === "function" && (!bootGuard.getState || bootGuard.getState() === "prestart")) bootGuard.start();
  await bootGuard.waitForStart();
  await startGalleryRuntime();
} catch (error) {
  if (!bootGuard.getState || bootGuard.getState() !== "error") {
    failGalleryBoot("bootstrap-exception", t("startupError"), error);
  }
}
