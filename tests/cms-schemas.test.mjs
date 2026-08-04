import assert from 'node:assert/strict';
import { slugify, createDefaultHomepage, validateHomepage, validateExhibitionCard, normalizeExhibitionCard } from '../src/platform/schemas/cms-schemas.js';

assert.equal(slugify('Galeria Łódź 2026!'), 'galeria-lodz-2026');
const homepage = createDefaultHomepage();
assert.equal(validateHomepage(homepage).valid, true);
const duplicate = structuredClone(homepage);
duplicate.sections[1].id = duplicate.sections[0].id;
assert.equal(validateHomepage(duplicate).valid, false);
const card = normalizeExhibitionCard({ title: 'Future Forms', buttonLabel: 'Enter' }, {});
assert.equal(validateExhibitionCard(card, { requireCover: false }).valid, true);
assert.equal(validateExhibitionCard(card).valid, false);
console.log('Cms Schemas tests passed.');
