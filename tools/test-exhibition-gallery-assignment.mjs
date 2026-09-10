import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXHIBITION_GALLERY_MIGRATION_SCHEMA,
  getExhibitionGalleryMigration,
  isExhibitionGalleryMigrationPending,
  summarizeGalleryMigrationImpact,
  galleryBindingLabel,
  referenceRebindSpatialState
} from '../src/data/exhibition-gallery-assignment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const api = read('src/data/exhibition-api.js');
const admin = read('src/bootstrap/admin-workspace-bootstrap.js');
const viewer = read('src/bootstrap/gallery-viewer-bootstrap.js');
const index = read('index.html');
const pkg = JSON.parse(read('package.json'));

const fixture = {
  schema: 'exhibition-platform-exhibition-state.v1',
  schemaVersion: 1,
  exhibitionId: 'exhibition-a',
  venueId: 'gallery-a',
  venueVersionId: 'v2',
  channel: 'draft',
  revision: 17,
  content: {
    editor: {
      walls: [{ meshName: 'Wall_segment_001', color: '#fff' }],
      artworks: [{
        id: 'art-1', mediaId: 'media-1', title: 'Artwork', frameId: 'frame-1',
        position: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 1, z: 0 }, scaling: { x: 1, y: 1, z: 1 },
        wall: { wallMeshName: 'Wall_segment_001' }, wallId: 'Wall_segment_001', anchorId: 'anchor-1', focusCamera: { x: 2 }
      }],
      spheres: [{
        id: 'sculpture-1', modelPath: 'models/sculpture.glb', text: 'Sculpture',
        position: { x: 5, y: 0, z: 5 }, rotation: { x: 0, y: 0, z: 0 }, scaling: { x: 1, y: 1, z: 1 },
        sculptureTransform: { position: [5,0,5] }, anchorId: 's-1', focusCamera: { x: 1 }
      }]
    },
    localLights: [{ id: 'light-1', targetMeshNames: ['Wall_segment_001'] }],
    tourOrder: ['art-1'],
    navigationPath: { points: [1, 2, 3] },
    lighting: { exposure: 1.1 },
    visualSettings: { bloom: true },
    unrelatedIdentityData: { keep: true }
  }
};

const impact = summarizeGalleryMigrationImpact(fixture);
assert.deepEqual(impact, {
  artworks: 1,
  sculptures: 1,
  wallStates: 1,
  localLights: 1,
  hasTourOrder: true,
  hasNavigationPath: true
});

const rebound = referenceRebindSpatialState(fixture, {
  venueId: 'database-gallery-b',
  venueSlug: 'gallery-b',
  versionId: 'database-version-b1',
  versionNumber: 'v1'
});
assert.equal(rebound.venueId, 'gallery-b');
assert.equal(rebound.venueVersionId, 'v1');
assert.equal(rebound.channel, 'draft');
assert.deepEqual(rebound.content.editor.walls, []);
assert.equal(rebound.content.editor.artworks.length, 1);
assert.equal(rebound.content.editor.artworks[0].id, 'art-1');
assert.equal(rebound.content.editor.artworks[0].mediaId, 'media-1');
assert.equal(rebound.content.editor.artworks[0].title, 'Artwork');
assert.equal(rebound.content.editor.artworks[0].frameId, 'frame-1');
assert.equal(rebound.content.editor.artworks[0].placementStatus, 'needs-placement');
for (const key of ['position','rotation','scale','scaling','transform','surfaceId','wallId','anchorId','wall','focusCamera']) {
  assert.equal(key in rebound.content.editor.artworks[0], false, `artwork spatial key must reset: ${key}`);
}
assert.equal(rebound.content.editor.spheres[0].id, 'sculpture-1');
assert.equal(rebound.content.editor.spheres[0].modelPath, 'models/sculpture.glb');
assert.equal(rebound.content.editor.spheres[0].text, 'Sculpture');
assert.equal(rebound.content.editor.spheres[0].placementStatus, 'needs-placement');
for (const key of ['position','rotation','scale','scaling','transform','surfaceId','anchorId','sculptureTransform','focusCamera']) {
  assert.equal(key in rebound.content.editor.spheres[0], false, `sculpture spatial key must reset: ${key}`);
}
assert.equal('localLights' in rebound.content, false);
assert.equal('tourOrder' in rebound.content, false);
assert.equal('navigationPath' in rebound.content, false);
assert.deepEqual(rebound.content.lighting, { exposure: 1.1 });
assert.deepEqual(rebound.content.visualSettings, { bloom: true });
assert.deepEqual(rebound.content.unrelatedIdentityData, { keep: true });
assert.equal(rebound.content.venueMigration.schema, EXHIBITION_GALLERY_MIGRATION_SCHEMA);
assert.equal(rebound.content.venueMigration.status, 'needs-layout-confirmation');
assert.equal(rebound.content.venueMigration.sourceVenueId, 'gallery-a');
assert.equal(rebound.content.venueMigration.sourceVenueVersionId, 'v2');
assert.equal(rebound.content.venueMigration.targetVenueId, 'gallery-b');
assert.equal(rebound.content.venueMigration.targetVenueVersionId, 'v1');
assert.equal(isExhibitionGalleryMigrationPending(rebound), true);
assert.equal(getExhibitionGalleryMigration(rebound).status, 'needs-layout-confirmation');
assert.equal(isExhibitionGalleryMigrationPending({ content: { venueMigration: { status: 'resolved' } } }), false);
assert.equal(galleryBindingLabel({ venueName: 'Gallery B', versionId: 'id', versionNumber: 'v1' }), 'Gallery B · v1');

