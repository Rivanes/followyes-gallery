import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src', 'Gallery_V0_11.js'), 'utf8');

function expect(label, condition) {
  if (!condition) throw new Error(`Artwork frame fit invariant failed: ${label}`);
  console.log(`✓ ${label}`);
}

expect('Source history records C6C4 frame fit stage',
  source.includes('Stage 12C66C6C4: Artwork Frame Fit / Prefetch'));

expect('Default frame calibration exists',
  source.includes('var galleryArtworkFrameDefaultCalibration = {') &&
  source.includes('innerWidthRatio: 0.68') &&
  source.includes('innerHeightRatio: 0.68') &&
  source.includes('depthOverlapRatio: 0.92') &&
  source.includes('zRotationDegrees: 180'));

expect('Frame warmup preserves prefetch for variants already used by the active exhibition',
  source.includes('function getGalleryArtworkFrameWarmupEntries(catalog)') &&
  source.includes('prefetchGalleryArtworkFrameCatalogAssets(getGalleryArtworkFrameWarmupEntries(catalog))') &&
  !source.includes('prefetchGalleryArtworkFrameCatalogAssets(galleryArtworkFrameCatalog);'));

expect('Frame scaling uses calibrated inner opening instead of outer bounds',
  source.includes('var calibration = getArtworkFrameCalibration(frameState);') &&
  source.includes('var referenceWidth = Math.max(0.0001, outerWidth * calibration.innerWidthRatio);') &&
  source.includes('var referenceHeight = Math.max(0.0001, outerHeight * calibration.innerHeightRatio);'));

expect('Frame runtime applies required Z rotation',
  source.includes('runtime.root.rotation.z += runtime.zRotationRadians || 0;'));

expect('Frame runtime seats backward over artwork depth',
  source.includes('var overlapDepth = Math.min(frameDepthWorld, artworkDepthWorld)') &&
  source.includes('galleryArtworkFrameSurfaceEpsilon - overlapDepth;'));

console.log('Artwork frame fit invariants passed.');
