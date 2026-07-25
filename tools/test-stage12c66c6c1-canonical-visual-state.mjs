import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/Gallery_V0_11.js',import.meta.url),'utf8');
const bootstrap=fs.readFileSync(new URL('../src/bootstrap/gallery-viewer-bootstrap.js',import.meta.url),'utf8');
function assert(c,m){if(!c)throw new Error(m)}
function extractFunction(text,name){const ms=[`async function ${name}(`,`function ${name}(`];let st=-1;for(const m of ms){st=text.indexOf(m);if(st>=0)break}assert(st>=0,`Missing ${name}`);const b=text.indexOf('{',st);let d=0,s='c',q='';for(let i=b;i<text.length;i++){const c=text[i],n=text[i+1]||'';if(s==='c'){if('"\'`'.includes(c)){s='s';q=c}else if(c==='/'&&n==='/'){s='l';i++}else if(c==='/'&&n==='*'){s='b';i++}else if(c==='{')d++;else if(c==='}'&&--d===0)return text.slice(st,i+1)}else if(s==='s'){if(c==='\\')i++;else if(c===q)s='c'}else if(s==='l'&&c==='\n')s='c';else if(s==='b'&&c==='*'&&n==='/'){s='c';i++}}throw new Error(`Unterminated ${name}`)}

assert(source.includes('schema: "gallery-canonical-visual-state.v1"'),'Canonical visual runtime missing');
assert(!source.includes('reflectionScale:'),'Destructive reflectionScale remains in profiles');
assert(bootstrap.includes('adaptToDeviceRatio: false'),'Bootstrap still owns device DPR');
const normalize=extractFunction(source,'normalizeVisualSettings');
const derive=extractFunction(source,'deriveRuntimeVisualSettings');
const choose=extractFunction(source,'chooseGalleryInitialMobileQualityProfile');
const snapshot=extractFunction(source,'createVisualSettingsSnapshot');
const profileApply=extractFunction(source,'applyGalleryMobileQualityProfile');
const viewportOwner=extractFunction(source,'installGalleryMobileRenderResolutionViewportOwner');
assert(!normalize.includes('isGalleryDeviceProfileMobile')&&!normalize.includes('postDomain'),'normalizeVisualSettings is not pure');
assert(derive.includes('runtime.reflectionStrength')===false,'Runtime derivation must not rewrite reflection strength');
assert(derive.includes('runtime.ssaoEnabled')&&derive.includes('runtime.bloomEnabled'),'Runtime effect gating missing');
assert(snapshot.includes('visualCurrentSettings || visualDefaultSettings')&&!snapshot.includes('readVisualSettingsFromScene'),'Snapshot is not canonical-only');
assert(profileApply.includes('visualCurrentSettings')&&profileApply.includes('profileName: profileName'),'Profile reapply does not derive from canonical state');
assert(viewportOwner.includes('gallery-mobile-viewport-change')&&!viewportOwner.includes('visualViewport.addEventListener')&&!viewportOwner.includes('window.addEventListener("resize"'),'Multiple mobile viewport paths remain');
assert(source.includes('getCanonicalVisualStateDebug: function'),'Canonical debug API missing');

const defaults={preset:'Neutral Gallery',exposure:1,contrast:1.03,bloomEnabled:true,bloomIntensity:0.02,bloomThreshold:0.9,vignetteEnabled:true,vignetteWeight:0.1,ssaoEnabled:true,ssaoStrength:0.28,ssaoRadius:1.65,ssaoArea:0.95,ssaoBase:0.04,imageProcessingEnabled:true,toneMappingEnabled:true,fxaaEnabled:true,reflectionEnabled:true,reflectionStrength:0.55,floorReflectionStrength:0.72,wallReflectionStrength:0.22,ceilingReflectionStrength:0.18,floorRoughness:0.72,wallRoughness:0.86,ceilingRoughness:0.84};
const profiles={
 high:{postProcessing:{fxaa:true,bloom:true,vignette:true,ssao:true,preserveCanonicalReflections:true}},
 balanced:{postProcessing:{fxaa:true,bloom:true,vignette:true,ssao:false,preserveCanonicalReflections:true}},
 safe:{postProcessing:{fxaa:true,bloom:false,vignette:false,ssao:false,preserveCanonicalReflections:true}}
};
const factory=new Function('visualDefaultSettings','isGalleryDeviceProfileMobile','getGalleryMobileQualityProfileDefinition','galleryAdaptiveMobileQualityRuntime','galleryDeviceProfile',`${normalize}\n${derive}\nreturn {normalizeVisualSettings,deriveRuntimeVisualSettings};`);
const api=factory(defaults,()=>true,(name)=>profiles[name],{currentProfileName:'safe'},{currentQualityProfile:'safe'});
const canonical=api.normalizeVisualSettings(defaults);
const safe1=api.deriveRuntimeVisualSettings(canonical,'safe');
const balanced=api.deriveRuntimeVisualSettings(canonical,'balanced');
const high=api.deriveRuntimeVisualSettings(canonical,'high');
const safe2=api.deriveRuntimeVisualSettings(canonical,'safe');
for(const key of ['reflectionStrength','floorReflectionStrength','wallReflectionStrength','ceilingReflectionStrength','floorRoughness','wallRoughness','ceilingRoughness']){
 assert(safe1[key]===canonical[key]&&balanced[key]===canonical[key]&&high[key]===canonical[key],`Reflection parity drifted for ${key}`);
}
assert(JSON.stringify(safe1)===JSON.stringify(safe2),'Safe profile derivation is not idempotent');
assert(canonical.bloomEnabled===true&&canonical.ssaoEnabled===true&&canonical.vignetteEnabled===true,'Canonical effects were mutated');
assert(safe1.bloomEnabled===false&&safe1.ssaoEnabled===false&&safe1.vignetteEnabled===false,'Safe gating failed');
assert(balanced.bloomEnabled===true&&balanced.ssaoEnabled===false&&balanced.vignetteEnabled===true,'Balanced gating failed');
assert(high.bloomEnabled===true&&high.ssaoEnabled===true&&high.vignetteEnabled===true,'High gating failed');

const chooseFactory=new Function('galleryMobileQualityProfileDefinitions',`${choose}; return chooseGalleryInitialMobileQualityProfile;`);
const chooseProfile=chooseFactory(profiles);
assert(chooseProfile({embeddedBrowser:true,lowMemory:false,lowCpu:false},'auto')==='balanced','Embedded browser still forced to Safe');
assert(chooseProfile({embeddedBrowser:true,lowMemory:true,lowCpu:false},'auto')==='safe','Actual low-memory device is not Safe');
assert(chooseProfile({embeddedBrowser:false,lowMemory:false,lowCpu:false},'high')==='high','Manual profile override failed');

console.log('Stage 12C66C6C2 canonical visual-state tests passed.');
