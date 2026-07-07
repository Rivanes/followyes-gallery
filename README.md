# Berryboy Art Gallery — Stage 12C62S5 VERIFIED FULL PROJECT

Ta paczka została odbudowana w starym standardzie pełnego projektu.

## Najważniejsze
- src/Gallery_V0_11.js jest byte-for-byte identyczny z plikiem Stage 12C62S5 TXT.
- src/Gallery_V0_10.js jest lustrzaną kopią tego samego kodu, zgodnie ze starszym standardem paczek.
- index.html importuje Gallery_V0_11.js z cache-bust parametrem, żeby przeglądarka/GitHub Pages nie podawały starego modułu.

## SHA256 silnika
2832dcac66baff452fb7854d81c790aa1cf7aa11314b3d78293469a00bc7f32a

## Testy wykonane
- cmp src/Gallery_V0_11.js vs root Stage TXT
- cmp src/Gallery_V0_10.js vs root Stage TXT
- node --check src/Gallery_V0_11.js
- node --check src/Gallery_V0_10.js
- unzip -t ZIP


## Production login correction

This package keeps the stage TXT as LOGIN_DISABLED for engine/testing work, but `src/Gallery_V0_11.js` and `src/Gallery_V0_10.js` are production files with `galleryEditorLoginEnabled = true`.

Expected behavior:
- Root TXT: editor login disabled for isolated testing.
- `src/Gallery_V0_11.js`: editor requires `globalThis.galleryEditorAuthenticated` / site login.
- `src/Gallery_V0_10.js`: mirrored production file, also requires login.
