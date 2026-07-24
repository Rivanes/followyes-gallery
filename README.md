# Berryboy Art Gallery — Stage 12C66C6B

## AVIF Pipeline / Migration / WebP Removal

Baza: Stage 12C66C6A1.

Ten etap przebudowuje generator wariantów obrazów i zdjęć autorów z WebP na AVIF. Warianty są kodowane dopiero po świadomym uruchomieniu narzędzia w panelu administratora. Viewer nie pobiera encodera AVIF podczas startu galerii.

### Najważniejsze zasady

- warianty: Desktop, Mobile i Preview w formacie AVIF;
- artwork: 3072 / 2048 / 768 px;
- author: 1280 / 768 / 384 px;
- wersjonowane, niezmienne ścieżki `AVIFv1`;
- upload z `upsert: false`;
- każdy zestaw trzech wariantów jest atomowy;
- plik po uploadzie jest ponownie pobierany i sprawdzany po sygnaturze AVIF;
- mipmapy artworków są włączone także na telefonie;
- anizotropia: cel 8 mobile / 16 desktop, ograniczona możliwościami GPU;
- błąd dekodowania AVIF cofa dany obraz do oryginalnego źródła;
- wygenerowane WebP są usuwane dopiero po walidacji i dwóch poprawnych zapisach galerii;
- oryginalne JPG, PNG, AVIF lub WebP nie są usuwane przez migrację wariantów.

## Panel IMAGE OPTIMIZATION

1. `TEST SELECTED ARTWORK AVIF`
2. `AUDIT GENERATED WEBP`
3. `BUILD MISSING ARTWORK AVIF`
4. `FORCE REBUILD ARTWORK AVIF`
5. `BUILD MISSING AUTHOR AVIF`
6. `FORCE REBUILD AUTHOR AVIF`
7. `VALIDATE AVIF MIGRATION`
8. `FINALIZE + REMOVE WEBP`

Nie używaj finalizacji przed wizualnym sprawdzeniem AVIF na PC i telefonie.

## Budowanie i testy

```bash
npm run check
```

Wersja produkcyjna używa `src/Gallery_V0_11.min.js`.

Wersja testowa bez logowania:

`Gallery_V0_11_STAGE12C66C6B_AVIF_PIPELINE_MIGRATION_WEBP_REMOVAL_LOGIN_DISABLED.txt`
