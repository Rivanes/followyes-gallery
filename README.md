# Berryboy Art Gallery — Stage 12C64S

## Single Startup Gate / Batched Finalization

Stage 12C64S is built from Stage 12C64R1. Inspect playback, Custom Focus, popup, avatar fallback, arrows and `tourOrder` are unchanged.

### Startup architecture

1. Critical shell: floor, walls and ceiling.
2. Saved Supabase state is applied once.
3. The intro popup opens as Visual Ready.
4. One Interaction Ready gate drains artwork previews, Props and sculpture models.
5. Desktop loads up to two sculpture models concurrently; mobile loads one.
6. Collision meshes, lighting material support, Local Light targets and shadows are globally finalized once.
7. Stable render frames unlock `Start exploring`.
8. Full-resolution artwork textures continue only during real viewer idle time.

### Removed

- the older Balanced Entry Gate,
- startup `new Image()` preview prefetch,
- per-model 180 ms artificial sleeps,
- global `BABYLON.SceneLoader.ImportMesh` monkey patch,
- per-model/per-Props global light finalization,
- unused startup light-assignment implementations,
- obsolete V0_7, V0_8 and V0_10 source copies.

### Login variants

- `src/Gallery_V0_11.js`: editor login enabled.
- root `Gallery_V0_11_STAGE12C64S_SINGLE_STARTUP_GATE_BATCHED_FINALIZATION_LOGIN_DISABLED.txt`: editor login disabled for direct engine testing.
