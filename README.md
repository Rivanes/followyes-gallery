# C6C8C12 — Hard Space Visual Ready

This build hardens the visual Space shell before interaction.

- Floor, Walls, Ceiling **and Props** are critical startup Space assets.
- Props are resident Space geometry; zone streaming no longer hides/re-enables them after entry.
- GPU warmup runs **per visual mesh**, including every `Wall_segment_*`, rather than once per shared material.
- Warmup verifies `material.isReady(mesh)` and retries once; a failed required Space shader keeps the loader up with a diagnostic instead of exposing a hole.
- All assigned artwork Preview guarantees from C6C8C11 remain unchanged.
- Full artwork textures, sculpture/model hydration and Tour remain background work.

**No new Supabase SQL is required for C6C8C12.**

Run `npm run check` before deployment.
