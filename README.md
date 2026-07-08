# Berryboy Art Gallery — Stage 12C62S6A

Full project package.

Stage 12C62S6A — Startup Order Rebuild / Storage First / Models In Parallel / Final Lights / Popup Last.

## Startup order

1. Supabase state/storage preload starts immediately.
2. Startup models load at the same time. On mobile they are queued to avoid RAM/GPU spikes.
3. Props are no longer released after the Explore click; they load or fail before the intro popup.
4. Saved state is applied after models are ready.
5. Artwork storage textures get a settle window.
6. Local Lights final target assignment runs at the end.
7. Viewer intro popup is shown only after the gallery is settled.

## Login split

- `src/Gallery_V0_11.js` — production, login enabled.
- `src/Gallery_V0_10.js` — production mirror, login enabled.
- `Gallery_V0_11_STAGE12C62S6A_STARTUP_ORDER_STORAGE_MODELS_LIGHTS_POPUP_LOGIN_DISABLED.txt` — test TXT, login disabled.

## Debug

- `BerryboyArtGalleryLoading.getDebug()`
- `BerryboyArtGalleryLoading.getRetryConfig()`
- `BerryboyArtGalleryMobile.getDebug()`
