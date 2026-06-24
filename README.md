# Berryboy Art Gallery V0_11

Wersja WEB z jednym plikiem silnika: `src/Gallery_V0_11.js`.

## Model zapisu

Tak jak w działającej wersji V0_8, strona używa:

- `window.GalleryApp.saveStateToSupabase()`
- `window.GalleryApp.loadStateFromSupabase()`
- tabela: `gallery_state`
- rekord: `id = main`
- kolumna: `state`

## Co zapisuje V0_11

- ściany i kolory ścian,
- obrazy: pozycja, rotacja, skala, metadata ściany, materiał,
- postumenty / punkty obserwacji,
- global lighting,
- lighting presets,
- Local Lights:
  - Spot / Point,
  - lampy ręczne,
  - lampy wygenerowane przy obrazach i rzeźbach,
  - pozycja,
  - rotacja,
  - kierunek Spot,
  - enabled,
  - color,
  - intensity,
  - range,
  - Spot Angle,
  - Spot Blend,
  - targets,
  - groups,
  - manualTransformOverride.

## Test

1. Zaloguj się jako edytor.
2. Zmień ustawienia światła głównego.
3. Dodaj Spot i Point.
4. Zmień pozycje i parametry lamp.
5. Zmień targety i grupy.
6. Kliknij `Save state`.
7. Odśwież stronę jako publiczny użytkownik.

Update note:
- Desktop middle mouse / scroll camera rotation now works in both Viewer Mode and Edit Mode.
- The gallery UI anchor fix is preserved.

## Update: mobile UI header priority fix

- Mobile joystick / mobile viewer controls no longer render above the fixed page header.
- `#mobileViewerControls` z-index was lowered below `#siteHeader` (`8000`) while staying above the gallery canvas.
- Previous fixes are preserved: gallery UI anchoring and middle-mouse camera rotation in Viewer/Edit mode.

## V0_11 Supabase Artwork Upload Stage 1

This package adds the first stage of real artwork image support:

- Edit Mode section: `ARTWORK IMAGE`
- Buttons: `UPLOAD`, `APPLY URL`, `REMOVE`
- Supabase Storage bucket expected: `gallery-artworks`
- Storage folder/prefix: `main`
- `gallery_state` stores only image metadata/path/url, not base64 image data.
- Website package has `galleryEditorLoginEnabled = true`, so public visitors do not get editor access.
- The working `.txt` engine version can still use `galleryEditorLoginEnabled = false` for Babylon-only development.

Included SQL reference:
- `supabase_gallery_state_and_artwork_storage_STAGE1.sql`


## Upload fix

This version changes artwork upload from `upsert: true` to `upsert: false`.
Artwork paths already include `Date.now()`, so every upload gets a unique path.

It also shows the Supabase Storage error message in the gallery toast and logs upload details to the browser console.


## V0_11 Supabase Artwork Upload Stage 2 - Dynamic Aspect Ratio

This GitHub package includes:
- Supabase artwork upload stage 1.
- Upload fix: `upsert: false` and detailed upload error logging.
- Dynamic artwork aspect ratio after image upload/load.
- Artwork mesh scaling is adjusted to the uploaded image proportions.
- Remove image resets the artwork to the default placeholder size.

SQL files are intentionally not included in this package.


## V0_11 Supabase Artwork Upload Stage 3 - Artwork Scale + Rotation

This GitHub package includes:
- Stage 1 artwork upload to Supabase Storage.
- Stage 2 dynamic artwork aspect ratio.
- Stage 3 manual artwork transform controls.
- Width / Height scaling on the wall, without changing artwork depth.
- Symmetric scaling from the artwork center.
- Rotation on the wall snapped every 15 degrees.
- Save/load support for `artworkTransform`.

SQL files are intentionally not included in this package.


## V0_11 Supabase Artwork Upload Stage 4 - Uniform Scale Slider + Rotation Slider

This GitHub package includes:
- Supabase artwork upload and dynamic aspect ratio.
- Uniform artwork scale slider: width and height scale together.
- Scale range: 25% - 300%, step 1%.
- Rotation slider: -180° - 180°, snapped every 15°.
- Artwork thickness is preserved: `scaling.z = 1`.
- Reset transform keeps returning scale/rotation to default values.
- SQL files are intentionally not included.


## Stage 4 UI English text fix

Visible helper text in the editor UI has been changed back to English:
- Artwork image upload note.
- Artwork transform scale/rotation note.

SQL files are intentionally not included in this package.


## Stage 4 rotation -180 fix

Artwork transform rotation now preserves `-180°` instead of normalizing it to `180°`.

Changed:
- `while (degrees <= -180)` to `while (degrees < -180)`

SQL files are intentionally not included in this package.


## Stage 5 Storage replace/delete fix

When uploading a new image for an artwork that already has a Storage image, the old Storage file is removed after the new upload succeeds.

This prevents unused duplicates from accumulating in:
`gallery-artworks/main`.

Existing old duplicates must still be removed manually in Supabase Storage if they are no longer referenced by the current gallery state.

SQL files are intentionally not included in this package.


## Stage 6 Remove Storage delete fix

The `REMOVE` button now removes the currently assigned artwork image from Supabase Storage before clearing it from the artwork.

It also supports extracting the Storage path from a Supabase public URL if `imagePath` is missing.

Reupload/replace delete behavior from Stage 5 is preserved.

