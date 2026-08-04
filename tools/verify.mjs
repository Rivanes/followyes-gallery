import fs from 'node:fs';
import { validateVenueManifest } from '../src/runtime/venue-runtime.js';

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const count = (value, needle) => value.split(needle).length - 1;

const source = read('../src/gallery-engine.js');
const minified = read('../src/gallery-engine.min.js');
const bootstrap = read('../src/bootstrap/gallery-viewer-bootstrap.js');
const editorBootstrap = read('../src/bootstrap/gallery-editor-bootstrap.js');
const venueRuntime = read('../src/runtime/venue-runtime.js');
const exhibitionRuntime = read('../src/runtime/exhibition-runtime.js');
const publicIndex = read('../index.html');
const galleryIndex = read('../gallery/index.html');
const adminIndex = read('../admin/index.html');
const adminApp = read('../admin/app.js');
const publicSite = read('../src/public-site/public-site.js');
const sql = read('../supabase/migrations/20260803_full_site_admin_cms.sql');
const cmsJobs = read('../supabase/functions/cms-jobs/index.ts');
const adminUsers = read('../supabase/functions/admin-users/index.ts');
const manifest = JSON.parse(read('../venues/berryboy-main/versions/v1/manifest.json'));

assert(publicIndex.includes('public-site.js'), 'Public entrypoint is not dynamic');
assert(!publicIndex.includes('renderCanvas'), 'Public homepage starts 3D runtime');
assert(galleryIndex.includes('id="renderCanvas"'), 'Gallery entrypoint missing Babylon canvas');
assert(adminIndex.includes('id="adminApp"') && adminIndex.includes('app.js'), 'Admin entrypoint missing');
assert(adminApp.includes('renderDashboard') && adminApp.includes('renderVenues') && adminApp.includes('renderExhibitions'), 'Admin main sections missing');
for (const section of ['renderHomepage','renderMedia','renderAuthors','renderUsers','renderArchive']) assert(adminApp.includes(section), `Admin section missing: ${section}`);
assert(publicSite.includes('get_public_site_content') && publicSite.includes('list_public_exhibition_cards'), 'Public CMS readers missing');
assert(publicSite.includes('carousel') && publicSite.includes('grid') && publicSite.includes('list'), 'Dynamic card layouts missing');
assert(bootstrap.includes('venueTestVersionId') || exhibitionRuntime.includes('venueTestVersionId'), 'Read-only Venue Test missing');
assert(bootstrap.includes('venueTest') && bootstrap.includes('disabled'), 'Venue Test write controls are not disabled');

for (const table of ['profiles','exhibition_cards','site_content','admin_audit_log','cms_jobs','user_invites']) {
  assert(sql.includes(`create table if not exists public.${table}`), `D3 table missing: ${table}`);
}
for (const fn of [
  'admin_dashboard_summary','admin_create_venue','admin_create_venue_version','admin_validate_venue_version','admin_publish_venue_version',
  'admin_create_exhibition','admin_save_exhibition_card','admin_publish_exhibition_bundle','admin_duplicate_exhibition','admin_assign_exhibition_venue',
  'admin_save_site_draft','admin_publish_site_content','admin_set_exhibition_authors','admin_set_user_access','admin_request_permanent_delete'
]) assert(sql.includes(`function public.${fn}(`), `D3 RPC missing: ${fn}`);
assert(sql.includes('security definer'), 'Scoped RPC boundary missing');
assert(sql.includes('admin_audit_log') && sql.includes('cms_write_audit'), 'Audit trail missing');
assert(sql.includes("job_type in ('duplicate_media','permanent_delete')"), 'CMS jobs include parallel/unsupported job paths');
assert(!sql.includes('admin_create_invite_request'), 'Parallel invite queue remains active');
assert(sql.includes('cms_sync_exhibition_card_media_usages') && sql.includes('cms_sync_site_media_usages'), 'CMS media reference synchronization missing');
assert(sql.includes('published_version_id') && sql.includes('previous_version_id'), 'Venue publish/rollback channels missing');
assert(sql.includes('published_value') && sql.includes('previous_value'), 'CMS publish/rollback channels missing');
assert(sql.includes("e.status='scheduled'") || sql.includes("status='scheduled'"), 'Scheduled publication workflow missing');
assert(count(sql, '$$') % 2 === 0 && sql.trimEnd().endsWith('commit;'), 'D3 migration transaction/function bodies unbalanced');

assert(cmsJobs.includes('duplicate_media') && cmsJobs.includes('permanent_delete'), 'CMS jobs Edge Function missing operations');
assert(cmsJobs.includes('SUPABASE_SERVICE_ROLE_KEY') && cmsJobs.includes('is_platform_admin'), 'CMS jobs authorization boundary missing');
assert(adminUsers.includes('inviteUserByEmail') && adminUsers.includes('user_invites'), 'User invite Edge Function/audit missing');
assert(adminUsers.includes('SITE_URL'), 'Invite redirect configuration missing');

// D1/D2 and C6C2 frozen core remains active.
assert(validateVenueManifest(manifest).valid, 'berryboy-main/v1 manifest invalid');
assert(source.includes('createVenueRuntimeRegistry(galleryVenueManifest)'), 'Venue Runtime Registry missing');
assert(source.includes('galleryVenueManifest.assets.forEach'), 'Dynamic Venue loader missing');
for (const forbidden of ['Wall_segments.glb','Floor_segment.glb','Ceiling.glb','Props.glb','gallerySupabaseModelsRootUrl']) assert(!source.includes(forbidden), `Berryboy hardcoding returned: ${forbidden}`);
assert(exhibitionRuntime.includes('resolve_published_exhibition') && exhibitionRuntime.includes('save_exhibition_draft'), 'D2 Exhibition Runtime missing');
assert(editorBootstrap.includes('saveDraftToSupabase') && editorBootstrap.includes('publishDraftToSupabase'), 'Draft/Publish split missing');
assert(source.includes('schema: "gallery-sculpture-core.v2"'), 'Sculpture Core missing');
assert(source.includes('function resolveGalleryGroundMovement('), 'Unified Ground Collision missing');
assert(source.includes('function armGalleryInspectTransitionWatchdog('), 'Inspect isolation missing');
assert(source.includes('schema: "gallery-atomic-media-lifecycle.v1"'), 'Atomic media lifecycle missing');
assert(source.includes('schema: "gallery-artwork-residency.v1"'), 'Tiered Artwork Residency missing');
assert(source.includes('berryboyMobileSurvivalDebugButton') && source.includes('berryboy_mobile_survival_last_snapshot_v1'), 'C6C2 DBG diagnostics removed');
assert(minified.includes('gallery-artwork-residency.v1'), 'D3 production build missing frozen runtime');

console.log('Production repository verifier passed.');
