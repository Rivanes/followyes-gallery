/*
  Exhibition Platform — Stage 12C66C6C7C8B Admin Workspace
  Authenticated exhibition management + constrained 3D editor viewport.
*/
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { gallerySpaceDefinition } from "../config/gallery-space-config.js?v=stage12c66c6c7c8b_admin_workspace_20260812";

const STAGE = "12C66C6C7C8B";
const ENGINE_CACHE_KEY = "stage12c66c6c7c8b_admin_workspace_20260812";
const SUPABASE_URL = "https://bazbszvhoxmuekxahokc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_iCDi8Ls8ZMvqQgcAuE78MQ_OnPVWqfn";
const STORAGE_BUCKET = "gallery-artworks";
const MAX_POSTER_BYTES = 14 * 1024 * 1024;

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
window.gallerySupabase = supabase;

const el = (id) => document.getElementById(id);
const canvas = el("renderCanvas");
const authGate = el("authGate");
const adminLoginForm = el("adminLoginForm");
const adminLoginError = el("adminLoginError");
const adminUser = el("adminUser");
const logoutButton = el("logoutButton");
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

function getRequestedExhibitionId() {
  try {
    const params = new URLSearchParams(location.search);
    return (params.get("exhibition") || localStorage.getItem("exhibition_platform_admin_active") || "main").trim() || "main";
  } catch (_error) { return "main"; }
}

function updateUrlExhibition(id) {
  try {
    const url = new URL(location.href);
    url.searchParams.set("exhibition", id);
    history.replaceState(null, "", url);
    localStorage.setItem("exhibition_platform_admin_active", id);
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
    await fetchCatalog();
    syncSelectedFromCatalog(id);
    viewportStatus.innerHTML = `3D preview: <strong>${target.name}</strong>`;
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

async function uploadPoster(file) {
  if (!selectedExhibition || !file) return;
  if (!/^image\//i.test(file.type || "")) throw new Error("Choose an image file.");
  if (file.size > MAX_POSTER_BYTES) throw new Error("Poster is too large. Maximum size is 14 MB.");
  const oldPath = selectedExhibition.cover_path;
  const ext = (file.name.split(".").pop() || "img").toLowerCase().replace(/[^a-z0-9]/g, "");
  const base = sanitizeFileName(file.name.replace(/\.[^.]+$/, ""));
  const path = `${selectedExhibition.storage_prefix}/branding/posters/${Date.now()}-${base}.${ext || "img"}`;
  posterStatus.textContent = "Uploading poster…";
  const upload = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
    contentType: file.type || undefined
  });
  if (upload.error) throw upload.error;
  try {
    const updated = await saveMetadata({ cover_path: path });
    await fetchCatalog();
    setSelectedExhibition(updated || catalog.find((item) => item.id === selectedExhibition.id));
    if (oldPath && oldPath !== path) {
      supabase.storage.from(STORAGE_BUCKET).remove([oldPath]).catch(() => {});
    }
    showToast("Poster updated.");
  } catch (error) {
    await supabase.storage.from(STORAGE_BUCKET).remove([path]).catch(() => {});
    throw error;
  }
}

async function removePoster() {
  if (!selectedExhibition || !selectedExhibition.cover_path) return;
  const oldPath = selectedExhibition.cover_path;
  const updated = await saveMetadata({ cover_path: null });
  await fetchCatalog();
  setSelectedExhibition(updated || catalog.find((item) => item.id === selectedExhibition.id));
  supabase.storage.from(STORAGE_BUCKET).remove([oldPath]).catch(() => {});
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

async function startEngine(initialId) {
  if (engineReady) return;
  workspaceLoading.classList.remove("hidden");
  viewportStatus.innerHTML = "3D preview: <strong>starting…</strong>";
  await ensureBabylon();
  const ready = waitForInteractionReady();
  const module = await import(`../Gallery_V0_11.min.js?v=${ENGINE_CACHE_KEY}`);
  engine = new window.BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: false, stencil: true, antialias: true, powerPreference: "high-performance", adaptToDeviceRatio: false
  });
  scene = module.createScene(engine, canvas, { spaceDefinition: gallerySpaceDefinition, exhibitionId: initialId });
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
  await fetchCatalog();
  syncSelectedFromCatalog(active.id);
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
    await fetchCatalog();
    syncSelectedFromCatalog(created.id);
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
    await fetchCatalog();
    setSelectedExhibition(updated || catalog.find((item) => item.id === selectedExhibition.id));
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

logoutButton.addEventListener("click", async () => {
  if (window.GalleryApp && window.GalleryApp.hasUnsavedChanges && window.GalleryApp.hasUnsavedChanges()) {
    if (!window.confirm("You have unsaved 3D scene changes. Log out anyway?")) return;
  }
  await supabase.auth.signOut();
  location.href = "./index.html";
});

adminLoginForm.addEventListener("submit", async (event) => {
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
    await startEngine(initial.id);
  } catch (error) {
    startupError.textContent = error.message || String(error);
    startupError.style.display = "grid";
    workspaceLoading.classList.add("hidden");
  }
}

supabase.auth.onAuthStateChange((_event, nextSession) => {
  session = nextSession || null;
  if (!session && engineReady) location.href = "./index.html";
});

const sessionResponse = await supabase.auth.getSession();
session = sessionResponse.data.session || null;
if (!session) {
  authGate.classList.add("visible");
  workspaceLoading.classList.add("hidden");
} else {
  authGate.classList.remove("visible");
  await initializeWorkspace();
}
