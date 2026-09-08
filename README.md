# Exhibition Platform

Current repository release: **C6C8C24 — Exhibition ↔ Gallery Assignment + Public Discovery**.

This repository contains the deployable Babylon.js 3D Exhibition Platform plus repository-local build and regression tooling. Database migration/deployment SQL is intentionally kept outside `REPO` in the documented release package.

## Product model

- **Venue / Gallery** is the reusable physical 3D environment.
- **Venue Version** is an immutable published/history version of that environment and its runtime manifest/assets.
- **Space** is the runtime representation of the resolved Venue Version passed into Babylon.
- **Exhibition** is the content/publication layer shown inside a Gallery.
- An Exhibition has independent Draft, Published and Previous state/card/ exact Venue Version channels.
- `exhibitions.venue_id` / `exhibition_states.venue_id` describe the current **Draft authoring Gallery**.
- Public Gallery identity is derived from `published_venue_version_id -> venue_versions.venue_id`, not from the current Draft authoring Gallery.
- Publishing a new Gallery Version does not automatically migrate Exhibitions.
- Different Galleries remain a full page/bootstrap boundary in C24; same-session Babylon Scene disposal/recreate is reserved for C25.

Specific Gallery names are data. They are not platform/runtime branding.

## Main entries

- `index.html` — Public Viewer + C24 pre-runtime Exhibition discovery.
- `admin.html` — direct/fallback Admin Workspace.
- `gallery-test.html` — authenticated isolated preview of one Gallery Version.
- `src/Gallery_V0_11.js` — main Babylon.js runtime source.
- `src/Gallery_V0_11.min.js` — generated production runtime.
- `src/data/exhibition-api.js` — canonical Venue/Exhibition data adapter.
- `src/data/exhibition-gallery-assignment.js` — pure C24 binding/migration helpers and executable reference rebind for QA.
- `src/data/gallery-management-api.js` — controlled Gallery lifecycle/Storage adapter.
- `src/runtime/space-definition-resolver.js` — resolves a canonical Venue Version into the small Space contract consumed by the engine.
- `src/validation/gallery-model-validation.js` — C23 browser coordinator for technical Gallery model validation.
- `src/workers/gallery-glb-validator-worker.js` — streaming GLB/glTF validator + incremental SHA-256 worker.
- `src/config/space-fixture.js` — local/login-disabled test fixture only.
- `src/bootstrap/gallery-test-bootstrap.js` — Test Gallery resolver/startup and Entry Point capture.
- `src/bootstrap/` — Viewer/Admin/editor/cache/transition bootstraps.
- `asset-cache-sw.js` — persistent asset cache / delivery layer.
- `tools/` — repository build, verifier and consolidated regression suites.

## Canonical runtime path

Public Viewer resolves:

```text
Published Exhibition
  -> published_venue_version_id
  -> exact Venue / Gallery + Venue Version
  -> Venue Manifest / Venue Assets
  -> Space Definition
  -> Gallery_V0_11 createScene()
```

Admin authoring resolves the Exhibition's explicit Draft Venue Version. The engine receives `runtimeOptions.spaceDefinition`; it does not need Supabase table names, assignment SQL or model-validation SQL.

Canonical database model:

```text
venues
  -> venue_versions
     -> venue_assets

exhibitions
  -> exhibition_states
  -> exhibition_cards
```

No parallel Exhibition/Gallery assignment table is introduced. Legacy `gallery_exhibitions` / `gallery_state` are not normal runtime dependencies.

## Gallery Management baseline

C6C8C22 / C6C8C22.1 Gallery Management is PASS/CLOSED. Admin Workspace separates:

```text
EXHIBITIONS | GALLERIES
```

Gallery lifecycle remains:

```text
Create Gallery
-> initial Draft Version
-> building assets
-> Entry Point
-> Validate
-> Test Gallery
-> Publish immutable Version
-> Create/Open Next Draft
-> safe Rollback / Archive / Restore
```

A Gallery may have at most one active Draft Version. Next Draft creation is copy-on-write from current Published Version. Published/frozen Venue Versions are not edited in place.

## C6C8C23 Space Model Validation baseline

C23 is PASS/CLOSED and remains fully active in C24.

Required Gallery roles:

- `floor`
- `walls`
- `ceiling`

Optional:

- `props`

