import fs from 'node:fs';
import crypto from 'node:crypto';

const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
const minified = fs.readFileSync(new URL('../src/Gallery_V0_11.min.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bootstrap = fs.readFileSync(new URL('../src/bootstrap/gallery-viewer-bootstrap.js', import.meta.url), 'utf8');
const txt = fs.readFileSync(new URL('../Gallery_V0_11_STAGE12C65A_MOBILE_CLEANUP_BOOT_RECOVERY_LOGIN_DISABLED.txt', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

function extractFunction(text, name) {
  const marker = `function ${name}(`;
  const start = text.indexOf(marker);
  assert(start >= 0, `Missing function ${name}`);
  const brace = text.indexOf('{', start);
  let depth = 0;
  let state = 'code';
  let quote = null;
  for (let i = brace; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1] || '';
    if (state === 'code') {
      if (char === '"' || char === "'" || char === '`') {
        state = 'string'; quote = char;
      } else if (char === '/' && next === '/') {
        state = 'line'; i += 1;
      } else if (char === '/' && next === '*') {
        state = 'block'; i += 1;
      } else if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) return text.slice(start, i + 1);
      }
    } else if (state === 'string') {
      if (char === '\\') i += 1;
      else if (char === quote) { state = 'code'; quote = null; }
    } else if (state === 'line') {
      if (char === '\n') state = 'code';
    } else if (state === 'block') {
      if (char === '*' && next === '/') { state = 'code'; i += 1; }
    }
  }
  throw new Error(`Unterminated function ${name}`);
}

function sha(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

assert(source.includes('STAGE 12C65A — SINGLE MOBILE DEVICE PROFILE'), 'Missing Stage 12C65A device profile');
assert(source.includes('function detectGalleryDeviceProfile()'), 'Missing single device detector');
assert(source.includes('initialHardwareScalingLevel: mobile ? (lowMemory ? 1.30 : 1.15) : 1'), 'Unexpected mobile baseline scale');
assert(source.includes('function releaseGalleryStartupDeferredOptionalAssetImports'), 'Missing generic optional startup queue');
assert(source.includes('galleryDeviceProfile.useMobileViewerControls'), 'Mobile controls do not use the single profile');
assert(source.includes('isGalleryDeviceProfileMobile()'), 'Mobile assets do not use the single profile');

const removed = [
  'detectGalleryMobileStartupSurvivalMode',
  'applyGalleryMobileStartupSurvivalMode',
  'shouldGalleryMobileSequentialStartupImport',
  'queueGalleryMobileSequentialStartupImport',
  'finishGalleryMobileSequentialStartupImport',
  'galleryMobileStartupSurvival',
  'isArtworkMobileTextureDevice',
  'mobileFocusActive',
  'mobilePreviousCameraPosition',
  'mobilePreviousCameraRotation',
  'enterMobileFocusState',
  'exitMobileFocusView',
  'resetMobileCameraView',
  'animateMobileCameraTo',
  'getMobileArtworkFocusDistance',
  'updateMobileJoystickMovement',
  'updateMobileBackButton',
  'Stage 8X1 final mobile popup override',
  'width: 58px !important',
  'hardwareScalingLevel = enabled ? (lowMemory ? 1.8 : 1.45) : 1'
];
for (const token of removed) assert(!source.includes(token), `Legacy token remains: ${token}`);

assert(count(source, '@media (max-width: 768px), (pointer: coarse)') === 1, 'Public mobile Inspect CSS is duplicated');
assert(count(source, 'body.gallery-edit-inspect-preview #galleryEditorPanel') === 1, 'Edit Inspect preview CSS is duplicated');

assert(index.includes('viewport-fit=cover'), 'Missing viewport-fit=cover');
assert(index.includes('height: calc(100dvh - var(--header-height))'), 'Missing dvh gallery baseline');
assert(!index.includes('min-height: 540px'), 'Legacy mobile minimum height remains');
assert(index.includes('id="galleryBootGuard"'), 'Missing static Boot Guard');
assert(index.includes('window.BerryboyBootGuard'), 'Missing Boot Guard runtime');
assert(index.includes('babylon-cdn'), 'Missing Babylon CDN recovery');
assert(index.includes('viewer-bootstrap'), 'Missing module load recovery');
assert(index.includes('Stage 12C65A'), 'Index stage label not updated');

assert(bootstrap.includes('webglcontextcreationerror'), 'Missing WebGL context creation handling');
assert(bootstrap.includes('webglcontextlost'), 'Missing WebGL context loss handling');
assert(bootstrap.includes('webglcontextrestored'), 'Missing WebGL context restored handling');
assert(bootstrap.includes('bootGuard.setPhase("engine"'), 'Missing boot phases');
assert(bootstrap.includes('bootGuard.ready()'), 'Missing first-frame Boot Guard handoff');
assert(bootstrap.includes('stage: "12C65A"'), 'Bootstrap stage not updated');

assert(source.includes('var galleryEditorLoginEnabled = true;'), 'Production source login must remain enabled');
assert(txt.includes('var galleryEditorLoginEnabled = false;'), 'Root TXT login must be disabled');
const normalizedTxt = txt.replace('var galleryEditorLoginEnabled = false;', 'var galleryEditorLoginEnabled = true;');
assert(normalizedTxt === source, 'Root TXT differs from production source beyond the login switch');

const expectedHashes = {
  focusCameraOnObject: '2df1a12cac5f6032ad8e212e78b97d8ce96e2e3690cf8fa94f77d6577f855b76',
  animateViewerFocusPositionPath: '030b26be6ffdf3148341fcd4e7ee547765c88759aec3ac32f46ee66c3fa9cdbf',
  showArtworkInfoPopup: 'a9a1b2a2dc1c54e25403c8607e417edd54c3dc0abea962206faaf9414988dfe6',
  hideArtworkInfoPopup: '743c785216f36e16c58cd7e32018bb9bb760b79eaa6a9a03fd8c3c442d55b3fb',
  updateGalleryInspectNavigationPosition: '4218f7e947d2b53cb1bc3f34be9134f00f9f3f611ee967f20097a699af80787e',
  openGalleryInspectTarget: 'ba079d23996711e4028f7637e3de3bfef4805fb975f628e6c46bf8bfa53ecbce'
};
for (const [name, expected] of Object.entries(expectedHashes)) {
  assert(sha(extractFunction(source, name)) === expected, `Protected Inspect function changed: ${name}`);
}

assert(minified.includes('12C65A'), 'Minified build does not contain Stage 12C65A');
assert(!minified.includes('galleryMobileStartupSurvival'), 'Legacy survival code remains in minified build');
assert(!minified.includes('mobileFocusActive'), 'Legacy mobile focus remains in minified build');

console.log('Stage 12C65A verifier passed.');
