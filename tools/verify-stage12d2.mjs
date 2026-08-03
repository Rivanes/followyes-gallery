import fs from 'node:fs';
import { validateVenueManifest } from '../src/runtime/venue-runtime.js';

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const source = read('../src/Gallery_V0_11.js');
const minified = read('../src/Gallery_V0_11.min.js');
const runtime = read('../src/runtime/exhibition-runtime.js');
const venueRuntime = read('../src/runtime/venue-runtime.js');
const index = read('../index.html');
const bootstrap = read('../src/bootstrap/gallery-viewer-bootstrap.js');
const editorBootstrap = read('../src/bootstrap/gallery-editor-bootstrap.js');
const sql = read('../supabase/migrations/20260803_stage12d2_multi_venue_multi_exhibition.sql');
const loginDisabled = read('../Gallery_V0_11_STAGE12D2_MULTI_VENUE_MULTI_EXHIBITION_LOGIN_DISABLED.txt');
const manifestRaw = JSON.parse(read('../venues/berryboy-main/versions/v1/manifest.json'));

function assert(condition, message) { if (!condition) throw new Error(message); }
function count(haystack, needle) { return haystack.split(needle).length - 1; }
function extractSqlFunction(name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert(start >= 0, `SQL function missing: ${name}`);
  const end = sql.indexOf('\n$$;', sql.indexOf('as $$', start));
  assert(end >= 0, `SQL function unterminated: ${name}`);
  return sql.slice(start, end + 4);
}
function verifyReturnsTableBlocks() {
  let cursor = 0;
  while ((cursor = sql.toLowerCase().indexOf('returns table (', cursor)) >= 0) {
    const open = sql.indexOf('(', cursor);
    let depth = 0;
    let close = -1;
    for (let index = open; index < sql.length; index += 1) {
      if (sql[index] === '(') depth += 1;
      else if (sql[index] === ')' && --depth === 0) { close = index; break; }
    }
    assert(close >= 0, 'Unterminated RETURNS TABLE block');
    const block = sql.slice(open + 1, close).toLowerCase();
    assert(!block.includes(' not null') && !block.includes(' default '), 'DDL constraint leaked into RETURNS TABLE block');
    cursor = close + 1;
  }
}

assert(index.includes('stage: "12D2"'), 'Index Stage 12D2 identity missing');
assert(bootstrap.includes('const STAGE = "12D2"'), 'Bootstrap Stage 12D2 identity missing');
assert(bootstrap.includes('resolveExhibitionRuntime') && bootstrap.includes('selectionRequired'), 'Exhibition resolver/selection gate missing');
assert(!bootstrap.includes('button.innerHTML'), 'Exhibition catalog renders untrusted database text through innerHTML');
assert(bootstrap.indexOf('prepareGalleryRuntimeContext()') < bootstrap.indexOf('const engineModule = await import'), 'Exhibition and Venue must resolve before engine import');
assert(index.includes('publishStateButton'), 'Publish control missing');
assert(editorBootstrap.includes('saveDraftToSupabase') && editorBootstrap.includes('publishDraftToSupabase'), 'Save Draft / Publish split missing');
assert(runtime.includes('resolve_published_exhibition') && runtime.includes('list_published_exhibitions'), 'Public RPC boundary missing');
assert(runtime.includes('getPublicUrl(manifestPath)') && sql.includes("manifest_bucket text not null default 'venue-runtime'"), 'Venue manifest_path is not resolvable through venue-runtime Storage');
assert(runtime.includes('publicSnapshot') && runtime.includes('d2-public-rpc'), 'Published Viewer snapshot isolation missing');
assert(runtime.includes('EXHIBITION_STATE_BINDING_MISMATCH'), 'State envelope binding guard missing');
assert(sql.includes("jsonb_set(draft_state,'{channel}','\"published\"'::jsonb,true)") && sql.includes("jsonb_set(published_state,'{channel}','\"previous\"'::jsonb,true)"), 'Publish does not rotate envelope channels atomically');
assert(runtime.includes('save_exhibition_draft') && runtime.includes('publish_exhibition_state') && runtime.includes('rollback_exhibition_state'), 'Draft/publish/rollback repositories missing');
assert(runtime.includes('filter_deletable_media_paths') && runtime.includes('sync_exhibition_media_usages'), 'Shared-media reference safety missing');
assert(!runtime.includes('.from("media_usages").upsert'), 'Media usages regained a direct write path outside D2 RPCs');
assert(runtime.includes('p_exhibition_id: this.exhibitionId'), 'Media cleanup RPCs are not exhibition-scoped');
assert(source.includes('collectGalleryStateMediaUsages') && source.includes('syncGalleryMediaUsagesFromState'), 'Runtime media-usage synchronization missing');
assert(source.includes('protectedByGlobalReferences') && source.includes('Fail closed'), 'Cleanup is not globally fail-closed');
assert(source.includes('galleryDatabaseVenueId') && source.includes('galleryDatabaseVenueVersionId'), 'Database/runtime Venue identity split missing');
assert(source.includes('imageMediaId') && source.includes('authorPhotoMediaId') && source.includes('modelMediaId'), 'Stable media identity missing');
assert(runtime.includes('bytes[6] = (bytes[6] & 0x0f) | 0x40'), 'Media ID fallback is not a database-safe UUID v4');
assert(source.includes('galleryRuntimeContext.exhibition.storageScope') && runtime.includes('`exhibitions/${this.exhibitionId}/'), 'Exhibition storage scope missing');
assert(!source.includes('.from("gallery_state")') && !source.includes(".from('gallery_state')"), 'Active Babylon runtime still writes/reads legacy gallery_state directly');
assert(count(runtime, '.from("gallery_state")') === 1, 'Legacy gallery_state access must exist only once inside controlled migration repository');
assert(runtime.includes('this.exhibitionId !== DEFAULT_EXHIBITION_ID'), 'Legacy read is not restricted to Berryboy migration exhibition');
assert(sql.includes('create table if not exists public.venues') && sql.includes('create table if not exists public.venue_versions'), 'Venue D2 schema missing');
assert(sql.includes('create table if not exists public.exhibitions') && sql.includes('create table if not exists public.exhibition_states'), 'Exhibition D2 schema missing');
assert(sql.includes('exhibition_states_draft_version_venue_fkey') && sql.includes('exhibition_states_exhibition_venue_fkey'), 'Cross-Venue state constraints missing');
assert(sql.includes('create table if not exists public.media_library') && sql.includes('create table if not exists public.media_usages'), 'Media schema missing');
assert(sql.includes('enable row level security') && sql.includes('revoke all on public.exhibition_states from anon'), 'RLS/public draft protection missing');
const canEditVenueSql = extractSqlFunction('can_edit_venue');
assert(canEditVenueSql.includes("role = 'venue_admin'") && !canEditVenueSql.includes("'curator'"), 'Curator still has technical Venue write permission');
const canEditExhibitionSql = extractSqlFunction('can_edit_exhibition');
assert(canEditExhibitionSql.includes("vm.role = 'venue_admin'") && canEditExhibitionSql.includes("em.role = 'curator'"), 'Curator scope is not restricted to exhibition membership');
assert(sql.includes('venue_versions_editor_select') && sql.includes('venue_versions_admin_update'), 'Venue version read/write RLS is not separated');
assert(sql.includes('create or replace function public.resolve_published_exhibition') && sql.includes('create or replace function public.save_exhibition_draft'), 'Required D2 RPCs missing');
assert(sql.includes('create or replace function public.migrate_legacy_berryboy_main'), 'Controlled legacy migration missing');
assert(sql.includes('filter_deletable_media_paths(uuid,text,text[])') && sql.includes('confirm_deleted_media_paths(uuid,text,text[])'), 'Cleanup RPC grants are not exhibition-scoped');
assert(sql.includes("from public, anon, authenticated") && sql.includes('media id belongs to another owner'), 'Least-privilege RPC hardening missing');
assert(!sql.includes('create policy d2_platform_media_update') && !sql.includes('create policy d2_venue_runtime_update') && !sql.includes('create policy d2_venue_runtime_delete'), 'Immutable Storage regained update/delete policies');
assert(sql.includes('from public.filter_deletable_media_paths('), 'Storage delete policy bypasses global media-reference safety');
assert(sql.includes("e.status = 'scheduled'") && sql.includes('e.scheduled_at <= now()'), 'Scheduled publication visibility missing');
assert(count(sql, '$$') % 2 === 0 && sql.trimEnd().endsWith('commit;'), 'SQL migration has an unbalanced body or transaction');
verifyReturnsTableBlocks();

