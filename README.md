# Exhibition Platform — C6C8C5

**Exhibition Residency / Zero-Reload Mode Transition / Storage Network Diagnostics**

C6C8C5 keeps the current Space resident, parks recently visited same-Space Exhibition layers in Babylon RAM/GPU, resumes them without rebuilding artwork/sculpture objects, and measures local-cache vs Storage-network delivery through the Service Worker. Admin ↔ Public same-runtime transitions are UI/mode changes only.

No new SQL migration is required for C6C8C5. Existing `SUPABASE_SQL` files are preserved.

# Previous stage — C6C8C4 Space Residency / Exhibition Delta Switch

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

W C6C8C5 ten mechanizm jest rozszerzony: pierwszy cold switch używa `same-space-delta-load`, a powrót do zaparkowanej warstwy używa `resident-layer-resume`.

## Cache Space GLB

Zasady C6C8C3 zostają bez zmian. `src/config/gallery-space-config.js` ma jawne `version` dla Space i jego assetów. Podmiana fixed-path GLB wymaga zwiększenia odpowiedniej wersji, bez czyszczenia całego persistent cache.

## Supabase

**C6C8C4 nie wymaga nowego SQL.** Nadal obowiązuje migracja `SUPABASE_SQL/04_RUNTIME_HYGIENE_PUBLICATION_POLICIES.sql` z C6C8C3.

## Weryfikacja

```bash
npm run check
```

Pełny check obejmuje dotychczasowe regresje oraz `test:space-residency`.
