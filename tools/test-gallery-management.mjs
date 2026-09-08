import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('src/Gallery_V0_11.js', root), 'utf8');
const admin = fs.readFileSync(new URL('src/bootstrap/admin-workspace-bootstrap.js', root), 'utf8');
const api = fs.readFileSync(new URL('src/data/gallery-management-api.js', root), 'utf8');
const testBootstrap = fs.readFileSync(new URL('src/bootstrap/gallery-test-bootstrap.js', root), 'utf8');
const testHtml = fs.readFileSync(new URL('gallery-test.html', root), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'));

function expect(label, ok) {
  if (!ok) throw new Error(`Gallery Management invariant failed: ${label}`);
  console.log(`✓ ${label}`);
}

expect('release package is C6C8C22', pkg.version.includes('c6c8c22-gallery-management'));
expect('Admin release identity is C6C8C22', admin.includes('const STAGE = "C6C8C22"'));
expect('Gallery data adapter uses canonical Venue RPCs', api.includes('admin_create_gallery_with_initial_draft') && api.includes('admin_begin_venue_draft') && api.includes('admin_set_venue_asset_slot'));
expect('new asset paths are stable UUID owner paths, not Gallery names', api.includes('venues/${venue}/versions/${version}/assets/${normalizedRole}/') && !api.includes('venue.slug'));
expect('only controlled C22 building roles are exposed', api.includes('["floor", "walls", "ceiling", "props"]'));
expect('replace uses immutable upload object before binding', api.includes('upsert: false') && api.includes('cleanupCandidates'));
expect('Admin has Exhibition and Gallery section switch', admin.includes('EXHIBITIONS') && admin.includes('GALLERIES') && admin.includes('galleryManagementSection'));
expect('Admin has Draft lifecycle controls', admin.includes('EDIT DRAFT') && admin.includes('CREATE NEXT VERSION') && admin.includes('DISCARD DRAFT'));
expect('Admin has four asset slot workflow', ['floor','walls','ceiling','props'].every((role) => admin.includes(`role === "${role}"`) || admin.includes('CONTROLLED_GALLERY_ASSET_ROLES')));
expect('Admin exposes Test Gallery and Entry Point controls', admin.includes('TEST GALLERY') && admin.includes('SAVE ENTRY') && admin.includes('SET CURRENT VIEW AS ENTRY') === false);
expect('raw Manifest JSON editor is not present in normal Gallery UI', !admin.includes('galleryManifestTextarea') && !admin.includes('SAVE RAW MANIFEST'));
expect('Test Gallery has isolated shell', testHtml.includes('data-gallery-test="true"') && testHtml.includes('SET CURRENT VIEW AS ENTRY'));
expect('Test Gallery resolves Gallery Version only', testBootstrap.includes('galleryManagement.resolveTest') && !testBootstrap.includes('resolve_published_exhibition') && !testBootstrap.includes('admin_get_exhibition') && !testBootstrap.includes('exhibition_states'));
expect('Test Gallery uses a local read-only Exhibition adapter', testBootstrap.includes('Test Gallery is read-only') && testBootstrap.includes('loadState()'));
expect('Engine CRUD remains outside GalleryApp while camera bridge exists', source.includes('getCameraPose: function ()') && !source.includes('admin_create_gallery_with_initial_draft'));

console.log('C6C8C22 Gallery Management runtime/UI invariants passed.');
