import fs from 'node:fs';
import crypto from 'node:crypto';
import { validateVenueManifest } from '../src/runtime/venue-runtime.js';

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const source = read('../src/Gallery_V0_11.js');
const minified = read('../src/Gallery_V0_11.min.js');
const runtime = read('../src/runtime/venue-runtime.js');
const index = read('../index.html');
const bootstrap = read('../src/bootstrap/gallery-viewer-bootstrap.js');
const editorBootstrap = read('../src/bootstrap/gallery-editor-bootstrap.js');
const worker = read('../src/workers/gallery-avif-encoder-worker.js');
const adapter = read('../src/vendor/gallery-avif-encoder.mjs');
const loginDisabled = read('../Gallery_V0_11_STAGE12D1_VENUE_AGNOSTIC_ENGINE_BUILDING_MANIFEST_LOGIN_DISABLED.txt');
const manifestRaw = JSON.parse(read('../venues/berryboy-main/versions/v1/manifest.json'));
const templateManifestRaw = JSON.parse(read('../venues/_template/versions/v1/manifest.template.json'));
const schemaRaw = JSON.parse(read('../venues/schema/berryboy-venue-manifest.v1.schema.json'));

function assert(condition, message) { if (!condition) throw new Error(message); }
function count(haystack, needle) { return haystack.split(needle).length - 1; }
function sha(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function extractFunction(text, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const marker of markers) { start = text.indexOf(marker); if (start >= 0) break; }
  assert(start >= 0, `Missing ${name}`);
  const brace = text.indexOf('{', start);
  let depth = 0, state = 'code', quote = '';
  for (let i = brace; i < text.length; i += 1) {
    const char = text[i], next = text[i + 1] || '';
    if (state === 'code') {
      if (char === '"' || char === "'" || char === '`') { state = 'string'; quote = char; }
      else if (char === '/' && next === '/') { state = 'line'; i += 1; }
      else if (char === '/' && next === '*') { state = 'block'; i += 1; }
      else if (char === '{') depth += 1;
      else if (char === '}' && --depth === 0) return text.slice(start, i + 1);
    } else if (state === 'string') {
      if (char === '\\') i += 1;
      else if (char === quote) state = 'code';
    } else if (state === 'line' && char === '\n') state = 'code';
    else if (state === 'block' && char === '*' && next === '/') { state = 'code'; i += 1; }
  }
  throw new Error(`Unterminated ${name}`);
}

assert(index.includes('stage: "12D1"'), 'Index Stage 12D1 identity missing');
assert(bootstrap.includes('const STAGE = "12D1"'), 'Bootstrap Stage 12D1 identity missing');
assert(index.includes('stage12d1_venue_agnostic_engine_manifest_20260803'), 'Stage D1 cache key missing');
assert(editorBootstrap.includes('Stage 12D1'), 'Editor bootstrap Stage D1 label missing');
assert(bootstrap.includes('loadVenueManifest') && bootstrap.includes('createGalleryRuntimeContext'), 'Runtime Context is not prepared by bootstrap');
assert(bootstrap.indexOf('const runtimeContext = await prepareGalleryRuntimeContext()') < bootstrap.indexOf('const engineModule = await import'), 'Venue Manifest must be loaded before the gallery engine module');
assert(source.includes('createScene = function (engineArg, canvasArg, runtimeContextArg)'), 'createScene does not require Runtime Context');
assert(source.includes('createVenueRuntimeRegistry(galleryVenueManifest)'), 'Venue Runtime Registry missing');
assert(source.includes('galleryVenueManifest.assets.forEach'), 'Dynamic manifest asset loop missing');
assert(count(source, 'function loadVenueManifestAsset(') === 1, 'Expected one Venue asset loader');
assert(source.includes('galleryVenueRuntimeRegistry.visual.floors') && source.includes('galleryVenueRuntimeRegistry.visual.walls'), 'Domain arrays are not Registry views');
assert(source.includes('gallery-venue-binding.v1'), 'Venue-bound state schema missing');
assert(source.includes('GALLERY_STATE_VENUE_MISMATCH') && source.includes('GALLERY_STATE_VENUE_VERSION_MISMATCH') && source.includes('GALLERY_STATE_RECORD_MISMATCH') && source.includes('GALLERY_STATE_LEGACY_UNSCOPED'), 'Cross-Venue state guard missing');
assert(source.includes('getVenueRuntimeScopedStorageKey'), 'Runtime-scoped local storage missing');
assert(source.includes('applyVenueManifestSurfaceSets') && source.includes('applyVenueMaterialRules'), 'Manifest collision/material policies are not active');
assert(source.includes('getVenueRegistryAudit') && source.includes('getVenueAnchors'), 'Venue runtime public API missing');
assert(runtime.includes('VENUE_ASSET_ALREADY_REGISTERED'), 'Duplicate asset registration guard missing');
assert(runtime.includes('legacyFallback') && runtime.includes('venueOnly'), 'Controlled legacy adapter missing');

