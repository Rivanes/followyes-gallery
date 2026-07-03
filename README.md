Berryboy Art Gallery — Stage 12C52
Local Light Parameter Idle Commit Fix

Base: Stage 12C51 — PointLight Surface Reach + Spawn Stagger Fix

Goal
- Reduce FPS drops that happen after changing Local Light settings, especially Range, Angle, Blend and target checkboxes.
- Keep live feedback responsive, but delay heavy target/shadow recomputation until the user stops interacting.

Changed
1. Local Light slider input is now light-preview only.
   - Updates actual light value live.
   - Updates helper/range guide through existing throttled helper pipeline.
   - Does not rebuild includedOnlyMeshes / wall/floor/ceiling targets on every input.

2. Parameter final commit after idle.
   - Heavy target rebuild is scheduled after idle instead of immediate slider release.
   - Multiple changes are merged per light.
   - Multiple selected lights are staggered slightly to avoid one-frame spikes.

3. Target checkboxes use the same idle commit path.
   - Floor/Walls/Ceiling/Artworks/Sculptures/Props toggles no longer force immediate heavy retarget.

4. Spot shadow refresh delayed.
   - Spot shadow map refresh happens after the final target commit, not during the live parameter motion.

5. UI sync reduced during slider motion.
   - Slider `input` events skip full control resync.
   - `change` events resync UI, but still avoid immediate heavy target rebuild.

6. Debug additions.
   - Performance debug now shows parameter preview skips / final scheduled / final commits.

Validation
- node --check src/Gallery_V0_11.js
- node --check src/Gallery_V0_10.js
- node --check login-disabled TXT as .mjs
- unzip -t ZIP

Notes
- This stage does not change Popup, PointLight occlusion, Visual Settings or Focus Camera.
- It only optimizes Local Light parameter changes after C51.
