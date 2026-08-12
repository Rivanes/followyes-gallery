import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
