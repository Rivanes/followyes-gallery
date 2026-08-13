import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src', 'Gallery_V0_11.js'), 'utf8');
const viewer = fs.readFileSync(path.join(root, 'src', 'bootstrap', 'gallery-viewer-bootstrap.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function expect(label, condition) {
  if (!condition) throw new Error(`Space residency invariant failed: ${label}`);
  console.log(`✓ ${label}`);
}

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const marker of markers) {
    start = source.indexOf(marker);
    if (start >= 0) break;
  }
  if (start < 0) throw new Error(`Missing function ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0, mode = 'code', quote = '';
  for (let i = brace; i < source.length; i++) {
    const c = source[i], n = source[i + 1] || '';
    if (mode === 'code') {
      if (c === '"' || c === "'" || c === '`') { mode = 'string'; quote = c; }
      else if (c === '/' && n === '/') { mode = 'line'; i++; }
      else if (c === '/' && n === '*') { mode = 'block'; i++; }
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return source.slice(start, i + 1);
    } else if (mode === 'string') {
      if (c === '\\') i++;
      else if (c === quote) mode = 'code';
    } else if (mode === 'line' && c === '\n') mode = 'code';
    else if (mode === 'block' && c === '*' && n === '/') { mode = 'code'; i++; }
  }
  throw new Error(`Unterminated function ${name}`);
}

const switchFn = extractFunction('switchGalleryExhibition');
const deltaFn = extractFunction('applyGallerySameSpaceExhibitionState');
const finalizeFn = extractFunction('finalizeGallerySameSpaceExhibitionDelta');
const objectDirtyFn = extractFunction('markGalleryObjectsDirty');
const editTourHelper = extractFunction('ensureGalleryExhibitTourCurrent');

expect('Runtime identity includes C6C8C4 residency in current C6C8C5 build', source.includes('Stage 12C66C6C8C4: Space Residency / Exhibition Delta Switch') && source.includes('stage: "12C66C6C8C10"') && pkg.version.includes('c6c8c10'));
expect('Switch explicitly compares source and target space_id', switchFn.includes('areGalleryExhibitionsInSameSpace(previousExhibition, exhibition)'));
expect('Same-space cold switch uses delta state and resident return has a dedicated resume path', switchFn.includes('applyGallerySameSpaceExhibitionState(state, "same-space-exhibition-switch")') && switchFn.includes('lastSwitchMode = "same-space-delta-load"') && switchFn.includes('lastSwitchMode = "resident-layer-resume"'));
expect('Full reset remains only as fallback for a real Space change', switchFn.includes('else {\n                resetGalleryRuntimeToBlankExhibition();'));
expect('Delta apply suppresses duplicated wall/presentation/global refresh work', deltaFn.includes('skipWalls: true') && deltaFn.includes('skipSpacePresentation: true') && deltaFn.includes('deferGlobalRefresh: true'));
expect('Same-space finalization refreshes only Exhibition collisions before one global batch', finalizeFn.includes('refreshViewerExhibitionCollisionMeshes();') && !finalizeFn.includes('refreshViewerCollisionMeshes();'));
expect('Object changes no longer clear resident Space static world-bounds cache', !objectDirtyFn.includes('markLocalLightTargetCacheDirty') && objectDirtyFn.includes('clearLocalLightTargetMeshCacheForAll'));
expect('Edit/Admin entry does not unconditionally rebuild Tour paths', !source.includes('ensureGalleryExhibitTourCurrent("enter-edit-mode")') && !source.includes('ensureGalleryExhibitTourCurrent("same-runtime-admin-enter")') && editTourHelper.includes('needsRebuild'));
expect('Same-runtime Viewer/Admin path is still present', viewer.includes('engine: activeEngine') && viewer.includes('scene: activeScene'));
expect('Debug counters expose residency behavior', source.includes('sameSpaceSwitchCount: galleryExhibitionRuntime.sameSpaceSwitchCount') && source.includes('fullRuntimeResetCount: galleryExhibitionRuntime.fullRuntimeResetCount'));

console.log('Space Residency / Exhibition Delta Switch invariants passed.');
