import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import vm from 'node:vm';

// Consolidated regression suite. Each block is isolated so legacy variable names cannot collide.

// --- test-stage12c66c6a1-save-integrity.mjs ---
await (async () => {
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
    stage: '12C66C6A1', schema: 'gallery-save-integrity.v3', sessionId: 'test-session',
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
    galleryAdminWorkspaceMode: true,
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

console.log('Stage 12C66C6A1 save-integrity repair tests passed.');

})();

// --- test-stage12c66c6a1-startup.mjs ---
await (async () => {
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
const bootstrap = fs.readFileSync(new URL('../src/bootstrap/gallery-viewer-bootstrap.js', import.meta.url), 'utf8');

function extractFunction(text, name) {
  const marker = `function ${name}(`;
  const start = text.indexOf(marker);
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

function sha(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// C6C8C16 intentionally changes the accepted mobile intro layout; lock the new approved functions byte-for-byte.
assert.equal(
  sha(extractFunction(source, 'createViewerIntroOverlayStyles')),
  '01c01b3e1a1e12f44802a2f375e78fe59acadd0f478d666871ba179098cf3d5f'
);
assert.equal(
  sha(extractFunction(source, 'showViewerIntroOverlay')),
  '3e555d80b26ee44188f21107cd265cb603ff601cbf51cdebf8bce95d4d00d09e'
);

// Babylon and the engine are deferred until the explicit click.
assert.equal(/<script[^>]+src=["']https:\/\/cdn\.babylonjs\.com\/babylon\.js/.test(index), false);
assert.equal(/<script[^>]+src=["']https:\/\/cdn\.babylonjs\.com\/loaders\//.test(index), false);
assert.equal(bootstrap.includes('import { createScene }'), false);
assert.ok(bootstrap.includes('await bootGuard.waitForStart();'));
assert.ok(bootstrap.includes('await loadClassicScript("https://cdn.babylonjs.com/babylon.js"'));
assert.ok(bootstrap.includes('const engineModule = await import(`../Gallery_V0_11.min.js?v=${ENGINE_CACHE_KEY}`)'));
assert.ok(bootstrap.indexOf('await bootGuard.waitForStart();') < bootstrap.indexOf('await startGalleryRuntime();'));
assert.equal(bootstrap.includes('const sessionResult = await supabase.auth.getSession();\n  setSession(sessionResult.data.session || null);\n  if (currentSession) await loadEditorModule();\n\n  supabase.auth.onAuthStateChange'), false);
assert.ok(bootstrap.includes('initializeAuthRuntime().catch(function (error)'));
assert.ok(bootstrap.indexOf('initializeAuthRuntime().catch(function (error)') < bootstrap.indexOf('await bootGuard.waitForStart();'));

// Readiness is the real interaction gate, not the old synchronous gallery-ready event.
assert.ok(bootstrap.includes('window.addEventListener("gallery-interaction-ready"'));
assert.equal(bootstrap.includes('window.addEventListener("gallery-ready", onReady'), false);
assert.ok(source.includes('window.dispatchEvent(new CustomEvent("gallery-interaction-ready"'));
assert.equal(extractFunction(source, 'finishGalleryStartup').includes('showViewerIntroOverlay'), false);
assert.ok(bootstrap.includes('window.GalleryApp.showViewerIntroOverlay();'));

// Visitor loading UI is separate from the original post-load instruction popup.
assert.ok(index.includes('id="galleryBootStart"'));
assert.ok(index.includes('id="galleryBootTimefiller"'));
assert.equal(index.includes('id="galleryBootControls"'), false);
assert.equal(index.includes('id="galleryBootAbout"'), true);
assert.ok(index.includes('radial-gradient(circle at 50% 34%, rgba(111, 65, 75, 0.24), transparent 43%)'));
assert.ok(index.includes('width: min(560px, 100%);'));
assert.ok(index.includes('.galleryBootBrand::before'));
assert.equal(index.includes('id="galleryBootEnter"'), false);
assert.equal(source.includes('loadingScreen.style.display = "flex";'), false);
assert.ok(source.includes('window.dispatchEvent(new CustomEvent("gallery-startup-failure"'));

// Technical statuses are editor-only by default and public stack traces are not rendered.
const notifyFunction = extractFunction(source, 'notifyGalleryStatus');
assert.ok(notifyFunction.includes('options.audience || "editor"'));
assert.ok(bootstrap.includes('window.GalleryApp.isEditModeActive()'));
assert.equal(index.includes('error.stack'), false);
assert.equal(bootstrap.includes('error.stack'), false);

// Execute the page-level start gate to confirm it does not resolve before the click.
const bootScriptMatch = index.match(/<script>\s*\(function \(\) \{\s*var guard = document\.getElementById\("galleryBootGuard"\);[\s\S]*?<\/script>/);
assert.ok(bootScriptMatch, 'BootGuard inline script missing');
const bootScript = bootScriptMatch[0].replace(/^<script>/, '').replace(/<\/script>$/, '');

function createElement() {
  const listeners = new Map();
  const classes = new Set();
  return {
    textContent: '',
    disabled: false,
    href: '',
    style: {},
    dataset: {},
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); }
    },
    addEventListener(type, handler) { listeners.set(type, handler); },
    click() { const handler = listeners.get('click'); if (handler) handler({ preventDefault() {} }); }
  };
}

function createBootHarness() {
  const ids = new Map([
    ['galleryBootGuard', createElement()],
    ['galleryBootTitle', createElement()],
    ['galleryBootMessage', createElement()],
    ['galleryBootTimefiller', createElement()],
    ['galleryBootStart', createElement()],
    ['galleryBootAbout', createElement()],
    ['galleryBootReload', createElement()],
    ['galleryBootExternal', createElement()]
  ]);
  const events = [];
  const windowListeners = new Map();
  const context = {
    console: { log() {}, warn() {}, error() {} },
    Error,
    Promise,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    document: { getElementById(id) { return ids.get(id) || null; } },
    localStorage: { getItem() { return 'en'; } },
    window: {
      location: { href: 'https://example.test/gallery', reload() {} },
      setTimeout(fn) { return 1; },
      clearTimeout() {},
      setInterval() { return 2; },
      clearInterval() {},
      addEventListener(type, handler) { windowListeners.set(type, handler); },
      dispatchEvent(event) { events.push(event); }
    }
  };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(bootScript, context);
  return { context, ids, events };
}

{
  const { context, ids } = createBootHarness();
  assert.equal(context.window.BerryboyBootGuard.getState(), 'prestart');
  let resolved = false;
  context.window.BerryboyBootGuard.waitForStart().then(() => { resolved = true; });
  await Promise.resolve();
  assert.equal(resolved, false);
  ids.get('galleryBootStart').click();
  await Promise.resolve();
  assert.equal(resolved, true);
  assert.equal(context.window.BerryboyBootGuard.getState(), 'loading');
  assert.equal(ids.get('galleryBootGuard').dataset.state, 'loading');
  context.window.BerryboyBootGuard.setPhase('models', 'Loaded 12 lights');
  assert.equal(ids.get('galleryBootMessage').textContent, 'One moment — your visit will begin shortly.');
  context.window.BerryboyBootGuard.ready();
  assert.equal(context.window.BerryboyBootGuard.getState(), 'ready');
  assert.equal(ids.get('galleryBootGuard').classList.contains('is-hidden'), true);
}

{
  const { context, ids } = createBootHarness();
  ids.get('galleryBootStart').click();
  context.window.BerryboyBootGuard.fail('test', 'technical detail', new Error('secret stack'));
  assert.equal(context.window.BerryboyBootGuard.getState(), 'error');
  assert.equal(ids.get('galleryBootTitle').textContent, 'The gallery could not start');
  assert.equal(ids.get('galleryBootMessage').textContent, 'Reload the page and try again.');
}

console.log('Stage 12C66C6A1 startup and current-popup regression tests passed.');

})();

// --- test-stage12c66c6a1-image-validation.mjs ---
await (async () => {
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

const context = {
  console,
  Uint8Array,
  DataView,
  ArrayBuffer,
  Math,
  Number,
  String,
  galleryImageUploadLimits: {
    artwork: { maxBytes: 24 * 1024 * 1024, maxSide: 10000, maxPixels: 40000000, label: 'obraz pracy' },
    author: { maxBytes: 12 * 1024 * 1024, maxSide: 8000, maxPixels: 24000000, label: 'zdjecie autora' }
  },
  async loadImageElementFromBlob() { throw new Error('fallback should not run in header tests'); }
};
vm.createContext(context);
vm.runInContext([
  'readGalleryUint24LittleEndian',
  'parseGalleryImageDimensionsFromHeader',
  'readGalleryImageDimensions',
  'validateGalleryImageUploadFile'
].map((name) => extractFunction(source, name)).join('\n\n'), context);

function fakeFile(bytes, type = 'image/png', sizeOverride = null) {
  const data = Uint8Array.from(bytes);
  return {
    type,
    size: sizeOverride ?? data.length,
    slice(start, end) {
      const part = data.slice(start, end);
      return { async arrayBuffer() { return part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength); } };
    }
  };
}

// PNG 640 x 480.
{
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4E, 0x47], 0);
  new DataView(bytes.buffer).setUint32(16, 640, false);
  new DataView(bytes.buffer).setUint32(20, 480, false);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.parseGalleryImageDimensionsFromHeader(bytes.buffer))),
    { width: 640, height: 480, format: 'png' }
  );
  const result = await context.validateGalleryImageUploadFile(fakeFile(bytes), 'artwork');
  assert.equal(result.ok, true);
  assert.equal(result.pixels, 307200);
}

// JPEG SOF0 1920 x 1080.
{
  const bytes = [
    0xFF, 0xD8,
    0xFF, 0xE0, 0x00, 0x04, 0x00, 0x00,
    0xFF, 0xC0, 0x00, 0x11, 0x08,
    0x04, 0x38,
    0x07, 0x80,
    0x03, 0x01, 0x11, 0x00
  ];
  const result = context.parseGalleryImageDimensionsFromHeader(Uint8Array.from(bytes).buffer);
  assert.equal(result.width, 1920);
  assert.equal(result.height, 1080);
  assert.equal(result.format, 'jpeg');
}

// WebP VP8X 300 x 200.
{
  const bytes = new Uint8Array(30);
  bytes.set([...Buffer.from('RIFF')], 0);
  bytes.set([...Buffer.from('WEBP')], 8);
  bytes.set([...Buffer.from('VP8X')], 12);
  const widthMinusOne = 299;
  const heightMinusOne = 199;
  bytes[24] = widthMinusOne & 255;
  bytes[25] = (widthMinusOne >> 8) & 255;
  bytes[26] = (widthMinusOne >> 16) & 255;
  bytes[27] = heightMinusOne & 255;
  bytes[28] = (heightMinusOne >> 8) & 255;
  bytes[29] = (heightMinusOne >> 16) & 255;
  const result = context.parseGalleryImageDimensionsFromHeader(bytes.buffer);
  assert.equal(result.width, 300);
  assert.equal(result.height, 200);
}

// Size and pixel limits reject before variant generation/upload.
{
  const oversized = fakeFile([0x89, 0x50, 0x4E, 0x47], 'image/png', 25 * 1024 * 1024);
  const sizeResult = await context.validateGalleryImageUploadFile(oversized, 'artwork');
  assert.equal(sizeResult.ok, false);
  assert.match(sizeResult.message, /24 MB/);

  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4E, 0x47], 0);
  new DataView(bytes.buffer).setUint32(16, 9000, false);
  new DataView(bytes.buffer).setUint32(20, 4000, false);
  const authorResult = await context.validateGalleryImageUploadFile(fakeFile(bytes), 'author');
  assert.equal(authorResult.ok, false);
}

