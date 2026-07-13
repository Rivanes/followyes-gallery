# Berryboy Art Gallery V0.11 — Stage 12C63

## Full Fast Start Architecture

Stage 12C63 przebudowuje start galerii z modelu „załaduj wszystko i dopiero pokaż” na progresywne uruchamianie.

### Co blokuje pierwsze wejście

Tylko krytyczny shell galerii:

- `Models/Floor_segment.glb`
- `Models/Wall_segments.glb`
- `Models/Ceiling.glb`

`Props.glb`, obrazy, pełne tekstury, modele rzeźb, cienie lokalne i ciężki retarget lamp są wykonywane po pierwszym renderze.

### Najważniejsze zmiany

- Props nie jest częścią licznika blokującego viewer.
- Usunięto sztuczne opóźnienia startowe 1500 ms + 500 ms + 650 ms.
- Loader nie uznaje wolnego requestu za błąd po 30 sekundach i nie uruchamia duplikatu tego samego GLB.
- Krytyczne GLB mają retry wyłącznie po prawdziwym błędzie importu.
- Normalne telefony pobierają floor/wall/ceiling równolegle; sekwencyjny import zostaje tylko dla urządzeń z małą pamięcią.
- Stan Supabase jest pobierany równolegle z geometrią.
- Obrazy są odtwarzane progresywnie: lekki wariant `preview`, następnie pełna wersja w kolejce tła.
- Obrazy najbliżej kamery mają pierwszeństwo.
- Modele rzeźb są odraczane i ładowane pojedynczo.
- Powtarzające się modele 3D korzystają z cache `AssetContainer` i nie muszą być ponownie pobierane oraz parsowane dla każdego slotu.
- Tekstury palety ścian nie są pobierane w publicznym viewerze, dopóki kolor nie jest rzeczywiście używany albo edytor się nie zaloguje.
- Publiczny bootstrap jest oddzielony od modułu logowania/edycji. `gallery-editor-bootstrap.js` ładuje się dopiero po żądaniu logowania lub dla istniejącej sesji edytora.
- Produkcja używa zminifikowanego `Gallery_V0_11.min.js`; pełny czytelny kod pozostaje w `Gallery_V0_11.js`.

### Startup Light Restore

Każda lampa zapisuje teraz:

- `targetMeshNames`
- `targetSegmentNames`

Po ponownym uruchomieniu `includedOnlyMeshes` jest odtwarzane bez pełnego skanowania helper-ray. Starszy stan bez tych pól nadal działa, ale wykona jeden fallback retarget w tle.

**Po pierwszym uruchomieniu Stage 12C63 zaloguj się jako edytor i zapisz stan galerii jeden raz.** Następne uruchomienia będą mogły używać bezpośredniego restore targetów lamp.

### Debug

W konsoli:

```js
BerryboyArtGalleryLoading.getDebug()
BerryboyArtGalleryFastStart.getDebug()
```

Najważniejsze pola:

- `viewerReadyAt`
- `deferredArtworkLoads`
- `deferredModelLoads`
- `directLightTargetRestores`
- `fallbackLightRetargets`
- `backgroundFinalizationRuns`

### Uruchomienie lokalne

```bash
python3 -m http.server 8000
```

Następnie otwórz `http://localhost:8000`.