SQL files are intentionally not included in this package.


## Stage 7 White Artwork Base Fix

When an artwork has an uploaded image, the base artwork mesh is forced to white so side edges do not show the old placeholder color.

When the image is removed, the placeholder base material/color is restored.

SQL files are intentionally not included in this package.


## Stage 7 White Base Material Fix

Fixes the artwork side edge turning dark/black after the previous white base attempt.

Uploaded-image artworks now use a dedicated white base material with slight emissive lighting.
When the image is removed, the original placeholder material is restored.

SQL files are intentionally not included in this package.


## Stage 8M No Auto Artwork / Sculpture Lights

Removes automatic light generation from artworks and sculptures.

- Existing artworks no longer get auto SpotLights.
- Newly added artworks are created without lamps.
- Sculptures do not generate automatic lights.
- Manual Local Lights Spot / Point remain available.
- Adds `ADD ARTWORK` and `DELETE SELECTED`.

The engine TXT has login disabled.
The GitHub package has login enabled.
SQL files are intentionally not included in this package.


## Stage 8N Free Wall Placement Fix

Improves ADD ARTWORK placement:
- when there is no space directly next to the selected artwork,
- it searches the same wall horizontally and vertically,
- it no longer leaves the new artwork on top of another one.

DELETE clarification/fix:
- dynamic artworks are actually removed from runtime and state,
- deleted base placeholders are removed from active runtime on load via `deletedArtworkNames`.

The engine TXT has login disabled.
The GitHub package has login enabled.
SQL files are intentionally not included in this package.


## Stage 8O Save State + Placement Abort Fix

Verified that new artworks save and restore:
- position,
- rotation,
- scaling,
- wall metadata,
- material,
- image state,
- artwork transform scale/rotation.

Fix:
- if ADD ARTWORK cannot find free space on the selected wall,
- the newly created artwork is immediately removed,
- so it cannot overlap another artwork or be saved in a bad position.

The engine TXT has login disabled.
The GitHub package has login enabled.
SQL files are intentionally not included in this package.


## Stage 8P Placeholder Save / Restore Fix

Fixes new ADD ARTWORK placeholders losing transform state after Save/Load.

Cause:
- placeholder states were serialized correctly,
- but `applyEditorState()` called `removeArtworkImageFromMesh()` for image-less placeholders,
- which reset aspect ratio, scaling, rotation and artworkTransform.

Fix:
- image-less placeholders no longer reset transform on load,
- if an imagePlane must be removed, saved position/rotation/scaling/artworkTransform are re-applied immediately.

The engine TXT has login disabled.
The GitHub package has login enabled.
SQL files are intentionally not included in this package.


## Stage 8Q Artwork Info Popup

This package is based on the uploaded stable Stage 8P package and adds artwork info popup support.

Added:
- popup near artworks in Viewer Mode and Edit Mode,
- editable artwork info in Edit Mode,
- author photo URL,
- author name,
- artwork title,
- artwork description,
- save/restore of artwork info in gallery_state.

Note: author photo is URL-based in this stage (no Storage upload yet).
TXT has login disabled. GitHub package has login enabled.


## Stage 8Q1 Artwork Info Popup - createTextInput Fix

Hotfix for GitHub/runtime error:
`ReferenceError: createTextInput is not defined`

Fix:
- added `createGalleryTextInputCompat()`,
- replaced Stage 8Q `createTextInput(...)` calls,
- no `createTextInput(...)` calls remain.

The engine TXT has login disabled.
The GitHub package has login enabled.
SQL files are intentionally not included.


## Stage 8Q2 Artwork Info Popup UI Layout Fix
- popup now uses the same frosted-glass visual language as the rest of the UI
- popup split into two containers: left photo + author name, right artwork title + description
- ARTWORK INFO editor section rebuilt into two cards with photo preview
- engine TXT: login disabled
- GitHub ZIP: login enabled


## Stage 8Q3 Artwork Info Popup Quote Fix

Hotfix for TXT parser error:
`Unexpected identifier 'gallery'`

Cause:
- Stage 8Q2 had unescaped HTML class quotes inside a double-quoted JavaScript string.

Fix:
- Rebuilt the popup `innerHTML` block using single-quoted JavaScript strings.
- Verified syntax using `node --check` on a `.js` copy.

The engine TXT has login disabled.
The GitHub package has login enabled.


## Stage 8Q5 Q3 Base + WASD + Info Layout Fix

Built from stable Stage 8Q3, not from Stage 8Q4.

Kept:
- Q3 popup behavior / positioning.
- No Q4 projected anchor logic.

Added:
- WASD is disabled while typing in editor inputs/textareas.
- ARTWORK INFO popup has two visual containers:
  - left: author photo + author name,
  - right: artwork title + description.
- ARTWORK INFO editor section is rebuilt into two cards:
  - left: author photo preview, author name, author photo URL,
  - right: artwork title, description.

The engine TXT has login disabled.
The GitHub ZIP has login enabled.


## Stage 8Q9 Q5 Popup DOM Cleanup Fix

Built from Stage 8Q5.

Fix:
- removes stale `.gallery-artwork-info-popup` elements when the scene starts,
- adds a fixed popup ID: `galleryArtworkInfoPopup`,
- cleans any previous popup immediately before creating a new one,
- explicitly hides the popup on init,
- keeps Q5 popup distance and behavior,
- keeps Q5 UI layout,
- keeps WASD typing fix,
- does not include Q6/Q7/Q8 experiments.

