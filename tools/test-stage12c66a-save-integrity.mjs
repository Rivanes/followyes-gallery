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
  'persistGalleryPendingStorageCleanupQueue',
  'restoreGalleryPendingStorageCleanupQueue',
  'collectGalleryStateStorageReferences',
  'processGalleryDeferredStorageCleanup',
  'setGalleryPublishedStateBaseline',
  'checkGalleryDraftStateNow',
  'persistGalleryPreviousStateBackup',
  'writeGalleryRemotePreviousStateBackup',
  'saveGalleryStateToSupabase'
];

function createHarness({ serverState, mainUpsertError = null, selectError = null, cleanupError = null, mainCommitEmpty = false } = {}) {
  const calls = [];
  const messages = [];
  const storage = new Map();
  const draftState = {
    version: 'test',
    savedAt: 'volatile',
    editor: {
      artworks: [{ image: { storageBucket: 'gallery-artworks', imagePath: 'main/new.jpg' } }]
    },
    localLights: { lights: [] }
  };

  const client = {
    from(table) {
      assert.equal(table, 'gallery_state');
      return {
        select() {
          return {
            eq() {
              return {
                order() {
                  return {
                    async limit() {
                      calls.push('select-main');
                      if (selectError) return { data: null, error: selectError };
                      return serverState
                        ? { data: [{ state: serverState, updated_at: '2026-07-23T10:00:00Z' }], error: null }
                        : { data: [], error: null };
                    }
                  };
                }
              };
            }
          };
        },
        async upsert(payload) {
          calls.push(`upsert-${payload.id}`);
          return { data: [{ id: payload.id }], error: null };
        },
        update(payload) {
          calls.push('update-main');
          const query = {
            eq() { return query; },
            is() { return query; },
            async select() {
              if (mainUpsertError) return { data: null, error: mainUpsertError };
              return { data: mainCommitEmpty ? [] : [{ id: 'main' }], error: null };
            }
          };
          return query;
        },
        insert(payload) {
          calls.push('insert-main');
          return {
            async select() {
              if (mainUpsertError) return { data: null, error: mainUpsertError };
              return { data: mainCommitEmpty ? [] : [{ id: payload.id }], error: null };
            }
          };
        }
      };
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

  const context = {
    console: {
      log: console.log.bind(console),
      error: console.error.bind(console),
      warn() {}
    },
    Date,
    Math,
    JSON,
    setTimeout: () => 0,
    clearTimeout: () => {},
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    localStorage: {
      setItem(key, value) { storage.set(key, String(value)); },
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      removeItem(key) { storage.delete(key); }
    },
    window: {
      gallerySupabase: client,
      dispatchEvent() {}
    },
    globalThis: {},
    galleryArtworkStorageBucket: 'gallery-artworks',
    galleryEditorLoginEnabled: true,
    editorAuthenticated: true,
    editMode: true,
    galleryFastStartRuntime: { stateApplyActive: false },
    gallerySaveIntegrityRuntime: {
      stage: '12C66A', schema: 'gallery-save-integrity.v1', sessionId: 'test-session',
      publishedRevision: serverState?.saveIntegrity?.revision || 0,
      publishedStateFingerprint: '',
      publishedServerStateFingerprint: '',
      publishedStateSnapshot: serverState ? JSON.parse(JSON.stringify(serverState)) : null,
      publishedServerRowExists: !!serverState,
      publishedStateConfirmed: true,
      baselineReady: true,
      dirty: true,
      dirtyReason: 'test', dirtySince: Date.now(), lastStateCheckAt: 0,
      stateCheckTimer: null, stateCheckIntervalMs: 650, stateWatcherStarted: true,
      saveInFlight: false,
      pendingStorageDeletes: [{ bucket: 'gallery-artworks', path: 'main/old.jpg', kind: 'artwork-image', reason: 'test' }],
      cleanupFailures: [], remoteBackupId: 'main_previous',
      localBackupStorageKey: 'backup', pendingCleanupStorageKey: 'cleanup', latestSaveResult: null
    },
    serializeGalleryState() { return JSON.parse(JSON.stringify(draftState)); },
    notifyGalleryStatus(message) { messages.push(message); },
    clearModel3dClipboardIfStoragePathMatches() {},
    startGalleryDraftStateWatcher() {}
  };

  storage.set('cleanup', JSON.stringify(context.gallerySaveIntegrityRuntime.pendingStorageDeletes));
  vm.createContext(context);
  const code = functionNames.map((name) => extractFunction(source, name)).join('\n\n');
  vm.runInContext(code, context);

  if (serverState) {
    context.gallerySaveIntegrityRuntime.publishedServerStateFingerprint =
      context.getGalleryStateIntegrityFingerprint(serverState);
    context.gallerySaveIntegrityRuntime.publishedStateFingerprint =
      context.getGalleryStateIntegrityFingerprint(draftState);
  }

  return { context, calls, messages, storage, draftState };
}

// Successful save: backup first, main commit second, cleanup last.
{
  const serverState = {
    version: 'test',
    editor: { artworks: [{ image: { storageBucket: 'gallery-artworks', imagePath: 'main/old.jpg' } }] },
    localLights: { lights: [] },
    saveIntegrity: { revision: 4 }
  };
  const { context, calls } = createHarness({ serverState });
  const ok = await context.saveGalleryStateToSupabase();
  assert.equal(ok, true);
  assert.deepEqual(calls, [
    'select-main',
    'upsert-main_previous',
    'update-main',
    'remove-gallery-artworks:main/old.jpg'
  ]);
  assert.equal(context.gallerySaveIntegrityRuntime.publishedRevision, 5);
  assert.equal(context.gallerySaveIntegrityRuntime.pendingStorageDeletes.length, 0);
}

// Failed main save must never remove queued files.
{
  const serverState = {
    version: 'test', editor: {}, localLights: { lights: [] }, saveIntegrity: { revision: 2 }
  };
  const { context, calls } = createHarness({ serverState, mainUpsertError: { message: 'network' } });
  const ok = await context.saveGalleryStateToSupabase();
  assert.equal(ok, false);
  assert.ok(calls.includes('upsert-main_previous'));
  assert.ok(calls.includes('update-main'));
  assert.equal(calls.some((call) => call.startsWith('remove-')), false);
  assert.equal(context.gallerySaveIntegrityRuntime.pendingStorageDeletes.length, 1);
}

// A queued path still referenced by the new state must not be deleted.
{
  const { context, calls } = createHarness({ serverState: null });
  context.gallerySaveIntegrityRuntime.pendingStorageDeletes = [
    { bucket: 'gallery-artworks', path: 'main/new.jpg', kind: 'artwork-image' }
  ];
  context.localStorage.setItem('cleanup', JSON.stringify(context.gallerySaveIntegrityRuntime.pendingStorageDeletes));
  const result = await context.processGalleryDeferredStorageCleanup(context.serializeGalleryState());
  assert.equal(result.removed, 0);
  assert.equal(result.skippedReferenced, 1);
  assert.equal(calls.some((call) => call.startsWith('remove-')), false);
  assert.equal(context.gallerySaveIntegrityRuntime.pendingStorageDeletes.length, 0);
}


// If the server version cannot be read, saving must stop even with a local baseline.
{
  const baseline = {
    version: 'test', editor: { value: 1 }, localLights: { lights: [] }, saveIntegrity: { revision: 3 }
  };
  const { context, calls } = createHarness({ serverState: baseline, selectError: { message: 'offline' } });
  const ok = await context.saveGalleryStateToSupabase();
  assert.equal(ok, false);
  assert.deepEqual(calls, ['select-main']);
  assert.equal(context.gallerySaveIntegrityRuntime.latestSaveResult.reason, 'pre-save-read-error');
  assert.equal(context.gallerySaveIntegrityRuntime.pendingStorageDeletes.length, 1);
}


// Deleting or creating the main row in another session must be treated as a conflict.
{
  const { context, calls } = createHarness({ serverState: null });
  context.gallerySaveIntegrityRuntime.publishedServerRowExists = true;
  context.gallerySaveIntegrityRuntime.publishedStateSnapshot = {
    version: 'test', editor: {}, localLights: { lights: [] }, saveIntegrity: { revision: 2 }
  };
  const ok = await context.saveGalleryStateToSupabase();
  assert.equal(ok, false);
  assert.deepEqual(calls, ['select-main']);
  assert.equal(context.gallerySaveIntegrityRuntime.latestSaveResult.reason, 'server-row-presence-conflict');
}

// Concurrent server change blocks overwrite and cleanup.
{
  const baseline = {
    version: 'test', editor: { value: 1 }, localLights: { lights: [] }, saveIntegrity: { revision: 1 }
  };
  const serverChanged = {
    version: 'test', editor: { value: 2 }, localLights: { lights: [] }, saveIntegrity: { revision: 2 }
  };
  const { context, calls } = createHarness({ serverState: serverChanged });
  context.gallerySaveIntegrityRuntime.publishedStateSnapshot = baseline;
  context.gallerySaveIntegrityRuntime.publishedServerStateFingerprint =
    context.getGalleryStateIntegrityFingerprint(baseline);
  context.gallerySaveIntegrityRuntime.publishedRevision = 1;
  const ok = await context.saveGalleryStateToSupabase();
  assert.equal(ok, false);
  assert.deepEqual(calls, ['select-main']);
  assert.equal(context.gallerySaveIntegrityRuntime.latestSaveResult.reason, 'revision-conflict');
}



// A change made after the pre-save read must fail the conditional database commit.
{
  const serverState = {
    version: 'test', editor: { value: 1 }, localLights: { lights: [] }, saveIntegrity: { revision: 7 }
  };
  const { context, calls } = createHarness({ serverState, mainCommitEmpty: true });
  const ok = await context.saveGalleryStateToSupabase();
  assert.equal(ok, false);
  assert.deepEqual(calls, ['select-main', 'upsert-main_previous', 'update-main']);
  assert.equal(context.gallerySaveIntegrityRuntime.latestSaveResult.reason, 'atomic-commit-conflict');
  assert.equal(context.gallerySaveIntegrityRuntime.pendingStorageDeletes.length, 1);
}

// First publication uses insert and still cleans up only after the row is committed.
{
  const { context, calls } = createHarness({ serverState: null });
  const ok = await context.saveGalleryStateToSupabase();
  assert.equal(ok, true);
  assert.deepEqual(calls, ['select-main', 'insert-main', 'remove-gallery-artworks:main/old.jpg']);
  assert.equal(context.gallerySaveIntegrityRuntime.publishedRevision, 1);
}

// JSONB/object key order must not create a false conflict.
{
  const { context } = createHarness({ serverState: null });
  const left = { editor: { z: 1, a: { y: 2, x: 3 } }, localLights: { lights: [] } };
  const right = { localLights: { lights: [] }, editor: { a: { x: 3, y: 2 }, z: 1 } };
  assert.equal(
    context.getGalleryStateIntegrityFingerprint(left),
    context.getGalleryStateIntegrityFingerprint(right)
  );
}

console.log('Stage 12C66A save-integrity behavior tests passed.');
