# C6C8C13 — Instant Workspace Mode Switch

This build makes same-runtime Admin ↔ Public transitions presentation-only.

- Clean **Admin → Public Page** no longer marks the gallery foreground as not-ready.
- Clean same-runtime return no longer waits for Space GPU warmup, Preview readiness, owner sweep or quiet-frame readiness again.
- The current Babylon Engine, Scene, Space, Exhibition layer, textures, lights and resident assets remain untouched.
- Owner sweep and canonical Space integrity checks still run, but as a deferred idle/background audit after the UI switch.
- If the scene actually has unsaved changes or foreground readiness is not safe, the previous guarded fallback remains available.
- Network diagnostics begin asynchronously and never delay the visible mode switch.
- Admin delivery telemetry refresh is also asynchronous on resume.
- C6C8C12 Hard Space Visual Ready and C6C8C11 Guaranteed Preview Fill remain unchanged.

Expected normal path:

`Admin → Public Page` → UI/camera switch → canvas resize next frame → background integrity audit.

There is **no new Supabase SQL** for C6C8C13.

Run `npm run check` before deployment.
