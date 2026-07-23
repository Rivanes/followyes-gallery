# Berryboy Art Gallery — Stage 12C66B1

## Etap 2: Single Startup Gate / Visitor Timefillers / Clean Public Status

Stage 12C66B1 powstaje na stabilnej paczce **12C66A1**. Zachowuje zabezpieczenia zapisu i Storage z Etapu 1 oraz hotfix blokujący latanie obserwatora za pomocą środkowego przycisku myszy i strzałek.

## Najważniejsze zmiany

### 1. Galeria nie uruchamia się automatycznie

Po wejściu na stronę widoczna jest warstwa informacyjna z przyciskiem uruchomienia galerii. Przed jego kliknięciem:

- nie jest pobierany Babylon.js,
- nie jest tworzony `BABYLON.Engine`,
- nie jest tworzona scena,
- nie rozpoczyna się ładowanie modeli galerii.

Lekki odczyt sesji Supabase może odbyć się wcześniej, aby nagłówek poprawnie pokazywał status logowania. Nie uruchamia to galerii 3D.

### 2. Jeden publiczny system startupu

Usunięto z normalnego flow dwie równoległe warstwy tworzone przez silnik:

- `customLoadingScreen`,
- silnikowy `berryboyViewerIntroOverlay`.

Całe wejście obsługuje teraz jeden `BerryboyBootGuard`:

1. ekran przed uruchomieniem,
2. czasoumilacze podczas ładowania,
3. krótkie objaśnienie sterowania,
4. wejście do gotowej galerii,
5. przyjazny ekran błędu.

### 3. Gotowość oparta na prawdziwej bramce

Ekran ładowania nie znika po pierwszej wyrenderowanej klatce. Zdarzenie `gallery-ready` jest wysyłane dokładnie raz dopiero po:

- załadowaniu krytycznej architektury,
- zastosowaniu zapisanego stanu,
- przygotowaniu krytycznych ilustracji i modeli bieżącej strefy,
- finalizacji kolizji, materiałów i Local Lights,
- przejściu stabilnych klatek rozgrzewkowych.

Dopiero wtedy odwiedzający może nacisnąć **Rozpocznij zwiedzanie**.

### 4. Czasoumilacze dla odwiedzających

Podczas oczekiwania wyświetlane są zmienne, nietechniczne komunikaty w języku polskim lub angielskim, np.:

- „Przygotowujemy przestrzeń do zwiedzania.”
- „Światło i prace zajmują swoje miejsca.”
- „Jeszcze moment — wystawa jest prawie gotowa.”

Nie są pokazywane nazwy plików, liczby lamp, Supabase, targety ani etapy pracy silnika.

### 5. Rozdzielenie komunikatów

`gallery-status` ma teraz kanały odbiorców:

- `visitor` — tylko przyjazne informacje potrzebne odwiedzającemu,
- `editor` — komunikaty edycji, uploadu i zapisu,
- `debug` — diagnostyka startupu i silnika.

Wszystkie istniejące komunikaty silnika domyślnie trafiają do `editor`. Odwiedzający nie widzi już toastów typu „Wczytano stan galerii. Lampy: X”. Diagnostyka startupu jest dostępna zalogowanemu edytorowi w konsoli.

### 6. Publiczne błędy bez stack trace

Odwiedzający widzi jedynie krótki komunikat i przyciski ponowienia. Stack trace, nazwy funkcji i szczegóły brakujących assetów pozostają w konsoli, a nie w publicznym interfejsie.

### 7. Sterowanie przed wejściem

Po osiągnięciu gotowości jedna warstwa pokazuje instrukcje dopasowane do urządzenia. Na PC zachowano wybór:

- środkowy przycisk myszy,
- prawy przycisk myszy.

Wybór zapisuje się w `localStorage` i jest stosowany przez silnik.

## Zachowane systemy

- Stage 12C66A — Save Integrity / Draft Commit / Deferred Storage Cleanup,
- Stage 12C66A1 — Viewer Grounded Keyboard Hotfix,
- Stage 12C65E — strefowy streaming critical → nearby → deferred,
- Adaptive Mobile Quality,
- mobilny HUD i Inspect safe-frame,
- Click-to-Inspect i trasa zwiedzania,
- Local Lights i bezpieczny rebuild targetów.

## Weryfikacja

```bash
npm run check
```

Polecenie:

1. regeneruje produkcyjny mirror i TXT z logowaniem wyłączonym,
2. sprawdza składnię wszystkich skryptów,
3. uruchamia verifier Stage 12C66B1 i chronionych systemów poprzednich etapów,
4. testuje maszynę stanów prestart → loading → ready → entry,
5. sprawdza brak automatycznego Babylon/scene startupu,
6. sprawdza brak technicznych komunikatów w publicznym kanale,
7. ponownie testuje bezpieczeństwo zapisu i limity obrazów z Etapu 1.

## Pliki startowe

- `index.html` — wersja WWW, logowanie aktywne,
- `Gallery_V0_11_STAGE12C66B1_SINGLE_STARTUP_CLEAN_VIEWER_LOGIN_DISABLED.txt` — pełny silnik z logowaniem wyłączonym do testów,
- `src/Gallery_V0_11.js` — źródło silnika,
- `src/Gallery_V0_11.min.js` — kontrolowany, byte-identyczny mirror źródła.

## Ręczny test wymagany

Automatyczne testy nie zastępują sprawdzenia na prawdziwym urządzeniu i połączeniu z Supabase. Przed publikacją trzeba ręcznie potwierdzić pełny startup, modele GLB, tekstury, światła oraz zachowanie na telefonie.


## Stage 12C66B1 UI correction

The accepted instructional popup design was restored inside the single page-owned startup gate. Animated WASD, mouse, joystick and artwork interaction instructions are visible before startup and again when the scene is ready. The old engine-owned duplicate popup remains removed.
