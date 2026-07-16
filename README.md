# Berryboy Art Gallery — Stage 12C65C

## Mobile Viewport / HUD Rebuild

Built directly from Stage 12C65B1. This stage replaces the mobile viewport and overlay architecture without changing the final Inspect design or its camera behavior.

### VisualViewport-owned gallery height

- `window.visualViewport.height` drives the real visible gallery height.
- The controller also exposes width, `offsetTop`, bottom offset, orientation and source as CSS variables/data attributes.
- `100dvh` remains only as a fallback.
- Legacy `100vh` and the forced mobile minimum height are absent.
- Resize, VisualViewport resize/scroll, orientation change, page restore and header resize all schedule one requestAnimationFrame update.
- Babylon receives the same viewport event and resizes the engine after the CSS size is committed.

### One layered gallery HUD

`#galleryMobileHud` contains four fixed layers:

1. `galleryMobileTopLayer`
2. `galleryMobileControlsLayer`
3. `galleryMobileInspectLayer`
4. `galleryMobileSystemLayer`

Routing:

- joystick, edit panel, floating edit button and tour badges → controls,
- artwork popup and Inspect arrows → inspect,
- Boot Guard and performance diagnostics → system.

The protected Inspect functions and the final Stage 12C64H visual CSS remain unchanged.

### Safe-area joystick and orientation

- Joystick left/bottom offsets use `env(safe-area-inset-left)` and `env(safe-area-inset-bottom)`.
- Landscape phones retain mobile viewer controls through short-side detection.
- Very short landscape viewports use a smaller joystick.
- Orientation change resets active joystick input before refreshing the mobile mode.

### Lightweight mobile header

- Mobile header height is 54 px plus the top safe area.
- The long brand label collapses to “Berryboy”.
- Existing About, language, login/logout and save actions move into one frosted dropdown instead of being compressed into a row.
- The menu includes the Stage 12C65B1 quality selector: Auto / High / Balanced / Safe.

### Intentionally unchanged

- Adaptive quality thresholds and monotonic downshift from 12C65B1,
- Boot Guard failure logic,
- Single Startup Gate,
- Inspect camera transitions and final popup appearance,
- exhibit tour order,
- asset streaming / LOD / KTX2 planned for 12C65E.

### Login contract

- `src/Gallery_V0_11.js`: login enabled.
- root `Gallery_V0_11_STAGE12C65C_MOBILE_VIEWPORT_HUD_REBUILD_LOGIN_DISABLED.txt`: login disabled.
