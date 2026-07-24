import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

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

// The accepted Stage 12C66A1 popup must remain byte-identical.
assert.equal(
  sha(extractFunction(source, 'createViewerIntroOverlayStyles')),
  '93595efee4b7f720f32b5a8b739f6212bcea793ed8bdc88e939ea243b74262d6'
);
assert.equal(
  sha(extractFunction(source, 'showViewerIntroOverlay')),
  'fb4b8f6a0b72653489b10564492ffad9f52ba461bf67cb1992bd21e655aaf537'
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

console.log('Stage 12C66C5 startup and original-popup tests passed.');