console.log('Stage 12C66C6A1 image validation tests passed.');

})();

// --- test-stage12c66c6a1-unified-collision.mjs ---
await (async () => {
const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const marker of markers) { start = source.indexOf(marker); if (start >= 0) break; }
  assert.ok(start >= 0, `Missing function ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0, state = 'code', quote = null;
  for (let i = brace; i < source.length; i += 1) {
    const c = source[i], n = source[i + 1] || '';
    if (state === 'code') {
      if (c === '"' || c === "'" || c === '`') { state = 'string'; quote = c; }
      else if (c === '/' && n === '/') { state = 'line'; i += 1; }
      else if (c === '/' && n === '*') { state = 'block'; i += 1; }
      else if (c === '{') depth += 1;
      else if (c === '}') { depth -= 1; if (depth === 0) return source.slice(start, i + 1); }
    } else if (state === 'string') { if (c === '\\') i += 1; else if (c === quote) state = 'code'; }
    else if (state === 'line' && c === '\n') state = 'code';
    else if (state === 'block' && c === '*' && n === '/') { state = 'code'; i += 1; }
  }
  throw new Error(`Unterminated ${name}`);
}

class Vec3 {
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  clone(){return new Vec3(this.x,this.y,this.z);}
  copyFrom(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}
  addInPlace(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}
  subtract(v){return new Vec3(this.x-v.x,this.y-v.y,this.z-v.z);}
  lengthSquared(){return this.x*this.x+this.y*this.y+this.z*this.z;}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
  static Zero(){return new Vec3();}
  static DistanceSquared(a,b){const x=a.x-b.x,y=a.y-b.y,z=a.z-b.z;return x*x+y*y+z*z;}
}

