import assert from 'node:assert/strict';
import { createPermissionService } from '../src/platform/permissions.js';

const platform = createPermissionService({ platformRole: 'platform_admin' });
assert.equal(platform.has('users.manage'), true);
assert.equal(platform.canVenue('venue.edit', 'v-any'), true);
assert.equal(platform.canExhibition('exhibition.publish', { id: 'e-any', venueId: 'v-any' }), true);

const venueAdmin = createPermissionService({ platformRole: 'venue_admin', venueAdminIds: ['v1'] });
assert.equal(venueAdmin.canVenue('venue.edit', 'v1'), true);
assert.equal(venueAdmin.canVenue('venue.edit', 'v2'), false);
assert.equal(venueAdmin.canExhibition('exhibition.publish', { id: 'e2', venueId: 'v1' }), true);
assert.equal(venueAdmin.canExhibition('exhibition.publish', { id: 'e2', venueId: 'v2' }), false);

const curator = createPermissionService({ platformRole: 'curator', exhibitionCuratorIds: ['e1'] });
assert.equal(curator.canExhibition('exhibition.edit', { id: 'e1', venueId: 'v1' }), true);
assert.equal(curator.canExhibition('exhibition.publish', { id: 'e1', venueId: 'v1' }), false);
assert.equal(curator.canVenue('venue.edit', 'v1'), false);

const inactive = createPermissionService({ platformRole: 'platform_admin', active: false });
assert.equal(inactive.has('platform.manage'), false);
console.log('Permission Matrix tests passed.');
