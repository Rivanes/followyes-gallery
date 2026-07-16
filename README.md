# Berryboy Art Gallery — Stage 12C64R

## Smooth Inspect Playback / Interaction Readiness Gate

Stage 12C64R is built from the corrected Stage 12C64Q package with production login enabled and the root TXT login disabled.

### Smooth Inspect playback

- The complete Inspect route is validated before the camera starts moving.
- The smoothed route is used only when every segment passes the existing exact collision checks.
- When smoothing is unsafe, the already validated raw path is used.
- During playback the render loop performs only arc-length position sampling and quaternion rotation interpolation.
- Expensive geometry raycasts are no longer repeated in every animation frame.
- The exact Custom Focus endpoint, Viewer/Edit shared controller and camera ownership states remain unchanged.

### Visual Ready / Interaction Ready

The startup now separates two moments:

1. **Visual Ready** — the loader disappears and the intro popup can be read, but the Start button remains disabled.
2. **Interaction Ready** — Start becomes available only after sculpture/model queues, Props, preview/visible textures and startup prefetch are settled, final Local Light restoration has run, and the scene has rendered a stable warm-up sequence.

The button displays `Finishing gallery…` while the interaction gate is active.

### Deferred full-resolution artwork upgrades

Full artwork texture upgrades are not allowed to compete with the first viewer movement. They wait until:

- Interaction Ready is complete,
- the intro has been closed,
- no Inspect transition or drag is active,
- WASD/joystick movement has stopped,
- the viewer has remained idle for the configured delay.

### Login contract

- `src/Gallery_V0_11.js`: editor login enabled for the web build.
- root `Gallery_V0_11_STAGE12C64R_SMOOTH_INSPECT_INTERACTION_READY_LOGIN_DISABLED.txt`: editor login disabled for direct testing.
