# C6C8C15 — Persistent Draft / Instant Public Preview

This stage removes the remaining expensive **Edit/Admin → Public Page** path when the current scene has unsaved changes.

## What changed

- **PUBLIC PAGE no longer discards the current Admin draft.**
- Same-runtime Public Preview shows the exact live scene already in RAM/GPU.
- No `applyGalleryState(publishedSnapshot)` is triggered by PUBLIC PAGE.
- Dirty scene state remains dirty and is restored unchanged when Admin Workspace is reopened.
- Unsaved metadata fields remain in the hidden Admin form and are not overwritten on resume.
- Scene and metadata drafts keep before-unload protection while Public Preview is active.
- Exhibition switch, create, logout and explicit discard remain destructive actions and keep their confirmation flow.
- C6C8C14 zero-work presentation path remains intact: no sculpture proxy rebuild, no foreground rebuild, no network diagnostics on the click path.

## SQL

There is **no new Supabase SQL** for C6C8C15.

## Validation

Run:

```bash
npm run check
```
