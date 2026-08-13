import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const viewer = fs.readFileSync(new URL('src/bootstrap/gallery-viewer-bootstrap.js', root), 'utf8');
const admin = fs.readFileSync(new URL('src/bootstrap/admin-workspace-bootstrap.js', root), 'utf8');
const guard = fs.readFileSync(new URL('src/bootstrap/transition-guard.js', root), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'));
function expect(label, ok){ if(!ok) throw new Error(`FAIL: ${label}`); console.log(`OK: ${label}`); }
expect('current stage is C6C8C6', pkg.version.includes('c6c8c10') && viewer.includes('const STAGE = "12C66C6C8C10"') && admin.includes('const STAGE = "12C66C6C8C10"'));
expect('shared full-page guard exists', guard.includes('position:fixed; inset:0') && guard.includes('z-index:2147483000') && guard.includes('epTransitionSpinner'));
expect('guard blocks wheel/touch/keyboard interaction', guard.includes('document.addEventListener("wheel"') && guard.includes('document.addEventListener("touchmove"') && guard.includes('document.addEventListener("keydown"'));
expect('guard paints before transition work', guard.includes('await waitForPaint()'));
expect('exhibition switch is guarded', admin.includes('title: `Switching to ${target.name}…`') && admin.includes('await window.GalleryApp.switchExhibition'));
expect('Admin to Public same-runtime return is guarded', viewer.includes('title: "Returning to Public Page…"') && viewer.includes('exitAdminWorkspaceMode'));
expect('Public to Admin same-runtime entry is guarded', viewer.includes('title: "Opening Admin Workspace…"') && viewer.includes('enterAdminWorkspaceMode'));
expect('network telemetry no longer extends the blocking overlay', admin.includes('void captureExhibitionTransitionDiagnostic') && viewer.includes('void finishModeTransitionDiagnostic'));
console.log('C6C8C6 Transition Guard regression passed.');
