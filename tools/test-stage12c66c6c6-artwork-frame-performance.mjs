import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src', 'Gallery_V0_11.js'), 'utf8');

function expect(label, condition) {
  if (!condition) throw new Error(`Artwork frame performance invariant failed: ${label}`);
  console.log(`✓ ${label}`);
}

function extractFunction(name) {
  const starts = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const marker of starts) {
    start = source.indexOf(marker);
    if (start >= 0) break;
  }
  if (start < 0) throw new Error(`Missing function ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  let mode = 'code';
  let quote = '';
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

const prefetch = extractFunction('prefetchGalleryArtworkFrameCatalogAssets');
const applyFrame = extractFunction('applyArtworkFrameState');
const runtimeCreate = extractFunction('createArtworkFrameRuntimeFromInstance');

expect('C6C6 performance stage is recorded',
  source.includes('Stage 12C66C6C6: Artwork Frame Runtime Performance'));

expect('Frame GLBs prefetch in parallel',
  prefetch.includes('var tasks = queue.map(') &&
  prefetch.includes('Promise.all(tasks)') &&
  !prefetch.includes('for (var i = 0; i < queue.length; i++)'));

expect('Frame library warmup starts on Edit Mode entry',
  source.includes('setEditorUiVisible(true);\n            warmGalleryArtworkFrameLibrary();'));

expect('Per-variant runtime descriptor cache avoids repeated bounds setup',
  source.includes('var galleryArtworkFrameRuntimeDescriptorCache = {};') &&
  runtimeCreate.includes('galleryArtworkFrameRuntimeDescriptorCache[descriptorKey]') &&
  runtimeCreate.includes('applyArtworkFrameRuntimeDescriptor(orientationRoot, descriptor)'));

expect('Frame assignment no longer performs full-scene material scan',
  !applyFrame.includes('refreshCommonLightingMaterialSupport();') &&
  source.includes('configureArtworkFrameMeshesForLighting(meshes);'));

expect('Frame assignment no longer performs full Local Light target rebuild',
  !applyFrame.includes('refreshAllCommonLocalLightTargets();') &&
  applyFrame.includes('syncArtworkFrameLocalLightMembership(artwork, previousFrameMeshes'));

expect('Incremental Local Light membership preserves artwork lighting',
  source.includes('hadArtworkTarget') &&
  source.includes('hadPreviousFrameTarget') &&
  source.includes('setLocalLightIncludedMeshesIfChanged(item, next'));

console.log('Artwork frame performance invariants passed.');
