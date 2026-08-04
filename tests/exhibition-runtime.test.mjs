import assert from 'node:assert/strict';
import {
  readExhibitionRoute,
  createExhibitionStateEnvelope,
  unwrapExhibitionState,
  ExhibitionStateRepository,
  MediaRepository,
  listPublishedExhibitions,
  resolveExhibitionRuntime,
  buildExhibitionUrl,
  createControlledRestartController
} from '../src/runtime/exhibition-runtime.js';

const manifest = {
  schema: 'berryboy-venue-manifest.v1',
  venueId: 'venue-alpha',
  versionId: 'v3',
  assets: [{ assetId: 'building', role: 'building', path: './building.glb', critical: true }],
  spawnPoints: [{ id: 'safe', safe: true, position: { x: 0, y: 1.6, z: 0 }, target: { x: 0, y: 1.6, z: 1 } }]
};

const route = readExhibitionRoute({
  search: '?exhibition=future-forms&channel=draft',
  pathname: '/gallery/'
}, {});
assert.equal(route.exhibitionSlug, 'future-forms');
assert.equal(route.requestedChannel, 'draft');

const pathRoute = readExhibitionRoute({ search: '', pathname: '/exhibitions/digital-matter' }, {});
assert.equal(pathRoute.exhibitionSlug, 'digital-matter');

const envelope = createExhibitionStateEnvelope({
  exhibitionId: '11111111-1111-4111-8111-111111111111',
  venueId: 'venue-alpha',
  venueVersionId: 'v3',
  channel: 'draft',
  revision: 4,
  content: { artworks: [{ id: 'a' }] }
});
assert.equal(envelope.revision, 4);
assert.deepEqual(unwrapExhibitionState(envelope).content, { artworks: [{ id: 'a' }] });

assert.throws(() => unwrapExhibitionState(envelope, {
  exhibition: { exhibitionId: '99999999-9999-4999-8999-999999999999', channel: 'draft' },
  venue: { venueId: 'venue-alpha', versionId: 'v3' }
}), /does not belong/, 'cross-exhibition state envelope must be rejected');


const catalogRows = [{
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'future-forms',
  title: 'Future Forms',
  status: 'published',
  display_order: 1,
  database_venue_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  venue_slug: 'venue-alpha',
  venue_name: 'Venue Alpha'
}, {
  id: '22222222-2222-4222-8222-222222222222',
  slug: 'digital-matter',
  title: 'Digital Matter',
  status: 'published',
  display_order: 2,
  database_venue_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  venue_slug: 'venue-alpha',
  venue_name: 'Venue Alpha'
}, {
  id: '44444444-4444-4444-8444-444444444444',
  slug: 'sculpture-selection',
  title: 'Sculpture Selection',
  status: 'scheduled',
  display_order: 3,
  database_venue_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  venue_slug: 'venue-beta',
  venue_name: 'Venue Beta'
}];

const publishedRuntime = {
  ...catalogRows[0],
  database_venue_version_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  venue_version_number: 'v3',
  manifest,
  manifest_url: 'https://example.test/venue-alpha/v3/manifest.json',
  published_state: createExhibitionStateEnvelope({
    exhibitionId: catalogRows[0].id,
    venueId: 'venue-alpha',
    venueVersionId: 'v3',
    channel: 'published',
    revision: 7,
    content: { title: 'published-only', artworks: [] }
  }),
  published_revision: 7,
  lock_version: 12
};

const rpcCalls = [];
const publicSupabase = {
  async rpc(name, args) {
    rpcCalls.push({ name, args });
    if (name === 'list_published_exhibitions') return { data: catalogRows, error: null };
    if (name === 'resolve_published_exhibition') return { data: [publishedRuntime], error: null };
    if (name === 'filter_deletable_media_paths') { assert.equal(args.p_exhibition_id, catalogRows[0].id); return { data: [{ path: args.p_paths[0] }], error: null }; }
    if (name === 'confirm_deleted_media_paths') { assert.equal(args.p_exhibition_id, catalogRows[0].id); return { data: 1, error: null }; }
    throw new Error(`Unexpected RPC ${name}`);
  }
};

const catalog = await listPublishedExhibitions({ supabase: publicSupabase, defaultManifestUrl: './fallback.json' });
assert.equal(catalog.source, 'supabase-public-rpc');
assert.equal(catalog.exhibitions.length, 3);
assert.equal(catalog.exhibitions.filter((item) => item.venueId === 'venue-alpha').length, 2);
assert.equal(catalog.exhibitions.filter((item) => item.venueId === 'venue-beta').length, 1);
assert.equal(catalog.exhibitions[0].venueId, 'venue-alpha');