function makeContext(blocker) {
  const ctx = {
    Date, Number, String, Math,
    BABYLON: { Vector3: Vec3 },
    camera: { position: new Vec3(0, 1.7, 0) },
    editMode: false,
    viewerMovementVelocity: new Vec3(1,0,1),
    galleryGroundCollisionRuntime: { lastResult:null, movementLog:[], maxLogEntries:160, lastAcceptedPosition:new Vec3() },
    isViewerCollisionActive(){ return true; },
    getGalleryGroundedCameraYAtPosition(){ return 1.7; },
    getGalleryGroundCollisionBlock(from, candidate){ return blocker(from, candidate); }
  };
  vm.createContext(ctx);
  vm.runInContext([
    extractFunction('serializeGroundCollisionVector'),
    extractFunction('recordGalleryGroundMovement'),
    extractFunction('resolveGalleryGroundMovement')
  ].join('\n\n'), ctx);
  return ctx;
}


// C5A regression: grounded walking must keep the exact C4 baseline instead of
// deriving camera Y from whichever floor layer a downward ray happens to hit.
const heightCtx = {
  Number,
  isFinite,
  getGalleryDefaultWalkCameraY(){ return -2.2; }
};
vm.createContext(heightCtx);
vm.runInContext(extractFunction('getGalleryGroundedCameraYAtPosition'), heightCtx);
assert.equal(heightCtx.getGalleryGroundedCameraYAtPosition({y:-3.1}, -3.1), -2.2);

let ctx = makeContext(() => null);
let result = ctx.resolveGalleryGroundMovement(new Vec3(1,0,1), {source:'viewer-wasd'});
assert.equal(result.resolution, 'full');
assert.equal(ctx.camera.position.x, 1);
assert.equal(ctx.camera.position.z, 1);
assert.equal(ctx.camera.position.y, 1.7);

ctx = makeContext((from, candidate) => candidate.z !== from.z ? {type:'wall',name:'fixture'} : null);
result = ctx.resolveGalleryGroundMovement(new Vec3(1,0,1), {source:'desktop-dpad'});
assert.equal(result.resolution, 'slide-x');
assert.equal(ctx.camera.position.x, 1);
assert.equal(ctx.camera.position.z, 0);
assert.equal(result.detectedCollider.type, 'wall');

ctx = makeContext(() => ({type:'sculpture',name:'fixture',slotId:'slot-1'}));
result = ctx.resolveGalleryGroundMovement(new Vec3(1,0,1), {source:'click-to-move'});
assert.equal(result.resolution, 'blocked');
assert.equal(result.moved, false);
assert.equal(ctx.camera.position.x, 0);
assert.equal(ctx.viewerMovementVelocity.lengthSquared(), 0);
assert.equal(result.detectedCollider.slotId, 'slot-1');

// Actual sculpture sweep: crossing is blocked, escaping a restored overlap is allowed.
const sweepCtx = {
  Math,
  viewerCollisionRadius: 0.34,
  isViewerSculptureBlockActive(){return true;},
  getViewerSculptureCollisionProxies(){return [{slotId:'slot-1'}];},
  getViewerSculptureProxyBounds(){return {minimum:{x:-1,z:-1},maximum:{x:1,z:1}};}
};
vm.createContext(sweepCtx);
vm.runInContext([
  extractFunction('galleryExhibitSegmentIntersectsExpandedAabb2D'),
  extractFunction('findViewerSculptureCollisionRecord')
].join('\n\n'), sweepCtx);
assert.ok(sweepCtx.findViewerSculptureCollisionRecord({x:-3,z:0},{x:3,z:0}));
assert.equal(sweepCtx.findViewerSculptureCollisionRecord({x:0,z:0},{x:2,z:0}), null);
assert.ok(sweepCtx.findViewerSculptureCollisionRecord({x:0.8,z:0},{x:0,z:0}));

console.log('Stage 12C66C6A1 unified collision behavior tests passed.');

})();

