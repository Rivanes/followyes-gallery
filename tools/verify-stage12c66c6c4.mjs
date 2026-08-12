import fs from 'node:fs';
import crypto from 'node:crypto';
const source=fs.readFileSync(new URL('../src/Gallery_V0_11.js',import.meta.url),'utf8');
const minified=fs.readFileSync(new URL('../src/Gallery_V0_11.min.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const bootstrap=fs.readFileSync(new URL('../src/bootstrap/gallery-viewer-bootstrap.js',import.meta.url),'utf8');
const editorBootstrap=fs.readFileSync(new URL('../src/bootstrap/gallery-editor-bootstrap.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../src/workers/gallery-avif-encoder-worker.js',import.meta.url),'utf8');
const adapter=fs.readFileSync(new URL('../src/vendor/gallery-avif-encoder.mjs',import.meta.url),'utf8');
const txt=fs.readFileSync(new URL('../Gallery_V0_11_STAGE12C66C6C4_ARTWORK_FRAME_FIT_LOGIN_DISABLED.txt',import.meta.url),'utf8');
function assert(c,m){if(!c)throw new Error(m)}
function count(h,n){return h.split(n).length-1}
function sha(t){return crypto.createHash('sha256').update(t).digest('hex')}
function extractFunction(text,name){const ms=[`async function ${name}(`,`function ${name}(`];let st=-1;for(const m of ms){st=text.indexOf(m);if(st>=0)break}assert(st>=0,`Missing ${name}`);const b=text.indexOf('{',st);let d=0,s='c',q='';for(let i=b;i<text.length;i++){const c=text[i],n=text[i+1]||'';if(s==='c'){if(c==='"'||c==="'"||c==='`'){s='s';q=c}else if(c==='/'&&n==='/'){s='l';i++}else if(c==='/'&&n==='*'){s='b';i++}else if(c==='{')d++;else if(c==='}'&&--d===0)return text.slice(st,i+1)}else if(s==='s'){if(c==='\\')i++;else if(c===q)s='c'}else if(s==='l'&&c==='\n')s='c';else if(s==='b'&&c==='*'&&n==='/'){s='c';i++}}throw new Error(`Unterminated ${name}`)}

assert(index.includes('stage: "12C66C6C4"'),'Index stage identity missing');
assert(bootstrap.includes('const STAGE = "12C66C6C4"'),'Bootstrap stage identity missing');
assert(bootstrap.includes('stage12c66c6c4_artwork_frame_fit_20260812'),'C6C4 cache key missing');
assert(index.includes('gallery-viewer-bootstrap.js?v=stage12c66c6c4_artwork_frame_fit_20260812'),'Index cache key missing');
assert(editorBootstrap.includes('Stage 12C66C6C4'),'Editor bootstrap label missing');
assert(source.includes('Stage 12C66C6C2: Mobile Memory Survival / Tiered Artwork Residency'),'Base source history missing');
assert(source.includes('Stage 12C66C6C4: Artwork Frame Fit / Prefetch'),'C6C4 source history missing');
assert(bootstrap.includes('adaptToDeviceRatio: false'),'Bootstrap still owns device DPR');
assert(sha(extractFunction(source,'createViewerIntroOverlayStyles'))==='93595efee4b7f720f32b5a8b739f6212bcea793ed8bdc88e939ea243b74262d6','Accepted intro CSS changed');
assert(sha(extractFunction(source,'showViewerIntroOverlay'))==='fb4b8f6a0b72653489b10564492ffad9f52ba461bf67cb1992bd21e655aaf537','Accepted intro behavior changed');
assert(bootstrap.includes('gallery-instruction-popup-confirmed')&&bootstrap.includes('instruction-popup-missing'),'Original popup guard changed');

assert(count(source,'function resolveGalleryGroundMovement(')===1,'Unified collision resolver changed');
assert(!source.includes('.moveWithCollisions('),'Native collision path returned');
assert(source.includes('schema: "gallery-sculpture-core.v2"'),'Sculpture core missing');
assert(source.includes('schema: "gallery-artwork-runtime.v1"'),'Artwork runtime missing');
assert(source.includes('function armGalleryInspectTransitionWatchdog('),'Inspect watchdog missing');
assert(source.includes('function shouldShowMobileViewerControls('),'Mobile joystick owner missing');
assert(source.includes('schema: "gallery-atomic-media-lifecycle.v1"'),'Atomic media lifecycle missing');
assert(source.includes('schema: "gallery-mobile-quality-domains.v2"'),'Mobile quality domains missing');
assert(source.includes('schema: "gallery-canonical-visual-state.v1"'),'Canonical visual state missing');
assert(!source.includes('reflectionScale:'),'Reflection multiplier remains');
assert(count(source,'engine.setHardwareScalingLevel(')===1,'More than one render-resolution writer');
assert(!source.includes('function suspendArtworkTextureForStreaming('),'Empty-frame artwork unload returned');
assert(!source.includes('maxResidentArtworkTextures'),'Legacy artwork resident limit returned');
assert(!source.includes('addLODLevel(distance, null)'),'Null LOD returned');
assert(source.includes('REPAIR MEDIA')&&source.includes('AUDIT & CLEAN MEDIA'),'Two recovery controls missing');
for(const label of ['TEST SELECTED ARTWORK AVIF','AUDIT GENERATED WEBP','BUILD MISSING ARTWORK AVIF','FORCE REBUILD ARTWORK AVIF','VALIDATE AVIF MIGRATION','FINALIZE + REMOVE WEBP','RECONCILE / BUILD AUTHOR AVIF']) assert(!source.includes(label),`Migration cockpit remains: ${label}`);
assert(source.includes('IMPORT & OPTIMIZE URL'),'Atomic URL import missing');
assert(source.includes('var galleryAvifEncoderModuleUrl = "src/vendor/gallery-avif-encoder.mjs"'),'Local encoder entrypoint missing');
assert(worker.includes('import(moduleUrl)')&&adapter.includes('ImageEncoder'),'AVIF worker/adapter missing');

assert(source.includes('schema: "gallery-artwork-residency.v1"'),'Tiered artwork residency missing');
assert(source.includes('function downgradeGalleryArtworkToPreview('),'Preview downgrade missing');
assert(source.includes('preview-always-visible-tiered-full-residency'),'Streaming policy identity missing');
assert(!source.includes('artwork textures are permanent residents once assigned'),'Permanent full residency remains');
assert(source.includes('berryboyMobileSurvivalDebugButton')&&source.includes('"FREEZE"')&&source.includes('"LAST"'),'Touch survival panel missing');
assert(source.includes('berryboy_mobile_survival_last_snapshot_v1'),'Last-session snapshot missing');
assert(source.includes('function unregisterCommonShadowMesh(')&&source.includes('function pruneGalleryShadowRegistries('),'Shadow registry cleanup missing');
assert(extractFunction(source,'disposeModel3dSlotRuntime').includes('unregisterCommonShadowMesh'),'Model disposal leak remains');
assert(source.includes('function disposeVisualSsaoResourcesForSurvival('),'SSAO resource disposal missing');
assert(extractFunction(source,'monitorGalleryExhibitTourLayout').includes('if (!editMode) return'),'Tour monitor still runs in Viewer');

assert(source.includes('repairMedia: repairGalleryManagedMedia')&&source.includes('auditMedia: auditGalleryManagedMedia')&&source.includes('cleanUnusedMedia: cleanGalleryManagedMedia'),'Media recovery API missing');
assert(source.includes('getAtomicMediaDebug: getGalleryAtomicMediaDebug'),'Atomic diagnostics API missing');
assert(source.includes('getMobileQuality: getGalleryAdaptiveMobileQualityDebug')&&source.includes('setMobileQualityMode: setGalleryMobileQualityMode'),'Mobile quality API missing');
assert(minified.includes('galleryArtworkFrameStorageFolder')&&minified.includes('gallery-artwork-residency.v1')&&minified.includes('gallery-mobile-survival-snapshot.v1'),'C6C4 runtime missing from production build');
assert(txt.includes('var galleryEditorLoginEnabled = false;'),'Login-disabled TXT missing');
assert(!txt.includes('var galleryEditorLoginEnabled = true;'),'Login remains enabled in TXT');
console.log('Stage 12C66C6C4 verifier passed.');
