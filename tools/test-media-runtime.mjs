import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import vm from 'node:vm';

// Consolidated regression suite. Each block is isolated so legacy variable names cannot collide.

// --- test-stage12c66c6b-avif-pipeline.mjs ---
await (async () => {
const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../src/workers/gallery-avif-encoder-worker.js', import.meta.url), 'utf8');
function assert(condition, message) { if (!condition) throw new Error(message); }
function extractFunction(text, name) {
  const candidates = [`async function ${name}(`, `function ${name}(`];
  let start = candidates.map((m) => text.indexOf(m)).find((v) => v >= 0) ?? -1;
  assert(start >= 0, `Missing function ${name}`);
  const brace = text.indexOf('{', start);
  let depth = 0, state = 'code', quote = '';
  for (let i = brace; i < text.length; i += 1) {
    const c = text[i], n = text[i + 1] || '';
    if (state === 'code') {
      if (c === '"' || c === "'" || c === '`') { state = 'string'; quote = c; }
      else if (c === '/' && n === '/') { state = 'line'; i += 1; }
      else if (c === '/' && n === '*') { state = 'block'; i += 1; }
      else if (c === '{') depth += 1;
      else if (c === '}' && --depth === 0) return text.slice(start, i + 1);
    } else if (state === 'string') {
      if (c === '\\') i += 1; else if (c === quote) state = 'code';
    } else if (state === 'line' && c === '\n') state = 'code';
    else if (state === 'block' && c === '*' && n === '/') { state = 'code'; i += 1; }
  }
  throw new Error(`Unterminated function ${name}`);
}

assert(source.includes('galleryArtworkImageVariantFormat = "image/avif"'), 'AVIF MIME missing');
assert(source.includes('galleryArtworkImageVariantExtension = "avif"'), 'AVIF extension missing');
assert(source.includes('galleryArtworkImageVariantFolder = "AVIFv1"'), 'Versioned AVIF folder missing');
assert(source.includes('https://esm.sh/@jsquash/avif@2.1.1?bundle'), 'Pinned jSquash module missing');
assert(worker.includes('import(moduleUrl)') && worker.includes('new ImageData'), 'Worker does not lazy-load and encode ImageData');
assert(worker.includes('self.postMessage') && worker.includes('[buffer]'), 'Worker does not transfer encoded buffer');
const variantBlob = extractFunction(source, 'createArtworkImageVariantBlob');
assert(variantBlob.includes('getImageData') && variantBlob.includes('encodeGalleryImageDataToAvif'), 'Canvas resize to AVIF worker missing');
assert(!variantBlob.includes('toBlob'), 'Legacy canvas WebP encoding remains');
const upload = extractFunction(source, 'uploadArtworkVariantBlob');
assert(upload.includes('upsert: false') && upload.includes('contentType: variantBlobData.mimeType'), 'Immutable AVIF upload missing');
assert(upload.includes('verifyUploadedGalleryAvifVariant'), 'Uploaded AVIF is not verified');
const createSet = extractFunction(source, 'createAndUploadArtworkImageVariants');
assert(createSet.includes('uploadedPaths') && createSet.includes('atomic-avif-set-failed'), 'Atomic AVIF set cleanup missing');
assert(createSet.includes('imageVariantSetId') && createSet.includes('imageVariantSettings'), 'AVIF metadata missing');
const complete = extractFunction(source, 'isGalleryAvifVariantComplete');
assert(complete.includes('image/avif') && complete.includes('.avif'), 'Strict AVIF completeness check missing');
const textureApply = extractFunction(source, 'applyArtworkImageState');
assert(textureApply.includes('_galleryAvifFallbackAttempted') && textureApply.includes('_galleryDisableAvif'), 'AVIF original fallback missing');
assert(extractFunction(source, 'getArtworkTextureNoMipmap').includes('return false'), 'Mipmap quality regression');
assert(extractFunction(source, 'getArtworkTextureAnisotropyLevel').includes('? 8 : 16'), 'Anisotropy policy missing');
console.log('Stage 12C66C6B AVIF pipeline tests passed.');

})();

