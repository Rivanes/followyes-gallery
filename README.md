# Berryboy Art Gallery Platform

Production source for the Berryboy Art Gallery Multi-Venue / Multi-Exhibition platform.

## Public entry points

- `/` — public site and exhibition selection
- `/gallery/` — Babylon.js Viewer / 3D Editor
- `/admin/` — Site Admin

## Repository contents

- `admin/` — administration application
- `gallery/` — gallery entry point
- `src/` — platform, runtime and gallery source
- `supabase/functions/` — Supabase Edge Functions used by privileged workflows
- `venues/` — Venue manifests, schema and templates

Database SQL, migration reports, tests and development tooling are intentionally kept outside this GitHub folder in the release package under `NOT_FOR_GITHUB/`.

## Deployment

This folder can be copied directly into the GitHub repository. Database changes must be applied separately in Supabase using the SQL package supplied with the release.

## Mobile diagnostics

The mobile memory DBG diagnostics remain active while device testing is still in progress. Do not remove or hide that diagnostic system until the test campaign is completed and the diagnostic code is intentionally removed in a later cleanup.
