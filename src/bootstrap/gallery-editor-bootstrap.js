/*
  Berryboy Art Gallery — Stage 12C65B
  Editor/auth bootstrap is loaded only for an existing editor session or after the public user requests login.
*/

let runtimeContext = null;
let initialized = false;

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
      await supabase.auth.signOut();
      runtimeContext.setSession(null);
      runtimeContext.showToast(runtimeContext.t("loggedOut"));
    });
  }

  if (saveStateButton) {
    saveStateButton.addEventListener("click", async function () {
      if (!window.GalleryApp) {
        runtimeContext.showToast(runtimeContext.t("galleryLoading"));
        return;
      }

      saveStateButton.disabled = true;
      saveStateButton.textContent = runtimeContext.t("saving");

      try {
        await window.GalleryApp.saveStateToSupabase();
      } finally {
        saveStateButton.disabled = false;
        saveStateButton.textContent = runtimeContext.t("save");
      }
    });
  }
}
