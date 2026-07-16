import fs from 'node:fs';
import crypto from 'node:crypto';

const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
const minified = fs.readFileSync(new URL('../src/Gallery_V0_11.min.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bootstrap = fs.readFileSync(new URL('../src/bootstrap/gallery-viewer-bootstrap.js', import.meta.url), 'utf8');
const editorBootstrap = fs.readFileSync(new URL('../src/bootstrap/gallery-editor-bootstrap.js', import.meta.url), 'utf8');
const txt = fs.readFileSync(new URL('../Gallery_V0_11_STAGE12C65D_MOBILE_INSPECT_UI_SAFE_FRAME_LOGIN_DISABLED.txt', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

function sha(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
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
        state = 'string';
        quote = char;
      } else if (char === '/' && next === '/') {
        state = 'line';
        i += 1;
      } else if (char === '/' && next === '*') {
        state = 'block';
        i += 1;
      } else if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) return text.slice(start, i + 1);
      }
    } else if (state === 'string') {
      if (char === '\\') i += 1;
      else if (char === quote) {
        state = 'code';
        quote = null;
      }
    } else if (state === 'line') {
      if (char === '\n') state = 'code';
    } else if (state === 'block') {
      if (char === '*' && next === '/') {
        state = 'code';
        i += 1;
      }
    }
  }

  throw new Error(`Unterminated function ${name}`);
}

function extractBetween(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  assert(start >= 0, `Missing marker: ${startMarker}`);
  const end = text.indexOf(endMarker, start);
  assert(end >= 0, `Missing end marker after: ${startMarker}`);
  return text.slice(start, end);
}

// Stage identity and cache keys.
assert(index.includes('Stage 12C65D'), 'Index stage label missing');
assert(index.includes('stage: "12C65D"'), 'Boot Guard stage missing');
assert(source.includes('Stage 12C65C: Mobile Viewport / HUD Rebuild'), 'Stage C history missing');
assert(source.includes('Stage 12C65D: Mobile Inspect UI / Safe-Frame'), 'Stage D history missing');
assert(source.includes('stage: "12C65D"'), 'Source runtime stage missing');
assert(bootstrap.includes('Stage 12C65D Mobile Inspect UI / Safe-Frame'), 'Viewer bootstrap stage missing');
assert(bootstrap.includes('stage12c65d_mobile_inspect_safe_frame_20260716'), 'Viewer cache key missing');
assert(bootstrap.includes('stage: "12C65D"'), 'Viewer runtime stage missing');
assert(editorBootstrap.includes('Stage 12C65D'), 'Editor bootstrap stage missing');
assert(!bootstrap.includes('stage12c65c'), 'Old bootstrap cache key remains');

// Stage C viewport/HUD foundation remains intact.
assert(index.includes('viewport-fit=cover'), 'viewport-fit=cover missing');
assert(index.includes('--gallery-visual-viewport-height: 100dvh'), '100dvh fallback missing');
assert(index.includes('height: var(--gallery-section-height);'), 'Measured gallery height missing');
assert(!index.includes('height: calc(100vh'), 'Legacy gallery 100vh returned');
assert(!source.includes('100vh'), 'Legacy editor 100vh returned');
assert(count(index, 'id="galleryMobileHud"') === 1, 'galleryMobileHud duplicated');
assert(count(index, 'class="galleryMobileHudLayer"') === 4, 'HUD layer count changed');
assert(source.includes('appendGalleryUiElement(artworkInfoPopup, "inspect")'), 'Inspect popup left HUD Inspect layer');
assert(source.includes('appendGalleryUiElement(mobileViewerControls, "controls")'), 'Joystick left controls layer');
assert(source.includes('left: calc(env(safe-area-inset-left) + 18px)'), 'Joystick left safe area missing');
assert(source.includes('env(safe-area-inset-bottom) + 18px'), 'Joystick bottom safe area missing');

// One final mobile Inspect component.
assert(count(source, '/* STAGE 12C65D — ONE FINAL MOBILE INSPECT COMPONENT.') === 1, 'Stage D mobile CSS duplicated');
assert(count(source, '@media (max-width: 768px), (pointer: coarse)') === 1, 'Primary mobile Inspect media block duplicated');
assert(source.includes('artworkInfoPopupInner.appendChild(galleryInspectNavigation)'), 'Navigation is not inside popup component');
assert(!source.includes('appendGalleryUiElement(galleryInspectNavigation, "inspect")'), 'Navigation still has a parallel HUD path');
assert(source.includes('gallery-inspect-navigation-label">Previous'), 'Previous mobile label missing');
assert(source.includes('gallery-inspect-navigation-label">Next'), 'Next mobile label missing');
assert(source.includes('grid-column: 1 / -1 !important'), 'Navigation is not a popup grid row');
assert(source.includes('data-mobile-safe-frame-mode="side"'), 'Landscape side layout CSS missing');
assert(!source.includes('width: min(430px, calc(100% - 54px))'), 'Legacy Stage C mobile popup width remains');
assert(!source.includes('--gallery-inspect-navigation-previous-x'), 'Legacy root-positioned arrow variable remains');
assert(!source.includes('--gallery-inspect-navigation-next-x'), 'Legacy root-positioned arrow variable remains');

