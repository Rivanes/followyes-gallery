import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'src', 'Gallery_V0_11.js');
const productionMirrorPath = path.join(root, 'src', 'Gallery_V0_11.min.js');
const loginDisabledPath = path.join(root, 'Gallery_V0_11_STAGE12C66B1_SINGLE_STARTUP_CLEAN_VIEWER_LOGIN_DISABLED.txt');

const source = fs.readFileSync(sourcePath, 'utf8');
const loginEnabledMarker = 'var galleryEditorLoginEnabled = true;';
const markerCount = source.split(loginEnabledMarker).length - 1;

if (markerCount !== 1) {
  throw new Error(`Expected exactly one login-enabled marker, found ${markerCount}.`);
}

// Stage 12C66B1 keeps a byte-identical production mirror to prevent source/runtime drift.
fs.writeFileSync(productionMirrorPath, source, 'utf8');
fs.writeFileSync(
  loginDisabledPath,
  source.replace(loginEnabledMarker, 'var galleryEditorLoginEnabled = false;'),
  'utf8'
);

console.log('Stage 12C66B1 production mirror and login-disabled TXT regenerated.');
