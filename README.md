# Exhibition Platform — Stage 12C66C6C7C8B

## Admin Workspace / Multi-Exhibition

Baza: **Stage 12C66C6C7C8 — Space / Exhibition Split + Multi-Exhibition**.

Ten etap przenosi zarządzanie wystawami **poza scenę 3D**. Silnik nadal edytuje zawartość aktywnej wystawy, ale lista wystaw, tworzenie, przełączanie i metadane są obsługiwane przez osobny `admin.html`.

### Co się zmieniło

- Dodano osobny `admin.html` z układem: lista wystaw + dane wystawy + mniejszy viewport 3D.
- Po zalogowaniu z publicznej strony użytkownik jest kierowany do Admin Workspace.
- Editor 3D nie zawiera już sekcji **EXHIBITIONS** — panel sceny służy tylko do edycji aktywnej wystawy.
- Admin Workspace pozwala tworzyć i przełączać wystawy bez przeładowywania obecnego Space.
- Każda wystawa ma edytowalne: `name`, `description`, `is_published`, `sort_order` oraz poster/cover.
- Poster jest zapisywany w Storage pod `<storage_prefix>/branding/posters/` i jego ścieżka trafia do `gallery_exhibitions.cover_path`.
- `slug`, `space_id` i Storage prefix pozostają kontrolowane przez istniejący system C6C7/C6C8.
- Silnik udostępnia programowe API dla Admin Workspace: przełączanie wystawy, aktualizacja metadanych i włączanie Edit Mode.
- `?exhibition=<id>` nadal działa i zostaje przygotowane pod późniejszy publiczny carousel/index.

### Supabase

**Jeżeli uruchomiłeś już `01_STAGE_C6C7_C6C8_MULTI_EXHIBITION.sql`, ten etap nie wymaga nowych kolumn ani tabel.**

Możesz opcjonalnie uruchomić:

`SUPABASE_SQL/03_STAGE_C6C7_C6C8B_ADMIN_WORKSPACE.sql`

To bezpieczny schema guard — niczego nie przebudowuje, tylko sprawdza czy pola wymagane przez Admin Workspace istnieją.

### Test ręczny

1. Otwórz `index.html` i zaloguj się — powinno przekierować do `admin.html`.
2. W Admin Workspace sprawdź listę wystaw i mniejszy viewport 3D.
3. Utwórz nową wystawę i przełączaj się między nią a `Main Exhibition`.
4. Ustaw nazwę, opis, kolejność, publikację oraz poster i zapisz metadane.
5. Dodaj różne artworki do dwóch wystaw, zapisz sceny i sprawdź ponowne przełączanie.

### Walidacja

`npm run check`

Uruchamia aktualny verifier, wcześniejsze testy regresyjne, test Multi-Exhibition oraz nowy test Admin Workspace.
