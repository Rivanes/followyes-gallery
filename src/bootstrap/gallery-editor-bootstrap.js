/*
  Berryboy Art Gallery — Stage 12D2 Draft / Publish Workflow
  Editor/auth bootstrap is loaded only for an existing editor session or after the public user requests login.
*/

let runtimeContext = null;
let initialized = false;
let currentDraftState = {
  dirty: false,
  saveInFlight: false,
  publishInFlight: false,
  latestResult: null,
  draftRevision: 0,
  publishedRevision: 0,
  lockVersion: 0
};
let saveConfirmationTimer = 0;

function getElement(id) {
  return document.getElementById(id);
}

function showAuthError(message) {
  const authError = getElement("authError");

  if (!authError) {
    return;
  }

  authError.textContent = message || "";
  authError.style.display = message ? "block" : "none";
}


function updateSaveButtonUi(button, forcedState) {
  if (!button || !runtimeContext) return;

  let state = forcedState || "";
  if (!state) {
    if (currentDraftState.saveInFlight) state = "saving";
    else if (currentDraftState.dirty) state = "dirty";
    else state = "clean";
  }

  button.dataset.saveState = state;
  button.disabled = state === "clean" || state === "saving" || state === "saved";
  button.textContent = state === "saving"
    ? runtimeContext.t("saving")
    : state === "saved"
      ? runtimeContext.t("saved")
      : state === "error"
        ? runtimeContext.t("saveError")
        : state === "dirty"
          ? runtimeContext.t("save")
          : runtimeContext.t("allSaved");
}

function updatePublishButtonUi(button, forcedState) {
  if (!button || !runtimeContext) return;
  let state = forcedState || "";
  if (!state) {
    if (currentDraftState.publishInFlight) state = "publishing";
    else if (currentDraftState.dirty) state = "blocked-dirty";
    else state = "ready";
  }
  button.dataset.publishState = state;
  button.disabled = state === "publishing" || state === "published" || state === "blocked-dirty";
  button.title = state === "blocked-dirty" ? "Save the draft before publishing." : "";
  button.textContent = state === "publishing"
    ? runtimeContext.t("publishing")
    : state === "published"
      ? runtimeContext.t("published")
      : state === "error"
        ? runtimeContext.t("publishError")
        : runtimeContext.t("publish");
}

export function openEditorLogin() {
  const authModalBackdrop = getElement("authModalBackdrop");
  const authEmail = getElement("authEmail");
  const authPassword = getElement("authPassword");

  if (!authModalBackdrop) {
    return;
  }

  showAuthError("");

  if (authPassword) {
    authPassword.value = "";
  }

  authModalBackdrop.style.display = "flex";

  setTimeout(function () {
    if (authEmail) {
      authEmail.focus();
    }
  }, 0);
}

function closeEditorLogin() {
  const authModalBackdrop = getElement("authModalBackdrop");

  if (authModalBackdrop) {
    authModalBackdrop.style.display = "none";
  }

  showAuthError("");
}