// --- test-stage12c66c6a1-sculpture-core.mjs ---
await (async () => {
const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
const minified = fs.readFileSync(new URL('../src/Gallery_V0_11.min.js', import.meta.url), 'utf8');
function extractFunction(name) {
  const markers = [`    async function ${name}(`, `    function ${name}(`];
  let start = -1;
  for (const marker of markers) { start = source.indexOf(marker); if (start >= 0) break; }
  assert.ok(start >= 0, `Missing ${name}`);
  const brace = source.indexOf('{', start); let depth=0,state='code',quote=null;
  for(let i=brace;i<source.length;i+=1){const c=source[i],n=source[i+1]||'';if(state==='code'){if(c==='"'||c==="'"||c==='`'){state='string';quote=c;}else if(c==='/'&&n==='/'){state='line';i+=1;}else if(c==='/'&&n==='*'){state='block';i+=1;}else if(c==='{')depth+=1;else if(c==='}'){depth-=1;if(depth===0)return source.slice(start,i+1);}}else if(state==='string'){if(c==='\\')i+=1;else if(c===quote)state='code';}else if(state==='line'&&c==='\n')state='code';else if(state==='block'&&c==='*'&&n==='/'){state='code';i+=1;}}
  throw new Error(`Unterminated ${name}`);
}

assert.ok(source.includes('schema: "gallery-sculpture-core.v2"'));
assert.ok(source.includes('slotId: ensureModel3dSlotIdentity(sphere)'));
assert.ok(source.includes('getModel3dSlotById(sphereState.slotId) || getSphereByName(sphereState.name)'));

const picked=extractFunction('getModel3dSlotFromPickedMesh');
assert.ok(picked.includes('_galleryModel3dOwnerSlot'));
assert.ok(picked.indexOf('model3dOwnerSlotId') < picked.indexOf('model3dSlotName'));

const collector=extractFunction('collectGalleryModel3dRuntimeNodes');
assert.ok(collector.includes('result && result.transformNodes'));
assert.ok(collector.includes('result && result.meshes'));
assert.ok(collector.includes('node.getDescendants(false)'));

const load=extractFunction('loadModel3dIntoSlot');
assert.ok(load.includes('collected.rootNodes.forEach'));
assert.ok(load.includes('importedRoot.parent = root'));
assert.ok(load.includes('pendingRuntime.nodes'));
assert.ok(load.includes('pendingRuntime.transformNodes'));
assert.ok(load.includes('isCurrentModel3dSlotLoad(slot, generation)'));

const dispose=extractFunction('disposeModel3dSlotRuntime');
for(const key of ['runtime.nodes','runtime.rootNodes','runtime.transformNodes','runtime.meshes']) assert.ok(dispose.includes(key));
assert.ok(dispose.includes('nodes.sort'));

const duplicate=extractFunction('duplicateSelectedModel3dSlot');
assert.ok(duplicate.includes('selectionRevisionAtStart'));
assert.ok(duplicate.includes('sourceSlotId'));
assert.ok(duplicate.includes('await applyModel3dStateToSlot'));
assert.ok(duplicate.includes('sculpturePedestalFootprint'));

const proxy=extractFunction('refreshSculptureCollisionProxy');
assert.ok(proxy.includes('getSculpturePedestalLocalBounds(slot)'));
assert.ok(proxy.includes('worldBoundsToSlotLocalBounds'));
assert.ok(proxy.includes('proxy.parent = slot'));
assert.ok(proxy.includes('colliderRegistry[slotId]'));

const deletion=extractFunction('deleteModel3dSlotRuntime');
assert.ok(deletion.includes('removeModel3dSlotFromSelectionState(slot)'));
assert.ok(deletion.includes('disposeSculptureCollisionProxy(slot)'));
assert.ok(deletion.includes('unregisterModel3dSlotIdentity(slot)'));

assert.ok(source.includes('if (editMode && isDraggingSphere && activeSculptureDragSlot)'));
assert.ok(source.includes('gallerySculptureCoreRuntime.activeDragSlotId = ensureModel3dSlotIdentity'));
assert.ok(source.includes('model3dTransformSliderPreviewSlotId'));
assert.ok(minified.includes('gallery-sculpture-core.v2'));
assert.ok(minified.includes('model3dOwnerSlotId'));
assert.ok(minified.includes('model3dLoadGeneration'));

console.log('Stage 12C66C6A1 sculpture runtime integrity tests passed.');

})();

// --- test-stage12c66c6a1-artwork-lifecycle.mjs ---
await (async () => {
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
      else if (char === '}') { depth -= 1; if (depth === 0) return text.slice(start, i + 1); }
    } else if (state === 'string') {
      if (char === '\\') i += 1; else if (char === quote) { state = 'code'; quote = null; }
    } else if (state === 'line') { if (char === '\n') state = 'code'; }
    else if (state === 'block' && char === '*' && next === '/') { state = 'code'; i += 1; }
  }
  throw new Error(`Unterminated function ${name}`);
}

const names = [
  'normalizeGalleryArtworkId',
  'createGalleryArtworkId',
  'ensureArtworkIdentity',
  'unregisterArtworkIdentity',
  'getArtworkById',
  'getArtworkTextureLoadGeneration',
  'removeArtworkFromStreamingQueues',
  'invalidateArtworkTextureLoad',
  'prepareArtworkTextureLoadRequest',
  'isArtworkTextureLoadCurrent',
  'getArtworkImageState',
  'getArtworkImageStateForSave',
  'queueGalleryFastStartArtworkLoad'
];

const context = {
  console,
  Date,
  Math,
  JSON,
  galleryArtworkCoreRuntime: {
    stage: '12C66C6A1', schema: 'gallery-artwork-runtime.v1', registry: Object.create(null),
    generatedIds: 0, invalidatedLoads: 0, staleCallbacksIgnored: 0, queuesCleared: 0,
    atomicSwaps: 0, lastReason: 'initial'
  },
  galleryFastStartRuntime: { deferredArtworkLoads: [], deferredFullArtworkLoads: [] },
  getGalleryStreamingZoneIdForObject: () => 'zone-a',
  getGalleryStreamingTierForZone: () => 'critical',
  cloneGalleryFastStartState: value => JSON.parse(JSON.stringify(value || {})),
  isArtworkDeleted: artwork => !!artwork.metadata.deletedArtwork
};
vm.createContext(context);
vm.runInContext(names.map(name => extractFunction(source, name)).join('\n\n'), context);

function artwork(name, uniqueId) {
  return { name, uniqueId, metadata: {}, isDisposed: () => false };
}