for (const forbidden of ['Wall_segments.glb', 'Floor_segment.glb', 'Ceiling.glb', 'Props.glb', 'gallerySupabaseModelsRootUrl', 'wallModelRootUrl', 'inferGalleryStartupAssetName']) {
  assert(!source.includes(forbidden), `Engine still knows Berryboy asset detail: ${forbidden}`);
  assert(!minified.includes(forbidden), `Production engine still knows Berryboy asset detail: ${forbidden}`);
}
assert(validateVenueManifest(manifestRaw).valid, 'berryboy-main/v1 manifest invalid');
assert(validateVenueManifest(templateManifestRaw).valid, 'Venue manifest template invalid');
assert(schemaRaw.properties?.schema?.const === 'berryboy-venue-manifest.v1', 'Formal Venue Manifest JSON Schema missing');
assert(manifestRaw.venueId === 'berryboy-main' && manifestRaw.versionId === 'v1', 'Current venue migration identity incorrect');
assert(manifestRaw.assets.length === 4, 'Current Berryboy Venue must describe its four legacy GLBs in data');
assert(manifestRaw.technicalFlags?.mobileC6C2DiagnosticsActive === true, 'C6C2 diagnostics active marker missing');

// Frozen systems and accepted UI remain present.
assert(bootstrap.includes('adaptToDeviceRatio: false'), 'Bootstrap no longer owns device DPR');
assert(sha(extractFunction(source, 'createViewerIntroOverlayStyles')) === '93595efee4b7f720f32b5a8b739f6212bcea793ed8bdc88e939ea243b74262d6', 'Accepted intro CSS changed');
assert(sha(extractFunction(source, 'showViewerIntroOverlay')) === 'fb4b8f6a0b72653489b10564492ffad9f52ba461bf67cb1992bd21e655aaf537', 'Accepted intro behavior changed');
assert(bootstrap.includes('gallery-instruction-popup-confirmed') && bootstrap.includes('instruction-popup-missing'), 'Original popup guard changed');
assert(count(source, 'function resolveGalleryGroundMovement(') === 1, 'Unified collision resolver changed');
assert(!source.includes('.moveWithCollisions('), 'Native collision path returned');
assert(source.includes('schema: "gallery-sculpture-core.v2"'), 'Sculpture Core missing');
assert(source.includes('function armGalleryInspectTransitionWatchdog('), 'Inspect isolation missing');
assert(source.includes('schema: "gallery-atomic-media-lifecycle.v1"'), 'Atomic media lifecycle missing');
assert(source.includes('schema: "gallery-mobile-quality-domains.v2"'), 'Mobile quality domains missing');
assert(source.includes('schema: "gallery-canonical-visual-state.v1"'), 'Canonical visual state missing');
assert(source.includes('schema: "gallery-artwork-residency.v1"'), 'Tiered artwork residency missing');
assert(source.includes('berryboyMobileSurvivalDebugButton') && source.includes('"FREEZE"') && source.includes('"LAST"'), 'C6C2 DBG panel was removed too early');
assert(source.includes('berryboy_mobile_survival_last_snapshot_v1'), 'C6C2 LAST SESSION snapshot missing');
assert(source.includes('function disposeVisualSsaoResourcesForSurvival('), 'C6C2 SSAO disposal missing');
assert(extractFunction(source, 'monitorGalleryExhibitTourLayout').includes('if (!editMode) return'), 'Viewer tour monitor regression');
assert(worker.includes('import(moduleUrl)') && adapter.includes('ImageEncoder'), 'AVIF worker/adapter missing');
assert(loginDisabled.includes('var galleryEditorLoginEnabled = false;'), 'Login-disabled TXT missing');
assert(!loginDisabled.includes('var galleryEditorLoginEnabled = true;'), 'Login remains enabled in TXT');
assert(minified.includes('12D1') && minified.includes('./runtime/venue-runtime.js') && runtime.includes('berryboy-venue-runtime-registry.v1'), 'Stage D1 runtime missing from production build');
console.log('Stage 12D1 verifier passed.');