The engine TXT has login disabled.
The GitHub ZIP has login enabled.


## Stage 8R Author Photo Upload + Popup Cleanup

Built from working Stage 8Q9.

Changes:
- removed ARTWORK INFO kicker text from the popup,
- swapped editor order: Author Photo first, Author Name below,
- added author photo upload to Supabase Storage,
- author photos are stored under `main/authors/...`,
- author photo Storage metadata is saved in gallery_state,
- deleting an artwork also attempts to delete its uploaded author photo,
- keeps Q9 popup DOM cleanup,
- keeps Q5 popup behavior/layout and WASD typing fix.

The engine TXT has login disabled.
The GitHub ZIP has login enabled.


## Stage 8S Artwork Info UI Reorder Fix

Built from Stage 8R.

Changes:
- Popup artwork title is smaller and aligned to the top.
- Editor ARTWORK INFO layout changed:
  - left card: AUTHOR NAME first, then AUTHOR PHOTO URL, then UPLOAD PHOTO,
  - right card: author photo preview at the top, artwork title and description below.
- Keeps author photo upload to Supabase Storage.
- Keeps Q9 popup DOM cleanup and Q5 popup behavior.

The engine TXT has login disabled.
The GitHub ZIP has login enabled.


## Stage 8T Author Library / Reuse Author Photo

Built from Stage 8S.

Adds shared author records in `gallery_state`:
- `editor.authors`

Artwork info now stores:
- `authorId`

New flow:
- Type AUTHOR NAME.
- Click FIND AUTHOR to reuse an existing author photo.
- If no author exists, upload photo once.
- The uploaded photo becomes the shared author photo.
- Other artworks with the same author can reuse it.
- Deleting one artwork does not delete the author photo if another artwork still uses that author.
- If no artwork uses the author anymore, the author record and uploaded photo are removed.

UI:
- left card: AUTHOR NAME, author photo preview, AUTHOR PHOTO URL, UPLOAD PHOTO.
- right card: FIND AUTHOR, status, ARTWORK TITLE, DESCRIPTION.

The engine TXT has login disabled.
The GitHub ZIP has login enabled.


## Stage 8T1 Author Library Safe Load Fix

Built from Stage 8T.

Fixes:
- saved state load is guarded against author-library errors,
- if author library breaks loading, state is retried without `editor.authors` and `authorId` links,
- per-artwork image apply errors no longer break the whole saved state load,
- per-artwork author restore errors no longer break the whole saved state load,
- artwork image upload gets a delayed second texture apply to handle Supabase public URL propagation delay.

The engine TXT has login disabled.
The GitHub ZIP has login enabled.


## Stage 8T2 Artwork Upload Display Safe Fix

Built from Stage 8T1.

Fix:
- upload success is no longer treated as failed if local texture display throws an exception,
- uploaded image metadata is remembered even when texture display fails,
- Save State can still store imagePath/imageUrl,
- delayed display retry remains but is safe,
- APPLY URL also uses safe texture apply,
- upload catch now shows more detailed hard error message.

The engine TXT has login disabled.
The GitHub ZIP has login enabled.


## Stage 8U Detached Image Plane Fix

Built from Stage 8T2, not from T3/T4/T5.

Fix:
- artwork image plane is detached from the red placeholder box and synced in world space,
- image plane gets renderingGroupId = 2 and unlit/emissive material,
- this avoids the dynamic artwork box covering the image texture,
- no dual planes and no direct texture-on-box experiment,
- keeps author library and safe load/upload from 8T2.

The engine TXT has login disabled. The GitHub ZIP has login enabled.


## Stage 8U1 Material isDisposed Fix

Built from Stage 8U if available.

Fix:
- replaces unsafe `galleryArtworkImageBaseMaterial.isDisposed()` usage,
- adds `isBabylonMaterialDisposedSafe(material)`,
- material objects without `isDisposed()` no longer break artwork image apply,
- fixes the console error:
  `TypeError: galleryArtworkImageBaseMaterial.isDisposed is not a function`.

The engine TXT has login disabled.
The GitHub ZIP has login enabled.


## Stage 8V Mobile Popup Distance + UI Fix

Built from working Stage 8U1.

Changes:
- mobile popup has a larger activation distance,
- mobile popup is smaller and more compact,
- desktop popup behavior remains unchanged,
- keeps Stage 8U1 material isDisposed fix,
- keeps author library / FIND AUTHOR / shared author photo,
- keeps Q9 popup DOM cleanup and Q5 popup behavior.

Distances:
- Desktop Viewer/Edit: 3.4 / 4.4
- Mobile Viewer/Edit: 4.35 / 5.2

The engine TXT has login disabled.
The GitHub ZIP has login enabled.


## Stage 8W Mobile Popup Distance + Compact Override

Built from Stage 8V.

Fixes:
- mobile popup activation distance increased again,
- mobile popup is forced into a compact two-column layout,
- author photo no longer grows into a huge card on mobile,
- popup is moved above mobile controls,
- desktop remains unchanged.

Distances:
- Desktop Viewer/Edit: 3.4 / 4.4
- Mobile Viewer/Edit: 7.25 / 8.0

The engine TXT has login disabled.
The GitHub ZIP has login enabled.


