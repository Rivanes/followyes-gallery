# Exhibition Platform

Current repository release: **C6C8C22.1 — Gallery Management Browser-Smoke Hotfix**.

This repository contains the deployable Babylon.js 3D Exhibition Platform plus repository-local build and regression tooling. Database migration/deployment SQL is intentionally kept outside `REPO` in the documented release package.

## Product model

- **Venue / Gallery** is the reusable physical 3D environment.
- **Venue Version** is an immutable published version of that environment and its runtime manifest/assets.
- **Space** is the runtime representation of the resolved Venue Version passed into the Babylon scene.
- **Exhibition** is the content/publication layer shown inside a Gallery.
- Multiple Exhibitions can belong to one Gallery.
- Existing Exhibitions remain pinned to exact Venue Version IDs; publishing a new Gallery Version does not migrate them.
- A future cross-Gallery transition is a Babylon Scene lifecycle boundary; same-Gallery Exhibition switching retains the existing fast/resident path.

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
- `src/config/space-fixture.js` — local/login-disabled test fixture only; it is not the production Space source.
- `src/bootstrap/gallery-test-bootstrap.js` — Test Gallery resolver/startup and Entry Point capture.
- `src/bootstrap/` — Viewer/Admin/editor/cache/transition bootstraps.
- `asset-cache-sw.js` — persistent asset cache / delivery layer.
- `src/workers/` + `src/vendor/gallery-avif-encoder.mjs` — artwork/media AVIF processing.
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

The engine receives `runtimeOptions.spaceDefinition`; it does not need to know Supabase table names or fixed production GLB URLs.

The active canonical database model is:

```text
venues
  -> venue_versions
     -> venue_assets

exhibitions
  -> exhibition_states
  -> exhibition_cards
```

Legacy `gallery_exhibitions` / `gallery_state` are not normal runtime dependencies. They remain only as controlled transition/rollback evidence until a later cleanup stage.

## C6C8C22 Gallery Management

Admin Workspace now separates:

```text
EXHIBITIONS | GALLERIES
```

The normal Gallery workflow is controlled rather than raw-Manifest editing:

```text
Create Gallery
-> initial Draft Version
-> Floor / Walls / Ceiling / Props
-> Entry Point
-> Validate
-> Test Gallery
-> Publish immutable Version
-> Create/Open Next Draft when editing again
-> safe Rollback / Archive / Restore
```

A Gallery may have at most one active Draft Version. Creating the next Draft is copy-on-write from the current Published Version: unchanged asset references and manifest state are inherited, while replacing one slot uploads a new immutable Storage object only for that role.

New Gallery uploads use UUID-owned paths rather than display names or slugs:

```text
venue-runtime/venues/{venueUuid}/versions/{versionUuid}/assets/{role}/...
```

The controlled building roles in C22 are exactly:

- `floor`
- `walls`
- `ceiling`
- `props`

Published/frozen Venue Versions are not edited in place.


## C6C8C22.1 browser-smoke hardening

C22.1 is a frontend/QA maintenance patch after the first production C22 smoke exposed a missing imported binding in the Building Assets renderer. It does not change the database contract.

The maintenance patch:

- restores the four controlled Building Asset rows through the shared `CONTROLLED_GALLERY_ASSET_ROLES` import;
- adds Entry Point dirty-state and strict numeric validation;
- adds browser-side Gallery mutation/reentrancy locking;
- renders Gallery list/history dynamic text without interpolated row HTML;
- adds Gallery-detail render failure handling and caught selection failures;
- keeps Published/no-Draft Entry controls and Archived metadata read-only;
- clears Gallery-specific URL state when returning to Exhibitions;
- bumps Viewer/Admin cache keys so the corrected module is requested after deploy.

C22.1 has **no SQL delta**. The full C22 Gallery lifecycle must still pass production smoke before C22 is marked CLOSED.

## Structural validation boundary

C22 validates lifecycle readiness, including:

- neutral Venue manifest schema;
- Y-up / meter units;
- exact Gallery/Version binding;
- exactly one Floor/Walls/Ceiling/Props asset;
- required Storage object existence;
- a safe visitor Entry Point.

Deep GLB geometry, mesh semantics, hashes, zones, navigation, anchors and related model validation remain **C6C8C23**.

## Test Gallery

`gallery-test.html?version=<venueVersionUuid>` loads one explicit Gallery Version through the authenticated test resolver. It does not resolve or load a real Exhibition state.

The Babylon engine exposes only the small read-only bridge needed by C22:

```text
GalleryApp.getCameraPose()
```

This powers **SET CURRENT VIEW AS ENTRY**. Gallery CRUD/versioning remains outside `Gallery_V0_11.js`.

## Runtime behavior retained

C22 is a Gallery management stage, not a rendering rewrite. It retains accepted behavior from C21/C20, including:

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

The application currently uses **Supabase** for Auth, Postgres/RLS/RPC data access and Storage. C22 does not migrate the project to Cloudflare infrastructure.

Release SQL, migrations, prechecks/postchecks, rollback synchronizer and operator queries are not repository runtime files. In the release package they live under:

`OUTSIDE_REPO/SQL/`

## Compatibility identifiers

Some old internal/debug aliases, localStorage keys, CSS/DOM identifiers and historical physical Storage names still contain `Berryboy`. They are retained only where changing them would risk breaking accepted browser state, diagnostics or historical asset locations. They are **not** the current platform identity and must not be used for new technical contracts.

Primary new globals/contracts use neutral `ExhibitionPlatform...` naming. Compatibility aliases may remain until a dedicated low-risk retirement stage.

## Validation

Run from the repository root:

```bash
npm run check
```

This performs:

- production build;
- syntax checks;
- repository verifier;
- core runtime regressions;
- media regressions;
- platform regressions including the canonical Multi-Space contract;
- performance regressions;
- workspace regressions;
- C6C8C22.1 Gallery Management browser-smoke/Test Gallery regressions.

SQL package validation is intentionally separate and is run from the release-package root with:

```bash
node OUTSIDE_REPO/TOOLS/verify-sql-package.mjs
```

## Documentation

`README.md` describes the current repository architecture/capabilities. It is not the changelog. Release status, production deployment procedure, QA evidence and continuation state live under `OUTSIDE_REPO/`.
