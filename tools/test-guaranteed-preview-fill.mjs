import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const admin = fs.readFileSync(new URL('../src/bootstrap/admin-workspace-bootstrap.js', import.meta.url), 'utf8');

function expect(label, value) {
  if (!value) throw new Error(`C6C8C11 regression: ${label}`);
}

function extract(name) {
  const marks = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const mark of marks) {
    start = source.indexOf(mark);
    if (start >= 0) break;
  }
  expect(`function ${name}`, start >= 0);
  const brace = source.indexOf('{', start);
  let depth = 0, state = 'code', quote = '';
  for (let i = brace; i < source.length; i++) {
    const c = source[i], n = source[i + 1] || '';
    if (state === 'code') {
      if (c === '"' || c === "'" || c === '`') { state = 'string'; quote = c; }
      else if (c === '/' && n === '/') { state = 'line'; i++; }
      else if (c === '/' && n === '*') { state = 'block'; i++; }
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return source.slice(start, i + 1);
    } else if (state === 'string') {
      if (c === '\\') i++;
      else if (c === quote) state = 'code';
    } else if (state === 'line' && c === '\n') state = 'code';
    else if (state === 'block' && c === '*' && n === '/') { state = 'code'; i++; }
  }
  throw new Error(`Unterminated ${name}`);
}

expect('package stage', pkg.version.includes('c6c8c12'));
expect('runtime stage', source.includes('stage: "12C66C6C8C12"'));
expect('all assigned Preview policy', source.includes('previewGateMode: "all-assigned-preview"'));

const budget = extract('prepareGalleryForegroundArtworkBudget');
expect('no nearest-zone limit', !budget.includes('foregroundArtworkLimit') && !budget.includes('selected >= limit'));
expect('every current queue entry promoted', budget.includes('entry.foregroundCritical = true'));
expect('missing required Preview is queued', budget.includes('queueGalleryMissingRequiredPreviews'));

const presence = extract('getGalleryActiveArtworkPreviewPresenceSnapshot');
expect('Full or Preview material satisfies presence', presence.includes('artwork.metadata.imageMaterial') && presence.includes('imagePlane.material === artwork.metadata.imageMaterial'));
expect('inactive exhibitions excluded', presence.includes('isGalleryEntityOwnerActive'));

const drain = extract('drainGalleryFastStartBackgroundQueue');
expect('Preview starts after paint, not requestIdleCallback', drain.includes('yieldGalleryForegroundFrame(0).then') && !drain.includes('runGalleryFastStartIdleTask(function'));
expect('bounded configured concurrency', drain.includes('Math.min(6, getGalleryFastStartPreviewTextureConcurrency())'));
expect('foreground Preview is forced immediate', drain.includes('_galleryFastStartForceImmediate = true') && drain.includes('_galleryFastStartPreferPreview'));

const snapshot = extract('getGalleryInteractionReadinessSnapshot');
expect('readiness counts required Preview', snapshot.includes('requiredPreviews') && snapshot.includes('readyPreviews') && snapshot.includes('missingPreviews'));
expect('ready requires complete fill', snapshot.includes('snapshot.requiredPreviews === snapshot.readyPreviews') && snapshot.includes('snapshot.missingPreviews === 0'));
expect('hard gate rejects broken Preview fill', source.includes('Artwork Preview readiness failed:') && source.includes('required-preview-hard-gate'));
expect('models remain background', !snapshot.includes('snapshot.modelQueue === 0') && !snapshot.includes('snapshot.modelActive === 0'));

expect('Full residency policy preserved', source.includes('schema: "gallery-artwork-residency.v3"') && source.includes('idleBeforeFullMs: 1800'));
expect('Admin diagnostics describe guarantee', admin.includes('Preview presence'));

console.log('C6C8C11 Guaranteed Preview Fill regression passed.');
