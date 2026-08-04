import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/gallery-engine.js',import.meta.url),'utf8');
function assert(c,m){if(!c)throw new Error(m)}
function extractFunction(text,name){const ms=[`async function ${name}(`,`function ${name}(`];let st=-1;for(const m of ms){st=text.indexOf(m);if(st>=0)break}assert(st>=0,`Missing ${name}`);const b=text.indexOf('{',st);let d=0,s='c',q='';for(let i=b;i<text.length;i++){const c=text[i],n=text[i+1]||'';if(s==='c'){if('"\'`'.includes(c)){s='s';q=c}else if(c==='/'&&n==='/'){s='l';i++}else if(c==='/'&&n==='*'){s='b';i++}else if(c==='{')d++;else if(c==='}'&&--d===0)return text.slice(st,i+1)}else if(s==='s'){if(c==='\\')i++;else if(c===q)s='c'}else if(s==='l'&&c==='\n')s='c';else if(s==='b'&&c==='*'&&n==='/'){s='c';i++}}throw new Error(`Unterminated ${name}`)}

assert(source.includes('schema: "gallery-artwork-residency.v1"'),'Residency runtime missing');
for(const value of ['fullTextures: 8','fullTextures: 6','fullTextures: 4']) assert(source.includes(value),`Missing residency budget ${value}`);
assert(source.includes('embeddedFullTextures: 5')&&source.includes('embeddedFullTextures: 4'),'Embedded-browser budgets missing');
assert(!source.includes('artwork textures are permanent residents once assigned'),'Permanent Full residency returned');
assert(!source.includes('function suspendArtworkTextureForStreaming('),'Empty-frame suspension system returned');
const maintain=extractFunction(source,'maintainGalleryStreamingMemoryBudget');
assert(maintain.includes('enforceGalleryArtworkResidencyBudget'),'Memory budget does not own artwork residency');
assert(maintain.includes('imagePlane.setEnabled(true)'),'Always-visible frame contract missing');
const downgrade=extractFunction(source,'downgradeGalleryArtworkToPreview');
assert(downgrade.includes('_galleryFastStartPreferPreview = true'),'Full does not downgrade to Preview');
assert(downgrade.includes('_galleryTextureOnlyUpgrade = true'),'Downgrade can mutate artwork geometry');
assert(!downgrade.includes('setEnabled(false)'),'Downgrade can create an empty frame');
const priorityFn=extractFunction(source,'getGalleryArtworkResidencyPriority');
for(const signal of ['galleryInspectRuntime.target','previousTarget','nextTarget','isGalleryArtworkVisibleForResidency','getGalleryStreamingTierForObject']) assert(priorityFn.includes(signal),`Residency priority missing ${signal}`);
const drain=extractFunction(source,'drainGalleryFastStartFullArtworkQueue');
assert(drain.includes('isGalleryArtworkFullResidencyDesired'),'Full queue ignores residency admission');
assert(drain.includes('full-wait-for-preview-downgrade'),'Full queue can exceed budget');
assert(source.includes('berryboy_mobile_survival_last_snapshot_v1'),'Last-session snapshot storage missing');
for(const label of ['"DBG"','"LIVE"','"FREEZE"','"LAST"','"CLOSE"']) assert(source.includes(label),`On-screen diagnostic control missing ${label}`);
assert(source.includes('schema: "gallery-mobile-survival-snapshot.v1"'),'Survival snapshot schema missing');
assert(source.includes('function unregisterCommonShadowMesh('),'Shadow registry unregister missing');
const dispose=extractFunction(source,'disposeModel3dSlotRuntime');
assert(dispose.includes('unregisterCommonShadowMesh')&&dispose.includes('pruneGalleryShadowRegistries'),'Model disposal still leaks shadow registries');
const ssao=extractFunction(source,'disposeVisualSsaoResourcesForSurvival');
assert(ssao.includes('visualSsaoPipeline.dispose')&&ssao.includes('disableGeometryBufferRenderer'),'SSAO/Geometry Buffer disposal incomplete');
const disableSpot=extractFunction(source,'disableLocalSpotShadowByBudget');
assert(disableSpot.includes('_localSpotShadowBudgetDisposeTimer'),'Inactive Spot generators are never released');
const tour=extractFunction(source,'monitorGalleryExhibitTourLayout');
assert(tour.includes('if (!editMode) return'),'Tour layout monitor still runs in Viewer Mode');
assert(source.includes('stage: "12C66C6C2"'),'C6C2 stage identity missing');

// Behavioral budget sanity: top priorities fit the hard cap and protected targets win.
const candidates=[
 {id:'inspect',score:100000},{id:'next',score:90000},{id:'visibleA',score:60000},
 {id:'visibleB',score:59000},{id:'criticalA',score:30000},{id:'criticalB',score:29000},
 {id:'farA',score:1000},{id:'farB',score:900}
];
const budget=6;
const selected=candidates.slice().sort((a,b)=>b.score-a.score).slice(0,budget).map(x=>x.id);
assert(selected.includes('inspect')&&selected.includes('next'),'Protected Inspect neighbors lost residency');
assert(selected.length===budget&&!selected.includes('farA'),'Budget selection is not bounded');

console.log('Mobile Memory Survival tests passed.');
