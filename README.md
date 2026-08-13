# C6C8C10 — Startup Critical Path / Background Hydration Budget

This stage keeps the C6C8C9 scene-isolation and True Readiness foundation, but removes optional work from the interactive critical path. The transition/startup gate now waits for the resident static Space, Space GPU/material warmup, visible startup textures and a bounded set of the nearest current-zone artwork Preview textures. Sculpture/model GLB hydration and the remaining artwork previews no longer block interaction.

After interaction, hydration is budgeted in cooperative slices. Artwork Preview work runs one item per slice only for the current/nearby zones. Heavy model work starts at most one model after a longer idle window. Camera movement, look, drag and recent user activity pause background hydration, preventing background decode/GLB work from intentionally competing with active navigation. Deferred-zone artwork stays queued until its zone becomes relevant instead of being hydrated just to make Network `Finish` reach zero.

Space GPU warmup is cached per material and compiled in small desktop batches, so same-Space Exhibition and Admin/Public transitions do not repeatedly warm already prepared materials. Admin diagnostics now expose foreground-ready time and background slice/artwork/model/pause counters.

**No new Supabase SQL is required for C6C8C10.** Existing `SUPABASE_SQL` remains unchanged.
