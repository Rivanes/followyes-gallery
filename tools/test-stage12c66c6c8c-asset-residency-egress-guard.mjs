import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  source.includes('schema: "gallery-artwork-residency.v2"') &&
  source.includes('enabled: true') &&
  source.includes('desktopFullTextures: galleryAdminWorkspaceMode ? 6 : 5'));

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
