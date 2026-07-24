# Berryboy Art Gallery — Stage 12C66C6B1

## Existing Author AVIF Reconciliation

Wąska poprawka Stage 12C66C6B. Odzyskuje już wygenerowane zestawy zdjęć autorów znajdujące się w Supabase Storage i przypisuje je do centralnej biblioteki `artworkAuthors`, bez ponownego kodowania AVIF.

### Główna zmiana

Przycisk **RECONCILE / BUILD AUTHOR AVIF**, walidacja i finalizacja najpierw:

1. skanują `main/authors/AVIFv1/Desktop`, `Mobile` i `Preview`;
2. grupują pliki po wspólnym `variantSetId`;
3. dopasowują je do oryginalnej ścieżki zdjęcia autora;
4. sprawdzają podpis każdego pliku AVIF;
5. aktualizują centralny rekord autora oraz wszystkie artworki i rzeźby tego autora;
6. dopiero dla naprawdę brakujących zestawów pozwalają uruchomić ponowne kodowanie.

Reconciliation nie kolejkuje ani nie usuwa starych WebP. Ich fizyczne usunięcie nadal odbywa się dopiero podczas zabezpieczonego **FINALIZE + REMOVE WEBP** po dwóch zapisach stanu.

### Najprostszy test

1. Kliknij **VALIDATE AVIF MIGRATION**. Walidacja automatycznie spróbuje odzyskać istniejące AVIF autorów.
2. Oczekiwany wynik: `Author AVIF: 16/16`, `Active WebP refs: 0`.
3. Następnie kliknij **FINALIZE + REMOVE WEBP**.
4. Po zakończeniu oczekiwane: `Storage WebP: 0`.

Jeżeli jakiś autor nadal pozostaje niekompletny, użyj **RECONCILE / BUILD AUTHOR AVIF**. System najpierw odzyska istniejące zestawy, a ponowne kodowanie zaproponuje wyłącznie dla faktycznie brakujących zdjęć.
