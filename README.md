# Berryboy Art Gallery — Stage 12D2

## Multi‑Venue / Multi‑Exhibition Data Architecture

Stage 12D2 rozwija zaakceptowany Stage 12D1 w platformę danych obsługującą dowolną liczbę Venue i Exhibition bez zmiany kodu silnika Babylon.js.

## Główna architektura

```text
wybór Exhibition
→ exhibitionId / slug
→ dokładny Venue + Venue Version
→ Venue Manifest
→ kanał draft / published / previous
→ uruchomienie jednego silnika Babylon.js
```

Bez wybranej wystawy ciężki silnik 3D, modele i artworki nie są uruchamiane.

## Najważniejsze zmiany D2

- dynamiczny katalog opublikowanych i zaplanowanych wystaw;
- routing przez `?exhibition={slug}` oraz `/exhibitions/{slug}`;
- osobny stan każdej wystawy w `exhibition_states`;
- dokładne przypięcie każdego stanu do konkretnej wersji Venue;
- rozdzielenie **SAVE DRAFT** i **PUBLISH**;
- atomowe `draft → published → previous`;
- rollback poprzedniej publikacji;
- publiczny Viewer otrzymuje tylko snapshot `published_state` przez RPC;
- zalogowany edytor pracuje wyłącznie na kanale draft;
- kontrolowany restart sceny przy zmianie wystawy;
- Storage `platform-media/exhibitions/{exhibitionId}/...`;
- stabilne UUID mediów i globalne `media_usages`;
- cleanup współdzielonych mediów działa fail‑closed;
- kontrolowana migracja `gallery_state/main` do pierwszej wystawy Berryboy;
- RLS rozdzielający Platform Admin, Venue Admin i Curator;
- Curator nie ma technicznego zapisu Venue;
- zachowany Venue Runtime Registry z D1;
- zachowane wszystkie zamrożone systemy C6C2 oraz aktywny panel DBG.

## Główne pliki

```text
src/runtime/exhibition-runtime.js
src/runtime/venue-runtime.js
src/bootstrap/gallery-viewer-bootstrap.js
src/bootstrap/gallery-editor-bootstrap.js
supabase/migrations/20260803_stage12d2_multi_venue_multi_exhibition.sql
venues/berryboy-main/versions/v1/manifest.json
```

## Testy

```bash
npm run check
```

Zestaw obejmuje verifier D2, test trzech wystaw w dwóch Venue, izolację kanałów, kontrolowany restart, Save Integrity, shared-media cleanup oraz wszystkie regresje C6C2/D1.

## Wdrożenie Supabase

Kod D2 wymaga zastosowania migracji SQL przed pierwszym zapisem draftu, publikacją i nowymi uploadami. Migracja nie została automatycznie uruchomiona na produkcyjnym projekcie użytkownika i nie usuwa starej tabeli `gallery_state`.

Szczegóły: `STAGE12D2_SUPABASE_MIGRATION_GUIDE.md`.

## Ważne: diagnostyka C6C2 nadal aktywna

Mobile C6C2 tests are still active.
Collect DBG FREEZE and LAST SESSION screenshots.
Return to memory analysis after enough reports are collected.
After diagnostics are complete, remove the DBG panel and all related code physically.
Do not only disable or hide it.

Panel DBG, snapshoty i mechanizmy stabilizacji pamięci pozostały aktywne.

## Status walidacji

Automatyczny zestaw testów przechodzi. Nie wykonano pełnego wdrożenia migracji na rzeczywistym Supabase ani kompletnego testu WebGL na telefonach. Paczka wymaga wdrożenia najpierw na środowisku staging i przejścia checklisty runtime.
