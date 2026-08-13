import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('src/Gallery_V0_11.js', root), 'utf8');
const viewer = fs.readFileSync(new URL('src/bootstrap/gallery-viewer-bootstrap.js', root), 'utf8');
const admin = fs.readFileSync(new URL('src/bootstrap/admin-workspace-bootstrap.js', root), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'));

function expect(label, ok) {
  if (!ok) throw new Error(`C6C8C13 regression: ${label}`);
}

function extractFunction(text, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const marker of markers) {
    start = text.indexOf(marker);
    if (start >= 0) break;
  }
  if (start < 0) throw new Error(`Missing function ${name}`);
  const bodyStart = text.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let i = bodyStart; i < text.length; i += 1) {
    const c = text[i];
    const n = text[i + 1] || '';
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (blockComment) { if (c === '*' && n === '/') { blockComment = false; i += 1; } continue; }
    if (quote) { if (c === '\\') { i += 1; continue; } if (c === quote) quote = null; continue; }
    if (c === '/' && n === '/') { lineComment = true; i += 1; continue; }
    if (c === '/' && n === '*') { blockComment = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`Unterminated function ${name}`);
}

const modeFn = extractFunction(source, 'setGallerySameRuntimeModeState');
const resumeFn = extractFunction(admin, 'resumeAdminWorkspace');

expect('current package stage', pkg.version.includes('c6c8c13'));
expect('current runtime stage', source.includes('stage: "12C66C6C8C13"'));
expect('history marker', source.includes('Stage 12C66C6C8C13: Instant Workspace Mode Switch'));
expect('mode switch preserves foreground readiness', !modeFn.includes('markGalleryForegroundNotReady('));
expect('mode switch avoids synchronous owner sweep', !modeFn.includes('sweepGalleryInactiveExhibitionOwners('));
expect('mode switch avoids synchronous space verification', !modeFn.includes('verifyGallerySpaceIntegrity(') && !modeFn.includes('verifyGalleryCanonicalSpaceIntegrity('));
expect('mode switch records instant UI-only mode', modeFn.includes('instant-workspace-ui-only') && modeFn.includes('foregroundPreserved: true'));
expect('integrity audit moved to idle', source.includes('function scheduleGalleryWorkspaceModeBackgroundAudit(') && source.includes('requestIdleCallback(runAudit'));
expect('fast path safety API exists', source.includes('canUseInstantWorkspaceModeSwitch: function ()'));
expect('clean Admin to Public skips full-page guard', viewer.includes('const instantFastPath = !sceneDirty && canUseInstantWorkspaceModeSwitch()') && viewer.includes('if (!instantFastPath)'));
expect('clean Admin to Public skips foreground wait', viewer.includes('if (!instantFastPath && window.GalleryApp') && !viewer.includes('waitForForegroundReady("admin-to-public"'));
expect('network diagnostic starts without blocking click path', viewer.includes('const transitionBeforePromise = getExhibitionAssetDeliveryStats().catch(() => null)'));
expect('Admin telemetry resume is asynchronous', resumeFn.includes('void updateAssetDeliveryStatus().catch(() => null)'));

console.log('C6C8C13 Instant Workspace Mode Switch regression passed.');
