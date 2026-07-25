import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/Gallery_V0_11.js',import.meta.url),'utf8');
const bootstrap=fs.readFileSync(new URL('../src/bootstrap/gallery-viewer-bootstrap.js',import.meta.url),'utf8');
function assert(c,m){if(!c)throw new Error(m)}
function extractFunction(text,name){const ms=[`async function ${name}(`,`function ${name}(`];let st=-1;for(const m of ms){st=text.indexOf(m);if(st>=0)break}assert(st>=0,`Missing ${name}`);const b=text.indexOf('{',st);let d=0,s='c',q='';for(let i=b;i<text.length;i++){const c=text[i],n=text[i+1]||'';if(s==='c'){if('"\'`'.includes(c)){s='s';q=c}else if(c==='/'&&n==='/'){s='l';i++}else if(c==='/'&&n==='*'){s='b';i++}else if(c==='{')d++;else if(c==='}'&&--d===0)return text.slice(st,i+1)}else if(s==='s'){if(c==='\\')i++;else if(c===q)s='c'}else if(s==='l'&&c==='\n')s='c';else if(s==='b'&&c==='*'&&n==='/'){s='c';i++}}throw new Error('unterminated')}
assert(source.includes('schema: "gallery-mobile-quality-domains.v2"'),'Quality domain runtime missing');
for(const profile of ['high','balanced','safe']){assert(source.includes(`${profile}: {`),`Missing ${profile}`)}
assert(source.includes('render: { targetEffectiveDpr: 1.72') && source.includes('render: { targetEffectiveDpr: 1.48') && source.includes('render: { targetEffectiveDpr: 1.22'),'Render-domain floors missing');
assert(source.includes('postProcessing: {') && source.includes('streaming: { models:'),'Post/streaming domains missing');
assert(bootstrap.includes('adaptToDeviceRatio: false'),'Bootstrap must not own device DPR');
const calc=extractFunction(source,'calculateGalleryMobileRenderResolution');
assert(calc.includes('var hardwareScalingLevel = 1 / effectiveDpr'),'Babylon hardware-scaling semantics are incorrect');
assert(calc.includes('maxMegapixels') && calc.includes('predictedMegapixels'),'Megapixel budget missing');
assert(source.split('engine.setHardwareScalingLevel(').length-1===1,'Multiple hardware-scaling writers remain');
const resizeOwner=extractFunction(source,'installGalleryMobileRenderResolutionViewportOwner');
assert(resizeOwner.includes('gallery-mobile-viewport-change') && !resizeOwner.includes('window.addEventListener("resize"') && !resizeOwner.includes('visualViewport.addEventListener'),'Viewport resolution owner is not singular');
const normalize=extractFunction(source,'normalizeVisualSettings');
assert(!normalize.includes('postDomain') && !normalize.includes('reflectionScale'),'Canonical sanitizer still applies mobile transforms');
const derive=extractFunction(source,'deriveRuntimeVisualSettings');
assert(derive.includes('postDomain.ssao') && derive.includes('postDomain.bloom') && derive.includes('Canonical reflection strengths'),'Runtime post-processing derivation missing');
const apply=extractFunction(source,'applyGalleryMobileQualityProfile');
assert(apply.includes('domains = {') && apply.includes('calculateGalleryMobileRenderResolution'),'Profile domains are not applied together');
const adaptive=extractFunction(source,'updateGalleryAdaptiveMobileQuality');
assert(adaptive.includes('sampleElapsedMs < 3600'),'Adaptive sample window too short');
assert(adaptive.includes('lowWindows >= 3') && adaptive.includes('highWindows >= 6'),'Adaptive hysteresis missing');
assert(source.includes('warmupUntil = Date.now() + 6500'),'Adaptive warmup missing');
assert(source.includes('Date.now() + 12000'),'Profile cooldown is not stable');
const modelLod=extractFunction(source,'configureGalleryModelRuntimeLod');
const propLod=extractFunction(source,'configureGalleryPropStreamingLod');
assert(!modelLod.includes('addLODLevel') && !propLod.includes('addLODLevel'),'Null LOD remains active');
assert(modelLod.includes('galleryNullLodDisabled') && propLod.includes('galleryNullLodDisabled'),'LOD disable contract missing');
const props=extractFunction(source,'updateGalleryPropZoneActivation');
assert(props.includes('isGalleryPropProtectedByView') && props.includes('galleryLastVisibleAt'),'Frustum/grace protection missing');
const priority=extractFunction(source,'canGalleryPriorityFullArtworkBypassMovement');
assert(priority.includes('isGalleryArtworkEntryVisibleForPriority')&&priority.includes('priorityFullUpgradeMinimumAgeMs'),'Visible artwork priority upgrade missing');
const fullDrain=extractFunction(source,'drainGalleryFastStartFullArtworkQueue');
assert(fullDrain.includes('priorityOverride')&&fullDrain.includes('aVisible'),'Full artwork queue is not visibility-prioritized');
const budget=extractFunction(source,'maintainGalleryStreamingMemoryBudget');
assert(budget.includes('artwork textures are permanent residents once assigned'),'Artwork quality can still be evicted');
assert(source.includes('stage: "12C66C6C1"') && source.includes('schema: "gallery-mobile-quality-inspector.v1"'),'C6C quality diagnostics missing');

// Execute the render-resolution math for a representative 390x844 DPR-3 phone.
const calcFactory=new Function('getGalleryMobileQualityProfileDefinition','getGalleryCanvasCssMetrics','window','galleryDeviceProfile',`${calc}; return calculateGalleryMobileRenderResolution;`);
const defs={
 high:{minHardwareScalingLevel:0.50,maxHardwareScalingLevel:0.72,render:{targetEffectiveDpr:1.72,minEffectiveDpr:1.42,maxMegapixels:3.35}},
 balanced:{minHardwareScalingLevel:0.58,maxHardwareScalingLevel:0.82,render:{targetEffectiveDpr:1.48,minEffectiveDpr:1.24,maxMegapixels:2.55}},
 safe:{minHardwareScalingLevel:0.72,maxHardwareScalingLevel:0.98,render:{targetEffectiveDpr:1.22,minEffectiveDpr:1.05,maxMegapixels:1.85}}
};
const calculate=calcFactory((name)=>defs[name],()=>({width:390,height:844}),{devicePixelRatio:3},{devicePixelRatio:3});
const highResult=calculate('high'), balancedResult=calculate('balanced'), safeResult=calculate('safe');
assert(highResult.hardwareScalingLevel < balancedResult.hardwareScalingLevel && balancedResult.hardwareScalingLevel < safeResult.hardwareScalingLevel,'Quality profiles do not monotonically reduce render resolution');
assert(highResult.effectiveDpr >= 1.65 && balancedResult.effectiveDpr >= 1.4 && safeResult.effectiveDpr >= 1.15,'Mobile effective-DPR floors are too low');
assert(highResult.predictedMegapixels <= 3.35+0.05 && balancedResult.predictedMegapixels <= 2.55+0.05 && safeResult.predictedMegapixels <= 1.85+0.05,'Megapixel caps are exceeded');

console.log('Stage 12C66C6C1 mobile quality-domain tests passed.');
