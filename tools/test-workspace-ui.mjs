import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import vm from 'node:vm';

// Consolidated regression suite. Each block is isolated so legacy variable names cannot collide.

// --- test-instant-workspace-mode-switch.mjs ---
await (async () => {
const root = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('src/Gallery_V0_11.js', root), 'utf8');
const viewer = fs.readFileSync(new URL('src/bootstrap/gallery-viewer-bootstrap.js', root), 'utf8');
const admin = fs.readFileSync(new URL('src/bootstrap/admin-workspace-bootstrap.js', root), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'));

function expect(label, ok) {
  if (!ok) throw new Error(`C6C8C13 regression: ${label}`);
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
  let depth = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let i = bodyStart; i < text.length; i += 1) {
    const c = text[i];
    const n = text[i + 1] || '';
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (blockComment) { if (c === '*' && n === '/') { blockComment = false; i += 1; } continue; }
    if (quote) { if (c === '\\') { i += 1; continue; } if (c === quote) quote = null; continue; }
    if (c === '/' && n === '/') { lineComment = true; i += 1; continue; }
    if (c === '/' && n === '*') { blockComment = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`Unterminated function ${name}`);
}

const modeFn = extractFunction(source, 'setGallerySameRuntimeModeState');
const resumeFn = extractFunction(admin, 'resumeAdminWorkspace');

expect('current package stage', pkg.version.includes('c6c8c16'));
expect('current runtime stage', source.includes('stage: "12C66C6C8C16"'));
expect('history marker', source.includes('Stage 12C66C6C8C13: Instant Workspace Mode Switch'));
expect('mode switch preserves foreground readiness', !modeFn.includes('markGalleryForegroundNotReady('));
expect('mode switch avoids synchronous owner sweep', !modeFn.includes('sweepGalleryInactiveExhibitionOwners('));
expect('mode switch avoids synchronous space verification', !modeFn.includes('verifyGallerySpaceIntegrity(') && !modeFn.includes('verifyGalleryCanonicalSpaceIntegrity('));
expect('mode switch records instant UI-only mode', modeFn.includes('instant-workspace-ui-only') && modeFn.includes('foregroundPreserved: true'));
expect('integrity audit moved to idle', source.includes('function scheduleGalleryWorkspaceModeBackgroundAudit(') && source.includes('requestIdleCallback(runAudit'));
expect('fast path safety API exists', source.includes('canUseInstantWorkspaceModeSwitch: function ()'));
expect('clean Admin to Public skips full-page guard', viewer.includes('const instantFastPath = (preserveDraft || !sceneDirty) && canUseInstantWorkspaceModeSwitch()') && viewer.includes('if (!instantFastPath)'));
expect('clean Admin to Public skips foreground wait', viewer.includes('if (!instantFastPath && window.GalleryApp') && !viewer.includes('waitForForegroundReady("admin-to-public"'));
expect('C6C8C14 keeps C6C8C13 diagnostics off the clean click path', viewer.includes('const transitionBeforePromise = instantFastPath') && viewer.includes('? null') && viewer.includes('publishInstantWorkspaceModeDiagnostic'));
expect('Admin telemetry resume is asynchronous', resumeFn.includes('void updateAssetDeliveryStatus().catch(() => null)'));

console.log('C6C8C13 Instant Workspace Mode Switch regression passed.');

})();

// --- test-zero-work-public-return.mjs ---
await (async () => {
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

expect('package stage', pkg.version.includes('c6c8c16'));
expect('runtime stage', source.includes('stage: "12C66C6C8C16"'));
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

})();

