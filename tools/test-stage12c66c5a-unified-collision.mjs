import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const marker of markers) { start = source.indexOf(marker); if (start >= 0) break; }
  assert.ok(start >= 0, `Missing function ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0, state = 'code', quote = null;
  for (let i = brace; i < source.length; i += 1) {
    const c = source[i], n = source[i + 1] || '';
    if (state === 'code') {
      if (c === '"' || c === "'" || c === '`') { state = 'string'; quote = c; }
      else if (c === '/' && n === '/') { state = 'line'; i += 1; }
      else if (c === '/' && n === '*') { state = 'block'; i += 1; }
      else if (c === '{') depth += 1;
      else if (c === '}') { depth -= 1; if (depth === 0) return source.slice(start, i + 1); }
    } else if (state === 'string') { if (c === '\\') i += 1; else if (c === quote) state = 'code'; }
    else if (state === 'line' && c === '\n') state = 'code';
    else if (state === 'block' && c === '*' && n === '/') { state = 'code'; i += 1; }
  }
  throw new Error(`Unterminated ${name}`);
}

class Vec3 {
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  clone(){return new Vec3(this.x,this.y,this.z);}
  copyFrom(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}
  addInPlace(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}
  subtract(v){return new Vec3(this.x-v.x,this.y-v.y,this.z-v.z);}
  lengthSquared(){return this.x*this.x+this.y*this.y+this.z*this.z;}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
  static Zero(){return new Vec3();}
  static DistanceSquared(a,b){const x=a.x-b.x,y=a.y-b.y,z=a.z-b.z;return x*x+y*y+z*z;}
}

function makeContext(blocker) {
  const ctx = {
    Date, Number, String, Math,
    BABYLON: { Vector3: Vec3 },
    camera: { position: new Vec3(0, 1.7, 0) },
    editMode: false,
    viewerMovementVelocity: new Vec3(1,0,1),
    galleryGroundCollisionRuntime: { lastResult:null, movementLog:[], maxLogEntries:160, lastAcceptedPosition:new Vec3() },
    isViewerCollisionActive(){ return true; },
    getGalleryGroundedCameraYAtPosition(){ return 1.7; },
    getGalleryGroundCollisionBlock(from, candidate){ return blocker(from, candidate); }
  };
  vm.createContext(ctx);
  vm.runInContext([
    extractFunction('serializeGroundCollisionVector'),
    extractFunction('recordGalleryGroundMovement'),
    extractFunction('resolveGalleryGroundMovement')
  ].join('\n\n'), ctx);
  return ctx;
}


// C5A regression: grounded walking must keep the exact C4 baseline instead of
// deriving camera Y from whichever floor layer a downward ray happens to hit.
const heightCtx = {
  Number,
  isFinite,
  getGalleryDefaultWalkCameraY(){ return -2.2; }
};
vm.createContext(heightCtx);
vm.runInContext(extractFunction('getGalleryGroundedCameraYAtPosition'), heightCtx);
assert.equal(heightCtx.getGalleryGroundedCameraYAtPosition({y:-3.1}, -3.1), -2.2);

let ctx = makeContext(() => null);
let result = ctx.resolveGalleryGroundMovement(new Vec3(1,0,1), {source:'viewer-wasd'});
assert.equal(result.resolution, 'full');
assert.equal(ctx.camera.position.x, 1);
assert.equal(ctx.camera.position.z, 1);
assert.equal(ctx.camera.position.y, 1.7);

ctx = makeContext((from, candidate) => candidate.z !== from.z ? {type:'wall',name:'fixture'} : null);
result = ctx.resolveGalleryGroundMovement(new Vec3(1,0,1), {source:'desktop-dpad'});
assert.equal(result.resolution, 'slide-x');
assert.equal(ctx.camera.position.x, 1);
assert.equal(ctx.camera.position.z, 0);
assert.equal(result.detectedCollider.type, 'wall');

ctx = makeContext(() => ({type:'sculpture',name:'fixture',slotId:'slot-1'}));
result = ctx.resolveGalleryGroundMovement(new Vec3(1,0,1), {source:'click-to-move'});
assert.equal(result.resolution, 'blocked');
assert.equal(result.moved, false);
assert.equal(ctx.camera.position.x, 0);
assert.equal(ctx.viewerMovementVelocity.lengthSquared(), 0);
assert.equal(result.detectedCollider.slotId, 'slot-1');

// Actual sculpture sweep: crossing is blocked, escaping a restored overlap is allowed.
const sweepCtx = {
  Math,
  viewerCollisionRadius: 0.34,
  isViewerSculptureBlockActive(){return true;},
  getViewerSculptureCollisionProxies(){return [{slotId:'slot-1'}];},
  getViewerSculptureProxyBounds(){return {minimum:{x:-1,z:-1},maximum:{x:1,z:1}};}
};
vm.createContext(sweepCtx);
vm.runInContext([
  extractFunction('galleryExhibitSegmentIntersectsExpandedAabb2D'),
  extractFunction('findViewerSculptureCollisionRecord')
].join('\n\n'), sweepCtx);
assert.ok(sweepCtx.findViewerSculptureCollisionRecord({x:-3,z:0},{x:3,z:0}));
assert.equal(sweepCtx.findViewerSculptureCollisionRecord({x:0,z:0},{x:2,z:0}), null);
assert.ok(sweepCtx.findViewerSculptureCollisionRecord({x:0.8,z:0},{x:0,z:0}));

console.log('Stage 12C66C5A unified collision behavior tests passed.');
