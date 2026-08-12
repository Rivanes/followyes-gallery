# Exhibition Platform — C6C8C4 Space Residency / Exhibition Delta Switch

C6C8C4 porządkuje przełączanie wystaw wewnątrz tego samego `space_id` bez ponownego przygotowywania budynku.

## Główna zasada

Jeżeli dwie wystawy używają tego samego `space_id`, warstwa **Space pozostaje rezydentna**:

- Floor / Walls / Ceiling / Props nie są ponownie importowane,
- statyczne kolizje budynku nie są przebudowywane przy każdym switchu,
- cache world-bounds i segmentów Space nie jest czyszczony tylko dlatego, że zmienił się artwork/rzeźba,
- nie wykonujemy już pełnego `resetGalleryRuntimeToBlankExhibition()` dla same-space switch.

Zmienia się wyłącznie warstwa Exhibition: artworky, rzeźby, Local Lights, wall presentation, lighting/visual state i dane wystawy. Globalne zależności są odświeżane **raz po zakończeniu delta switch**, zamiast wielokrotnie w trakcie reset/apply.

## Viewer ↔ Admin

Same-runtime Admin dalej używa tego samego Babylon `engine` i `scene`. Wejście do Edit Mode nie przebudowuje już Tour bezwarunkowo — jeśli roster/pozycje/order się nie zmieniły, istniejący Tour zostaje użyty.

## Diagnostyka

`GalleryApp.exhibitions.getDebug()` pokazuje m.in.:

- `sameSpaceSwitchCount`,
- `fullRuntimeResetCount`,
- `lastSwitchMode`,
- `lastSwitchDurationMs`,
- `lastSwitchFromId` / `lastSwitchToId`.

Dla przejścia pomiędzy wystawami w `main-space` oczekiwany `lastSwitchMode` to `same-space-delta`.

## Cache Space GLB

Zasady C6C8C3 zostają bez zmian. `src/config/gallery-space-config.js` ma jawne `version` dla Space i jego assetów. Podmiana fixed-path GLB wymaga zwiększenia odpowiedniej wersji, bez czyszczenia całego persistent cache.

## Supabase

**C6C8C4 nie wymaga nowego SQL.** Nadal obowiązuje migracja `SUPABASE_SQL/04_RUNTIME_HYGIENE_PUBLICATION_POLICIES.sql` z C6C8C3.

## Weryfikacja

```bash
npm run check
```

Pełny check obejmuje dotychczasowe regresje oraz `test:space-residency`.
