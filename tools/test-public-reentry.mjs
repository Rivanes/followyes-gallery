import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gallery = fs.readFileSync(path.join(root, 'src/Gallery_V0_11.js'), 'utf8');
const viewer = fs.readFileSync(path.join(root, 'src/bootstrap/gallery-viewer-bootstrap.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src/runtime/scene-lifecycle-controller.js'), 'utf8');
const guard = fs.readFileSync(path.join(root, 'src/bootstrap/transition-guard.js'), 'utf8');

function body(source, name) {
  for (const prefix of [`async function ${name}(`, `function ${name}(`]) {
    const start = source.indexOf(prefix);
    if (start < 0) continue;
    const brace = source.indexOf('{', start);
    let depth = 0, quote = null, escaped = false;
    for (let i = brace; i < source.length; i += 1) {
      const ch = source[i];
      if (quote) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
      if (ch === '{') depth += 1;
      else if (ch === '}' && --depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Missing function ${name}`);
}

assert.ok(viewer.includes('const STAGE = "V14.1.10.1"'), 'Public Viewer stage must identify the corrective re-entry release');
assert.ok(gallery.includes('schema: "public-gallery-visit.v1"'), 'explicit Public visit authority missing');
assert.ok(gallery.includes('beginPublicVisit: function (options)'), 'GalleryApp must expose beginPublicVisit');
assert.ok(gallery.includes('suspendPublicVisit: function (reason)'), 'GalleryApp must expose suspendPublicVisit');
assert.ok(gallery.includes('getPublicVisitDebug: function ()'), 'Public visit debug API missing');

const beginVisit = body(gallery, 'beginGalleryPublicVisit');
assert.ok(beginVisit.includes('resetGalleryPublicVisitToEntryPoint'), 'new Public visit must reset full visitor state');
assert.ok(beginVisit.includes('showViewerIntroOverlay()'), 'new Public visit must always show Explore the gallery');
assert.ok(beginVisit.includes('visitId = "visit-"'), 'new Public visit must receive a distinct visit id');

const suspendVisit = body(gallery, 'suspendGalleryPublicVisit');
assert.ok(suspendVisit.includes('viewerIntroOverlayMovementUnlocked = false'), 'Home must lock movement immediately');
assert.ok(suspendVisit.includes('stopGalleryClickToMove'), 'Home must cancel click-to-move');
assert.ok(suspendVisit.includes('resetMobileJoystick'), 'Home must cancel mobile movement');

const resetVisit = body(gallery, 'resetGalleryPublicVisitToEntryPoint');
assert.ok(resetVisit.includes('camera.position.copyFrom'), 'visit reset must restore Entry Point position');
assert.ok(resetVisit.includes('gallerySpaceEntryPosition'), 'visit reset must use authored Entry Point position');
assert.ok(resetVisit.includes('camera.setTarget'), 'visit reset must restore authored Entry Point target');
assert.ok(resetVisit.includes('gallerySpaceEntryTarget'), 'visit reset must use authored Entry Point target');
assert.ok(resetVisit.includes('closeGalleryInspect("startup-reset")'), 'visit reset must close Inspect/focus state');
assert.ok(resetVisit.includes('stopViewerSafeFocusRuntimeAnimation'), 'visit reset must stop previous focus animation');

const startup = body(gallery, 'finishGalleryStartup');
assert.ok(startup.includes('gallerySpaceEntryPosition') && startup.includes('gallerySpaceEntryTarget'), 'cold startup must use exact authored Entry Point position + target');
assert.ok(!startup.includes('Math.PI / 50'), 'cold startup must not overwrite authored Entry Point target with fixed yaw');

assert.ok(viewer.includes('window.GalleryApp.suspendPublicVisit(options.reason || \"public-home-listing\")'), 'opening Public Home/listing must suspend visit without disposing Scene');
assert.ok(viewer.includes('app.beginPublicVisit({ reason: options.reason || \"public-gallery-reentry-same-runtime\" })'), 'exact same resident Public re-entry must start a fresh visit');
assert.ok(viewer.includes('reuseResidentLayer: true'), 'Public same-Space switch must request resident render-layer reuse');
assert.ok(viewer.includes('opaque: true'), 'Public preparation must hide state mutation behind an opaque gate');

assert.ok(guard.includes('.epTransitionOpaque'), 'transition guard needs Public opaque mode');
assert.ok(guard.includes('options.opaque === true'), 'opaque mode must be opt-in so Admin keeps seamless/translucent behavior');

const switchCore = body(gallery, 'switchGalleryExhibition');
assert.ok(switchCore.includes('residentCandidate'), 'same-Space switch must inspect resident target layer independently of forceRemote');
assert.ok(switchCore.includes('residentRevision === canonicalRevision'), 'resident render layer must be reused only when canonical revision matches');
assert.ok(switchCore.includes('disposeParkedGalleryExhibitionLayer(residentCandidate)'), 'stale resident layer must be disposed before replacement');
assert.ok(switchCore.includes('delete galleryExhibitionRuntime.layerResidency[exhibition.id]'), 'stale resident registry entry must be removed to avoid leaked overwrite');
assert.ok(switchCore.includes('revision: previousBaseline.publishedRevision'), 'parked active layer must retain canonical revision');
assert.ok(switchCore.includes('revision: row && row.revision !== undefined'), 'post-switch cache must retain target canonical revision');
assert.ok(controller.includes('reuseResidentLayer: switchOptions.reuseResidentLayer !== false'), 'lifecycle controller must forward render-layer reuse independently of remote freshness');

console.log('V14.1.10.1 Public fresh-visit + resident re-entry regression passed.');
