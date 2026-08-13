# C6C8C8 — Stable Texture Residency / No-Thrash Streaming

Current production package for the Exhibition Platform.

## What changed
- Normal artwork Preview loads no longer enqueue a Full texture automatically.
- Full quality is selected only for current residency targets and starts after ~1.8 s of viewer inactivity; explicit Inspect remains priority.
- Visible/critical artwork can no longer bypass the movement lock just because it is close to the camera.
- Admin ↔ Public mode changes use one shared texture policy and do not trigger a residency rebalance.
- Full textures use hysteresis: a soft target budget selects new candidates, while a higher hard ceiling allows already-loaded Full textures to remain resident.
- Full → Preview downgrade happens only at the hard ceiling, only while idle, only for old undesired textures, and with downgrade/re-entry cooldowns.
- A Preview created by a residency downgrade is explicitly forbidden from immediately re-enqueueing Full.
- Admin Asset Delivery diagnostics now show Full upgrades, downgrades, movement blocks and prevented thrash.

## What was intentionally not changed
- Sculpture/model streaming is unchanged in this Stage.
- C6C8C7 Scene Ownership / Atomic Exhibition Hydration remains the base lifecycle.
- The persistent asset cache remains `exhibition-platform-assets-v1`, so heavy cached assets are not intentionally invalidated.

## SQL
No new SQL is required for C6C8C8. Keep the existing `SUPABASE_SQL` folder as the project database reference.

## Verification
Run:

```bash
npm run check
```
