import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src', 'Gallery_V0_11.js'), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, 'src', 'bootstrap', 'gallery-viewer-bootstrap.js'), 'utf8');
const config = fs.readFileSync(path.join(root, 'src', 'config', 'gallery-space-config.js'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'SUPABASE_SQL', '01_STAGE_C6C7_C6C8_MULTI_EXHIBITION.sql'), 'utf8');

function expect(label, condition) {
  if (!condition) throw new Error(`Multi-exhibition invariant failed: ${label}`);
  console.log(`✓ ${label}`);
}

expect('Combined C6C7/C6C8 stage identity exists',
  source.includes('Stage 12C66C6C7C8: Space / Exhibition Split + Multi-Exhibition'));

expect('Scene factory accepts external runtime options',
  source.includes('export const createScene = function (engineArg, canvasArg, runtimeOptionsArg)') &&
  source.includes('runtimeOptions.spaceDefinition') &&
  bootstrap.includes('spaceDefinition: gallerySpaceDefinition') &&
  bootstrap.includes('exhibitionId: getRequestedExhibitionId()'));

expect('Current building GLBs live in external Space config',
  config.includes('Floor_segment.glb') && config.includes('Wall_segments.glb') &&
  config.includes('Ceiling.glb') && config.includes('Props.glb') &&
  source.includes('requireGallerySpaceAsset("floor")') &&
  source.includes('requireGallerySpaceAsset("walls")') &&
  source.includes('requireGallerySpaceAsset("ceiling")') &&
  source.includes('requireGallerySpaceAsset("props")'));

expect('gallery_state reads and saves by active exhibition instead of hard-coded main',
  source.includes('fetchGalleryStateRowForExhibition') &&
  source.includes('.eq("id", exhibitionId)') &&
  source.includes('var activeExhibitionId = typeof getActiveGalleryExhibitionId === "function"') &&
  source.includes('.eq("id", activeExhibitionId)') &&
  !source.includes('.eq("id", "main")'));

expect('Storage and save-integrity keys are scoped per exhibition',
  source.includes('getGalleryExhibitionStoragePrefix') &&
  source.includes('"exhibitions/" + exhibitionId') &&
  source.includes('getGalleryExhibitionBackupId') &&
  source.includes('gallerySaveIntegrityRuntime.remoteBackupId = getGalleryExhibitionBackupId(exhibitionId)'));

expect('Frame library remains shared at main/frames',
  source.includes('return "main/" + galleryArtworkFrameStorageFolder;'));

expect('Engine can create and switch exhibitions while catalog UI is external',
  !source.includes('createEditorSection("EXHIBITIONS")') &&
  source.includes('function createGalleryExhibition(') &&
  source.includes('function switchGalleryExhibition('));

expect('Switching clears only Exhibition runtime and restores Space baseline',
  source.includes('function captureGallerySpaceBaseline(') &&
  source.includes('function resetGalleryRuntimeToBlankExhibition(') &&
  source.includes('galleryExhibitionRuntime.spaceBaseline'));

expect('Serialized state carries Space/Exhibition context',
  source.includes('exhibitionId: getActiveGalleryExhibitionId()') &&
  source.includes('spaceId: galleryActiveSpaceId'));

expect('SQL creates exhibition catalog and keeps existing main in place',
  sql.includes('create table if not exists public.gallery_exhibitions') &&
  sql.includes("'main', 'Main Exhibition', 'main'") &&
  sql.includes("on conflict (id) do nothing") &&
  sql.includes("gallery-artworks/exhibitions/<exhibitionId>"));

expect('SQL scopes public state/media to published exhibitions while admin can edit drafts',
  sql.includes('Public can read published gallery state') &&
  sql.includes('gallery_artworks_public_select_scoped') &&
  sql.includes("auth.jwt() ->> 'email' = 'admin@followyes.pl'"));

console.log('Stage 12C66C6C7C8 multi-exhibition invariants passed.');
