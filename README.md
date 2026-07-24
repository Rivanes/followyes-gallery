# Berryboy Art Gallery — Stage 12C66C3

Systemowa stabilizacja zgłoszeń po Etapie 3. Baza: **Stage 12C66C1**. Z C2 przeniesiono wyłącznie zweryfikowane usunięcie automatycznego wygaszania Local Lights.

## Zakres

- marker podłogi przebudowany z torusa 3D na jeden proceduralny plane/SDF;
- miękkie krawędzie i wspólny shaderowy pulse po kliknięciu;
- marker nadal pojawia się tylko wtedy, gdy pierwszy widoczny hit jest podłogą;
- `TRANSITION` Inspect jest nadrzędnym właścicielem kamery;
- capture-listener obrotu myszką, D-pad, WASD, mobile input, Escape i Edit Mode nie mogą przerwać przejazdu;
- `closeGalleryInspect()` ma centralną blokadę wejścia użytkownika podczas przejazdu;
- sculpture proxy zostały podłączone do customowego sweep/slide resolvera używanego przez ściany;
- Viewer i zwykły Edit walk blokują rzeźby oraz strefę postumentu; świadomy `Space` fly pozostaje wyjątkiem;
- publiczny Viewer na urządzeniu dotykowym nie może odzyskać `FreeCameraTouchInput`, także przy chwilowym desktopowym układzie viewportu;
- Local Lights respektują wyłącznie zapisane `Enabled` i `Intensity` — bez camera/frustum/zone cullingu oraz bez fade.

## Niezmienione systemy

Oryginalny popup instruktażowy, startup, Save Integrity, cztery zakładki Edit Mode, sticky Save, Custom Focus, trasa Inspect i Mobile Inspect UI nie zostały przeprojektowane.

## Weryfikacja

```bash
npm run check
```

Testy automatyczne obejmują składnię, build, zapis/Storage, startup, hash zaakceptowanego popupu, shader markeru, centralny lock `TRANSITION`, blokadę natywnego touch inputu oraz matematyczny sweep sculpture proxy.

Pełny test WebGL na docelowej wystawie, prawdziwym Supabase i fizycznym Androidzie/iOS nadal wymaga wykonania checklisty manualnej.
