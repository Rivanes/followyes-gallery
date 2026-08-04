import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/gallery-engine.js', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../src/workers/gallery-avif-encoder-worker.js', import.meta.url), 'utf8');
function assert(condition, message) { if (!condition) throw new Error(message); }
function extractFunction(text, name) {
  const candidates = [`async function ${name}(`, `function ${name}(`];
  let start = candidates.map((m) => text.indexOf(m)).find((v) => v >= 0) ?? -1;
  assert(start >= 0, `Missing function ${name}`);
  const brace = text.indexOf('{', start);
  let depth = 0, state = 'code', quote = '';
  for (let i = brace; i < text.length; i += 1) {
    const c = text[i], n = text[i + 1] || '';
    if (state === 'code') {
      if (c === '"' || c === "'" || c === '`') { state = 'string'; quote = c; }
      else if (c === '/' && n === '/') { state = 'line'; i += 1; }
      else if (c === '/' && n === '*') { state = 'block'; i += 1; }
      else if (c === '{') depth += 1;
      else if (c === '}' && --depth === 0) return text.slice(start, i + 1);
    } else if (state === 'string') {
      if (c === '\\') i += 1; else if (c === quote) state = 'code';
    } else if (state === 'line' && c === '\n') state = 'code';
    else if (state === 'block' && c === '*' && n === '/') { state = 'code'; i += 1; }
  }
  throw new Error(`Unterminated function ${name}`);
}

assert(source.includes('galleryArtworkImageVariantFormat = "image/avif"'), 'AVIF MIME missing');
assert(source.includes('galleryArtworkImageVariantExtension = "avif"'), 'AVIF extension missing');
assert(source.includes('galleryArtworkImageVariantFolder = "AVIFv1"'), 'Versioned AVIF folder missing');
assert(source.includes('https://esm.sh/@jsquash/avif@2.1.1?bundle'), 'Pinned jSquash module missing');
assert(worker.includes('import(moduleUrl)') && worker.includes('new ImageData'), 'Worker does not lazy-load and encode ImageData');
assert(worker.includes('self.postMessage') && worker.includes('[buffer]'), 'Worker does not transfer encoded buffer');
const variantBlob = extractFunction(source, 'createArtworkImageVariantBlob');
assert(variantBlob.includes('getImageData') && variantBlob.includes('encodeGalleryImageDataToAvif'), 'Canvas resize to AVIF worker missing');
assert(!variantBlob.includes('toBlob'), 'Legacy canvas WebP encoding remains');
const upload = extractFunction(source, 'uploadArtworkVariantBlob');
assert(upload.includes('upsert: false') && upload.includes('contentType: variantBlobData.mimeType'), 'Immutable AVIF upload missing');
assert(upload.includes('verifyUploadedGalleryAvifVariant'), 'Uploaded AVIF is not verified');
const createSet = extractFunction(source, 'createAndUploadArtworkImageVariants');
assert(createSet.includes('uploadedPaths') && createSet.includes('atomic-avif-set-failed'), 'Atomic AVIF set cleanup missing');
assert(createSet.includes('imageVariantSetId') && createSet.includes('imageVariantSettings'), 'AVIF metadata missing');
const complete = extractFunction(source, 'isGalleryAvifVariantComplete');
assert(complete.includes('image/avif') && complete.includes('.avif'), 'Strict AVIF completeness check missing');
const textureApply = extractFunction(source, 'applyArtworkImageState');
assert(textureApply.includes('_galleryAvifFallbackAttempted') && textureApply.includes('_galleryDisableAvif'), 'AVIF original fallback missing');
assert(extractFunction(source, 'getArtworkTextureNoMipmap').includes('return false'), 'Mipmap quality regression');
assert(extractFunction(source, 'getArtworkTextureAnisotropyLevel').includes('? 8 : 16'), 'Anisotropy policy missing');
console.log('Avif Pipeline tests passed.');
