# Berryboy Art Gallery — Stage 12C65B

## Adaptive Mobile Quality

Built directly from Stage 12C65A. The mobile cleanup, Boot Guard, single startup gate, Inspect pipeline, popup and `tourOrder` remain intact.

### Profiles

- **High** — sharper internal render (`0.88` baseline), 1024 main shadow map, two active local Spot shadows and higher material light budgets.
- **Balanced** — native-like internal render (`1.00` baseline), 512 main/local shadow maps and moderate material budgets.
- **Safe** — conservative render (`1.18` baseline), reduced shadow/light budgets for embedded browsers and weaker devices.

`AUTO` chooses the initial profile from the single Stage 12C65A device profile and can move between profiles only after sustained performance evidence.

### Dynamic resolution

- starts only after `Interaction Ready`,
- waits through a 3-second warm-up,
- samples stable 1.8-second windows,
- needs two slow windows to lower quality,
- needs four fast windows to raise quality,
- applies changes only after the viewer has been idle for at least 650 ms,
- pauses measurement during Inspect transitions and hidden-tab periods,
- uses a 4.5–5 second cooldown to prevent oscillation.

### Runtime APIs

```js
GalleryApp.getMobileQuality();
GalleryApp.setMobileQualityMode("auto");
GalleryApp.setMobileQualityMode("high");
GalleryApp.setMobileQualityMode("balanced");
GalleryApp.setMobileQualityMode("safe");
```

The selected mode is stored as `berryboy_mobile_quality_mode`. A future mobile HUD can listen for `gallery-mobile-quality-change`.

### Login contract

- `src/Gallery_V0_11.js`: login enabled.
- root `Gallery_V0_11_STAGE12C65B_ADAPTIVE_MOBILE_QUALITY_LOGIN_DISABLED.txt`: login disabled.
