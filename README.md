# Berryboy Art Gallery — Stage 12C66C6C7C8

## Space / Exhibition Split + Multi-Exhibition

Baza: **Stage 12C66C6C6 — Artwork Frame Runtime Performance**, po wcześniejszym cleanupie paczki.

Ten Stage łączy C6C7 i C6C8: obecna fizyczna przestrzeń 3D zostaje oddzielona od danych wystawy, a Editor może tworzyć i przełączać wiele niezależnych wystaw w tej samej przestrzeni.

### Co się zmieniło

- Aktualne modele budynku nie są już wpisane bezpośrednio w loader sceny. Definicja obecnego Space znajduje się w `src/config/gallery-space-config.js`.
- `gallery_state` jest ładowany i zapisywany według aktywnego `exhibitionId`, zamiast stałego `main`.
- Dotychczasowa wystawa pozostaje jako `main` i zachowuje obecny `gallery_state/main` oraz `gallery-artworks/main/*`.
- Nowe wystawy dostają własny rekord `gallery_state` oraz Storage `gallery-artworks/exhibitions/<exhibitionId>/*`.
- Biblioteka ramek nadal jest wspólna: `gallery-artworks/main/frames/*`.
- Editor ma sekcję **EXHIBITIONS** z listą, tworzeniem i przełączaniem wystaw.
- Przełączenie wystawy czyści tylko runtime wystawy i przywraca bazowy stan tej samej przestrzeni 3D; Space nie jest przeładowywany.
- Startup obsługuje `?exhibition=<id>` — będzie to punkt wejścia dla karuzeli w kolejnym etapie.

### Supabase

Przy istniejącej bazie uruchom tylko:

`SUPABASE_SQL/01_STAGE_C6C7_C6C8_MULTI_EXHIBITION.sql`

Nie uruchamiaj `00_LEGACY_CURRENT.sql`, jeśli obecna konfiguracja już działa. Szczegóły są w `SUPABASE_SQL/README_FIRST.md`.

### Test ręczny

1. Po migracji SQL uruchom stronę i sprawdź istniejącą `Main Exhibition`.
2. Zaloguj się do Editora, otwórz **EXHIBITIONS** i utwórz nową wystawę.
3. Dodaj do niej kilka innych elementów i zapisz.
4. Przełącz z powrotem na `Main Exhibition` — jej stan powinien wrócić bez zmian.
5. Ponownie przełącz na nową wystawę — oba stany muszą pozostać całkowicie niezależne.

### Walidacja

`npm run check`

uruchamia aktualny verifier, wszystkie wcześniejsze testy regresyjne oraz test C6C7/C6C8 multi-exhibition.