## Stage 8X1 Mobile Popup Safe Fix

Built from Stage 8W.

This replaces the broken Stage 8X.

Fix:
- removes the raw CSS problem from Stage 8X,
- mobile distance is equal in Viewer/Edit: 7.75,
- mobile popup is moved higher: 156px / 150px,
- mobile popup max-height reduced,
- no CSS is appended after `return scene;`.

The engine TXT has login disabled.
The GitHub ZIP has login enabled.


## Stage 8Y Popup Distance + Width Fix

Built from Stage 8X1.

Changes:
- mobile popup distance reduced so the popup appears slightly later,
- mobile distance is still identical in Viewer/Edit: 6.65,
- desktop popup distance is identical in Viewer/Edit: 3.9,
- desktop popup is wider: 640px max,
- mobile compact popup layout remains,
- upload/image/author systems are untouched.

The engine TXT has login disabled.
The GitHub ZIP has login enabled.


## Stage 9A Movement Restore / Collision Rollback

Built from stable Stage 8Y.

This rollback removes/rejects the Stage 9 Viewer Collision attempt because it broke camera walking / mobile movement.

Kept from Stage 8Y:
- working artwork image upload/load,
- Stage 8U1 material isDisposed fix,
- author library / FIND AUTHOR / shared author photo,
- Q9 popup DOM cleanup,
- Q5 popup behavior,
- WASD disabled while typing,
- mobile/desktop popup distance and width fixes.

Removed / not included:
- Stage 9 viewer collision system,
- camera.checkCollisions toggling,
- moveViewerCameraWithCollisions,
- updateViewerCameraCollisionGuard,
- collision debug helper.

The engine TXT has login disabled.
The GitHub ZIP has login enabled.


## Stage 9B Viewer Built-in Collision Step 1

Built from Stage 9A / stable Stage 8Y.

This is a safer collision attempt than rejected Stage 9:
- uses Babylon built-in collisions only,
- no custom AABB guard,
- no per-frame forced camera rollback,
- no manual wall/object intersection test.

Viewer Mode:
- camera.checkCollisions = true

Edit Mode:
- camera.checkCollisions = false

Registered collision targets:
- walls,
- props,
- artworks,
- pedestals/sculptures.

Mobile joystick:
- keeps existing floor boundary,
- uses camera.moveWithCollisions only for accepted movement delta.

Debug:
- GalleryApp.getViewerCollisionDebug()
- GalleryApp.setViewerCollisionTargets({ walls, props, artworks, sculptures })

The engine TXT has login disabled.
The GitHub ZIP has login enabled.


## Stage 9C Viewer Wall Raycast Block Fix

Built from Stage 9B.

Goal:
- block walking through walls in Viewer Mode,
- avoid breaking movement like rejected Stage 9.

Changes:
- collision targets are limited to walls only,
- props/artworks/sculptures are disabled for this step,
- adds a wall raycast blocker between last safe camera position and current camera position,
- uses actual wall mesh ray hits instead of broad AABB,
- adds sliding fallback on X/Z when movement crosses a wall,
- works for desktop movement and mobile joystick because it resolves after movement.

Debug:
- GalleryApp.getViewerCollisionDebug()
- GalleryApp.setViewerCollisionTargets({ walls, props, artworks, sculptures })

The engine TXT has login disabled.
The GitHub ZIP has login enabled.


## Stage 9D Viewer Wall Clipping Buffer Fix

Built from Stage 9C.

Changes:
- wall blocker now stops the camera earlier,
- adds a visual stop distance to avoid camera near-plane clipping through walls,
- increases wall ray extra distance,
- increases horizontal wall block radius,
- adds proximity rays from the camera position to catch side/corner clipping,
- still only blocks walls; props/artworks/sculptures remain disabled for this stage.

The engine TXT has login disabled.
The GitHub ZIP has login enabled.


## Stage 9E Viewer Wall Clipping Near Plane Fix

Built from Stage 9D.

Changes:
- reduces camera.minZ to 0.035 to limit visual near-plane clipping,
- increases wall block radius,
- increases wall ray extra distance,
- increases visual stop distance,
- adds diagonal proximity rays for wall corners,
- still only blocks walls; props/artworks/sculptures remain disabled.

The engine TXT has login disabled.
The GitHub ZIP has login enabled.


## Stage 9F Artwork Image Depth Occlusion Fix

Built from Stage 9E.

Fix:
- artwork image planes no longer force renderingGroupId = 2,
- image planes use the normal scene render group so walls can occlude them,
- keeps the detached image plane offset so the placeholder does not cover the artwork texture,
- makes image material depth behavior explicit,
- adds GalleryApp.getArtworkImagePlaneDepthDebug().

Reason:
- renderingGroupId = 2 helped avoid placeholder overdraw,
- but on the web build it made artwork textures visible through walls.

The engine TXT has login disabled.
The GitHub ZIP has login enabled.


## Berryboy Art Gallery V0_11 Release

Release base:
- Stage 9F Artwork Image Depth Occlusion Fix.

This release marks the current stable working version after:
- Supabase artwork upload/load,
- dynamic artwork aspect ratio,
- artwork scale/rotation,
- add/delete artwork flow,
- artwork info popup,
- author library / FIND AUTHOR / shared author photo,
- mobile/desktop popup distance and layout fixes,
- Stage 8U1 material isDisposed fix,
- Stage 9E viewer wall clipping / near-plane fix,
- Stage 9F artwork image depth occlusion fix.

