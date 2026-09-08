/*
  Exhibition Platform — C6C8C23 Space Model Validation worker.
  Streams GLB bytes off the main thread, computes SHA-256 incrementally and validates
  the GLB/glTF container without involving Babylon or Supabase table knowledge.
*/

const VALIDATION_SCHEMA = "exhibition-platform-gallery-model-validation.v1";
const VALIDATOR_VERSION = "C6C8C23.1";
const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const MAX_JSON_BYTES = 64 * 1024 * 1024;
const MAX_REASONABLE_COORDINATE = 1e7;
const COMPONENT_TYPES = new Set([5120, 5121, 5122, 5123, 5125, 5126]);
const ACCESSOR_TYPES = new Set(["SCALAR", "VEC2", "VEC3", "VEC4", "MAT2", "MAT3", "MAT4"]);
const COMPONENT_BYTES = new Map([[5120,1],[5121,1],[5122,2],[5123,2],[5125,4],[5126,4]]);
const TYPE_COMPONENTS = new Map([["SCALAR",1],["VEC2",2],["VEC3",3],["VEC4",4],["MAT2",4],["MAT3",9],["MAT4",16]]);

function hex32(value) { return (value >>> 0).toString(16).padStart(8, "0"); }
function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

class Sha256 {
  constructor() {
    this.h = new Uint32Array([
      0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,
      0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19
    ]);
    this.buffer = new Uint8Array(64);
    this.bufferLength = 0;
    this.bytesLo = 0;
    this.bytesHi = 0;
  }
  addLength(n) {
    const lo = (this.bytesLo + (n >>> 0)) >>> 0;
    if (lo < this.bytesLo) this.bytesHi = (this.bytesHi + 1) >>> 0;
    this.bytesLo = lo;
    this.bytesHi = (this.bytesHi + Math.floor(n / 0x100000000)) >>> 0;
  }
  update(input) {
    const data = input instanceof Uint8Array ? input : new Uint8Array(input);
    this.addLength(data.byteLength);
    let offset = 0;
    if (this.bufferLength) {
      const needed = 64 - this.bufferLength;
      const take = Math.min(needed, data.length);
      this.buffer.set(data.subarray(0, take), this.bufferLength);
      this.bufferLength += take;
      offset += take;
      if (this.bufferLength === 64) {
        this.transform(this.buffer, 0);
        this.bufferLength = 0;
      }
    }
    while (offset + 64 <= data.length) {
      this.transform(data, offset);
      offset += 64;
    }
    if (offset < data.length) {
      this.buffer.set(data.subarray(offset), 0);
      this.bufferLength = data.length - offset;
    }
    return this;
  }
  transform(data, offset) {
    const K = Sha256.K;
    const w = new Uint32Array(64);
    const view = new DataView(data.buffer, data.byteOffset + offset, 64);
    for (let i=0;i<16;i++) w[i] = view.getUint32(i*4, false);
    for (let i=16;i<64;i++) {
      const x=w[i-15], y=w[i-2];
      const s0=(rotr(x,7)^rotr(x,18)^(x>>>3))>>>0;
      const s1=(rotr(y,17)^rotr(y,19)^(y>>>10))>>>0;
      w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;
    }
    let [a,b,c,d,e,f,g,h]=this.h;
    for (let i=0;i<64;i++) {
      const S1=(rotr(e,6)^rotr(e,11)^rotr(e,25))>>>0;
      const ch=((e&f)^((~e)&g))>>>0;
      const t1=(h+S1+ch+K[i]+w[i])>>>0;
      const S0=(rotr(a,2)^rotr(a,13)^rotr(a,22))>>>0;
      const maj=((a&b)^(a&c)^(b&c))>>>0;
      const t2=(S0+maj)>>>0;
      h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
    }
    this.h[0]=(this.h[0]+a)>>>0; this.h[1]=(this.h[1]+b)>>>0;
    this.h[2]=(this.h[2]+c)>>>0; this.h[3]=(this.h[3]+d)>>>0;
    this.h[4]=(this.h[4]+e)>>>0; this.h[5]=(this.h[5]+f)>>>0;
    this.h[6]=(this.h[6]+g)>>>0; this.h[7]=(this.h[7]+h)>>>0;
  }
  digestHex() {
    const savedLo=this.bytesLo, savedHi=this.bytesHi;
    const pad = new Uint8Array(this.bufferLength < 56 ? 64 - this.bufferLength : 128 - this.bufferLength);
    pad[0]=0x80;
    const bitLo=(savedLo<<3)>>>0;
    const bitHi=((savedHi<<3)|(savedLo>>>29))>>>0;
    const dv=new DataView(pad.buffer);
    dv.setUint32(pad.length-8,bitHi,false);
    dv.setUint32(pad.length-4,bitLo,false);
    this.update(pad);
    return Array.from(this.h, hex32).join("");
  }
}
Sha256.K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
]);

