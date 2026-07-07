Berryboy Art Gallery — Stage 12C62S5
Asset Retry Loader / Critical Import Resilience

Base: Stage 12C62S4 — Production Asset Loading Guard + Popup Frosted UI

Goal
- Keep the production gallery from opening in a half-loaded state when critical GLB assets fail or time out.
- Retry critical asset imports before showing a failure screen.
- Preserve the current No Hard Cut Local Lights line: Range / Angle / Blend target assignment, colored target debug outlines, no shader Hard Cut, no Proof View, no native bypass.

Changed
1. Full project package restored.
   - index.html
   - package.json
   - README.md
   - src/Gallery_V0_7.js
   - src/Gallery_V0_8.js
   - src/Gallery_V0_10.js
   - src/Gallery_V0_11.js
   - login-disabled stage TXT

2. Current engine copied into both active V0_11 and compatibility V0_10 files.
   - src/Gallery_V0_11.js
   - src/Gallery_V0_10.js

3. Critical asset retry loader.
   - floor: 3 attempts, critical
   - wall: 3 attempts, critical
   - ceiling: 3 attempts, critical
   - props: 2 attempts, optional
   - each attempt has a timeout guard

4. Critical loading gate.
   - Viewer is blocked only after final failure of floor / wall / ceiling.
   - Props can fail without blocking the gallery.
   - Retry loading button remains available after final critical failure.

5. Debug hooks.
   - BerryboyArtGalleryLoading.getDebug()
   - BerryboyArtGalleryLoading.getRetryConfig()

Validation
- node --check src/Gallery_V0_11.js
- node --check src/Gallery_V0_10.js
- node --check login-disabled TXT as .mjs
- unzip -t ZIP

Notes
- This package restores the older full-project ZIP layout.
- No Hard Cut / Proof View / shader overlay / native bypass was added back.
- Local Lights target assignment remains the production path.