Collision status:
- Viewer Mode wall collision is included.
- Props/artworks/sculptures collision remains intentionally disabled for now.
- The rejected aggressive Stage 9 collision guard is not part of this release.

Files:
- Official web engine: `src/Gallery_V0_11.js`
- Compatibility engine copy: `src/Gallery_V0_10.js`
- GitHub ZIP has login enabled.
- Engine TXT has login disabled.


## Berryboy Art Gallery V0_11 Brand Name Fix

Brand update:
- The public gallery name is now `Berryboy Art Gallery`.
- Technical global/localStorage names were also renamed to `BerryboyArtGallery...` / `berryboy_art_gallery...`.

This is a naming/branding-only release based on V0_11.
No artwork upload, collision, popup, author library, lighting, or Supabase logic was changed.


## V0_11 Roadmap Update

Updated the roadmap section in `index.html` to match the accepted V0_10 → V0_11 project state.

Updated sections:
- TESTOWANE
- KOLEJNE KROKI
- POMYSŁY

No engine logic was changed.


## V0_11 Wall Segments Model Update

Updated wall model import:
- `https://raw.githubusercontent.com/followyes/berryboy-art-gallery-assets/main/Models/Wall_segments.glb`

The wall model is now loaded from the new Berryboy Art Gallery assets repository.
No engine logic was changed except the wall model URL/filename.


## V0_11 Assets Update - No Floor

Updated model imports from the new Berryboy Art Gallery assets repository, except Floor.

Updated:
- `https://raw.githubusercontent.com/followyes/berryboy-art-gallery-assets/main/Models/Wall_segments.glb`
- `https://raw.githubusercontent.com/followyes/berryboy-art-gallery-assets/main/Models/Ceiling.glb`
- `https://raw.githubusercontent.com/followyes/berryboy-art-gallery-assets/main/Models/Props.glb`

Not changed:
- Floor import stays exactly as it was in the uploaded package.

Reason:
- Floor.gltf/Floor.bin external texture setup is still being prepared and should not be touched in this package.


## V0_11 Assets Update - Floor Folder

Floor model is now loaded from:

- `https://raw.githubusercontent.com/followyes/berryboy-art-gallery-assets/main/Models/Floor/Floor.gltf`

Expected folder structure in the assets repository:

```txt
Models/
  Floor/
    Floor.gltf
    Floor.bin
    Concrete_basecolor.png
    Concrete_normal.png
    ...
```

Because `Floor.gltf`, `Floor.bin`, and floor textures are in the same folder, texture and buffer URIs inside `Floor.gltf` should be simple local filenames, for example:

```json
"uri": "Floor.bin"
"uri": "Concrete_basecolor.png"
```

No gallery logic was changed except the Floor model URL.


## V0_11 Stage 10A Wall Segment Painting

Wall painting behavior changed for the segmented wall model.

Before:
- selecting a wall color and clicking any wall painted all wall meshes.

Now:
- selecting a wall color and clicking a wall paints only the clicked wall segment.
- works with wall segment names like `Wall_segment_001` through `Wall_segment_071`.
- save/load stores color per wall mesh/segment.

Debug:
- `GalleryApp.getWallSegmentPaintDebug()`

No lighting target segmentation was changed in this stage.


## V0_11 Stage 10A1 Wall Segment Painting Guard

Painting is now allowed only on meshes whose name starts with:

```txt
Wall_segment_
```

This blocks accidental painting on helper/extra meshes such as `Plane.011`.

Debug:
- `GalleryApp.getWallSegmentPaintDebug()`
- each item now includes `paintable: true/false`

No lighting target segmentation was changed in this stage.


## V0_11 Stage 10B Wall Segment Light Targeting

Local Lights target `Walls` now affects only the nearest wall segments instead of all wall meshes.

Before:
- `Walls` added all wallMeshes to `includedOnlyMeshes`.

Now:
- `Walls` adds only nearby meshes named `Wall_segment_...`.
- Default max segments per light: 5.
- Default segment search radius: 4.8.
- For spot lights, a ray in the spot direction is used to find the primary wall segment.
- For artwork-owned lights, the artwork wall segment is used as the primary target.

Debug:
- `GalleryApp.getWallSegmentLightTargetDebug()`

This stage does not change the UI, save/load format, or wall painting behavior.


## V0_11 Stage 10C Wall Segment Light Budget

Fixes hard lighting cuts between wall segments.

Stage 10B used:
- one light → max 5 wall segments

Stage 10C changes the rule to:
- one wall segment → max 5 lights

Lights can now affect a wider group of neighboring wall segments to reduce visible hard cutoffs, while each segment keeps a light budget.

Debug:
- `GalleryApp.getWallSegmentLightTargetDebug()`

Look at:
- `maxLightsPerSegment`
- per-segment `lightCount`
- per-light `wallTargetCount`


## V0_11 Stage 10D Front-Facing Wall Segment Light Budget

Fix:
- wall segments are now targeted only when the light is on the front side of the segment.
- this prevents lights from behind a wall from consuming the segment light budget or producing strange lighting cuts.

Kept:
- Stage 10C rule: one wall segment can receive max 5 lights.
- a light can still affect multiple neighboring front-facing segments to avoid hard edges.

Debug:
- `GalleryApp.getWallSegmentLightTargetDebug()`

