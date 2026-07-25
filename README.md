# Berryboy Art Gallery — Stage 12C66C6C1

## Canonical Visual State / Mobile Lighting & Reflection Parity

Baza: **Stage 12C66C6C — Atomic AVIF Media Lifecycle / Mobile Scene Quality Parity**.

Ten etap naprawia regresję, w której mobilny profil jakości wielokrotnie mnożył zapisane ustawienia odbić przez `reflectionScale`. W efekcie podłoga, ściany i sufit mogły otrzymywać tylko kilka procent kanonicznej odpowiedzi środowiskowej, a mobilny runtime mógł później trafić do `gallery_state`.

### Główne zmiany

- `normalizeVisualSettings()` jest ponownie czystym sanitizerem danych.
- `visualCurrentSettings` przechowuje wyłącznie stan kanoniczny, wspólny dla PC i mobile.
- `deriveRuntimeVisualSettings()` tworzy jednorazową reprezentację runtime dla bieżącego profilu.
- Profile High/Balanced/Safe mogą ograniczać Bloom, SSAO i Vignette, ale nie skalują odbić ani `environmentIntensity` materiałów.
- Przełączanie Safe → Balanced → High → Safe nie kumuluje mnożników.
- Snapshot, localStorage i Supabase zapisują tylko ustawienia kanoniczne.
- Messenger i inne embedded browsers nie startują w Safe wyłącznie z powodu nazwy przeglądarki; startują od Balanced, chyba że urządzenie ma realny sygnał low-memory/low-CPU.
- `adaptToDeviceRatio` w bootstrapie jest wyłączone; mobilny DPR i render buffer mają jednego właściciela w silniku galerii.
- VisualViewport jest normalizowany w `index.html` do jednego zdarzenia `gallery-mobile-viewport-change`.

### Diagnostyka

```js
GalleryApp.getCanonicalVisualStateDebug()
GalleryApp.getVisualSettings()
GalleryApp.getVisualRuntimeSettings()
GalleryApp.getVisualReflectionDebug()
GalleryApp.getMobileQuality()
GalleryApp.setMobileQualityInspectorVisible(true)
```

W poprawnym stanie wartości `canonical` i `runtime` dla:

- `reflectionStrength`,
- `floorReflectionStrength`,
- `wallReflectionStrength`,
- `ceilingReflectionStrength`

muszą być identyczne niezależnie od profilu mobilnego.

### Uruchomienie testów

```bash
npm run check
```

Testy automatyczne nie zastępują porównania tego samego kadru na PC i telefonie.
