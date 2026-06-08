# Gallery V0_7

Minimalna strona testowa pod GitHub Pages, która uruchamia aktualną wersję galerii Babylon.js.

## Pliki

- `index.html` — główna strona z canvasem Babylon.js.
- `src/Gallery_V0_7.js` — aktualny kod galerii.
- `.nojekyll` — wyłącza przetwarzanie Jekyll na GitHub Pages.

## Uruchomienie lokalne

Najprościej uruchomić lokalny serwer HTTP w katalogu projektu:

```bash
python3 -m http.server 8000
```

Potem wejść w przeglądarce:

```text
http://localhost:8000
```

Nie otwieraj `index.html` bezpośrednio z dysku przez `file://`, bo moduły JavaScript i ładowanie assetów mogą wtedy nie działać poprawnie.

## Publikacja na GitHub Pages

1. Utwórz nowe repozytorium na GitHub, np. `gallery`.
2. Wrzuć zawartość tego folderu do repozytorium.
3. Wejdź w `Settings` → `Pages`.
4. Wybierz `Deploy from a branch`.
5. Branch: `main`.
6. Folder: `/root`.
7. Zapisz ustawienia.

Po chwili strona będzie dostępna pod adresem w stylu:

```text
https://twoj-login.github.io/gallery/
```

## Aktualny status wersji

```text
Gallery_V0_7
```

Funkcja 7 — wyrównywanie obrazów — zamknięta i w trakcie testów.
