# Berryboy Art Gallery — Stage 12C66C5

## Unified Ground Collision / Sculpture Runtime Integrity

Stage 12C66C5 przebudowuje aktywny ruch po podłodze oraz lifecycle modeli rzeźb. Nie jest to warstwa flag nad C4: z aktywnej ścieżki usunięto konkurencyjne `moveWithCollisions()`, stary post-move rollback i bezpośrednią animację `camera.position` dla click-to-move.

### Najważniejsze zmiany

- jeden resolver `resolveGalleryGroundMovement()` dla Viewer walk, Edit walk, WASD, D-pada, joysticka, mobile hold-drag i click-to-move;
- pełny ruch → slide X → slide Z → blokada, z jednym finalnym zapisem pozycji;
- click-to-move wykonuje małe kroki przez ten sam resolver;
- Edit Fly pozostaje świadomym wyjątkiem i jest jawnie logowany jako `intentional-fly-bypass`;
- collider rzeźby należy do `slotId`, jest childem slotu i łączy bounds modelu z footprintem postumentu;
- collider zachowuje lokalny cache podczas streamingu i aktualizuje world bounds po transformacji slotu;
- loader przejmuje `rootNodes`, `transformNodes`, `meshes` i descendants GLB;
- disposal usuwa całą konkretną hierarchię runtime’u, również node’y poza wrapperem;
- drag ma stałego ownera od pointer-down do pointer-up;
- async duplicate nie przejmuje nowszego selection;
- kolejka streamingu modeli używa `slotId`, nie nazwy;
- footprint postumentu jest zapisywany i odtwarzany.

### Diagnostyka w konsoli

```js
GalleryApp.setSculptureCollisionDebugVisible(true)
GalleryApp.getViewerCollisionDebug()
GalleryApp.getSculptureCoreDebug()
GalleryApp.clearGroundCollisionMovementLog()
```

Wyłączenie podglądu:

```js
GalleryApp.setSculptureCollisionDebugVisible(false)
```

### Budowa i testy

```bash
npm run check
```

Automatyczne testy nie zastępują ręcznego testu WebGL na docelowej wystawie, prawdziwych GLB, Supabase i urządzeniach mobilnych. Procedura znajduje się w `STAGE12C66C5_TEST_CHECKLIST.txt`.
