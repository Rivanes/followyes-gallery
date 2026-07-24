# Berryboy Art Gallery — Stage 12C66C4

**Sculpture Ownership / Selection / Runtime / Collision Rebuild**

Baza: **Stage 12C66C3**. Zakres został ograniczony do rdzenia rzeźb/modeli 3D. Popup, startup, marker podłogi, Local Lights, Save Integrity, Inspect, Mobile UI i układ Edit Mode nie zostały przeprojektowane.

## Najważniejsze zmiany

- każdy slot rzeźby ma trwały `slotId`, zapisywany w `gallery_state`;
- meshe GLB, placeholder, runtime root i collider wskazują ownera przez `slotId` oraz bezpośrednią referencję runtime;
- nazwa `ArtSphere_*` jest tylko nazwą pomocniczą, a nie głównym kluczem ownera;
- jeden autorytatywny selection state zarządza zaznaczeniem, primary i reference;
- stare pola `selectedSphere`, `activeModel3dSlot`, `primarySculpture` itd. są synchronizowanymi aliasami kompatybilności;
- dwuklik Inspect nie kasuje już aktywnego slotu używanego przez drag i transformacje;
- usunięcie slotu czyści selection, runtime, collider i centralny rejestr;
- każdy import GLB ma własną generację; spóźniony import jest odrzucany i usuwany;
- starsza nieudana podmiana nie może przywrócić modelu ponad nowszą operację;
- duplikowanie czeka na zakończenie ładowania modelu;
- duplikat szuka wolnego miejsca na podstawie rzeczywistego footprintu, ścian i wszystkich rzeźb;
- collider jest rejestrowany przez `slotId`, przechowuje stabilne world bounds i jest używany bezpośrednio przez wspólny resolver ruchu;
- ruch Viewer/Edit walk sprawdza kolizję przed przesunięciem i obsługuje sliding X/Z;
- drag, paste, duplicate i transform natychmiast ustawiają dirty state;
- diagnostyka: `GalleryApp.getSculptureCoreDebug()`.

## Weryfikacja

```bash
npm run check
```

Automatyczne testy obejmują build, składnię, Save Integrity, startup, ochronę oryginalnego popupu, funkcje Etapu 3 oraz nowy kontrakt Sculpture Core.

Test na rzeczywistych modelach GLB, prawdziwym Supabase i fizycznych urządzeniach nadal wymaga wykonania checklisty manualnej.
