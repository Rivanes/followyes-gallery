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
