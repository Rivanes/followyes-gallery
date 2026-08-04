# Wdrożenie

## GitHub Pages

1. Skopiuj całą zawartość folderu `GITHUB_REPOSITORY` do głównego katalogu repozytorium.
2. Nie pomijaj folderów `.github`, `admin`, `gallery`, `src`, `supabase`, `tests`, `tools` ani `venues`.
3. W ustawieniach repozytorium włącz GitHub Pages dla właściwej gałęzi.
4. Sprawdź `/`, `/gallery/?exhibition=berryboy-main` i `/admin/`.

## Przed wdrożeniem

```bash
npm run check
```

## Supabase

Migracje znajdują się w `supabase/migrations`. Pełny, ręczny zestaw SQL z kolejnością uruchamiania znajduje się poza repozytorium w `PROJECT_ARCHIVE/SUPABASE_SQL`.
