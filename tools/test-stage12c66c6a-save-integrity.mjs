import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');

function extractFunction(text, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const marker of markers) {
    start = text.indexOf(marker);
    if (start >= 0) break;
  }
  assert.ok(start >= 0, `Missing function ${name}`);
  const brace = text.indexOf('{', start);
  let depth = 0;
  let state = 'code';
  let quote = null;
  for (let i = brace; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1] || '';
    if (state === 'code') {
      if (char === '"' || char === "'" || char === '`') { state = 'string'; quote = char; }
      else if (char === '/' && next === '/') { state = 'line'; i += 1; }
      else if (char === '/' && next === '*') { state = 'block'; i += 1; }
      else if (char === '{') depth += 1;
      else if (char === '}') { depth -= 1; if (depth === 0) return text.slice(start, i + 1); }
    } else if (state === 'string') {
      if (char === '\\') i += 1;
      else if (char === quote) { state = 'code'; quote = null; }
    } else if (state === 'line') {
      if (char === '\n') state = 'code';
    } else if (state === 'block') {
      if (char === '*' && next === '/') { state = 'code'; i += 1; }
    }
  }
  throw new Error(`Unterminated function ${name}`);
}

const functionNames = [
  'cloneGalleryStateForIntegrity',
  'createGalleryComparableState',
  'createGalleryCanonicalFingerprintValue',
  'getGalleryStateIntegrityFingerprint',
  'getGalleryStateRevision',
  'dispatchGalleryDraftState',
  'getGalleryQueueEntryKey',
  'readGalleryActiveEditorTabs',
  'isGalleryEditorTabActive',
  'isGalleryForeignQueueEntryProtected',
  'persistGalleryPendingStorageCleanupQueue',
  'restoreGalleryPendingStorageCleanupQueue',
  'persistGalleryPendingDraftUploads',
  'restoreGalleryPendingDraftUploads',
  'registerGalleryPendingDraftUpload',
  'queueGalleryStorageCleanupPaths',
  'collectGalleryStateStorageReferences',
  'reconcileGalleryPendingDraftUploads',
  'processGalleryDeferredStorageCleanup',
  'setGalleryPublishedStateBaseline',
  'checkGalleryDraftStateNow',
  'persistGalleryPreviousStateBackup',
  'writeGalleryRemotePreviousStateBackup',
  'saveGalleryStateToSupabase'
];

