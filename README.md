# Followyes Gallery V0_10

Paczka pod GitHub Pages zgodna ze starą strukturą repozytorium V0_8.

## Najważniejsze

- `index.html` importuje `src/Gallery_V0_10.js`.
- `src/Gallery_V0_10_WEB.js` jest zostawiony jako alias kompatybilności.
- Domyślny język strony to EN, ale przełącznik PL / EN działa i zapamiętuje wybór.
- Roadmapa zachowuje stary układ, dopisano tylko 3 nowe punkty.
- Zapis WEB zapisuje pełny stan V0_10:
  - ściany i kolory ścian,
  - obrazy: pozycja, rotacja, skala, metadata ściany,
  - postumenty / punkty obserwacji,
  - global lighting,
  - lighting presets,
  - wszystkie Local Lights: Spot / Point,
  - nowe lampy, pozycje, rotacje, kierunki,
  - enabled, color, intensity, range,
  - Spot Angle, Spot Blend,
  - targets: Floor / Walls / Ceiling / Artworks / Sculptures / Props,
  - groups i active group,
  - manualTransformOverride / gizmo transforms.

## Test po wrzuceniu

1. Zaloguj się jako edytor.
2. Zmień globalne światło.
3. Dodaj Spot i Point.
4. Przesuń / obróć lampę gizmo.
5. Zmień kolor, intensity, range, angle, blend i targety.
6. Dodaj lampy do grupy.
7. Kliknij `Save state`.
8. Odśwież stronę jako zwykły użytkownik.
9. Wczytana wersja powinna zawierać ten sam układ i światła.
