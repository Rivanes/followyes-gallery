# Berryboy Art Gallery — Stage 12C65E

## Mobile Asset Streaming / Memory Budget

Stage 12C65E is one complete production stage built on Stage 12C65D. It replaces the previous post-entry "load everything" behavior with a zone-aware runtime:

- **critical** — the current gallery zone; required previews and sculptures are prepared before Interaction Ready,
- **nearby** — adjacent zones; loaded after entry with lower priority,
- **deferred** — distant zones; left unloaded until the camera approaches.

The global collision shell (walls, floor and ceiling) remains startup-critical so navigation and Local Light targeting do not operate on incomplete architecture. Props remain optional and begin after Interaction Ready.

## Included systems

- zones derived from floor bounds, with grid fallback for large segmented floors,
- prioritized artwork and sculpture queues,
- current-zone full-resolution artwork upgrades,
- mobile texture and model resident budgets,
- disposal and re-queue of distant artwork textures and sculpture models,
- explicit KTX2 artwork variants with JPG/WebP fallback,
- support for KTX2 textures embedded in GLB,
- optional low-LOD sculpture URL for nearby zones and high-detail URL for the critical zone,
- distance culling LOD for loaded sculpture and Props meshes,
- mobile AssetContainer cache bypass so unloaded models can actually release GPU resources,
- current + adjacent zone activation for Props and Local Lights,
- streaming budgets updated when Adaptive Quality changes,
- debug API at `window.BerryboyArtGalleryStreaming`.

## Optional state fields

Artwork image state can include:

- `imageUrlKtx2Preview` / `ktx2PreviewUrl`
- `imageUrlKtx2Mobile` / `ktx2MobileUrl`
- `imageUrlKtx2Web` / `ktx2WebUrl`
- `imageUrlKtx2` / `ktx2Url`

Sculpture model state can include:

- `lodUrl` (aliases accepted during normalization: `modelUrlLow`, `lowUrl`)
- `lodCullDistance`

Existing JPG/WebP artwork URLs and original GLB URLs remain valid fallbacks. Stage 12C65E does not fabricate converted KTX2 or low-poly assets; the runtime consumes these variants when they exist in Storage/state.

## Verification

Run:

```bash
npm run check
```

This checks JavaScript syntax, Stage identity, queue contracts, KTX2 fallback, model LOD, memory release, zone-based Local Lights, the login ON/OFF contract, minified output and protected Inspect functions.


## Included UI hotfixes

- Stable Inspect navigation keeps Previous/Next geometry during camera travel.
- The floating Edit Mode button restores pointer input inside the HUD controls layer.

## First Light Mode Exit Stall Fix

The first **BACK TO EDIT** after opening Local Lights no longer treats every restored lamp as a newly spawned, manually dirty light. Restored `targetMeshNames` remain the source of truth. If several lights are genuinely dirty, their affected segment union is resolved once and committed in one segment-aware batch instead of repeating a relation scan for every lamp.

## Background preload test — 2026-07-22

This test variant opens on the technical information page. Babylon.js and the hidden gallery scene are scheduled during browser idle time. While the gallery is not visible, its render loop is throttled to one frame every 500 ms. Clicking **Enter gallery / Przejdź do galerii** reveals the prepared scene and restores full-speed rendering. Data Saver prevents automatic background startup and waits for the click.