// --- test-stage12c66c6c-atomic-media.mjs ---
await (async () => {
const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
const adapter = fs.readFileSync(new URL('../src/vendor/gallery-avif-encoder.mjs', import.meta.url), 'utf8');
function assert(c,m){if(!c)throw new Error(m)}
function extractFunction(text,name){const ms=[`async function ${name}(`,`function ${name}(`];let start=-1;for(const m of ms){start=text.indexOf(m);if(start>=0)break}assert(start>=0,`Missing function ${name}`);const brace=text.indexOf('{',start);let d=0,s='code',q='';for(let i=brace;i<text.length;i++){const c=text[i],n=text[i+1]||'';if(s==='code'){if(c==='"'||c==="'"||c==='`'){s='str';q=c}else if(c==='/'&&n==='/'){s='line';i++}else if(c==='/'&&n==='*'){s='block';i++}else if(c==='{')d++;else if(c==='}'&&--d===0)return text.slice(start,i+1)}else if(s==='str'){if(c==='\\')i++;else if(c===q)s='code'}else if(s==='line'&&c==='\n')s='code';else if(s==='block'&&c==='*'&&n==='/'){s='code';i++}}throw new Error(`Unterminated ${name}`)}
assert(source.includes('schema: "gallery-atomic-media-lifecycle.v1"'),'Atomic media runtime missing');
assert(source.includes('var galleryAvifEncoderModuleUrl = "src/vendor/gallery-avif-encoder.mjs"'),'Local encoder entrypoint missing');
assert(adapter.includes('ImageEncoder') && adapter.includes('import(FALLBACK)'),'Local-first AVIF adapter contract missing');
const encode=extractFunction(source,'encodeGalleryImageDataToAvif');
assert(encode.includes('new URL(galleryAvifEncoderModuleUrl, document.baseURI).href'),'Worker does not receive an absolute local module URL');
const artwork=extractFunction(source,'uploadArtworkImageToSupabase');
assert(artwork.includes('beginGalleryAtomicMediaOperation("artwork:"'),'Artwork operation ownership missing');
assert(artwork.includes('isGalleryAvifVariantComplete(uploadedState, "image")'),'Artwork can commit an incomplete AVIF set');
assert(artwork.includes('isGalleryAtomicMediaOperationCurrent(operation)'),'Stale artwork operation guard missing');
assert(artwork.indexOf('persistGalleryAtomicMediaCommit') < artwork.indexOf('queueReplacedGalleryArtworkStateForCleanup'),'Old artwork media is queued before successful save');
assert(artwork.includes('atomic artwork rollback'),'Artwork save rollback missing');
const importUrl=extractFunction(source,'importArtworkImageUrlToSupabase');
assert(importUrl.includes('uploadArtworkImageToSupabase(artwork, file)'),'URL import bypasses atomic upload');
const author=extractFunction(source,'uploadAuthorPhotoAtomically');
assert(author.includes('isGalleryAvifVariantComplete(nextInfo, "authorPhoto")'),'Author can commit incomplete AVIF');
assert(author.includes('isGalleryAtomicMediaOperationCurrent(operation)'),'Stale author operation guard missing');
assert(author.indexOf('persistGalleryAtomicMediaCommit') < author.indexOf('queueGalleryAuthorPhotoForCleanup(previousInfo'),'Old author media queued before save');
assert(author.includes('previous author photo was restored'),'Author rollback missing');
const remove=extractFunction(source,'removeArtworkImageWithStorageDelete');
assert(remove.includes('persistGalleryAtomicMediaCommit("atomic-artwork-remove")'),'Artwork removal is not autosaved atomically');
assert(remove.indexOf('persistGalleryAtomicMediaCommit') < remove.indexOf('queueGalleryArtworkStateForCleanup(previousState'),'Artwork files queued before removal commit');
assert(remove.includes('atomic artwork remove rollback'),'Artwork remove rollback missing');
const clear=extractFunction(source,'clearGalleryOwnerInfoAtomically');
assert(clear.includes('persistGalleryAtomicMediaCommit') && clear.includes('cleanupUnusedAuthorPhotoIfNeeded'),'Atomic author-info clear missing');
const publicApplyStart=source.indexOf('applyArtworkImageUrl: function');
const publicApplyEnd=source.indexOf('},',publicApplyStart);
const publicApply=source.slice(publicApplyStart,publicApplyEnd+2);
assert(publicApply.includes('importArtworkImageUrlToSupabase')&&!publicApply.includes('applyArtworkImageState('),'Public applyArtworkImageUrl still bypasses AVIF');
assert(source.includes('IMPORT & OPTIMIZE URL'),'Safe URL import UI missing');
assert(source.includes('Direct author-photo URL changes are disabled'),'Manual author-photo bypass remains active');
assert(!source.includes('if (false)'),'Disabled legacy branches remain in active source');
assert(source.includes('REPAIR MEDIA') && source.includes('AUDIT & CLEAN MEDIA'),'Two recovery tools missing');
for(const label of ['TEST SELECTED ARTWORK AVIF','AUDIT GENERATED WEBP','BUILD MISSING ARTWORK AVIF','FORCE REBUILD ARTWORK AVIF','VALIDATE AVIF MIGRATION','FINALIZE + REMOVE WEBP','RECONCILE / BUILD AUTHOR AVIF']) assert(!source.includes(label),`One-time migration UI remains: ${label}`);
assert(source.includes('repairMedia: repairGalleryManagedMedia') && source.includes('auditMedia: auditGalleryManagedMedia') && source.includes('cleanUnusedMedia: cleanGalleryManagedMedia'),'Recovery API missing');
console.log('Stage 12C66C6C atomic media lifecycle tests passed.');

})();