const first = artwork('Artwork_7', 7);
const second = artwork('Artwork_7', 8);
const firstId = context.ensureArtworkIdentity(first);
const secondId = context.ensureArtworkIdentity(second);
assert.equal(firstId, 'artwork:Artwork_7');
assert.notEqual(secondId, firstId, 'Registry collision must not merge two objects');
assert.equal(context.getArtworkById(firstId), first);

const request1 = context.prepareArtworkTextureLoadRequest(first, { imageUrl: 'one.jpg', _galleryTemporary: 'remove-on-save' }, 'first');
assert.equal(request1._galleryArtworkLoadGeneration, 1);
assert.equal(request1._galleryArtworkId, firstId);
context.galleryFastStartRuntime.deferredArtworkLoads.push({ artwork: first, artworkId: firstId, key: firstId, generation: 1 });
context.galleryFastStartRuntime.deferredFullArtworkLoads.push({ artwork: first, artworkId: firstId, key: firstId, generation: 1 });

const request2 = context.prepareArtworkTextureLoadRequest(first, { imageUrl: 'two.jpg' }, 'replace');
assert.equal(request2._galleryArtworkLoadGeneration, 2);
assert.equal(context.galleryFastStartRuntime.deferredArtworkLoads.length, 0, 'Replace must clear preview queue');
assert.equal(context.galleryFastStartRuntime.deferredFullArtworkLoads.length, 0, 'Replace must clear full queue');
assert.equal(context.isArtworkTextureLoadCurrent(first, 1, firstId), false, 'Old callback must be stale');
assert.equal(context.isArtworkTextureLoadCurrent(first, 2, firstId), true, 'Newest generation must own the artwork');

first.metadata.artworkImage = { imageUrl: 'two.jpg', imageUrlMobile: 'two-mobile.webp', _galleryArtworkLoadGeneration: 2, _galleryResolvedTextureUrl: 'runtime.webp' };
const saved = context.getArtworkImageStateForSave(first);
assert.equal(saved.artworkId, firstId);
assert.equal(saved.imageUrl, 'two.jpg');
assert.equal(saved._galleryArtworkLoadGeneration, undefined);
assert.equal(saved._galleryResolvedTextureUrl, undefined);

assert.equal(context.queueGalleryFastStartArtworkLoad(first, request2), true);
assert.equal(context.galleryFastStartRuntime.deferredArtworkLoads.length, 1);
assert.equal(context.galleryFastStartRuntime.deferredArtworkLoads[0].artworkId, firstId);
assert.equal(context.galleryFastStartRuntime.deferredArtworkLoads[0].generation, 2);
assert.equal(first.metadata.galleryStreaming.queued, true);

context.invalidateArtworkTextureLoad(first, 'delete');
context.unregisterArtworkIdentity(first);
assert.equal(context.getArtworkById(firstId), null);
assert.equal(context.isArtworkTextureLoadCurrent(first, 2, firstId), false);

console.log('Stage 12C66C6A1 artwork identity, generation and queue lifecycle tests passed.');

})();

// --- test-stage12c66c6a1-artwork-async-swap.mjs ---
await (async () => {
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
      else if (char === '}') { depth -= 1; if (depth === 0) return text.slice(start, i + 1); }
    } else if (state === 'string') {
      if (char === '\\') i += 1; else if (char === quote) { state = 'code'; quote = null; }
    } else if (state === 'line') { if (char === '\n') state = 'code'; }
    else if (state === 'block' && char === '*' && next === '/') { state = 'code'; i += 1; }
  }
  throw new Error(`Unterminated function ${name}`);
}

class FakeMaterial {
  constructor(name) {
    this.name = name;
    this.diffuseTexture = null;
    this.emissiveTexture = null;
    this.disposed = false;
  }
  dispose() { this.disposed = true; }
}
class FakeTexture {
  static instances = [];
  static TRILINEAR_SAMPLINGMODE = 3;
  static CLAMP_ADDRESSMODE = 0;
  constructor(url, scene, noMipmap, invertY, sampling, onLoad, onError) {
    this.url = url;
    this.noMipmap = noMipmap;
    this.onLoad = onLoad;
    this.onError = onError;
    this.disposed = false;
    this.anisotropicFilteringLevel = 1;
    FakeTexture.instances.push(this);
  }
  dispose() { this.disposed = true; }
  getBaseSize() { return { width: 1024, height: 768 }; }
}

const geometryCalls = { fit: 0, record: 0, transform: 0, sync: 0, light: 0 };

const context = {
  console,
  Date,
  Math,
  JSON,
  setTimeout: callback => callback(),
  scene: {},
  galleryArtworkDefaultFitMode: 'contain',
  galleryArtworkStorageBucket: 'bucket',
  galleryFastStartRuntime: { stateApplyActive: false, deferredArtworkLoads: [], deferredFullArtworkLoads: [] },
  galleryArtworkCoreRuntime: {
    stage: '12C66C6A1', schema: 'gallery-artwork-runtime.v1', registry: Object.create(null),
    generatedIds: 0, invalidatedLoads: 0, staleCallbacksIgnored: 0, queuesCleared: 0,
    atomicSwaps: 0, lastReason: 'initial'
  },
  galleryExhibitionRuntime: { staleOwnerCallbacksBlocked: 0 },
  isGalleryEntityOwnerActive: () => true,
  setGalleryOwnedEntityDisabled: () => false,
  galleryKtx2Runtime: { successfulLoads: 0, fallbackLoads: 0, lastError: null },
  BABYLON: {
    StandardMaterial: FakeMaterial,
    Color3: class { constructor(r, g, b) { this.r = r; this.g = g; this.b = b; } },
    Texture: FakeTexture
  },
  rememberArtworkImageStateWithoutDisplay: () => true,
  queueGalleryFastStartArtworkLoad: () => true,
  getArtworkImageUrlFromState: state => state.imageUrl || '',
  removeArtworkImageFromMesh: () => false,
  applyArtworkImageBaseMaterial: artwork => { artwork.material = artwork.material || new FakeMaterial('base'); },
  setArtworkTransformState: () => { geometryCalls.transform += 1; },
  getArtworkImagePlane: artwork => artwork.metadata.imagePlane,
  getGalleryStreamingTierForObject: () => 'deferred',
  registerGalleryStartupArtworkTextureLoad: () => () => {},
  fitArtworkImagePlaneToTexture: () => { geometryCalls.fit += 1; },
  recordArtworkTextureDimensionsWithoutGeometry: () => { geometryCalls.record += 1; },
  syncDetachedArtworkImagePlane: () => { geometryCalls.sync += 1; },
  updateArtworkLight: () => { geometryCalls.light += 1; },
  updateArtworkImageUi: () => {},
  updateArtworkTransformUi: () => {},
  refreshCommonLightingMaterialSupport: () => {},
  scheduleGalleryFastStartFullArtworkUpgrade: () => {},
  isGalleryKtx2Url: () => false,
  cloneGalleryFastStartState: value => ({ ...(value || {}) }),
  restoreArtworkPlaceholderBaseMaterial: () => {},
  notifyGalleryStatus: () => {},
  getArtworkTextureNoMipmap: () => false,
  isGalleryDeviceProfileMobile: () => false,
  isArtworkDeleted: artwork => !!artwork.metadata.deletedArtwork
};
vm.createContext(context);
const names = [
  'normalizeGalleryArtworkId', 'createGalleryArtworkId', 'ensureArtworkIdentity',
  'getArtworkTextureLoadGeneration', 'removeArtworkFromStreamingQueues',
  'invalidateArtworkTextureLoad', 'prepareArtworkTextureLoadRequest',
  'isArtworkTextureLoadCurrent', 'disposeArtworkImageMaterialInstance', 'applyArtworkImageState'
];
vm.runInContext(names.map(name => extractFunction(source, name)).join('\n\n'), context);

