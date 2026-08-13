import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