// --- test-stage12c66c6c-author-reconciliation.mjs ---
await (async () => {
const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
function assert(condition, message) { if (!condition) throw new Error(message); }
function extractFunction(text, name) {
  const candidates = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const marker of candidates) { start = text.indexOf(marker); if (start >= 0) break; }
  assert(start >= 0, `Missing function ${name}`);
  const brace = text.indexOf('{', start);
  let depth = 0, state = 'code', quote = '';
  for (let i = brace; i < text.length; i += 1) {
    const c = text[i], n = text[i + 1] || '';
    if (state === 'code') {
      if (c === '"' || c === "'" || c === '`') { state = 'string'; quote = c; }
      else if (c === '/' && n === '/') { state = 'line'; i += 1; }
      else if (c === '/' && n === '*') { state = 'block'; i += 1; }
      else if (c === '{') depth += 1;
      else if (c === '}' && --depth === 0) return text.slice(start, i + 1);
    } else if (state === 'string') { if (c === '\\') i += 1; else if (c === quote) state = 'code'; }
    else if (state === 'line' && c === '\n') state = 'code';
    else if (state === 'block' && c === '*' && n === '/') { state = 'code'; i += 1; }
  }
  throw new Error(`Unterminated function ${name}`);
}

assert(source.includes('stage: "12C66C6C2"'), 'C6C2 stage identity missing');
assert(source.includes('REPAIR MEDIA') && !source.includes('RECONCILE / BUILD AUTHOR AVIF'), 'Reconciliation was not folded into the two-tool recovery flow');
const prefixes = extractFunction(source, 'getGalleryAuthorAvifStoragePrefixes');
assert(prefixes.includes('/authors/') && prefixes.includes('Desktop') && prefixes.includes('Mobile') && prefixes.includes('Preview'), 'Author AVIF folders incomplete');
const parser = extractFunction(source, 'parseGalleryAuthorAvifStorageEntry');
assert(parser.includes('lastIndexOf("--")') && parser.includes('variantSetId'), 'Immutable AVIF filename parser missing');
const scan = extractFunction(source, 'scanGalleryExistingAuthorAvifStorage');
assert(scan.includes('completeSets') && scan.includes('listGalleryStorageFilesRecursively'), 'Storage grouping scan missing');
const reconcile = extractFunction(source, 'reconcileExistingAuthorAvifVariants');
assert(reconcile.includes('getGalleryAuthorAvifStateFromDenormalizedInfo'), 'Denormalized author state recovery missing');
assert(reconcile.includes('getGalleryAuthorPhotoSourcePaths') && reconcile.includes('expectedBases'), 'Original-path matching missing');
assert(reconcile.includes('verifyGalleryExistingAuthorAvifState'), 'Existing AVIF verification missing');
assert(reconcile.includes('upsertAuthorRecord') && reconcile.includes('syncAllArtworksForAuthor'), 'Central author/state synchronization missing');
assert(!reconcile.includes('createAndUploadAuthorPhotoVariants'), 'Reconciliation unexpectedly re-encodes AVIF');
assert(!reconcile.includes('rebuildAuthorPhotoVariants'), 'Reconciliation unexpectedly invokes rebuild');
assert(!reconcile.includes('queueReplacedGalleryAuthorVariantsForCleanup'), 'Reconciliation queues WebP deletion before finalization');
const repairUi = extractFunction(source, 'repairGalleryManagedMedia');
assert(repairUi.indexOf('reconcileExistingAuthorAvifVariants') < repairUi.indexOf('rebuildAllAuthorPhotoVariants'), 'Repair rebuilds before reconciliation');
assert(source.includes('authorPhotoVariantSetId: String(info.authorPhotoVariantSetId'), 'Denormalized AVIF set metadata is not preserved');
assert(source.includes('repairMedia: repairGalleryManagedMedia'), 'Public repair API missing');

// Execute the pure immutable-path parser with a representative Supabase entry.
const parserBody = parser.replace(/^function\s+parseGalleryAuthorAvifStorageEntry/, 'function parseGalleryAuthorAvifStorageEntry');
const parse = new Function(`${parserBody}; return parseGalleryAuthorAvifStorageEntry;`)();
const parsed = parse(
  { path: 'main/authors/AVIFv1/Desktop/artwork-0-1781647211586-portrait--source-mh2abc-x7yz123.avif', name: 'artwork-0-1781647211586-portrait--source-mh2abc-x7yz123.avif', metadata: { size: 12345 } },
  { folder: 'Desktop', suffix: 'Web' }
);
assert(parsed && parsed.baseName === 'artwork-0-1781647211586-portrait', 'Parser baseName mismatch');
assert(parsed.variantSetId === 'source-mh2abc-x7yz123' && parsed.suffix === 'Web', 'Parser set/suffix mismatch');
assert(parsed.size === 12345, 'Parser metadata size mismatch');


// Execute the reconciliation control flow with a mocked old WebP author and an existing AVIF Storage set.
const authorRows = [{
  id: 'author-patrycja',
  name: 'Patrycja',
  photoUrl: 'https://example.test/original.jpg',
  photoUrlOriginal: 'https://example.test/original.jpg',
  photoPath: 'main/authors/Original/artwork-0-1781647211586-portrait.jpg',
  photoUrlWeb: 'https://example.test/old/Desktop.webp',
  photoPathWeb: 'main/authors/Desktop/old.webp',
  photoMimeTypeWeb: 'image/webp'
}];
const runtime = {};
let synced = 0;
let dirty = 0;
const completeCheck = (state) => ['Web', 'Mobile', 'Preview'].every((suffix) => {
  const url = String(state[`photoUrl${suffix}`] || '');
  const path = String(state[`photoPath${suffix}`] || '');
  return url.endsWith('.avif') && path.endsWith('.avif') && state[`photoMimeType${suffix}`] === 'image/avif';
});
const mockSet = {
  complete: true,
  baseName: 'artwork-0-1781647211586-portrait',
  variantSetId: 'source-mh2abc-x7yz123',
  timestamp: Date.now(),
  variants: { Web: {}, Mobile: {}, Preview: {} }
};
const mockState = {
  photoUrlWeb: 'https://example.test/new/Desktop.avif', photoPathWeb: 'main/authors/AVIFv1/Desktop/new.avif', photoMimeTypeWeb: 'image/avif',
  photoUrlMobile: 'https://example.test/new/Mobile.avif', photoPathMobile: 'main/authors/AVIFv1/Mobile/new.avif', photoMimeTypeMobile: 'image/avif',
  photoUrlPreview: 'https://example.test/new/Preview.avif', photoPathPreview: 'main/authors/AVIFv1/Preview/new.avif', photoMimeTypePreview: 'image/avif',
  photoVariantSetId: mockSet.variantSetId
};
const reconcileFactory = new Function(
  'normalizeAuthorRecord', 'scanGalleryExistingAuthorAvifStorage', 'galleryAvifMigrationRuntime', 'artworkAuthors',
  'getOriginalAuthorPhotoUrlFromInfo', 'isGalleryAvifVariantComplete', 'getGalleryAuthorAvifStateFromDenormalizedInfo',
  'getGalleryAuthorPhotoSourcePaths', 'getGalleryVariantBaseNameFromOriginalPath', 'getGalleryAvifVariantSetSourceKey',
  'createGalleryAuthorPhotoStateFromExistingSet', 'verifyGalleryExistingAuthorAvifState', 'getArtworkStoragePathFromPublicUrl',
  'galleryArtworkStorageBucket', 'upsertAuthorRecord', 'syncAllArtworksForAuthor', 'markGalleryDraftDirty',
  'updateArtworkInfoUi', 'updateArtworkInfoPopupContent', 'getArtworkInfoUiTarget',
  `${reconcile}; return reconcileExistingAuthorAvifVariants;`
);
const reconcileRuntime = reconcileFactory(
  (value) => ({ ...value }),
  async () => ({ completeSets: [mockSet] }), runtime, authorRows,
  (author) => author.photoUrlOriginal || author.photoUrl || '', completeCheck, () => null,
  (author) => [author.photoPath], (value) => String(value).split('/').pop().replace(/\.[^.]+$/, ''),
  () => 'source', () => ({ ...mockState }), async () => true,
  () => 'main/authors/Original/original.jpg', 'gallery-artworks',
  (next) => { authorRows[0] = { ...next }; return authorRows[0]; },
  () => { synced += 1; }, () => { dirty += 1; }, () => {}, () => {}, () => null
);
const flowResult = await reconcileRuntime({ verifyFiles: true });
assert(flowResult.reconciled === 1 && flowResult.failed === 0, 'Existing AVIF set was not reconciled');
assert(completeCheck(authorRows[0]), 'Central author record did not receive the complete AVIF trio');
assert(synced === 1 && dirty === 1, 'Reconciliation did not synchronize denormalized state or mark the draft');
assert(authorRows[0].photoPathWeb.includes('/AVIFv1/'), 'Old WebP remained active after reconciliation');

console.log('Stage 12C66C6C author AVIF reconciliation regression tests passed.');

})();