function issue(code, message) { return { code, message }; }
function finiteNumber(value) { return typeof value === "number" && Number.isFinite(value); }
function finiteArray(value, size) { return Array.isArray(value) && value.length === size && value.every(finiteNumber); }
function safeText(value) { return typeof value === "string" ? value.trim() : ""; }
function uriIsEmbedded(uri) { return !uri || /^data:/i.test(uri); }
function accessorElementByteSize(accessor) {
  const componentType=Number(accessor&&accessor.componentType), type=safeText(accessor&&accessor.type);
  const componentBytes=COMPONENT_BYTES.get(componentType), components=TYPE_COMPONENTS.get(type);
  if(!componentBytes||!components)return null;
  if(type==="MAT2"||type==="MAT3"||type==="MAT4"){
    const dim=Number(type.slice(3));
    const rawColumn=dim*componentBytes;
    const alignedColumn=(rawColumn+3)&~3;
    return alignedColumn*dim;
  }
  return componentBytes*components;
}
function validIndex(value,length){const n=Number(value);return Number.isInteger(n)&&n>=0&&n<length;}
function checkAccessorStorage(accessor,index,bufferViews,errors){
  const count=Number(accessor&&accessor.count), elementSize=accessorElementByteSize(accessor);
  if(!Number.isInteger(count)||count<0||!elementSize)return;
  const byteOffset=Number(accessor&&accessor.byteOffset||0);
  if(!Number.isInteger(byteOffset)||byteOffset<0){errors.push(issue("GLTF_ACCESSOR_BYTE_OFFSET",`accessors[${index}] has an invalid byteOffset.`));return;}
  if(accessor&&accessor.bufferView!==undefined){
    const bvi=Number(accessor.bufferView);
    if(validIndex(bvi,bufferViews.length)){
      const bv=bufferViews[bvi]||{}, viewLength=Number(bv.byteLength), stride=bv.byteStride===undefined?elementSize:Number(bv.byteStride);
      if(bv.byteStride!==undefined&&(!Number.isInteger(stride)||stride<elementSize||stride>252||stride%Math.min(4,COMPONENT_BYTES.get(Number(accessor.componentType))||1)!==0)) errors.push(issue("GLTF_ACCESSOR_BYTE_STRIDE",`accessors[${index}] uses an invalid bufferView byteStride.`));
      else {
        const required=count===0?byteOffset:byteOffset+(count-1)*stride+elementSize;
        if(!Number.isInteger(viewLength)||viewLength<0||required>viewLength) errors.push(issue("GLTF_ACCESSOR_RANGE",`accessors[${index}] exceeds its bufferView range.`));
      }
    }
  } else if(!(accessor&&accessor.sparse)) errors.push(issue("GLTF_ACCESSOR_STORAGE",`accessors[${index}] has neither bufferView storage nor sparse data.`));
  const sparse=accessor&&accessor.sparse;
  if(sparse!==undefined){
    const sparseCount=Number(sparse&&sparse.count);
    if(!Number.isInteger(sparseCount)||sparseCount<0||sparseCount>count) errors.push(issue("GLTF_SPARSE_COUNT",`accessors[${index}].sparse.count is invalid.`));
    const indices=sparse&&sparse.indices||{}, values=sparse&&sparse.values||{};
    const indexComponent=Number(indices.componentType), indexBytes=COMPONENT_BYTES.get(indexComponent);
    if(![5121,5123,5125].includes(indexComponent)) errors.push(issue("GLTF_SPARSE_INDEX_COMPONENT",`accessors[${index}] sparse indices use an invalid componentType.`));
    if(!validIndex(indices.bufferView,bufferViews.length)) errors.push(issue("GLTF_SPARSE_INDEX_VIEW",`accessors[${index}] sparse indices reference an invalid bufferView.`));
    else if(Number.isInteger(sparseCount)&&sparseCount>=0&&indexBytes){
      const off=Number(indices.byteOffset||0), len=Number(bufferViews[Number(indices.bufferView)].byteLength);
      if(!Number.isInteger(off)||off<0||off+sparseCount*indexBytes>len) errors.push(issue("GLTF_SPARSE_INDEX_RANGE",`accessors[${index}] sparse indices exceed their bufferView.`));
    }
    if(!validIndex(values.bufferView,bufferViews.length)) errors.push(issue("GLTF_SPARSE_VALUE_VIEW",`accessors[${index}] sparse values reference an invalid bufferView.`));
    else if(Number.isInteger(sparseCount)&&sparseCount>=0){
      const off=Number(values.byteOffset||0), len=Number(bufferViews[Number(values.bufferView)].byteLength);
      if(!Number.isInteger(off)||off<0||off+sparseCount*elementSize>len) errors.push(issue("GLTF_SPARSE_VALUE_RANGE",`accessors[${index}] sparse values exceed their bufferView.`));
    }
  }
}


