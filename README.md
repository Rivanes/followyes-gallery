# Followyes Gallery V0_10 WEB

Wersja strony zgodna ze starą strukturą repozytorium V0_8, ale z aktualnym silnikiem `Gallery_V0_10_WEB.js`.

## Pliki

- `index.html`
- `src/Gallery_V0_10_WEB.js`
- `src/Gallery_V0_8.js` i `src/Gallery_V0_7.js` zostają jako archiwalne wersje referencyjne
- `.nojekyll`
- `package.json`
- `README.md`

## Co zmieniło się względem V0_8

- strona domyślnie startuje po angielsku,
- header ma przycisk `Explore below`, który przewija do sekcji pod galerią,
- roadmapa jest dalej w `index.html`,
- `index.html` importuje `./src/Gallery_V0_10_WEB.js`,
- zapis online używa pełnego `FollowyesGalleryWebState`,
- zapisywane są też nowe elementy V0_10: global lighting, Local Lights, targets, groups i transformy gizmo,
- lokalny zapis stanu galerii nie jest głównym flow wersji WEB.

## Supabase

Projekt używa tabeli:

```text
public.gallery_state
```

Rekord główny:

```text
id = main
```

Kolumna ze stanem:

```text
state
```

Nie wolno dodawać do frontendu Secret key, Service role key ani database password.

## Konto edytora

Konto edytora należy dodać ręcznie w Supabase:

```text
Authentication -> Users -> Add user
```

Na stronie nie ma publicznej rejestracji.
