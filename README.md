# Berryboy Art Gallery — Stage 12C65D

## Mobile Inspect UI / Safe-Frame

Built directly from Stage 12C65C. This stage replaces only the mobile Inspect composition while preserving Adaptive Quality, VisualViewport/HUD architecture, camera transition ownership, tour order and startup behavior.

### One mobile Inspect component

The mobile popup now owns three elements in one DOM and one visual capsule:

1. author avatar,
2. artwork/sculpture information,
3. previous/next navigation row.

The arrows are no longer a parallel full-screen overlay. On desktop they remain visually outside the accepted Stage 12C64H capsule, but structurally belong to the same component. On mobile they become an internal bottom row.

### Joystick-aware safe-frame

`updateGalleryMobileInspectSafeFrame()` measures the actual gallery section and `#mobileJoystickBase`.

- Portrait: the complete popup is raised above the joystick with a measured gap.
- Narrow phones: smaller side insets and avatar keep the component readable.
- Low landscape: when at least 300 px remain to the right of the joystick, the popup uses that side area instead of consuming the lower half of the viewport.
- No joystick/edit preview: the popup returns to the normal bottom safe-area inset.

The resulting left, right, bottom and maximum-height values are passed through CSS variables.

### Camera composition

The existing rotation-aware Inspect solver remains the only camera composition system.

- Portrait/bottom mode: the safe rectangle ends above the measured popup.
- Landscape/side mode: the safe rectangle ends before the popup's measured left edge, preserving more vertical room.
- Popup size changes continue to trigger the existing ResizeObserver refresh.

### Mobile content behavior

- Avatar: 76 px normally, 66 px on very narrow phones, 62 px in low landscape.
- Description has its own contained scroll area.
- Navigation buttons have mobile labels and remain large touch targets.
- Popup maximum height follows the measured visual viewport.

### Intentionally unchanged

- Stage 12C65B1 Adaptive Quality,
- Stage 12C65C VisualViewport, header, HUD and joystick logic,
- `WALK → TRANSITION → INSPECT`,
- Custom Focus and collision-safe camera path,
- exhibit `tourOrder`,
- Single Startup Gate,
- desktop popup dimensions and avatar styling,
- Stage 12C65E asset streaming work.

### Login contract

- `src/Gallery_V0_11.js`: login enabled.
- root `Gallery_V0_11_STAGE12C65D_MOBILE_INSPECT_UI_SAFE_FRAME_LOGIN_DISABLED.txt`: login disabled.
