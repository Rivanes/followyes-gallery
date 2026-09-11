import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const api = read('src/data/exhibition-api.js');
const admin = read('src/bootstrap/admin-workspace-bootstrap.js');
const adminHtml = read('admin.html');
const inline = read('src/bootstrap/gallery-viewer-bootstrap.js');
const source = read('src/Gallery_V0_11.js');
const pkg = JSON.parse(read('package.json'));


const { createExhibitionDataAdapter } = await import('../src/data/exhibition-api.js');
const rpcCalls = [];
const mockSupabase = {
  async rpc(name, args) {
    rpcCalls.push({ name, args });
    if (name === 'admin_list_venues') return { data: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        slug: 'gallery-a',
        name: 'Gallery A',
        status: 'published',
        published_version_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        versions: [
          { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', version_number: 'v2', status: 'draft' },
          { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', version_number: 'v1', status: 'published' }
        ]
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        slug: 'broken-gallery',
        name: 'Broken Gallery',
        status: 'published',
        published_version_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        versions: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', version_number: 'v1', status: 'draft' }]
      }
    ] };
    throw new Error(`Unexpected RPC ${name}`);
  }
};
const adapter = createExhibitionDataAdapter({ supabase: mockSupabase, mode: 'admin' });
const targets = await adapter.listCreationTargets();
assert.deepEqual(targets, [{
  venueId: '11111111-1111-4111-8111-111111111111',
  venueVersionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  venueName: 'Gallery A',
  venueSlug: 'gallery-a',
  versionNumber: 'v1'
}]);
assert.deepEqual(rpcCalls[0], { name: 'admin_list_venues', args: { p_status: 'published', p_search: null } });

// V14.2.2 product contract: creation requires an explicit current Published Gallery Version.
assert.ok(api.includes('async listCreationTargets()'));
assert.ok(api.includes('admin_list_venues'));
assert.ok(api.includes('p_status: "published"'));
assert.ok(api.includes('venue.published_version_id'));
assert.ok(api.includes('text(publishedVersion.status) !== "published"'));
assert.ok(api.includes('async create(input)'));
assert.ok(api.includes('const venueId = text(request.venueId)'));
assert.ok(api.includes('const venueVersionId = text(request.venueVersionId)'));
assert.ok(api.includes('p_venue_id: venueId'));
assert.ok(api.includes('p_venue_version_id: venueVersionId'));
assert.ok(!api.includes('p_venue_id: current.venue.id'));
assert.ok(!api.includes('const current = initialRuntime || Array.from(runtimeByKey.values())'));

// Standalone + inline Admin both expose the canonical explicit target selector.
for (const shell of [adminHtml, inline]) {
  assert.ok(shell.includes('id="newExhibitionGallery"'));
  assert.ok(shell.includes('Choose Published Gallery') || shell.includes('Loading Published Galleries'));
  assert.ok(shell.includes('explicit Published Gallery'));
}

// V14.2.2.1 visual contract: native Chromium option popup must remain legible in dark Admin UI.
assert.ok(adminHtml.includes('select.adminInput { color-scheme:dark;'));
assert.ok(adminHtml.includes('select.adminInput option { background:#202422; color:var(--text); }'));
assert.ok(inline.includes('#inlineAdminWorkspace select.adminInput { color-scheme:dark;'));
assert.ok(inline.includes('#inlineAdminWorkspace select.adminInput option { background:#202422; color:rgba(255,255,255,.92); }'));

// Admin creates through the data adapter directly; V14.2.3 then enters through the canonical orchestrated selection helper.
assert.ok(admin.includes('exhibitionData.create({ name, venueId, venueVersionId })'));
assert.ok(admin.includes('selectAndSwitchExhibition(created.id, {'));
assert.ok(admin.includes('reason: "admin-exhibition-create-enter"'));
assert.ok(!admin.includes('window.GalleryApp.createExhibition(name)'));
assert.ok(admin.includes('refreshExhibitionCreationTargets'));
assert.ok(admin.includes('await refreshExhibitionCreationTargets();'));

// Low-level Gallery executor no longer derives a target or performs a cross-space switch after create.
assert.ok(source.includes('async function createGalleryExhibition(request)'));
assert.ok(source.includes('galleryExhibitionDataAdapter.create({ name: name, venueId: venueId, venueVersionId: venueVersionId })'));
const createStart = source.indexOf('async function createGalleryExhibition(request)');
const createEnd = source.indexOf('async function updateGalleryExhibitionMetadata', createStart);
const createBody = source.slice(createStart, createEnd);
assert.ok(!createBody.includes('switchGalleryExhibition(canonicalCreated.id'));

assert.equal(pkg.version, '0.14.2-v14-2-3-creation-scene-lifecycle');
assert.ok(pkg.scripts.test.includes('test:creation-targeting'));

console.log('V14.2.2.1 creation targeting + selector visual invariants remain preserved under V14.2.3.');
