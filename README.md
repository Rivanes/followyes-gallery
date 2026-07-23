# Berryboy Art Gallery — Stage 12C66C / Etap 3

Stage 12C66C powstał bezpośrednio na naprawionej bazie **12C66B2R**. Zachowuje integralność zapisu, startup uruchamiany dopiero po kliknięciu, neutralne czasoumilacze oraz oryginalny popup instruktażowy.

## Zakres Etapu 3

- Bezpieczne rozróżnianie draftów i kolejek Storage pomiędzy kartami przeglądarki.
- Potwierdzenie runtime, że oryginalny popup instruktażowy rzeczywiście pojawił się po `gallery-interaction-ready`.
- Ekranowy D-pad na PC: przód, tył, obrót w lewo i w prawo, z ruchem podczas przytrzymania.
- Subtelny pierścień kursora widoczny tylko na powierzchni podłogi.
- Mobilne zabezpieczenia long-press oraz gest: krótki drag obraca kamerę, przytrzymanie przełącza drag w tymczasowy joystick.
- Cztery główne sekcje Edit Mode: Exhibits, Space, Lighting i Settings.
- Jeden istniejący przycisk Save przeniesiony do stałego dolnego paska Edit Mode.
- Stany zapisu: wszystko zapisane, niezapisane zmiany, zapisywanie, zapisano i błąd.
- Ostrzeżenia przed opuszczeniem Edit Mode, wylogowaniem i zamknięciem karty z niezapisanymi zmianami.
- Naprawiony istniejący collider proxy rzeźb; działa w Viewer Mode i podczas zwykłego chodzenia w Edit Mode, a świadomy `Space` fly mode może go ominąć.
- Usunięte równoległe ścieżki: drugi techniczny loader, stare wejścia do Light Mode i nagłówkowa akcja Save.

## Chronione elementy

Oryginalny popup instruktażowy nie został przeprojektowany. Testy blokują zmianę jego dwóch kluczowych funkcji za pomocą hashy SHA-256.

## Build i testy

```bash
npm run check
```

Polecenie:

1. buduje prawdziwy plik produkcyjny `Gallery_V0_11.min.js`,
2. generuje TXT z logowaniem wyłączonym,
3. sprawdza składnię,
4. uruchamia verifier kontraktów,
5. testuje integralność zapisu,
6. testuje startup i oryginalny popup,
7. testuje limity obrazów,
8. testuje systemy Etapu 3.

## Ważne

Testy automatyczne nie zastępują manualnego sprawdzenia na prawdziwym Supabase oraz fizycznych urządzeniach z Androidem i iOS. Szczegółowa lista znajduje się w `STAGE12C66C_TEST_CHECKLIST.txt`.
