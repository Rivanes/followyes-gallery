# Exhibition Platform

Current repository release: **C6C8C23 — Space Model Validation**.

This repository contains the deployable Babylon.js 3D Exhibition Platform plus repository-local build and regression tooling. Database migration/deployment SQL is intentionally kept outside `REPO` in the documented release package.

## Product model

- **Venue / Gallery** is the reusable physical 3D environment.
- **Venue Version** is an immutable published version of that environment and its runtime manifest/assets.
- **Space** is the runtime representation of the resolved Venue Version passed into the Babylon scene.
- **Exhibition** is the content/publication layer shown inside a Gallery.
- Multiple Exhibitions can belong to one Gallery.
- Existing Exhibitions remain pinned to exact Venue Version IDs; publishing a new Gallery Version does not migrate them.
- A future cross-Gallery transition is a Babylon Scene lifecycle boundary; same-Gallery Exhibition switching retains the accepted fast/resident path.

Specific gallery names are data. They are not platform/runtime branding.

## Main entries

- `index.html` — Public Viewer.
- `admin.html` — direct/fallback Admin Workspace.
- `gallery-test.html` — authenticated isolated preview of one Gallery Version.
- `src/Gallery_V0_11.js` — main Babylon.js runtime source.
- `src/Gallery_V0_11.min.js` — generated production runtime.
- `src/data/exhibition-api.js` — canonical Venue/Exhibition data adapter.
- `src/data/gallery-management-api.js` — controlled Gallery lifecycle/Storage adapter used by Admin.
- `src/runtime/space-definition-resolver.js` — resolves a canonical Venue Version into the small Space contract consumed by the engine.
- `src/validation/gallery-model-validation.js` — browser coordinator for C23 model validation.
- `src/workers/gallery-glb-validator-worker.js` — streaming GLB/glTF validator + incremental SHA-256 worker.
- `src/config/space-fixture.js` — local/login-disabled test fixture only; it is not the production Space source.
- `src/bootstrap/gallery-test-bootstrap.js` — Test Gallery resolver/startup and Entry Point capture.
- `src/bootstrap/` — Viewer/Admin/editor/cache/transition bootstraps.
- `asset-cache-sw.js` — persistent asset cache / delivery layer.
- `tools/` — repository build, verifier and consolidated regression suites.

## Canonical runtime path

Production Viewer startup resolves:

```text
Exhibition
  -> exact Venue / Gallery
  -> exact Venue Version
  -> Venue Manifest / Venue Assets
  -> Space Definition
  -> Gallery_V0_11 createScene()
```

The engine receives `runtimeOptions.spaceDefinition`; it does not need to know Supabase table names, model-validation SQL or fixed production GLB URLs.

Canonical database model:

```text
venues
  -> venue_versions
     -> venue_assets

exhibitions
  -> exhibition_states
  -> exhibition_cards
```

Legacy `gallery_exhibitions` / `gallery_state` are not normal runtime dependencies.

## Gallery Management baseline

C6C8C22 / C6C8C22.1 Gallery Management is the accepted PASS/CLOSED baseline.

