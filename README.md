# C6C8C14 — Zero-Work Public Return

This stage is a narrow runtime cleanup on top of C6C8C13.

## What changed

- Clean **Admin → Public Page** is now a true UI-only return.
- The click path no longer calls the full `updateViewerModePlaceholderVisibility()` pipeline.
- Sculpture collision proxies are **reused as-is**; bounds are not recalculated on return.
- Only missing collision proxies are repaired later, one at a time in idle time.
- Edit selection is cleared with a lightweight logical reset instead of rebuilding hidden editor panels.
- Service Worker / network diagnostic reads do not start on the click path.
- Space, Exhibition, artwork textures, models, lights and GPU state stay resident.
- The safety fallback remains for dirty/discarded state.

## SQL

There is **no new Supabase SQL** for C6C8C14.

## Validation

Run:

```bash
npm run check
```
