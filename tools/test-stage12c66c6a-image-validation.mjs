import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');

function extractFunction(text, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const marker of markers) {
    start = text.indexOf(marker);
    if (start >= 0) break;
  }
  assert.ok(start >= 0, `Missing function ${name}`);
  const brace = text.indexOf('{', start);
  let depth = 0;
  let state = 'code';
  let quote = null;
  for (let i = brace; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1] || '';
    if (state === 'code') {
      if (char === '"' || char === "'" || char === '`') { state = 'string'; quote = char; }
      else if (char === '/' && next === '/') { state = 'line'; i += 1; }
      else if (char === '/' && next === '*') { state = 'block'; i += 1; }
      else if (char === '{') depth += 1;
      else if (char === '}') { depth -= 1; if (depth === 0) return text.slice(start, i + 1); }
    } else if (state === 'string') {
      if (char === '\\') i += 1;
      else if (char === quote) { state = 'code'; quote = null; }
    } else if (state === 'line') {
      if (char === '\n') state = 'code';
    } else if (state === 'block') {
      if (char === '*' && next === '/') { state = 'code'; i += 1; }
    }
  }
  throw new Error(`Unterminated function ${name}`);
}

const context = {
  console,
  Uint8Array,
  DataView,
  ArrayBuffer,
  Math,
  Number,
  String,
  galleryImageUploadLimits: {
    artwork: { maxBytes: 24 * 1024 * 1024, maxSide: 10000, maxPixels: 40000000, label: 'obraz pracy' },
    author: { maxBytes: 12 * 1024 * 1024, maxSide: 8000, maxPixels: 24000000, label: 'zdjecie autora' }
  },
  async loadImageElementFromBlob() { throw new Error('fallback should not run in header tests'); }
};
vm.createContext(context);
vm.runInContext([
  'readGalleryUint24LittleEndian',
  'parseGalleryImageDimensionsFromHeader',
  'readGalleryImageDimensions',
  'validateGalleryImageUploadFile'
].map((name) => extractFunction(source, name)).join('\n\n'), context);

function fakeFile(bytes, type = 'image/png', sizeOverride = null) {
  const data = Uint8Array.from(bytes);
  return {
    type,
    size: sizeOverride ?? data.length,
    slice(start, end) {
      const part = data.slice(start, end);
      return { async arrayBuffer() { return part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength); } };
    }
  };
}

// PNG 640 x 480.
{
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4E, 0x47], 0);
  new DataView(bytes.buffer).setUint32(16, 640, false);
  new DataView(bytes.buffer).setUint32(20, 480, false);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.parseGalleryImageDimensionsFromHeader(bytes.buffer))),
    { width: 640, height: 480, format: 'png' }
  );
  const result = await context.validateGalleryImageUploadFile(fakeFile(bytes), 'artwork');
  assert.equal(result.ok, true);
  assert.equal(result.pixels, 307200);
}

// JPEG SOF0 1920 x 1080.
{
  const bytes = [
    0xFF, 0xD8,
    0xFF, 0xE0, 0x00, 0x04, 0x00, 0x00,
    0xFF, 0xC0, 0x00, 0x11, 0x08,
    0x04, 0x38,
    0x07, 0x80,
    0x03, 0x01, 0x11, 0x00
  ];
  const result = context.parseGalleryImageDimensionsFromHeader(Uint8Array.from(bytes).buffer);
  assert.equal(result.width, 1920);
  assert.equal(result.height, 1080);
  assert.equal(result.format, 'jpeg');
}

// WebP VP8X 300 x 200.
{
  const bytes = new Uint8Array(30);
  bytes.set([...Buffer.from('RIFF')], 0);
  bytes.set([...Buffer.from('WEBP')], 8);
  bytes.set([...Buffer.from('VP8X')], 12);
  const widthMinusOne = 299;
  const heightMinusOne = 199;
  bytes[24] = widthMinusOne & 255;
  bytes[25] = (widthMinusOne >> 8) & 255;
  bytes[26] = (widthMinusOne >> 16) & 255;
  bytes[27] = heightMinusOne & 255;
  bytes[28] = (heightMinusOne >> 8) & 255;
  bytes[29] = (heightMinusOne >> 16) & 255;
  const result = context.parseGalleryImageDimensionsFromHeader(bytes.buffer);
  assert.equal(result.width, 300);
  assert.equal(result.height, 200);
}

// Size and pixel limits reject before variant generation/upload.
{
  const oversized = fakeFile([0x89, 0x50, 0x4E, 0x47], 'image/png', 25 * 1024 * 1024);
  const sizeResult = await context.validateGalleryImageUploadFile(oversized, 'artwork');
  assert.equal(sizeResult.ok, false);
  assert.match(sizeResult.message, /24 MB/);

  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4E, 0x47], 0);
  new DataView(bytes.buffer).setUint32(16, 9000, false);
  new DataView(bytes.buffer).setUint32(20, 4000, false);
  const authorResult = await context.validateGalleryImageUploadFile(fakeFile(bytes), 'author');
  assert.equal(authorResult.ok, false);
}

console.log('Stage 12C66C6A image validation tests passed.');
