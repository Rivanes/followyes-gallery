import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
const transitionGuard = fs.readFileSync(new URL('../src/bootstrap/transition-guard.js', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../src/bootstrap/admin-workspace-bootstrap.js', import.meta.url), 'utf8');

function expect(label, condition) {
  if (!condition) throw new Error(`C6C8C7 regression: ${label}`);
}
function extractFunction(text, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const marker of markers) { start = text.indexOf(marker); if (start >= 0) break; }
  if (start < 0) throw new Error(`Missing function ${name}`);
  const brace = text.indexOf('{', start);
  let depth = 0, mode = 'code', quote = '';
  for (let i = brace; i < text.length; i += 1) {
    const c = text[i], n = text[i + 1] || '';
    if (mode === 'code') {
      if (c === '"' || c === "'" || c === '`') { mode = 'string'; quote = c; }
      else if (c === '/' && n === '/') { mode = 'line'; i += 1; }
      else if (c === '/' && n === '*') { mode = 'block'; i += 1; }
      else if (c === '{') depth += 1;
      else if (c === '}' && --depth === 0) return text.slice(start, i + 1);
    } else if (mode === 'string') {
      if (c === '\\') i += 1;
      else if (c === quote) mode = 'code';
    } else if (mode === 'line' && c === '\n') mode = 'code';
    else if (mode === 'block' && c === '*' && n === '/') { mode = 'code'; i += 1; }
  }
  throw new Error(`Unterminated ${name}`);
}

expect('stage identity', source.includes('stage: "12C66C6C8C15"') && source.includes('exhibition-platform-multi-exhibition.v10'));
expect('space ownership tagging', source.includes('tagGallerySpaceCollection(wallMeshes, "wall")') && source.includes('registerGallerySpaceIntegrityBaseline("wall", wallMeshes)'));
expect('canonical Space integrity guard', source.includes('function verifyGalleryCanonicalSpaceIntegrity(') && source.includes('canonical-after-exhibition-switch-'));
expect('Space ancestor roots are owned and integrity checked', source.includes('function tagGallerySpaceAncestorChain(') && source.includes('entry.ancestors || []'));
expect('Viewer/Admin mode transition preserves Space integrity via deferred audit', source.includes('function scheduleGalleryWorkspaceModeBackgroundAudit(') && source.includes('verifyGalleryCanonicalSpaceIntegrity("workspace-mode-idle-space-integrity")'));
expect('complete artwork parking', source.includes('glowPlane') && source.includes('frameRoot'));
expect('complete sculpture parking', source.includes('runtimeRoots') && source.includes('sculptureCollisionProxy'));
expect('complete Local Light parking', source.includes('helperMeshes') && source.includes('cancelGalleryLocalLightDeferredWork(item)'));
expect('atomic first-load hydration', source.includes('galleryExhibitionRuntime.hydrationActive = true') && source.includes('galleryFastStartRuntime.stateApplyActive = true') && source.includes('startupBatchHydrationActive = true'));
expect('per-item light refresh suppressed during hydration', source.includes('!galleryExhibitionRuntime.hydrationActive && !(galleryFastStartRuntime && galleryFastStartRuntime.stateApplyActive)'));
expect('Tour is deferred', source.includes('scheduleGalleryDeferredTourAfterHydration') && !extractFunction(source, 'finalizeGallerySameSpaceExhibitionDelta').includes('rebuildGalleryExhibitTour({'));
expect('lighting retarget/shadows are deferred', extractFunction(source, 'finalizeGallerySameSpaceExhibitionDelta').includes('runGalleryFastStartIdleTask'));
expect('transition overlay crosses a real task boundary', transitionGuard.includes('setTimeout(resolve, 34)'));
expect('Admin shows CPU + Space diagnostics', admin.includes('CPU: prepare') && admin.includes('Space ${integrity.ok ? "OK" : "FAIL"}'));

// Behavioral ownership test: even if a bad runtime hierarchy accidentally puts a Space
// node below an Exhibition node, recursive Exhibition cleanup must be blocked before dispose().
const runtime = { ownershipViolations: 0, blockedSpaceDisposals: 0 };
const context = {
  galleryExhibitionRuntime: runtime,
  normalizeGalleryRuntimeId: (value, fallback) => String(value || fallback || ''),
  getActiveGalleryExhibitionId: () => 'main',
  console: { error() {}, warn() {} }
};
vm.createContext(context);
for (const name of ['isGallerySpaceOwnedNode', 'getGalleryNodeOwnerId', 'canGalleryExhibitionMutateNode', 'disposeGalleryExhibitionOwnedNode']) {
  vm.runInContext(`${extractFunction(source, name)}; this.${name}=${name};`, context);
}
const spaceChild = {
  name: 'Wall_segment_001',
  metadata: { galleryOwnerType: 'space', galleryOwnerId: 'main-space', galleryOwnerRole: 'wall' },
  disposed: false,
  isDisposed() { return this.disposed; },
  dispose() { this.disposed = true; }
};
const exhibitionRoot = {
  name: 'SculptureRuntime',
  metadata: { galleryOwnerType: 'exhibition', galleryOwnerId: 'main' },
  disposed: false,
  isDisposed() { return this.disposed; },
  getDescendants() { return [spaceChild]; },
  dispose() { this.disposed = true; }
};
const allowed = context.disposeGalleryExhibitionOwnedNode(exhibitionRoot, 'main', 'test-recursive-dispose', true);
expect('recursive dispose blocked when Space child is detected', allowed === false && !exhibitionRoot.disposed && !spaceChild.disposed);
expect('ownership violation is counted', runtime.ownershipViolations >= 1 && runtime.blockedSpaceDisposals >= 1);

console.log('C6C8C7 Scene Ownership / Atomic Exhibition Hydration regression passed.');
