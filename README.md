# Berryboy Art Gallery — Stage 12C62S6 Mobile Startup Survival Mode

Pełna paczka projektowa w starym standardzie.

## Najważniejsze

- `src/Gallery_V0_11.js` — produkcyjny plik silnika z logowaniem edytora włączonym.
- `src/Gallery_V0_10.js` — lustrzana kopia produkcyjnego silnika, zgodnie ze starszym standardem paczek.
- `Gallery_V0_11_STAGE12C62S6_MOBILE_STARTUP_SURVIVAL_MODE_LOGIN_DISABLED.txt` — wersja testowa login-disabled.

## Stage 12C62S6

Zakres:

- baza: Stage 12C62S5A,
- mobile-safe startup survival mode,
- mobile hardware scaling na starcie,
- krytyczne assety `floor / wall / ceiling` ładowane sekwencyjnie na mobile,
- `props` odroczone na mobile do momentu po wejściu do viewer start,
- postprocess mobile-safe: SSAO/Bloom/Vignette wyłączone na starcie,
- niższy local shadow budget na mobile: shadow map 256, max aktywnych spot shadow 1,
- niższe budżety `maxSimultaneousLights` na mobile,
- artwork texture sampling na mobile: bilinear + anisotropicFilteringLevel 1,
- debug: `BerryboyArtGalleryMobile.getDebug()`.

## Weryfikacja loginu

- TXT root: `galleryEditorLoginEnabled = false`
- `src/Gallery_V0_11.js`: `galleryEditorLoginEnabled = true`
- `src/Gallery_V0_10.js`: `galleryEditorLoginEnabled = true`

