import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src', 'Gallery_V0_11.js'), 'utf8');

function expect(label, condition) {
  if (!condition) throw new Error(`Artwork frame invariant failed: ${label}`);
  console.log(`✓ ${label}`);
}

expect('Storage folder is main/frames via the existing gallery bucket',
  source.includes('var galleryArtworkFrameStorageFolder = "frames";') &&
  source.includes('getGalleryArtworkFrameStoragePrefix()') &&
  source.includes('listGalleryStorageFilesRecursively(\n                galleryArtworkStorageBucket,\n                getGalleryArtworkFrameStoragePrefix()'));

expect('GLB catalog is dynamic instead of hard-coded variants',
  source.includes('/\\.glb$/i.test(entry.path)') &&
  source.includes('galleryArtworkFrameCatalog = (files || [])'));

expect('Frame state is serialized per artwork',
  source.includes('frame: getArtworkFrameStateForSave(artwork)'));

expect('Frame state is restored without inventing a second aspect system',
  source.includes('applyArtworkFrameState(') &&
  source.includes('var baseDimensions = getArtworkBaseDimensionsForCurrentImage(artwork);') &&
  source.includes('var transformState = getArtworkTransformState(artwork);'));

expect('Frame follows live artwork transforms and drag updates',
  source.includes('syncArtworkFrameRuntime(artwork);') &&
  source.includes('function updateArtworkLight(artwork) {\n        syncDetachedArtworkImagePlane(artwork);\n        syncArtworkFrameRuntime(artwork);'));

expect('Frame meshes map back to their artwork for picking',
  source.includes('mesh.metadata.isArtworkFrameMesh = true;') &&
  source.includes('(mesh.metadata.isArtworkImagePlane || mesh.metadata.isArtworkFrameMesh)'));

expect('Inspect focus includes frame meshes',
  source.includes('artwork.metadata.artworkFrameRuntime.meshes.forEach(function (mesh)'));

expect('Artwork-targeted local lights include frame meshes',
  source.includes('function addArtworkMeshesUnique(targetList)') &&
  source.includes('artwork.metadata.artworkFrameRuntime'));

expect('Deleting an artwork disposes its frame runtime',
  source.includes('disposeArtworkFrameRuntime(artwork);\n        disposeArtworkImageOnly(artwork);'));

expect('Editor exposes FRAME section between artwork tooling',
  source.includes('createEditorSection("FRAME")') &&
  source.includes('artworkFrameSectionData,'));

console.log('Artwork frame invariants passed.');