Look for:
- `frontFacingFilterEnabled`
- `frontFacingDotLimit`
- `candidateCountAfterFrontFilter`


## V0_11 Stage 10E Camera View Local Light Culling Test

Test optimization:
- Local Lights are runtime-enabled only when their position is inside the middle part of the camera view.
- For testing, the active area is intentionally narrow: 2/3 of the viewport.

Default:
- `localLightCameraCullingEnabled = true`
- `localLightCameraCullingViewScale = 0.66`

Important:
- saved `enabled` state is preserved separately as `userEnabled`.
- camera culling changes runtime light state only.
- save/load should not accidentally save a camera-culled light as disabled.

Debug:
- `GalleryApp.getLocalLightCameraCullingDebug()`
- `GalleryApp.setLocalLightCameraCulling({ enabled: true, viewScale: 0.66 })`

Final tuning idea:
- if this works, increase `viewScale` to around `0.95` or `1.0`.

## V0_11 Stage 10E2 Full View Camera Culling

Update:
- camera-view light culling now uses the full camera viewport.
- `localLightCameraCullingViewScale` changed from `0.66` to `1.0`.
- Stage 10E1 intensity-based culling remains unchanged.

Effect:
- lights should stay active anywhere inside the visible camera frame.
- they should only fade to intensity `0` when they leave the full viewport.


## V0_11 Stage 10E3 Camera Light Smooth Fade

Update:
- camera culling no longer snaps light intensity directly between `0` and `userIntensity`.
- each Local Light smoothly interpolates toward `runtimeTargetIntensity`.

Defaults:
- `localLightCameraCullingSmoothFadeEnabled = true`
- `localLightCameraCullingFadeInSpeed = 7.5`
- `localLightCameraCullingFadeOutSpeed = 5.0`

Debug / tuning:
```js
GalleryApp.setLocalLightCameraCulling({
  enabled: true,
  viewScale: 1.0,
  smoothFadeEnabled: true,
  fadeInSpeed: 7.5,
  fadeOutSpeed: 5.0
})
```


## V0_11 Stage 10E4 Soft Delete Local Lights

Fix:
- deleting a Local Light from the UI no longer calls `light.dispose()`.
- UI delete now uses soft-delete:
  - light remains technically in scene,
  - intensity becomes 0,
  - editor marker/helper meshes are hidden,
  - item is removed from active UI/state lists,
  - item is not saved as an active light.

Reason:
- physically removing lights from the Babylon scene can rebuild materials/shaders and looks like texture reload flicker.

Note:
- this keeps deleted light objects in memory during the current session.
- this is acceptable for the current editor workflow and avoids visual flicker.


## V0_11 Stage 10E5 Light Quarantine / Dummy Target

Update over Stage 10E4:
- soft-deleted lights are no longer just intensity `0`.
- they are quarantined to a hidden dummy mesh:
  - `includedOnlyMeshes = [berryboy_local_light_quarantine_dummy]`
  - `intensity = 0`
- this prevents deleted lights from targeting real gallery meshes.

Helper cleanup:
- editor helper meshes are hidden/disabled.
- local light helper geometry is disposed through `disposeLocalLightHelper(item)`.
- gizmo/highlight is detached/removed.
- marker/root/target/helper objects are non-pickable.

Reason:
- avoid material/shader rebuild flicker from `light.dispose()`,
- while also preventing deleted lights from polluting real wall/artwork/pedestal target space.


## V0_11 Stage 10E7 No Dispose Light Reuse Pool

Final delete strategy after testing:
- `light.dispose()` causes material/texture reload flicker even with delay.
- Delete Selected therefore does not physically dispose local lights during the session.
- Deleted lights are quarantined to a hidden dummy mesh and reused when a new light of the same type is created.

Delete Selected:
- intensity `0`
- `includedOnlyMeshes = [berryboy_local_light_quarantine_dummy]`
- helpers/markers/targets hidden/non-pickable
- removed from active UI/state list
- not saved as active

Create Spot / Point:
- first checks the reuse pool
- reuses a quarantined light of the same type when available
- resets position, intensity, range, color, target options and helper geometry

This avoids flicker and prevents unbounded scene pollution in normal edit workflows.


## V0_11 Stage 10E8 Clean Disabled Lights Button

Update:
- Added a safe manual cleanup button in Local Lights:
  - `Clean Disabled Lights`
- Normal `Delete Selected` still avoids flicker:
  - no `light.dispose()`
  - deleted lights go to quarantine/reuse pool
- `Clean Disabled Lights` is intentional hard cleanup:
  - disposes only quarantined/deleted lights
  - never disposes active lights
  - may cause a short material reload, by design

Console API:
```js
GalleryApp.cleanDisabledLocalLights()
```

Debug:
```js
GalleryApp.getLocalLightCameraCullingDebug()
```

Useful fields:
- `reusePoolCount`
- `cleanDisabledLightsAvailable`
- `reusePoolByType`


## V0_11 Stage 10E9 Zero Touch Light Delete

Fix attempt after Stage 10E8:
- deleting still caused material/texture reload.
- likely cause: changing light target lists (`includedOnlyMeshes`) and/or refreshing global local light targets.

