/* Exhibition Platform — C6C8C24 isolated Test Gallery bootstrap. */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { createGalleryManagementApi } from "../data/gallery-management-api.js?v=c6c8c24_exhibition_gallery_assignment";
import { buildSpaceDefinition } from "../runtime/space-definition-resolver.js?v=c6c8c24_exhibition_gallery_assignment";

const STAGE = "C6C8C24";
const ENGINE_CACHE_KEY = "c6c8c24_exhibition_gallery_assignment_20260908";
const SUPABASE_URL = "https://bazbszvhoxmuekxahokc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_iCDi8Ls8ZMvqQgcAuE78MQ_OnPVWqfn";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const galleryManagement = createGalleryManagementApi({ supabase });
window.gallerySupabase = supabase;

const el = (id) => document.getElementById(id);
const canvas = el("renderCanvas");
const loading = el("testLoading");
const errorPanel = el("testError");
const errorMessage = el("testErrorMessage");
const title = el("testTitle");
const status = el("testStatus");
const captureEntryButton = el("captureEntryButton");
const backToAdminButton = el("backToAdminButton");
const authGate = el("authGate");
const loginForm = el("testLoginForm");
const loginError = el("testLoginError");

let engine = null;
let scene = null;
let testPackage = null;
let started = false;

function params() {
  try { return new URLSearchParams(location.search); } catch (_error) { return new URLSearchParams(); }
}

function versionId() { return params().get("version") || ""; }
function venueId() { return params().get("gallery") || ""; }

function backUrl() {
  const url = new URL("./admin.html", location.href);
  url.searchParams.set("section", "galleries");
  if (venueId() || (testPackage && testPackage.venue && testPackage.venue.id)) url.searchParams.set("gallery", venueId() || testPackage.venue.id);
  return url.href;
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
  await loadScript("https://cdn.babylonjs.com/babylon.js", "testGalleryBabylonRuntime");
  await loadScript("https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js", "testGalleryBabylonLoaders");
  if (!window.BABYLON || !window.BABYLON.Engine) throw new Error("Babylon runtime unavailable.");
}

function waitForInteractionReady(timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error("Test Gallery startup timed out.")); }, timeoutMs);
    const onReady = (event) => { cleanup(); resolve(event.detail || {}); };
    const onFailure = (event) => { cleanup(); reject(new Error((event.detail && (event.detail.technicalMessage || event.detail.message)) || "Test Gallery startup failed.")); };
    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener("gallery-interaction-ready", onReady);
      window.removeEventListener("gallery-startup-failure", onFailure);
    }
    window.addEventListener("gallery-interaction-ready", onReady, { once: true });
    window.addEventListener("gallery-startup-failure", onFailure, { once: true });
  });
}

function buildTestExhibitionAdapter(spaceDefinition, venueVersionId) {
  const id = `gallery-test-${venueVersionId}`;
  const record = Object.freeze({
    id,
    name: "Test Gallery",
    slug: id,
    description: "Isolated Gallery Version preview",
    cover_path: null,
    is_published: true,
    sort_order: 0,
    storage_prefix: `gallery-tests/${venueVersionId}`,
    space_id: spaceDefinition.id
  });
  return Object.freeze({
    mode: "test-gallery",
    setMode() { return "test-gallery"; },
    list() { return Promise.resolve([record]); },
    resolve() { return Promise.resolve(record); },
    loadState() { return Promise.resolve({ id, state: null, updated_at: null, revision: 0, lock_version: 0, rowExists: false }); },
    saveState() { return Promise.reject(new Error("Test Gallery is read-only and cannot save Exhibition state.")); },
    create() { return Promise.reject(new Error("Test Gallery cannot create Exhibitions.")); },
    updateMetadata() { return Promise.reject(new Error("Test Gallery cannot edit Exhibition metadata.")); }
  });
}

function showError(error) {
  console.error("C6C8C24 Test Gallery:", error);
  loading.style.display = "none";
  errorMessage.textContent = error && error.message ? error.message : String(error);
  errorPanel.style.display = "grid";
}

