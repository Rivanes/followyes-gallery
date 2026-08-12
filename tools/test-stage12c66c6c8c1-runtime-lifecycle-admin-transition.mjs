import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

expect('Public Viewer cannot become dirty and owns no editor beforeunload guard',
  source.includes('function hasGalleryUnsavedChanges() {\n        if (!galleryAdminWorkspaceMode)') &&
  source.includes('function markGalleryDraftDirty(reason) {\n        if (!galleryAdminWorkspaceMode)') &&
  source.includes('function installGalleryAdminBeforeUnloadGuard()') && source.includes('if (galleryAdminWorkspaceMode) {\n        installGalleryAdminBeforeUnloadGuard();'));

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

expect('Admin Preview queue uses full desktop preview concurrency while public keeps conservative cap',
  source.includes('var requestedArtworkConcurrency = Math.max(1, Number(galleryDeviceProfile.previewTextureConcurrency) || 2);') &&
  source.includes('var artworkConcurrency = galleryAdminWorkspaceMode') &&
  source.includes('Math.min(3, requestedArtworkConcurrency)'));

expect('Automatic Full upgrades yield until Preview population is done',
  source.includes('var previewPopulationPending = galleryFastStartRuntime.deferredArtworkLoads.some(isGalleryArtworkQueueEntryCurrent)') &&
  source.includes('if (previewPopulationPending && !entry.inspectPriority)'));

expect('Public Page keeps active exhibition and clean admin creates handoff',
  adminHtml.includes('id="publicPageButton"') &&
  admin.includes('updatePublicPageHref(selectedExhibition.id)') &&
  admin.includes('window.GalleryApp.createNavigationHandoff()') &&
  admin.includes('if (!dirty && window.GalleryApp'));

expect('Cache stats polling is throttled instead of rescanning every 8 seconds',
  admin.includes('window.setInterval(updateAssetDeliveryStatus, 30000)') &&
  cacheBootstrap.includes('now - statusMemoAt < 60000') &&
  serviceWorker.includes('now - statsMemoAt < 60000'));

expect('Persistent asset cache survives application stage deploys',
  serviceWorker.includes('const CACHE_NAME = "exhibition-platform-assets-v1";') &&
  serviceWorker.includes('async function migrateLegacyAssetCaches()') &&
  serviceWorker.includes('await target.put(request, response.clone())'));

console.log('Stage 12C66C6C8C1 Runtime Lifecycle / Admin Transition invariants passed.');
