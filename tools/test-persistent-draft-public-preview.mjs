import fs from 'node:fs';

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
