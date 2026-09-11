import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createSceneLoadingPolicy,
  getSceneLoadingFamilyPolicy,
  getSceneLoadingSpaceRolePolicy,
  getSceneLoadingReadinessContract
} from '../src/runtime/scene-loading-policies.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/Gallery_V0_11.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src/runtime/scene-lifecycle-controller.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function functionBody(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} missing`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
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
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

assert.equal(pkg.version, '0.14.2-v14-2-2-exhibition-creation-targeting');
assert.ok(pkg.description.includes('V14.2.2 Exhibition Creation Targeting'));

for (const context of ['public-exhibition', 'admin-exhibition']) {
  const policy = createSceneLoadingPolicy(context);
  assert.equal(getSceneLoadingReadinessContract(policy).previewPhase, 'walkthrough-visible-settled');
  for (const family of ['frames', 'sculpture-models', 'shared-props']) {
    const familyPolicy = getSceneLoadingFamilyPolicy(policy, family);
    assert.equal(familyPolicy.mode, 'foreground-terminal', `${context}/${family} must be terminal foreground`);
    assert.equal(familyPolicy.blocksPreviewSettle, true, `${context}/${family} must block settle`);
    assert.equal(familyPolicy.explicitUnavailableCountsAsTerminal, true, `${context}/${family} explicit unavailable must be terminal`);
  }
  assert.equal(getSceneLoadingFamilyPolicy(policy, 'artwork-preview').blocksPreviewSettle, true);
}

const publicPropsAssigned = getSceneLoadingSpaceRolePolicy('public-exhibition', 'props', { assigned: true });
const publicPropsUnassigned = getSceneLoadingSpaceRolePolicy('public-exhibition', 'props', { assigned: false });
const adminPropsAssigned = getSceneLoadingSpaceRolePolicy('admin-exhibition', 'props', { assigned: true });
assert.equal(publicPropsAssigned.requiredForValidRuntime, false, 'Props stay structurally optional');
assert.equal(publicPropsAssigned.mustSettleBeforePreview, true, 'assigned Public Props must settle before entry');
assert.equal(adminPropsAssigned.mustSettleBeforePreview, true, 'assigned Admin Props must settle before entry');
assert.equal(publicPropsUnassigned.createsTask, false, 'unassigned Props must create no task');
assert.equal(publicPropsUnassigned.unassignedIsLegal, true, 'unassigned Props remain legal');

assert.ok(source.includes('galleryPolicyPreviewBlockingAssetNames = galleryAssignedAssetNames.filter'), 'all-context assigned Space policy gate missing');
assert.ok(source.includes('var galleryStartupBlockingAssetNames = galleryPolicyPreviewBlockingAssetNames.slice();'), 'startup blocking set must be policy-derived');
assert.ok(source.includes('galleryPolicyPreviewBlockingAssetNames.indexOf(assetName) !== -1'), 'assigned blocking Props must bypass optional deferral');

const scheduler = functionBody('pumpGalleryWalkthroughHeavyHydrationScheduler');
assert.ok(source.includes('schema: "gallery-walkthrough-heavy-hydration-scheduler.v1"'), 'heavy scheduler debug contract missing');
assert.ok(source.includes('concurrency: 1'), 'heavy scheduler concurrency must be one');
assert.ok(scheduler.includes('if (galleryWalkthroughHeavyHydrationScheduler.active) return;'), 'parallel scheduler start guard missing');
assert.ok(scheduler.includes('await yieldGalleryForegroundFrame(0);'), 'scheduler must yield around heavy imports');
assert.ok(scheduler.indexOf('await yieldGalleryForegroundFrame(0);') < scheduler.indexOf('var result = await entry.run();'), 'scheduler must yield before heavy run');
assert.ok(scheduler.lastIndexOf('await yieldGalleryForegroundFrame(0);') > scheduler.indexOf('var result = await entry.run();'), 'scheduler must yield before next heavy run');
assert.ok(source.includes('entry.transitionEpoch !==') && source.includes('entry.loadingSessionId') && source.includes('entry.exhibitionId !== getActiveGalleryExhibitionId()'), 'scheduler stale-work identity guard incomplete');
const supersedeBatch = functionBody('supersedeGalleryWalkthroughVisibleHydrationBatch');
assert.ok(supersedeBatch.includes('discardGalleryWalkthroughHeavyHydrationBatch(batch.id'), 'superseded batch must discard queued heavy work');

