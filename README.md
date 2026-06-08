# Followyes Gallery V0_8

Wersja strony z:

- headerem,
- logowaniem edytora przez Supabase,
- ukrytym panelem edycji dla niezalogowanych,
- odczytem stanu galerii z tabeli `gallery_state`,
- zapisem stanu galerii do Supabase przyciskiem `Zapisz stan`.

## Pliki

- `index.html`
- `src/Gallery_V0_8.js`
- `.nojekyll`
- `package.json`
- `README.md`

## Supabase

Projekt używa:

```text
https://bazbszvhoxmuekxahokc.supabase.co
```

oraz publishable key w `index.html`.

Nie wolno dodawać do frontendu Secret key, Service role key ani database password.

## Konto edytora

Konto edytora należy dodać ręcznie w Supabase:

```text
Authentication -> Users -> Add user
```

Na stronie nie ma publicznej rejestracji.
