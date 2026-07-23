import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'src', 'Gallery_V0_11.js');
const productionMirrorPath = path.join(root, 'src', 'Gallery_V0_11.min.js');
const loginDisabledPath = path.join(root, 'Gallery_V0_11_STAGE12C66A_SAVE_INTEGRITY_LOGIN_DISABLED.txt');

const source = fs.readFileSync(sourcePath, 'utf8');
const loginEnabledMarker = 'var galleryEditorLoginEnabled = true;';
const markerCount = source.split(loginEnabledMarker).length - 1;

if (markerCount !== 1) {
  throw new Error(`Expected exactly one login-enabled marker, found ${markerCount}.`);
}

// Stage 12C66A intentionally keeps a byte-identical production mirror.
// This prevents source/production drift until a controlled minifier is added
// as part of the later build-pipeline stage.
fs.writeFileSync(productionMirrorPath, source, 'utf8');
fs.writeFileSync(
  loginDisabledPath,
  source.replace(loginEnabledMarker, 'var galleryEditorLoginEnabled = false;'),
  'utf8'
);

console.log('Stage 12C66A production mirror and login-disabled TXT regenerated.');