const applyState = functionBody('applyEditorState');
assert.ok(applyState.includes('scheduleGalleryWalkthroughHeavyHydration("frames"'), 'Frame restore must use bounded scheduler');
assert.ok(applyState.includes('scheduleGalleryWalkthroughHeavyHydration("sculpture-models"'), 'Sculpture restore must use bounded scheduler');
assert.ok(applyState.includes('scheduleGalleryWalkthroughHeavyHydration("shared-props"'), 'Shared Prop restore must use bounded scheduler');
assert.ok(applyState.includes('_galleryFastStartForceImmediate: true'), 'blocking sculpture restore must force immediate load');
assert.ok(applyState.includes('forceImmediate: sharedPropVisibleBlocking'), 'blocking Shared Prop restore must force immediate load');

const finalCommit = functionBody('flushGalleryWalkthroughVisibleHydrationGlobalRefresh');
for (const call of [
  'refreshViewerExhibitionCollisionMeshes()',
  'refreshCommonLightingMaterialSupport()',
  'hydrateSavedLocalLightTargetsForAll(',
  'refreshAllCommonLocalLightTargets()',
  'refreshAllLocalSpotShadows(true)',
  'requestAllLocalSpotShadowRefresh(true)'
]) assert.ok(finalCommit.includes(call), `final commit missing ${call}`);

const warmPairs = functionBody('getGalleryWalkthroughGpuWarmupPairs');
for (const token of ['"artwork-preview"', 'artworkFrameRuntime', '"frame"', 'model3dRuntime', '"shared-prop"', '"sculpture"']) {
  assert.ok(warmPairs.includes(token), `walkthrough GPU warmup missing ${token}`);
}
const finalSettle = functionBody('waitForGalleryWalkthroughFinalSettle');
assert.ok(finalSettle.includes('waitForGalleryWalkthroughVisibleHydrationBatch('), 'final settle must wait visible terminal batch');
assert.ok(finalSettle.includes('flushGalleryWalkthroughVisibleHydrationGlobalRefresh('), 'final settle must run global commit');
assert.ok(finalSettle.includes('runGalleryWalkthroughGpuWarmup('), 'final settle must run dynamic GPU warmup');
assert.ok(finalSettle.includes('waitForGalleryForegroundQuietFrames('), 'final settle must wait quiet frames');
assert.ok(finalSettle.includes('quiet.stable !== true'), 'quiet gate must be hard before readiness');

const foreground = functionBody('waitForGalleryForegroundReady');
assert.ok(foreground.includes('waitForGalleryWalkthroughFinalSettle('), 'startup foreground readiness must use final walkthrough settle');
assert.ok(foreground.includes('walkthroughGlobalCommit') && foreground.includes('walkthroughGpuWarmup'), 'startup debug result must retain final settle proof');

const switchBody = functionBody('switchGalleryExhibition');
const settleIndex = switchBody.indexOf('same-space-exhibition-walkthrough-final-settle');
const publishIndex = switchBody.indexOf('publishGallerySceneReadiness(');
assert.ok(settleIndex >= 0 && publishIndex > settleIndex, 'same-Space switch must finish walkthrough settle before canonical readiness');
assert.ok(switchBody.includes('same-space-exhibition-rollback-walkthrough-final-settle'), 'same-Space rollback must also settle walkthrough before recovery completes');

assert.ok(source.includes('if (galleryFastStartRuntime.stateApplyActive && !forceImmediate)'), 'compatibility/background model queue remains available only for nonblocking contexts/work');
assert.ok(source.includes('function queueModelForGalleryStreaming('), 'post-entry streaming fallback remains for V14.1.10 ownership');
assert.ok(source.includes('getWalkthroughVisibleHydrationDebug: function ()') && source.includes('getWalkthroughHydrationSchedulerDebug: function ()') && source.includes('getWalkthroughGpuWarmupDebug: function ()'), 'V14.1.9 focused debug APIs missing');

assert.ok(controller.includes('authorityEvent') && controller.includes('authorityPhase'), 'controller must preserve V14.1.8 canonical readiness authority');
assert.ok(!controller.includes('window.addEventListener("gallery-interaction-ready"'), 'legacy interaction-ready must not become controller authority again');

console.log('V14.1.9 pre-interaction complete walkthrough hydration regression passed.');
