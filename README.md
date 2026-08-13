# C6C8C16 — Mobile UI Polish / Inspect Layout / Cursor Refresh

This stage is deliberately UI/UX-only and keeps the C6C8C15 runtime, loading, exhibition residency and persistent-draft behavior intact.

## What changed

- **Mobile intro:** `Start exploring` is now in a fixed footer independent from the scrollable instructions. The card uses the dynamic viewport and iOS safe-area insets so browser chrome cannot push the CTA out of reach.
- **Mobile Inspect:** Previous/Next buttons no longer reserve a wide column inside the metadata capsule. They float on the upper-right edge of the popup, while avatar, author, title and description regain the full information width.
- **Inspect safe-frame:** navigation remains outside the popup visual rectangle used by the camera composition, so the arrows do not force the artwork to be framed smaller.
- **Floor cursor:** the existing SDF implementation is retained, but the marker is smaller, thinner, lower-alpha and uses a shorter/subtler click ripple.

## SQL

There is **no new Supabase SQL** for C6C8C16.

## Validation

Run:

```bash
npm run check
```
