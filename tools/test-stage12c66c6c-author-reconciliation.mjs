import fs from 'node:fs';

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

assert(source.includes('stage: "12C66C6C1"'), 'C6C1 stage identity missing');
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