// --- test-persistent-draft-public-preview.mjs ---
await (async () => {
const root = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('src/Gallery_V0_11.js', root), 'utf8');
const viewer = fs.readFileSync(new URL('src/bootstrap/gallery-viewer-bootstrap.js', root), 'utf8');
const admin = fs.readFileSync(new URL('src/bootstrap/admin-workspace-bootstrap.js', root), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'));

function expect(label, ok) {
  if (!ok) throw new Error(`C6C8C15 regression: ${label}`);
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

const exitFn = extractFunction(source, 'exitGalleryAdminWorkspaceMode');
const enterFn = extractFunction(source, 'enterGalleryAdminWorkspaceMode');
const hasUnsavedFn = extractFunction(source, 'hasGalleryUnsavedChanges');

expect('package identity', pkg.version.includes('c6c8c16'));
expect('runtime identity', source.includes('stage: "12C66C6C8C16"'));
expect('history marker', source.includes('Stage 12C66C6C8C15: Persistent Draft / Instant Public Preview'));

expect('PUBLIC PAGE uses non-destructive inline preview',
  admin.includes('inlineRuntimeContext.close({ preserveDraft: true, reason: "public-preview" })'));
expect('PUBLIC PAGE no longer uses discard confirmation',
  !admin.includes('Discard them and return to the public Viewer?'));

expect('viewer forwards preserveDraft into engine exit',
  viewer.includes('exitAdminWorkspaceMode({ discardUnsaved, preserveDraft })'));
expect('dirty draft is eligible for instant same-runtime path',
  viewer.includes('(preserveDraft || !sceneDirty) && canUseInstantWorkspaceModeSwitch()'));
expect('preserved draft bypasses destructive confirmation',
  viewer.includes('!preserveDraft && !discardUnsaved'));

expect('engine exit has explicit preserveDraft path',
  exitFn.includes('var preserveDraft = options.preserveDraft === true'));
expect('engine only discards when draft is not preserved',
  exitFn.includes('if (sceneDraftDirty && !preserveDraft)'));
expect('engine records draft-preview residency',
  exitFn.includes('galleryAdminDraftPreviewActive = !!(preserveDraft && sceneDraftDirty)'));
expect('engine exit itself does not reapply gallery state',
  !exitFn.includes('applyGalleryState('));
expect('unsaved state remains visible outside Admin while previewing',
  hasUnsavedFn.includes('!galleryAdminWorkspaceMode && !galleryAdminDraftPreviewActive'));
expect('re-entering Admin clears preview mode without clearing draft',
  enterFn.includes('galleryAdminDraftPreviewActive = false') && !enterFn.includes('discardGalleryUnsavedChanges('));

expect('metadata draft survives hidden Public Preview',
  admin.includes('metadataDraftPreviewActive = options.preserveDraft === true && metadataDirty'));
expect('metadata form is not reset on resume for same exhibition',
  admin.includes('const preserveMetadataDraft = metadataDraftPreviewActive && metadataDirty') &&
  admin.includes('if (catalog.length && !sameDraftExhibition) syncSelectedFromCatalog(active.id)'));

console.log('C6C8C15 Persistent Draft / Instant Public Preview regression passed.');

})();

// --- test-mobile-ui-polish-inspect-cursor.mjs ---
await (async () => {
const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');

// 1) Intro CTA must live outside the scrollable instruction body.
const introStart = source.indexOf('<div id="berryboyViewerIntroCard"');
const scrollStart = source.indexOf('<div class="berryboyIntroScrollable">', introStart);
const scrollEnd = source.indexOf('</div>\n\n                    <div class="berryboyIntroFooter">', scrollStart);
const footerStart = source.indexOf('<div class="berryboyIntroFooter">', scrollStart);
const buttonStart = source.indexOf('<button id="berryboyIntroStart"', footerStart);
assert.ok(introStart >= 0 && scrollStart > introStart, 'Intro scroll body missing');
assert.ok(scrollEnd > scrollStart, 'Intro scroll body does not close before footer');
assert.ok(footerStart > scrollEnd && buttonStart > footerStart, 'Start exploring is not isolated in pinned footer');
assert.ok(source.includes('max-height: calc(100dvh - 20px - env(safe-area-inset-top) - env(safe-area-inset-bottom))'), 'Mobile intro does not use dynamic viewport/safe-area height');
assert.ok(source.includes('.berryboyIntroScrollable {\n                min-height: 0;\n                overflow: auto;'), 'Instructions are not independently scrollable');

// 2) Mobile Inspect navigation must no longer reserve a wide right column in metadata.
const mobileInspectStart = source.indexOf('/* STAGE 12C66C6A1 — COMPACT MOBILE INSPECT CAPSULE.');
const mobileInspectEnd = source.indexOf('@media (max-width: 768px) and (orientation: landscape)', mobileInspectStart);
assert.ok(mobileInspectStart >= 0 && mobileInspectEnd > mobileInspectStart, 'Mobile Inspect CSS block missing');
const mobileInspectCss = source.slice(mobileInspectStart, mobileInspectEnd);
assert.ok(mobileInspectCss.includes('padding: 14px 16px 14px 58px !important;'), 'Mobile metadata still reserves the old navigation column');
assert.ok(!mobileInspectCss.includes('padding: 14px 114px 14px 58px !important;'), 'Old navigation width reservation remains');
assert.ok(mobileInspectCss.includes('top: calc(0px - (var(--gallery-inspect-navigation-size) * 0.46)) !important;'), 'Mobile navigation is not floating on the popup edge');
assert.ok(mobileInspectCss.includes('transform: none !important;'), 'Mobile navigation still uses the old centered-row transform');

// 3) Floor cursor must stay SDF-based but be physically and visually lighter.
assert.ok(source.includes('var galleryFloorCursorPulseDurationMs = 420;'), 'Cursor ripple duration was not shortened');
assert.ok(source.includes('{ size: 0.78, sideOrientation: BABYLON.Mesh.DOUBLESIDE }'), 'Cursor plane was not reduced');
assert.ok(source.includes('softRing(0.278, 0.0085, 0.006)'), 'Thin cursor core missing');
assert.ok(source.includes('softRing(0.278, 0.018, 0.011) * baseAlpha * 0.22'), 'Subtle cursor halo missing');
assert.ok(source.includes('galleryFloorCursorRingMaterial.setFloat("baseAlpha", 0.78);'), 'Hover cursor alpha was not reduced');
assert.ok(!source.includes('softRing(0.275, 0.041, 0.010) * baseAlpha * 0.56'), 'Heavy legacy cursor halo remains');

console.log('C6C8C16 mobile UI polish / Inspect layout / cursor refresh tests passed.');

})();
