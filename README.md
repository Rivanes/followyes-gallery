# Berryboy Art Gallery — Stage 12C66C6C2

## Mobile Memory Survival / Tiered Artwork Residency

Baza: **Stage 12C66C6C1 — Canonical Visual State / Mobile Lighting & Reflection Parity**.

Celem tego etapu jest ustabilizowanie długiego zwiedzania galerii na telefonie bez powrotu do pustych ram i bez zmiany kanonicznego oświetlenia, odbić ani kolorystyki względem wersji PC.

## Główne zmiany

### Warstwowa rezydencja artworków

- Każdy przypisany obraz zachowuje stale widoczny wariant Preview AVIF 768 px.
- Tylko kontrolowana liczba najważniejszych obrazów utrzymuje wariant Full Mobile AVIF 2048 px.
- Priorytet Full otrzymują: cel Inspect, Previous/Next, zaznaczone dzieło, obiekty widoczne w kadrze, aktualna strefa i najbliższe obrazy.
- Po utracie priorytetu Full jest atomowo zastępowany Preview, a pełna tekstura zostaje zwolniona.
- Rama nie jest wyłączana i nigdy nie pozostaje pusta.

Budżety startowe:

- Mobile High: 8 Full; w osadzonej przeglądarce maksymalnie 5.
- Mobile Balanced: 6 Full; w osadzonej przeglądarce maksymalnie 5.
- Mobile Safe: 4 Full; w osadzonej przeglądarce maksymalnie 4.

### Czyszczenie pamięci sceny

- Streamowane modele są usuwane ze wszystkich rejestrów casterów i receiverów cieni przed disposalem.
- Rejestry cieni są czyszczone z nieaktualnych oraz dispose’owanych wpisów.
- Nieaktywne mobilne generatory cieni Spot są rzeczywiście dispose’owane.
- Po wyłączeniu SSAO zwalniany jest pipeline, Geometry Buffer i jego render targety.
- Monitor Tour Order nie wykonuje cyklicznych obliczeń w Viewer Mode.

### Mobilna diagnostyka bez konsoli

Na telefonie w prawym górnym rogu pojawia się przycisk **DBG**. Panel oferuje:

- **LIVE** — aktualne dane,
- **FREEZE** — zatrzymany snapshot do wykonania screena,
- **LAST** — ostatni zapis poprzedniej sesji,
- **CLOSE** — zamknięcie panelu.

Snapshot pokazuje między innymi profil, FPS, render buffer, liczbę Preview/Full, szacowaną pamięć artworków, kolejki, modele, tekstury, materiały, meshe, shadow registry, generatory cieni, SSAO i Geometry Buffer. Lekki snapshot jest zapisywany do localStorage co 2,2 sekundy oraz przy `pagehide`/ukryciu strony.

## Zachowana zgodność wizualna

Stage C6C2 nie zmienia kanonicznych ustawień:

- Hemispheric i Directional Light,
- `scene.environmentIntensity`,
- odbić podłogi, ścian i sufitu,
- roughness materiałów,
- kolorów Local Lights,
- ustawień zapisanych w `gallery_state`.

Dalsze artworki mogą być chwilowo wyświetlane jako Preview 768 px zamiast Full 2048 px, ale pozostają widoczne. Obrazy w bieżącym kadrze i Inspect są promowane do Full.

## Diagnostyka programistyczna

```js
BerryboyMobileSurvival.getSnapshot()
BerryboyMobileSurvival.getLastSession()
BerryboyMobileSurvival.open()
BerryboyMobileSurvival.enforceResidency()

BerryboyArtGalleryMobileQuality.getSurvivalSnapshot()
BerryboyArtGalleryMobileQuality.openSurvivalPanel()
```

## Testy

```bash
npm run check
```

Testy automatyczne sprawdzają strukturę i zachowanie systemów, ale potwierdzenie braku zamknięcia strony wymaga długiego testu na rzeczywistych telefonach i osadzonych WebView.
