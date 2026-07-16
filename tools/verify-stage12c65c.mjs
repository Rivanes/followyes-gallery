import fs from 'node:fs';
import crypto from 'node:crypto';

const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
const minified = fs.readFileSync(new URL('../src/Gallery_V0_11.min.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bootstrap = fs.readFileSync(new URL('../src/bootstrap/gallery-viewer-bootstrap.js', import.meta.url), 'utf8');
const editorBootstrap = fs.readFileSync(new URL('../src/bootstrap/gallery-editor-bootstrap.js', import.meta.url), 'utf8');
const txt = fs.readFileSync(new URL('../Gallery_V0_11_STAGE12C65C_MOBILE_VIEWPORT_HUD_REBUILD_LOGIN_DISABLED.txt', import.meta.url), 'utf8');

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
assert(index.includes('Stage 12C65C'), 'Index stage label missing');
assert(index.includes('stage: "12C65C"'), 'Boot Guard stage missing');
assert(source.includes('Stage 12C65C: Mobile Viewport / HUD Rebuild'), 'Source stage history missing');
assert(source.includes('stage: "12C65C"'), 'Source runtime stage missing');
assert(bootstrap.includes('Stage 12C65C Mobile Viewport / HUD Rebuild'), 'Viewer bootstrap stage missing');
assert(bootstrap.includes('stage12c65c_mobile_viewport_hud_rebuild_20260716'), 'Viewer cache key missing');
assert(bootstrap.includes('stage: "12C65C"'), 'Viewer runtime stage missing');
assert(editorBootstrap.includes('Stage 12C65C'), 'Editor bootstrap stage missing');

// Viewport shell: no legacy 100vh sizing or forced mobile minimum.
assert(index.includes('viewport-fit=cover'), 'viewport-fit=cover missing');
assert(index.includes('--gallery-visual-viewport-height: 100dvh'), '100dvh viewport fallback missing');
assert(index.includes('height: var(--gallery-section-height);'), 'Gallery section is not driven by measured height');
assert(!index.includes('height: calc(100vh'), 'Legacy gallery 100vh height returned');
assert(!index.includes('min-height: 540px'), 'Legacy mobile minimum height returned');
assert(!source.includes('100vh'), 'Legacy 100vh editor sizing remains');
assert(source.includes('var(--gallery-visual-viewport-height, 100dvh)'), 'Editor panels do not use the shared viewport height');

// VisualViewport controller is installed before Babylon/bootstrap.
assert(index.includes('window.visualViewport || null'), 'VisualViewport controller missing');
assert(index.includes('window.visualViewport.addEventListener("resize", scheduleViewportUpdate'), 'VisualViewport resize listener missing');
assert(index.includes('window.visualViewport.addEventListener("scroll", scheduleViewportUpdate'), 'VisualViewport scroll listener missing');
assert(index.includes('window.addEventListener("orientationchange", scheduleViewportUpdate'), 'Orientation viewport listener missing');
assert(index.includes('window.dispatchEvent(new CustomEvent("gallery-mobile-viewport-change"'), 'Viewport change event missing');
assert(index.includes('--gallery-visual-viewport-offset-top'), 'VisualViewport offsetTop CSS variable missing');
assert(index.includes('--gallery-visual-viewport-bottom-offset'), 'VisualViewport bottom offset CSS variable missing');
assert(index.indexOf('window.BerryboyMobileViewport') < index.indexOf('src="https://cdn.babylonjs.com/babylon.js"'), 'Viewport controller runs after Babylon');

// One layered HUD owns gallery overlays.
assert(count(index, 'id="galleryMobileHud"') === 1, 'galleryMobileHud duplicated');
assert(count(index, 'class="galleryMobileHudLayer"') === 4, 'HUD layer count must be exactly four');
for (const id of ['galleryMobileTopLayer', 'galleryMobileControlsLayer', 'galleryMobileInspectLayer', 'galleryMobileSystemLayer']) {
  assert(index.includes(`id="${id}"`), `Missing HUD layer ${id}`);
}
assert(index.indexOf('id="galleryMobileSystemLayer"') < index.indexOf('id="galleryBootGuard"'), 'Boot Guard is not in the system layer');
assert(source.includes('function getGalleryHudLayer(layerName)'), 'HUD layer resolver missing');
assert(source.includes('appendGalleryUiElement(mobileViewerControls, "controls")'), 'Joystick is not routed to controls layer');
assert(source.includes('appendGalleryUiElement(artworkInfoPopup, "inspect")'), 'Popup is not routed to Inspect layer');
assert(source.includes('appendGalleryUiElement(galleryInspectNavigation, "inspect")'), 'Inspect arrows are not routed to Inspect layer');
assert(source.includes('appendGalleryUiElement(galleryPerformanceDebugPanel, "system")'), 'Debug UI is not routed to system layer');
assert(source.includes('appendGalleryUiElement(editHelpPanel, "controls")'), 'Editor UI is not routed to controls layer');

// Joystick safe area and landscape continuity.
assert(source.includes('left: calc(env(safe-area-inset-left) + 18px)'), 'Joystick left safe area missing');
assert(source.includes('env(safe-area-inset-bottom) + 18px'), 'Joystick bottom safe area missing');
assert(!source.includes('left: 22px;\n                bottom: 28px;'), 'Legacy joystick anchoring returned');
assert(source.includes('function getMobileViewportShortSide()'), 'Phone landscape short-side detection missing');
assert(source.includes('getMobileViewportShortSide() <= 600'), 'Phone landscape mode is not retained');
assert(source.includes('registerGalleryDomEvent("mobileViewerViewportChange"'), 'Mobile controls do not refresh from viewport events');
assert(source.includes('registerGalleryDomEvent("mobileViewerOrientationChange"'), 'Mobile controls do not handle orientation changes');

// Compact mobile header and quality control.
assert(index.includes('id="mobileHeaderMenuButton"'), 'Compact mobile menu button missing');
assert(index.includes('id="mobileQualitySelect"'), 'Mobile quality selector missing');
assert(index.includes('id="brandLongLabel"'), 'Compact brand label split missing');
assert(index.includes('env(safe-area-inset-top)'), 'Header top safe area missing');
assert(index.includes('#headerRight.is-open'), 'Mobile header dropdown state missing');
assert(bootstrap.includes('setMobileQualityMode(mode)'), 'Quality selector is not wired to GalleryApp');
assert(bootstrap.includes('gallery-mobile-quality-change'), 'Quality selector does not follow adaptive changes');
assert(bootstrap.includes('gallery-mobile-viewport-change'), 'Engine does not resize after viewport changes');
assert(bootstrap.includes('window.visualViewport.addEventListener("resize", scheduleEngineResize'), 'Engine lacks direct VisualViewport resize support');

// Stage 12C65B1 adaptive quality contracts remain intact.
assert(source.includes('initialHardwareScalingLevel: 0.96'), 'High B1 baseline changed');
assert(source.includes('initialHardwareScalingLevel: 1.00'), 'Balanced B1 baseline changed');
assert(source.includes('initialHardwareScalingLevel: 1.18'), 'Safe B1 baseline changed');
assert(source.includes('function getGalleryProfileTransitionHardwareScalingLevel'), 'Monotonic transition resolver missing');
assert(source.includes('Math.max(safeCurrentLevel, profile.initialHardwareScalingLevel)'), 'Monotonic downshift guard missing');
assert(source.includes('pauseGalleryAdaptiveQualityMeasurement("asset-work-active", assetWorkState)'), 'Asset-aware FPS pause missing');
assert(source.includes('setMobileQualityMode: setGalleryMobileQualityMode'), 'GalleryApp quality API missing');
assert(!source.includes('galleryMobileStartupSurvival'), 'Legacy Survival Mode returned');
assert(!source.includes('mobileFocusActive'), 'Legacy Mobile Focus returned');
assert(count(source, '@media (max-width: 768px), (pointer: coarse)') === 1, 'Public mobile Inspect CSS was duplicated or removed');

// Login-on production / login-off root TXT contract.
assert(source.includes('var galleryEditorLoginEnabled = true;'), 'Production source login must remain enabled');
assert(txt.includes('var galleryEditorLoginEnabled = false;'), 'Root TXT login must remain disabled');
const normalizedTxt = txt.replace('var galleryEditorLoginEnabled = false;', 'var galleryEditorLoginEnabled = true;');
assert(normalizedTxt === source, 'Root TXT differs from source beyond login switch');

// Protected Inspect and startup functions are unchanged from 12C65B1.
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

// Lock the final Inspect visual block itself; Stage C may only change its parent layer.
const inspectCss = extractBetween(
  source,
  '/* STAGE 12C64H — INSPECT UI FINAL LOCK.',
  '\n\n\n\n    `;\n\n    document.head.appendChild(editorStyle);'
);
assert(sha(inspectCss) === 'bafaee798649e5214caf1c78104f3a33a6633c107a1edaf663493159cdd30d90', 'Final Inspect CSS changed during Stage 12C65C');

// Production/minified build carries the new systems.
assert(minified.includes('12C65C'), 'Minified build stage missing');
assert(minified.includes('gallery-mobile-viewport-change'), 'Minified build lacks viewport event');
assert(minified.includes('galleryMobileHud'), 'Minified build lacks HUD routing');
assert(minified.includes('safe-area-inset-bottom'), 'Minified build lacks joystick safe-area CSS');
assert(!minified.includes('galleryMobileStartupSurvival'), 'Legacy Survival Mode remains in minified build');

console.log('Stage 12C65C verifier passed.');
