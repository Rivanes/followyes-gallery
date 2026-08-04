import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../src/gallery-engine.js', import.meta.url), 'utf8');

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

console.log('Mobile Inspect Ui tests passed.');
