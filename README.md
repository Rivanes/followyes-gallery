# Exhibition Platform

Current repository release: **V14.1.5 — Admin Visible Hydration Batch**.

This repository contains the deployable Babylon.js 3D Exhibition Platform plus repository-local build and regression tooling. Database migration/deployment SQL is intentionally kept outside `REPO` in the documented release package.

## V14.1.5 Admin Visible Hydration Batch

V14.1.5 makes the existing `admin-exhibition` loading policy real at executor level. Assigned artwork Preview, artwork Frames, sculpture/models and Shared Props now participate in one policy-driven Admin visible hydration batch. Admin preview/same-Space Exhibition switching does not report `admin-visible-settled` until every required visible task is terminal: `loaded`, or explicit `unavailable/error` with its immutable reference preserved.

Frame/model/Shared Prop restore tasks are registered against the current Scene loading session as lifecycle tasks. Scene cancellation supersedes still-pending tasks, and timeout cleanup invalidates the corresponding async generation/runtime so a late completion cannot silently mutate an already-settled Admin preview. Existing V13.5 unavailable/retry semantics remain authoritative for corrupt or unavailable immutable assets.

For Admin only, sculpture/models and Shared Props bypass the state-apply deferred background queue while they belong to the visible batch. Their expensive global refresh work is coalesced until the batch settles. **Public behavior is unchanged:** artwork Preview remains foreground while Frames, sculpture/models and Shared Props may continue streaming in background.

V14.1.4 remains the Gallery-authoring readiness foundation: assigned Floor/Walls/Ceiling/Props settle before authoring preview, while an unassigned role remains legal. V14.1.3 remains the Scene-ownership/cancellation foundation.

The three-file target remains:

```text
scene-lifecycle-controller.js
scene-loading-orchestrator.js   (V14.1.2 shell; V14.1.3 cancellation; V14.1.5 lifecycle task reporting)
scene-loading-policies.js       (V14.1.1 canonical context/readiness/family policy)
```

`Gallery_V0_11.js` remains the Babylon/editor executor layer during the staged extraction. V14.1.5 requires no SQL and does not enable latest-wins navigation.

## Product model

- **Venue / Gallery** is the reusable physical 3D environment.
- **Venue Version** is an immutable published/history version of that environment and its runtime manifest/assets.
- **Space** is the runtime representation of the resolved Venue Version passed into Babylon.
- **Exhibition** is the content/publication layer shown inside a Gallery.
- An Exhibition has independent Draft, Published and Previous state/card/ exact Venue Version channels.
- `exhibitions.venue_id` / `exhibition_states.venue_id` describe the current **Draft authoring Gallery**.
- Public Gallery identity is derived from `published_venue_version_id -> venue_versions.venue_id`, not from the current Draft authoring Gallery.
- Publishing a new Gallery Version does not automatically migrate Exhibitions.
- Different immutable Venue Versions can now switch in one browser session through the C25 Scene lifecycle controller.

Specific Gallery names are data. They are not platform/runtime branding.

## Main entries

- `index.html` — project homepage + Exhibition carousel + Public Viewer + same-session cross-space switching.
- `admin.html` — direct/fallback Admin Workspace.
- `gallery-test.html` — authenticated isolated preview of one Gallery Version.
- `src/Gallery_V0_11.js` — main Babylon.js runtime source.
- `src/Gallery_V0_11.min.js` — generated production runtime.
- `src/data/exhibition-api.js` — canonical Venue/Exhibition data adapter.
- `src/data/exhibition-gallery-assignment.js` — pure C24 binding/migration helpers and executable reference rebind for QA.
- `src/data/gallery-management-api.js` — controlled Gallery lifecycle/Storage adapter.
- `src/data/shared-asset-api.js` — guarded Shared Asset catalog/version adapter, V13.2 thumbnail bridge and V13.3 Published runtime descriptor read.
- `src/bootstrap/admin-asset-workspace.js` — canonical left Asset Manager, V13.3 Prop drag/PLACE launcher and V13.4 artwork-only Frame binding/drag Browser shared by standalone and inline Admin.
- `src/runtime/shared-asset-state.js` — V13.1 immutable Shared Asset reference/state-manifest contract for later Exhibition dressing.
- `src/validation/shared-asset-validation.js` — V13.1 Prop/Frame GLB validation coordinator.
- `src/workers/shared-asset-glb-validator-worker.js` — independent V13.1 streaming GLB validator for reusable Props/Frames.
- `src/runtime/space-definition-resolver.js` — resolves a canonical Venue Version into the small Space contract consumed by the engine.
- `src/runtime/scene-lifecycle-controller.js` — C25 owner of one mutable Babylon Scene on the persistent Engine/canvas.
- `src/runtime/scene-loading-policies.js` — V14.1.1 pure context/readiness policy contract.
- `src/runtime/scene-loading-orchestrator.js` — high-level Scene loading shell; V14.1.5 adds lifecycle task registration/snapshots to the existing cancellable Scene-owned loading sessions.
- `src/runtime/public-space-entry-policy.js` — C26 exact-`venue_version_id` policy for the public Gallery instruction popup.
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

