# Berryboy Art Gallery — Stage 12C65B1

## Adaptive Quality Stabilization / Correct Downshift

Built directly from Stage 12C65B. This is a narrow stabilization stage: no viewport, HUD, Inspect, popup or asset-streaming rebuild is included.

### Corrected AUTO startup

- Regular mobile devices start in **Balanced** at `hardwareScalingLevel = 1.00`.
- Embedded browsers and devices identified as low-memory or low-CPU start in **Safe** at `1.18`.
- iOS, a high core count or reported `deviceMemory` no longer grants **High** automatically.
- **High** is reached only after sustained fast FPS windows, or by an explicit manual selection.

### Profile resolution ranges

- **High** — `0.96` baseline, range `0.94–1.08`.
- **Balanced** — `1.00` baseline, range `1.00–1.22`.
- **Safe** — `1.18` baseline, range `1.08–1.38`.

The old automatic High startup at `0.88` has been removed. High can still improve clarity after measured performance evidence, but no profile starts with aggressive supersampling.

### Monotonic profile transitions

AUTO profile transitions preserve the direction of the quality change:

- downshift: the hardware scaling level can stay unchanged or increase, never decrease,
- upshift: the hardware scaling level can stay unchanged or decrease, never increase.

Examples:

- `High 1.08 → Balanced 1.08`, not `1.00`,
- `Balanced 1.22 → Safe 1.22`, not `1.18`.

Shadow and light budgets still change immediately with the selected profile.

### Asset-aware measurement

FPS sampling and quality changes pause while any of the following is active:

- background asset drain,
- startup batch hydration,
- active model loading,
- pending artwork texture uploads,
- pending environment or wall texture uploads,
- Inspect camera transition,
- hidden browser tab.

This prevents temporary loading spikes from being interpreted as the permanent performance of the device.

### Runtime APIs

```js
GalleryApp.getMobileQuality();
GalleryApp.setMobileQualityMode("auto");
GalleryApp.setMobileQualityMode("high");
GalleryApp.setMobileQualityMode("balanced");
GalleryApp.setMobileQualityMode("safe");
```

The selected mode remains stored as `berryboy_mobile_quality_mode`. The visible quality selector is intentionally left for the rebuilt mobile menu in Stage 12C65C.

### Login contract

- `src/Gallery_V0_11.js`: login enabled.
- root `Gallery_V0_11_STAGE12C65B1_ADAPTIVE_QUALITY_STABILIZATION_CORRECT_DOWNSHIFT_LOGIN_DISABLED.txt`: login disabled.
