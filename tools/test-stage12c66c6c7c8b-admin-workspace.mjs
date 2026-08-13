import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  adminBootstrap.includes('const STAGE = "12C66C6C8C13"'));

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