New normal Delete Selected behavior:
- only sets `light.intensity = 0`.
- does not call `light.dispose()`.
- does not change light enabled-state.
- does not change `includedOnlyMeshes`.
- does not refresh all local light targets.
- does not dispose helper geometry.
- hides marker/helper visuals without changing mesh enabled-state.
- keeps the light in the reuse pool.

Tradeoff:
- deleted lights may still have their previous includedOnlyMeshes while intensity is 0.
- this is intentional to avoid shader/material rebuilds during regular editing.
- use `Clean Disabled Lights` manually when you accept one deliberate reload to clean memory.


## V0_11 Stage 10F Dynamic Wall Segment Retargeting

Fix:
- Local Lights no longer keep the first wall segment assignment forever after being moved.
- When a Local Light is moved or rotated with the gizmo, wall segment targets are recalculated.
- The rule remains:
  - one wall segment can receive max 5 lights
  - not one light fixed to 5 old segments

Implementation:
- `syncLocalLightTransformFromMarker()` requests retargeting on drag and drag-end.
- Retargeting is throttled during drag.
- On drag-end it is forced.
- Since the budget is per wall segment, active Local Lights are recalculated together.

Debug:
```js
GalleryApp.getWallSegmentLightTargetDebug()
GalleryApp.refreshLocalLightWallSegmentTargets()
```

Important:
- Stage 10E9 zero-touch Delete Selected remains unchanged.
- Delete Selected still does not refresh all targets.


## V0_11 Stage 10G Beam-Aware Camera Light Culling

Fix:
- Camera culling no longer checks only the lamp/marker position.
- A Local Light remains active when the camera sees:
  - the light marker position,
  - sampled points along a Spot beam,
  - sampled Point light radius points,
  - centers of currently targeted meshes,
  - owner mesh center when available.

Reason:
- when looking at an artwork, the lamp can be behind the camera while its light/target is in front of the camera.
- in that case the light must remain active.

Debug:
```js
GalleryApp.getLocalLightCameraCullingDebug()
GalleryApp.setLocalLightCameraCulling({
  beamAwareEnabled: true,
  maxTargetMeshSamples: 10
})
```


## V0_11 Stage 10H Wall Segment Alignment Group

Fix:
- alignment/bounds logic no longer treats a single `Wall_segment_0xx` as the whole wall.
- when the current wall mesh is a wall segment, alignment uses all `Wall_segment_...` meshes on the same wall plane as one logical wall group.

Affected logic:
- Center horizontally on wall
- Center vertically on wall
- clamp to wall horizontal bounds
- clamp to wall vertical bounds

Not changed:
- wall painting still works per individual segment.
- local light targeting still works per individual segment.
- Stage 10G beam-aware culling remains full camera view.
- Stage 10E9 zero-touch delete remains unchanged.

Debug:
```js
GalleryApp.getWallSegmentAlignmentGroupDebug()
```


## V0_11 Stage 10I Wall Segment Drag Group

Fix:
- dragging artwork on a segmented wall no longer clamps to the single picked `Wall_segment_0xx`.
- `placeArtworkOnWall()` / drag clamp uses the Stage 10H wall segment alignment group bounds.
- this treats all `Wall_segment_...` meshes on the same wall plane as one logical wall for dragging.

Not changed:
- painting remains per segment.
- light targeting remains per segment.
- Stage 10G full beam-aware culling remains.
- Stage 10E9 zero-touch delete remains.


## V0_11 Stage 10J Wall Segment Corner Guard

Fix:
- Stage 10H/10I grouped wall segments for alignment and dragging, but this could allow artwork to cross real wall corners.
- Stage 10J keeps segment grouping, but only inside one continuous wall interval.

Rule:
- small seams between Wall_segment meshes are merged,
- large gaps / corners / separate same-plane walls are not merged,
- dragging and centering use the interval containing the picked point / artwork position.

Important:
- still does not clamp to every single segment.
- only real breaks/corners stop the artwork.

Debug:
```js
GalleryApp.getWallSegmentAlignmentGroupDebug()
```


## V0_11 Stage 11A Artwork Image Variants / Mobile Texture Budget

Fix:
- mobile devices should not load full-size artwork originals as WebGL textures.
- upload now creates web/mobile/preview variants automatically.
- existing uploaded images can be processed with `REBUILD VARIANTS`.

Variants:
- web: max side 2048 px
- mobile: max side 1024 px
- preview: max side 384 px
- format: WebP with JPEG fallback when canvas WebP is unavailable

State fields:
- `imageUrlOriginal`
- `imageUrlWeb`
- `imageUrlMobile`
- `imageUrlPreview`
- corresponding `imagePath...`, size, dimensions and mime fields

Runtime selection:
- mobile loads `imageUrlMobile` when available.
- desktop loads `imageUrlWeb` when available.
- fallback remains original URL.

Admin UI:
- ARTWORK IMAGE section gets `REBUILD VARIANTS`.
- it rebuilds variants for existing artwork images that do not have web/mobile/preview yet.
- after rebuild it saves gallery state to Supabase.

Console:
```js
GalleryApp.rebuildAllArtworkImageVariants()
GalleryApp.rebuildArtworkImageVariants("Artwork_1")
GalleryApp.getArtworkImageVariantDebug()
```


## V0_11 Stage 11B Author Photo Variants

Extends Stage 11A:
- author photos also get web/mobile/preview variants.
- mobile popup/editor loads smaller author photo variants.
- existing author photos can be rebuilt.
- deleting/removing unused author photos removes original + all generated variants.

