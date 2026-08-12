import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenizer } from './vendor/acorn.mjs';
import { gallerySpaceDefinition } from '../src/config/gallery-space-config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'src', 'Gallery_V0_11.js');
const productionPath = path.join(root, 'src', 'Gallery_V0_11.min.js');
const loginDisabledPath = path.join(root, 'Gallery_V0_11_STAGE12C66C6C8C1_RUNTIME_LIFECYCLE_ADMIN_TRANSITION_FIX_LOGIN_DISABLED.txt');
const source = fs.readFileSync(sourcePath, 'utf8');
const loginEnabledMarker = 'var galleryEditorLoginEnabled = true;';
const markerCount = source.split(loginEnabledMarker).length - 1;
if (markerCount !== 1) throw new Error(`Expected exactly one login-enabled marker, found ${markerCount}.`);

function conservativeMinifyJavaScript(code) {
  const stream = tokenizer(code, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true });
  let output = '';
  let previousEnd = 0;
  while (true) {
    const token = stream.getToken();
    if (token.type && token.type.label === 'eof') break;
    const gap = code.slice(previousEnd, token.start);
    if (gap.length > 0) output += /[\r\n]/.test(gap) ? '\n' : ' ';
    output += code.slice(token.start, token.end);
    previousEnd = token.end;
  }
  return output.trim() + '\n';
}

const production = conservativeMinifyJavaScript(source);
fs.writeFileSync(productionPath, production, 'utf8');
const loginDisabled =
  'globalThis.BerryboyGallerySpaceDefinition = ' + JSON.stringify(gallerySpaceDefinition, null, 2) + ';\n\n' +
  source.replace(loginEnabledMarker, 'var galleryEditorLoginEnabled = false;');
fs.writeFileSync(loginDisabledPath, loginDisabled, 'utf8');
console.log(`Stage 12C66C6C8C1 production build generated (${(production.length / source.length * 100).toFixed(1)}% of source size).`);
