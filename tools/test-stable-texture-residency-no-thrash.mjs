import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../src/bootstrap/admin-workspace-bootstrap.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function expect(label, condition) {
  if (!condition) throw new Error(`C6C8C8 regression: ${label}`);
}
function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  expect(`function ${name} exists`, start >= 0);
  const brace = source.indexOf('{', start);
  let depth = 0, quote = null, line = false, block = false;
  for (let i = brace; i < source.length; i++) {
    const c = source[i], n = source[i + 1] || '';
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

expect('package identity', pkg.version.includes('c6c8c13'));
expect('source stage identity', source.includes('stage: "12C66C6C8C13"'));
expect('residency schema v3', source.includes('schema: "gallery-artwork-residency.v3"'));
expect('workspace-independent Full budget', source.includes('desktopFullTextures: 6') && source.includes('desktopHardFullTextures: 8'));

const workspaceSync = extractFunction('syncGalleryArtworkEgressPolicyForWorkspaceMode');
expect('Admin/Public transition does not schedule residency rebalance', !workspaceSync.includes('scheduleGalleryArtworkResidencyMaintenance'));
expect('Admin/Public transition reports textureRebalance false', workspaceSync.includes('textureRebalance: false'));

const motionGate = extractFunction('isGalleryViewerTextureStreamingMotionBlocked');
expect('movement gate uses inactivity delay', motionGate.includes('idleBeforeFullMs') && motionGate.includes('lastViewerActivityAt'));
expect('movement gate covers keyboard motion', motionGate.includes('viewerMoveKeys') && motionGate.includes('editMoveKeys'));

const bypass = extractFunction('canGalleryPriorityFullArtworkBypassMovement');
expect('only Inspect can bypass idle movement gate', bypass.includes('if (!entry || !entry.inspectPriority) return false;'));
expect('critical tier no longer bypasses movement', !bypass.includes('entry.tier !== "critical"'));

const queue = extractFunction('queueGalleryArtworkFullForResidency');
expect('downgrade reentry cooldown blocks Full', queue.includes('fullReentryBlockedUntil') && queue.includes('thrashPrevented'));

const enforce = extractFunction('enforceGalleryArtworkResidencyBudget');
expect('hard ceiling drives downgrade', enforce.includes('getGalleryArtworkFullResidencyHardLimit') && enforce.includes('needsHardEviction'));
expect('distance alone cannot drive downgrade', !enforce.includes('hardOverBudget || (loadedAge'));
expect('downgrade waits for idle', enforce.includes('isGalleryViewerTextureStreamingMotionBlocked'));

expect('downgrade marks no-auto-Full', source.includes('previewState._galleryNoAutoFullQueue = true'));
expect('preview load suppresses downgrade requeue', source.includes('preview-auto-full-suppressed'));
expect('normal Preview no longer unconditionally queues Full', source.includes('Normal Preview textures do not automatically create a Full queue entry.'));
expect('diagnostic counters exported', source.includes('blockedWhileMoving: galleryArtworkResidencyRuntime.blockedWhileMoving') && source.includes('thrashPrevented: galleryArtworkResidencyRuntime.thrashPrevented'));
expect('Admin shows stability counters', admin.includes('move-block') && admin.includes('thrash'));

console.log('C6C8C8 Stable Texture Residency / No-Thrash Streaming regression passed.');
