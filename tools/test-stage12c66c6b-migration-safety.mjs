import fs from 'node:fs';
const source = fs.readFileSync(new URL('../src/Gallery_V0_11.js', import.meta.url), 'utf8');
function assert(condition, message) { if (!condition) throw new Error(message); }
function extractFunction(text, name) {
  const candidates = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const marker of candidates) { start = text.indexOf(marker); if (start >= 0) break; }
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
    } else if (state === 'string') { if (c === '\\') i += 1; else if (c === quote) state = 'code'; }
    else if (state === 'line' && c === '\n') state = 'code';
    else if (state === 'block' && c === '*' && n === '/') { state = 'code'; i += 1; }
  }
  throw new Error(`Unterminated function ${name}`);
}
const cleanup = extractFunction(source, 'queueReplacedGalleryArtworkStateForCleanup');
assert(cleanup.includes('previousOriginal !== nextOriginal'), 'Original is not isolated from variant cleanup');
assert(cleanup.includes('Original source files'), 'Original preservation contract missing');
assert(cleanup.includes('queueReplacedGalleryArtworkVariantsForCleanup'), 'Variant-only replacement cleanup missing');
const refs = extractFunction(source, 'getGalleryActiveGeneratedWebpReferences');
assert(refs.includes('serializeGalleryState()'), 'Denormalized state WebP references are not audited');
assert(refs.includes('Web|Mobile|Preview'), 'Only generated variant fields should be audited');
const prefixes = extractFunction(source, 'getGalleryLegacyGeneratedWebpPrefixes');
assert(prefixes.includes('["artworks", "authors"]') && prefixes.includes('["Desktop", "Mobile", "Preview"]'), 'Legacy generated folders are incomplete');
const remove = extractFunction(source, 'removeGalleryLegacyGeneratedWebpFiles');
assert(remove.includes('isGalleryLegacyGeneratedWebpPath') && remove.includes('.remove(batch)'), 'Removal is not restricted to generated WebP folders');
assert(remove.includes('pendingStorageDeletes = gallerySaveIntegrityRuntime.pendingStorageDeletes.filter'), 'Removed paths remain queued');
const validate = extractFunction(source, 'validateGalleryAvifMigration');
assert(validate.includes('readyForFinalization') && validate.includes('originalWebpSourcesPreserved'), 'Migration readiness/original reporting missing');
const finalize = extractFunction(source, 'finalizeGalleryAvifMigrationAndRemoveWebp');
assert((finalize.match(/saveGalleryStateToSupabase\(\)/g) || []).length === 2, 'Backup-safe double save missing');
assert(finalize.indexOf('saveGalleryStateToSupabase()') < finalize.indexOf('removeGalleryLegacyGeneratedWebpFiles'), 'WebP deletion occurs before publication/backup rotation');
assert(finalize.includes('remainingGeneratedWebp') && finalize.includes('Original source files are preserved'), 'Final zero check or preservation notice missing');
assert(source.includes('TEST SELECTED ARTWORK AVIF') && source.includes('AUDIT GENERATED WEBP'), 'Test/audit UI missing');
assert(source.includes('VALIDATE AVIF MIGRATION') && source.includes('FINALIZE + REMOVE WEBP'), 'Migration UI missing');
console.log('Stage 12C66C6B migration safety tests passed.');
