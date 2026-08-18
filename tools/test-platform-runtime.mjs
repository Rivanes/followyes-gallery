import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import vm from 'node:vm';

// Consolidated regression suite. Each block is isolated so legacy variable names cannot collide.

// --- test-stage12c66c6c7c8-multi-exhibition.mjs ---
await (async () => {
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src', 'Gallery_V0_11.js'), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, 'src', 'bootstrap', 'gallery-viewer-bootstrap.js'), 'utf8');
const config = fs.readFileSync(path.join(root, 'src', 'config', 'gallery-space-config.js'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'SUPABASE_SQL', '01_MULTI_EXHIBITION_CORE_STORAGE_POLICIES.sql'), 'utf8');

function expect(label, condition) {
  if (!condition) throw new Error(`Multi-exhibition invariant failed: ${label}`);
  console.log(`✓ ${label}`);
}

expect('Combined C6C7/C6C8 stage identity exists',
  source.includes('Stage 12C66C6C7C8: Space / Exhibition Split + Multi-Exhibition'));

expect('Scene factory accepts external runtime options',
  source.includes('export const createScene = function (engineArg, canvasArg, runtimeOptionsArg)') &&
  source.includes('runtimeOptions.spaceDefinition') &&
  bootstrap.includes('spaceDefinition: gallerySpaceDefinition') &&
  bootstrap.includes('const requestedExhibitionId = getRequestedExhibitionId()') &&
  bootstrap.includes('exhibitionId: publicExhibitionId'));

expect('Current building GLBs live in external Space config',
  config.includes('Floor_segment.glb') && config.includes('Wall_segments.glb') &&
  config.includes('Ceiling.glb') && config.includes('Props.glb') &&
  source.includes('requireGallerySpaceAsset("floor")') &&
  source.includes('requireGallerySpaceAsset("walls")') &&
  source.includes('requireGallerySpaceAsset("ceiling")') &&
  source.includes('requireGallerySpaceAsset("props")'));

expect('gallery_state reads and saves by active exhibition instead of hard-coded main',
  source.includes('fetchGalleryStateRowForExhibition') &&
  source.includes('.eq("id", exhibitionId)') &&
  source.includes('var activeExhibitionId = typeof getActiveGalleryExhibitionId === "function"') &&
  source.includes('.eq("id", activeExhibitionId)') &&
  !source.includes('.eq("id", "main")'));

expect('Storage and save-integrity keys are scoped per exhibition',
  source.includes('getGalleryExhibitionStoragePrefix') &&
  source.includes('"exhibitions/" + exhibitionId') &&
  source.includes('getGalleryExhibitionBackupId') &&
  source.includes('gallerySaveIntegrityRuntime.remoteBackupId = getGalleryExhibitionBackupId(exhibitionId)'));

expect('Frame library remains shared at main/frames',
  source.includes('return "main/" + galleryArtworkFrameStorageFolder;'));

expect('Engine can create and switch exhibitions while catalog UI is external',
  !source.includes('createEditorSection("EXHIBITIONS")') &&
  source.includes('function createGalleryExhibition(') &&
  source.includes('function switchGalleryExhibition('));

expect('Switching clears only Exhibition runtime and restores Space baseline',
  source.includes('function captureGallerySpaceBaseline(') &&
  source.includes('function resetGalleryRuntimeToBlankExhibition(') &&
  source.includes('galleryExhibitionRuntime.spaceBaseline'));

expect('Serialized state carries Space/Exhibition context',
  source.includes('exhibitionId: getActiveGalleryExhibitionId()') &&
  source.includes('spaceId: galleryActiveSpaceId'));

expect('SQL creates exhibition catalog and keeps existing main in place',
  sql.includes('create table if not exists public.gallery_exhibitions') &&
  sql.includes("'main', 'Main Exhibition', 'main'") &&
  sql.includes("on conflict (id) do nothing") &&
  sql.includes("gallery-artworks/exhibitions/<exhibitionId>"));

expect('SQL scopes public state/media to published exhibitions while admin can edit drafts',
  sql.includes('Public can read published gallery state') &&
  sql.includes('gallery_artworks_public_select_scoped') &&
  sql.includes("auth.jwt() ->> 'email' = 'admin@followyes.pl'"));

console.log('Stage 12C66C6C7C8 multi-exhibition invariants passed.');

})();