function makeArtwork() {
  const plane = {
    material: null,
    enabled: false,
    setEnabled(value) { this.enabled = !!value; },
    isEnabled() { return this.enabled; }
  };
  return {
    name: 'Artwork_Async', uniqueId: 99, metadata: { imagePlane: plane }, material: null,
    isDisposed: () => false,
    computeWorldMatrix: () => {}
  };
}

const artwork = makeArtwork();
assert.equal(context.applyArtworkImageState(artwork, { imageUrl: 'first.webp' }), true);
const firstTexture = FakeTexture.instances.at(-1);
const firstMaterial = artwork.metadata.imageMaterial;
assert.equal(artwork.metadata.imagePlane.enabled, true, 'Assigned frame must not be hidden while first texture loads');
assert.equal(firstTexture.url, 'first.webp');

assert.equal(context.applyArtworkImageState(artwork, { imageUrl: 'second.webp' }), true);
const secondTexture = FakeTexture.instances.at(-1);
const secondLoadingMaterial = secondTexture === firstTexture ? null : secondTexture;
assert.ok(secondLoadingMaterial, 'Second generation texture was not created');
assert.equal(artwork.metadata.imageMaterial, firstMaterial, 'Previous valid/loading material must stay visible until replacement is ready');

secondTexture.onLoad();
const secondMaterial = artwork.metadata.imageMaterial;
assert.notEqual(secondMaterial, firstMaterial, 'Newest generation did not atomically take ownership');
assert.equal(artwork.metadata.imagePlane.material, secondMaterial);
assert.equal(artwork.metadata.galleryStreaming.textureUrl, 'second.webp');
assert.equal(artwork.metadata.galleryStreaming.textureState, 'full');
assert.equal(firstMaterial.disposed, true, 'Previous material must be disposed after successful swap');

firstTexture.onLoad();
assert.equal(artwork.metadata.imageMaterial, secondMaterial, 'Stale callback overwrote the newest artwork texture');
assert.equal(artwork.metadata.imagePlane.material, secondMaterial, 'Stale callback changed visible plane material');
assert.ok(context.galleryArtworkCoreRuntime.staleCallbacksIgnored >= 1, 'Stale callback was not recorded');

assert.equal(context.applyArtworkImageState(artwork, { imageUrl: 'third.webp' }), true);
const thirdTexture = FakeTexture.instances.at(-1);
context.invalidateArtworkTextureLoad(artwork, 'delete-test');
artwork.metadata.deletedArtwork = true;
thirdTexture.onLoad();
assert.equal(artwork.metadata.imageMaterial, secondMaterial, 'Late callback resurrected a deleted/replaced generation');
assert.equal(artwork.metadata.imagePlane.material, secondMaterial, 'Late callback changed the visible material after invalidation');

// A Preview -> Full upgrade must swap material/texture without changing geometry, bounds or light targets.
const isolatedArtwork = makeArtwork();
assert.equal(context.applyArtworkImageState(isolatedArtwork, { imageUrl: 'preview.webp', transform: { scale: 1 } }), true);
const previewTexture = FakeTexture.instances.at(-1);
previewTexture.onLoad();
const geometryAfterPreview = { ...geometryCalls };
const previewMaterial = isolatedArtwork.metadata.imageMaterial;
assert.equal(context.applyArtworkImageState(isolatedArtwork, {
  imageUrl: 'full.webp',
  transform: { scale: 2 },
  _galleryTextureOnlyUpgrade: true
}), true);
const fullTexture = FakeTexture.instances.at(-1);
fullTexture.onLoad();
assert.notEqual(isolatedArtwork.metadata.imageMaterial, previewMaterial, 'Full texture did not atomically replace Preview material');
assert.equal(geometryCalls.fit, geometryAfterPreview.fit, 'Texture-only Full upgrade refitted artwork geometry');
assert.equal(geometryCalls.transform, geometryAfterPreview.transform, 'Texture-only Full upgrade reapplied artwork transform');
assert.equal(geometryCalls.sync, geometryAfterPreview.sync, 'Texture-only Full upgrade resynced detached geometry');
assert.equal(geometryCalls.light, geometryAfterPreview.light, 'Texture-only Full upgrade rebuilt artwork light targets');
assert.equal(geometryCalls.record, geometryAfterPreview.record + 1, 'Texture-only Full upgrade did not record final texture dimensions');

