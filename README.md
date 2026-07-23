# Berryboy Art Gallery — Stage 12C66A

## Etap 1: Save Integrity / Draft Commit / Deferred Storage Cleanup

Stage 12C66A zabezpiecza zapis galerii i pliki w Supabase Storage. Zmiany wykonane w edytorze pozostają wersją roboczą do chwili użycia istniejącego przycisku **Save state**. Ten etap nie przenosi jeszcze przycisku do panelu Edit Mode — to zakres późniejszej przebudowy UI.

## Najważniejsze zmiany

- usunięto automatyczne publikowanie zmian po uploadzie, podmianie, duplikowaniu i usuwaniu modeli lub ilustracji,
- wszystkie zmiany ustawiają stan roboczy `dirty`, który można odczytać przez `GalleryApp.getDraftStatus()`,
- stary plik nie jest usuwany podczas edycji,
- ścieżki starych plików trafiają do trwałej kolejki cleanup w `localStorage`,
- cleanup uruchamia się dopiero po poprawnym zapisie rekordu `gallery_state/main`,
- plik nadal używany przez zapisany stan nigdy nie jest usuwany,
- błąd zapisu pozostawia poprzedni stan i wszystkie pliki bez zmian,
- usunięto fallback `delete main + insert main`,
- zapis istniejącego rekordu jest atomowo warunkowany wartością `updated_at` odczytaną przed publikacją,
- pierwszy zapis używa bezpiecznego `insert`, a wyścig dwóch sesji nie przechodzi jako ciche nadpisanie,
- utworzenie albo usunięcie rekordu `main` w innej sesji również jest wykrywane jako konflikt,
- fingerprint stanu jest kanoniczny i odporny na zmianę kolejności kluczy JSONB,
- przed nadpisaniem zapisywana jest poprzednia wersja lokalnie i — best effort — w rekordzie `gallery_state/main_previous`,
- zapis wykrywa zmianę galerii wykonaną w innej sesji i blokuje ciche nadpisanie,
- podmiany modeli, ręczne URL-e ilustracji i zdjęć autorów również korzystają z odroczonego cleanup; nieudana podmiana modelu przywraca poprzedni model,
- wersja opublikowana i lokalny draft ustawień nie są już cicho mieszane przy starcie,
- dodano limity wejściowe dla ilustracji i zdjęć autorów przed pełnym dekodowaniem pliku.

## Kolejność bezpiecznego zapisu

1. Użytkownik wykonuje zmiany w wersji roboczej.
2. Nowy zasób może zostać wysłany do Storage, ale poprzedni zasób pozostaje dostępny.
3. Po kliknięciu Save odczytywana jest aktualna wersja `main`.
4. Sprawdzany jest konflikt z wersją bazową sesji.
5. Tworzona jest kopia poprzedniego stanu.
6. Istniejący `main` jest aktualizowany tylko wtedy, gdy `updated_at` nadal odpowiada wersji odczytanej przed zapisem; brakujący rekord jest tworzony przez `insert`.
7. Dopiero po sukcesie usuwane są nieużywane stare pliki.
8. Nieudany cleanup pozostaje w kolejce do kolejnej próby.

## Limity obrazów

### Ilustracje

- maksymalny plik: 24 MB,
- maksymalny bok: 10 000 px,
- maksymalna powierzchnia: 40 megapikseli.

### Zdjęcia autorów

- maksymalny plik: 12 MB,
- maksymalny bok: 8 000 px,
- maksymalna powierzchnia: 24 megapiksele.

Obsługiwane nagłówki wymiarów: JPEG, PNG, WebP i GIF. Dla innych poprawnych formatów obrazów używany jest kontrolowany fallback dekodowania w przeglądarce.

## Weryfikacja

```bash
npm run check
```

Polecenie:

1. regeneruje produkcyjny mirror i TXT z logowaniem wyłączonym,
2. sprawdza składnię,
3. uruchamia verifier kontraktów Stage 12C66A oraz chronionych systemów Stage 12C65E,
4. testuje kolejność backup → zapis → cleanup,
5. testuje brak usuwania plików po błędzie zapisu,
6. testuje konflikt równoległych sesji,
7. testuje limity i odczyt wymiarów obrazów.

## Pliki startowe

- `index.html` — wersja WWW, logowanie aktywne,
- `Gallery_V0_11_STAGE12C66A_SAVE_INTEGRITY_LOGIN_DISABLED.txt` — pełny silnik z logowaniem wyłączonym do testów,
- `src/Gallery_V0_11.js` — źródło silnika,
- `src/Gallery_V0_11.min.js` — w tym etapie kontrolowany, byte-identyczny mirror źródła.

Mirror nie jest jeszcze minifikowany. Celowo pozostaje identyczny ze źródłem, aby wykluczyć rozjazd dwóch wersji kodu. Prawdziwy, powtarzalny pipeline minifikacji należy do późniejszego etapu jakości/build.
