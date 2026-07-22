/*
  Berryboy Art Gallery — background preload test
  Keeps the technical page visible while preparing the hidden 3D scene.
*/

(function () {
  "use strict";

  const body = document.body;
  const gallerySection = document.getElementById("gallerySection");
  const siteContent = document.getElementById("siteContent");
  const siteFooter = document.getElementById("siteFooter");
  const statusElement = document.getElementById("galleryPreloadStatus");
  const headerToggle = document.getElementById("exploreBelowButton");
  const enterButtons = Array.from(document.querySelectorAll("[data-enter-gallery]"));
  const languageButtons = Array.from(document.querySelectorAll("[data-set-lang]"));

  const state = {
    started: false,
    active: false,
    ready: false,
    failed: false,
    startPromise: null,
    phase: "idle"
  };

  let runtimeLoaderSignature = "";

  const messages = {
    pl: {
      idle: "Oczekiwanie na wolną chwilę przeglądarki…",
      scheduled: "Galeria rozpocznie przygotowanie w tle za chwilę…",
      dependencies: "Pobieranie silnika 3D w tle…",
      module: "Uruchamianie niewidocznej sceny galerii…",
      loading: "Galeria przygotowuje scenę i zasoby w tle…",
      ready: "Scena galerii jest przygotowana. Pozostałe zasoby mogą nadal doładowywać się w tle.",
      error: "Nie udało się przygotować galerii w tle. Kliknięcie spróbuje uruchomić ją ponownie po odświeżeniu strony.",
      saveData: "Oszczędzanie danych jest aktywne — galeria zacznie ładować się dopiero po kliknięciu.",
      enter: "Przejdź do galerii",
      back: "Wróć do opisu"
    },
    en: {
      idle: "Waiting for an idle browser moment…",
      scheduled: "The gallery will begin preparing in the background shortly…",
      dependencies: "Downloading the 3D engine in the background…",
      module: "Starting the hidden gallery scene…",
      loading: "The gallery is preparing its scene and assets in the background…",
      ready: "The gallery scene is prepared. Remaining assets may continue loading in the background.",
      error: "The gallery could not be prepared in the background. Reload the page to try again.",
      saveData: "Data Saver is active — the gallery will start loading only after you click.",
      enter: "Enter gallery",
      back: "Back to description"
    }
  };

  function currentLanguage() {
    return document.documentElement.getAttribute("data-page-lang") === "pl" ? "pl" : "en";
  }

  function text(key) {
    const language = currentLanguage();
    return messages[language][key] || messages.en[key] || key;
  }

  function updateStatus(key) {
    if (!statusElement) return;
    statusElement.textContent = text(key);
    statusElement.dataset.state = key;
  }

  function updateToggleLabels() {
    if (!headerToggle) return;
    headerToggle.textContent = state.active ? text("back") : text("enter");
    headerToggle.setAttribute("aria-pressed", state.active ? "true" : "false");
  }

  function publishState(phase) {
    state.phase = phase;
    body.dataset.galleryPreloadState = state.failed ? "error" : (state.ready ? "ready" : phase);
    window.dispatchEvent(new CustomEvent("berryboy-gallery-preload-state", {
      detail: {
        started: state.started,
        active: state.active,
        ready: state.ready,
        failed: state.failed,
        phase: state.phase
      }
    }));
  }

  function syncRuntimeLoaderState() {
    const loadingScreen = document.getElementById("customLoadingScreen");
    if (!loadingScreen) return;

    const retryButton = document.getElementById("galleryAssetRetryButton");
    const loaderStatus = document.getElementById("galleryLoaderStatus");
    const statusText = loaderStatus ? String(loaderStatus.textContent || "").toLowerCase() : "";
    const retryVisible = !!(retryButton && retryButton.style.display && retryButton.style.display !== "none");
    const runtimeHidden = loadingScreen.style.display === "none";
    const failureVisible = retryVisible || statusText.includes("failed") || statusText.includes("missing critical");
    const signature = [runtimeHidden, failureVisible, statusText].join("|");

    if (signature === runtimeLoaderSignature) return;
    runtimeLoaderSignature = signature;

    if (failureVisible) {
      state.failed = true;
      state.ready = false;
      publishState("error");
      updateStatus("error");
      return;
    }

    if (runtimeHidden) {
      state.ready = true;
      state.failed = false;
      publishState("ready");
      updateStatus("ready");
      return;
    }

    if (state.started) {
      state.ready = false;
      publishState("loading");
      updateStatus("loading");
    }
  }

  const runtimeLoaderObserver = new MutationObserver(function () {
    syncRuntimeLoaderState();
  });

  runtimeLoaderObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"],
    characterData: true
  });

  function loadClassicScript(src, id) {
    return new Promise(function (resolve, reject) {
      if (id && document.getElementById(id)) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      if (id) script.id = id;
      script.src = src;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error("Could not load " + src)); };
      document.head.appendChild(script);
    });
  }

  async function startGalleryPreload(reason) {
    if (state.startPromise) return state.startPromise;

    state.started = true;
    state.failed = false;
    body.classList.add("gallery-preload-started");
    publishState("dependencies");
    updateStatus("dependencies");

    if (window.BerryboyBootGuard && typeof window.BerryboyBootGuard.start === "function") {
      window.BerryboyBootGuard.start();
    }

    state.startPromise = (async function () {
      try {
        if (!window.BABYLON || !window.BABYLON.Engine) {
          await loadClassicScript("https://cdn.babylonjs.com/babylon.js", "berryboyBabylonCore");
        }

        if (!window.BABYLON || !window.BABYLON.SceneLoader) {
          await loadClassicScript("https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js", "berryboyBabylonLoaders");
        }

        publishState("module");
        updateStatus("module");

        await import("./gallery-viewer-bootstrap.js?v=stage12c65e_light_mode_exit_stall_fix_20260720");

        if (!state.ready && !state.failed) {
          publishState("loading");
          updateStatus("loading");
        }
      } catch (error) {
        state.failed = true;
        publishState("error");
        updateStatus("error");
        if (window.BerryboyBootGuard) {
          window.BerryboyBootGuard.fail(
            "background-preload",
            "The gallery could not be prepared in the background.",
            error
          );
        }
        console.error("Berryboy background preload failed:", reason, error);
        throw error;
      }
    })();

    return state.startPromise;
  }

  function activateGallery() {
    state.active = true;
    body.classList.add("gallery-active");
    if (gallerySection) gallerySection.setAttribute("aria-hidden", "false");
    if (siteContent) siteContent.setAttribute("aria-hidden", "true");
    if (siteFooter) siteFooter.setAttribute("aria-hidden", "true");
    updateToggleLabels();
    publishState(state.ready ? "ready" : (state.started ? "loading" : "starting"));

    window.dispatchEvent(new CustomEvent("berryboy-gallery-activate", {
      detail: { ready: state.ready, started: state.started }
    }));

    window.scrollTo({ top: 0, behavior: "auto" });
    startGalleryPreload("user-enter").catch(function () {});
  }

  function deactivateGallery() {
    state.active = false;
    body.classList.remove("gallery-active");
    if (gallerySection) gallerySection.setAttribute("aria-hidden", "true");
    if (siteContent) siteContent.setAttribute("aria-hidden", "false");
    if (siteFooter) siteFooter.setAttribute("aria-hidden", "false");
    updateToggleLabels();
    publishState(state.ready ? "ready" : (state.started ? "loading" : "idle"));

    window.dispatchEvent(new CustomEvent("berryboy-gallery-deactivate", {
      detail: { ready: state.ready, started: state.started }
    }));
  }

  enterButtons.forEach(function (button) {
    button.addEventListener("click", activateGallery);
  });

  if (headerToggle) {
    headerToggle.addEventListener("click", function () {
      if (state.active) deactivateGallery();
      else activateGallery();
    });
  }

  languageButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      window.requestAnimationFrame(function () {
        updateToggleLabels();
        if (state.failed) updateStatus("error");
        else if (state.ready) updateStatus("ready");
        else if (state.started) updateStatus(state.phase === "dependencies" ? "dependencies" : "loading");
        else updateStatus("idle");
      });
    });
  });

  window.addEventListener("berryboy-gallery-boot-state", function (event) {
    const detail = event.detail || {};

    if (detail.state === "ready") {
      // The first WebGL frame only confirms that the engine is alive.
      // Actual gallery readiness is determined by the engine's own
      // customLoadingScreen being hidden after critical assets finish.
      state.failed = false;
      publishState("loading");
      updateStatus("loading");
      window.requestAnimationFrame(syncRuntimeLoaderState);
      return;
    }

    if (detail.state === "error") {
      state.failed = true;
      publishState("error");
      updateStatus("error");
      return;
    }

    if (detail.state === "loading") {
      publishState(detail.phase || "loading");
      if (detail.phase === "dependencies") updateStatus("dependencies");
      else updateStatus("loading");
    }
  });

  if (gallerySection) gallerySection.setAttribute("aria-hidden", "true");
  updateToggleLabels();
  updateStatus("idle");
  publishState("idle");
  syncRuntimeLoaderState();

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const saveData = !!(connection && connection.saveData);

  if (saveData) {
    updateStatus("saveData");
    publishState("save-data");
    return;
  }

  updateStatus("scheduled");
  publishState("scheduled");

  const isMobile = window.matchMedia("(max-width: 768px), (pointer: coarse)").matches;
  const minimumDelay = isMobile ? 1800 : 750;
  const idleTimeout = isMobile ? 4200 : 2200;

  function scheduleStart() {
    startGalleryPreload("idle-background").catch(function () {});
  }

  window.setTimeout(function () {
    if (state.started) return;

    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(scheduleStart, { timeout: idleTimeout });
    } else {
      scheduleStart();
    }
  }, minimumDelay);
})();
