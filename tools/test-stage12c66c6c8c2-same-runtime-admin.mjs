import fs from 'node:fs';
const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
const viewer = fs.readFileSync(new URL('../src/bootstrap/gallery-viewer-bootstrap.js', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../src/bootstrap/admin-workspace-bootstrap.js', import.meta.url), 'utf8');
const adminHtml = fs.readFileSync(new URL('../admin.html', import.meta.url), 'utf8');
function expect(label, condition) { if (!condition) throw new Error(`C6C8C2 invariant failed: ${label}`); console.log(`✓ ${label}`); }
expect('Engine exposes same-runtime Admin enter/exit APIs', source.includes('enterAdminWorkspaceMode: enterGalleryAdminWorkspaceMode') && source.includes('exitAdminWorkspaceMode: exitGalleryAdminWorkspaceMode'));
expect('Public Edit Mode prefers inline Admin callback before navigation fallback', source.includes('window.ExhibitionPlatformOpenAdminWorkspace') && source.indexOf('window.ExhibitionPlatformOpenAdminWorkspace') < source.indexOf('window.location.href = targetUrl'));
expect('Viewer mounts Admin Workspace around the existing gallery section', viewer.includes('function openInlineAdminWorkspace(') && viewer.includes('stage.appendChild(gallerySection)'));
expect('Viewer passes the existing Babylon engine and scene', viewer.includes('engine: activeEngine') && viewer.includes('scene: activeScene'));
expect('Admin bootstrap reuses existing runtime without creating another engine in inline branch', admin.includes('const inlineWorkspaceMode') && admin.includes('engine = inlineRuntimeContext.engine') && admin.includes('scene = inlineRuntimeContext.scene') && admin.includes('enterAdminWorkspaceMode'));
expect('Returning to Public Viewer uses inline close instead of document navigation', admin.includes('inlineRuntimeContext.close') && viewer.includes('function closeInlineAdminWorkspace('));
expect('Public Page link is styled like a button including visited state', adminHtml.includes('.adminButton:visited') && adminHtml.includes('text-decoration:none'));
expect('Inline Public Page control has explicit non-link button styling', viewer.includes('#inlineAdminWorkspace .adminButton:visited') && viewer.includes('text-decoration:none !important'));
console.log('Stage 12C66C6C8C2 Same-Runtime Admin Workspace invariants passed.');