C6C8C22 / C6C8C22.1 Gallery Management is PASS/CLOSED. V13.2/V13.3/V13.4 extend the canonical left Admin Workspace without changing Gallery lifecycle:

```text
EXHIBITIONS | GALLERIES | ASSETS
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

C23 is PASS/CLOSED and remains fully active in C25.

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

With no explicit `?exhibition=` query, the homepage requests canonical Published Exhibition cards **before** starting Babylon and renders the V12 carousel inside the homepage 3D stage. The legacy prestart `Enter gallery / About project` popup is not part of the current flow. Cover cards use their Published card media; a coverless Exhibition renders a genuine title-only card with no fake poster/fallback artwork.

Choosing the whole card is the single visitor action: it starts loading/Babylon and enters that Exhibition immediately. The carousel centers the complete card set when it fits the viewport and naturally becomes horizontally scrollable when it overflows; it supports desktop previous/next controls, native touch horizontal scrolling with scroll snap, and keyboard `ArrowLeft` / `ArrowRight` / `Home` / `End` focus navigation. Explicit deep links on a normal navigation still identify the Exhibition and start directly. A hard browser reload of the Public Viewer intentionally clears the active `?exhibition=` entry and returns to the main Exhibition-selection homepage; same-document card switching and browser Back/Forward remain history-managed. The `ADMIN` link is available before Gallery startup; `admin.html` owns direct authentication, while an authenticated already-live runtime can still use the inline Admin fast path.

C25 replaces the former fresh-document cross-Gallery boundary with same-session Scene lifecycle switching. Same exact Venue Version keeps the accepted resident/delta Exhibition path; another exact Venue Version recreates the Scene on the same Engine/canvas. V12 inherits that lifecycle and the C26 public Space-entry popup policy below.

## V12 Public Carousel / Space Entry Policy

The accepted engine-owned instruction popup is shown by public orchestration, not by a once-per-session flag. Exact immutable `venue_version_id` is the boundary:

```text
initial public entry A       -> show
A -> B                       -> show
B -> A later                 -> show again
Gallery A v1 -> Gallery A v2 -> show
same exact version A -> B    -> do not re-show
Admin / Gallery authoring    -> do not show
```

The decision runs only after lifecycle-matched target readiness. `window.ExhibitionPlatformPublicSpaceEntryDebug` exposes non-user-facing counters and the last decision for production smoke diagnostics.


## C6C8C25.4 Same-Space Exhibition Media Hydration

Same exact `venue_version_id` Exhibition switches continue to reuse the live Babylon Scene, but transition completion now waits for every assigned artwork Preview/Full texture to be materially present. State application may queue Preview loads; C25.4 explicitly primes/drains that queue and treats missing assigned Previews as a transition failure instead of exposing persistent gray placeholders. The rollback path uses the same readiness rule. Full texture upgrades and sculpture/model hydration remain background work.

## C6C8C25.3 Exhibition Publish / Optional Cover

- Poster/Cover is optional for Exhibition publication.
- Generic Exhibition Details save does not change public visibility.
- Publication is explicit through `PUBLISH EXHIBITION`; hiding is explicit through `UNPUBLISH EXHIBITION`.
- Admin shows canonical publication blockers/warnings from `admin_validate_exhibition()`.
- Public discovery supports coverless title-only cards.

## C6C8C25.2 Admin Gallery Partial Preview / UI Fixes

C25.2 adds a separate Gallery **authoring preview** policy without weakening normal Published/Public Space validation. Selecting a Gallery in Admin now drives the right-side Babylon viewport. A working Venue Version may be previewed with zero or partial building assets; only assigned assets are loaded.

Gallery authoring preview is deliberately isolated from real Exhibition content through a read-only synthetic Exhibition adapter. It cannot load/save the previously selected Exhibition's artwork, sculpture, lighting or editor state. Crossing between a normal Exhibition runtime and Gallery authoring preview forces a Scene lifecycle boundary even when the exact `venue_version_id` matches.

Returning `GALLERIES -> EXHIBITIONS` restores the selected Exhibition Draft runtime. Closing inline Admin from Gallery preview restores the remembered Published public runtime.

The strict publication contract is unchanged: Floor + Walls + Ceiling remain required and must pass C23 validation; Props remains optional. C25.2 also scopes Gallery Management text tokens to the dark Admin surface, hides normal runtime diagnostics from the standard Admin toolbar and constrains the in-scene editor panel to the actual 3D stage height.

## C6C8C25.1 Main-page Exhibition Entry / Admin Direct Access

C25.1 is a browser-flow correction over the C25 Scene lifecycle. It removes the obsolete double-entry path where visitors first saw `Enter gallery` and only then chose an Exhibition. Exhibition choice is now the entry gesture.

The loading/error BootGuard remains, but it is hidden during homepage prestart and appears only after an Exhibition has been chosen (or an explicit Exhibition deep link begins startup). Public `EXHIBITIONS` reopens the in-page selector without locking the whole document.

Admin access is independent from Babylon startup: the static `ADMIN` link can always open `admin.html`; only authenticated sessions with a live runtime intercept that link for the inline Admin fast path.

## C6C8C25 Cross-Space Runtime

C25 uses the exact immutable `venue_version_id` as the physical Space identity. Two Exhibitions may share one Gallery slug but still require a full Scene lifecycle if they target different Gallery Versions.

```text
same venue_version_id
  -> existing same-Scene Exhibition switch / residency

