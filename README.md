# Berryboy Art Gallery V0.11 — Stage 12C63A

## Balanced Ready Gate

Stage 12C63A poprawia zbyt agresywne wpuszczanie użytkownika z wersji 12C63.
Galeria nadal startuje progresywnie, ale użytkownik nie może rozpocząć chodzenia, kiedy widoczne elementy sceny dopiero się pojawiają.

### Co blokuje wejście

Przed ukryciem loadera muszą zostać przygotowane:

- podłoga, ściany i sufit,
- stan galerii z Supabase,
- `Props.glb` albo jego rzeczywisty błąd importu,
- wszystkie preview obrazów przypisanych w zapisanym stanie,
- wszystkie modele rzeźb przypisane do slotów,
- środowiskowa mapa oświetlenia,
- faktycznie używane tekstury kolorów ścian,
- bezpośredni restore targetów Local Lights,
- finalne lokalne cienie.

Po wejściu w tle mogą zostać wykonane wyłącznie jakościowe podmiany preview na pełne tekstury. Nie powinny już pojawiać się brakujące Props, obrazy ani rzeźby podczas chodzenia.

### Bezpieczeństwo startu

- Desktop: awaryjny limit bramki gotowości wynosi 30 sekund.
- Mobile: awaryjny limit wynosi 45 sekund.
- Limit nie anuluje ani nie duplikuje requestów. Zapobiega wyłącznie nieskończonemu czarnemu ekranowi przy uszkodzonym zewnętrznym zasobie.
- W normalnym uruchomieniu loader znika natychmiast po spełnieniu wszystkich warunków, bez czekania do końca limitu.

### Zachowane optymalizacje z 12C63

- brak sztucznego retry po 30 sekundach,
- równoległe ładowanie krytycznej geometrii,
- cache `AssetContainer` dla powtarzających się modeli,
- zapis i restore `targetMeshNames`,
- oddzielny bootstrap publicznego viewera i edytora,
- preview obrazów przed pełnymi teksturami,
- zminifikowany produkcyjny silnik.

### Debug

W konsoli:

```js
BerryboyArtGalleryLoading.getDebug()
BerryboyArtGalleryFastStart.getDebug()
```

Najważniejsze pola:

- `entryGateActive`
- `entryGateReady`
- `entryGateTimedOut`
- `entryGateElapsedMs`
- `entryGateLastSnapshot`
- `visibleTextures.pending`
- `artworkTextures.pendingCount`

### Ważne

Po wdrożeniu sprawdź konsolę po pierwszym wejściu. Gdy `entryGateTimedOut` ma wartość `false`, użytkownik został wpuszczony po pełnym przygotowaniu widocznej sceny.
