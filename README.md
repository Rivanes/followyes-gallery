# Berryboy Art Gallery — Stage 12D1

## Venue-Agnostic Engine / Building Manifest

Stage 12D1 przebudowuje bazę **Stage 12C66C6C2** tak, aby silnik Babylon.js nie znał już nazw ani liczby plików obecnego budynku Berryboy.

Obecna przestrzeń działa jako pierwszy pakiet Venue:

- `venueId: berryboy-main`
- `versionId: v1`
- manifest: `venues/berryboy-main/versions/v1/manifest.json`

## Najważniejsza zmiana

Bootstrap ładuje i waliduje Venue Manifest **przed uruchomieniem ciężkiego silnika 3D**. Następnie tworzy `GalleryRuntimeContext`, a scena buduje jeden autorytatywny `Venue Runtime Registry`.

Silnik ładuje:

```text
manifest.assets[]
```

Nie zakłada już:

- czterech konkretnych plików GLB;
- konkretnych nazw plików;
- konkretnych nazw meshów;
- jednego układu stref, kolizji, spawnów i anchorów.

## Główne pliki D1

```text
src/runtime/venue-runtime.js
venues/schema/berryboy-venue-manifest.v1.schema.json
venues/berryboy-main/versions/v1/manifest.json
venues/_template/versions/v1/manifest.template.json
```

## Uruchomienie testów

```bash
npm run check
```

Pełny zestaw obejmuje:

- build i syntax;
- verifier Stage 12D1;
- test Venue Runtime;
- wszystkie testy regresji C6C2;
- Save Integrity;
- startup i popup;
- Unified Ground Collision;
- Sculpture Core;
- Inspect Isolation;
- AVIF i Atomic Media;
- mobile quality;
- canonical visual state;
- mobile memory survival.

## Ważne: diagnostyka C6C2 nadal aktywna

Mobile C6C2 tests are still active.
Collect DBG FREEZE and LAST SESSION screenshots.
Return to memory analysis after enough reports are collected.
After diagnostics are complete, remove the DBG panel and all related code physically.
Do not only disable or hide it.

Panel DBG, jego snapshoty i mechanizmy stabilizacji pamięci nie zostały usunięte ani ukryte.

## Status walidacji

Automatyczny zestaw testów przechodzi. W środowisku roboczym nie udało się wykonać pełnego renderowanego testu Chromium, ponieważ dostępny headless Chromium nie potrafił zainicjalizować EGL/WebGL. Dlatego paczka nadal wymaga testu wizualnego i mobilnego na realnym urządzeniu/przeglądarce.
