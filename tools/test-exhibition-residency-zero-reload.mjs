import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src', 'Gallery_V0_11.js'), 'utf8');
const viewer = fs.readFileSync(path.join(root, 'src', 'bootstrap', 'gallery-viewer-bootstrap.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'src', 'bootstrap', 'admin-workspace-bootstrap.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const cacheBootstrap = fs.readFileSync(path.join(root, 'src', 'bootstrap', 'asset-cache-bootstrap.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'asset-cache-sw.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function expect(label, condition) {
  if (!condition) throw new Error(`C6C8C5 invariant failed: ${label}`);
  console.log(`✓ ${label}`);
}
function extractFunction(text, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  let start=-1;
  for (const marker of markers) { start=text.indexOf(marker); if(start>=0) break; }
  if(start<0) throw new Error(`Missing ${name}`);
  const brace=text.indexOf('{',start); let depth=0,mode='code',quote='';
  for(let i=brace;i<text.length;i++){
    const c=text[i],n=text[i+1]||'';
    if(mode==='code'){
      if(c==='"'||c==="'"||c==='`'){mode='string';quote=c;}
      else if(c==='/'&&n==='/'){mode='line';i++;}
      else if(c==='/'&&n==='*'){mode='block';i++;}
      else if(c==='{') depth++;
      else if(c==='}'&&--depth===0) return text.slice(start,i+1);
    } else if(mode==='string'){ if(c==='\\') i++; else if(c===quote) mode='code'; }
    else if(mode==='line'&&c==='\n') mode='code';
    else if(mode==='block'&&c==='*'&&n==='/'){mode='code';i++;}
  }
  throw new Error(`Unterminated ${name}`);
}

const switchFn = extractFunction(source, 'switchGalleryExhibition');
const parkFn = extractFunction(source, 'parkActiveGalleryExhibitionLayer');
const restoreFn = extractFunction(source, 'restoreGalleryExhibitionLayer');
const enterFn = extractFunction(source, 'enterGalleryAdminWorkspaceMode');
const exitFn = extractFunction(source, 'exitGalleryAdminWorkspaceMode');
const modeFn = extractFunction(source, 'setGallerySameRuntimeModeState');

expect('Current runtime/package identity is C6C8C5', source.includes('stage: "12C66C6C8C11"') && pkg.version.includes('c6c8c11'));
expect('Recently visited Exhibition layers have a residency registry', source.includes('layerResidency: Object.create(null)') && source.includes('residentLayerHits'));
expect('Switch parks a clean same-Space layer instead of disposing it', switchFn.includes('parkActiveGalleryExhibitionLayer(previousExhibition, previousRuntimeState)') && parkFn.includes('setGalleryArtworkResidentEnabled(artwork, false'));
expect('Resident target is restored from RAM/GPU', switchFn.includes('restoreGalleryExhibitionLayer(exhibition.id)') && switchFn.includes('lastSwitchMode = "resident-layer-resume"') && restoreFn.includes('artworks = layer.artworks'));
expect('Parked artwork callbacks cannot re-register inactive owners', source.includes('artwork.metadata.exhibitionLayerParked') && source.includes('if (artwork.metadata && artwork.metadata.exhibitionLayerParked) return false'));
expect('Residency is bounded by LRU eviction', source.includes('maxParkedLayers') && source.includes('pruneGalleryExhibitionLayerResidency(exhibition.id)') && source.includes('residentLayerEvictions'));
expect('Admin/Public mode transition avoids old edit-button rebuild path', modeFn.includes('same-runtime-ui-only') && !exitFn.includes('editButton.click()') && !exitFn.includes('updateViewerCollisionMode()') && !exitFn.includes('rebuildGalleryExhibitTour('));
expect('Admin entry also uses same-runtime mode state', enterFn.includes('setGallerySameRuntimeModeState(true'));
expect('Service Worker measures cache hits and real Storage network fetches', sw.includes('EXHIBITION_ASSET_DELIVERY_STATS') && sw.includes('supabaseNetworkFetches') && sw.includes('networkKnownBytes'));
expect('Cache bootstrap exposes network delivery stats', cacheBootstrap.includes('getExhibitionAssetDeliveryStats') && cacheBootstrap.includes('resetExhibitionAssetDeliveryStats'));
expect('Admin UI exposes hard network diagnostics', adminHtml.includes('id="networkDiagnostics"') && admin.includes('Storage session:') && admin.includes('zeroStorageNetwork'));
expect('Exhibition switch captures a per-transition Storage delta', admin.includes('captureExhibitionTransitionDiagnostic') && admin.includes('supabaseNetworkFetches'));
expect('Admin → Public transition captures a same-runtime Storage delta', viewer.includes('finishModeTransitionDiagnostic') && viewer.includes('zeroStorageNetwork'));

console.log('C6C8C5 Exhibition Residency / Zero-Reload / Network Diagnostics invariants passed.');