class GlbStreamParser {
  constructor() {
    this.header = null;
    this.chunk = null;
    this.stash = new Uint8Array(0);
    this.chunks = [];
    this.jsonParts = [];
    this.jsonBytes = 0;
    this.totalConsumed = 0;
    this.error = null;
  }
  feed(input) {
    if (this.error) return;
    let data;
    if (this.stash.length) {
      data = new Uint8Array(this.stash.length + input.length);
      data.set(this.stash); data.set(input, this.stash.length);
      this.stash = new Uint8Array(0);
    } else data = input;
    let p=0;
    try {
      while (p < data.length) {
        if (!this.header) {
          if (data.length-p < 12) { this.stash=data.slice(p); return; }
          const dv=new DataView(data.buffer,data.byteOffset+p,12);
          this.header={magic:dv.getUint32(0,true),version:dv.getUint32(4,true),declaredLength:dv.getUint32(8,true)};
          p+=12; this.totalConsumed+=12; continue;
        }
        if (!this.chunk) {
          if (data.length-p < 8) { this.stash=data.slice(p); return; }
          const dv=new DataView(data.buffer,data.byteOffset+p,8);
          const length=dv.getUint32(0,true), type=dv.getUint32(4,true);
          this.chunk={length,type,remaining:length,index:this.chunks.length};
          this.chunks.push({length,type});
          if (type===JSON_CHUNK && length>MAX_JSON_BYTES) throw new Error(`GLB JSON chunk exceeds ${MAX_JSON_BYTES} bytes.`);
          p+=8; this.totalConsumed+=8;
          if (length===0) this.chunk=null;
          continue;
        }
        const take=Math.min(this.chunk.remaining,data.length-p);
        if (this.chunk.type===JSON_CHUNK && take) {
          this.jsonParts.push(data.slice(p,p+take));
          this.jsonBytes+=take;
        }
        p+=take; this.totalConsumed+=take; this.chunk.remaining-=take;
        if (this.chunk.remaining===0) this.chunk=null;
      }
    } catch (error) { this.error=error; }
  }
  finish(totalBytes) {
    const errors=[];
    if (this.error) errors.push(issue("GLB_STREAM_PARSE_FAILED", this.error.message || String(this.error)));
    if (!this.header) errors.push(issue("GLB_HEADER_MISSING","GLB header is missing or truncated."));
    if (this.stash.length || this.chunk) errors.push(issue("GLB_TRUNCATED","GLB ended before its declared structure was complete."));
    if (this.header) {
      if (this.header.magic!==GLB_MAGIC) errors.push(issue("GLB_BAD_MAGIC","File does not contain the glTF binary magic header."));
      if (this.header.version!==2) errors.push(issue("GLB_UNSUPPORTED_VERSION",`Only GLB version 2 is supported; received ${this.header.version}.`));
      if (this.header.declaredLength!==totalBytes) errors.push(issue("GLB_LENGTH_MISMATCH",`GLB header declares ${this.header.declaredLength} bytes but ${totalBytes} bytes were read.`));
    }
    if (!this.chunks.length || this.chunks[0].type!==JSON_CHUNK) errors.push(issue("GLB_JSON_FIRST_CHUNK","The first GLB chunk must be JSON."));
    if (this.chunks.filter(c=>c.type===JSON_CHUNK).length!==1) errors.push(issue("GLB_JSON_CHUNK_COUNT","GLB must contain exactly one JSON chunk."));
    if (this.chunks.filter(c=>c.type===BIN_CHUNK).length>1) errors.push(issue("GLB_BIN_CHUNK_COUNT","GLB may contain at most one BIN chunk."));
    if (this.chunks.some(c=>c.length%4!==0)) errors.push(issue("GLB_CHUNK_ALIGNMENT","Every GLB chunk length must be 4-byte aligned."));
    let json=null, jsonParsed=false;
    if (!this.jsonBytes) errors.push(issue("GLB_JSON_EMPTY","GLB JSON chunk is empty."));
    else if (!errors.some(x=>x.code==="GLB_STREAM_PARSE_FAILED")) {
      const merged=new Uint8Array(this.jsonBytes); let o=0;
      for (const part of this.jsonParts) { merged.set(part,o); o+=part.length; }
      try { json=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(merged).replace(/\u0000+$/g,"")); jsonParsed=true; }
      catch (error) { errors.push(issue("GLB_JSON_INVALID",`GLB JSON chunk could not be parsed: ${error.message || error}`)); }
    }
    return {header:this.header,chunks:this.chunks,json,jsonParsed,errors};
  }
}

