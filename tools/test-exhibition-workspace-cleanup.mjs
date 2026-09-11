import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const adminHtml = read('admin.html');
const admin = read('src/bootstrap/admin-workspace-bootstrap.js');
const viewer = read('src/bootstrap/gallery-viewer-bootstrap.js');
const api = read('src/data/exhibition-api.js');
const pkg = JSON.parse(read('package.json'));

const removedUiTokens = [
  'Gallery assignment',
  'ASSIGN DRAFT',
  'CONFIRM LAYOUT',
  'ROLLBACK PUBLICATION',
  'Assign Draft to Gallery',
  'Assignment changes the private Draft only'
];
for (const token of removedUiTokens) {
  assert.ok(!adminHtml.includes(token), `standalone Admin still exposes legacy UI token: ${token}`);
  assert.ok(!viewer.includes(token), `inline Admin still exposes legacy UI token: ${token}`);
  assert.ok(!admin.includes(token), `Admin bootstrap still constructs legacy UI token: ${token}`);
}

for (const token of ['publishExhibitionBundleButton', 'unpublishExhibitionButton', 'exhibitionPublicationNotice']) {
  assert.ok(adminHtml.includes(token), `standalone Admin missing ${token}`);
  assert.ok(viewer.includes(token), `inline Admin missing ${token}`);
  assert.ok(admin.includes(token), `Admin bootstrap missing ${token}`);
}

assert.ok(adminHtml.includes('Metadata and public visibility for this Exhibition.'));
assert.ok(viewer.includes('Metadata and public visibility for this Exhibition.'));
assert.ok(admin.includes('renderExhibitionPublication'));
assert.ok(admin.includes('refreshExhibitionAdminDetail'));
assert.ok(admin.includes('await exhibitionData.publishBundle(selectedExhibition.id)'));
assert.ok(admin.includes('await exhibitionData.unpublish(selectedExhibition.id)'));
assert.ok(!admin.includes('handleAssignExhibitionGallery'));
assert.ok(!admin.includes('handleConfirmExhibitionGalleryLayout'));
assert.ok(!admin.includes('handleRollbackExhibitionBundle'));
assert.ok(!admin.includes('exhibitionData.assignGallery('));
assert.ok(!admin.includes('exhibitionData.confirmGalleryLayout('));
assert.ok(!admin.includes('exhibitionData.rollbackBundle('));

// Legacy C24 maintenance capability intentionally remains in the data adapter/backend contract.
assert.ok(api.includes('async assignGallery(reference'));
assert.ok(api.includes('async confirmGalleryLayout(reference'));
assert.ok(api.includes('async rollbackBundle(reference'));
assert.ok(api.includes('admin_assign_exhibition_gallery'));
assert.ok(api.includes('admin_confirm_exhibition_gallery_layout'));
assert.ok(api.includes('admin_rollback_exhibition_bundle'));

// Shared Asset placement may still use the internal admin-detail Draft binding as a fallback when live Scene identity is unavailable.
assert.ok(admin.includes('const detail = exhibitionAdminDetail;'));
assert.ok(admin.includes('const draftBinding = detail ? c24Binding(detail, "draft") : null;'));

assert.equal(pkg.version, '0.14.2-v14-2-4-exhibition-workspace-cleanup');
assert.ok(pkg.description.includes('V14.2.4 Exhibition Workspace Cleanup'));
assert.ok(pkg.scripts.test.includes('test:workspace-cleanup'));

console.log('V14.2.4 Exhibition Workspace Cleanup regression passed.');
