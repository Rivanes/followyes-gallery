# Exhibition Platform — Stage 12C66C6C8C1

## Runtime Lifecycle / Admin Transition Fix

- Save/Exhibition runtimes initialize before startup state preload, eliminating the empty-first-load Main Exhibition race after Viewer → Admin handoff.
- Public Viewer does not start editor dirty tracking and does not register an editor `beforeunload` warning.
- Viewer/Admin navigation handoff prefers the confirmed published Exhibition snapshot instead of incidental live Viewer runtime state.
- Admin preview hydration uses the intended desktop preview concurrency; automatic Full upgrades wait for Preview population unless Inspect explicitly requests Full.
- `PUBLIC PAGE` preserves the active Exhibition and clean Admin → Viewer navigation can reuse the short-lived state handoff.
- Persistent asset cache now uses a stable cache name and locally migrates previous stage cache entries instead of flushing them on every application stage.
- Cache statistics are throttled; Admin no longer rescans Cache Storage every 8 seconds.

## Asset Residency / Egress Guard

Baza: **C6C7/C6C8B1 — Public Viewer / Admin Edit Gate**.

Ten etap ogranicza powtarzające się pobieranie ciężkich assetów i automatyczne ładowanie wszystkich pełnych obrazów.

### Co się zmieniło

- Artwork zawsze startuje od lekkiego `Preview`.
- `Full` nie jest już automatycznie ładowany dla wszystkich obrazów na desktopie. Promocja do Full jest zależna od odległości, widoczności, aktywnej strefy i Inspect/Edit.
- Liczba jednocześnie rezydujących pełnych tekstur jest ograniczona także na desktopie.
- Po odejściu od obrazu runtime może wrócić do Preview, ale pobrany wcześniej plik pozostaje w trwałym cache przeglądarki.
- Dodano `asset-cache-sw.js`: publiczne GLB/AVIF/WebP/JPG/PNG/KTX2 ze Storage są cache-first i współdzielone między `index.html` i `admin.html`.
- Service Worker deduplikuje równoległe requesty tego samego URL.
- Viewer → Admin przekazuje aktywną wystawę i jej aktualny opublikowany stan przez krótki `sessionStorage` handoff, więc Admin nie musi od razu ponownie pobierać tego samego `gallery_state`.
- Przełączone już w tej sesji wystawy dostają in-memory state cache. Powrót A → B → A nie wymaga ponownego SELECT stanu, dopóki cache nie zostanie jawnie odświeżony lub strona nie zostanie przeładowana.
- Space nadal pozostaje załadowany podczas przełączania wystaw.
- `Save` zapisuje istniejący runtime; po zapisie nie następuje ponowne ładowanie sceny ani assetów.
- Nowe postery są przed uploadem zmniejszane do maks. 1400 px i kodowane jako WebP, zamiast wysyłania ciężkiego pliku źródłowego do przyszłej karuzeli.
- Admin Workspace pokazuje status `Asset delivery` z liczbą Full/Preview i wpisami trwałego cache.

### Ważne

Pierwsze pobranie konkretnego assetu nadal kosztuje transfer. Zysk pojawia się przy:

- oglądaniu tylko części dzieł z bliska,
- ponownym użyciu tego samego GLB/obrazu/ramy,
- przejściu Viewer ↔ Admin,
- ponownym wejściu do wcześniej otwieranej wystawy podczas tej samej sesji.

### Supabase

**C6C8C nie wymaga nowej migracji SQL.** Struktura C6C7/C6C8 pozostaje bez zmian.

W `SUPABASE_SQL/04_STAGE_C6C8C_NO_SQL_REQUIRED.sql` znajduje się tylko marker dokumentacyjny.

### Test ręczny

1. Otwórz publiczną wystawę i przejdź się po galerii. Dalekie obrazy powinny pozostawać Preview; Full ma pojawiać się dopiero przy podejściu/Inspect.
2. Otwórz Admin Workspace dla tej samej wystawy. Space i media mogą zostać zainicjalizowane ponownie w Babylonie, ale ciężkie URL-e powinny być obsługiwane z persistent browser cache zamiast ponownie ze Storage.
3. W Adminie przełącz `Main → Test → Main`. Drugi powrót do Main powinien użyć session state cache.
4. Wgraj duży poster i sprawdź status — zapisany plik powinien być zoptymalizowanym `.webp` do 1400 px.
5. `npm run check` musi przejść w całości.

## C6C8C1 / SQL

C6C8C1 **nie wymaga kolejnej migracji bazy danych**. `SUPABASE_SQL/05_STAGE_C6C8C1_NO_SQL_REQUIRED.sql` jest wyłącznie markerem kontrolnym.
