/*
  Berryboy Art Gallery — Stage 12C63A Balanced Ready Gate
  Public bootstrap. Editor/auth actions are dynamically imported only when needed.
*/

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { createScene } from "../Gallery_V0_11.min.js?v=stage12c63a_balanced_ready_gate_20260713";

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
    exploreBelow: "O projekcie"
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
    exploreBelow: "About project"
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
    editorModulePromise = import("./gallery-editor-bootstrap.js?v=stage12c63a").then(function (module) {
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

window.addEventListener("gallery-ready", updateAuthUi);
applyLanguage(currentLang);

try {
  const sessionResult = await supabase.auth.getSession();
  setSession(sessionResult.data.session || null);

  if (currentSession) {
    await loadEditorModule();
  }

  const engine = new BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: true,
    antialias: true,
    powerPreference: "high-performance"
  });

  const scene = createScene(engine, canvas);
  updateAuthUi();

  engine.runRenderLoop(function () {
    scene.render();
  });

  window.addEventListener("resize", function () {
    engine.resize();
  }, { passive: true });

  supabase.auth.onAuthStateChange(function (_event, session) {
    setSession(session);

    if (session) {
      loadEditorModule().catch(function (error) {
        console.warn("Editor bootstrap warning:", error);
      });
    }
  });

  window.BerryboyViewerRuntime = {
    stage: "12C63A",
    engine,
    scene,
    supabase,
    getSession: function () {
      return currentSession;
    },
    loadEditorModule
  };
} catch (error) {
  console.error(error);

  if (startupError) {
    startupError.style.display = "block";
    startupError.textContent =
      t("startupError") + "\n\n" +
      (error && error.stack ? error.stack : String(error));
  }
}
