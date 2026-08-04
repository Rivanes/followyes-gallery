# Berryboy Art Gallery

Platforma galerii 3D obsługująca wiele budynków (Venue), wiele wystaw, publiczną stronę, Viewer/Edytor Babylon.js oraz panel administracyjny.

## Struktura aplikacji

- `/` — publiczna strona i dynamiczne karty wystaw;
- `/gallery/` — Viewer i Edytor 3D;
- `/admin/` — panel zarządzania platformą;
- `/supabase/` — migracje i Edge Functions;
- `/venues/` — lokalne manifesty Venue;
- `/tests/` — testy regresji i architektury.

## Uruchomienie lokalne

Projekt wymaga serwera HTTP:

```bash
python -m http.server 8080
```

Następnie otwórz:

- `http://localhost:8080/`
- `http://localhost:8080/gallery/?exhibition=berryboy-main`
- `http://localhost:8080/admin/`

## Kontrola projektu

```bash
npm run check
```

Polecenie buduje silnik, sprawdza składnię, architekturę CMS, SQL i pełny zestaw regresji runtime.

## Wdrożenie

Do repozytorium GitHub należy skopiować **całą zawartość tego folderu**, razem z plikami ukrytymi `.nojekyll`, `.gitignore` i `.github/`. Instrukcje wdrożenia znajdują się w `docs/`.