// --- test-stage12c66c6c7c8b-admin-workspace.mjs ---
await (async () => {
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src', 'Gallery_V0_11.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const adminBootstrap = fs.readFileSync(path.join(root, 'src', 'bootstrap', 'admin-workspace-bootstrap.js'), 'utf8');
const publicBootstrap = fs.readFileSync(path.join(root, 'src', 'bootstrap', 'gallery-editor-bootstrap.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function expect(label, condition) {
  if (!condition) throw new Error(`Admin Workspace invariant failed: ${label}`);
  console.log(`✓ ${label}`);
}

expect('Admin Workspace stage identity exists',
  source.includes('Stage 12C66C6C7C8B: Admin Workspace') &&
  adminBootstrap.includes('const STAGE = "12C66C6C8C16"'));

expect('Exhibition manager was removed from the in-scene editor',
  !source.includes('createEditorSection("EXHIBITIONS")') &&
  !source.includes('exhibitionManagerSectionData'));

expect('Engine exposes programmatic admin APIs',
  source.includes('updateExhibitionMetadata: updateGalleryExhibitionMetadata') &&
  source.includes('setEditMode: function (enabled)') &&
  source.includes('switchExhibition: switchGalleryExhibition'));

expect('Admin page contains constrained viewport and exhibition metadata controls',
  admin.includes('id="adminViewportStage"') &&
  admin.includes('id="renderCanvas"') &&
  admin.includes('id="exhibitionList"') &&
  admin.includes('id="exhibitionName"') &&
  admin.includes('id="posterFileInput"') &&
  admin.includes('id="exhibitionPublished"'));

expect('Admin bootstrap manages catalog, metadata and poster Storage',
  adminBootstrap.includes('from("gallery_exhibitions")') &&
  adminBootstrap.includes('updateExhibitionMetadata') &&
  adminBootstrap.includes('/branding/posters/') &&
  adminBootstrap.includes('storage.from(STORAGE_BUCKET).upload'));

expect('Admin engine starts in the selected exhibition and enters Edit Mode',
  adminBootstrap.includes('exhibitionId: initialId') &&
  adminBootstrap.includes('window.GalleryApp.setEditMode(true)'));

expect('Public login redirects into Admin Workspace',
  publicBootstrap.includes('window.location.href = "./admin.html"') &&
  index.includes('id="adminWorkspaceButton"'));

console.log('Stage 12C66C6C7C8B Admin Workspace invariants passed.');

})();

// --- test-stage12c66c6c7c8b1-public-admin-edit-gate.mjs ---
await (async () => {
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src', 'Gallery_V0_11.js'), 'utf8');
const viewer = fs.readFileSync(path.join(root, 'src', 'bootstrap', 'gallery-viewer-bootstrap.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'src', 'bootstrap', 'admin-workspace-bootstrap.js'), 'utf8');

function expect(label, condition) {
  if (!condition) throw new Error(`Public/Admin edit gate invariant failed: ${label}`);
  console.log(`✓ ${label}`);
}

expect('Engine has explicit Admin Workspace runtime mode',
  source.includes('var galleryAdminWorkspaceMode = runtimeOptions.adminWorkspace === true;') &&
  source.includes('var galleryPublicViewerOnly = !galleryAdminWorkspaceMode;'));

expect('Public Edit Mode control routes to admin for active exhibition',
  source.includes('function openGalleryAdminWorkspaceForActiveExhibition()') &&
  source.includes('"./admin.html?exhibition=" + encodeURIComponent(exhibitionId || "main")') &&
  source.includes('if (galleryPublicViewerOnly) {\n            return openGalleryAdminWorkspaceForActiveExhibition();'));

expect('Programmatic edit cannot be enabled on public viewer',
  source.includes('if (desired && galleryPublicViewerOnly) {\n                return false;'));

expect('Admin workspace explicitly opts into scene editing',
  admin.includes('adminWorkspace: true') && admin.includes('window.GalleryApp.setEditMode(true)'));

expect('Public page never exposes Save button after authentication',
  viewer.includes('saveStateButton.classList.add("hidden")'));

console.log('Public Viewer / Admin Edit Gate invariants passed.');

})();

// --- test-stage12c66c6c8c-asset-residency-egress-guard.mjs ---
await (async () => {
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src', 'Gallery_V0_11.js'), 'utf8');
const viewer = fs.readFileSync(path.join(root, 'src', 'bootstrap', 'gallery-viewer-bootstrap.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'src', 'bootstrap', 'admin-workspace-bootstrap.js'), 'utf8');
const cacheBootstrap = fs.readFileSync(path.join(root, 'src', 'bootstrap', 'asset-cache-bootstrap.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'asset-cache-sw.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

function expect(label, condition) {
  if (!condition) throw new Error(`C6C8C invariant failed: ${label}`);
  console.log(`✓ ${label}`);
}

expect('Asset residency is global, not mobile-only',
  source.includes('schema: "gallery-artwork-residency.v3"') &&
  source.includes('enabled: true') &&
  source.includes('desktopFullTextures: 6') && source.includes('desktopHardFullTextures: 8'));

expect('Full textures require proximity or explicit protection',
  source.includes('function isGalleryArtworkFullEgressEligible') &&
  source.includes('desktopFullDistance') &&
  source.includes('mobileFullDistance') &&
  source.includes('return priority.visible || priority.tier === "critical" || priority.tier === "nearby";'));

expect('Desktop Full queue obeys residency admission and finite capacity',
  source.includes('return isGalleryArtworkFullResidencyDesired(candidate.artwork);') &&
  !source.includes('return !isGalleryDeviceProfileMobile() || isGalleryArtworkFullResidencyDesired(candidate.artwork);'));

expect('Persistent cache is registered by Viewer and Admin before 3D startup',
  viewer.includes('registerExhibitionAssetCache') && viewer.includes('await assetCacheReadyPromise;') &&
  admin.includes('registerExhibitionAssetCache') && admin.includes('await assetCacheReadyPromise;'));

expect('Service worker caches only asset-like GET requests and deduplicates concurrent URL fetches',
  serviceWorker.includes('STORAGE_PUBLIC_MARKER') &&
  serviceWorker.includes('CACHEABLE_EXTENSIONS') &&
  serviceWorker.includes('const inFlight = new Map()') &&
  serviceWorker.includes('const cached = await cache.match(request)'));

expect('Viewer to Admin has short-lived state handoff',
  source.includes('exhibition-navigation-handoff.v1') &&
  source.includes('sessionStorage.setItem("exhibition_platform_handoff_" + exhibitionId') &&
  admin.includes('function readNavigationHandoff') &&
  admin.includes('initialExhibitionSnapshot: initialSnapshot || null'));

expect('Admin does not refetch the full catalog after every local switch/save',
  admin.includes('function upsertLocalCatalogRecord') &&
  !admin.includes('updateUrlExhibition(id);\n    await fetchCatalog();'));

expect('Previously visited exhibition states are cached in runtime',
  source.includes('stateCache: Object.create(null)') &&
  source.includes('getCachedGalleryExhibitionState(exhibitionId)') &&
  source.includes('cachedTarget ? Object.assign({}, cachedTarget.exhibition)'));

expect('Frame library listing no longer downloads every GLB',
  source.includes('function getGalleryArtworkFrameWarmupEntries') &&
  source.includes('prefetchGalleryArtworkFrameCatalogAssets(getGalleryArtworkFrameWarmupEntries(catalog))') &&
  !source.includes('prefetchGalleryArtworkFrameCatalogAssets(galleryArtworkFrameCatalog);'));

expect('Poster upload is optimized before Storage delivery',
  admin.includes('POSTER_DELIVERY_MAX_SIDE = 1400') &&
  admin.includes('optimizePosterForDelivery') &&
  admin.includes('canvas.toBlob(resolve, "image/webp"') &&
  admin.includes('-cover.webp`'));

expect('Admin exposes delivery status',
  adminHtml.includes('id="assetDeliveryStatus"') &&
  admin.includes('getExhibitionAssetCacheStatus') &&
  source.includes('getAssetDeliveryDebug: getGalleryAssetDeliveryDebug'));

expect('Asset cache bootstrap exposes status/clear/evict helpers',
  cacheBootstrap.includes('getExhibitionAssetCacheStatus') &&
  cacheBootstrap.includes('clearExhibitionAssetCache') &&
  cacheBootstrap.includes('evictExhibitionAssetCacheUrl'));

console.log('Stage 12C66C6C8C Asset Residency / Egress Guard invariants passed.');

})();

// --- test-stage12c66c6c8c1-runtime-lifecycle-admin-transition.mjs ---
await (async () => {
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src', 'Gallery_V0_11.js'), 'utf8');
const viewer = fs.readFileSync(path.join(root, 'src', 'bootstrap', 'gallery-viewer-bootstrap.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'src', 'bootstrap', 'admin-workspace-bootstrap.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const cacheBootstrap = fs.readFileSync(path.join(root, 'src', 'bootstrap', 'asset-cache-bootstrap.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'asset-cache-sw.js'), 'utf8');

function expect(label, condition) {
  if (!condition) throw new Error(`C6C8C1 invariant failed: ${label}`);
  console.log(`✓ ${label}`);
}

const preloadCallIndex = source.indexOf('beginGalleryStartupStatePreload("createScene-before-model-imports")');
const saveRuntimeIndex = source.indexOf('var gallerySaveIntegrityRuntime = {');
const exhibitionRuntimeIndex = source.indexOf('var galleryExhibitionRuntime = {');
expect('Save and Exhibition runtimes initialize before startup state preload',
  saveRuntimeIndex >= 0 && exhibitionRuntimeIndex >= 0 && preloadCallIndex >= 0 &&
  saveRuntimeIndex < preloadCallIndex && exhibitionRuntimeIndex < preloadCallIndex &&
  source.split('var gallerySaveIntegrityRuntime = {').length - 1 === 1 &&
  source.split('var galleryExhibitionRuntime = {').length - 1 === 1);

expect('Public Viewer cannot create a draft; only an existing Admin draft-preview keeps unload protection',
  source.includes('function hasGalleryUnsavedChanges() {') &&
  source.includes('if (!galleryAdminWorkspaceMode && !galleryAdminDraftPreviewActive)') &&
  source.includes('function markGalleryDraftDirty(reason) {\n        if (!galleryAdminWorkspaceMode)') &&
  source.includes('function installGalleryAdminBeforeUnloadGuard()') &&
  source.includes('if (!galleryAdminWorkspaceMode && !galleryAdminDraftPreviewActive) return false;') &&
  source.includes('if (galleryAdminWorkspaceMode) {\n        installGalleryAdminBeforeUnloadGuard();'));

expect('Public baseline does not start editor draft watcher',
  source.includes('if (galleryAdminWorkspaceMode) {\n            startGalleryDraftStateWatcher();') &&
  source.includes('function startGalleryDraftStateWatcher() {\n        if (!galleryAdminWorkspaceMode)'));

expect('Navigation handoff prefers published state and both Viewer/Admin can consume it',
  source.includes('var cachedPublished = getCachedGalleryExhibitionState(exhibitionId);') &&
  source.includes('publishedSnapshot || serializeGalleryState()') &&
  viewer.includes('function readNavigationHandoff(id)') &&
  viewer.includes('initialExhibitionSnapshot: navigationHandoff || null') &&
  admin.includes('function readNavigationHandoff(id)'));

expect('Invalid/missing handoff state falls through to remote state load',
  source.includes('var handoffHasState = !!(handoff.state && typeof handoff.state === "object");') &&
  source.includes('handoffExhibition.id === galleryRequestedExhibitionId && handoffHasState'));

expect('Preview hydration is superseded by one-slice active-zone background budget',
  source.includes('function pumpGalleryZoneStreamingQueues(reason)') &&
  source.includes('takeGalleryStreamingQueueEntry(galleryFastStartRuntime.deferredArtworkLoads, "artwork", ["critical", "nearby"])') &&
  source.includes('budgetRuntime.artworkStarts += 1'));

expect('Automatic Full upgrades wait only for active-zone Preview population',
  source.includes('var previewPopulationPending = galleryFastStartRuntime.deferredArtworkLoads.some(function (queuedEntry)') &&
  source.includes('queuedTier === "critical" || queuedTier === "nearby"') &&
  source.includes('if (previewPopulationPending && !entry.inspectPriority)'));

expect('Public Page keeps active exhibition and preserves draft instead of discarding it',
  adminHtml.includes('id="publicPageButton"') &&
  admin.includes('updatePublicPageHref(selectedExhibition.id)') &&
  admin.includes('window.GalleryApp.createNavigationHandoff()') &&
  admin.includes('inlineRuntimeContext.close({ preserveDraft: true, reason: "public-preview" })') &&
  !admin.includes('Discard them and return to the public Viewer?'));

expect('Cache stats polling is throttled instead of rescanning every 8 seconds',
  admin.includes('function startAssetDeliveryMonitoring()') && admin.includes('window.setInterval(updateAssetDeliveryStatus, 30000)') &&
  cacheBootstrap.includes('now - statusMemoAt < 60000') &&
  serviceWorker.includes('now - statsMemoAt < 60000'));

expect('Persistent asset cache survives application stage deploys',
  serviceWorker.includes('const CACHE_NAME = "exhibition-platform-assets-v1";') &&
  serviceWorker.includes('async function migrateLegacyAssetCaches()') &&
  serviceWorker.includes('await target.put(request, response.clone())'));

console.log('Stage 12C66C6C8C1 Runtime Lifecycle / Admin Transition invariants passed.');

})();

// --- test-stage12c66c6c8c2-same-runtime-admin.mjs ---
await (async () => {
const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
const viewer = fs.readFileSync(new URL('../src/bootstrap/gallery-viewer-bootstrap.js', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../src/bootstrap/admin-workspace-bootstrap.js', import.meta.url), 'utf8');
const adminHtml = fs.readFileSync(new URL('../admin.html', import.meta.url), 'utf8');
function expect(label, condition) { if (!condition) throw new Error(`C6C8C2 invariant failed: ${label}`); console.log(`✓ ${label}`); }
expect('Engine exposes same-runtime Admin enter/exit APIs', source.includes('enterAdminWorkspaceMode: enterGalleryAdminWorkspaceMode') && source.includes('exitAdminWorkspaceMode: exitGalleryAdminWorkspaceMode'));
expect('Public Edit Mode prefers inline Admin callback before navigation fallback', source.includes('window.ExhibitionPlatformOpenAdminWorkspace') && source.indexOf('window.ExhibitionPlatformOpenAdminWorkspace') < source.indexOf('window.location.href = targetUrl'));
expect('Viewer mounts Admin Workspace around the existing gallery section', viewer.includes('function openInlineAdminWorkspace(') && viewer.includes('stage.appendChild(gallerySection)'));
expect('Viewer passes the existing Babylon engine and scene', viewer.includes('engine: activeEngine') && viewer.includes('scene: activeScene'));
expect('Admin bootstrap reuses existing runtime without creating another engine in inline branch', admin.includes('const inlineWorkspaceMode') && admin.includes('engine = inlineRuntimeContext.engine') && admin.includes('scene = inlineRuntimeContext.scene') && admin.includes('enterAdminWorkspaceMode'));
expect('Returning to Public Viewer uses inline close instead of document navigation', admin.includes('inlineRuntimeContext.close') && viewer.includes('function closeInlineAdminWorkspace('));
expect('Public Page link is styled like a button including visited state', adminHtml.includes('.adminButton:visited') && adminHtml.includes('text-decoration:none'));
expect('Inline Public Page control has explicit non-link button styling', viewer.includes('#inlineAdminWorkspace .adminButton:visited') && viewer.includes('text-decoration:none !important'));
console.log('Stage 12C66C6C8C2 Same-Runtime Admin Workspace invariants passed.');

})();

// --- test-runtime-hygiene-cache-versioning.mjs ---
await (async () => {
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src', 'Gallery_V0_11.js'), 'utf8');
const viewer = fs.readFileSync(path.join(root, 'src', 'bootstrap', 'gallery-viewer-bootstrap.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'src', 'bootstrap', 'admin-workspace-bootstrap.js'), 'utf8');
const space = fs.readFileSync(path.join(root, 'src', 'config', 'gallery-space-config.js'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'SUPABASE_SQL', '04_RUNTIME_HYGIENE_PUBLICATION_POLICIES.sql'), 'utf8');
const sqlReadme = fs.readFileSync(path.join(root, 'SUPABASE_SQL', 'README_FIRST.md'), 'utf8');

function expect(label, condition) {
  if (!condition) throw new Error(`Runtime hygiene invariant failed: ${label}`);
  console.log(`✓ ${label}`);
}

expect('Public Viewer cannot register itself as an active editor heartbeat',
  source.includes('if (!editorAuthenticated || !galleryAdminWorkspaceMode)') &&
  source.includes('return !!(galleryAdminWorkspaceMode && editorAuthenticated);') &&
  source.includes('stopGalleryEditorTabHeartbeat(true);\n        galleryAdminWorkspaceMode = false;'));

expect('Same-runtime workspace switches the egress policy on Admin enter and public return',
  source.includes('function syncGalleryArtworkEgressPolicyForWorkspaceMode(') &&
  source.includes('syncGalleryArtworkEgressPolicyForWorkspaceMode("same-runtime-admin-enter")') &&
  source.includes('galleryAdminDraftPreviewActive ? "persistent-draft-public-preview" : "same-runtime-public-return"'));

expect('Engine can discard a dirty scene without rebuilding the Space',
  source.includes('function discardGalleryUnsavedChanges(reason)') &&
  source.includes('discardUnsavedChanges: discardGalleryUnsavedChanges'));

expect('Admin metadata owns a real dirty baseline and is included in transition guards',
  admin.includes('let metadataDirty = false;') &&
  admin.includes('function syncMetadataDirtyState()') &&
  admin.includes('function confirmAndDiscardAdminChanges(') &&
  admin.includes('hasAdminMetadataUnsavedChanges') &&
  admin.includes('discardAdminMetadataChanges'));

expect('Hidden inline Admin suspends timer/resize work while preserving unload guard only for a live metadata draft preview',
  admin.includes('export async function suspendAdminWorkspace(options = {})') &&
  admin.includes('stopAssetDeliveryMonitoring();') &&
  admin.includes('if (!metadataDraftPreviewActive) removeMetadataBeforeUnload();') &&
  admin.includes('if (resizeCleanup) resizeCleanup();') &&
  viewer.includes('adminModule.suspendAdminWorkspace({ preserveDraft })'));

expect('Fixed-path Space GLBs use explicit cache versions',
  space.includes('version: 1') &&
  source.includes('deliveryFileName: appendGalleryAssetVersion(asset.fileName, cacheVersion)') &&
  source.includes('galleryFloorSpaceAsset.deliveryFileName') &&
  source.includes('".glb"'));

expect('Frame catalog derives a cache version from Storage metadata',
  source.includes('entry.updated_at || entry.updatedAt || metadata.eTag') &&
  source.includes('cacheVersion: cacheVersion') &&
  source.includes('return appendGalleryAssetVersion(baseUrl, frameState.cacheVersion);'));

expect('Main publication is no longer an unconditional public exception',
  !sql.includes("id = 'main'\n  or exists") &&
  sql.includes("where ge.id = gallery_state.id") &&
  sql.includes("(storage.foldername(name))[2] = 'frames'") &&
  sql.includes("ge.id = 'main'") &&
  sql.includes('ge.is_published = true'));

expect('Public viewer resolves only published exhibitions and can fall back to another published exhibition',
  viewer.includes('async function resolvePublishedExhibitionId(') &&
  viewer.includes('.eq("is_published", true)') &&
  viewer.includes('const publicExhibitionId = await resolvePublishedExhibitionId(requestedExhibitionId);') &&
  source.includes('if (galleryPublicViewerOnly && exhibition.is_published === false)'));

expect('SQL package is cleaned of no-op Stage marker files',
  sqlReadme.includes('04_RUNTIME_HYGIENE_PUBLICATION_POLICIES.sql') &&
  !fs.existsSync(path.join(root, 'SUPABASE_SQL', '04_STAGE_C6C8C_NO_SQL_REQUIRED.sql')) &&
  !fs.existsSync(path.join(root, 'SUPABASE_SQL', '05_STAGE_C6C8C1_NO_SQL_REQUIRED.sql')) &&
  !fs.existsSync(path.join(root, 'SUPABASE_SQL', '06_STAGE_C6C8C2_NO_SQL_REQUIRED.sql')));

console.log('Runtime Hygiene / Cache Versioning invariants passed.');

})();

// --- test-space-residency-exhibition-delta-switch.mjs ---
await (async () => {
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src', 'Gallery_V0_11.js'), 'utf8');
const viewer = fs.readFileSync(path.join(root, 'src', 'bootstrap', 'gallery-viewer-bootstrap.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function expect(label, condition) {
  if (!condition) throw new Error(`Space residency invariant failed: ${label}`);
  console.log(`✓ ${label}`);
}

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const marker of markers) {
    start = source.indexOf(marker);
    if (start >= 0) break;
  }
  if (start < 0) throw new Error(`Missing function ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0, mode = 'code', quote = '';
  for (let i = brace; i < source.length; i++) {
    const c = source[i], n = source[i + 1] || '';
    if (mode === 'code') {
      if (c === '"' || c === "'" || c === '`') { mode = 'string'; quote = c; }
      else if (c === '/' && n === '/') { mode = 'line'; i++; }
      else if (c === '/' && n === '*') { mode = 'block'; i++; }
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return source.slice(start, i + 1);
    } else if (mode === 'string') {
      if (c === '\\') i++;
      else if (c === quote) mode = 'code';
    } else if (mode === 'line' && c === '\n') mode = 'code';
    else if (mode === 'block' && c === '*' && n === '/') { mode = 'code'; i++; }
  }
  throw new Error(`Unterminated function ${name}`);
}

const switchFn = extractFunction('switchGalleryExhibition');
const deltaFn = extractFunction('applyGallerySameSpaceExhibitionState');
const finalizeFn = extractFunction('finalizeGallerySameSpaceExhibitionDelta');
const objectDirtyFn = extractFunction('markGalleryObjectsDirty');
const editTourHelper = source.includes('function ensureGalleryExhibitTourCurrent(') ? extractFunction('ensureGalleryExhibitTourCurrent') : '';

expect('Runtime identity includes C6C8C4 residency in current C6C8C5 build', source.includes('Stage 12C66C6C8C4: Space Residency / Exhibition Delta Switch') && source.includes('stage: "12C66C6C8C16"') && pkg.version.includes('c6c8c16'));
expect('Switch explicitly compares source and target space_id', switchFn.includes('areGalleryExhibitionsInSameSpace(previousExhibition, exhibition)'));
expect('Same-space cold switch uses delta state and resident return has a dedicated resume path', switchFn.includes('applyGallerySameSpaceExhibitionState(state, "same-space-exhibition-switch")') && switchFn.includes('lastSwitchMode = "same-space-delta-load"') && switchFn.includes('lastSwitchMode = "resident-layer-resume"'));
expect('Full reset remains only as fallback for a real Space change', switchFn.includes('else {\n                resetGalleryRuntimeToBlankExhibition();'));
expect('Delta apply suppresses duplicated wall/presentation/global refresh work', deltaFn.includes('skipWalls: true') && deltaFn.includes('skipSpacePresentation: true') && deltaFn.includes('deferGlobalRefresh: true'));
expect('Same-space finalization refreshes only Exhibition collisions before one global batch', finalizeFn.includes('refreshViewerExhibitionCollisionMeshes();') && !finalizeFn.includes('refreshViewerCollisionMeshes();'));
expect('Object changes no longer clear resident Space static world-bounds cache', !objectDirtyFn.includes('markLocalLightTargetCacheDirty') && objectDirtyFn.includes('clearLocalLightTargetMeshCacheForAll'));
expect('Edit/Admin entry does not unconditionally rebuild Tour paths', !source.includes('ensureGalleryExhibitTourCurrent("enter-edit-mode")') && !source.includes('ensureGalleryExhibitTourCurrent("same-runtime-admin-enter")') && (!editTourHelper || editTourHelper.includes('needsRebuild')));
expect('Same-runtime Viewer/Admin path is still present', viewer.includes('engine: activeEngine') && viewer.includes('scene: activeScene'));
expect('Debug counters expose residency behavior', source.includes('sameSpaceSwitchCount: galleryExhibitionRuntime.sameSpaceSwitchCount') && source.includes('fullRuntimeResetCount: galleryExhibitionRuntime.fullRuntimeResetCount'));

console.log('Space Residency / Exhibition Delta Switch invariants passed.');

})();

// --- test-exhibition-residency-zero-reload.mjs ---
await (async () => {
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src', 'Gallery_V0_11.js'), 'utf8');
const viewer = fs.readFileSync(path.join(root, 'src', 'bootstrap', 'gallery-viewer-bootstrap.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'src', 'bootstrap', 'admin-workspace-bootstrap.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const cacheBootstrap = fs.readFileSync(path.join(root, 'src', 'bootstrap', 'asset-cache-bootstrap.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'asset-cache-sw.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function expect(label, condition) {
  if (!condition) throw new Error(`C6C8C5 invariant failed: ${label}`);
  console.log(`✓ ${label}`);
}
function extractFunction(text, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  let start=-1;
  for (const marker of markers) { start=text.indexOf(marker); if(start>=0) break; }
  if(start<0) throw new Error(`Missing ${name}`);
  const brace=text.indexOf('{',start); let depth=0,mode='code',quote='';
  for(let i=brace;i<text.length;i++){
    const c=text[i],n=text[i+1]||'';
    if(mode==='code'){
      if(c==='"'||c==="'"||c==='`'){mode='string';quote=c;}
      else if(c==='/'&&n==='/'){mode='line';i++;}
      else if(c==='/'&&n==='*'){mode='block';i++;}
      else if(c==='{') depth++;
      else if(c==='}'&&--depth===0) return text.slice(start,i+1);
    } else if(mode==='string'){ if(c==='\\') i++; else if(c===quote) mode='code'; }
    else if(mode==='line'&&c==='\n') mode='code';
    else if(mode==='block'&&c==='*'&&n==='/'){mode='code';i++;}
  }
  throw new Error(`Unterminated ${name}`);
}

const switchFn = extractFunction(source, 'switchGalleryExhibition');
const parkFn = extractFunction(source, 'parkActiveGalleryExhibitionLayer');
const restoreFn = extractFunction(source, 'restoreGalleryExhibitionLayer');
const enterFn = extractFunction(source, 'enterGalleryAdminWorkspaceMode');
const exitFn = extractFunction(source, 'exitGalleryAdminWorkspaceMode');
const modeFn = extractFunction(source, 'setGallerySameRuntimeModeState');

expect('Current runtime/package identity is C6C8C5', source.includes('stage: "12C66C6C8C16"') && pkg.version.includes('c6c8c16'));
expect('Recently visited Exhibition layers have a residency registry', source.includes('layerResidency: Object.create(null)') && source.includes('residentLayerHits'));
expect('Switch parks a clean same-Space layer instead of disposing it', switchFn.includes('parkActiveGalleryExhibitionLayer(previousExhibition, previousRuntimeState)') && parkFn.includes('setGalleryArtworkResidentEnabled(artwork, false'));
expect('Resident target is restored from RAM/GPU', switchFn.includes('restoreGalleryExhibitionLayer(exhibition.id)') && switchFn.includes('lastSwitchMode = "resident-layer-resume"') && restoreFn.includes('artworks = layer.artworks'));
expect('Parked artwork callbacks cannot re-register inactive owners', source.includes('artwork.metadata.exhibitionLayerParked') && source.includes('if (artwork.metadata && artwork.metadata.exhibitionLayerParked) return false'));
expect('Residency is bounded by LRU eviction', source.includes('maxParkedLayers') && source.includes('pruneGalleryExhibitionLayerResidency(exhibition.id)') && source.includes('residentLayerEvictions'));
expect('Admin/Public mode transition avoids old edit-button rebuild path', modeFn.includes('same-runtime-ui-only') && !exitFn.includes('editButton.click()') && !exitFn.includes('updateViewerCollisionMode()') && !exitFn.includes('rebuildGalleryExhibitTour('));
expect('Admin entry also uses same-runtime mode state', enterFn.includes('setGallerySameRuntimeModeState(true'));
expect('Service Worker measures cache hits and real Storage network fetches', sw.includes('EXHIBITION_ASSET_DELIVERY_STATS') && sw.includes('supabaseNetworkFetches') && sw.includes('networkKnownBytes'));
expect('Cache bootstrap exposes network delivery stats', cacheBootstrap.includes('getExhibitionAssetDeliveryStats') && cacheBootstrap.includes('resetExhibitionAssetDeliveryStats'));
expect('Admin UI exposes hard network diagnostics', adminHtml.includes('id="networkDiagnostics"') && admin.includes('Storage session:') && admin.includes('zeroStorageNetwork'));
expect('Exhibition switch captures a per-transition Storage delta', admin.includes('captureExhibitionTransitionDiagnostic') && admin.includes('supabaseNetworkFetches'));
expect('Admin → Public transition captures a same-runtime Storage delta', viewer.includes('finishModeTransitionDiagnostic') && viewer.includes('zeroStorageNetwork'));

console.log('C6C8C5 Exhibition Residency / Zero-Reload / Network Diagnostics invariants passed.');

})();