// Measured popup–joystick safe frame.
assert(source.includes('function updateGalleryMobileInspectSafeFrame(reason)'), 'Mobile safe-frame resolver missing');
assert(source.includes('document.getElementById("mobileJoystickBase")'), 'Safe-frame does not measure joystick');
assert(source.includes('mode = "above-joystick"'), 'Portrait joystick avoidance missing');
assert(source.includes('mode = "side"'), 'Landscape side mode missing');
assert(source.includes('sideAvailable >= 300'), 'Landscape usable-width guard missing');
assert(source.includes('--gallery-mobile-inspect-bottom'), 'Measured bottom CSS variable missing');
assert(source.includes('--gallery-mobile-inspect-max-height'), 'Measured max-height CSS variable missing');
assert(source.includes('galleryInspectMobileSafeFrameViewportChange'), 'VisualViewport safe-frame refresh missing');
assert(source.includes('galleryInspectMobileSafeFrameOrientationChange'), 'Orientation safe-frame refresh missing');
assert(source.includes('mobileSafeFrame: Object.assign({}, galleryMobileInspectSafeFrameRuntime)'), 'Safe-frame debug output missing');

// Camera composition uses bottom reservation in portrait and side reservation in landscape.
assert(source.includes('updateGalleryMobileInspectSafeFrame("composition-metrics")'), 'Composition does not refresh measured safe-frame');
assert(source.includes('sideDockedMobilePopup'), 'Side-docked composition branch missing');
assert(source.includes('Number(popupVisualRect.left) - Number(canvasRect.left) - objectGap'), 'Landscape safe-right measurement missing');
assert(source.includes('mobileSafeFrameMode: mobileSafeFrameMode'), 'Safe-frame mode absent from composition debug');

// Stage B1 adaptive quality contracts remain intact.
assert(source.includes('initialHardwareScalingLevel: 0.96'), 'High B1 baseline changed');
assert(source.includes('initialHardwareScalingLevel: 1.00'), 'Balanced B1 baseline changed');
assert(source.includes('initialHardwareScalingLevel: 1.18'), 'Safe B1 baseline changed');
assert(source.includes('function getGalleryProfileTransitionHardwareScalingLevel'), 'Monotonic transition resolver missing');
assert(source.includes('Math.max(safeCurrentLevel, profile.initialHardwareScalingLevel)'), 'Monotonic downshift guard missing');
assert(source.includes('pauseGalleryAdaptiveQualityMeasurement("asset-work-active", assetWorkState)'), 'Asset-aware FPS pause missing');
assert(!source.includes('galleryMobileStartupSurvival'), 'Legacy Survival Mode returned');
assert(!source.includes('mobileFocusActive'), 'Legacy Mobile Focus returned');

// Desktop popup foundation stays at the accepted Stage 12C64H dimensions.
const inspectDesktopCss = extractBetween(
  source,
  '/* STAGE 12C64H — INSPECT UI FINAL LOCK.',
  '        #galleryInspectNavigation {'
);
assert(inspectDesktopCss.includes('--gallery-inspect-avatar-size: 132px'), 'Desktop avatar size changed');
assert(inspectDesktopCss.includes('width: min(600px, calc(100% - 190px))'), 'Desktop popup width changed');
assert(inspectDesktopCss.includes('bottom: 30px !important'), 'Desktop popup bottom changed');
assert(inspectDesktopCss.includes('padding: 20px 28px 20px 118px'), 'Desktop popup padding changed');

// Protected camera/startup functions remain byte-identical to Stage C/B1.
const protectedHashes = {
  focusCameraOnObject: '2df1a12cac5f6032ad8e212e78b97d8ce96e2e3690cf8fa94f77d6577f855b76',
  animateViewerFocusPositionPath: '030b26be6ffdf3148341fcd4e7ee547765c88759aec3ac32f46ee66c3fa9cdbf',
  showArtworkInfoPopup: 'a9a1b2a2dc1c54e25403c8607e417edd54c3dc0abea962206faaf9414988dfe6',
  hideArtworkInfoPopup: '743c785216f36e16c58cd7e32018bb9bb760b79eaa6a9a03fd8c3c442d55b3fb',
  openGalleryInspectTarget: 'ba079d23996711e4028f7637e3de3bfef4805fb975f628e6c46bf8bfa53ecbce',
  beginGalleryInteractionReadinessGate: '90320dfaa23a904a685a53ae07273a56483bd3d5829a9c914ef0e9d7cceb036d',
  finishGalleryStartup: 'abdb872048e33fabc9ffb494bdfea733b3bd9a4690c1def953b08d2276bc4e3e',
  runGalleryFastStartFinalizationNow: '697bbb0d4f7a3eefd76fff9195c0a7162b9ffcee0f82719f1a3ab147a82d67ab'
};
for (const [name, expected] of Object.entries(protectedHashes)) {
  assert(sha(extractFunction(source, name)) === expected, `Protected function changed: ${name}`);
}

// Production/login-disabled contract.
assert(source.includes('var galleryEditorLoginEnabled = true;'), 'Production source login must remain enabled');
assert(txt.includes('var galleryEditorLoginEnabled = false;'), 'Root TXT login must remain disabled');
const normalizedTxt = txt.replace('var galleryEditorLoginEnabled = false;', 'var galleryEditorLoginEnabled = true;');
assert(normalizedTxt === source, 'Root TXT differs from source beyond login switch');

// Minified build carries the new component and safe-frame.
assert(minified.includes('12C65D'), 'Minified build stage missing');
assert(minified.includes('data-mobile-safe-frame-mode'), 'Minified build lacks safe-frame mode');
assert(minified.includes('galleryInspectMobileSafeFrameViewportChange'), 'Minified build lacks viewport safe-frame listener');
assert(minified.includes('gallery-inspect-navigation-label'), 'Minified build lacks internal navigation labels');
assert(!minified.includes('galleryMobileStartupSurvival'), 'Legacy Survival Mode remains in minified build');

console.log('Stage 12C65D verifier passed.');
