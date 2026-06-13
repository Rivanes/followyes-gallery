# Followyes Gallery V0_10

Wersja z jednym plikiem silnika: `src/Gallery_V0_10.js`.

## Zakres tej paczki

Pierwszy etap naprawy zapisu WEB dla świateł:

- zapis pozycji istniejących lamp wygenerowanych przy obrazach/rzeźbach,
- zapis pozycji nowo dodanych Point Light,
- zapis pozycji nowo dodanych Spot Light,
- osobna warstwa `localLightPositions` w WEB state,
- restore pozycji wykonywany po odtworzeniu Local Lights i dodatkowo z opóźnieniem, żeby nie został nadpisany przez automatyczne ustawianie lamp ekspozycji.

## Test

Po wrzuceniu na GitHub:

1. Zaloguj się jako edytor.
2. Przesuń lampę istniejącą przy obrazie.
3. Dodaj nowy Point Light i Spot Light.
4. Przesuń je.
5. Kliknij `Save state`.
6. Odśwież stronę jako publiczny użytkownik.
7. Lampy powinny wrócić do zapisanych pozycji.