const resolvedPublic = await resolveExhibitionRuntime({
  supabase: publicSupabase,
  route,
  session: null,
  defaultManifestUrl: './fallback.json'
});
assert.equal(resolvedPublic.channel, 'published', 'anonymous route must never open draft');
assert.equal(resolvedPublic.exhibition.venueId, 'venue-alpha');
assert.equal(resolvedPublic.exhibition.venueVersionId, 'v3');
assert.equal(resolvedPublic.exhibition.databaseVenueVersionId, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
assert.equal(resolvedPublic.publicSnapshot.revision, 7);

const publicRepository = new ExhibitionStateRepository({
  supabase: publicSupabase,
  exhibition: resolvedPublic.exhibition,
  publicSnapshot: resolvedPublic.publicSnapshot,
  channel: 'published',
  allowLegacyRead: false
});
const publicState = await publicRepository.load('published');
assert.equal(publicState.state.title, 'published-only');
assert.equal(publicState.source, 'd2-public-rpc');

const mediaA = new MediaRepository({ supabase: publicSupabase, bucket: 'platform-media', exhibitionId: catalogRows[0].id });
const mediaB = new MediaRepository({ supabase: publicSupabase, bucket: 'platform-media', exhibitionId: '22222222-2222-4222-8222-222222222222' });
const sharedMediaId = '33333333-3333-4333-8333-333333333333';
const pathA = mediaA.createPath({ entityType: 'artworks', entityId: 'art-1', mediaId: sharedMediaId, variant: 'original', fileName: 'image.jpg' });
const pathB = mediaB.createPath({ entityType: 'artworks', entityId: 'art-1', mediaId: sharedMediaId, variant: 'original', fileName: 'image.jpg' });
assert.match(pathA, /^exhibitions\/11111111-/);
assert.match(pathB, /^exhibitions\/22222222-/);
assert.notEqual(pathA, pathB, 'two exhibitions must never share default upload path');
const deletionFilter = await mediaA.filterDeletablePaths('platform-media', [pathA, pathB]);
assert.deepEqual(deletionFilter.deletable, [pathA]);
assert.deepEqual(deletionFilter.protected, [pathB]);

let stateRow = {
  draft_revision: 2,
  lock_version: 5,
  draft_updated_at: '2026-08-03T18:00:00Z'
};
const editorSupabase = {
  async rpc(name, args) {
    if (name === 'save_exhibition_draft') {
      assert.equal(args.p_expected_draft_revision, 1);
      assert.equal(args.p_venue_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      assert.equal(args.p_venue_version_id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
      return { data: [stateRow], error: null };
    }
    if (name === 'publish_exhibition_state') {
      assert.equal(args.p_expected_draft_revision, 2);
      return { data: [{ draft_revision: 2, published_revision: 2, previous_revision: 1, lock_version: 6, published_at: '2026-08-03T18:01:00Z' }], error: null };
    }
    throw new Error(`Unexpected editor RPC ${name}`);
  }
};
const editorExhibition = {
  ...resolvedPublic.exhibition,
  authenticated: true
};
const editorRepository = new ExhibitionStateRepository({ supabase: editorSupabase, exhibition: editorExhibition, channel: 'draft', allowLegacyRead: false });
const saved = await editorRepository.saveDraft({ changed: true }, {
  expectedRevision: 1,
  expectedLockVersion: 4,
  venueId: 'venue-alpha',
  venueVersionId: 'v3',
  databaseVenueId: editorExhibition.databaseVenueId,
  databaseVenueVersionId: editorExhibition.databaseVenueVersionId
});
assert.equal(saved.revision, 2);
const published = await editorRepository.publish({ expectedDraftRevision: 2, expectedLockVersion: 5 });
assert.equal(published.publishedRevision, 2);
assert.equal(published.previousRevision, 1);

const url = buildExhibitionUrl({ slug: 'future-forms' }, { location: { href: 'https://gallery.test/gallery/?foo=1' }, channel: 'draft' });
assert.equal(new URL(url).searchParams.get('exhibition'), 'future-forms');
assert.equal(new URL(url).searchParams.get('channel'), 'draft');
assert.ok(rpcCalls.some((call) => call.name === 'resolve_published_exhibition'));



// Switching exhibitions performs a full controlled scene/engine teardown and reload.
{
  const actions = [];
  const originalWindow = globalThis.window;
  globalThis.window = {
    GalleryApp: { confirmDiscardUnsavedChanges() { actions.push('confirm'); return true; } },
    location: {
      href: 'https://gallery.test/gallery/?exhibition=future-forms',
      assign(urlValue) { actions.push(`assign:${new URL(urlValue).searchParams.get('exhibition')}`); }
    }
  };
  try {
    const controller = createControlledRestartController({
      scene: { dispose() { actions.push('scene-dispose'); } },
      engine: { stopRenderLoop() { actions.push('stop-loop'); }, dispose() { actions.push('engine-dispose'); } }
    });
    assert.equal(controller.switchExhibition({ slug: 'digital-matter' }), true);
    assert.deepEqual(actions, ['confirm', 'stop-loop', 'scene-dispose', 'engine-dispose', 'assign:digital-matter']);
  } finally {
    globalThis.window = originalWindow;
  }
}

console.log('Exhibition Runtime tests passed.');
