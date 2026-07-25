# Berryboy Art Gallery — Stage 12C66C6C

## Atomic AVIF Media Lifecycle / Mobile Scene Quality Parity

Stage 12C66C6C zamyka serię C6 na bazie potwierdzonego Stage 12C66C6B1.

Najważniejsze zmiany:

- jeden atomowy pipeline dla uploadu, podmiany, importu URL, usuwania artworków oraz zdjęć autorów;
- aktywny stan zmienia się dopiero po utworzeniu i zweryfikowaniu kompletnego zestawu Original + Desktop/Mobile/Preview AVIF;
- błąd zapisu przywraca poprzedni obraz lub zdjęcie autora;
- spóźniona operacja nie może nadpisać nowszego uploadu;
- poprzednie pliki trafiają do cleanupu dopiero po potwierdzonym zapisie stanu;
- jednorazowy kokpit migracyjny C6B został usunięty z aktywnego UI;
- zostały dwa narzędzia: **REPAIR MEDIA** oraz **AUDIT & CLEAN MEDIA**;
- cleanup ponownie skanuje stan tuż przed usunięciem i kasuje tylko przecięcie plików wcześniej pokazanych oraz nadal nieużywanych;
- mobilna jakość została rozdzielona na domeny: render, cienie, światła, post-processing oraz streaming;
- poprawiono semantykę `hardwareScalingLevel` i dodano jeden właściciel rozdzielczości renderowania;
- artwork pozostaje w pełnej jakości Mobile AVIF i nie jest degradowany przez chwilowy spadek FPS;
- aktywne `null LOD` zostało usunięte, a propsy otrzymały ochronę frustum i czas łaski;
- aktualnie widoczne artworki mogą ukończyć Preview → Full także podczas ciągłego spaceru, bez naruszania izolacji przejścia Inspect.

## Uruchomienie kontroli

```bash
npm run check
```

## Najważniejsza diagnostyka runtime

```js
GalleryApp.getAtomicMediaDebug()
GalleryApp.auditMedia()
GalleryApp.repairMedia()
GalleryApp.getMobileQuality()
GalleryApp.getMobileQualityInspector()
```

Pełna ocena wizualnej zgodności PC i mobile wymaga testu na rzeczywistych telefonach. Testy automatyczne w paczce sprawdzają architekturę, kolejność commitów, rollback, zabezpieczenia cleanupu, profile jakości i regresje zamrożonych systemów.
