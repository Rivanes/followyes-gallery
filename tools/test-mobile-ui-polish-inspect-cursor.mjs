import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');

// 1) Intro CTA must live outside the scrollable instruction body.
const introStart = source.indexOf('<div id="berryboyViewerIntroCard"');
const scrollStart = source.indexOf('<div class="berryboyIntroScrollable">', introStart);
const scrollEnd = source.indexOf('</div>\n\n                    <div class="berryboyIntroFooter">', scrollStart);
const footerStart = source.indexOf('<div class="berryboyIntroFooter">', scrollStart);
const buttonStart = source.indexOf('<button id="berryboyIntroStart"', footerStart);
assert.ok(introStart >= 0 && scrollStart > introStart, 'Intro scroll body missing');
assert.ok(scrollEnd > scrollStart, 'Intro scroll body does not close before footer');
assert.ok(footerStart > scrollEnd && buttonStart > footerStart, 'Start exploring is not isolated in pinned footer');
assert.ok(source.includes('max-height: calc(100dvh - 20px - env(safe-area-inset-top) - env(safe-area-inset-bottom))'), 'Mobile intro does not use dynamic viewport/safe-area height');
assert.ok(source.includes('.berryboyIntroScrollable {\n                min-height: 0;\n                overflow: auto;'), 'Instructions are not independently scrollable');

// 2) Mobile Inspect navigation must no longer reserve a wide right column in metadata.
const mobileInspectStart = source.indexOf('/* STAGE 12C66C6A1 — COMPACT MOBILE INSPECT CAPSULE.');
const mobileInspectEnd = source.indexOf('@media (max-width: 768px) and (orientation: landscape)', mobileInspectStart);
assert.ok(mobileInspectStart >= 0 && mobileInspectEnd > mobileInspectStart, 'Mobile Inspect CSS block missing');
const mobileInspectCss = source.slice(mobileInspectStart, mobileInspectEnd);
assert.ok(mobileInspectCss.includes('padding: 14px 16px 14px 58px !important;'), 'Mobile metadata still reserves the old navigation column');
assert.ok(!mobileInspectCss.includes('padding: 14px 114px 14px 58px !important;'), 'Old navigation width reservation remains');
assert.ok(mobileInspectCss.includes('top: calc(0px - (var(--gallery-inspect-navigation-size) * 0.46)) !important;'), 'Mobile navigation is not floating on the popup edge');
assert.ok(mobileInspectCss.includes('transform: none !important;'), 'Mobile navigation still uses the old centered-row transform');

// 3) Floor cursor must stay SDF-based but be physically and visually lighter.
assert.ok(source.includes('var galleryFloorCursorPulseDurationMs = 420;'), 'Cursor ripple duration was not shortened');
assert.ok(source.includes('{ size: 0.78, sideOrientation: BABYLON.Mesh.DOUBLESIDE }'), 'Cursor plane was not reduced');
assert.ok(source.includes('softRing(0.278, 0.0085, 0.006)'), 'Thin cursor core missing');
assert.ok(source.includes('softRing(0.278, 0.018, 0.011) * baseAlpha * 0.22'), 'Subtle cursor halo missing');
assert.ok(source.includes('galleryFloorCursorRingMaterial.setFloat("baseAlpha", 0.78);'), 'Hover cursor alpha was not reduced');
assert.ok(!source.includes('softRing(0.275, 0.041, 0.010) * baseAlpha * 0.56'), 'Heavy legacy cursor halo remains');

console.log('C6C8C16 mobile UI polish / Inspect layout / cursor refresh tests passed.');