Admin Workspace separates:

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
-> Create/Open Next Draft when editing again
-> safe Rollback / Archive / Restore
```

A Gallery may have at most one active Draft Version. Creating the next Draft is copy-on-write from the current Published Version: unchanged immutable asset references and manifest state are inherited, while replacing one slot uploads a new immutable Storage object only for that role.

New Gallery uploads use UUID-owned paths:

```text
venue-runtime/venues/{venueUuid}/versions/{versionUuid}/assets/{role}/...
```

Published/frozen Venue Versions are not edited in place.

## C6C8C23 Space Model Validation

### Required / optional roles

Required:

- `floor`
- `walls`
- `ceiling`

Optional:

- `props`

The optional Props contract is true end-to-end: SQL, Space resolver, Test Gallery and Babylon startup/readiness. A Gallery can be valid and published without Props. If Props is assigned, it must pass the same technical validation as the required models.

### Validation flow

New/replaced model:

```text
select GLB
-> C23 Worker streams + validates + computes SHA-256
-> reject locally on technical ERROR
-> immutable Storage upload
-> controlled RPC binds exact path/hash/report
```

Inherited pre-C23 model on an active Draft:

```text
VALIDATE DRAFT
-> stream existing Storage delivery URL
-> C23 Worker validates + hashes
-> controlled RPC records the validation report
-> aggregate Gallery deep validation
```

Validation metadata is stored with the immutable `venue_assets` row as `metadata.c23ModelValidation`, alongside `file_hash`. No second validation table is introduced.

A report is current only when its schema/version, role, SHA-256, exact file size and Storage path still match the asset.

### Technical checks

The worker validates, among other things:

- GLB v2 header, declared length and chunk layout;
- parseable glTF JSON;
- self-contained delivery (no external file dependencies);
- buffers, bufferViews, accessors, sparse/accessor byte ranges;
- node/scene/mesh/material/attribute/morph references;
- renderable POSITION geometry reachable from the active scene;
- finite transforms;
- world bounds derived from POSITION min/max + node transforms;
- extreme or effectively zero-size bounds;
- runtime mesh-name collisions inside a model;
- streaming SHA-256.

The aggregate deep report also blocks duplicate runtime mesh names across assigned Gallery model roles. This protects accepted state flows that target meshes by name.

Cross-model distance and Entry Point plausibility use conservative warning diagnostics. C23 deliberately does **not** impose polygon, LOD, material-aesthetic or art-quality budgets.

### Publish Gate and history

A new C23 Draft can Publish only when every required assigned model has a current passing report and every optional assigned model also passes. Missing Props is not an error.

Existing C22 Published/Previous Gallery Versions are grandfathered and remain runtime/rollback-compatible. C23 invalidates only active Draft aggregate reports so they explicitly pass the new gate before publication.

Gallery Publish/Rollback still does not migrate Exhibition bindings.

## Test Gallery

`gallery-test.html?version=<venueVersionUuid>` loads one explicit Gallery Version through the authenticated test resolver. It does not resolve or load a real Exhibition state.

The Babylon engine exposes the small read-only bridge:

```text
GalleryApp.getCameraPose()
```

This powers **SET CURRENT VIEW AS ENTRY**. Gallery CRUD/versioning/model validation remain outside `Gallery_V0_11.js`.

## Runtime behavior retained

C23 is a technical validation stage, not a rendering rewrite. Accepted behavior from previous stages remains, including:

- same-runtime Public/Admin transitions;
- persistent draft preview;
- same-Space Exhibition residency/delta switching;
- hard Space/Preview readiness;
- bounded background Full texture/model hydration;
- persistent asset caching/egress guards;
- frame runtime;
- collision/lighting behavior;
- mobile UI regressions;
- Current-Zone Model Fast Lane.

Cross-Gallery public Scene disposal/recreate remains **C6C8C25**.

## Backend dependency

The application currently uses **Supabase** for Auth, Postgres/RLS/RPC data access and Storage.

Release SQL, migrations, prechecks/postchecks, rollback synchronizer and operator queries are not repository runtime files. In the release package they live under:

`OUTSIDE_REPO/SQL/`

## Compatibility identifiers

Some old internal/debug aliases, localStorage keys, CSS/DOM identifiers and historical physical Storage names still contain `Berryboy`. They are retained only where changing them would risk breaking accepted browser state, diagnostics or historical asset locations. They are not the current platform identity and must not be used for new technical contracts.

## Validation

Run from the repository root:

```bash
npm run check
```

This performs production build, syntax checks, repository verification and the consolidated regression suites, including executable C23 GLB worker fixtures.

SQL package validation is intentionally separate and is run from the release-package root with:

```bash
node OUTSIDE_REPO/TOOLS/verify-sql-package.mjs
```

The SQL package verifier is static; production still requires the documented Supabase PRECHECK/migration/POSTCHECK.

## Documentation

`README.md` describes current repository architecture/capabilities. It is not the changelog. Release status, production deployment procedure, QA evidence and continuation state live under `OUTSIDE_REPO/`.