different venue_version_id
  -> resolve complete target runtime
  -> dispose old Scene
  -> create new Scene on the same Babylon Engine + canvas
  -> wait for lifecycle-matched Interaction Ready
```

The shared `scene-lifecycle-controller.js` owns the active Scene, lifecycle generation, cross-Version cutover and rollback. The Viewer and standalone Admin render loops read the mutable active Scene instead of closing over the first Scene.

Public/Admin runtime caches are mode-qualified so an Exhibition whose Published channel is Gallery A and Draft channel is Gallery B cannot reuse the wrong runtime. Per-Scene lifecycle IDs prevent stale asynchronous READY/FAIL events from completing a newer Scene.

Target runtime resolution happens before current Scene disposal. If target startup fails after disposal, C25 attempts to recreate the previous canonical runtime.

C25 does not change database schema/RPCs. It uses the deployed C24 assignment/publication contract.

## Test Gallery

`gallery-test.html?version=<venueVersionUuid>` loads one explicit Gallery Version through the authenticated test resolver. It does not resolve/load a real Exhibition state.

The engine exposes the small read-only bridge:

```text
GalleryApp.getCameraPose()
```

Gallery CRUD/versioning/model validation/Exhibition assignment remain outside `Gallery_V0_11.js`.

## V13 Shared Asset Foundation + Asset Manager + Prop Placement

V13.1/V13.2/V13.3/V13.4/V13.5 are PASS/CLOSED. V13.6 is the production-closure candidate: it keeps the Shared Asset table model intact, adds aggregate closure diagnostics, and corrects channel-aware validation in the derived usage synchronizer.

Canonical reusable asset model:

```text
shared_assets
  -> shared_asset_versions (immutable published/history GLB versions)
  -> shared_asset_usages   (Draft/Published/Previous Exhibition references)
