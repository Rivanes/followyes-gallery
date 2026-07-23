# Berryboy Art Gallery — Stage 12C66B2R

Etap naprawczy łączący **1R** i **2R**, wykonany ponownie na bazie Stage 12C66A1. Odrzucone paczki 12C66B i 12C66B1 nie są bazą tej wersji.

## 1R — integralność zapisu

- Stare zasoby wykorzystywane przez `main_previous` są chronione przed cleanupem.
- Kolejka usunięcia pozostaje aktywna i może usunąć zasób dopiero po kolejnym poprawnym zapisie, gdy backup zostanie obrócony.
- Uploady wersji roboczej są rejestrowane. Pliki nieużyte przez opublikowany stan trafiają do bezpiecznej kolejki cleanup po poprawnym zapisie.
- Zdalny backup nie używa już `upsert(... onConflict: "id")`; wykonuje kontrolowany `select → update/insert`, bez kasowania rekordów.
- Dirty-state ma natychmiastowe oznaczanie przy operacjach edycyjnych oraz wolniejszy, pięciosekundowy fallback.
- Produkcyjny `Gallery_V0_11.min.js` jest generowany przez powtarzalny build i jest realnie mniejszy od źródła.

## 2R — poprawny startup

- Babylon.js, loader GLB, moduł silnika, Engine i scena 3D nie uruchamiają się przed kliknięciem **Enter gallery / Uruchom galerię**.
- Sprawdzenie sesji edytora działa równolegle i nie może zablokować publicznego startu galerii, gdy autoryzacja jest wolna albo niedostępna.
- Zachowany jest zaakceptowany wygląd ekranu wejścia i ładowania ze Stage 12C66B; usunięta została wyłącznie jego zastępcza instrukcja po załadowaniu.
- Podczas ładowania działa osobny ekran z neutralnymi czasoumilaczami.
- Ekran oczekuje na prawdziwy sygnał `gallery-interaction-ready`, a nie pierwszą klatkę ani wczesne `gallery-ready`.
- Po gotowości sceny pojawia się dokładnie oryginalny popup instruktażowy ze Stage 12C66A1. Jego HTML, CSS, animacje, teksty i zachowanie są chronione testem hash.
- Komunikaty techniczne domyślnie trafiają do kanału edytora. Są wyświetlane tylko zalogowanej osobie znajdującej się faktycznie w Edit Mode.
- Publiczny błąd nie pokazuje stack trace ani nazw technicznych etapów.

## Build i testy

```bash
npm run check
```

Polecenie generuje wersję produkcyjną i TXT login-disabled, sprawdza składnię, chronione kontrakty Stage 12C65E/Inspect, bezpieczeństwo zapisu, startup, oryginalny popup oraz walidację obrazów.

## Ważne

Testy automatyczne nie zastępują manualnego sprawdzenia na prawdziwym Supabase i urządzeniach. Lista testów znajduje się w `STAGE12C66B2R_TEST_CHECKLIST.txt`.