// Production client contract: runtime Admin state is pinned to the Draft Version channel.
assert.ok(api.includes('const targetVersionId = s.draft_venue_version_id;'));
assert.ok(!api.includes('s.draft_venue_version_id || venueDetail.venue.draft_version_id'));
assert.ok(api.includes('admin_assign_exhibition_gallery'));
assert.ok(api.includes('admin_confirm_exhibition_gallery_layout'));
assert.ok(api.includes('admin_publish_exhibition_bundle'));
assert.ok(api.includes('admin_rollback_exhibition_bundle'));
assert.ok(api.includes('list_public_exhibition_cards'));
assert.ok(api.includes('migrationPending: isExhibitionGalleryMigrationPending'));

// Admin contract: reassignment is explicitly Draft-only; C25 now performs cross-Gallery Scene lifecycle cutover in-session.
assert.ok(admin.includes('ASSIGN DRAFT'));
assert.ok(admin.includes('CONFIRM LAYOUT'));
assert.ok(admin.includes('PUBLISH EXHIBITION'));
assert.ok(admin.includes('ROLLBACK PUBLICATION'));
assert.ok(admin.includes('Assignment changes the private Draft only'));
assert.ok(admin.includes('summarizeGalleryMigrationImpact'));
assert.ok(admin.includes('isExhibitionGalleryMigrationPending'));
assert.ok(admin.includes('getRuntimeVenueVersionKey(currentRuntime) !== getRuntimeVenueVersionKey(targetRuntime)'));
assert.ok(admin.includes('sceneLifecycleController.switchTo(id'));
assert.ok(admin.includes('exhibitionGalleryDetail'));
assert.ok(admin.includes('function setViewportStatus(label)') && admin.includes('strong.textContent = String(label'));
assert.ok(!admin.includes('viewportStatus.innerHTML = `3D preview: <strong>${target.name}'));

// Public discovery resolves Published Exhibition cards and C25 can reuse it as an in-session switcher; explicit deep links still bypass initial discovery.
assert.ok(viewer.includes('listPublicExhibitionCards'));
assert.ok(viewer.includes('ensurePublicExhibitionSelection'));
assert.ok(viewer.includes('history.replaceState') && viewer.includes('switchPublicExhibition'));
assert.ok(viewer.includes('hasExplicitExhibitionSelection'));
assert.ok(viewer.includes('exhibitionsButton'));
assert.ok(index.includes('id="exhibitionsButton"'));
assert.ok(index.includes('href="./index.html"'));


// C25.3 publication UI contract: Poster/Cover optional and publication is explicit.
assert.ok(!admin.includes('id="exhibitionPublished"'));
assert.ok(admin.includes('exhibitionPublicationStatus'));
assert.ok(admin.includes('UNPUBLISH EXHIBITION'));
assert.ok(admin.includes('Poster / cover is optional'));
assert.ok(admin.includes('c25PublishValidation'));
assert.ok(api.includes('async unpublish(reference)'));
assert.ok(api.includes('p_published: false'));
assert.ok(!api.includes('patch.is_published'));

assert.equal(pkg.version, '0.14.1-v14-1-2-scene-loading-orchestrator');
assert.ok(pkg.description.includes('V14.1.2'));
assert.ok(pkg.scripts.test.includes('test:gallery-assignment'));

console.log('C6C8C24 Exhibition ↔ Gallery Assignment regression invariants passed under V13.6.');
