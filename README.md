# Berryboy Art Gallery — Stage 12C66C2

Wąska stabilizacja Stage **12C66C1** przed dalszym audytem Etapu 3. Zakres ograniczono do trzech zgłoszonych problemów — bez redesignu popupu, startupu, Edit Mode, zapisu, Inspect UI ani kolizji rzeźb.

## Poprawki

- Floor cursor jest spłaszczony, podniesiony ponad powierzchnię i ma depth bias, dzięki czemu nie powinien być przecinany przez sąsiednie lub nakładające się segmenty podłogi.
- Po rozpoczęciu podejścia Inspect kamera ma wyłączną kontrolę aż do końca animacji. Kliknięcie sceny, WASD, D-pad, joystick, touch-drag, Escape i przycisk Edit Mode nie mogą przerwać przejazdu.
- Usunięto cały automatyczny system wygaszania Local Lights zależny od kadru kamery oraz strefy streamingu. Lampa respektuje wyłącznie zapisane `Enabled` i `Intensity`.

## Build i testy

```bash
npm run check
```

Polecenie generuje produkcyjny plik minified, TXT z logowaniem wyłączonym i uruchamia verifier oraz testy Etapów 1–3.

Manualne sprawdzenie renderowania floor cursora, pełnego przejazdu Inspect i Local Lights w realnej scenie nadal jest wymagane. Lista znajduje się w `STAGE12C66C2_TEST_CHECKLIST.txt`.
