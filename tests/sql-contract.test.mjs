import fs from 'node:fs';
import assert from 'node:assert/strict';
const sql = fs.readFileSync(new URL('../supabase/migrations/20260803_full_site_admin_cms.sql', import.meta.url), 'utf8');
for (const term of ['exhibition_cards','site_content','admin_audit_log','cms_jobs','admin_publish_exhibition_bundle','admin_publish_site_content','admin_set_user_access','admin_set_exhibition_authors']) assert.ok(sql.includes(term), term);
assert.ok(sql.includes("job_type in ('duplicate_media','permanent_delete')"));
assert.equal(sql.includes('admin_create_invite_request'), false);
assert.equal((sql.match(/\$\$/g) || []).length % 2, 0);
assert.ok(sql.trimEnd().endsWith('commit;'));
console.log('Sql Contract tests passed.');