```

Asset types in V13.1:

- `prop` — reusable Exhibition-owned scene-dressing model; initial placement contract is floor-based;
- `frame` — reusable artwork-only model; it is never a free-standing scene prop.

New reusable binaries use immutable Storage paths:

```text
shared-assets/assets/<asset UUID>/versions/<asset-version UUID>/model.glb
```

Existing Frames under `gallery-artworks/main/frames/*.glb` are **not moved, renamed or deleted**. The V13.1 production migration seeds them into the Shared Asset catalog as grandfathered immutable published Frame versions and makes the legacy `main/frames` write path read-only. Existing path-based artwork Frame state continues to work until the later V13 Frame migration stage deliberately writes ID-based references.

V13.1 also freezes the future Exhibition reference contract without integrating placement into the current runtime yet:

- future Props reference immutable `assetVersionId` from Exhibition `assetInstances`;
- future artwork Frames may reference immutable `assetVersionId` inside `artworks[].frame`;
- a database usage synchronizer indexes Draft / Published / Previous references transactionally when `exhibition_states` changes;
- Gallery-scoped (`venue`) references are validated per state channel against that channel's exact Venue Version Gallery; Draft, Published and Previous may legitimately resolve to different Galleries;
- published/history asset-version payloads cannot be overwritten or physically deleted;
- new version publication requires current V13.1 streaming GLB validation and SHA-256/file-size identity.

The implemented V13 Admin ownership is:

```text
LEFT WORKSPACE: EXHIBITIONS | GALLERIES | ASSETS
CENTER: active 3D Scene
RIGHT INSPECTOR: EXHIBITS | SPACE | LIGHTING | SETTINGS
```

`ASSETS` is a left-workspace tool switch, not a Scene switch. The Asset Manager provides search/type/category/archive filters, thumbnails, creation/metadata/scope, immutable GLB version upload/validation/publish, archive/restore and usage visibility. Exhibition-host and Gallery-host round trips preserve the current central preview context; Gallery-host Assets remains management-only.

V13.3 adds `editor.assetInstances[]` for Exhibition-owned Shared Props. Published Prop tiles can be dragged from the left Browser onto the Floor on desktop or placed through `PLACE PROP` on touch/narrow input. Placement is checked against the live active Exhibition + exact Venue Version and Gallery scope. Props reuse the existing model-slot/AssetContainer/cache/collision/residency runtime underneath, but are excluded from Sculpture Tour/Inspect and are never serialized in `spheres[]`. Deleting an instance never deletes the immutable Shared Asset binary. Selected Props use the contextual right `PROP` inspector for transform/duplicate/delete.

V13.4 removes the old full Frame variant grid from the right artwork inspector. The right side keeps only current Frame + `CHANGE` / `REMOVE`; `CHANGE` opens left `ASSETS / FRAMES` without rebuilding the Scene or losing artwork selection. Published Frames can be clicked in binding mode or dragged directly onto an artwork. Frame drops on Floor/Wall/Props are rejected. New bindings persist stable Shared Asset/version IDs with legacy Storage fallback, while existing legacy Published Frames remain readable.

V13.5 preserves Shared Prop instances and artwork Frame bindings when an immutable GLB cannot hydrate. Admin exposes explicit unavailable state plus retry actions instead of silently rewriting/deleting references. `GalleryApp.getSharedAssetIntegrityDebug()` reports unavailable Props/Frames for the active Exhibition and exact Venue Version. Asset archive confirmation is usage-aware; archived assets keep existing references readable but block new placement/assignment until Restore.

V13.6 adds the read-only `GalleryApp.getV13ProductionClosureDebug()` aggregate used during the final production matrix. It combines active Exhibition/exact Venue Version identity, Prop/Frame counts, unavailable-reference diagnostics, switching/residency counters and ownership/orphan/workspace audit counters. It is diagnostic-only and does not replace the full production closure matrix.

V13.6 also corrects the derived `shared_asset_usages` synchronizer so Draft, Published and Previous resolve Gallery scope independently through their own exact `*_venue_version_id -> venue_versions.venue_id`. This preserves the C24 reassignment contract where the three channels can belong to different Galleries. The corrective migration resynchronizes the derived index transactionally and does not add a placement table or change Shared Asset identity/versioning.

Catalog browsing uses metadata/thumbnails and does not prefetch the full GLB catalog. V13.2 thumbnails use immutable `shared-assets/assets/<asset UUID>/thumbnails/<media UUID>.webp` paths and are registered in `media_library`. V13.3 enriches the existing catalog RPC with Published file hash/runtime metadata so native HTML dragstart can build its payload synchronously; no placement table is introduced.

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

This performs production build, syntax, repository verification and consolidated regression suites, including C23 executable GLB worker fixtures, C24 Exhibition/Gallery assignment invariants, C25/C25.4 cross-space/media readiness tests and C26 carousel/Space-entry policy invariants.

SQL package verification is separate:

```bash
node OUTSIDE_REPO/TOOLS/verify-sql-package.mjs
```

The SQL/package verifier is static. V13.1/V13.2/V13.3/V13.6 database changes are already deployed/PASS and V13.4/V13.5 added no SQL. **V14.1.5 adds no SQL/schema/RPC change.** Deploy only the repository through GitHub/GitHub Pages. `ALL_IN_ONE.sql` remains fresh-install/reference-only and must not be run on the existing production database.

## Documentation

`README.md` describes current repository architecture/capabilities. It is not the changelog. Release status, production deployment procedure, QA evidence and continuation state live under `OUTSIDE_REPO/`.
