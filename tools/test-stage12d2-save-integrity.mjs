import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');

function extractFunction(text, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const marker of markers) { start = text.indexOf(marker); if (start >= 0) break; }
  assert.ok(start >= 0, `Missing function ${name}`);
  const brace = text.indexOf('{', start);
  let depth = 0, state = 'code', quote = null;
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

const saveDraftFunction = extractFunction(source, 'saveGalleryDraftToSupabase');
assert.ok(saveDraftFunction.includes('galleryExhibitionStateRepository.saveDraft'), 'Save Draft must use D2 repository');
assert.ok(!saveDraftFunction.includes('published_state'), 'Save Draft must not write published state');
assert.ok(!source.includes('writeGalleryRemotePreviousStateBackup'), 'Legacy remote backup writer must be physically removed');
assert.ok(!source.includes('.from("gallery_state")'), 'Active runtime must not access legacy gallery_state directly');

const functionNames = [
  'cloneGalleryStateForIntegrity',
  'getGalleryQueueEntryKey',
  'readGalleryActiveEditorTabs',
  'isGalleryEditorTabActive',
  'isGalleryForeignQueueEntryProtected',
  'persistGalleryPendingStorageCleanupQueue',
  'restoreGalleryPendingStorageCleanupQueue',
  'collectGalleryStateStorageReferences',
  'processGalleryDeferredStorageCleanup'
];

function createHarness({ deletable = [], referenceError = false, storageError = false } = {}) {
  const storage = new Map();
  const calls = [];
  const runtime = {
    tabId: 'tab-current', activeTabsStorageKey: 'active-tabs', heartbeatStaleMs: 120000,
    backgroundTabGraceMs: 86400000, foreignDraftGraceMs: 86400000,
    resolvedCleanupKeys: {}, pendingStorageDeletes: [], cleanupFailures: [],
    pendingCleanupStorageKey: 'cleanup'
  };
  const context = {
    console: { warn() {}, log() {}, error() {} }, Date, Math, JSON,
    localStorage: {
      setItem(key, value) { storage.set(key, String(value)); },
      getItem(key) { return storage.get(key) ?? null; },
      removeItem(key) { storage.delete(key); }
    },
    window: {
      gallerySupabase: {
        storage: {
          from(bucket) {
            return {
              async remove(paths) {
                calls.push({ type: 'remove', bucket, paths: [...paths] });
                return storageError ? { error: { message: 'storage failed' } } : { error: null };
              }
            };
          }
        }
      }
    },
    galleryArtworkStorageBucket: 'platform-media',
    gallerySaveIntegrityRuntime: runtime,
    galleryMediaRepository: {
      async filterDeletablePaths(bucket, paths) {
        calls.push({ type: 'filter', bucket, paths: [...paths] });
        if (referenceError) return { ok: false, reason: 'reference-check-error', deletable: [], protected: paths };
        const allowed = paths.filter((path) => deletable.includes(path));
        return { ok: true, deletable: allowed, protected: paths.filter((path) => !allowed.includes(path)) };
      },
      async confirmDeletedPaths(bucket, paths) {
        calls.push({ type: 'confirm', bucket, paths: [...paths] });
        return { ok: true, count: paths.length };
      }
    },
    clearModel3dClipboardIfStoragePathMatches() {},
    dispatchGalleryDraftState() {}
  };
  vm.createContext(context);
  vm.runInContext(functionNames.map((name) => extractFunction(source, name)).join('\n\n'), context);
  return { context, runtime, storage, calls };
}

// Shared media stays queued; only globally unreferenced path is removed and confirmed.
{
  const { context, runtime, calls } = createHarness({ deletable: ['exhibitions/e1/artworks/a/m1/original/old.jpg'] });
  runtime.pendingStorageDeletes = [
    { bucket: 'platform-media', path: 'exhibitions/e1/artworks/a/m1/original/old.jpg', kind: 'artwork-image' },
    { bucket: 'platform-media', path: 'media-library/shared/preview.avif', kind: 'artwork-image' }
  ];
  context.persistGalleryPendingStorageCleanupQueue();
  const result = await context.processGalleryDeferredStorageCleanup({ editor: {} }, null);
  assert.equal(result.removed, 1);
  assert.equal(result.protectedByGlobalReferences, 1);
  assert.equal(runtime.pendingStorageDeletes.length, 1);
  assert.equal(runtime.pendingStorageDeletes[0].path, 'media-library/shared/preview.avif');
  assert.deepEqual(calls.map((call) => call.type), ['filter', 'remove', 'confirm']);
}

// Reference-check failure is fail-closed: nothing is removed.
{
  const { context, runtime, calls } = createHarness({ referenceError: true });
  runtime.pendingStorageDeletes = [{ bucket: 'platform-media', path: 'exhibitions/e1/orphan.glb', kind: 'model3d' }];
  context.persistGalleryPendingStorageCleanupQueue();
  const result = await context.processGalleryDeferredStorageCleanup({ editor: {} }, null);
  assert.equal(result.removed, 0);
  assert.equal(result.referenceCheckFailures, 1);
  assert.equal(runtime.pendingStorageDeletes.length, 1);
  assert.equal(calls.some((call) => call.type === 'remove'), false);
}

// Current draft and previous snapshot remain protected before the global query.
{
  const { context, runtime, calls } = createHarness({ deletable: ['current.jpg', 'previous.jpg'] });
  runtime.pendingStorageDeletes = [
    { bucket: 'platform-media', path: 'current.jpg', kind: 'artwork-image' },
    { bucket: 'platform-media', path: 'previous.jpg', kind: 'artwork-image' }
  ];
  context.persistGalleryPendingStorageCleanupQueue();
  const current = { image: { storageBucket: 'platform-media', imagePath: 'current.jpg' } };
  const previous = { image: { storageBucket: 'platform-media', imagePath: 'previous.jpg' } };
  const result = await context.processGalleryDeferredStorageCleanup(current, previous);
  assert.equal(result.skippedActive, 1);
  assert.equal(result.protectedByPreviousBackup, 1);
  assert.equal(calls.some((call) => call.type === 'filter'), false);
}

console.log('Stage 12D2 Save Integrity tests passed.');