console.log('Stage 12C66C6A1 artwork async atomic-swap, stale-callback and texture-only upgrade tests passed.');

})();

// --- test-stage12c66c6a1-inspect-isolation.mjs ---
await (async () => {
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
      else if (char === '}') { depth -= 1; if (depth === 0) return text.slice(start, i + 1); }
    } else if (state === 'string') {
      if (char === '\\') i += 1; else if (char === quote) { state = 'code'; quote = null; }
    } else if (state === 'line') { if (char === '\n') state = 'code'; }
    else if (state === 'block' && char === '*' && next === '/') { state = 'code'; i += 1; }
  }
  throw new Error(`Unterminated function ${name}`);
}

// Full-texture upgrades must pause during transition and input activity, but not forever when idle.
const busyContext = {
  Date,
  galleryFastStartRuntime: {
    viewerReady: true,
    interactionReady: true,
    backgroundDrainActive: false,
    lastViewerActivityAt: 0,
    fullArtworkIdleDelayMs: 1800
  },
  editMode: false,
  viewerIntroOverlayMovementUnlocked: true,
  document: { hidden: false },
  galleryInspectRuntime: { opening: false },
  isDraggingArtwork: false,
  isDraggingSphere: false,
  desktopViewerMiddleLookActive: false,
  mobileLookActive: false,
  mobileJoystickActive: false,
  mobileCanvasMoveActive: false,
  editMoveKeys: {},
  viewerMovementVelocity: { length: () => 0 },
  viewerMoveKeys: {},
  transition: false,
  isGalleryInspectCameraTransitionActive: () => busyContext.transition,
  galleryArtworkEgressPolicy: { idleBeforeFullMs: 1800 }
};
vm.createContext(busyContext);
vm.runInContext(extractFunction(source, 'isGalleryViewerTextureStreamingMotionBlocked'), busyContext);
vm.runInContext(extractFunction(source, 'isGalleryViewerBusyForFullArtworkUpgrade'), busyContext);
assert.equal(busyContext.isGalleryViewerBusyForFullArtworkUpgrade(), false, 'Idle viewer should allow a Full upgrade');
busyContext.transition = true;
assert.equal(busyContext.isGalleryViewerBusyForFullArtworkUpgrade(), true, 'TRANSITION must pause Full upgrades');
busyContext.transition = false;
busyContext.galleryInspectRuntime.opening = true;
assert.equal(busyContext.isGalleryViewerBusyForFullArtworkUpgrade(), true, 'Opening Inspect must pause Full upgrades');
busyContext.galleryInspectRuntime.opening = false;
busyContext.mobileJoystickActive = true;
assert.equal(busyContext.isGalleryViewerBusyForFullArtworkUpgrade(), true, 'Joystick movement must pause Full upgrades');
busyContext.mobileJoystickActive = false;
busyContext.galleryFastStartRuntime.lastViewerActivityAt = Date.now();
assert.equal(busyContext.isGalleryViewerBusyForFullArtworkUpgrade(), true, 'Recent interaction must respect the idle delay');

// Transition watchdog: begin -> armed, complete -> cleared, timeout -> recovery close.
let scheduled = null;
let clearCount = 0;
let syncReasons = [];
let closeReason = null;
const cameraContext = {
  Date,
  Math,
  setTimeout(fn) { scheduled = fn; return 77; },
  clearTimeout(id) { if (id) clearCount += 1; scheduled = null; },
  galleryInspectCameraRuntime: {
    state: 'WALK', transitionId: 0, reason: 'initial', controlsDetached: false,
    startedAt: 0, completedAt: 0, watchdogTimer: null, watchdogTransitionId: 0,
    watchdogMs: 9000, watchdogArmedAt: 0, lastRecovery: null
  },
  scene: { stopAnimation() {} },
  camera: { position: { clone: () => ({}) } },
  canvas: {},
  galleryGroundCollisionRuntime: {},
  markGalleryViewerActivity() {},
  stopViewerSafeFocusRuntimeAnimation() {},
  endDesktopViewerMiddleLook() {},
  endMobileCanvasLook() {},
  clearGalleryInspectTransitionInput() {},
  detachGalleryCameraForInspectTransition() { cameraContext.galleryInspectCameraRuntime.controlsDetached = true; },
  restoreGalleryCameraAfterInspectTransition() { cameraContext.galleryInspectCameraRuntime.controlsDetached = false; },
  syncGalleryInspectCameraCollisionHandoff() {},
  syncMobileViewerUiVisibility(reason) { syncReasons.push(reason); },
  updateGalleryMobileInspectSafeFrame() {},
  closeGalleryInspect(reason) { closeReason = reason; cameraContext.galleryInspectCameraRuntime.state = 'WALK'; return true; }
};
vm.createContext(cameraContext);
for (const name of [
  'clearGalleryInspectTransitionWatchdog', 'recoverGalleryInspectTransition',
  'armGalleryInspectTransitionWatchdog', 'beginGalleryInspectCameraTransition',
  'completeGalleryInspectCameraTransition', 'releaseGalleryInspectCameraToWalk'
]) vm.runInContext(extractFunction(source, name), cameraContext);

const firstId = cameraContext.beginGalleryInspectCameraTransition('test-open');
assert.equal(firstId, 1);
assert.equal(cameraContext.galleryInspectCameraRuntime.state, 'TRANSITION');
assert.equal(cameraContext.galleryInspectCameraRuntime.watchdogTransitionId, 1);
assert.equal(typeof scheduled, 'function', 'Watchdog was not armed');
assert.ok(syncReasons.includes('inspect-transition-begin'), 'Mobile UI was not hidden before composition');
assert.equal(cameraContext.completeGalleryInspectCameraTransition(firstId), true);
assert.equal(cameraContext.galleryInspectCameraRuntime.state, 'INSPECT');
assert.equal(cameraContext.galleryInspectCameraRuntime.watchdogTimer, null, 'Watchdog was not cleared on completion');

