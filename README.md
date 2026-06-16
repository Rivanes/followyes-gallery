# Followyes Gallery V0_10

Wersja WEB z jednym plikiem silnika: `src/Gallery_V0_10.js`.

## Model zapisu

Tak jak w działającej wersji V0_8, strona używa:

- `window.GalleryApp.saveStateToSupabase()`
- `window.GalleryApp.loadStateFromSupabase()`
- tabela: `gallery_state`
- rekord: `id = main`
- kolumna: `state`

## Co zapisuje V0_10

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

## V0_10 Supabase Artwork Upload Stage 1

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


## V0_10 Supabase Artwork Upload Stage 2 - Dynamic Aspect Ratio

This GitHub package includes:
- Supabase artwork upload stage 1.
- Upload fix: `upsert: false` and detailed upload error logging.
- Dynamic artwork aspect ratio after image upload/load.
- Artwork mesh scaling is adjusted to the uploaded image proportions.
- Remove image resets the artwork to the default placeholder size.

SQL files are intentionally not included in this package.


## V0_10 Supabase Artwork Upload Stage 3 - Artwork Scale + Rotation

This GitHub package includes:
- Stage 1 artwork upload to Supabase Storage.
- Stage 2 dynamic artwork aspect ratio.
- Stage 3 manual artwork transform controls.
- Width / Height scaling on the wall, without changing artwork depth.
- Symmetric scaling from the artwork center.
- Rotation on the wall snapped every 15 degrees.
- Save/load support for `artworkTransform`.

SQL files are intentionally not included in this package.


## V0_10 Supabase Artwork Upload Stage 4 - Uniform Scale Slider + Rotation Slider

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
