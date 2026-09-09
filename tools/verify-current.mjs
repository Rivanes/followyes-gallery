import fs from 'node:fs';
import crypto from 'node:crypto';

const source=fs.readFileSync(new URL('../src/Gallery_V0_11.js',import.meta.url),'utf8');
const minified=fs.readFileSync(new URL('../src/Gallery_V0_11.min.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const bootstrap=fs.readFileSync(new URL('../src/bootstrap/gallery-viewer-bootstrap.js',import.meta.url),'utf8');
const editorBootstrap=fs.readFileSync(new URL('../src/bootstrap/gallery-editor-bootstrap.js',import.meta.url),'utf8');
const admin=fs.readFileSync(new URL('../admin.html',import.meta.url),'utf8');
const adminBootstrap=fs.readFileSync(new URL('../src/bootstrap/admin-workspace-bootstrap.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../src/workers/gallery-avif-encoder-worker.js',import.meta.url),'utf8');
const adapter=fs.readFileSync(new URL('../src/vendor/gallery-avif-encoder.mjs',import.meta.url),'utf8');
const spaceFixture=fs.readFileSync(new URL('../src/config/space-fixture.js',import.meta.url),'utf8');
const spaceResolver=fs.readFileSync(new URL('../src/runtime/space-definition-resolver.js',import.meta.url),'utf8');
const exhibitionApi=fs.readFileSync(new URL('../src/data/exhibition-api.js',import.meta.url),'utf8');
const galleryManagementApi=fs.readFileSync(new URL('../src/data/gallery-management-api.js',import.meta.url),'utf8');
const galleryTestBootstrap=fs.readFileSync(new URL('../src/bootstrap/gallery-test-bootstrap.js',import.meta.url),'utf8');
const galleryTestHtml=fs.readFileSync(new URL('../gallery-test.html',import.meta.url),'utf8');
const assetCacheBootstrap=fs.readFileSync(new URL('../src/bootstrap/asset-cache-bootstrap.js',import.meta.url),'utf8');
const assetCacheSw=fs.readFileSync(new URL('../asset-cache-sw.js',import.meta.url),'utf8');
const transitionGuard=fs.readFileSync(new URL('../src/bootstrap/transition-guard.js',import.meta.url),'utf8');
const sceneLifecycle=fs.readFileSync(new URL('../src/runtime/scene-lifecycle-controller.js',import.meta.url),'utf8');
const sharedAssetApi=fs.readFileSync(new URL('../src/data/shared-asset-api.js',import.meta.url),'utf8');
const sharedAssetState=fs.readFileSync(new URL('../src/runtime/shared-asset-state.js',import.meta.url),'utf8');
const sharedAssetValidation=fs.readFileSync(new URL('../src/validation/shared-asset-validation.js',import.meta.url),'utf8');
const sharedAssetWorker=fs.readFileSync(new URL('../src/workers/shared-asset-glb-validator-worker.js',import.meta.url),'utf8');
const assetWorkspace=fs.readFileSync(new URL('../src/bootstrap/admin-asset-workspace.js',import.meta.url),'utf8');

function assert(c,m){if(!c)throw new Error(m)}
function count(h,n){return h.split(n).length-1}
function sha(t){return crypto.createHash('sha256').update(t).digest('hex')}
function extractFunction(text,name){const ms=[`async function ${name}(`,`function ${name}(`];let st=-1;for(const m of ms){st=text.indexOf(m);if(st>=0)break}assert(st>=0,`Missing ${name}`);const b=text.indexOf('{',st);let d=0,s='c',q='';for(let i=b;i<text.length;i++){const c=text[i],n=text[i+1]||'';if(s==='c'){if(c==='"'||c==="'"||c==='`'){s='s';q=c}else if(c==='/'&&n==='/'){s='l';i++}else if(c==='/'&&n==='*'){s='b';i++}else if(c==='{')d++;else if(c==='}'&&--d===0)return text.slice(st,i+1)}else if(s==='s'){if(c==='\\')i++;else if(c===q)s='c'}else if(s==='l'&&c==='\n')s='c';else if(s==='b'&&c==='*'&&n==='/'){s='c';i++}}throw new Error(`Unterminated ${name}`)}

assert(index.includes('stage: "V13.4"'),'Index stage identity missing');
assert(bootstrap.includes('const STAGE = "V13.4"'),'Viewer stage identity missing');
assert(adminBootstrap.includes('const STAGE = "V13.4"'),'Admin stage identity missing');
assert(bootstrap.includes('v13_4_frame_browser_migration_20260909'),'Current engine cache key missing');
assert(index.includes('gallery-viewer-bootstrap.js?v=v13_4_frame_browser_migration_20260909'),'Index viewer cache key missing');
assert(sharedAssetApi.includes('SHARED_ASSET_STAGE = "V13.1"')&&sharedAssetApi.includes('admin_publish_shared_asset_version'),'V13.1 Shared Asset data adapter missing');
assert(sharedAssetState.includes('exhibition-platform-state-assets.v1')&&sharedAssetState.includes('collectSharedAssetReferences'),'V13.1 Shared Asset state contract missing');
assert(sharedAssetValidation.includes('exhibition-platform-shared-asset-validation.v1')&&sharedAssetWorker.includes('["prop","frame"]'),'V13.1 Shared Asset GLB validation contract missing');
assert(assetWorkspace.includes('ADMIN_ASSET_WORKSPACE_STAGE = "V13.4"')&&assetWorkspace.includes('Asset Library')&&assetWorkspace.includes('UPLOAD NEW GLB VERSION'),'V13.2 left Asset Workspace module missing');
assert(adminBootstrap.includes('data-section=\"assets\"')&&adminBootstrap.includes('assetWorkspaceHost')&&adminBootstrap.includes('currentPreviewContextSection'),'V13.2 three-tab/host-context orchestration missing');
assert(assetWorkspace.includes('api.uploadThumbnail')&&sharedAssetApi.includes('admin_register_shared_asset_thumbnail'),'V13.2 thumbnail management bridge missing');
assert(assetWorkspace.includes('application/x-exhibition-shared-asset')&&assetWorkspace.includes('PLACE PROP')&&!assetWorkspace.includes('tile.addEventListener("dragstart", async'),'V13.3 synchronous Prop drag/tap placement launcher missing');
assert(adminBootstrap.includes('beginSharedAssetPropPlacement')&&adminBootstrap.includes('venueVersionId'),'V13.3 Admin-to-live-scene placement context bridge missing');
assert(source.includes('assetInstances: artSpheres.filter(isSharedAssetPropSlot)')&&source.includes('beginSharedAssetPropPlacement: beginSharedAssetPropPlacement'),'V13.3 Shared Prop state/runtime bridge missing');
assert(source.includes('if (isSharedAssetPropSlot(object)) return false')&&source.includes('if (sculptureSlot && isSharedAssetPropSlot(sculptureSlot)) return null'),'V13.3 Prop Tour/Inspect semantic isolation missing');
assert(source.includes('createEditorSection("PROP")')&&source.includes('PROP TRANSFORM'),'V13.3 contextual Prop inspector missing');
assert(assetWorkspace.includes('exhibition-platform-frame-binding.v1')&&assetWorkspace.includes('application/x-exhibition-shared-frame'),'V13.4 Frame Browser drag/binding contract missing');
assert(adminBootstrap.includes('exhibition-platform:open-frame-browser')&&adminBootstrap.includes('applySharedAssetFrameToSelectedArtwork'),'V13.4 Admin Frame Browser bridge missing');
assert(source.includes('artworkFrameChangeButton.innerText = \"CHANGE\"')&&source.includes('artworkFrameRemoveButton.innerText = \"REMOVE\"')&&!source.includes('var artworkFrameGrid = document.createElement(\"div\")'),'V13.4 compact right Frame inspector missing');
assert(source.includes('assetVersionId: frameState.assetVersionId || null')&&source.includes('runtimeMetadata: frameState.runtimeMetadata'),'V13.4 stable Frame ID state/fallback serialization missing');
assert(source.includes('sharedAssetFrameDrop')&&source.includes('Drop the Frame directly on an artwork.'),'V13.4 artwork-only Frame drop guard missing');
assert(!index.includes('id="galleryBootStart"')&&!index.includes('id="galleryBootAbout"'),'Legacy prestart Enter Gallery popup remains');
assert(index.includes('class="is-hidden" data-state="prestart"'),'Boot guard must be hidden before Exhibition selection');
assert(bootstrap.includes('c26HomepageExhibitionCarousel')&&bootstrap.includes('bootGuard.start();'),'Homepage Exhibition carousel/start bridge missing');
assert(!bootstrap.includes('c25HomepageExhibitionGrid'),'Temporary C25 discovery grid remains');
assert(bootstrap.includes('c26ExhibitionCard--titleOnly')&&!bootstrap.includes('c25ExhibitionFallback'),'Coverless Exhibition is not a genuine title-only card');
assert(bootstrap.includes('scroll-snap-type:x mandatory')&&bootstrap.includes('touch-action:pan-x pan-y'),'Carousel mobile swipe contract missing');
assert(bootstrap.includes('#c26HomepageExhibitionTrack{display:flex;align-items:stretch;justify-content:center')&&bootstrap.includes('width:max-content;min-width:100%'),'Carousel responsive centering contract missing');
assert(bootstrap.includes('event.key === "ArrowRight"')&&bootstrap.includes('event.key === "ArrowLeft"'),'Carousel keyboard navigation missing');
assert(bootstrap.includes('function isHardDocumentReload()')&&bootstrap.includes('entries[0].type === "reload"'),'Hard reload detection missing');
assert(bootstrap.includes('function resetPublicEntryToHomepageOnReload()')&&bootstrap.includes('url.searchParams.delete("exhibition")'),'Reload does not reset public entry URL to homepage');
assert(bootstrap.includes('ensurePublicExhibitionSelection({ force: resetToHomepageAfterReload })'),'Reload homepage reset is not wired before public discovery');
assert(bootstrap.includes('applyPublicSpaceIntroPolicy(currentRuntime')&&bootstrap.includes('initial: true, reason: "initial-public-entry"'),'C26 public Space intro orchestration missing');
assert(index.includes('<a id="adminWorkspaceButton" class="headerButton" href="./admin.html">ADMIN</a>'),'Static Admin entry is not directly exposed');
assert(bootstrap.includes('adminWorkspaceButton.classList.remove("hidden")'),'Admin direct access is not kept exposed by auth UI');
assert(bootstrap.includes('if (!currentSession || !activeEngine || !activeScene || !sceneLifecycleController) return;'),'Admin direct navigation fallback missing');
assert(source.includes('Stage 12C66C6C8C13: Instant Workspace Mode Switch'),'C6C8C13 source history missing');
assert(source.includes('Stage 12C66C6C8C14: Zero-Work Public Return'),'C6C8C14 source history missing');
assert(source.includes('Stage 12C66C6C8C15: Persistent Draft / Instant Public Preview'),'C6C8C15 source history missing');
assert(source.includes('Stage 12C66C6C8C16: Mobile UI Polish / Inspect Layout / Cursor Refresh'),'C6C8C16 source history missing');
assert(source.includes('C6C8C21: Multi-Space Foundation'),'C6C8C21 source history missing');
assert(source.includes('C6C8C22: Gallery Management'),'C6C8C22 source history missing');
assert(source.includes('C6C8C23: Space Model Validation'),'C6C8C23 source history missing');
assert(source.includes('C6C8C25: Cross-Space Runtime'),'C6C8C25 source history missing');
assert(bootstrap.includes('adaptToDeviceRatio: false'),'Bootstrap still owns device DPR');
assert(sha(extractFunction(source,'createViewerIntroOverlayStyles'))==='01c01b3e1a1e12f44802a2f375e78fe59acadd0f478d666871ba179098cf3d5f','Accepted C6C8C16 intro CSS changed');
assert(sha(extractFunction(source,'showViewerIntroOverlay'))==='3e555d80b26ee44188f21107cd265cb603ff601cbf51cdebf8bce95d4d00d09e','Accepted C6C8C16 intro behavior changed');
assert(count(source,'function resolveGalleryGroundMovement(')===1,'Unified collision resolver changed');
assert(!source.includes('.moveWithCollisions('),'Native collision path returned');
assert(source.includes('schema: "gallery-sculpture-core.v2"'),'Sculpture core missing');
assert(source.includes('schema: "gallery-artwork-runtime.v1"'),'Artwork runtime missing');
assert(source.includes('schema: "gallery-atomic-media-lifecycle.v1"'),'Atomic media lifecycle missing');
assert(source.includes('schema: "gallery-mobile-quality-domains.v2"'),'Mobile quality domains missing');
assert(source.includes('schema: "gallery-artwork-residency.v3"'),'Artwork residency missing');
assert(source.includes('REPAIR MEDIA')&&source.includes('AUDIT & CLEAN MEDIA'),'Media recovery controls missing');
assert(source.includes('var galleryAvifEncoderModuleUrl = "src/vendor/gallery-avif-encoder.mjs"'),'AVIF entrypoint missing');
assert(worker.includes('import(moduleUrl)')&&adapter.includes('ImageEncoder'),'AVIF worker/adapter missing');
assert(source.includes('function switchGalleryExhibition(')&&source.includes('function createGalleryExhibition('),'Multi-exhibition runtime missing');
assert(source.includes('function waitForGallerySameSpaceArtworkPreviews('),'C6C8C25.4 same-space Preview hydration gate missing');
assert(source.includes('same-space-exhibition-preview-ready')&&source.includes('same-space-exhibition-rollback-preview-ready'),'C6C8C25.4 switch/rollback Preview readiness wiring missing');
assert(!source.includes('.eq("id", "main")'),'Hard-coded gallery_state main query remains');
assert(spaceFixture.includes('Floor_segment.glb')&&spaceFixture.includes('Wall_segments.glb')&&spaceFixture.includes('Ceiling.glb')&&spaceFixture.includes('Props.glb'),'Development Space fixture missing current geometry');
assert(spaceResolver.includes('exhibition-platform-venue-manifest.v1')&&spaceResolver.includes('REQUIRED_SPACE_ASSET_ROLES'),'Canonical Space resolver missing');
assert(exhibitionApi.includes('resolve_published_exhibition')&&exhibitionApi.includes('save_exhibition_runtime_state'),'Canonical Exhibition adapter missing');
assert(galleryManagementApi.includes('admin_create_gallery_with_initial_draft')&&galleryManagementApi.includes('admin_set_venue_asset_slot'),'C22 Gallery Management adapter missing');
assert(galleryManagementApi.includes('venues/${venue}/versions/${version}/assets/${normalizedRole}/'),'C22 UUID Gallery asset path missing');
assert(adminBootstrap.includes('EXHIBITIONS')&&adminBootstrap.includes('GALLERIES')&&adminBootstrap.includes('createGalleryManagementApi'),'C22 Gallery Management workspace missing');
assert(galleryTestHtml.includes('data-gallery-test="true"')&&galleryTestBootstrap.includes('admin_resolve_venue_version_for_test')===false&&galleryTestBootstrap.includes('resolveTest('),'C22 Test Gallery shell missing');
assert(galleryTestBootstrap.includes('getCameraPose')&&source.includes('getCameraPose: function ()'),'C22 Entry capture bridge missing');
assert(!bootstrap.includes('gallery-space-config.js')&&!adminBootstrap.includes('gallery-space-config.js'),'Production bootstrap still imports static Space config');
assert(!bootstrap.includes('from("gallery_exhibitions")')&&!adminBootstrap.includes('from("gallery_exhibitions")'),'Production bootstrap still reads legacy catalog directly');
assert(admin.includes('id="adminViewportStage"')&&admin.includes('id="exhibitionList"'),'Direct Admin page missing');
assert(source.includes('enterAdminWorkspaceMode: enterGalleryAdminWorkspaceMode')&&source.includes('exitAdminWorkspaceMode: exitGalleryAdminWorkspaceMode'),'Same-runtime engine mode API missing');
assert(source.includes('discardUnsavedChanges: discardGalleryUnsavedChanges'),'Scene discard API missing');
assert(source.includes('function applyGallerySameSpaceExhibitionState(')&&source.includes('lastSwitchMode = "same-space-delta-load"')&&source.includes('lastSwitchMode = "resident-layer-resume"'),'Same-space Exhibition delta/resident path missing');
assert(source.includes('function refreshViewerExhibitionCollisionMeshes('),'Exhibition-only collision refresh missing');
assert(!source.includes('ensureGalleryExhibitTourCurrent("enter-edit-mode")')&&!source.includes('ensureGalleryExhibitTourCurrent("same-runtime-admin-enter")'),'Edit/Admin mode still rebuilds Tour unconditionally');
assert(bootstrap.includes('openInlineAdminWorkspace')&&bootstrap.includes('engine: activeEngine')&&bootstrap.includes('scene: activeScene'),'Viewer same-runtime handoff missing');
assert(adminBootstrap.includes('inlineRuntimeContext.engine')&&adminBootstrap.includes('inlineRuntimeContext.scene'),'Admin inline runtime reuse missing');
assert(adminBootstrap.includes('export async function suspendAdminWorkspace(options = {})'),'Admin suspend API missing');
assert(admin.includes('.adminButton:visited')&&admin.includes('text-decoration:none'),'Public Page button style fix missing');
assert(assetCacheBootstrap.includes('SERVICE_WORKER_URL')&&assetCacheSw.includes('exhibition-platform-assets-v1'),'Persistent asset cache missing');
assert(minified.includes('syncGalleryArtworkEgressPolicyForWorkspaceMode')&&minified.includes('gallery-artwork-residency.v3'),'Production runtime missing current hygiene changes');
assert(source.includes('var galleryEditorLoginEnabled = true;'),'Production editor-login gate marker missing');
assert(spaceFixture.includes('export const developmentSpaceFixture'),'Development Space fixture export missing');
assert(source.includes('function parkActiveGalleryExhibitionLayer(')&&source.includes('function restoreGalleryExhibitionLayer('),'Exhibition layer residency missing');
assert(source.includes('function setGallerySameRuntimeModeState(')&&source.includes('instant-workspace-ui-only'),'Instant zero-reload mode transition missing');
assert(source.includes('function scheduleGalleryWorkspaceModeBackgroundAudit(')&&source.includes('requestIdleCallback(runAudit'),'Deferred workspace integrity audit missing');
assert(source.includes('canUseInstantWorkspaceModeSwitch: function ()')&&source.includes('foregroundPreserved: true'),'Workspace fast-path safety API missing');
assert(bootstrap.includes('const instantFastPath = !crossSpaceReturn && (preserveDraft || !sceneDirty) && canUseInstantWorkspaceModeSwitch()'),'C6C8C25 same-space Admin→Public fast path missing');
assert(adminBootstrap.includes('void updateAssetDeliveryStatus().catch(() => null)'),'Admin telemetry still blocks workspace resume');
assert(admin.includes('id="networkDiagnostics"')&&adminBootstrap.includes('getExhibitionAssetDeliveryStats'),'Admin network diagnostics missing');
assert(assetCacheSw.includes('EXHIBITION_ASSET_DELIVERY_STATS')&&assetCacheSw.includes('supabaseNetworkFetches'),'Storage delivery instrumentation missing');
assert(transitionGuard.includes('beginTransitionGuard')&&transitionGuard.includes('endTransitionGuard')&&transitionGuard.includes('epTransitionSpinner'),'Transition guard module missing');
assert(source.includes('function tagGallerySceneOwner(')&&source.includes('function verifyGalleryCanonicalSpaceIntegrity('),'C6C8C7 scene ownership/integrity guard missing');
assert(source.includes('galleryExhibitionRuntime.hydrationActive = true')&&source.includes('scheduleGalleryDeferredTourAfterHydration'),'C6C8C7 atomic hydration/deferred Tour missing');
assert(source.includes('blockedSpaceDisposals')&&source.includes('lastHydrationProfile'),'C6C8C7 diagnostics missing');
assert(transitionGuard.includes('setTimeout(resolve, 34)'),'C6C8C7 transition paint barrier missing');
assert(bootstrap.includes('Returning to Public Page…')&&bootstrap.includes('Opening Admin Workspace…'),'Viewer/Admin same-runtime transition feedback missing');
assert(adminBootstrap.includes('Switching to ${target.name}…')&&adminBootstrap.includes('Keeping the current immutable Gallery Version resident.'),'Exhibition switch loading feedback missing');
assert(adminBootstrap.includes('void captureExhibitionTransitionDiagnostic'),'Diagnostics still block the visible exhibition transition');
assert(source.includes('schema: "gallery-artwork-residency.v3"'),'C6C8C8 residency schema missing');
assert(source.includes('function isGalleryViewerTextureStreamingMotionBlocked('),'C6C8C8 movement gate missing');
assert(source.includes('desktopHardFullTextures: 8')&&source.includes('fullReentryCooldownMs: 18000'),'C6C8C8 hysteresis policy missing');
assert(source.includes('if (!entry || !entry.inspectPriority) return false;'),'Critical/visible movement bypass still active');
assert(source.includes('_galleryNoAutoFullQueue = true')&&source.includes('preview-auto-full-suppressed'),'Downgrade anti-thrash guard missing');
assert(adminBootstrap.includes('move-block')&&adminBootstrap.includes('thrash'),'C6C8C8 diagnostics missing');
assert(source.includes('function sweepGalleryInactiveExhibitionOwners(')&&source.includes('active-context-change'),'C6C8C9 owner-driven orphan sweep missing');
assert(source.includes('function waitForGalleryForegroundReady(')&&source.includes('function runGallerySpaceGpuWarmup('),'C6C8C9 true foreground readiness/GPU warmup missing');
assert(source.includes('PerformanceObserver')&&source.includes('entryTypes: ["longtask"]'),'C6C8C9 long-task observer missing');
assert(bootstrap.includes('admin-to-public-fallback')&&bootstrap.includes('public-to-admin-fallback')&&bootstrap.includes('canUseInstantWorkspaceModeSwitch'),'C6C8C13 workspace readiness fast/fallback path missing');
assert(adminBootstrap.includes('waitForForegroundReady(`switch:${fromId}->${id}`'),'C6C8C9 exhibition switch readiness wait missing');
assert(source.includes('function prepareGalleryForegroundArtworkBudget(')&&source.includes('previewGateMode: "all-assigned-preview"'),'C6C8C11 all-assigned Preview gate missing');
assert(source.includes('function getGalleryBackgroundHydrationPauseReason(')&&source.includes('model-idle-budget'),'C6C8C10 motion-aware background budget missing');
assert(source.includes('gallerySpaceGpuWarmMeshCache')&&source.includes('Promise.all(list.slice(i, i + batchSize)'),'C6C8C12 cached batched per-mesh Space GPU warmup missing');
assert(adminBootstrap.includes('BG slices')&&adminBootstrap.includes('Preview presence'),'C6C8C11 Admin Preview diagnostics missing');
assert(source.includes('function getGalleryActiveArtworkPreviewPresenceSnapshot(')&&source.includes('function queueGalleryMissingRequiredPreviews('),'C6C8C11 Preview presence/requeue helpers missing');
assert(source.includes('snapshot.requiredPreviews === snapshot.readyPreviews')&&source.includes('snapshot.missingPreviews === 0'),'C6C8C11 readiness does not guarantee Preview fill');
assert(source.includes('Math.min(6, getGalleryFastStartPreviewTextureConcurrency())'),'C6C8C11 Preview concurrency path missing');
assert(source.includes('var galleryStrictCriticalAssetNames = ["floor", "wall", "ceiling"]')&&source.includes('galleryAuthoringSpacePreview'),'C6C8C23 optional Props runtime contract missing');
assert(source.includes('function getGallerySpaceGpuWarmupRevision(')&&source.includes('{ kind: "wall", meshes: wallMeshes }')&&source.includes('{ kind: "prop", meshes: propMeshes }'),'C6C8C12 per-mesh Space warmup missing');
assert(source.includes('gallerySpaceAlwaysResident = true')&&source.includes('freezeStaticGalleryMeshes(propMeshes, "prop")'),'C6C8C12 resident Props contract missing');
assert(source.includes('warmup.ok !== true')&&source.includes('Space visual warmup failed for:'),'C6C8C12 hard visual warmup gate missing');
assert(source.includes('function clearGalleryEditSelectionFastForWorkspaceReturn(')&&source.includes('function applyGalleryViewerPresentationFastPath('),'C6C8C14 zero-work public presentation helpers missing');
assert(source.includes('function scheduleGalleryWorkspacePublicReturnDeferredRepair(')&&source.includes('collisionProxyRebuildsOnClickPath: 0'),'C6C8C14 deferred sculpture collision repair contract missing');
const publicFastPresentation=extractFunction(source,'applyGalleryViewerPresentationFastPath');
assert(!publicFastPresentation.includes('refreshSculptureCollisionProxy(')&&!publicFastPresentation.includes('applySculptureSlotVisualState(')&&!publicFastPresentation.includes('updateModel3dSlotsVisibility('),'C6C8C14 public click path still rebuilds sculpture runtime');
assert(bootstrap.includes('const transitionBeforePromise = instantFastPath')&&bootstrap.includes('? null')&&bootstrap.includes('publishInstantWorkspaceModeDiagnostic'),'C6C8C14 click path still starts network diagnostics');

assert(adminBootstrap.includes('inlineRuntimeContext.close({ preserveDraft: true, reason: "public-preview" })'),'C6C8C15 PUBLIC PAGE does not use non-destructive draft preview');
assert(!adminBootstrap.includes('Discard them and return to the public Viewer?'),'C6C8C15 old PUBLIC PAGE discard confirmation remains');
assert(source.includes('var galleryAdminDraftPreviewActive = false;')&&source.includes('options.preserveDraft === true'),'C6C8C15 persistent draft runtime flag/path missing');
assert(source.includes('galleryAdminDraftPreviewActive = !!(preserveDraft && sceneDraftDirty)'),'C6C8C15 scene draft is not retained for Public Preview');
assert(adminBootstrap.includes('metadataDraftPreviewActive = options.preserveDraft === true && metadataDirty'),'C6C8C15 metadata draft persistence missing');
assert(adminBootstrap.includes('const preserveMetadataDraft = metadataDraftPreviewActive && metadataDirty'),'C6C8C15 Admin resume may overwrite metadata draft');
assert(bootstrap.includes('exitAdminWorkspaceMode({ discardUnsaved, preserveDraft })'),'C6C8C15 viewer close does not forward preserveDraft');

assert(sceneLifecycle.includes('createSceneLifecycleController')&&sceneLifecycle.includes('getRuntimeVenueVersionKey'),'C6C8C25 Scene lifecycle controller missing');
assert(bootstrap.includes('const scene = activeScene;')&&bootstrap.includes('switchPublicExhibition(reference'),'C6C8C25 mutable Viewer scene loop/switch missing');
assert(adminBootstrap.includes('sceneLifecycleController.switchTo'),'C6C8C25 Admin switch does not use lifecycle controller');
assert(source.includes('Exhibition state belongs to another Gallery Version'),'C6C8C25 exact Venue Version state guard missing');
assert(source.includes('gallery-scene-disposed')&&source.includes('galleryDisposed = true'),'C6C8C25 disposal contract missing');
assert(exhibitionApi.includes('const runtimeKey = (modeValue, id) =>'),'C6C8C25 mode-qualified runtime cache missing');

const packageJson=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const expectedRegressionSuites=[
  'test-core-runtime.mjs',
  'test-cross-space-runtime.mjs',
  'test-exhibition-gallery-assignment.mjs',
  'test-gallery-management.mjs',
  'test-media-runtime.mjs',
  'test-performance-runtime.mjs',
  'test-platform-runtime.mjs',
  'test-shared-assets.mjs',
  'test-space-model-validation.mjs',
  'test-workspace-ui.mjs'
];
const actualRegressionSuites=fs.readdirSync(new URL('./',import.meta.url))
  .filter((name)=>name.startsWith('test-')&&name.endsWith('.mjs'))
  .sort();
assert(JSON.stringify(actualRegressionSuites)===JSON.stringify(expectedRegressionSuites),'Regression tooling drifted back into per-stage test files');
assert(packageJson.name==='exhibition-platform','Package identity is not consolidated');
assert(packageJson.scripts?.check==='npm run build && npm run syntax && npm run verify && npm test','Consolidated check pipeline changed');
assert(!Object.keys(packageJson.scripts||{}).some((name)=>name.startsWith('test:stage')),'Stage-specific npm test scripts returned');


console.log('Current Exhibition Platform verifier passed.');