Missing Props cannot block Gallery validation, publication or Viewer startup. Assigned Props must pass the same technical validation as required models.

C23 validates GLB v2 structure, self-contained dependencies, buffers/bufferViews/accessors, scene/node/mesh/material/attribute references, reachable geometry, finite transforms/bounds, runtime mesh-name collisions and streamed SHA-256. Aggregate Draft validation blocks stale/failed immutable asset reports and cross-role runtime mesh-name collisions. It deliberately does not score art quality, polygon budgets, LOD or material aesthetics.

## C6C8C24 Exhibition ↔ Gallery Assignment

### Channel model

C24 allows the three exact Exhibition Venue Version channels to belong to different Galleries:

```text
Draft      -> authoring Gallery Version
Published  -> current public Gallery Version
Previous   -> rollback-history Gallery Version
```

The Draft authoring Gallery remains mirrored on `exhibitions.venue_id` and `exhibition_states.venue_id`. Published/Previous are exact Version references and are not forced to match that Draft Gallery.

### Draft-only reassignment

Normal Admin reassignment can target only the chosen Gallery's current Published/frozen Version.

Example:

```text
Before
Draft      -> Main Gallery v2
Published  -> Main Gallery v2

ASSIGN DRAFT -> Test Gallery v1
Draft      -> Test Gallery v1
Published  -> Main Gallery v2   (unchanged and still public)
```

Cross-Gallery reassignment resets only Gallery-specific spatial state: wall presentation state, artwork/sculpture placement/anchor/focus-camera fields, local lights, tour order and navigation path. Exhibition identity/media/text and unrelated non-spatial data remain.

A versioned `venueMigration` marker records the pending migration. If spatial items exist, the rebuilt layout must be saved after assignment before **CONFIRM LAYOUT**. An unresolved migration blocks Exhibition publication.

### Explicit publication boundary

**PUBLISH EXHIBITION** uses the canonical bundle publication RPC:

```text
Draft state/card/version       -> Published
old Published state/card/version -> Previous
```

Cross-Gallery Draft runtime saves stay private. Same-Version saves for an already Published Exhibition can retain the accepted instant state-publication path only when Draft Version still equals Published Version and no migration is pending.

Historical raw assignment and raw state-only publication functions are not browser-facing in C24.

### Public discovery

With no explicit `?exhibition=` query, the Viewer requests canonical published Exhibition cards **before** starting Babylon and shows a selection surface. Card Gallery name comes from the Published Venue Version. A missing cover uses a neutral fallback.

Choosing a card sets `?exhibition=<slug>` and continues the normal startup. Explicit deep links bypass discovery.

Different Galleries use a fresh document/bootstrap boundary in C24. Same-Gallery Exhibition switching keeps the accepted resident/delta path. True in-session cross-Gallery Scene teardown/recreation remains C6C8C25.

## Test Gallery

`gallery-test.html?version=<venueVersionUuid>` loads one explicit Gallery Version through the authenticated test resolver. It does not resolve/load a real Exhibition state.

The engine exposes the small read-only bridge:

```text
GalleryApp.getCameraPose()
```

Gallery CRUD/versioning/model validation/Exhibition assignment remain outside `Gallery_V0_11.js`.

## Backend dependency

The application uses **Supabase** for Auth, Postgres/RLS/RPC data access and Storage.

Release SQL, migrations, prechecks/postchecks, rollback synchronizer and operator queries live under `OUTSIDE_REPO/SQL/` in the release package, not in the deployable repository.

## Compatibility identifiers

Some historical internal/debug aliases, localStorage keys, CSS/DOM identifiers and physical Storage names still contain `Berryboy`. They are retained only where changing them would risk accepted state/diagnostics/history and must not be used for new contracts.

## Validation

From repository root:

```bash
npm run check
```

This performs production build, syntax, repository verification and consolidated regression suites, including C23 executable GLB worker fixtures and C24 executable Exhibition/Gallery assignment state-rebind invariants.

SQL package verification is separate:

```bash
node OUTSIDE_REPO/TOOLS/verify-sql-package.mjs
```

The SQL verifier is static. Production still requires the documented Supabase PRECHECK/migration/POSTCHECK and browser smoke.

## Documentation

`README.md` describes current repository architecture/capabilities. It is not the changelog. Release status, production deployment procedure, QA evidence and continuation state live under `OUTSIDE_REPO/`.
