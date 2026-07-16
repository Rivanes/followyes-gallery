import fs from 'node:fs';
import crypto from 'node:crypto';

const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
const minified = fs.readFileSync(new URL('../src/Gallery_V0_11.min.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bootstrap = fs.readFileSync(new URL('../src/bootstrap/gallery-viewer-bootstrap.js', import.meta.url), 'utf8');
const txt = fs.readFileSync(new URL('../Gallery_V0_11_STAGE12C65B1_ADAPTIVE_QUALITY_STABILIZATION_CORRECT_DOWNSHIFT_LOGIN_DISABLED.txt', import.meta.url), 'utf8');

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

function transitionTarget(profile, direction, currentLevel) {
  const safeCurrent = Number.isFinite(currentLevel) && currentLevel > 0
    ? currentLevel
    : profile.initial;
  let target = profile.initial;
  if (direction === 'down') target = Math.max(safeCurrent, profile.initial);
  if (direction === 'up') target = Math.min(safeCurrent, profile.initial);
  return Math.max(profile.min, Math.min(profile.max, target));
}

assert(source.includes('STAGE 12C65B1 — ADAPTIVE QUALITY STABILIZATION / CORRECT DOWNSHIFT'), 'Missing Stage 12C65B1 profile system');
assert(source.includes('high: {') && source.includes('balanced: {') && source.includes('safe: {'), 'Missing High/Balanced/Safe profiles');
assert(source.includes('initialHardwareScalingLevel: 0.96'), 'High B1 baseline missing');
assert(source.includes('minHardwareScalingLevel: 0.94'), 'High B1 minimum missing');
assert(source.includes('initialHardwareScalingLevel: 1.00') && source.includes('minHardwareScalingLevel: 1.00'), 'Balanced native baseline/minimum missing');
assert(source.includes('initialHardwareScalingLevel: 1.18'), 'Safe profile baseline missing');
assert(!source.includes('initialHardwareScalingLevel: 0.88'), 'Aggressive High startup 0.88 returned');

const initialChooser = extractFunction(source, 'chooseGalleryInitialMobileQualityProfile');
assert(initialChooser.includes('return "safe"'), 'Safe startup fallback missing');
assert(initialChooser.includes('return "balanced"'), 'AUTO Balanced startup missing');
assert(!initialChooser.includes('deviceInfo.isIOS'), 'AUTO still grants High from iOS status');
assert(!initialChooser.includes('return "high"'), 'AUTO still grants High before FPS evidence');

assert(source.includes('function getGalleryProfileTransitionHardwareScalingLevel'), 'Monotonic profile transition resolver missing');
assert(source.includes('Math.max(safeCurrentLevel, profile.initialHardwareScalingLevel)'), 'Downshift monotonic guard missing');
assert(source.includes('Math.min(safeCurrentLevel, profile.initialHardwareScalingLevel)'), 'Upshift monotonic guard missing');
assert(source.includes('targetHardwareScalingLevel: getGalleryProfileTransitionHardwareScalingLevel(lowerProfile, "down", currentLevel)'), 'AUTO downshift does not use transition target');
assert(source.includes('targetHardwareScalingLevel: getGalleryProfileTransitionHardwareScalingLevel(higherProfile, "up", currentLevel)'), 'AUTO upshift does not use transition target');

const high = { initial: 0.96, min: 0.94, max: 1.08 };
const balanced = { initial: 1.00, min: 1.00, max: 1.22 };
const safe = { initial: 1.18, min: 1.08, max: 1.38 };
assert(transitionTarget(balanced, 'down', 1.08) >= 1.08, 'High → Balanced downshift sharpens resolution');
assert(transitionTarget(safe, 'down', 1.22) >= 1.22, 'Balanced → Safe downshift sharpens resolution');
assert(transitionTarget(balanced, 'up', 1.08) <= 1.08, 'Safe → Balanced upshift lowers resolution');
assert(transitionTarget(high, 'up', 1.00) <= 1.00, 'Balanced → High upshift lowers resolution');

assert(source.includes('function getGalleryAdaptiveQualityAssetWorkState()'), 'Asset-work state resolver missing');
assert(source.includes('backgroundDrainActive'), 'Background drain is not included in adaptive pause');
assert(source.includes('startupBatchHydrationActive'), 'Startup hydration is not included in adaptive pause');
assert(source.includes('modelLoadActiveCount'), 'Active model loads are not included in adaptive pause');
assert(source.includes('pendingArtworkTextures'), 'Artwork texture loads are not included in adaptive pause');
assert(source.includes('pendingVisibleTextures'), 'Visible texture loads are not included in adaptive pause');
assert(source.includes('pauseGalleryAdaptiveQualityMeasurement("asset-work-active", assetWorkState)'), 'FPS sampling does not pause during asset work');
assert(source.includes('if (getGalleryAdaptiveQualityAssetWorkState().busy) return false;'), 'Quality application is not asset-gated');

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

// Desktop and Stage 12C65A startup contracts remain unchanged.
assert(source.includes('isGalleryDeviceProfileMobile() ? galleryDeviceProfile.mainShadowMapSize : 2048'), 'Desktop shadow baseline changed');
assert(source.includes('modelLoadConcurrency: mobile ? 1 : 2'), 'Stage 12C65A startup concurrency changed');
assert(count(source, '@media (max-width: 768px), (pointer: coarse)') === 1, 'Public mobile Inspect CSS duplicated again');

assert(index.includes('viewport-fit=cover'), 'Boot recovery viewport baseline lost');
assert(index.includes('Stage 12C65B1'), 'Index stage label not updated');
assert(index.includes('stage: "12C65B1"'), 'Boot Guard stage not updated');
assert(bootstrap.includes('stage12c65b1_adaptive_quality_stabilization_20260716'), 'Viewer bootstrap cache key not updated');
assert(bootstrap.includes('stage: "12C65B1"'), 'Viewer runtime stage not updated');
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

assert(minified.includes('12C65B1'), 'Minified build does not contain Stage 12C65B1');
assert(minified.includes('berryboy_mobile_quality_mode'), 'Minified build lacks quality profiles');
assert(!minified.includes('galleryMobileStartupSurvival'), 'Legacy survival code remains in minified build');

console.log('Stage 12C65B1 verifier passed.');
