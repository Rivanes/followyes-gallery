import fs from 'node:fs';
import crypto from 'node:crypto';

const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
const minified = fs.readFileSync(new URL('../src/Gallery_V0_11.min.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bootstrap = fs.readFileSync(new URL('../src/bootstrap/gallery-viewer-bootstrap.js', import.meta.url), 'utf8');
const txt = fs.readFileSync(new URL('../Gallery_V0_11_STAGE12C65B_ADAPTIVE_MOBILE_QUALITY_LOGIN_DISABLED.txt', import.meta.url), 'utf8');

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

assert(source.includes('STAGE 12C65B — ADAPTIVE MOBILE QUALITY / ONE DEVICE PROFILE'), 'Missing Stage 12C65B profile system');
assert(source.includes('high: {') && source.includes('balanced: {') && source.includes('safe: {'), 'Missing High/Balanced/Safe profiles');
assert(source.includes('initialHardwareScalingLevel: 0.88'), 'High profile does not improve mobile clarity');
assert(source.includes('initialHardwareScalingLevel: 1.00'), 'Balanced profile baseline missing');
assert(source.includes('initialHardwareScalingLevel: 1.18'), 'Safe profile baseline missing');
assert(source.includes('function updateGalleryAdaptiveMobileQuality()'), 'Missing dynamic resolution controller');
assert(source.includes('sampleElapsedMs < 1800'), 'Missing stable FPS sample window');
assert(source.includes('lowWindows >= 2'), 'Missing downshift hysteresis');
assert(source.includes('highWindows >= 4'), 'Missing upshift hysteresis');
assert(source.includes('Date.now() - galleryFastStartRuntime.lastViewerActivityAt < 650'), 'Quality changes are not idle-gated');
assert(source.includes('registerGalleryBeforeRenderObserver("adaptiveMobileQuality"'), 'Missing adaptive observer lifecycle');
assert(source.includes('startGalleryAdaptiveMobileQuality(reason || "interaction-ready")'), 'Adaptive quality does not start at Interaction Ready');
assert(source.includes('function resizeGalleryShadowMapSafely'), 'Missing shadow budget resizing');
assert(source.includes('commonLightingMaterialBudgets = Object.assign({}, profile.materialBudgets)'), 'Material budgets do not follow profiles');
assert(source.includes('localMaxActiveSpotShadows = profile.localMaxActiveSpotShadows'), 'Local shadow count does not follow profiles');
assert(source.includes('setMobileQualityMode: setGalleryMobileQualityMode'), 'GalleryApp quality API missing');
assert(source.includes('berryboy_mobile_quality_mode'), 'Manual quality preference is not persisted');
assert(source.includes('gallery-mobile-quality-change'), 'Quality-change event missing for future HUD');

// Legacy fixed mobile downgrade must not return.
assert(!source.includes('initialHardwareScalingLevel: mobile ? (lowMemory ? 1.30 : 1.15) : 1'), 'Stage 12C65A fixed scale remains');
assert(!source.includes('hardwareScalingLevel = enabled ? (lowMemory ? 1.8 : 1.45) : 1'), 'Legacy Survival scaling remains');
assert(!source.includes('galleryMobileStartupSurvival'), 'Legacy Survival system returned');
assert(!source.includes('mobileFocusActive'), 'Legacy Mobile Focus returned');

// Desktop production shadow baseline remains 2048; only mobile profile chooses another size.
assert(source.includes('isGalleryDeviceProfileMobile() ? galleryDeviceProfile.mainShadowMapSize : 2048'), 'Desktop shadow baseline changed');
assert(source.includes('modelLoadConcurrency: mobile ? 1 : 2'), 'Stage 12C65A startup concurrency changed');
assert(count(source, '@media (max-width: 768px), (pointer: coarse)') === 1, 'Public mobile Inspect CSS duplicated again');

assert(index.includes('viewport-fit=cover'), 'Boot recovery viewport baseline lost');
assert(index.includes('Stage 12C65B'), 'Index stage label not updated');
assert(index.includes('stage: "12C65B"'), 'Boot Guard stage not updated');
assert(bootstrap.includes('stage12c65b_adaptive_mobile_quality_20260716'), 'Viewer bootstrap cache key not updated');
assert(bootstrap.includes('stage: "12C65B"'), 'Viewer runtime stage not updated');
assert(bootstrap.includes('webglcontextlost'), 'Stage 12C65A context recovery lost');

assert(source.includes('var galleryEditorLoginEnabled = true;'), 'Production source login must remain enabled');
assert(txt.includes('var galleryEditorLoginEnabled = false;'), 'Root TXT login must be disabled');
const normalizedTxt = txt.replace('var galleryEditorLoginEnabled = false;', 'var galleryEditorLoginEnabled = true;');
assert(normalizedTxt === source, 'Root TXT differs from production source beyond the login switch');

const protectedHashes = {
  focusCameraOnObject: '2df1a12cac5f6032ad8e212e78b97d8ce96e2e3690cf8fa94f77d6577f855b76',
  animateViewerFocusPositionPath: '030b26be6ffdf3148341fcd4e7ee547765c88759aec3ac32f46ee66c3fa9cdbf',
  showArtworkInfoPopup: 'a9a1b2a2dc1c54e25403c8607e417edd54c3dc0abea962206faaf9414988dfe6',
  hideArtworkInfoPopup: '743c785216f36e16c58cd7e32018bb9bb760b79eaa6a9a03fd8c3c442d55b3fb',
  updateGalleryInspectNavigationPosition: '4218f7e947d2b53cb1bc3f34be9134f00f9f3f611ee967f20097a699af80787e',
  openGalleryInspectTarget: 'ba079d23996711e4028f7637e3de3bfef4805fb975f628e6c46bf8bfa53ecbce',
  beginGalleryInteractionReadinessGate: '90320dfaa23a904a685a53ae07273a56483bd3d5829a9c914ef0e9d7cceb036d',
  finishGalleryStartup: 'abdb872048e33fabc9ffb494bdfea733b3bd9a4690c1def953b08d2276bc4e3e',
  runGalleryFastStartFinalizationNow: '697bbb0d4f7a3eefd76fff9195c0a7162b9ffcee0f82719f1a3ab147a82d67ab'
};
for (const [name, expected] of Object.entries(protectedHashes)) {
  assert(sha(extractFunction(source, name)) === expected, `Protected function changed: ${name}`);
}

assert(minified.includes('12C65B'), 'Minified build does not contain Stage 12C65B');
assert(minified.includes('berryboy_mobile_quality_mode'), 'Minified build lacks quality profiles');
assert(!minified.includes('galleryMobileStartupSurvival'), 'Legacy survival code remains in minified build');

console.log('Stage 12C65B verifier passed.');