Author photo variants:
- web: max side 1024 px
- mobile: max side 512 px
- preview: max side 256 px

Admin UI:
- `REBUILD AUTHOR VARIANTS`

Console:
```js
GalleryApp.rebuildAllAuthorPhotoVariants()
GalleryApp.rebuildAuthorPhotoVariants("author-name-or-id")
GalleryApp.getAuthorPhotoVariantDebug()
```


## V0_11 Stage 11C Image Optimization UI + Storage Folders

Fix:
- Rebuild buttons are now also available in a visible global section: `IMAGE OPTIMIZATION`.
- Storage paths are organized by type and variant folders.

New Storage structure for new uploads:
```txt
main/artworks/Original/
main/artworks/Desktop/
main/artworks/Mobile/
main/artworks/Preview/

main/authors/Original/
main/authors/Desktop/
main/authors/Mobile/
main/authors/Preview/
```

Notes:
- Existing files are not moved.
- Existing files get new variants generated into the new Desktop/Mobile/Preview folders during rebuild.
- Delete uses saved paths, so it removes original + variants regardless of old/new folder layout.


## V0_11 Stage 11D Image Optimization UI Cleanup

UI cleanup:
- `REBUILD ARTWORK VARIANTS` remains only in `IMAGE OPTIMIZATION`.
- `REBUILD AUTHOR VARIANTS` remains only in `IMAGE OPTIMIZATION`.
- Removed duplicated rebuild buttons from:
  - `ARTWORK IMAGE`
  - `ARTWORK INFO / AUTHOR PHOTO`

No logic changes:
- upload still creates Original/Desktop/Mobile/Preview variants.
- rebuild functions remain unchanged.
- Storage folder structure remains unchanged.


## V0_11 Stage 11E Center Ray Popup Target

Fix:
- Artwork info popup no longer chooses the nearest artwork only by distance.
- Popup uses a center camera ray, like an invisible point in the middle of the camera.
- The old activation distance is preserved.
- This prevents popups from neighboring artworks when many artworks are close together.

Console:
```js
GalleryApp.getArtworkInfoPopupTargetDebug()
GalleryApp.setArtworkInfoPopupCenterRay(true)
GalleryApp.setArtworkInfoPopupCenterRay(false)
```


## V0_11 Stage 11F Artwork Image Plane Surface Offset Fix

Fix:
- detached artwork image plane was too far from the physical artwork box.
- the visible image now sits close to the front surface of the artwork box.
- the offset is based on half artwork depth plus a tiny epsilon to avoid z-fighting.

Also:
- image plane stores parent artwork name.
- image plane is pickable for the center-ray popup so popup ray hits the visible image area.


## V0_11 Stage 11G Wall Color Paths + Artwork Image Mirror Fix

Changes:
- Wall color textures now load from the new asset repo folder:
  `https://raw.githubusercontent.com/followyes/berryboy-art-gallery-assets/main/wall_color/`
- Added new wall colors from the new folder.
- Fixed mirrored artwork images by flipping only the detached imagePlane, not the artwork box.

Wall colors:
- black
- blue
- cyan
- green
- orange
- purple
- red
- white
- yellow

Important:
- physical artwork mesh transform is unchanged.
- imagePlane remains detached and close to surface from Stage 11F.
- center-ray popup still works with imagePlane.


## V0_11 Stage 11H Wall GLTF Asset Path Update

Wall model path changed from:
```txt
Models/Wall_segments.glb
```

to:
```txt
Models/Wall/Wall_segments.gltf
```

Related files should live next to the GLTF:
```txt
Models/Wall/Wall_segments.bin
Models/Wall/DefaultMaterial_Base_color.png
Models/Wall/DefaultMaterial_Metallic.png-DefaultMaterial_Roughness.png
Models/Wall/DefaultMaterial_Normal_OpenGL.png
Models/Wall/Substance_graph_ambientocclusion.png
Models/Wall/Substance_graph_normal.png
Models/Wall/Substance_graph_roughness.png
```

Segment logic is unchanged:
- wall painting still requires `Wall_segment_...`
- light targeting still requires `Wall_segment_...`
- alignment/drag/corner guard still use the segment grouping logic


## V0_11 Stage 11I Image Plane Edit Selection Pass-through

Fix:
- Stage 11F made the visible artwork image plane pickable for the center-ray popup.
- That caused clicks to hit `Artwork_XX_ImagePlane` instead of `Artwork_XX`.
- Edit selection now maps imagePlane clicks back to their parent artwork.

Affected:
- Edit Mode artwork selection
- Edit Mode artwork drag start
- Local Lights panel switching back to artwork edit
- Viewer Mode click-to-focus

Not changed:
- imagePlane remains pickable for center-ray popup.
- Stage 11F surface offset remains.
- Stage 11G wall color paths and mirror fix remain.
- Stage 11H wall GLTF path remains.


## V0_11 Stage 11J Wall Paint Base Color Only Fix

Fix:
- Wall segment painting no longer replaces the whole wall material.
- Painting changes only the base color / albedo texture.
- Original wall material channels are preserved:
  - normal map
  - roughness / metallic roughness
  - ambient occlusion
  - lighting/shadow compatibility

State:
- saved `segmentColorName` is restored through the same base-color-only paint path.
- old saved color names `yellowish` and `steel` are normalized to `yellow` and `cyan`.
