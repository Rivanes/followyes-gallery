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

function extractFunction(text, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const marker of markers) {
    start = text.indexOf(marker);
    if (start >= 0) break;
  }
  if (start < 0) throw new Error(`Missing function ${name}`);
  const brace = text.indexOf('{', start);
  let depth = 0;
  let state = 'code';
  let quote = '';
  for (let i = brace; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1] || '';
    if (state === 'code') {
      if (ch === '"' || ch === "'" || ch === '`') { state = 'string'; quote = ch; }
      else if (ch === '/' && next === '/') { state = 'line'; i++; }
      else if (ch === '/' && next === '*') { state = 'block'; i++; }
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
    } else if (state === 'string') {
      if (ch === '\\') i++;
      else if (ch === quote) state = 'code';
    } else if (state === 'line' && ch === '\n') state = 'code';
    else if (state === 'block' && ch === '*' && next === '/') { state = 'code'; i++; }
  }
  throw new Error(`Unterminated function ${name}`);
}

const catalogRenderer = extractFunction(admin, 'renderGalleryCatalog');
const historyRenderer = extractFunction(admin, 'renderGalleryHistory');
const entryReader = extractFunction(admin, 'readRequiredFiniteGalleryNumber');
const mutationWrapper = extractFunction(admin, 'withGalleryMutation');
const detailRenderer = extractFunction(admin, 'renderGalleryDetail');

expect('release package is V13.6 Production Closure', pkg.version.includes('v14-1-3-scene-ownership-hardening'));
expect('Admin release identity is V13.6', admin.includes('const STAGE = "V14.1.3"'));
expect('Gallery data adapter uses canonical Venue RPCs', api.includes('admin_create_gallery_with_initial_draft') && api.includes('admin_begin_venue_draft') && api.includes('admin_set_venue_asset_slot'));
expect('new asset paths are stable UUID owner paths, not Gallery names', api.includes('venues/${venue}/versions/${version}/assets/${normalizedRole}/') && !api.includes('venue.slug'));
expect('the controlled Gallery role contract remains exposed for C23', api.includes('["floor", "walls", "ceiling", "props"]'));
expect('replace uses immutable upload object before binding', api.includes('upsert: false') && api.includes('cleanupCandidates'));
expect('Admin imports the controlled role binding it executes', /import\s*\{[^}]*\bCONTROLLED_GALLERY_ASSET_ROLES\b[^}]*\}\s*from\s*["']\.\.\/data\/gallery-management-api\.js/.test(admin));
expect('Admin has Exhibition and Gallery section switch', admin.includes('EXHIBITIONS') && admin.includes('GALLERIES') && admin.includes('galleryManagementSection'));
expect('Admin has Draft lifecycle controls', admin.includes('EDIT DRAFT') && admin.includes('CREATE NEXT VERSION') && admin.includes('DISCARD DRAFT'));
expect('Admin renders the four controlled asset slots from the imported role contract', admin.includes('CONTROLLED_GALLERY_ASSET_ROLES.forEach((role) =>') && admin.includes('renderGalleryAssetSlots(detail, working, assets'));
expect('Admin exposes Test Gallery and Entry Point controls', admin.includes('TEST GALLERY') && admin.includes('SAVE ENTRY POINT') && admin.includes('SET CURRENT VIEW AS ENTRY') === false);
expect('raw Manifest JSON editor is not present in normal Gallery UI', !admin.includes('galleryManifestTextarea') && !admin.includes('SAVE RAW MANIFEST'));
expect('Gallery names and version history are rendered as text rather than interpolated HTML', !catalogRenderer.includes('row.innerHTML') && catalogRenderer.includes('title.textContent') && !historyRenderer.includes('row.innerHTML') && historyRenderer.includes('versionLabel.textContent'));
expect('Entry Point rejects blank/non-finite numeric values', entryReader.includes('String(input.value).trim()') && entryReader.includes('if (!raw)') && entryReader.includes('Number.isFinite(value)'));
expect('Entry Point participates in dirty-state/unload protection', admin.includes('let galleryEntryDirty = false;') && admin.includes('syncGalleryEntryDirty();') && admin.includes('galleryMetadataDirty || galleryEntryDirty'));
expect('Gallery mutations use a shared in-flight lock', mutationWrapper.includes('galleryMutationInFlight') && mutationWrapper.includes('setGalleryMutationBusy(true)') && mutationWrapper.includes('setGalleryMutationBusy(false)'));
expect('Gallery URL state is cleared when returning to Exhibitions', admin.includes('url.searchParams.delete("section")') && admin.includes('url.searchParams.delete("gallery")') && admin.includes('clearGalleryUrl();'));
expect('Gallery render has a visible failure boundary', detailRenderer.includes('renderGalleryDetailError(body, error)'));
expect('Published/no-Draft Entry Point is read-only in the normal UI', detailRenderer.includes('const entryEditable = canManage && !!draft && venue.status !== "archived"') && detailRenderer.includes('${entryEditable ? "" : "readonly"}'));
expect('Archived Gallery metadata is read-only in the normal UI', detailRenderer.includes('const metadataEditable = canManage && venue.status !== "archived"'));
expect('Test Gallery has isolated shell', testHtml.includes('data-gallery-test="true"') && testHtml.includes('SET CURRENT VIEW AS ENTRY'));
expect('Test Gallery resolves Gallery Version only', testBootstrap.includes('galleryManagement.resolveTest') && !testBootstrap.includes('resolve_published_exhibition') && !testBootstrap.includes('admin_get_exhibition') && !testBootstrap.includes('exhibition_states'));
expect('Test Gallery uses a local read-only Exhibition adapter', testBootstrap.includes('Test Gallery is read-only') && testBootstrap.includes('loadState()'));
expect('Engine CRUD remains outside GalleryApp while camera bridge exists', source.includes('getCameraPose: function ()') && !source.includes('admin_create_gallery_with_initial_draft'));

console.log('C6C8C22 Gallery Management regression invariants passed under V13.6.');