function identityMatrix(){return [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];}
function multiplyMatrix(a,b){
  const out=new Array(16).fill(0);
  for(let c=0;c<4;c++) for(let r=0;r<4;r++) for(let k=0;k<4;k++) out[c*4+r]+=a[k*4+r]*b[c*4+k];
  return out;
}
function nodeLocalMatrix(node){
  if(finiteArray(node&&node.matrix,16)) return node.matrix.slice();
  const t=finiteArray(node&&node.translation,3)?node.translation:[0,0,0];
  const s=finiteArray(node&&node.scale,3)?node.scale:[1,1,1];
  const q=finiteArray(node&&node.rotation,4)?node.rotation:[0,0,0,1];
  const [x,y,z,w]=q; const x2=x+x,y2=y+y,z2=z+z;
  const xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;
  return [
    (1-(yy+zz))*s[0],(xy+wz)*s[0],(xz-wy)*s[0],0,
    (xy-wz)*s[1],(1-(xx+zz))*s[1],(yz+wx)*s[1],0,
    (xz+wy)*s[2],(yz-wx)*s[2],(1-(xx+yy))*s[2],0,
    t[0],t[1],t[2],1
  ];
}
function transformPoint(m,p){return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];}
function includeBounds(target,min,max,matrix){
  for(let ix=0;ix<2;ix++) for(let iy=0;iy<2;iy++) for(let iz=0;iz<2;iz++) {
    const p=transformPoint(matrix,[ix?max[0]:min[0],iy?max[1]:min[1],iz?max[2]:min[2]]);
    for(let a=0;a<3;a++){target.min[a]=Math.min(target.min[a],p[a]);target.max[a]=Math.max(target.max[a],p[a]);}
  }
}
function saneBounds(min,max){
  return finiteArray(min,3)&&finiteArray(max,3)&&min.every((v,i)=>v<=max[i]&&Math.abs(v)<=MAX_REASONABLE_COORDINATE&&Math.abs(max[i])<=MAX_REASONABLE_COORDINATE);
}

