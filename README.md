# C6C8C7 — Scene Ownership / Atomic Exhibition Hydration

Current production package for the Exhibition Platform.

## What changed
- Space nodes (`walls`, `floor`, `ceiling`, `props`) have explicit immutable ownership and a canonical integrity baseline.
- Exhibition cleanup cannot dispose or disable Space-owned nodes.
- Parked Exhibition layers include artwork image/frame/glow nodes, sculpture runtime/proxies and complete Local Light helpers.
- Delayed Local Light work is cancelled or ignored after an Exhibition is parked/switched.
- First-load Exhibition state is applied as one atomic batch: artwork previews/models queue instead of doing heavy per-item refreshes.
- global material/collision/light refresh happens once after hydration; Tour/path work and expensive lighting work are deferred.
- transition guard now crosses a real browser task boundary so the loading overlay can paint before Babylon work starts.
- Admin diagnostics show Storage transfer plus CPU hydration phases and `Space OK/FAIL`.

## Cache / egress
The persistent asset cache name remains `exhibition-platform-assets-v1`; installing this Stage does not intentionally invalidate already cached heavy assets.

## SQL
No new SQL is required for C6C8C7. Keep the existing `SUPABASE_SQL` folder as the project database reference.

## Verification
Run:

```bash
npm run check
```
