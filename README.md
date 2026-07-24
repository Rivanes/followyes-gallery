# Berryboy Art Gallery — Stage 12C66C6A1

## Inspect Transition Isolation / Compact Mobile Inspect UI

Baza: Stage 12C66C6A — Mobile Quality Foundation / Artwork Always Visible.

Ten etap izoluje przejazd kamery Inspect od asynchronicznych upgrade'ów tekstur i przebudowuje mobilny komponent Inspect bez zmiany desktopowego UI, kolizji, startupu, Local Lights ani Supabase.

### Najważniejsze zmiany

- Preview → Full jest operacją texture-only: nie zmienia geometrii, transformacji, bounds ani targetów światła obrazu.
- Full Texture nie dostaje priorytetu przed zakończeniem ruchu kamery.
- Upgrade pełnych tekstur pauzuje podczas TRANSITION, ruchu, joysticka, hold-drag, look i aktywnego dragu.
- TRANSITION posiada transitionId, watchdog 9 s oraz kontrolowany recovery do WALK.
- Joystick ma jednego właściciela widoczności i pozostaje ukryty w TRANSITION oraz INSPECT, również po VisualViewport/orientation refresh.
- Mobilny popup jest niższą kapsułą z wystającym avatarem oraz dwiema okrągłymi strzałkami bez widocznych etykiet Previous/Next.
- Mobilny safe-frame nie rezerwuje miejsca na ukryty joystick i korzysta z dolnej safe-area.

### Uruchomienie testów

```bash
npm run check
```

### Diagnostyka runtime

```js
BerryboyArtGalleryInspect.getDebug()
GalleryApp.getMobileQualityInspector()
```

Awaryjne zamknięcie Inspect:

```js
BerryboyArtGalleryInspect.close()
```

Plik login-disabled:

`Gallery_V0_11_STAGE12C66C6A1_INSPECT_TRANSITION_COMPACT_MOBILE_LOGIN_DISABLED.txt`