function inspectGltf(gltf, chunks, role) {
  const errors=[], warnings=[];
  if(!gltf || typeof gltf!=="object" || Array.isArray(gltf)) return {errors:[issue("GLTF_ROOT_INVALID","GLB JSON root must be an object.")],warnings:[],summary:{}};
  const asset=gltf.asset||{};
  if(safeText(asset.version)!=="2.0") errors.push(issue("GLTF_VERSION_UNSUPPORTED",`glTF asset.version must be 2.0; received ${safeText(asset.version)||"(missing)"}.`));
  const buffers=Array.isArray(gltf.buffers)?gltf.buffers:[];
  const bufferViews=Array.isArray(gltf.bufferViews)?gltf.bufferViews:[];
  const accessors=Array.isArray(gltf.accessors)?gltf.accessors:[];
  const meshes=Array.isArray(gltf.meshes)?gltf.meshes:[];
  const nodes=Array.isArray(gltf.nodes)?gltf.nodes:[];
  const scenes=Array.isArray(gltf.scenes)?gltf.scenes:[];
  const images=Array.isArray(gltf.images)?gltf.images:[];
  const externalUris=[];
  buffers.forEach((b,i)=>{const uri=safeText(b&&b.uri);if(uri&&!uriIsEmbedded(uri)) externalUris.push(`buffers[${i}]: ${uri}`);});
  images.forEach((im,i)=>{const uri=safeText(im&&im.uri);if(uri&&!uriIsEmbedded(uri)) externalUris.push(`images[${i}]: ${uri}`);});
  if(externalUris.length) errors.push(issue("GLTF_EXTERNAL_DEPENDENCIES",`Self-contained GLB cannot reference external files: ${externalUris.slice(0,4).join("; ")}${externalUris.length>4?" …":""}`));
  const binChunk=chunks.find(c=>c.type===BIN_CHUNK)||null;
  if(buffers.length>1) errors.push(issue("GLTF_MULTIPLE_BUFFERS","Self-contained Gallery GLB must use at most one embedded buffer."));
  buffers.forEach((buffer,i)=>{const len=Number(buffer&&buffer.byteLength);if(!Number.isInteger(len)||len<0) errors.push(issue("GLTF_BUFFER_LENGTH",`buffers[${i}] has an invalid byteLength.`));});
  if(buffers[0] && !safeText(buffers[0].uri) && Number(buffers[0].byteLength)>0 && !binChunk) errors.push(issue("GLTF_BIN_MISSING","glTF declares embedded buffer bytes but the GLB BIN chunk is missing."));
  if(buffers[0] && !safeText(buffers[0].uri) && binChunk && Number(buffers[0].byteLength)>binChunk.length) errors.push(issue("GLTF_BUFFER_EXCEEDS_BIN","glTF buffer byteLength exceeds the GLB BIN chunk."));
  bufferViews.forEach((bv,i)=>{
    const bi=Number(bv&&bv.buffer),off=Number(bv&&bv.byteOffset||0),len=Number(bv&&bv.byteLength);
    if(!Number.isInteger(bi)||bi<0||bi>=buffers.length) errors.push(issue("GLTF_BUFFERVIEW_BUFFER_INDEX",`bufferViews[${i}] references an invalid buffer.`));
    else if(!Number.isInteger(off)||off<0||!Number.isInteger(len)||len<0||off+len>Number(buffers[bi].byteLength||0)) errors.push(issue("GLTF_BUFFERVIEW_RANGE",`bufferViews[${i}] is outside its declared buffer range.`));
  });
  accessors.forEach((a,i)=>{
    if(a&&a.bufferView!==undefined){const bvi=Number(a.bufferView);if(!Number.isInteger(bvi)||bvi<0||bvi>=bufferViews.length) errors.push(issue("GLTF_ACCESSOR_BUFFERVIEW_INDEX",`accessors[${i}] references an invalid bufferView.`));}
    if(!COMPONENT_TYPES.has(Number(a&&a.componentType))) errors.push(issue("GLTF_ACCESSOR_COMPONENT_TYPE",`accessors[${i}] has an unsupported componentType.`));
    if(!ACCESSOR_TYPES.has(safeText(a&&a.type))) errors.push(issue("GLTF_ACCESSOR_TYPE",`accessors[${i}] has an invalid type.`));
    if(!Number.isInteger(Number(a&&a.count))||Number(a&&a.count)<0) errors.push(issue("GLTF_ACCESSOR_COUNT",`accessors[${i}] has an invalid count.`));
    checkAccessorStorage(a,i,bufferViews,errors);
  });
  images.forEach((image,i)=>{
    if(image&&image.bufferView!==undefined&&!validIndex(image.bufferView,bufferViews.length)) errors.push(issue("GLTF_IMAGE_BUFFERVIEW_INDEX",`images[${i}] references an invalid bufferView.`));
    if(image&&image.bufferView!==undefined&&!safeText(image.mimeType)) errors.push(issue("GLTF_IMAGE_MIME_TYPE",`images[${i}] stored in a bufferView requires mimeType.`));
  });
  let primitiveCount=0, renderablePrimitiveCount=0, positionAccessorCount=0;
  meshes.forEach((mesh,mi)=>{
    const primitives=Array.isArray(mesh&&mesh.primitives)?mesh.primitives:[];
    if(!primitives.length) warnings.push(issue("GLTF_EMPTY_MESH",`meshes[${mi}] has no primitives.`));
    primitives.forEach((p,pi)=>{
      primitiveCount++;
      const attrs=p&&p.attributes&&typeof p.attributes==="object"?p.attributes:{};
      Object.entries(attrs).forEach(([semantic,ai])=>{if(!validIndex(ai,accessors.length)) errors.push(issue("GLTF_ATTRIBUTE_ACCESSOR",`meshes[${mi}].primitives[${pi}] attribute ${semantic} references an invalid accessor.`));});
      const pos=Number(attrs.POSITION);
      if(Number.isInteger(pos)&&pos>=0&&pos<accessors.length){
        renderablePrimitiveCount++;positionAccessorCount++;
        if(safeText(accessors[pos]&&accessors[pos].type)!=="VEC3") errors.push(issue("GLTF_POSITION_TYPE",`meshes[${mi}].primitives[${pi}] POSITION accessor must be VEC3.`));
      } else errors.push(issue("GLTF_POSITION_MISSING",`meshes[${mi}].primitives[${pi}] has no valid POSITION accessor.`));
      if(p&&p.indices!==undefined&&!validIndex(p.indices,accessors.length)) errors.push(issue("GLTF_INDICES_ACCESSOR",`meshes[${mi}].primitives[${pi}] references an invalid index accessor.`));
      if(p&&p.material!==undefined&&!validIndex(p.material,Array.isArray(gltf.materials)?gltf.materials.length:0)) errors.push(issue("GLTF_MATERIAL_INDEX",`meshes[${mi}].primitives[${pi}] references an invalid material.`));
      if(p&&p.mode!==undefined&&(!Number.isInteger(Number(p.mode))||Number(p.mode)<0||Number(p.mode)>6)) errors.push(issue("GLTF_PRIMITIVE_MODE",`meshes[${mi}].primitives[${pi}] has an invalid primitive mode.`));
      (Array.isArray(p&&p.targets)?p.targets:[]).forEach((target,ti)=>Object.entries(target||{}).forEach(([semantic,ai])=>{if(!validIndex(ai,accessors.length)) errors.push(issue("GLTF_MORPH_ACCESSOR",`meshes[${mi}].primitives[${pi}].targets[${ti}] ${semantic} references an invalid accessor.`));}));
    });
  });
  if(!meshes.length||!primitiveCount||!renderablePrimitiveCount) errors.push(issue("GLTF_GEOMETRY_MISSING",`${role.toUpperCase()} GLB must contain renderable mesh geometry.`));

  const meshNames=meshes.map(m=>safeText(m&&m.name)).filter(Boolean);
  const runtimeMeshNames=[];
  const unnamedRuntimeNodes=[];
  nodes.forEach((node,ni)=>{
    if(node&&node.mesh!==undefined){
      const mi=Number(node.mesh);
      if(!Number.isInteger(mi)||mi<0||mi>=meshes.length){errors.push(issue("GLTF_NODE_MESH_INDEX",`nodes[${ni}] references an invalid mesh.`));return;}
      const name=safeText(node.name)||safeText(meshes[mi]&&meshes[mi].name);
      if(name&&name!=="__root__") runtimeMeshNames.push(name); else unnamedRuntimeNodes.push(ni);
    }
    const children=Array.isArray(node&&node.children)?node.children:[];
    children.forEach(ci=>{const n=Number(ci);if(!Number.isInteger(n)||n<0||n>=nodes.length) errors.push(issue("GLTF_NODE_CHILD_INDEX",`nodes[${ni}] references an invalid child node.`));});
    if(node&&node.translation!==undefined&&!finiteArray(node.translation,3)) errors.push(issue("GLTF_NODE_TRANSLATION",`nodes[${ni}] has a non-finite translation.`));
    if(node&&node.scale!==undefined&&!finiteArray(node.scale,3)) errors.push(issue("GLTF_NODE_SCALE",`nodes[${ni}] has a non-finite scale.`));
    if(node&&node.rotation!==undefined&&!finiteArray(node.rotation,4)) errors.push(issue("GLTF_NODE_ROTATION",`nodes[${ni}] has a non-finite rotation.`));
    if(node&&node.matrix!==undefined&&!finiteArray(node.matrix,16)) errors.push(issue("GLTF_NODE_MATRIX",`nodes[${ni}] has a non-finite matrix.`));
  });
  if(unnamedRuntimeNodes.length) warnings.push(issue("GLTF_RUNTIME_MESH_NAMES_MISSING",`${unnamedRuntimeNodes.length} mesh node(s) have no explicit runtime name.`));
  const duplicateRuntimeNames=[...new Set(runtimeMeshNames.filter((n,i,a)=>a.indexOf(n)!==i))];
  if(duplicateRuntimeNames.length) errors.push(issue("GLTF_DUPLICATE_RUNTIME_MESH_NAME",`Duplicate runtime mesh names inside ${role}: ${duplicateRuntimeNames.slice(0,10).join(", ")}.`));

  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  let boundedPrimitiveCount=0, missingBoundsCount=0, reachableRenderablePrimitiveCount=0;
  const roots=[];
  let sceneIndex=0;
  if(gltf.scene!==undefined){
    sceneIndex=Number(gltf.scene);
    if(!Number.isInteger(sceneIndex)||sceneIndex<0||sceneIndex>=scenes.length) errors.push(issue("GLTF_SCENE_INDEX",`glTF default scene index is invalid.`));
  }
  if(scenes.length&&Number.isInteger(sceneIndex)&&scenes[sceneIndex]&&Array.isArray(scenes[sceneIndex].nodes)) roots.push(...scenes[sceneIndex].nodes.map(Number));
  else if(scenes.length&&Array.isArray(scenes[0].nodes)) roots.push(...scenes[0].nodes.map(Number));
  else {
    const childSet=new Set(nodes.flatMap(n=>Array.isArray(n&&n.children)?n.children.map(Number):[]));
    nodes.forEach((_n,i)=>{if(!childSet.has(i)) roots.push(i);});
    if(!roots.length&&nodes.length) roots.push(...nodes.map((_n,i)=>i));
  }
  const active=new Set();
  function visit(ni,parent){
    if(!Number.isInteger(ni)||ni<0||ni>=nodes.length)return;
    if(active.has(ni)){errors.push(issue("GLTF_NODE_CYCLE",`Node hierarchy contains a cycle at nodes[${ni}].`));return;}
    active.add(ni);
    const node=nodes[ni]||{}, world=multiplyMatrix(parent,nodeLocalMatrix(node));
    if(node.mesh!==undefined&&meshes[Number(node.mesh)]){
      for(const primitive of (meshes[Number(node.mesh)].primitives||[])){
        const ai=primitive&&primitive.attributes?Number(primitive.attributes.POSITION):NaN;
        const accessor=Number.isInteger(ai)?accessors[ai]:null;
        if(accessor) reachableRenderablePrimitiveCount++;
        if(accessor&&saneBounds(accessor.min,accessor.max)){includeBounds(bounds,accessor.min,accessor.max,world);boundedPrimitiveCount++;}
        else if(accessor) missingBoundsCount++;
      }
    }
    for(const child of (Array.isArray(node.children)?node.children:[])) visit(Number(child),world);
    active.delete(ni);
  }
  roots.forEach(r=>visit(Number(r),identityMatrix()));
  if(renderablePrimitiveCount>0&&reachableRenderablePrimitiveCount===0) errors.push(issue("GLTF_SCENE_GEOMETRY_MISSING",`${role.toUpperCase()} has mesh data, but no renderable geometry is reachable from the active scene.`));
  let boundsReport=null;
  if(boundedPrimitiveCount&&bounds.min.every(Number.isFinite)&&bounds.max.every(Number.isFinite)){
    if(!saneBounds(bounds.min,bounds.max)) errors.push(issue("GLTF_BOUNDS_UNREASONABLE",`${role.toUpperCase()} world bounds contain non-finite or extreme coordinates.`));
    const extent=bounds.max.map((v,i)=>v-bounds.min[i]);
    const diagonal=Math.hypot(...extent);
    if(!Number.isFinite(diagonal)||diagonal<=1e-7) errors.push(issue("GLTF_BOUNDS_DEGENERATE",`${role.toUpperCase()} geometry collapses to an effectively zero-size world bound.`));
    boundsReport={min:bounds.min.map(v=>Number(v.toFixed(6))),max:bounds.max.map(v=>Number(v.toFixed(6))),extent:extent.map(v=>Number(v.toFixed(6))),diagonal:Number(diagonal.toFixed(6)),complete:missingBoundsCount===0,boundedPrimitiveCount,missingPrimitiveBounds:missingBoundsCount};
  } else warnings.push(issue("GLTF_BOUNDS_UNAVAILABLE",`No POSITION accessor min/max data was available to derive ${role} world bounds.`));
  if(missingBoundsCount) warnings.push(issue("GLTF_BOUNDS_PARTIAL",`${missingBoundsCount} primitive(s) lack POSITION min/max; spatial checks are partial.`));

  return {errors,warnings,summary:{
    generator:safeText(asset.generator)||null,
    sceneCount:scenes.length,nodeCount:nodes.length,meshCount:meshes.length,primitiveCount,renderablePrimitiveCount,reachableRenderablePrimitiveCount,
    materialCount:Array.isArray(gltf.materials)?gltf.materials.length:0,
    textureCount:Array.isArray(gltf.textures)?gltf.textures.length:0,
    imageCount:images.length,
    externalUris,
    meshNames,
    runtimeMeshNames:[...new Set(runtimeMeshNames)],
    duplicateRuntimeNames,
    bounds:boundsReport
  }};
}

