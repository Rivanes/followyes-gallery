# Berryboy Art Gallery — Stage 12C62S5A

Full project package rebuilt from the Stage 12C62S5 production-login package.

## Stage 12C62S5A changes

- All startup assets use the same retry safety window:
  - wall: 3 attempts × 30s
  - floor: 3 attempts × 30s
  - ceiling: 3 attempts × 30s
  - props: 3 attempts × 30s
- Startup watchdog raised to 125s so it does not interrupt the 3 × 30s retry flow.
- After startup assets load, the loader waits for saved gallery state / artwork storage texture settle before entering viewer mode.
- Final Local Light target assignment runs at the end of startup, after assets + Supabase state + artwork texture settle.
- Local Lights / target resolver / UI theme are otherwise not changed.

## Login policy

- `src/Gallery_V0_11.js` = production login enabled (`galleryEditorLoginEnabled = true`)
- `src/Gallery_V0_10.js` = production login enabled (`galleryEditorLoginEnabled = true`)
- `Gallery_V0_11_STAGE12C62S5A_TIMEOUT_STORAGE_SETTLE_FINAL_LIGHT_ASSIGNMENT_LOGIN_DISABLED.txt` = login disabled test engine file (`galleryEditorLoginEnabled = false`)

## Debug

```js
BerryboyArtGalleryLoading.getDebug()
BerryboyArtGalleryLoading.getRetryConfig()
```

`getDebug()` now also includes `artworkTextures` and `startupFinalize` data.