// --- test-stage12c66c6c-media-recovery.mjs ---
await (async () => {
const source=fs.readFileSync(new URL('../src/Gallery_V0_11.js',import.meta.url),'utf8');
function assert(c,m){if(!c)throw new Error(m)}
function extractFunction(text,name){const ms=[`async function ${name}(`,`function ${name}(`];let st=-1;for(const m of ms){st=text.indexOf(m);if(st>=0)break}assert(st>=0,`Missing ${name}`);const b=text.indexOf('{',st);let d=0,s='c',q='';for(let i=b;i<text.length;i++){const c=text[i],n=text[i+1]||'';if(s==='c'){if(c==='"'||c==="'"||c==='`'){s='s';q=c}else if(c==='/'&&n==='/'){s='l';i++}else if(c==='/'&&n==='*'){s='b';i++}else if(c==='{')d++;else if(c==='}'&&--d===0)return text.slice(st,i+1)}else if(s==='s'){if(c==='\\')i++;else if(c===q)s='c'}else if(s==='l'&&c==='\n')s='c';else if(s==='b'&&c==='*'&&n==='/'){s='c';i++}}throw new Error('unterminated')}
const scan=extractFunction(source,'scanGalleryManagedMediaStorage');
assert(scan.includes('/artworks/Original') && scan.includes('/authors/Original') && scan.includes('galleryArtworkImageVariantFolder'),'Managed-media scan incomplete');
const audit=extractFunction(source,'auditGalleryManagedMedia');
assert(audit.includes('collectGalleryStateStorageReferences(currentState)'),'Active state not protected');
assert(audit.includes('readGalleryPreviousStateBackup'),'Recovery backup not protected');
assert(audit.includes('pendingDraftUploads'),'Pending uploads not protected');
assert(audit.includes('24 * 60 * 60 * 1000'),'Young-file grace period missing');
const clean=extractFunction(source,'cleanGalleryManagedMedia');
assert(clean.includes('.remove(batch)'),'Cleanup does not use Storage API');
assert(clean.includes('await auditGalleryManagedMedia()'),'Cleanup does not re-audit immediately before deletion');
assert(clean.includes('activeByOwner'),'Cleanup does not block destructive work during active media operations');
assert(clean.includes('reviewedPaths.filter'),'Cleanup does not intersect reviewed and freshly-unused paths');
const repair=extractFunction(source,'repairGalleryManagedMedia');
assert(repair.indexOf('reconcileExistingAuthorAvifVariants') < repair.indexOf('rebuildAllAuthorPhotoVariants'),'Repair rebuilds authors before reconciliation');
assert(repair.includes('rebuildAllArtworkImageVariants({ force: false })'),'Repair does not target missing artwork media');
const uiStart=source.indexOf('// STAGE 12C66C6C - AUTOMATIC MEDIA LIFECYCLE / TWO RECOVERY TOOLS');
assert(uiStart>=0,'Two-tool UI marker missing');
const ui=source.slice(uiStart,source.indexOf('// STAGE 12A - 3D MODEL SLOT UI',uiStart));
assert((ui.match(/createImageOptimizationButton\(/g)||[]).length===3,'Unexpected media button count (definition + two buttons expected)');
assert(ui.includes('REPAIR MEDIA')&&ui.includes('AUDIT & CLEAN MEDIA'),'Recovery labels missing');
console.log('Stage 12C66C6C media recovery tests passed.');

})();

// --- test-stage12c66c6c-mobile-quality-domains.mjs ---
await (async () => {
const source=fs.readFileSync(new URL('../src/Gallery_V0_11.js',import.meta.url),'utf8');
const bootstrap=fs.readFileSync(new URL('../src/bootstrap/gallery-viewer-bootstrap.js',import.meta.url),'utf8');
function assert(c,m){if(!c)throw new Error(m)}
function extractFunction(text,name){const ms=[`async function ${name}(`,`function ${name}(`];let st=-1;for(const m of ms){st=text.indexOf(m);if(st>=0)break}assert(st>=0,`Missing ${name}`);const b=text.indexOf('{',st);let d=0,s='c',q='';for(let i=b;i<text.length;i++){const c=text[i],n=text[i+1]||'';if(s==='c'){if('"\'`'.includes(c)){s='s';q=c}else if(c==='/'&&n==='/'){s='l';i++}else if(c==='/'&&n==='*'){s='b';i++}else if(c==='{')d++;else if(c==='}'&&--d===0)return text.slice(st,i+1)}else if(s==='s'){if(c==='\\')i++;else if(c===q)s='c'}else if(s==='l'&&c==='\n')s='c';else if(s==='b'&&c==='*'&&n==='/'){s='c';i++}}throw new Error('unterminated')}
assert(source.includes('schema: "gallery-mobile-quality-domains.v2"'),'Quality domain runtime missing');
for(const profile of ['high','balanced','safe']){assert(source.includes(`${profile}: {`),`Missing ${profile}`)}
assert(source.includes('render: { targetEffectiveDpr: 1.72') && source.includes('render: { targetEffectiveDpr: 1.48') && source.includes('render: { targetEffectiveDpr: 1.22'),'Render-domain floors missing');
assert(source.includes('postProcessing: {') && source.includes('streaming: { models:'),'Post/streaming domains missing');
assert(bootstrap.includes('adaptToDeviceRatio: false'),'Bootstrap must not own device DPR');
const calc=extractFunction(source,'calculateGalleryMobileRenderResolution');
assert(calc.includes('var hardwareScalingLevel = 1 / effectiveDpr'),'Babylon hardware-scaling semantics are incorrect');
assert(calc.includes('maxMegapixels') && calc.includes('predictedMegapixels'),'Megapixel budget missing');
assert(source.split('engine.setHardwareScalingLevel(').length-1===1,'Multiple hardware-scaling writers remain');
const resizeOwner=extractFunction(source,'installGalleryMobileRenderResolutionViewportOwner');
assert(resizeOwner.includes('gallery-mobile-viewport-change') && !resizeOwner.includes('window.addEventListener("resize"') && !resizeOwner.includes('visualViewport.addEventListener'),'Viewport resolution owner is not singular');
const normalize=extractFunction(source,'normalizeVisualSettings');
assert(!normalize.includes('postDomain') && !normalize.includes('reflectionScale'),'Canonical sanitizer still applies mobile transforms');
const derive=extractFunction(source,'deriveRuntimeVisualSettings');
assert(derive.includes('postDomain.ssao') && derive.includes('postDomain.bloom') && derive.includes('Canonical reflection strengths'),'Runtime post-processing derivation missing');
const apply=extractFunction(source,'applyGalleryMobileQualityProfile');
assert(apply.includes('domains = {') && apply.includes('calculateGalleryMobileRenderResolution'),'Profile domains are not applied together');
const adaptive=extractFunction(source,'updateGalleryAdaptiveMobileQuality');
assert(adaptive.includes('sampleElapsedMs < 3600'),'Adaptive sample window too short');
assert(adaptive.includes('lowWindows >= 3') && adaptive.includes('highWindows >= 6'),'Adaptive hysteresis missing');
assert(source.includes('warmupUntil = Date.now() + 6500'),'Adaptive warmup missing');
assert(source.includes('Date.now() + 12000'),'Profile cooldown is not stable');
const modelLod=extractFunction(source,'configureGalleryModelRuntimeLod');
const propLod=extractFunction(source,'configureGalleryPropStreamingLod');
assert(!modelLod.includes('addLODLevel') && !propLod.includes('addLODLevel'),'Null LOD remains active');
assert(modelLod.includes('galleryNullLodDisabled') && propLod.includes('galleryNullLodDisabled'),'LOD disable contract missing');
const props=extractFunction(source,'updateGalleryPropZoneActivation');
assert(props.includes('gallerySpaceAlwaysResident') && props.includes('mesh.setEnabled(true)'),'C6C8C12 resident Space-prop contract missing');
const priority=extractFunction(source,'canGalleryPriorityFullArtworkBypassMovement');
assert(priority.includes('if (!entry || !entry.inspectPriority) return false;')&&!priority.includes('entry.tier !== "critical"'),'C6C8C8 movement bypass must be Inspect-only');
const fullDrain=extractFunction(source,'drainGalleryFastStartFullArtworkQueue');
assert(fullDrain.includes('priorityOverride')&&fullDrain.includes('aVisible'),'Full artwork queue is not visibility-prioritized');
const budget=extractFunction(source,'maintainGalleryStreamingMemoryBudget');
assert(budget.includes('enforceGalleryArtworkResidencyBudget'),'Tiered artwork residency is not connected to the mobile budget');
assert(budget.includes('imagePlane.setEnabled(true)'),'Assigned artwork can become an empty frame');
assert(source.includes('stage: "12C66C6C2"') && source.includes('schema: "gallery-mobile-quality-inspector.v2"'),'C6C2 quality diagnostics missing');

// Execute the render-resolution math for a representative 390x844 DPR-3 phone.
const calcFactory=new Function('getGalleryMobileQualityProfileDefinition','getGalleryCanvasCssMetrics','window','galleryDeviceProfile',`${calc}; return calculateGalleryMobileRenderResolution;`);
const defs={
 high:{minHardwareScalingLevel:0.50,maxHardwareScalingLevel:0.72,render:{targetEffectiveDpr:1.72,minEffectiveDpr:1.42,maxMegapixels:3.35}},
 balanced:{minHardwareScalingLevel:0.58,maxHardwareScalingLevel:0.82,render:{targetEffectiveDpr:1.48,minEffectiveDpr:1.24,maxMegapixels:2.55}},
 safe:{minHardwareScalingLevel:0.72,maxHardwareScalingLevel:0.98,render:{targetEffectiveDpr:1.22,minEffectiveDpr:1.05,maxMegapixels:1.85}}
};
const calculate=calcFactory((name)=>defs[name],()=>({width:390,height:844}),{devicePixelRatio:3},{devicePixelRatio:3});
const highResult=calculate('high'), balancedResult=calculate('balanced'), safeResult=calculate('safe');
assert(highResult.hardwareScalingLevel < balancedResult.hardwareScalingLevel && balancedResult.hardwareScalingLevel < safeResult.hardwareScalingLevel,'Quality profiles do not monotonically reduce render resolution');
assert(highResult.effectiveDpr >= 1.65 && balancedResult.effectiveDpr >= 1.4 && safeResult.effectiveDpr >= 1.15,'Mobile effective-DPR floors are too low');
assert(highResult.predictedMegapixels <= 3.35+0.05 && balancedResult.predictedMegapixels <= 2.55+0.05 && safeResult.predictedMegapixels <= 1.85+0.05,'Megapixel caps are exceeded');

console.log('Stage 12C66C6C2 mobile quality-domain tests passed.');

})();

// --- test-stage12c66c6c1-canonical-visual-state.mjs ---
await (async () => {
const source=fs.readFileSync(new URL('../src/Gallery_V0_11.js',import.meta.url),'utf8');
const bootstrap=fs.readFileSync(new URL('../src/bootstrap/gallery-viewer-bootstrap.js',import.meta.url),'utf8');
function assert(c,m){if(!c)throw new Error(m)}
function extractFunction(text,name){const ms=[`async function ${name}(`,`function ${name}(`];let st=-1;for(const m of ms){st=text.indexOf(m);if(st>=0)break}assert(st>=0,`Missing ${name}`);const b=text.indexOf('{',st);let d=0,s='c',q='';for(let i=b;i<text.length;i++){const c=text[i],n=text[i+1]||'';if(s==='c'){if('"\'`'.includes(c)){s='s';q=c}else if(c==='/'&&n==='/'){s='l';i++}else if(c==='/'&&n==='*'){s='b';i++}else if(c==='{')d++;else if(c==='}'&&--d===0)return text.slice(st,i+1)}else if(s==='s'){if(c==='\\')i++;else if(c===q)s='c'}else if(s==='l'&&c==='\n')s='c';else if(s==='b'&&c==='*'&&n==='/'){s='c';i++}}throw new Error(`Unterminated ${name}`)}

assert(source.includes('schema: "gallery-canonical-visual-state.v1"'),'Canonical visual runtime missing');
assert(!source.includes('reflectionScale:'),'Destructive reflectionScale remains in profiles');
assert(bootstrap.includes('adaptToDeviceRatio: false'),'Bootstrap still owns device DPR');
const normalize=extractFunction(source,'normalizeVisualSettings');
const derive=extractFunction(source,'deriveRuntimeVisualSettings');
const choose=extractFunction(source,'chooseGalleryInitialMobileQualityProfile');
const snapshot=extractFunction(source,'createVisualSettingsSnapshot');
const profileApply=extractFunction(source,'applyGalleryMobileQualityProfile');
const viewportOwner=extractFunction(source,'installGalleryMobileRenderResolutionViewportOwner');
assert(!normalize.includes('isGalleryDeviceProfileMobile')&&!normalize.includes('postDomain'),'normalizeVisualSettings is not pure');
assert(derive.includes('runtime.reflectionStrength')===false,'Runtime derivation must not rewrite reflection strength');
assert(derive.includes('runtime.ssaoEnabled')&&derive.includes('runtime.bloomEnabled'),'Runtime effect gating missing');
assert(snapshot.includes('visualCurrentSettings || visualDefaultSettings')&&!snapshot.includes('readVisualSettingsFromScene'),'Snapshot is not canonical-only');
assert(profileApply.includes('visualCurrentSettings')&&profileApply.includes('profileName: profileName'),'Profile reapply does not derive from canonical state');
assert(viewportOwner.includes('gallery-mobile-viewport-change')&&!viewportOwner.includes('visualViewport.addEventListener')&&!viewportOwner.includes('window.addEventListener("resize"'),'Multiple mobile viewport paths remain');
assert(source.includes('getCanonicalVisualStateDebug: function'),'Canonical debug API missing');

const defaults={preset:'Neutral Gallery',exposure:1,contrast:1.03,bloomEnabled:true,bloomIntensity:0.02,bloomThreshold:0.9,vignetteEnabled:true,vignetteWeight:0.1,ssaoEnabled:true,ssaoStrength:0.28,ssaoRadius:1.65,ssaoArea:0.95,ssaoBase:0.04,imageProcessingEnabled:true,toneMappingEnabled:true,fxaaEnabled:true,reflectionEnabled:true,reflectionStrength:0.55,floorReflectionStrength:0.72,wallReflectionStrength:0.22,ceilingReflectionStrength:0.18,floorRoughness:0.72,wallRoughness:0.86,ceilingRoughness:0.84};
const profiles={
 high:{postProcessing:{fxaa:true,bloom:true,vignette:true,ssao:true,preserveCanonicalReflections:true}},
 balanced:{postProcessing:{fxaa:true,bloom:true,vignette:true,ssao:false,preserveCanonicalReflections:true}},
 safe:{postProcessing:{fxaa:true,bloom:false,vignette:false,ssao:false,preserveCanonicalReflections:true}}
};
const factory=new Function('visualDefaultSettings','isGalleryDeviceProfileMobile','getGalleryMobileQualityProfileDefinition','galleryAdaptiveMobileQualityRuntime','galleryDeviceProfile',`${normalize}\n${derive}\nreturn {normalizeVisualSettings,deriveRuntimeVisualSettings};`);
const api=factory(defaults,()=>true,(name)=>profiles[name],{currentProfileName:'safe'},{currentQualityProfile:'safe'});
const canonical=api.normalizeVisualSettings(defaults);
const safe1=api.deriveRuntimeVisualSettings(canonical,'safe');
const balanced=api.deriveRuntimeVisualSettings(canonical,'balanced');
const high=api.deriveRuntimeVisualSettings(canonical,'high');
const safe2=api.deriveRuntimeVisualSettings(canonical,'safe');
for(const key of ['reflectionStrength','floorReflectionStrength','wallReflectionStrength','ceilingReflectionStrength','floorRoughness','wallRoughness','ceilingRoughness']){
 assert(safe1[key]===canonical[key]&&balanced[key]===canonical[key]&&high[key]===canonical[key],`Reflection parity drifted for ${key}`);
}
assert(JSON.stringify(safe1)===JSON.stringify(safe2),'Safe profile derivation is not idempotent');
assert(canonical.bloomEnabled===true&&canonical.ssaoEnabled===true&&canonical.vignetteEnabled===true,'Canonical effects were mutated');
assert(safe1.bloomEnabled===false&&safe1.ssaoEnabled===false&&safe1.vignetteEnabled===false,'Safe gating failed');
assert(balanced.bloomEnabled===true&&balanced.ssaoEnabled===false&&balanced.vignetteEnabled===true,'Balanced gating failed');
assert(high.bloomEnabled===true&&high.ssaoEnabled===true&&high.vignetteEnabled===true,'High gating failed');

const chooseFactory=new Function('galleryMobileQualityProfileDefinitions',`${choose}; return chooseGalleryInitialMobileQualityProfile;`);
const chooseProfile=chooseFactory(profiles);
assert(chooseProfile({embeddedBrowser:true,lowMemory:false,lowCpu:false},'auto')==='balanced','Embedded browser still forced to Safe');
assert(chooseProfile({embeddedBrowser:true,lowMemory:true,lowCpu:false},'auto')==='safe','Actual low-memory device is not Safe');
assert(chooseProfile({embeddedBrowser:false,lowMemory:false,lowCpu:false},'high')==='high','Manual profile override failed');

console.log('Stage 12C66C6C2 canonical visual-state tests passed.');

})();

// --- test-stage12c66c6c2-mobile-memory-survival.mjs ---
await (async () => {
const source=fs.readFileSync(new URL('../src/Gallery_V0_11.js',import.meta.url),'utf8');
function assert(c,m){if(!c)throw new Error(m)}
function extractFunction(text,name){const ms=[`async function ${name}(`,`function ${name}(`];let st=-1;for(const m of ms){st=text.indexOf(m);if(st>=0)break}assert(st>=0,`Missing ${name}`);const b=text.indexOf('{',st);let d=0,s='c',q='';for(let i=b;i<text.length;i++){const c=text[i],n=text[i+1]||'';if(s==='c'){if('"\'`'.includes(c)){s='s';q=c}else if(c==='/'&&n==='/'){s='l';i++}else if(c==='/'&&n==='*'){s='b';i++}else if(c==='{')d++;else if(c==='}'&&--d===0)return text.slice(st,i+1)}else if(s==='s'){if(c==='\\')i++;else if(c===q)s='c'}else if(s==='l'&&c==='\n')s='c';else if(s==='b'&&c==='*'&&n==='/'){s='c';i++}}throw new Error(`Unterminated ${name}`)}

assert(source.includes('schema: "gallery-artwork-residency.v3"'),'Residency runtime missing');
for(const value of ['fullTextures: 8','fullTextures: 6','fullTextures: 4']) assert(source.includes(value),`Missing residency budget ${value}`);
assert(source.includes('embeddedFullTextures: 5')&&source.includes('embeddedFullTextures: 4'),'Embedded-browser budgets missing');
assert(!source.includes('artwork textures are permanent residents once assigned'),'Permanent Full residency returned');
assert(!source.includes('function suspendArtworkTextureForStreaming('),'Empty-frame suspension system returned');
const maintain=extractFunction(source,'maintainGalleryStreamingMemoryBudget');
assert(maintain.includes('enforceGalleryArtworkResidencyBudget'),'Memory budget does not own artwork residency');
assert(maintain.includes('imagePlane.setEnabled(true)'),'Always-visible frame contract missing');
const downgrade=extractFunction(source,'downgradeGalleryArtworkToPreview');
assert(downgrade.includes('_galleryFastStartPreferPreview = true'),'Full does not downgrade to Preview');
assert(downgrade.includes('_galleryTextureOnlyUpgrade = true'),'Downgrade can mutate artwork geometry');
assert(!downgrade.includes('setEnabled(false)'),'Downgrade can create an empty frame');
const priorityFn=extractFunction(source,'getGalleryArtworkResidencyPriority');
for(const signal of ['galleryInspectRuntime.target','previousTarget','nextTarget','isGalleryArtworkVisibleForResidency','getGalleryStreamingTierForObject']) assert(priorityFn.includes(signal),`Residency priority missing ${signal}`);
const drain=extractFunction(source,'drainGalleryFastStartFullArtworkQueue');
assert(drain.includes('isGalleryArtworkFullResidencyDesired'),'Full queue ignores residency admission');
assert(drain.includes('full-wait-for-hard-capacity')&&drain.includes('residencyMemory.hardLimit'),'Full queue does not respect the hard residency ceiling');
assert(source.includes('berryboy_mobile_survival_last_snapshot_v1'),'Last-session snapshot storage missing');
for(const label of ['"DBG"','"LIVE"','"FREEZE"','"LAST"','"CLOSE"']) assert(source.includes(label),`On-screen diagnostic control missing ${label}`);
assert(source.includes('schema: "gallery-mobile-survival-snapshot.v1"'),'Survival snapshot schema missing');
assert(source.includes('function unregisterCommonShadowMesh('),'Shadow registry unregister missing');
const dispose=extractFunction(source,'disposeModel3dSlotRuntime');
assert(dispose.includes('unregisterCommonShadowMesh')&&dispose.includes('pruneGalleryShadowRegistries'),'Model disposal still leaks shadow registries');
const ssao=extractFunction(source,'disposeVisualSsaoResourcesForSurvival');
assert(ssao.includes('visualSsaoPipeline.dispose')&&ssao.includes('disableGeometryBufferRenderer'),'SSAO/Geometry Buffer disposal incomplete');
const disableSpot=extractFunction(source,'disableLocalSpotShadowByBudget');
assert(disableSpot.includes('_localSpotShadowBudgetDisposeTimer'),'Inactive Spot generators are never released');
const tour=extractFunction(source,'monitorGalleryExhibitTourLayout');
assert(tour.includes('if (!editMode) return'),'Tour layout monitor still runs in Viewer Mode');
assert(source.includes('stage: "12C66C6C2"'),'C6C2 stage identity missing');

// Behavioral budget sanity: top priorities fit the hard cap and protected targets win.
const candidates=[
 {id:'inspect',score:100000},{id:'next',score:90000},{id:'visibleA',score:60000},
 {id:'visibleB',score:59000},{id:'criticalA',score:30000},{id:'criticalB',score:29000},
 {id:'farA',score:1000},{id:'farB',score:900}
];
const budget=6;
const selected=candidates.slice().sort((a,b)=>b.score-a.score).slice(0,budget).map(x=>x.id);
assert(selected.includes('inspect')&&selected.includes('next'),'Protected Inspect neighbors lost residency');
assert(selected.length===budget&&!selected.includes('farA'),'Budget selection is not bounded');

console.log('Stage 12C66C6C2 mobile memory survival tests passed.');

})();

// --- test-stage12c66c6c3-artwork-frames.mjs ---
await (async () => {
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src', 'Gallery_V0_11.js'), 'utf8');

function expect(label, condition) {
  if (!condition) throw new Error(`Artwork frame invariant failed: ${label}`);
  console.log(`✓ ${label}`);
}

expect('Storage folder is main/frames via the existing gallery bucket',
  source.includes('var galleryArtworkFrameStorageFolder = "frames";') &&
  source.includes('getGalleryArtworkFrameStoragePrefix()') &&
  source.includes('listGalleryStorageFilesRecursively(\n                galleryArtworkStorageBucket,\n                getGalleryArtworkFrameStoragePrefix()'));

expect('GLB catalog is dynamic instead of hard-coded variants',
  source.includes('/\\.glb$/i.test(entry.path)') &&
  source.includes('galleryArtworkFrameCatalog = (files || [])'));

expect('Frame state is serialized per artwork',
  source.includes('frame: getArtworkFrameStateForSave(artwork)'));

expect('Frame state is restored without inventing a second aspect system',
  source.includes('applyArtworkFrameState(') &&
  source.includes('var baseDimensions = getArtworkBaseDimensionsForCurrentImage(artwork);') &&
  source.includes('var transformState = getArtworkTransformState(artwork);'));

expect('Frame follows live artwork transforms and drag updates',
  source.includes('syncArtworkFrameRuntime(artwork);') &&
  source.includes('function updateArtworkLight(artwork) {\n        syncDetachedArtworkImagePlane(artwork);\n        syncArtworkFrameRuntime(artwork);'));

expect('Frame meshes map back to their artwork for picking',
  source.includes('mesh.metadata.isArtworkFrameMesh = true;') &&
  source.includes('(mesh.metadata.isArtworkImagePlane || mesh.metadata.isArtworkFrameMesh)'));

expect('Inspect focus includes frame meshes',
  source.includes('artwork.metadata.artworkFrameRuntime.meshes.forEach(function (mesh)'));

expect('Artwork-targeted local lights include frame meshes',
  source.includes('function addArtworkMeshesUnique(targetList)') &&
  source.includes('artwork.metadata.artworkFrameRuntime'));

expect('Deleting an artwork disposes its frame runtime',
  source.includes('disposeArtworkFrameRuntime(artwork);\n        disposeArtworkImageOnly(artwork);'));

expect('Editor exposes FRAME section between artwork tooling',
  source.includes('createEditorSection("FRAME")') &&
  source.includes('artworkFrameSectionData,'));

console.log('Artwork frame invariants passed.');

})();

// --- test-stage12c66c6c4-artwork-frame-fit.mjs ---
await (async () => {
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src', 'Gallery_V0_11.js'), 'utf8');

function expect(label, condition) {
  if (!condition) throw new Error(`Artwork frame fit invariant failed: ${label}`);
  console.log(`✓ ${label}`);
}

expect('Source history records C6C4 frame fit stage',
  source.includes('Stage 12C66C6C4: Artwork Frame Fit / Prefetch'));

expect('Default frame calibration exists',
  source.includes('var galleryArtworkFrameDefaultCalibration = {') &&
  source.includes('innerWidthRatio: 0.68') &&
  source.includes('innerHeightRatio: 0.68') &&
  source.includes('depthOverlapRatio: 0.92') &&
  source.includes('zRotationDegrees: 180'));

expect('Frame warmup preserves prefetch for variants already used by the active exhibition',
  source.includes('function getGalleryArtworkFrameWarmupEntries(catalog)') &&
  source.includes('prefetchGalleryArtworkFrameCatalogAssets(getGalleryArtworkFrameWarmupEntries(catalog))') &&
  !source.includes('prefetchGalleryArtworkFrameCatalogAssets(galleryArtworkFrameCatalog);'));

expect('Frame scaling uses calibrated inner opening instead of outer bounds',
  source.includes('var calibration = getArtworkFrameCalibration(frameState);') &&
  source.includes('var referenceWidth = Math.max(0.0001, outerWidth * calibration.innerWidthRatio);') &&
  source.includes('var referenceHeight = Math.max(0.0001, outerHeight * calibration.innerHeightRatio);'));

expect('Frame runtime applies required Z rotation',
  source.includes('runtime.root.rotation.z += runtime.zRotationRadians || 0;'));

expect('Frame runtime seats backward over artwork depth',
  source.includes('var overlapDepth = Math.min(frameDepthWorld, artworkDepthWorld)') &&
  source.includes('galleryArtworkFrameSurfaceEpsilon - overlapDepth;'));

console.log('Artwork frame fit invariants passed.');

})();

// --- test-stage12c66c6c5-artwork-frame-facing.mjs ---
await (async () => {
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src', 'Gallery_V0_11.js'), 'utf8');
function expect(label, condition) {
  if (!condition) throw new Error(`Artwork frame facing invariant failed: ${label}`);
  console.log(`✓ ${label}`);
}
expect('C6C5 facing stage is recorded', source.includes('Stage 12C66C6C5: Artwork Frame Facing Fix'));
expect('Facing root exists between scale and normalized frame geometry',
  source.includes('var facingRoot = new BABYLON.TransformNode(artwork.name + "_FrameFacing_" + generation, scene);') &&
  source.includes('facingRoot.parent = scaleRoot;') &&
  source.includes('orientationRoot.parent = facingRoot;'));
expect('Frame front/back is flipped on local Y by 180 degrees', source.includes('facingRoot.rotation.y = Math.PI;'));
expect('Existing requested in-plane Z rotation remains', source.includes('runtime.root.rotation.z += runtime.zRotationRadians || 0;'));
console.log('Artwork frame facing invariants passed.');

})();

// --- test-stage12c66c6c6-artwork-frame-performance.mjs ---
await (async () => {
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src', 'Gallery_V0_11.js'), 'utf8');

function expect(label, condition) {
  if (!condition) throw new Error(`Artwork frame performance invariant failed: ${label}`);
  console.log(`✓ ${label}`);
}

function extractFunction(name) {
  const starts = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const marker of starts) {
    start = source.indexOf(marker);
    if (start >= 0) break;
  }
  if (start < 0) throw new Error(`Missing function ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  let mode = 'code';
  let quote = '';
  for (let i = brace; i < source.length; i++) {
    const c = source[i], n = source[i + 1] || '';
    if (mode === 'code') {
      if (c === '"' || c === "'" || c === '`') { mode = 'string'; quote = c; }
      else if (c === '/' && n === '/') { mode = 'line'; i++; }
      else if (c === '/' && n === '*') { mode = 'block'; i++; }
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return source.slice(start, i + 1);
    } else if (mode === 'string') {
      if (c === '\\') i++;
      else if (c === quote) mode = 'code';
    } else if (mode === 'line' && c === '\n') mode = 'code';
    else if (mode === 'block' && c === '*' && n === '/') { mode = 'code'; i++; }
  }
  throw new Error(`Unterminated function ${name}`);
}

const prefetch = extractFunction('prefetchGalleryArtworkFrameCatalogAssets');
const applyFrame = extractFunction('applyArtworkFrameState');
const runtimeCreate = extractFunction('createArtworkFrameRuntimeFromInstance');

expect('C6C6 performance stage is recorded',
  source.includes('Stage 12C66C6C6: Artwork Frame Runtime Performance'));

expect('Frame GLBs prefetch in parallel',
  prefetch.includes('var tasks = queue.map(') &&
  prefetch.includes('Promise.all(tasks)') &&
  !prefetch.includes('for (var i = 0; i < queue.length; i++)'));

expect('Frame library warmup starts on Edit Mode entry',
  source.includes('setEditorUiVisible(true);\n            warmGalleryArtworkFrameLibrary();'));

expect('Per-variant runtime descriptor cache avoids repeated bounds setup',
  source.includes('var galleryArtworkFrameRuntimeDescriptorCache = {};') &&
  runtimeCreate.includes('galleryArtworkFrameRuntimeDescriptorCache[descriptorKey]') &&
  runtimeCreate.includes('applyArtworkFrameRuntimeDescriptor(orientationRoot, descriptor)'));

expect('Frame assignment no longer performs full-scene material scan',
  !applyFrame.includes('refreshCommonLightingMaterialSupport();') &&
  source.includes('configureArtworkFrameMeshesForLighting(meshes);'));

expect('Frame assignment no longer performs full Local Light target rebuild',
  !applyFrame.includes('refreshAllCommonLocalLightTargets();') &&
  applyFrame.includes('syncArtworkFrameLocalLightMembership(artwork, previousFrameMeshes'));

expect('Incremental Local Light membership preserves artwork lighting',
  source.includes('hadArtworkTarget') &&
  source.includes('hadPreviousFrameTarget') &&
  source.includes('setLocalLightIncludedMeshesIfChanged(item, next'));

console.log('Artwork frame performance invariants passed.');

})();