async function streamSource(source, onProgress) {
  let stream, size=null, mimeType="", sourceName="";
  if(source&&source.kind==="blob"&&source.blob){
    stream=source.blob.stream(); size=Number(source.blob.size)||0; mimeType=source.blob.type||""; sourceName=source.name||source.blob.name||"";
  } else if(source&&source.kind==="url"&&source.url){
    const response=await fetch(source.url,{cache:"no-store",credentials:"omit"});
    if(!response.ok) throw new Error(`Model download failed with HTTP ${response.status}.`);
    if(!response.body) throw new Error("Streaming response body is unavailable.");
    stream=response.body; const header=Number(response.headers.get("content-length")); if(Number.isFinite(header)&&header>=0)size=header;
    mimeType=response.headers.get("content-type")||""; sourceName=source.name||source.url.split("?")[0].split("/").pop()||"";
  } else throw new Error("Validator source is missing.");
  const reader=stream.getReader(), sha=new Sha256(), parser=new GlbStreamParser();
  let total=0, lastProgress=0;
  while(true){
    const {done,value}=await reader.read(); if(done)break;
    const bytes=value instanceof Uint8Array?value:new Uint8Array(value);
    total+=bytes.byteLength; sha.update(bytes); parser.feed(bytes);
    const now=Date.now(); if(now-lastProgress>120){lastProgress=now;onProgress(total,size);}
  }
  onProgress(total,size);
  return {total,size,mimeType,sourceName,hash:`sha256:${sha.digestHex()}`,parsed:parser.finish(total)};
}

