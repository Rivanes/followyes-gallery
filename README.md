# Exhibition Platform

Current consolidated production package for the 3D exhibition runtime and Admin Workspace.

## Runtime layout

- `index.html` — public Viewer entry.
- `admin.html` — direct/fallback Admin Workspace entry.
- `src/Gallery_V0_11.js` — main Babylon.js runtime source.
- `src/Gallery_V0_11.min.js` — generated production runtime.
- `src/bootstrap/` — Viewer/Admin/cache/transition bootstraps.
- `src/config/gallery-space-config.js` — current Space asset definition.
- `asset-cache-sw.js` — persistent asset delivery cache.
- `ENGINE_LOGIN_DISABLED.txt` — generated login-disabled engine build used for the established test/development workflow.
- `SUPABASE_SQL/` — complete Supabase SQL package. Keep this folder together with the project.

## Cleanup baseline

This package consolidates the accumulated regression tooling without changing the accepted C6C8C16 behavior. Stage-specific regression files were merged into five domain suites, package scripts were reduced to stable commands, and runtime functions with no references anywhere in the shipped application were removed.

The cleanup intentionally does **not** redesign working runtime systems. Viewer/Admin same-runtime transitions, persistent drafts, exhibition residency, Space readiness, artwork Preview readiness, mobile UI, frame runtime, media pipeline, collisions and lighting remain covered by regression tests.

## Validation

Run:

```bash
npm run check
```

This performs the production build, syntax checks, the current verifier and all consolidated regression suites.

## SQL

There is **no new SQL migration for this cleanup**. Existing SQL remains in `SUPABASE_SQL/`.
