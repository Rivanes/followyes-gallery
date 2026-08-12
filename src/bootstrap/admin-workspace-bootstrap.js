/*
  Exhibition Platform — Stage 12C66C6C8C2 Admin Workspace / Same-Runtime Viewer Transition
  Authenticated exhibition management + constrained 3D editor viewport.
*/
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { gallerySpaceDefinition } from "../config/gallery-space-config.js?v=stage12c66c6c8c2_same_runtime_admin_20260812";
import { registerExhibitionAssetCache, getExhibitionAssetCacheStatus, evictExhibitionAssetCacheUrl } from "./asset-cache-bootstrap.js?v=stage12c66c6c8c2_same_runtime_admin_20260812";

const STAGE = "12C66C6C8C2";
const ENGINE_CACHE_KEY = "stage12c66c6c8c2_same_runtime_admin_20260812";
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
  renderCatalog();
}

function syncSelectedFromCatalog(id) {
  const found = catalog.find((item) => item.id === id) || null;
  if (found) setSelectedExhibition(found);
  return found;
}

async function selectAndSwitchExhibition(id) {
  const target = catalog.find((item) => item.id === id);
  if (!target) return;
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
  viewportStatus.innerHTML = `3D preview: <strong>switching to ${target.name}…</strong>`;
  try {
    const ok = await window.GalleryApp.switchExhibition(id);
    if (!ok) return;
    updateUrlExhibition(id);
    setSelectedExhibition(catalog.find((item) => item.id === id) || target);
    viewportStatus.innerHTML = `3D preview: <strong>${target.name}</strong>`;
    updateAssetDeliveryStatus();
  } catch (error) {
    showToast("Could not switch exhibition: " + (error.message || error));
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
  let raf = 0;
  const resize = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; if (engine) engine.resize(); });
  };
  window.addEventListener("resize", resize, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(resize).observe(el("adminViewportStage"));
  resize();
}

async function updateAssetDeliveryStatus() {
  if (!assetDeliveryStatus) return;
  try {
    const cache = await getAssetCacheStatusThrottled(false);
    const delivery = window.GalleryApp && typeof window.GalleryApp.getAssetDeliveryDebug === "function"
      ? window.GalleryApp.getAssetDeliveryDebug()
      : null;
    const residency = delivery && delivery.residency ? delivery.residency : null;
    const cacheText = cache && cache.controlled ? `${cache.entries || 0} cached assets` : "browser cache warming";
    const textureText = residency ? `${residency.full || 0}/${delivery.fullBudget || residency.effectiveBudget || 0} Full · ${residency.preview || 0} Preview` : "Preview-first";
    assetDeliveryStatus.textContent = `Asset delivery: ${textureText} · ${cacheText}`;
  } catch (_error) {
    assetDeliveryStatus.textContent = "Asset delivery: Preview-first / proximity Full";
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
    if (assetDeliveryInterval) window.clearInterval(assetDeliveryInterval);
    assetDeliveryInterval = window.setInterval(updateAssetDeliveryStatus, 30000);
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
  if (assetDeliveryInterval) window.clearInterval(assetDeliveryInterval);
  assetDeliveryInterval = window.setInterval(updateAssetDeliveryStatus, 30000);
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
  const detail = event.detail || {};
  if (detail.message) showToast(detail.message);
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
  setBusy(refreshExhibitionsButton, true);
  try { await fetchCatalog(); if (selectedExhibition) syncSelectedFromCatalog(selectedExhibition.id); }
  catch (error) { showToast(error.message || String(error)); }
  finally { setBusy(refreshExhibitionsButton, false); }
});

createExhibitionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = newExhibitionName.value.trim();
  if (!name || !window.GalleryApp) return;
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
    const updated = await saveMetadata({
      name: exhibitionName.value.trim(),
      description: exhibitionDescription.value,
      is_published: exhibitionPublished.checked,
      sort_order: Number(exhibitionSortOrder.value) || 0
    });
    const localUpdated = upsertLocalCatalogRecord(updated || selectedExhibition);
    setSelectedExhibition(localUpdated);
    showToast("Exhibition details saved.");
  } catch (error) { showToast(error.message || String(error)); }
  finally { setBusy(saveMetadataButton, false); }
});

choosePosterButton.addEventListener("click", () => posterFileInput.click());
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
  setBusy(removePosterButton, true);
  try { await removePoster(); }
  catch (error) { showToast(error.message || String(error)); }
  finally { setBusy(removePosterButton, false); }
});

if (publicPageButton) {
  publicPageButton.addEventListener("click", async (event) => {
    const active = window.GalleryApp && typeof window.GalleryApp.getActiveExhibition === "function"
      ? window.GalleryApp.getActiveExhibition()
      : selectedExhibition;
    updatePublicPageHref(active && active.id ? active.id : "main");

    if (inlineWorkspaceMode && inlineRuntimeContext && typeof inlineRuntimeContext.close === "function") {
      event.preventDefault();
      await inlineRuntimeContext.close();
      return;
    }

    // Never hand an unpublished draft to the public Viewer. If the workspace is clean,
    // the confirmed state can be handed over to skip a redundant database state read.
    const dirty = window.GalleryApp && typeof window.GalleryApp.hasUnsavedChanges === "function"
      ? window.GalleryApp.hasUnsavedChanges()
      : sceneSaveState.dirty;
    if (!dirty && window.GalleryApp && typeof window.GalleryApp.createNavigationHandoff === "function") {
      try { window.GalleryApp.createNavigationHandoff(); } catch (_error) {}
    }
  });
}

if (!inlineWorkspaceMode && logoutButton) logoutButton.addEventListener("click", async () => {
  if (window.GalleryApp && window.GalleryApp.hasUnsavedChanges && window.GalleryApp.hasUnsavedChanges()) {
    if (!window.confirm("You have unsaved 3D scene changes. Log out anyway?")) return;
  }
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

export async function resumeAdminWorkspace() {
  if (!session && inlineRuntimeContext && inlineRuntimeContext.session) session = inlineRuntimeContext.session;
  if (!session) return false;
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
  return true;
}