async function validate(message) {
  const role=safeText(message.role).toLowerCase();
  const errors=[], warnings=[];
  if(!["floor","walls","ceiling","props"].includes(role)) errors.push(issue("ROLE_INVALID",`Unsupported Gallery asset role: ${role||"(missing)"}.`));
  const streamed=await streamSource(message.source,(loaded,total)=>postMessage({type:"progress",id:message.id,loaded,total}));
  errors.push(...streamed.parsed.errors);
  let summary={};
  if(streamed.parsed.jsonParsed){const inspected=inspectGltf(streamed.parsed.json,streamed.parsed.chunks,role);errors.push(...inspected.errors);warnings.push(...inspected.warnings);summary=inspected.summary;}
  if(message.expectedSize!==undefined&&message.expectedSize!==null&&Number(message.expectedSize)!==streamed.total) errors.push(issue("SOURCE_SIZE_MISMATCH",`Expected ${Number(message.expectedSize)} bytes but read ${streamed.total}.`));
  if(streamed.total===0) errors.push(issue("FILE_EMPTY","GLB file is empty."));
  const report={
    schema:VALIDATION_SCHEMA,validatorVersion:VALIDATOR_VERSION,role,valid:errors.length===0,
    fileHash:streamed.hash,fileSize:streamed.total,mimeType:streamed.mimeType||message.mimeType||"model/gltf-binary",
    sourceName:streamed.sourceName||message.sourceName||"",sourceStoragePath:safeText(message.sourceStoragePath)||null,
    checkedAt:new Date().toISOString(),
    glb:{version:streamed.parsed.header?streamed.parsed.header.version:null,declaredLength:streamed.parsed.header?streamed.parsed.header.declaredLength:null,chunks:streamed.parsed.chunks.map(c=>({type:c.type===JSON_CHUNK?"JSON":c.type===BIN_CHUNK?"BIN":`0x${c.type.toString(16)}`,length:c.length})),...summary},
    errors,warnings
  };
  return report;
}

self.onmessage=async(event)=>{
  const message=event.data||{};
  if(message.type!=="validate")return;
  try{const report=await validate(message);postMessage({type:"result",id:message.id,report});}
  catch(error){postMessage({type:"failure",id:message.id,error:error&&error.message?error.message:String(error)});}
};
