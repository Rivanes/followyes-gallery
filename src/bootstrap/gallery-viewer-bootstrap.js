/*
  Berryboy Art Gallery — Stage 12C65E Mobile Asset Streaming / Memory Budget — First Light Mode Exit Stall Fix
  Public bootstrap. Editor/auth actions are dynamically imported only when needed.
*/

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { createScene } from "../Gallery_V0_11.min.js?v=stage12c65e_light_mode_exit_stall_fix_20260720";

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
let currentLang = localStorage.getItem("berryboy_art_gallery_lang") || "en";

const uiText = {
  pl: {
    publicGallery: "Galeria publiczna",
    editorLoggedIn: "Edytor zalogowany: ",
    editorAccount: "konto edytora",
    login: "Zaloguj",
    logout: "Wyloguj",
    save: "Zapisz stan",
    saving: "Zapisywanie...",
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
    save: "Save state",
    saving: "Saving...",
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
  if (!message || !galleryToast) {
    return;
  }

  galleryToast.textContent = message;
  galleryToast.style.display = "block";

  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(function () {
    galleryToast.style.display = "none";
  }, 3600);
}

function updateAuthUi() {
  const isLoggedIn = !!currentSession;
  window.galleryEditorAuthenticated = isLoggedIn;

  if (loginButton) {
    loginButton.classList.toggle("hidden", isLoggedIn);
  }

  if (logoutButton) {
    logoutButton.classList.toggle("hidden", !isLoggedIn);
  }

  if (saveStateButton) {
    saveStateButton.classList.toggle("hidden", !isLoggedIn);
  }

  if (authStatus) {
    authStatus.textContent = isLoggedIn
      ? t("editorLoggedIn") + (currentSession.user.email || t("editorAccount"))
      : t("publicGallery");
  }

  if (window.GalleryApp) {
    window.GalleryApp.setEditorAuthenticated(isLoggedIn);
  }
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
  if (saveStateButton) saveStateButton.textContent = t("save");
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

  updateAuthUi();
}

function getEditorContext() {
  return {
    supabase,
    t,
    showToast,
    setSession,
    getSession: function () {
      return currentSession;
    }
  };
}

async function loadEditorModule() {
  if (!editorModulePromise) {
    editorModulePromise = import("./gallery-editor-bootstrap.js?v=stage12c65e").then(function (module) {
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

window.addEventListener("gallery-status", function (event) {
  showToast(event.detail && event.detail.message);
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
    try {
      localStorage.setItem("berryboy_mobile_quality_mode", mode);
    } catch (_error) {}

    if (window.GalleryApp && typeof window.GalleryApp.setMobileQualityMode === "function") {
      const state = window.GalleryApp.setMobileQualityMode(mode);
      syncMobileQualityControl(state);
    }
  });
}

window.addEventListener("gallery-mobile-quality-change", function (event) {
  syncMobileQualityControl(event.detail || null);
});

window.addEventListener("gallery-ready", function () {
  updateAuthUi();
  if (mobileQualitySelect && window.GalleryApp && typeof window.GalleryApp.setMobileQualityMode === "function") {
    const currentState = window.GalleryApp.getMobileQuality();
    if (!currentState || currentState.mode !== mobileQualitySelect.value) {
      window.GalleryApp.setMobileQualityMode(mobileQualitySelect.value);
    }
  }
  syncMobileQualityControl();
});
applyLanguage(currentLang);

const bootGuard = window.BerryboyBootGuard || {
  setPhase: function () {},
  ready: function () {},
  fail: function () {}
};

function failGalleryBoot(code, message, error) {
  console.error("Gallery boot failure:", code, error || "");
  bootGuard.fail(code, message, error);
}

function installCanvasContextRecovery(canvas, getEngine) {
  canvas.addEventListener("webglcontextcreationerror", function (event) {
    failGalleryBoot(
      "webgl-context-creation",
      "This browser could not create the WebGL graphics context. Reload it or open the page in the full browser.",
      event && event.statusMessage ? event.statusMessage : event
    );
  });

  canvas.addEventListener("webglcontextlost", function (event) {
    event.preventDefault();
    const engine = typeof getEngine === "function" ? getEngine() : null;
    if (engine && engine.stopRenderLoop) engine.stopRenderLoop();
    failGalleryBoot(
      "webgl-context-lost",
      "The phone released the 3D graphics context. Reload the gallery to restore it.",
      event
    );
  });

  canvas.addEventListener("webglcontextrestored", function () {
    failGalleryBoot(
      "webgl-context-restored-reload",
      "The graphics context was restored. Reload the gallery to rebuild the scene safely."
    );
  });
}

let activeEngine = null;
installCanvasContextRecovery(canvas, function () {
  return activeEngine;
});

try {
  bootGuard.setPhase("dependencies", "Checking the 3D engine…");
  if (!window.BABYLON || !BABYLON.Engine) {
    throw new Error("BABYLON.Engine is unavailable.");
  }

  bootGuard.setPhase("session", "Connecting to the gallery…");
  const sessionResult = await supabase.auth.getSession();
  setSession(sessionResult.data.session || null);

  if (currentSession) {
    await loadEditorModule();
  }

  bootGuard.setPhase("engine", "Creating the graphics engine…");
  const engine = new BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: true,
    antialias: true,
    powerPreference: "high-performance",
    failIfMajorPerformanceCaveat: false
  });
  activeEngine = engine;

  bootGuard.setPhase("scene", "Building the gallery scene…");
  const scene = createScene(engine, canvas);
  updateAuthUi();

  let firstFrameDelivered = false;
  engine.runRenderLoop(function () {
    scene.render();
    if (!firstFrameDelivered) {
      firstFrameDelivered = true;
      window.requestAnimationFrame(function () {
        bootGuard.ready();
      });
    }
  });

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

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", scheduleEngineResize, { passive: true });
  }

  scheduleEngineResize();
  syncMobileQualityControl();

  supabase.auth.onAuthStateChange(function (_event, session) {
    setSession(session);

    if (session) {
      loadEditorModule().catch(function (error) {
        console.warn("Editor bootstrap warning:", error);
      });
    }
  });

  window.BerryboyViewerRuntime = {
    stage: "12C65E",
    engine,
    scene,
    supabase,
    deviceProfile: window.BerryboyArtGalleryDeviceProfile || null,
    getSession: function () {
      return currentSession;
    },
    loadEditorModule
  };
} catch (error) {
  console.error(error);
  failGalleryBoot("bootstrap-exception", t("startupError"), error);

  if (startupError) {
    startupError.style.display = "block";
    startupError.textContent =
      t("startupError") + "\n\n" +
      (error && error.stack ? error.stack : String(error));
  }
}