const secondId = cameraContext.beginGalleryInspectCameraTransition('test-timeout');
assert.equal(secondId, 2);
const timeoutCallback = scheduled;
assert.equal(typeof timeoutCallback, 'function');
timeoutCallback();
assert.equal(closeReason, 'transition-watchdog', 'Timeout did not use controlled recovery');
assert.equal(cameraContext.galleryInspectCameraRuntime.state, 'WALK');
assert.equal(cameraContext.galleryInspectCameraRuntime.lastRecovery.transitionId, secondId);
assert.ok(clearCount >= 1, 'Watchdog timer was never cleared');

// Structural guarantees around texture-only upgrades and ordering.
const fullDrain = extractFunction(source, 'drainGalleryFastStartFullArtworkQueue');
assert.ok(fullDrain.includes('_galleryTextureOnlyUpgrade = true'), 'Full upgrade lacks texture-only isolation');
const apply = extractFunction(source, 'applyArtworkImageState');
assert.ok(apply.includes('if (textureOnlyUpgrade)'), 'Texture-only branch missing');
assert.ok(apply.includes('recordArtworkTextureDimensionsWithoutGeometry'), 'Texture-only upgrade does not preserve geometry');
assert.ok(apply.includes('if (!textureOnlyUpgrade) {\n                        syncDetachedArtworkImagePlane'), 'Texture-only upgrade can still resync geometry/light targets');
const open = extractFunction(source, 'openGalleryInspectTarget');
assert.ok(open.indexOf('completeGalleryInspectCameraTransition') < open.indexOf('prioritizeArtworkFullTexture'), 'Full texture is prioritized before transition completion');
assert.ok(!open.slice(0, open.indexOf('var startFocus')).includes('prioritizeArtworkFullTexture'), 'Full texture still starts before camera focus');

console.log('Stage 12C66C6A1 Inspect transition isolation and watchdog tests passed.');

})();

// --- test-stage12c66c6a1-mobile-inspect-ui.mjs ---
await (async () => {
const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');

function extractFunction(text, name) {
  const start = text.indexOf(`function ${name}(`);
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
      else if (char === '}') { depth -= 1; if (depth === 0) return text.slice(start, i + 1); }
    } else if (state === 'string') {
      if (char === '\\') i += 1; else if (char === quote) { state = 'code'; quote = null; }
    } else if (state === 'line') { if (char === '\n') state = 'code'; }
    else if (state === 'block' && char === '*' && next === '/') { state = 'code'; i += 1; }
  }
  throw new Error(`Unterminated function ${name}`);
}

let joystickResets = 0;
let gestureResets = 0;
const attrs = {};
const classes = new Map();
const context = {
  mobileViewerEnabled: true,
  editMode: false,
  mobileViewerUiRequestedVisible: false,
  mobileViewerControls: {
    style: { display: 'none' },
    setAttribute(name, value) { attrs[name] = value; }
  },
  galleryInspectRuntime: { active: false, opening: false },
  galleryInspectCameraRuntime: { state: 'WALK' },
  document: {
    body: { classList: { toggle(name, value) { classes.set(name, value); } } }
  },
  resetMobileJoystick() { joystickResets += 1; },
  resetMobileCanvasMoveGesture() { gestureResets += 1; },
  updateGalleryMobileInspectSafeFrame() {}
};
vm.createContext(context);
for (const name of [
  'isMobileViewerActive', 'isGalleryInspectSuppressingMobileViewerControls',
  'shouldShowMobileViewerControls', 'syncMobileViewerUiVisibility', 'setMobileViewerUiVisible'
]) vm.runInContext(extractFunction(source, name), context);

assert.equal(context.setMobileViewerUiVisible(true), true);
assert.equal(context.mobileViewerControls.style.display, 'block');
context.galleryInspectRuntime.active = true;
assert.equal(context.syncMobileViewerUiVisibility('inspect-open'), false);
assert.equal(context.mobileViewerControls.style.display, 'none');
assert.ok(joystickResets >= 1 && gestureResets >= 1, 'Hiding Inspect did not clear mobile movement owners');
assert.equal(context.setMobileViewerUiVisible(true), false, 'Viewport refresh resurrected the joystick during Inspect');
context.galleryInspectRuntime.active = false;
context.galleryInspectCameraRuntime.state = 'WALK';
assert.equal(context.syncMobileViewerUiVisibility('inspect-close'), true);
assert.equal(context.mobileViewerControls.style.display, 'block');
assert.equal(attrs['aria-hidden'], 'false');

const safeFrame = extractFunction(source, 'updateGalleryMobileInspectSafeFrame');
assert.ok(safeFrame.includes('mode = "compact-bottom"'), 'Compact bottom safe-frame missing');
assert.ok(safeFrame.includes('joystickVisible = false'), 'Inspect safe-frame still reserves joystick space');
assert.ok(!safeFrame.includes('getElementById("mobileJoystickBase")'), 'Safe-frame still measures the hidden joystick');

const cssStart = source.indexOf('/* STAGE 12C66C6A1 — COMPACT MOBILE INSPECT CAPSULE.');
const cssEnd = source.indexOf('.gallery-editor-primary-tabs', cssStart);
assert.ok(cssStart >= 0 && cssEnd > cssStart, 'Compact mobile CSS block missing');
const css = source.slice(cssStart, cssEnd);
assert.ok(css.includes('--gallery-inspect-navigation-size: 44px'), 'Compact circular navigation size missing');
assert.ok(css.includes('border-radius: 50% !important'), 'Mobile navigation is not circular');
assert.ok(css.includes('clip: rect(0, 0, 0, 0) !important'), 'Previous/Next labels are still visually occupying space');
assert.ok(css.includes('bottom: max(var(--gallery-mobile-inspect-bottom, 10px), env(safe-area-inset-bottom))'), 'Popup is not docked to the bottom safe-area');
assert.ok(css.includes('left: -24px !important'), 'Mobile avatar no longer protrudes like desktop UI');
assert.ok(!css.includes('grid-template-rows: minmax(var(--gallery-inspect-avatar-size), auto) auto'), 'Old two-row mobile popup remains active');

console.log('Stage 12C66C6A1 compact mobile Inspect UI and joystick ownership tests passed.');

})();
