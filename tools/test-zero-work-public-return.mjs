import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('src/Gallery_V0_11.js', root), 'utf8');
const viewer = fs.readFileSync(new URL('src/bootstrap/gallery-viewer-bootstrap.js', root), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'));

function expect(label, ok) {
  if (!ok) throw new Error(`C6C8C14 regression: ${label}`);
}

function extractFunction(text, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const marker of markers) {
    start = text.indexOf(marker);
    if (start >= 0) break;
  }
  if (start < 0) throw new Error(`Missing function ${name}`);
  const bodyStart = text.indexOf('{', start);
  let depth = 0, quote = null, line = false, block = false;
  for (let i = bodyStart; i < text.length; i += 1) {
    const c = text[i], n = text[i + 1] || '';
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i += 1; } continue; }
    if (quote) { if (c === '\\') { i += 1; continue; } if (c === quote) quote = null; continue; }
    if (c === '/' && n === '/') { line = true; i += 1; continue; }
    if (c === '/' && n === '*') { block = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`Unterminated function ${name}`);
}

const modeFn = extractFunction(source, 'setGallerySameRuntimeModeState');
const selectionFn = extractFunction(source, 'clearGalleryEditSelectionFastForWorkspaceReturn');
const presentationFn = extractFunction(source, 'applyGalleryViewerPresentationFastPath');
const repairFn = extractFunction(source, 'scheduleGalleryWorkspacePublicReturnDeferredRepair');
const closeFn = extractFunction(viewer, 'closeInlineAdminWorkspace');

expect('package stage', pkg.version.includes('c6c8c15'));
expect('runtime stage', source.includes('stage: "12C66C6C8C15"'));
expect('history marker', source.includes('Stage 12C66C6C8C14: Zero-Work Public Return'));

expect('public branch uses fast logical selection clear', modeFn.includes('clearGalleryEditSelectionFastForWorkspaceReturn()'));
expect('public branch uses fast presentation helper', modeFn.includes('applyGalleryViewerPresentationFastPath()'));
expect('public branch records zero collision rebuilds', modeFn.includes('collisionProxyRebuildsOnClickPath: 0'));
expect('mode switch does not invoke full placeholder refresh', !modeFn.includes('updateViewerModePlaceholderVisibility()'));

expect('fast selection clear skips hidden editor UI rebuilds',
  !selectionFn.includes('updateArtworkImageUi(') &&
  !selectionFn.includes('updateArtworkInfoUi(') &&
  !selectionFn.includes('updateLocalLightsUi(') &&
  !selectionFn.includes('refreshSculptureOutlines(') &&
  !selectionFn.includes('updateGalleryTourOrderUi('));

expect('fast presentation does not recalc sculpture bounds',
  !presentationFn.includes('refreshSculptureCollisionProxy(') &&
  !presentationFn.includes('applySculptureSlotVisualState(') &&
  !presentationFn.includes('updateModel3dSlotsVisibility('));
expect('existing collision proxies are reused', presentationFn.includes('enableExistingSculptureCollisionProxyForViewer('));
expect('missing proxy repair is deferred', repairFn.includes('requestIdleCallback') && repairFn.includes('refreshSculptureCollisionProxy(slot)'));

expect('clean return does not query delivery stats on click path',
  viewer.includes('const transitionBeforePromise = instantFastPath') &&
  viewer.includes('? null') &&
  viewer.includes('publishInstantWorkspaceModeDiagnostic'));
expect('clean return does not await admin housekeeping',
  viewer.includes('if (!instantFastPath) await suspendPromise'));
expect('clean return still keeps dirty fallback readiness',
  viewer.includes('waitForForegroundReady("admin-to-public-fallback"'));

console.log('C6C8C14 Zero-Work Public Return regression passed.');
