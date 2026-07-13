# Berryboy Art Gallery V0.11 — Stage 12C63B

## Image-First Startup Queue

Stage 12C63B przebudowuje 12C63A tak, aby priorytetem startu były obrazy, a nie Props i rzeźby.

### Co zmienia się względem 12C63A

- prefetch preview obrazów startuje zaraz po preloadzie `gallery_state` z Supabase,
- preview obrazów pobierają się równolegle z `Floor`, `Wall` i `Ceiling`,
- loader przed wejściem pilnuje przede wszystkim gotowości preview obrazów, środowiska i świateł,
- `Props.glb` i modele rzeźb nie blokują już wejścia do galerii,
- po wejściu w tle dalej mogą kończyć się `Props`, rzeźby i pełne tekstury obrazów.

### Bramka wejścia

Użytkownik jest wpuszczany, gdy gotowe są:

- stan galerii z Supabase,
- shell sceny (podłoga, ściany, sufit),
- wszystkie preview obrazów ustawionych w zapisanym stanie,
- środowiskowe tekstury sceny,
- restore Local Lights i lokalnych cieni.

### Co dzieje się po wejściu

W tle pozostają:

- `Props.glb`,
- modele rzeźb,
- upgrade obrazów z preview do pełnej jakości.

### Prefetch obrazów

- desktop: do 6 preview obrazów równolegle,
- mobile: do 3 preview obrazów równolegle.

### Bezpieczeństwo startu

- Desktop: limit awaryjny bramki 30 s
- Mobile: limit awaryjny bramki 45 s

### Debug

W konsoli:

```js
BerryboyArtGalleryLoading.getDebug()
BerryboyArtGalleryFastStart.getDebug()
```

Nowe pola pomocnicze:

- `startupArtworkPrefetchCompleted`
- `startupArtworkPrefetchQueue`
- `startupArtworkPrefetchActiveCount`
