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


## Stage 8 Add / Delete Artwork

Adds full artwork management:
- `ADD ARTWORK` creates a new artwork placeholder/mesh with its own display light.
- `DELETE SELECTED` removes the selected artwork mesh and its Storage image if present.
- New/deleted artworks are saved and restored through `gallery_state`.

SQL files are intentionally not included in this package.