// D1 Venue-agnostic core must remain the active geometry architecture.
assert(validateVenueManifest(manifestRaw).valid, 'berryboy-main/v1 manifest invalid');
assert(source.includes('createVenueRuntimeRegistry(galleryVenueManifest)'), 'Venue Runtime Registry missing');
assert(source.includes('galleryVenueManifest.assets.forEach'), 'Dynamic Venue asset loop missing');
assert(count(source, 'function loadVenueManifestAsset(') === 1, 'Expected one Venue asset loader');
for (const forbidden of ['Wall_segments.glb', 'Floor_segment.glb', 'Ceiling.glb', 'Props.glb', 'gallerySupabaseModelsRootUrl']) {
  assert(!source.includes(forbidden), `Engine regained Berryboy hardcoding: ${forbidden}`);
}
assert(venueRuntime.includes('berryboy-gallery-runtime-context.v2') && venueRuntime.includes('stage: "12D2"'), 'D2 Runtime Context missing');

// Frozen C6C2/D1 systems and diagnostics must remain present.
assert(source.includes('schema: "gallery-sculpture-core.v2"'), 'Sculpture Core missing');
assert(source.includes('function resolveGalleryGroundMovement('), 'Unified Ground Collision missing');
assert(source.includes('function armGalleryInspectTransitionWatchdog('), 'Inspect isolation missing');
assert(source.includes('schema: "gallery-atomic-media-lifecycle.v1"'), 'Atomic media lifecycle missing');
assert(source.includes('schema: "gallery-artwork-residency.v1"'), 'Tiered Artwork Residency missing');
assert(source.includes('berryboyMobileSurvivalDebugButton') && source.includes('berryboy_mobile_survival_last_snapshot_v1'), 'C6C2 DBG diagnostics were removed');
assert(source.includes('function disposeVisualSsaoResourcesForSurvival('), 'C6C2 memory disposal missing');
assert(loginDisabled.includes('var galleryEditorLoginEnabled = false;'), 'Login-disabled D2 build missing');
assert(!loginDisabled.includes('var galleryEditorLoginEnabled = true;'), 'Login remains enabled in login-disabled build');
assert(minified.includes('12D2') && minified.includes('saveGalleryDraftToSupabase'), 'D2 production build missing');

console.log('Stage 12D2 verifier passed.');
