import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../src/platform/supabase-config.js";
import { createPermissionService } from "../src/platform/permissions.js";
import {
  AdminContextRepository,
  VenueRepository,
  ExhibitionAdminRepository,
  SiteRepository,
  MediaAdminRepository,
  UserRepository,
  AdminRepository
} from "../src/platform/data/index.js";
import { createRouter } from "./core/router.js";
import { createShell } from "./core/shell.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderVenues } from "./views/venues.js";
import { renderExhibitions } from "./views/exhibitions.js";
import { renderHomepage, renderSettings } from "./views/homepage.js";
import { renderMedia } from "./views/media.js";
import { renderAuthors } from "./views/authors.js";
import { renderUsers } from "./views/users.js";
import { renderArchive } from "./views/archive.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const authRepository = new AdminContextRepository(supabase);
const loginView = document.getElementById("adminLogin");
const appView = document.getElementById("adminApp");
const loginForm = document.getElementById("adminLoginForm");
const loginError = document.getElementById("adminLoginError");

let runtime = null;
let rendering = Promise.resolve();

const ROUTES = Object.freeze({
  dashboard: { capability: "site.read", render: renderDashboard },
  venues: { capability: "venue.read", render: renderVenues },
  exhibitions: { capability: "exhibition.read", render: renderExhibitions },
  homepage: { capability: "site.edit", render: renderHomepage },
  media: { capability: "media.read", render: renderMedia },
  authors: { capability: "authors.read", render: renderAuthors },
  users: { capability: "users.manage", render: renderUsers },
  archive: { capability: "exhibition.archive", render: renderArchive },
  settings: { capability: "site.edit", render: renderSettings }
});

function showLogin(message = "") {
  loginError.textContent = message;
  appView.hidden = true;
  loginView.hidden = false;
}

function showApp() {
  loginView.hidden = true;
  appView.hidden = false;
}

async function destroyRuntime() {
  if (runtime && runtime.router) runtime.router.destroy();
  runtime = null;
}

async function createRuntime() {
  const context = await authRepository.getContext();
  if (!context.active) throw new Error("To konto zostało zdezaktywowane w Site Admin.");
  const permissions = createPermissionService(context);
  const repos = {
    auth: authRepository,
    venues: new VenueRepository(supabase),
    exhibitions: new ExhibitionAdminRepository(supabase),
    site: new SiteRepository(supabase),
    media: new MediaAdminRepository(supabase),
    users: new UserRepository(supabase),
    admin: new AdminRepository(supabase)
  };
  let router;
  const shell = createShell({
    permissionService: permissions,
    onNavigate: (name, id) => router.navigate(name, id),
    onLogout: async () => {
      await authRepository.signOut();
      await destroyRuntime();
      showLogin();
    }
  });
  const ctx = { supabase, context, permissions, repos, shell, get router() { return router; } };
  router = createRouter((route) => {
    rendering = rendering.then(async () => {
      const definition = ROUTES[route.name] || ROUTES.dashboard;
      if (!permissions.has(definition.capability)) {
        shell.toast("Nie masz uprawnień do tej sekcji.", "error");
        router.navigate("dashboard");
        return;
      }
      try {
        await definition.render(ctx, route);
        shell.view.focus({ preventScroll: true });
      } catch (error) {
        console.error(error);
        shell.toast(error.message || "Błąd widoku", "error");
      }
    });
  });
  runtime = { ctx, router };
  showApp();
  router.start();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";
  const submit = loginForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    await authRepository.signIn(loginForm.elements.adminEmail.value, loginForm.elements.adminPassword.value);
    await createRuntime();
  } catch (error) {
    showLogin(error.message || "Nie udało się zalogować.");
  } finally {
    submit.disabled = false;
  }
});

(async function bootstrapAdmin() {
  try {
    const session = await authRepository.getSession();
    if (!session) return showLogin();
    await createRuntime();
  } catch (error) {
    console.error(error);
    showLogin(error.message || "Nie udało się uruchomić panelu.");
  }
})();
