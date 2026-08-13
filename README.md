# C6C8C11 — Guaranteed Preview Fill

This stage keeps the C6C8C10 startup critical-path and background hydration budget, but changes the artwork readiness contract:

- every artwork that has an assigned image must have at least its existing **Preview** texture ready before the loader can disappear,
- all required Preview loads start immediately after one paint frame, with bounded decode concurrency (desktop uses the configured Preview concurrency, capped at 6; mobile remains capped by its profile),
- Preview fill is no longer delayed by zone relevance, user-motion idle budgets or background hydration,
- already-resident Full textures also satisfy the presence gate,
- **Full** quality upgrades keep the C6C8C8 no-thrash/idle/Inspect policy,
- sculptures/models remain outside the foreground gate and keep the C6C8C10 background budget,
- no third image tier was added.

The intent is simple: the public or Admin scene may wait a little longer behind the loader, but an assigned artwork must not appear as a gray placeholder after the gallery is declared ready.

Project structure remains clean: one engine source, one generated production build, one current build/verifier path, retained regression tests, and the existing `SUPABASE_SQL` bundle.

**No new Supabase SQL is required for C6C8C11.**
