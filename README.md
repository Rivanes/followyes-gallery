# Berryboy Art Gallery — Stage 12C65A

## Mobile Cleanup / Boot Recovery

Stage 12C65A is built from Stage 12C64S. Inspect, Custom Focus, popup, arrows, `tourOrder` and the single startup gate remain protected.

### Removed

- Stage 12C62S6 Mobile Startup Survival Mode,
- mobile sequential critical-import queue and its artificial delay,
- separate artwork mobile-texture detector,
- legacy Mobile Focus state and camera animations,
- dead mobile focus/back/reset helpers,
- old Stage 8X1 public popup overrides,
- the second conflicting final mobile popup block,
- duplicated Edit Inspect preview CSS,
- forced `min-height: 540px` mobile canvas rule.

### One device profile

A single `BerryboyArtGalleryDeviceProfile` now controls:

- mobile asset selection,
- mobile viewer controls,
- model and preview concurrency,
- interaction gate timeout,
- initial render-scale baseline,
- mobile Local Light shadow budgets.

The previous fixed `1.45 / 1.8` mobile render downgrade is gone. Stage 12C65B will add measured adaptive quality.

### Boot recovery

A static HTML Boot Guard is visible before Babylon, Supabase or the gallery module starts. It handles:

- Babylon CDN failure,
- module load failure,
- boot timeout,
- WebGL context creation error,
- WebGL context loss and restore,
- startup exceptions and rejected promises.

Instead of a blank white page, the visitor receives a reload action and an `Open in browser` action.

### Login variants

- `src/Gallery_V0_11.js`: login enabled.
- root `Gallery_V0_11_STAGE12C65A_MOBILE_CLEANUP_BOOT_RECOVERY_LOGIN_DISABLED.txt`: login disabled.
