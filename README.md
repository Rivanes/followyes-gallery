# Exhibition Platform — C6C8C3 Runtime Hygiene / Cache Versioning

Aktualna baza rozwoju platformy wystaw po wdrożeniu Multi-Exhibition, Admin Workspace, Same-Runtime Admin i Egress Guard.

## Co porządkuje C6C8C3

- Public Viewer nie zapisuje się już jako aktywna karta edytora tylko dlatego, że administrator jest zalogowany.
- Heartbeat, dirty watcher i unload guard należą wyłącznie do aktywnego Admin Workspace.
- Wejście/wyjście z Admina przełącza również politykę Artwork Full/Preview bez tworzenia nowej sceny.
- Admin ma wspólną ochronę przed utratą zmian: stan sceny + formularz Exhibition Details.
- Zamknięty inline Admin zawiesza licznik Asset Delivery, ResizeObserver i metadata unload guard; `resume` włącza je ponownie.
- Fixed-path Space GLB mają kontrolowaną wersję cache. Zmiana `version` w `src/config/gallery-space-config.js` powoduje jednorazowe pobranie nowego pliku bez czyszczenia całego cache.
- Ramki GLB dostają wersję delivery na podstawie metadanych Storage, więc podmieniona ramka nie powinna utknąć w starym persistent cache.
- `Main Exhibition` nie jest już specjalnym wyjątkiem publikacji. Publiczny Viewer widzi tylko wystawy oznaczone `is_published = true`.
- Jeśli żądana wystawa jest Draft, publiczny Viewer próbuje otworzyć pierwszą opublikowaną wystawę.
- `PUBLIC PAGE` ma wymuszony wygląd przycisku dla wszystkich stanów linku.

## Supabase — wymagany krok

Jeżeli Multi-Exhibition jest już zainstalowane, uruchom **tylko**:

`SUPABASE_SQL/04_RUNTIME_HYGIENE_PUBLICATION_POLICIES.sql`

Ten SQL synchronizuje publiczny dostęp `gallery_state` i Storage z `gallery_exhibitions.is_published`. Wspólne ramki `gallery-artworks/main/frames/*` pozostają publiczne.

## Cache Space GLB

W `src/config/gallery-space-config.js` każdy asset ma `version: 1`, a Space ma własne `version: 1`.

Jeżeli podmienisz np. `Wall_segments.glb` pod tą samą ścieżką, zwiększ tylko:

```js
walls: {
  fileName: "Wall_segments.glb",
  version: 2
}
```

Nie trzeba czyścić całego cache użytkownika.

## Pliki porządkowe

- `tools/build-current.mjs` — jedyny aktualny build.
- `tools/verify-current.mjs` — jedyny aktualny verifier.
- `ENGINE_LOGIN_DISABLED.txt` — generowany testowy engine bez login gate.
- historyczne testy regresyjne pozostają, ponieważ `npm run check` faktycznie je uruchamia.
- usunięto historyczne pliki SQL typu `NO_SQL_REQUIRED` oraz stare Stage-specific build/verifier.

## Weryfikacja

```bash
npm run check
```

Musi przejść pełny zestaw regresji oraz `test:runtime-hygiene`.
