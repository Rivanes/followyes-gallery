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