async function startTestGallery() {
  if (started) return;
  const requestedVersionId = versionId();
  if (!requestedVersionId) throw new Error("Missing Gallery Version ID in the Test Gallery URL.");
  started = true;
  testPackage = await galleryManagement.resolveTest(requestedVersionId);
  const report = testPackage.validation || {};
  if (report.valid === false) {
    const blockers = Array.isArray(report.errors) ? report.errors.join(" · ") : "Structural Gallery validation failed.";
    throw new Error(blockers || "Structural Gallery validation failed.");
  }

  const spaceDefinition = buildSpaceDefinition({
    supabase,
    venue: testPackage.venue,
    venueVersion: testPackage.version,
    manifest: testPackage.manifest
  });
  const exhibitionData = buildTestExhibitionAdapter(spaceDefinition, requestedVersionId);
  await ensureBabylon();
  const ready = waitForInteractionReady();
  const module = await import(`../Gallery_V0_11.min.js?v=${ENGINE_CACHE_KEY}`);
  engine = new window.BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: true,
    antialias: true,
    powerPreference: "high-performance",
    adaptToDeviceRatio: false
  });
  scene = module.createScene(engine, canvas, {
    spaceDefinition,
    exhibitionData,
    exhibitionId: `gallery-test-${requestedVersionId}`,
    galleryTestMode: true
  });
  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine && engine.resize());
  await ready;

  if (window.GalleryApp && typeof window.GalleryApp.hideViewerIntroOverlay === "function") window.GalleryApp.hideViewerIntroOverlay();
  title.textContent = `${testPackage.venue.name || "Gallery"} · ${testPackage.version.version_number || "Draft"}`;
  const capabilities = testPackage.capabilities || {};
  captureEntryButton.disabled = capabilities.canCaptureEntry !== true;
  status.textContent = capabilities.canCaptureEntry === true
    ? "Move to the desired visitor start view, then capture it as Entry Point. Exhibition state is not loaded."
    : "Read-only Gallery Version preview. Entry capture is available only on the active Draft Version.";
  loading.style.display = "none";
}

async function captureCurrentEntry() {
  if (!testPackage || !(testPackage.capabilities && testPackage.capabilities.canCaptureEntry)) return;
  if (!window.GalleryApp || typeof window.GalleryApp.getCameraPose !== "function") throw new Error("Camera pose bridge is unavailable.");
  const pose = window.GalleryApp.getCameraPose();
  if (!pose || !pose.position || !pose.target) throw new Error("Current camera pose could not be captured.");
  captureEntryButton.disabled = true;
  const previous = status.textContent;
  status.textContent = "Saving Entry Point…";
  try {
    await galleryManagement.setEntryPoint(testPackage.version.id, pose.position, pose.target);
    status.textContent = `Entry Point saved at ${pose.position.x.toFixed(2)}, ${pose.position.y.toFixed(2)}, ${pose.position.z.toFixed(2)}.`;
  } catch (error) {
    status.textContent = previous;
    throw error;
  } finally {
    captureEntryButton.disabled = false;
  }
}

captureEntryButton.addEventListener("click", () => captureCurrentEntry().catch(showError));
backToAdminButton.addEventListener("click", () => { location.href = backUrl(); });

if (loginForm) loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.style.display = "none";
  const response = await supabase.auth.signInWithPassword({ email: el("testEmail").value.trim(), password: el("testPassword").value });
  if (response.error) {
    loginError.textContent = response.error.message || "Login failed.";
    loginError.style.display = "block";
    return;
  }
  authGate.classList.remove("visible");
  startTestGallery().catch(showError);
});

const sessionResponse = await supabase.auth.getSession();
if (!sessionResponse.data.session) {
  loading.style.display = "none";
  authGate.classList.add("visible");
} else {
  startTestGallery().catch(showError);
}

window.ExhibitionPlatformTestGallery = Object.freeze({ stage: STAGE, getPackage: () => testPackage, backUrl });