function createHarness({
  serverState = null,
  backupExists = false,
  selectMainError = null,
  backupReadError = null,
  backupWriteError = null,
  mainWriteError = null,
  cleanupError = null,
  mainCommitEmpty = false
} = {}) {
  const calls = [];
  const messages = [];
  const storage = new Map();
  const draftState = {
    version: 'test',
    editor: {
      artworks: [{ image: { storageBucket: 'gallery-artworks', imagePath: 'main/new.jpg' } }]
    },
    localLights: { lights: [] }
  };

  function tableApi() {
    return {
      select(fields) {
        const query = {
          id: null,
          eq(_column, value) { query.id = value; return query; },
          order() { return query; },
          async limit() {
            if (query.id === 'main_previous') {
              calls.push('select-backup');
              if (backupReadError) return { data: null, error: backupReadError };
              return backupExists
                ? { data: [{ id: 'main_previous', updated_at: '2026-07-22T10:00:00Z' }], error: null }
                : { data: [], error: null };
            }
            calls.push('select-main');
            if (selectMainError) return { data: null, error: selectMainError };
            return serverState
              ? { data: [{ state: serverState, updated_at: '2026-07-23T10:00:00Z' }], error: null }
              : { data: [], error: null };
          }
        };
        return query;
      },
      update(_payload) {
        const query = {
          id: null,
          eq(_column, value) { query.id = value; return query; },
          is() { return query; },
          async select() {
            if (query.id === 'main_previous') {
              calls.push('update-backup');
              return backupWriteError
                ? { data: null, error: backupWriteError }
                : { data: [{ id: 'main_previous' }], error: null };
            }
            calls.push('update-main');
            if (mainWriteError) return { data: null, error: mainWriteError };
            return { data: mainCommitEmpty ? [] : [{ id: 'main' }], error: null };
          }
        };
        return query;
      },
      insert(payload) {
        return {
          async select() {
            if (payload.id === 'main_previous') {
              calls.push('insert-backup');
              return backupWriteError
                ? { data: null, error: backupWriteError }
                : { data: [{ id: 'main_previous' }], error: null };
            }
            calls.push('insert-main');
            if (mainWriteError) return { data: null, error: mainWriteError };
            return { data: mainCommitEmpty ? [] : [{ id: 'main' }], error: null };
          }
        };
      }
    };
  }

  const client = {
    from(table) {
      assert.equal(table, 'gallery_state');
      return tableApi();
    },
    storage: {
      from(bucket) {
        return {
          async remove(paths) {
            calls.push(`remove-${bucket}:${paths.join(',')}`);
            return cleanupError ? { error: cleanupError } : { error: null, data: paths };
          }
        };
      }
    }
  };

  const runtime = {
    stage: '12C66C6A', schema: 'gallery-save-integrity.v3', sessionId: 'test-session',
    tabId: 'tab-current', activeTabsStorageKey: 'active-tabs', heartbeatStaleMs: 120000,
    backgroundTabGraceMs: 86400000, foreignDraftGraceMs: 86400000,
    resolvedCleanupKeys: {}, resolvedDraftUploadKeys: {},
    publishedRevision: serverState?.saveIntegrity?.revision || 0,
    publishedStateFingerprint: '', publishedServerStateFingerprint: '',
    publishedStateSnapshot: serverState ? JSON.parse(JSON.stringify(serverState)) : null,
    publishedServerRowExists: !!serverState, publishedStateConfirmed: true,
    baselineReady: true, dirty: true, dirtyReason: 'test', dirtySince: Date.now(),
    lastStateCheckAt: 0, stateCheckTimer: null, stateCheckIntervalMs: 5000,
    stateWatcherStarted: true, saveInFlight: false,
    pendingStorageDeletes: [], pendingDraftUploads: [], cleanupFailures: [],
    remoteBackupId: 'main_previous', localBackupStorageKey: 'backup',
    pendingCleanupStorageKey: 'cleanup', pendingDraftUploadStorageKey: 'draft-uploads',
    latestSaveResult: null
  };

  const context = {
    console: { log: console.log.bind(console), error: console.error.bind(console), warn() {} },
    Date, Math, JSON,
    setTimeout: () => 0,
    clearTimeout: () => {},
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    localStorage: {
      setItem(key, value) { storage.set(key, String(value)); },
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      removeItem(key) { storage.delete(key); }
    },
    window: { gallerySupabase: client, dispatchEvent() {} },
    globalThis: {},
    galleryArtworkStorageBucket: 'gallery-artworks',
    galleryEditorLoginEnabled: true,
    editorAuthenticated: true,
    editMode: true,
    galleryFastStartRuntime: { stateApplyActive: false },
    gallerySaveIntegrityRuntime: runtime,
    serializeGalleryState() { return JSON.parse(JSON.stringify(draftState)); },
    notifyGalleryStatus(message) { messages.push(message); },
    clearModel3dClipboardIfStoragePathMatches() {},
    startGalleryDraftStateWatcher() {}
  };

  vm.createContext(context);
  vm.runInContext(functionNames.map((name) => extractFunction(source, name)).join('\n\n'), context);

  if (serverState) {
    runtime.publishedServerStateFingerprint = context.getGalleryStateIntegrityFingerprint(serverState);
    runtime.publishedStateFingerprint = context.getGalleryStateIntegrityFingerprint(draftState);
  }

  function syncQueues() {
    storage.set(runtime.pendingCleanupStorageKey, JSON.stringify(runtime.pendingStorageDeletes));
    storage.set(runtime.pendingDraftUploadStorageKey, JSON.stringify(runtime.pendingDraftUploads));
  }

  return { context, calls, messages, storage, draftState, runtime, syncQueues };
}

// Previous revision asset remains queued and is not deleted after the save that creates main_previous.
{
  const serverState = {
    version: 'test',
    editor: { artworks: [{ image: { storageBucket: 'gallery-artworks', imagePath: 'main/old.jpg' } }] },
    localLights: { lights: [] },
    saveIntegrity: { revision: 4 }
  };
  const { context, calls, runtime, syncQueues } = createHarness({ serverState });
  runtime.pendingStorageDeletes = [
    { bucket: 'gallery-artworks', path: 'main/old.jpg', kind: 'artwork-image', reason: 'replacement' }
  ];
  syncQueues();
  const ok = await context.saveGalleryStateToSupabase();
  assert.equal(ok, true);
  assert.deepEqual(calls, ['select-main', 'select-backup', 'insert-backup', 'update-main']);
  assert.equal(runtime.publishedRevision, 5);
  assert.equal(runtime.pendingStorageDeletes.length, 1);
  assert.equal(runtime.latestSaveResult.cleanup.protectedByPreviousBackup, 1);
}

