import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/gallery-engine.js',import.meta.url),'utf8');
function assert(c,m){if(!c)throw new Error(m)}
function extractFunction(text,name){const ms=[`async function ${name}(`,`function ${name}(`];let st=-1;for(const m of ms){st=text.indexOf(m);if(st>=0)break}assert(st>=0,`Missing ${name}`);const b=text.indexOf('{',st);let d=0,s='c',q='';for(let i=b;i<text.length;i++){const c=text[i],n=text[i+1]||'';if(s==='c'){if(c==='"'||c==="'"||c==='`'){s='s';q=c}else if(c==='/'&&n==='/'){s='l';i++}else if(c==='/'&&n==='*'){s='b';i++}else if(c==='{')d++;else if(c==='}'&&--d===0)return text.slice(st,i+1)}else if(s==='s'){if(c==='\\')i++;else if(c===q)s='c'}else if(s==='l'&&c==='\n')s='c';else if(s==='b'&&c==='*'&&n==='/'){s='c';i++}}throw new Error('unterminated')}
const scan=extractFunction(source,'scanGalleryManagedMediaStorage');
assert(scan.includes('/artworks/Original') && scan.includes('/authors/Original') && scan.includes('galleryArtworkImageVariantFolder'),'Managed-media scan incomplete');
const audit=extractFunction(source,'auditGalleryManagedMedia');
assert(audit.includes('collectGalleryStateStorageReferences(currentState)'),'Active state not protected');
assert(audit.includes('readGalleryPreviousStateBackup'),'Recovery backup not protected');
assert(audit.includes('pendingDraftUploads'),'Pending uploads not protected');
assert(audit.includes('24 * 60 * 60 * 1000'),'Young-file grace period missing');
const clean=extractFunction(source,'cleanGalleryManagedMedia');
assert(clean.includes('.remove(batch)'),'Cleanup does not use Storage API');
assert(clean.includes('await auditGalleryManagedMedia()'),'Cleanup does not re-audit immediately before deletion');
assert(clean.includes('activeByOwner'),'Cleanup does not block destructive work during active media operations');
assert(clean.includes('reviewedPaths.filter'),'Cleanup does not intersect reviewed and freshly-unused paths');
const repair=extractFunction(source,'repairGalleryManagedMedia');
assert(repair.indexOf('reconcileExistingAuthorAvifVariants') < repair.indexOf('rebuildAllAuthorPhotoVariants'),'Repair rebuilds authors before reconciliation');
assert(repair.includes('rebuildAllArtworkImageVariants({ force: false })'),'Repair does not target missing artwork media');
const uiStart=source.indexOf('// STAGE 12C66C6C - AUTOMATIC MEDIA LIFECYCLE / TWO RECOVERY TOOLS');
assert(uiStart>=0,'Two-tool UI marker missing');
const ui=source.slice(uiStart,source.indexOf('// STAGE 12A - 3D MODEL SLOT UI',uiStart));
assert((ui.match(/createImageOptimizationButton\(/g)||[]).length===3,'Unexpected media button count (definition + two buttons expected)');
assert(ui.includes('REPAIR MEDIA')&&ui.includes('AUDIT & CLEAN MEDIA'),'Recovery labels missing');
console.log('Media Recovery tests passed.');
