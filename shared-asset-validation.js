/*
  Exhibition Platform — C6C8C10 Transition Guard / True Foreground Readiness
  One full-page interaction lock shared by Public Viewer and Admin Workspace.
*/

const STYLE_ID = "exhibitionPlatformTransitionGuardStyles";
const GUARD_ID = "exhibitionPlatformTransitionGuard";
const TITLE_ID = "exhibitionPlatformTransitionGuardTitle";
const DETAIL_ID = "exhibitionPlatformTransitionGuardDetail";
const DEFAULT_MIN_VISIBLE_MS = 150;

let activeToken = 0;
let activeSince = 0;
let activeMinVisibleMs = DEFAULT_MIN_VISIBLE_MS;
let inputGuardsInstalled = false;

function nowMs() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    html.exhibition-transition-locked,
    body.exhibition-transition-locked { overflow:hidden !important; overscroll-behavior:none !important; }
    #${GUARD_ID} {
      position:fixed; inset:0; z-index:2147483000;
      display:grid; place-items:center;
      background:rgba(5,6,6,.68);
      backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px);
      cursor:wait; pointer-events:auto; touch-action:none;
      opacity:1; visibility:visible;
      transition:opacity 120ms ease, visibility 120ms ease;
    }
    #${GUARD_ID}.hidden { opacity:0; visibility:hidden; pointer-events:none; }
    #${GUARD_ID} .epTransitionCard {
      min-width:190px; max-width:min(360px,calc(100vw - 40px));
      display:grid; justify-items:center; gap:10px;
      padding:18px 22px 17px;
      border:1px solid rgba(255,255,255,.14); border-radius:14px;
      background:rgba(20,23,21,.94);
      box-shadow:0 24px 80px rgba(0,0,0,.34);
      color:rgba(255,255,255,.92); text-align:center;
      font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    }
    #${GUARD_ID} .epTransitionSpinner {
      width:34px; height:34px; border-radius:50%;
      border:3px solid rgba(255,255,255,.14);
      border-top-color:rgba(255,255,255,.88);
      animation:epTransitionSpin .72s linear infinite;
      will-change:transform; transform:translateZ(0);
    }
    #${GUARD_ID} .epTransitionTitle { font-size:12px; font-weight:800; letter-spacing:.035em; }
    #${GUARD_ID} .epTransitionDetail { color:rgba(255,255,255,.55); font-size:10px; line-height:1.4; }
    @keyframes epTransitionSpin { to { transform:rotate(360deg); } }
    @media (prefers-reduced-motion:reduce) {
      #${GUARD_ID} .epTransitionSpinner { animation-duration:1.6s; }
      #${GUARD_ID} { transition:none; }
    }
  `;
  document.head.appendChild(style);
}

function ensureGuard() {
  ensureStyles();
  let guard = document.getElementById(GUARD_ID);
  if (guard) return guard;
  guard = document.createElement("div");
  guard.id = GUARD_ID;
  guard.className = "hidden";
  guard.setAttribute("aria-hidden", "true");
  guard.setAttribute("aria-live", "polite");
  guard.setAttribute("aria-busy", "false");
  guard.tabIndex = -1;
  guard.innerHTML = `
    <div class="epTransitionCard" role="status">
      <div class="epTransitionSpinner" aria-hidden="true"></div>
      <div class="epTransitionTitle" id="${TITLE_ID}">Loading…</div>
      <div class="epTransitionDetail" id="${DETAIL_ID}">Please wait.</div>
    </div>`;
  document.body.appendChild(guard);
  installInputGuards();
  return guard;
}

function installInputGuards() {
  if (inputGuardsInstalled) return;
  inputGuardsInstalled = true;
  const block = (event) => {
    if (!activeToken) return;
    event.preventDefault();
    event.stopPropagation();
  };
  document.addEventListener("wheel", block, { capture:true, passive:false });
  document.addEventListener("touchmove", block, { capture:true, passive:false });
  document.addEventListener("keydown", (event) => {
    if (!activeToken) return;
    const blockedKeys = new Set(["Tab", "Enter", " ", "Spacebar", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"]);
    if (!blockedKeys.has(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);
}

async function waitForPaint() {
  // C6C8C7: rAF callbacks run before paint. Resolving a Promise inside the second rAF
  // can immediately continue into synchronous Babylon work and starve the compositor.
  // Cross a real task boundary, then one final frame, so the blocking overlay is visible
  // before atomic Exhibition hydration begins.
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => setTimeout(resolve, 34));
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

export function isTransitionGuardActive() {
  return !!activeToken;
}

export async function beginTransitionGuard(options = {}) {
  if (activeToken) return null;
  const guard = ensureGuard();
  const title = document.getElementById(TITLE_ID);
  const detail = document.getElementById(DETAIL_ID);
  activeToken += 1;
  const token = activeToken;
  activeSince = nowMs();
  activeMinVisibleMs = Math.max(0, Number(options.minVisibleMs ?? DEFAULT_MIN_VISIBLE_MS) || 0);
  if (title) title.textContent = String(options.title || "Loading…");
  if (detail) detail.textContent = String(options.detail || "Please wait.");
  document.documentElement.classList.add("exhibition-transition-locked");
  if (document.body) document.body.classList.add("exhibition-transition-locked");
  guard.classList.remove("hidden");
  guard.setAttribute("aria-hidden", "false");
  guard.setAttribute("aria-busy", "true");
  try { guard.focus({ preventScroll:true }); } catch (_error) {}
  await waitForPaint();
  return token;
}

export async function endTransitionGuard(token, options = {}) {
  if (!token || token !== activeToken) return false;
  const guard = ensureGuard();
  const minVisibleMs = Math.max(0, Number(options.minVisibleMs ?? activeMinVisibleMs) || 0);
  const remaining = minVisibleMs - (nowMs() - activeSince);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  if (token !== activeToken) return false;
  guard.classList.add("hidden");
  guard.setAttribute("aria-hidden", "true");
  guard.setAttribute("aria-busy", "false");
  document.documentElement.classList.remove("exhibition-transition-locked");
  if (document.body) document.body.classList.remove("exhibition-transition-locked");
  activeToken = 0;
  activeSince = 0;
  return true;
}
