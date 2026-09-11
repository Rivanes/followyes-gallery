import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const admin = read('src/bootstrap/admin-workspace-bootstrap.js');
const controller = read('src/runtime/scene-lifecycle-controller.js');
const orchestrator = read('src/runtime/scene-loading-orchestrator.js');
const pkg = JSON.parse(read('package.json'));

function functionBody(source, name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}`);
  const signatureEnd = source.indexOf(') {', start);
  const open = signatureEnd >= 0 ? signatureEnd + 2 : source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let line = false;
  let block = false;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1] || '';
    if (line) { if (ch === '\n') line = false; continue; }
    if (block) { if (ch === '*' && next === '/') { block = false; i += 1; } continue; }
    if (quote) { if (ch === '\\') { i += 1; continue; } if (ch === quote) quote = null; continue; }
    if (ch === '/' && next === '/') { line = true; i += 1; continue; }
    if (ch === '/' && next === '*') { block = true; i += 1; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unterminated ${name}`);
}

const selectBody = functionBody(admin, 'selectAndSwitchExhibition');
const galleryShortcutBody = functionBody(admin, 'handleCreateExhibitionForGallery');

// V14.2.3: creation must enter through the existing Admin selection/orchestrator path.
assert.ok(admin.includes('const entered = await selectAndSwitchExhibition(created.id, {'));
assert.ok(admin.includes('skipConfirm: true'));
assert.ok(admin.includes('reason: "admin-exhibition-create-enter"'));
assert.ok(admin.includes('Entering ${option.textContent} through the canonical Scene lifecycle.'));
assert.ok(admin.includes('Exhibition was created, but its Gallery could not be opened:'));

// The selection helper must remain the only Admin bridge to the Scene authority.
assert.ok(selectBody.includes('sceneLifecycleController.switchTo(id, {'));
assert.ok(selectBody.includes('forceRemote: true'));
assert.ok(selectBody.includes('reason: options.reason || "admin-exhibition-switch"'));
assert.ok(selectBody.includes('sceneOptions: { adminWorkspace: true }'));
assert.ok(selectBody.includes('const crossSpace = result.mode === "cross-space-scene-recreate"'));
assert.ok(!selectBody.includes('window.GalleryApp.switchExhibition('), 'Admin bootstrap must not bypass the Scene authority with a direct core switch');

// Existing lifecycle authority still owns the physical same-/cross-space decision.
assert.ok(controller.includes('areRuntimesSameVenueVersion(previousRuntime, targetRuntime)'));
assert.ok(controller.includes('debug.lastMode = "same-venue-version"'));
assert.ok(controller.includes('debug.lastMode = "cross-space-scene-recreate"'));
assert.ok(orchestrator.includes('return Object.freeze({\n    start,\n    switchTo,'));

// Gallery shortcut never creates against an active Draft. It resolves the Published version,
// preselects the same canonical create form, and leaves record creation to that one flow.
assert.ok(admin.includes('id="createExhibitionForGalleryButton"'));
assert.ok(admin.includes('CREATE EXHIBITION IN THIS GALLERY'));
assert.ok(galleryShortcutBody.includes('const published = galleryPublishedVersion(detail)'));
assert.ok(galleryShortcutBody.includes('const value = `${venue.id}|${published.id}`'));
assert.ok(galleryShortcutBody.includes('await refreshExhibitionCreationTargets()'));
assert.ok(galleryShortcutBody.includes('newExhibitionGallery.value = value'));
assert.ok(galleryShortcutBody.includes('newExhibitionName.focus()'));
assert.ok(!galleryShortcutBody.includes('exhibitionData.create('), 'Gallery shortcut must not fork the canonical create flow');

// Cache/version gate makes the new bootstrap transition path deploy-safe.
assert.equal(pkg.version, '0.14.2-v14-2-4-exhibition-workspace-cleanup');
assert.ok(pkg.scripts.test.includes('test:creation-lifecycle'));
assert.ok(admin.includes('v14_2_4_exhibition_workspace_cleanup_20260911'));

console.log('V14.2.3 creation -> canonical Scene lifecycle + Published Gallery shortcut invariants passed.');
