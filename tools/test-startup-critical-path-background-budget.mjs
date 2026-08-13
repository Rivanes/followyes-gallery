import fs from 'node:fs';
const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const admin = fs.readFileSync(new URL('../src/bootstrap/admin-workspace-bootstrap.js', import.meta.url), 'utf8');
function expect(label, value) { if (!value) throw new Error(`C6C8C10 regression: ${label}`); }
function extract(name) {
  const marks=[`async function ${name}(`,`function ${name}(`]; let start=-1;
  for (const m of marks) { start=source.indexOf(m); if(start>=0) break; }
  expect(`function ${name}`, start>=0); const brace=source.indexOf('{',start); let d=0, state='c', quote='';
  for(let i=brace;i<source.length;i++){const c=source[i],n=source[i+1]||'';if(state==='c'){if(c==='"'||c==="'"||c==='`'){state='s';quote=c}else if(c==='/'&&n==='/'){state='l';i++}else if(c==='/'&&n==='*'){state='b';i++}else if(c==='{')d++;else if(c==='}'&&--d===0)return source.slice(start,i+1)}else if(state==='s'){if(c==='\\')i++;else if(c===quote)state='c'}else if(state==='l'&&c==='\n')state='c';else if(state==='b'&&c==='*'&&n==='/'){state='c';i++;}}
  throw new Error(`Unterminated ${name}`);
}
expect('package stage', pkg.version.includes('c6c8c15'));
expect('runtime stage', source.includes('stage: "12C66C6C8C15"') && source.includes('exhibition-platform-multi-exhibition.v10'));
expect('foreground Preview gate upgraded by C6C8C11', source.includes('previewGateMode: "all-assigned-preview"') && source.includes('function prepareGalleryForegroundArtworkBudget('));
const pending = extract('getGalleryForegroundPendingSnapshot');
expect('models not foreground blockers', !pending.includes('criticalModelQueue') && !pending.includes('modelActive:') && pending.includes('backgroundModelQueue'));
const drain = extract('drainGalleryFastStartBackgroundQueue');
expect('foreground drain artwork-only', drain.includes('takeGalleryForegroundArtworkEntry()') && !drain.includes('applyModel3dStateToSlot'));
const pump = extract('pumpGalleryZoneStreamingQueues');
expect('background active-zone only', pump.includes('["critical", "nearby"]') && !pump.includes('["critical", "nearby", "deferred"]'));
expect('background one-slice budget', pump.includes('budgetRuntime.artworkStarts += 1') && pump.includes('budgetRuntime.modelStarts += 1') && pump.includes('getGalleryBackgroundHydrationPauseReason("model")'));
expect('motion-aware pause', source.includes('function isGalleryBackgroundHydrationMotionActive(') && source.includes('model-idle-budget') && source.includes('artwork-idle-budget'));
expect('cached batched Space warmup', source.includes('gallerySpaceGpuWarmMeshCache') && source.includes('batchSize = galleryDeviceProfile.mobile ? 2 : 5') && source.includes('Promise.all(list.slice(i, i + batchSize)'));
expect('admin background diagnostics', admin.includes('BG slices') && admin.includes('Preview presence'));
console.log('C6C8C10 Startup Critical Path / Background Hydration Budget regression passed.');