// Once the backup rotates away from the old path, the queued file can be removed.
{
  const { context, calls, runtime, syncQueues } = createHarness();
  runtime.pendingStorageDeletes = [
    { bucket: 'gallery-artworks', path: 'main/old.jpg', kind: 'artwork-image' }
  ];
  syncQueues();
  const current = { editor: { artworks: [{ image: { storageBucket: 'gallery-artworks', imagePath: 'main/new.jpg' } }] } };
  const previous = { editor: { artworks: [{ image: { storageBucket: 'gallery-artworks', imagePath: 'main/other.jpg' } }] } };
  const result = await context.processGalleryDeferredStorageCleanup(current, previous);
  assert.equal(result.removed, 1);
  assert.deepEqual(calls, ['remove-gallery-artworks:main/old.jpg']);
  assert.equal(runtime.pendingStorageDeletes.length, 0);
}

// A queued path used by the current publication cancels deletion completely.
{
  const { context, calls, runtime, draftState, syncQueues } = createHarness();
  runtime.pendingStorageDeletes = [
    { bucket: 'gallery-artworks', path: 'main/new.jpg', kind: 'artwork-image' }
  ];
  syncQueues();
  const result = await context.processGalleryDeferredStorageCleanup(draftState, null);
  assert.equal(result.skippedActive, 1);
  assert.equal(calls.some((call) => call.startsWith('remove-')), false);
  assert.equal(runtime.pendingStorageDeletes.length, 0);
}

// Draft upload registry commits referenced files and queues abandoned files.
{
  const { context, runtime, draftState } = createHarness();
  context.registerGalleryPendingDraftUpload('gallery-artworks', 'main/new.jpg', 'artwork-original');
  context.registerGalleryPendingDraftUpload('gallery-artworks', 'main/orphan.jpg', 'artwork-original');
  const result = context.reconcileGalleryPendingDraftUploads(draftState, {
    queueUnreferenced: true,
    reason: 'test-orphan'
  });
  assert.equal(result.committed, 1);
  assert.equal(result.queuedOrphans, 1);
  assert.equal(result.retained, 0);
  assert.equal(runtime.pendingDraftUploads.length, 0);
  assert.equal(runtime.pendingStorageDeletes.length, 1);
  assert.equal(runtime.pendingStorageDeletes[0].path, 'main/orphan.jpg');
}

// Existing remote backup is updated; no upsert or delete fallback exists.
{
  const state = { editor: {}, localLights: { lights: [] } };
  const { context, calls } = createHarness({ backupExists: true });
  const result = await context.writeGalleryRemotePreviousStateBackup(context.window.gallerySupabase, state);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'update');
  assert.deepEqual(calls, ['select-backup', 'update-backup']);
}

// Failed main save never starts Storage cleanup.
{
  const serverState = {
    version: 'test', editor: {}, localLights: { lights: [] }, saveIntegrity: { revision: 2 }
  };
  const { context, calls, runtime, syncQueues } = createHarness({ serverState, mainWriteError: { message: 'network' } });
  runtime.pendingStorageDeletes = [
    { bucket: 'gallery-artworks', path: 'main/old.jpg', kind: 'artwork-image' }
  ];
  syncQueues();
  const ok = await context.saveGalleryStateToSupabase();
  assert.equal(ok, false);
  assert.equal(calls.some((call) => call.startsWith('remove-')), false);
  assert.equal(runtime.pendingStorageDeletes.length, 1);
}

// Failure to read current main state stops before backup, commit and cleanup.
{
  const baseline = { version: 'test', editor: {}, localLights: { lights: [] }, saveIntegrity: { revision: 3 } };
  const { context, calls, runtime } = createHarness({ serverState: baseline, selectMainError: { message: 'offline' } });
  const ok = await context.saveGalleryStateToSupabase();
  assert.equal(ok, false);
  assert.deepEqual(calls, ['select-main']);
  assert.equal(runtime.latestSaveResult.reason, 'pre-save-read-error');
}

// First publication uses insert and cleanup only after the row exists.
{
  const { context, calls, runtime, syncQueues } = createHarness();
  runtime.pendingStorageDeletes = [
    { bucket: 'gallery-artworks', path: 'main/unused.jpg', kind: 'artwork-image' }
  ];
  syncQueues();
  const ok = await context.saveGalleryStateToSupabase();
  assert.equal(ok, true);
  assert.deepEqual(calls, ['select-main', 'insert-main', 'remove-gallery-artworks:main/unused.jpg']);
  assert.equal(runtime.publishedRevision, 1);
}

// Canonical fingerprints ignore object-key order.
{
  const { context } = createHarness();
  const left = { editor: { z: 1, a: { y: 2, x: 3 } }, localLights: { lights: [] } };
  const right = { localLights: { lights: [] }, editor: { a: { x: 3, y: 2 }, z: 1 } };
  assert.equal(context.getGalleryStateIntegrityFingerprint(left), context.getGalleryStateIntegrityFingerprint(right));
}

console.log('Stage 12C66C6A save-integrity repair tests passed.');
