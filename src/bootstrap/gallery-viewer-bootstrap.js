/*
  Berryboy Art Gallery — Stage 12C66C4
  Save Integrity Repair / Correct Startup Rebuild.
  Babylon, GLB loaders and the gallery engine start only after an explicit visitor click.
  The accepted engine-owned instructional popup is shown unchanged after true interaction readiness.
*/

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const STAGE = "12C66C4";
const ENGINE_CACHE_KEY = "stage12c66c4_sculpture_core_rebuild_20260724";
const SUPABASE_URL = "https://bazbszvhoxmuekxahokc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_iCDi8Ls8ZMvqQgcAuE78MQ_OnPVWqfn";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
window.gallerySupabase = supabase;

const canvas = document.getElementById("renderCanvas");
const startupError = document.getElementById("startupError");
const galleryToast = document.getElementById("galleryToast");
const loginButton = document.getElementById("loginButton");
const logoutButton = document.getElementById("logoutButton");
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
  if (saveStateButton) saveStateButton.classList.toggle("hidden", !isLoggedIn);

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
  window.addEventListener("gallery-mobile-viewport-change", scheduleEngineResize, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener("resize", scheduleEngineResize, { passive: true });
  scheduleEngineResize();
}

async function startGalleryRuntime() {
  if (galleryStartPromise) return galleryStartPromise;

  galleryStartPromise = (async function () {
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
      failIfMajorPerformanceCaveat: false
    });
    activeEngine = engine;

    bootGuard.setPhase("scene", "Gallery scene");
    const scene = engineModule.createScene(engine, canvas);
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