export function initializeEditorRuntime(context) {
  runtimeContext = context || runtimeContext;

  if (initialized || !runtimeContext) {
    return;
  }

  initialized = true;

  const supabase = runtimeContext.supabase;
  const authModalBackdrop = getElement("authModalBackdrop");
  const authModal = getElement("authModal");
  const authEmail = getElement("authEmail");
  const authPassword = getElement("authPassword");
  const cancelLoginButton = getElement("cancelLoginButton");
  const logoutButton = getElement("logoutButton");
  const saveStateButton = getElement("saveStateButton");
  const publishStateButton = getElement("publishStateButton");

  if (cancelLoginButton) {
    cancelLoginButton.addEventListener("click", closeEditorLogin);
  }

  if (authModalBackdrop) {
    authModalBackdrop.addEventListener("click", function (event) {
      if (event.target === authModalBackdrop) {
        closeEditorLogin();
      }
    });
  }

  if (authModal) {
    authModal.addEventListener("submit", async function (event) {
      event.preventDefault();
      showAuthError("");

      const email = authEmail ? authEmail.value.trim() : "";
      const password = authPassword ? authPassword.value : "";
      const response = await supabase.auth.signInWithPassword({ email, password });

      if (response.error) {
        showAuthError(runtimeContext.t("loginFailed"));
        return;
      }

      runtimeContext.setSession(response.data.session || null);
      closeEditorLogin();
      runtimeContext.showToast(runtimeContext.t("loggedIn"));
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", async function () {
      if (
        window.GalleryApp &&
        typeof window.GalleryApp.confirmDiscardUnsavedChanges === "function" &&
        !window.GalleryApp.confirmDiscardUnsavedChanges("Logging out")
      ) {
        return;
      }

      await supabase.auth.signOut();
      runtimeContext.setSession(null);
      runtimeContext.showToast(runtimeContext.t("loggedOut"));
    });
  }

  if (saveStateButton) {
    updateSaveButtonUi(saveStateButton);

    window.addEventListener("gallery-draft-state", function (event) {
      const detail = event.detail || {};
      currentDraftState.dirty = !!detail.dirty;
      currentDraftState.saveInFlight = !!detail.saveInFlight;
      currentDraftState.publishInFlight = !!detail.publishInFlight;
      currentDraftState.draftRevision = Number(detail.draftRevision || detail.revision || currentDraftState.draftRevision || 0);
      currentDraftState.publishedRevision = Number(detail.publishedRevision || currentDraftState.publishedRevision || 0);
      currentDraftState.lockVersion = Number(detail.lockVersion || currentDraftState.lockVersion || 0);
      window.clearTimeout(saveConfirmationTimer);
      updateSaveButtonUi(saveStateButton);
      updatePublishButtonUi(publishStateButton);
    });

    saveStateButton.addEventListener("click", async function () {
      if (!window.GalleryApp) {
        runtimeContext.showToast(runtimeContext.t("galleryLoading"));
        return;
      }

      currentDraftState.saveInFlight = true;
      updateSaveButtonUi(saveStateButton, "saving");
      let ok = false;

      try {
        ok = !!(await (window.GalleryApp.saveDraftToSupabase || window.GalleryApp.saveStateToSupabase)());
      } catch (error) {
        ok = false;
      }

      currentDraftState.saveInFlight = false;
      if (ok) {
        currentDraftState.dirty = false;
        updateSaveButtonUi(saveStateButton, "saved");
        saveConfirmationTimer = window.setTimeout(function () {
          updateSaveButtonUi(saveStateButton, currentDraftState.dirty ? "dirty" : "clean");
        }, 1200);
      } else {
        currentDraftState.dirty = true;
        updateSaveButtonUi(saveStateButton, "error");
      }
    });
  }

  if (publishStateButton) {
    updatePublishButtonUi(publishStateButton);
    publishStateButton.addEventListener("click", async function () {
      if (!window.GalleryApp || typeof window.GalleryApp.publishDraftToSupabase !== "function") {
        runtimeContext.showToast(runtimeContext.t("galleryLoading"));
        return;
      }
      if (currentDraftState.dirty) {
        runtimeContext.showToast("Save the draft before publishing.");
        updatePublishButtonUi(publishStateButton, "blocked-dirty");
        return;
      }
      currentDraftState.publishInFlight = true;
      updatePublishButtonUi(publishStateButton, "publishing");
      let ok = false;
      try {
        ok = !!(await window.GalleryApp.publishDraftToSupabase());
      } catch (error) {
        ok = false;
      }
      currentDraftState.publishInFlight = false;
      if (ok) {
        updatePublishButtonUi(publishStateButton, "published");
        window.setTimeout(function () { updatePublishButtonUi(publishStateButton, "ready"); }, 1400);
      } else {
        updatePublishButtonUi(publishStateButton, "error");
      }
    });
  }
}
