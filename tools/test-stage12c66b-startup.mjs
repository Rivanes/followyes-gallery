import fs from 'node:fs';
import vm from 'node:vm';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bootstrap = fs.readFileSync(new URL('../src/bootstrap/gallery-viewer-bootstrap.js', import.meta.url), 'utf8');
const engine = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Static order checks: no engine dependency or scene creation can occur before the explicit start promise.
assert(!index.includes('<script src="https://cdn.babylonjs.com/babylon.js"'), 'Babylon is still eager in index.html');
assert(!bootstrap.includes('import { createScene }'), 'createScene is still statically imported');
const waitIndex = bootstrap.indexOf('await bootGuard.waitForStart();');
const startIndex = bootstrap.indexOf('await startGalleryRuntime();');
assert(waitIndex >= 0 && startIndex > waitIndex, 'Runtime does not wait for explicit start');
assert(engine.split('new CustomEvent("gallery-ready"').length - 1 === 1, 'gallery-ready is not single-source');
assert(!engine.includes('customLoadingScreen'), 'Legacy custom loader remains');
assert(!engine.includes('berryboyViewerIntroOverlay'), 'Legacy engine intro overlay remains');

// Execute the BootGuard controller in a minimal DOM to validate its state machine.
const scriptMatches = [...index.matchAll(/<script>([\s\S]*?)<\/script>/g)];
for (const [scriptIndex, match] of scriptMatches.entries()) {
  new vm.Script(match[1], { filename: `index-inline-${scriptIndex + 1}.js` });
}
const bootScript = scriptMatches.map((match) => match[1]).find((code) => code.includes('single-public-startup-gate.v1'));
assert(bootScript, 'BootGuard inline controller not found');

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  toggle(value, force) {
    if (force === undefined) force = !this.values.has(value);
    if (force) this.values.add(value); else this.values.delete(value);
  }
  contains(value) { return this.values.has(value); }
}

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.textContent = '';
    this.style = {};
    this.dataset = {};
    this.classList = new FakeClassList();
    this.listeners = {};
    this.attrs = {};
    this.children = {};
  }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  click() { if (this.listeners.click) this.listeners.click({ preventDefault() {} }); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  querySelector(selector) { return this.children[selector] || null; }
}

const ids = [
  'galleryBootGuard', 'galleryBootTitle', 'galleryBootMessage', 'galleryBootTimefiller',
  'galleryBootDetails', 'galleryBootStart', 'galleryBootEnter', 'galleryBootAbout',
  'galleryBootReload', 'galleryBootExternal'
];
const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement(id)]));
elements.galleryBootGuard.dataset.state = 'prestart';
const controls = {
  '[data-control="desktop-move"]': new FakeElement(),
  '[data-control="desktop-look"]': new FakeElement(),
  '[data-control="mobile-move"]': new FakeElement(),
  '[data-control="inspect"]': new FakeElement()
};
for (const control of Object.values(controls)) {
  control.children.strong = new FakeElement();
  control.children.span = new FakeElement();
}
const lookMiddle = new FakeElement();
lookMiddle.attrs['data-gallery-look-mode'] = 'middle';
const lookRight = new FakeElement();
lookRight.attrs['data-gallery-look-mode'] = 'right';
for (const button of [lookMiddle, lookRight]) {
  button.getAttribute = function (name) { return this.attrs[name] || null; };
}

const windowListeners = {};
let intervalCallback = null;
const context = {
  console,
  Promise,
  CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
  localStorage: {
    values: new Map([['berryboy_art_gallery_lang', 'pl']]),
    getItem(key) { return this.values.get(key) || null; },
    setItem(key, value) { this.values.set(key, String(value)); }
  },
  document: {
    getElementById(id) { return elements[id] || null; },
    querySelector(selector) { return controls[selector] || null; },
    querySelectorAll(selector) { return selector === '[data-gallery-look-mode]' ? [lookMiddle, lookRight] : []; }
  },
  window: {
    setTimeout(fn) { return 1; },
    clearTimeout() {},
    setInterval(fn) { intervalCallback = fn; return 2; },
    clearInterval() { intervalCallback = null; },
    addEventListener(type, handler) { windowListeners[type] = handler; },
    dispatchEvent() {},
    location: { reload() {} },
    GalleryApp: null,
    BerryboyBootGuard: null
  }
};
context.window.window = context.window;
context.window.localStorage = context.localStorage;
context.window.document = context.document;
vm.createContext(context);
vm.runInContext(bootScript, context, { filename: 'bootguard-inline.js' });

const guard = context.window.BerryboyBootGuard;
assert(guard && guard.state === 'prestart', 'BootGuard does not begin in prestart');
assert(elements.galleryBootGuard.dataset.state === 'prestart', 'Prestart DOM state missing');
assert(elements.galleryBootTitle.textContent === 'Berryboy Art Gallery', 'Prestart title incorrect');

const startPromise = guard.waitForStart();
elements.galleryBootStart.click();
const startResult = await startPromise;
assert(startResult && guard.state === 'loading', 'Start click does not enter loading state');
assert(elements.galleryBootTimefiller.textContent.includes('Za chwilę'), 'Polish timefiller did not render');
if (intervalCallback) intervalCallback();

guard.setPhase('technical-test', 'Loaded 7 lights');
assert(!elements.galleryBootMessage.textContent.includes('7 lights'), 'Technical phase leaked into public message');

guard.ready();
assert(guard.state === 'ready', 'Ready state was not reached');
const entryPromise = guard.waitForEntry();
elements.galleryBootEnter.click();
await entryPromise;
assert(guard.state === 'hidden', 'Final entry does not hide BootGuard');
assert(elements.galleryBootGuard.classList.contains('is-hidden'), 'Hidden class missing after entry');

console.log('Stage 12C66B startup state-machine test passed.');
