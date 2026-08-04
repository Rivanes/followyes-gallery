import assert from 'node:assert/strict';
import { ExhibitionAdminRepository } from '../src/platform/data/exhibition-admin-repository.js';
import { AdminRepository } from '../src/platform/data/admin-repository.js';

const calls = [];
const client = {
  rpc(name, args) { calls.push(['rpc', name, args]); return Promise.resolve({ data: { ok: true, id: args?.p_exhibition_id || 'x' }, error: null }); },
  functions: { invoke(name, options) { calls.push(['fn', name, options]); return Promise.resolve({ data: { ok: true }, error: null }); } }
};
const exhibitions = new ExhibitionAdminRepository(client);
await exhibitions.saveCard('e1', { title: 'x' }, 2, 3);
await exhibitions.setAuthors('e1', [{ authorId: 'a1' }]);
await exhibitions.publish('e1', { draftRevision: 1, cardRevision: 2, stateLockVersion: 3, cardLockVersion: 4 });
const admin = new AdminRepository(client);
await admin.runJob('j1');
assert.equal(calls.some((item) => item[1] === 'admin_save_exhibition_card'), true);
assert.equal(calls.some((item) => item[1] === 'admin_set_exhibition_authors'), true);
assert.equal(calls.some((item) => item[1] === 'admin_publish_exhibition_bundle'), true);
assert.equal(calls.some((item) => item[0] === 'fn' && item[1] === 'cms-jobs'), true);
console.log('Data Repositories tests passed.');
