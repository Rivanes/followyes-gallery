/*
  Berryboy Art Gallery
  Plik: Gallery_V0_11.js

  Aktualny stan:
  - baza V0_9_1 ENGINE z edytorem Local Lights,
  - Local Lights sa tylko Spot + Point,
  - Area Light jest usuniete z UI i z aktywnej logiki,
  - Spot Light rzuca lokalne cienie i ma Angle / Blend,
  - Point Light nie rzuca lokalnych cieni; sluzy tylko do fill/accent light,
  - General Settings dziala dla Spot i Point: Enabled / Color / Intensity / Range,
  - Point helper pokazuje tylko cyan sphere = Range,
  - nowo dodane Spot/Point korzystaja ze wspolnego targetowania i maxSimultaneousLights,
  - Etap 6: dodano aktywne Target Controls dla Local Lights.
  - Target Controls steruja realnym includedOnlyMeshes lampy: Floor / Walls / Artworks / Sculptures / Props.
  - Etap 7: Local Light Groups dostaly batch actions: Enable / Disable / Solo.
  - Etap 7: Solo Group zapisuje poprzednie stany Enabled i potrafi je przywrocic.
  - Poprawka: Targets przeniesione do zwijanej sekcji ADVANCED.
  - Etap 8: dodano Move + Rotate Gizmo dla pojedynczej lampy Local Light.
  - Etap 8 FIX: Gizmo dziala rowniez dla lamp generowanych przy obrazach/rzezbach, bo sa czescia tego samego rejestru Local Lights.
  - UI FIX: Move / Rotate Gizmo przeniesione do GENERAL SETTINGS; logika gizmo nie byla ruszana.
  - PERF FIX: Color picker nie przebudowuje helperow i shadow refresh podczas przeciagania koloru.
  - TARGET FIX: Roof/Ceiling dodany jako osobny target lokalnych lamp, wlaczony domyslnie.
  - Etap 9: zapis i odczyt pelnego stanu Local Lights: lampy, parametry, transform, targets i groups.
  - WEB: zapis/odczyt online przez GalleryApp + Supabase gallery_state / id = main.
  - UI ONLY: Transform przeniesiony pod naglowek GENERAL SETTINGS, mixed-info przeniesione pod Range.

  Zasada dalszej pracy:
  - rejestr Local Lights jest jednym zrodlem prawdy,
  - UI, helpery i cienie maja tylko odczytywac/zmieniac dane z rejestru,
  - nie dodajemy rownoleglych systemow dla nowych lamp.
*/


export const createScene = function (engineArg, canvasArg) {

    var engine = engineArg || globalThis.engine;
    var canvas = canvasArg || globalThis.canvas || document.getElementById("renderCanvas");

    if (!engine) {
        throw new Error("Gallery_V0_9_ENGINE: brak obiektu engine. Przekaż engine do createScene(engine, canvas) albo ustaw globalThis.engine.");
    }

    if (!canvas) {
        throw new Error("Gallery_V0_9_ENGINE: brak canvas. Przekaż canvas do createScene(engine, canvas) albo użyj elementu #renderCanvas.");
    }

    var scene = new BABYLON.Scene(engine);

    // Czysci elementy UI po przeladowaniu sceny.
    function cleanupArtworkInfoPopupDom() {
        if (typeof document === "undefined") {
            return;
        }

        [
            "#galleryArtworkInfoPopup",
            ".gallery-artwork-info-popup"
        ].forEach(function (selector) {
            document.querySelectorAll(selector).forEach(function (element) {
                if (element && element.parentNode) {
                    element.classList.remove("is-visible");
                    element.parentNode.removeChild(element);
                }
            });
        });
    }

    cleanupArtworkInfoPopupDom();

    [
        "customLoadingScreen",
        "customLoaderStyle",
        "editModeButton",
        "wallColorPalette",
        "editHelpPanel",
        "artworkAlignPanel",
        "galleryEditorPanel",
        "galleryEditorStyle",
        "mobileViewerControls",
        "mobileViewerStyle"
    ].forEach(function (elementId) {
        var oldElement = document.getElementById(elementId);

        if (oldElement) {
            oldElement.remove();
        }
    });


    var camera = new BABYLON.UniversalCamera(
        "camera",
        new BABYLON.Vector3(-1., -2.2, -32),
        scene
    );

    function configureCameraPointerButtons() {
        if (!camera || !camera.inputs || !camera.inputs.attached) {
            return;
        }

        // Prawy przycisk myszy jest zarezerwowany do czyszczenia zaznaczenia.
        // Obracanie kamery zostaje tylko pod wcisnietym scrollem / srodkowym przyciskiem myszy.
        if (camera.inputs.attached.mouse && camera.inputs.attached.mouse.buttons) {
            camera.inputs.attached.mouse.buttons = [1];
        }

        if (camera.inputs.attached.pointers && camera.inputs.attached.pointers.buttons) {
            camera.inputs.attached.pointers.buttons = [1];
        }
    }

    function attachGalleryCameraControl() {
        camera.attachControl(canvas, true);
        configureCameraPointerButtons();
    }

    attachGalleryCameraControl();

    // DESKTOP MIDDLE MOUSE ROTATION FIX
    // Babylonowe buttons = [1] nie zawsze lapie obrót,
    // bo pozniejsza logika sceny przechwytuje pointery. Dlatego desktop dostaje
    // wlasny, prosty obrót kamery pod wcisnietym scrollem / srodkowym przyciskiem.
    // Dziala w Viewer Mode i Edit Mode, poza aktywnym przeciaganiem obiektow.
    var desktopViewerMiddleLookActive = false;
    var desktopViewerMiddleLookPointerId = null;
    var desktopViewerMiddleLookLastX = 0;
    var desktopViewerMiddleLookLastY = 0;
    var desktopViewerMiddleLookSensitivityX = 0.004;
    var desktopViewerMiddleLookSensitivityY = 0.003;

    function isDesktopViewerMiddleLookAllowed(event) {
        if (!event || event.button !== 1) {
            return false;
        }

        if (typeof isMobileViewerActive === "function" && isMobileViewerActive()) {
            return false;
        }

        // Nie obracamy kamery scrollem w trakcie aktywnego przeciagania elementow edycji.
        if (isDraggingArtwork || isDraggingSphere) {
            return false;
        }

        return true;
    }

    function preventMiddleMouseBrowserAction(event) {
        if (!event || event.button !== 1) {
            return;
        }

        if (event.preventDefault) {
            event.preventDefault();
        }
    }

    function beginDesktopViewerMiddleLook(event) {
        if (!isDesktopViewerMiddleLookAllowed(event)) {
            return false;
        }

        desktopViewerMiddleLookActive = true;
        desktopViewerMiddleLookPointerId = event.pointerId !== undefined ? event.pointerId : null;
        desktopViewerMiddleLookLastX = event.clientX;
        desktopViewerMiddleLookLastY = event.clientY;

        if (canvas && canvas.setPointerCapture && event.pointerId !== undefined) {
            try {
                canvas.setPointerCapture(event.pointerId);
            } catch (captureError) {
                // Pointer capture nie jest krytyczny; obrót i tak dziala na window pointermove.
            }
        }

        if (event.preventDefault) {
            event.preventDefault();
        }

        if (event.stopPropagation) {
            event.stopPropagation();
        }

        return true;
    }

    function updateDesktopViewerMiddleLook(event) {
        if (!desktopViewerMiddleLookActive || !event) {
            return false;
        }

        if (
            desktopViewerMiddleLookPointerId !== null &&
            event.pointerId !== undefined &&
            event.pointerId !== desktopViewerMiddleLookPointerId
        ) {
            return false;
        }

        var dx = event.clientX - desktopViewerMiddleLookLastX;
        var dy = event.clientY - desktopViewerMiddleLookLastY;

        desktopViewerMiddleLookLastX = event.clientX;
        desktopViewerMiddleLookLastY = event.clientY;

        // STAGE 12C2:
        // Manualny obrót nie może startować z chwilowego visual roll z chodzenia.
        if (!editMode && typeof clearViewerWASDVisualOffsets === "function") {
            clearViewerWASDVisualOffsets();
            camera.rotation.z = 0;
        }

        camera.rotation.y += dx * desktopViewerMiddleLookSensitivityX;
        camera.rotation.x += dy * desktopViewerMiddleLookSensitivityY;
        camera.rotation.x = BABYLON.Scalar.Clamp(camera.rotation.x, -0.58, 0.58);
        camera.rotation.z = 0;

        if (event.preventDefault) {
            event.preventDefault();
        }

        if (event.stopPropagation) {
            event.stopPropagation();
        }

        return true;
    }

    function endDesktopViewerMiddleLook(event) {
        if (!desktopViewerMiddleLookActive) {
            return false;
        }

        if (
            event &&
            desktopViewerMiddleLookPointerId !== null &&
            event.pointerId !== undefined &&
            event.pointerId !== desktopViewerMiddleLookPointerId
        ) {
            return false;
        }

        if (canvas && canvas.releasePointerCapture && event && event.pointerId !== undefined) {
            try {
                canvas.releasePointerCapture(event.pointerId);
            } catch (releaseError) {
                // Brak capture nie blokuje zakonczenia obrotu.
            }
        }

        desktopViewerMiddleLookActive = false;
        desktopViewerMiddleLookPointerId = null;

        if (event && event.preventDefault) {
            event.preventDefault();
        }

        if (event && event.stopPropagation) {
            event.stopPropagation();
        }

        return true;
    }

    canvas.addEventListener("pointerdown", function (event) {
        beginDesktopViewerMiddleLook(event);
    }, true);

    window.addEventListener("pointermove", function (event) {
        updateDesktopViewerMiddleLook(event);
    }, true);

    window.addEventListener("pointerup", function (event) {
        endDesktopViewerMiddleLook(event);
    }, true);

    window.addEventListener("pointercancel", function (event) {
        endDesktopViewerMiddleLook(event);
    }, true);

    canvas.addEventListener("mousedown", function (event) {
        if (event.button === 1) {
            preventMiddleMouseBrowserAction(event);
        }
    }, true);

    canvas.addEventListener("auxclick", function (event) {
        if (event.button === 1) {
            preventMiddleMouseBrowserAction(event);
        }
    }, true);

    camera.speed = 0.3;
    // STAGE 9E:
    // Mniejszy near clipping plane ogranicza wizualne przecinanie ściany,
    // gdy zwiedzający podejdzie bardzo blisko powierzchni.
    camera.minZ = 0.035;
    camera.setTarget(new BABYLON.Vector3(0, 1, 0));

    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    scene.imageProcessingConfiguration.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    scene.imageProcessingConfiguration.exposure = 0.95;
    scene.imageProcessingConfiguration.contrast = 1.05;
    scene.environmentIntensity = 0.35;
    scene.environmentTexture = BABYLON.CubeTexture.CreateFromPrefilteredData("https://playground.babylonjs.com/textures/environment.env", scene);

    var environmentRotationY = 0;

    function setEnvironmentRotationY(degrees) {
        environmentRotationY = Number(degrees) || 0;

        if (
            scene.environmentTexture &&
            scene.environmentTexture.setReflectionTextureMatrix
        ) {
            scene.environmentTexture.setReflectionTextureMatrix(
                BABYLON.Matrix.RotationY(
                    BABYLON.Tools.ToRadians(environmentRotationY)
                )
            );
        }
    }

    setEnvironmentRotationY(environmentRotationY);

    var light = new BABYLON.HemisphericLight(
        "light",
        new BABYLON.Vector3(0, 1, 0),
        scene
    );

    light.intensity = 0.45;
    light.diffuse = new BABYLON.Color3(1.0, 0.96, 0.90);
    light.groundColor = new BABYLON.Color3(0.16, 0.15, 0.14);
    light.specular = new BABYLON.Color3(0.25, 0.25, 0.25);

    var mainDirectionalLight = new BABYLON.DirectionalLight(
        "MainDirectionalLight",
        new BABYLON.Vector3(0.62, -0.72, 0.28),
        scene
    );

    mainDirectionalLight.position = new BABYLON.Vector3(-7, 10, -6);
    mainDirectionalLight.intensity = 0.85;
    mainDirectionalLight.diffuse = new BABYLON.Color3(1.0, 0.96, 0.90);
    mainDirectionalLight.specular = new BABYLON.Color3(0.35, 0.32, 0.28);

    // Stabilna projekcja cieni.
    // Auto bounds potrafia przeliczac zasieg mapy cieni i wtedy cien "skacze",
    // szczegolnie podczas zmiany parametrow filtrowania.
    mainDirectionalLight.autoUpdateExtends = false;
    mainDirectionalLight.autoCalcShadowZBounds = false;
    mainDirectionalLight.orthoLeft = -18;
    mainDirectionalLight.orthoRight = 18;
    mainDirectionalLight.orthoTop = 18;
    mainDirectionalLight.orthoBottom = -18;
    mainDirectionalLight.shadowMinZ = 0.5;
    mainDirectionalLight.shadowMaxZ = 45;

    var mainShadowGenerator = new BABYLON.ShadowGenerator(2048, mainDirectionalLight);

    // blurKernel w tym przypadku nie dawal stabilnego i widocznego efektu.
    // Do miekkosci uzywamy Contact Hardening / PCSS, ktore lepiej nadaje sie
    // do sterowania "soft shadow" suwakiem.
    mainShadowGenerator.useBlurExponentialShadowMap = false;
    mainShadowGenerator.useKernelBlur = false;
    mainShadowGenerator.usePercentageCloserFiltering = false;
    mainShadowGenerator.useContactHardeningShadow = true;
    mainShadowGenerator.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;

    mainShadowGenerator.darkness = 0.34;
    mainShadowGenerator.bias = 0.00005;
    mainShadowGenerator.normalBias = 0.02;
    mainShadowGenerator.depthScale = 50;

    if (mainShadowGenerator.getShadowMap()) {
        mainShadowGenerator.getShadowMap().refreshRate = BABYLON.RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME;
    }

    var shadowsEnabled = true;
    var shadowCasterMeshes = [];
    var mainShadowSoftnessValue = 34;
    var localLightingShadowsEnabled = true;
    var localSpotShadowMapSize = 1024;
    var localShadowRefreshThrottleMs = 90;
    var commonLightingMaxSimultaneousLights = 24;
    var localShadowCasterMeshes = [];
    var localShadowReceiverMeshes = [];


    function setMainShadowSoftness(value) {
        var softness = Number(value);

        if (!isFinite(softness)) {
            softness = 34;
        }

        softness = Math.max(0, Math.min(100, softness));
        mainShadowSoftnessValue = softness;

        // Zakres Babylonowego contactHardeningLightSizeUVRatio jest bardzo czuly.
        // 0.001 = prawie twardy cien, 0.085 = wyraznie miekki cien.
        mainShadowGenerator.useContactHardeningShadow = true;
        mainShadowGenerator.contactHardeningLightSizeUVRatio = 0.001 + (softness / 100) * 0.084;
        mainShadowGenerator.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;

        if (mainShadowGenerator.getShadowMap()) {
            mainShadowGenerator.getShadowMap().refreshRate = BABYLON.RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME;
        }
    }

    setMainShadowSoftness(mainShadowSoftnessValue);

    function refreshMainShadowRenderList() {
        var shadowMap = mainShadowGenerator.getShadowMap();

        if (!shadowMap) {
            return;
        }

        shadowMap.renderList = shadowsEnabled ? shadowCasterMeshes.slice() : [];
    }

    function setMainShadowsEnabled(isEnabled) {
        shadowsEnabled = !!isEnabled;
        refreshMainShadowRenderList();
    }

    function addMainShadowCaster(mesh) {
        if (!mesh || mesh.name === "__root__") {
            return;
        }

        if (!shadowCasterMeshes.includes(mesh)) {
            shadowCasterMeshes.push(mesh);
        }

        refreshMainShadowRenderList();
    }

    function setMeshReceiveShadows(mesh, shouldReceive) {
        if (!mesh || mesh.name === "__root__") {
            return;
        }

        mesh.receiveShadows = !!shouldReceive;
    }

    function configureMaterialForCommonLighting(material) {
        if (!material) {
            return;
        }

        // Babylon domyslnie liczy ograniczona liczbe swiatel na material.
        // Przy obrazach, rzezbach i nowych lampach recznie dodany Spot/Point mogl istniec,
        // ale shader materialu go ignorowal. To byl powod, dla ktorego nowe lampy
        // wygladaly jakby nie swiecily.
        if ("maxSimultaneousLights" in material) {
            material.maxSimultaneousLights = commonLightingMaxSimultaneousLights;
        }

        // Sciany z GLTF potrafia byc cienkie / jednostronne.
        // Dla glownego i lokalnego systemu cieni bezpieczniej jest nie wycinac backface.
        if ("backFaceCulling" in material) {
            material.backFaceCulling = false;
        }
    }

    function configureMeshMaterialForMainShadows(mesh) {
        if (!mesh || !mesh.material) {
            return;
        }

        configureMaterialForCommonLighting(mesh.material);
    }

    function refreshCommonLightingMaterialSupport() {
        scene.materials.forEach(function (material) {
            configureMaterialForCommonLighting(material);
        });

        scene.meshes.forEach(function (mesh) {
            if (mesh && mesh.material) {
                configureMaterialForCommonLighting(mesh.material);
            }
        });
    }

    function setupMeshForMainShadows(mesh, options) {
        if (!mesh || mesh.name === "__root__") {
            return;
        }

        options = options || {};

        configureMeshMaterialForMainShadows(mesh);

        if (options.receive) {
            setMeshReceiveShadows(mesh, true);
        }

        if (options.cast) {
            addMainShadowCaster(mesh);
        }
    }


    function refreshLocalShadowReceivers() {
        localShadowReceiverMeshes.forEach(function (mesh) {
            setMeshReceiveShadows(mesh, true);
        });
    }

    function configureShadowGeneratorForLocalSpot(shadowGenerator) {
        if (!shadowGenerator) {
            return;
        }

        shadowGenerator.useBlurExponentialShadowMap = false;
        shadowGenerator.useKernelBlur = false;
        shadowGenerator.usePoissonSampling = false;
        shadowGenerator.usePercentageCloserFiltering = true;
        shadowGenerator.useContactHardeningShadow = false;
        shadowGenerator.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
        shadowGenerator.bias = 0.00015;
        shadowGenerator.normalBias = 0.03;
        shadowGenerator.depthScale = 50;
        shadowGenerator.darkness = 0.02;
        shadowGenerator.forceBackFacesOnly = false;

        var shadowMap = shadowGenerator.getShadowMap();

        if (shadowMap) {
            // Nie renderujemy lokalnych shadow map co klatke.
            // To mocno obciazalo scene przy przesuwaniu obrazow i dawalo efekt
            // "przeladowywania" segmentow scian.
            shadowMap.refreshRate = BABYLON.RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
        }
    }

    function requestLocalSpotShadowRefresh(item, forceRefresh) {
        if (
            item &&
            item.localShadowGenerator &&
            item.localShadowGenerator.getShadowMap
        ) {
            var now = Date.now();

            if (!forceRefresh) {
                if (
                    item._lastLocalShadowRefreshRequest &&
                    now - item._lastLocalShadowRefreshRequest < localShadowRefreshThrottleMs
                ) {
                    return;
                }
            }

            item._lastLocalShadowRefreshRequest = now;

            var shadowMap = item.localShadowGenerator.getShadowMap();

            if (shadowMap) {
                shadowMap.refreshRate = BABYLON.RenderTargetTexture.REFRESHRATE_RENDER_ONCE;

                if (shadowMap.resetRefreshCounter) {
                    shadowMap.resetRefreshCounter();
                }
            }
        }
    }

    function requestAllLocalSpotShadowRefresh(forceRefresh) {
        localLightItems.forEach(function (item) {
            requestLocalSpotShadowRefresh(item, !!forceRefresh);
        });
    }

    function refreshLocalSpotShadowForItem(item) {
        if (!isLocalLightNativeShadowCapable(item)) {
            return;
        }

        if (!localLightingShadowsEnabled) {
            if (item.localShadowGenerator && item.localShadowGenerator.getShadowMap()) {
                item.localShadowGenerator.getShadowMap().renderList = [];
            }
            return;
        }

        if (!item.localShadowGenerator) {
            item.localShadowGenerator = new BABYLON.ShadowGenerator(
                localSpotShadowMapSize,
                item.light
            );

            configureShadowGeneratorForLocalSpot(item.localShadowGenerator);
        }

        var shadowGenerator = item.localShadowGenerator;
        configureShadowGeneratorForLocalSpot(shadowGenerator);

        var shadowMap = shadowGenerator.getShadowMap();

        if (!shadowMap) {
            return;
        }

        shadowMap.renderList = [];

        localShadowCasterMeshes.forEach(function (mesh) {
            if (!mesh || mesh.name === "__root__") {
                return;
            }

            if (shadowGenerator.addShadowCaster) {
                shadowGenerator.addShadowCaster(mesh, true);
            } else if (shadowMap.renderList.indexOf(mesh) === -1) {
                shadowMap.renderList.push(mesh);
            }
        });

        refreshLocalShadowReceivers();
        requestLocalSpotShadowRefresh(item, true);
    }

    function refreshAllLocalSpotShadows() {
        localLightItems.forEach(function (item) {
            if (!item) {
                return;
            }

            if (BABYLON.PointLight && item.light instanceof BABYLON.PointLight) {
                disableLocalPointLightShadow(item);
                return;
            }

            if (isLocalLightNativeShadowCapable(item)) {
                refreshLocalSpotShadowForItem(item);
            }
        });
    }

    function addLocalShadowCaster(mesh) {
        if (!mesh || mesh.name === "__root__") {
            return;
        }

        configureMeshMaterialForMainShadows(mesh);

        if (!localShadowCasterMeshes.includes(mesh)) {
            localShadowCasterMeshes.push(mesh);
        }

        // Nie odswiezamy tutaj wszystkich shadow map dla kazdego mesha osobno.
        // Import scian ma wiele segmentow, wiec robimy refresh zbiorczy po imporcie.
    }

    function addLocalShadowReceiver(mesh) {
        if (!mesh || mesh.name === "__root__") {
            return;
        }

        if (!localShadowReceiverMeshes.includes(mesh)) {
            localShadowReceiverMeshes.push(mesh);
        }

        setMeshReceiveShadows(mesh, true);
    }

    function setupMeshForLocalLightingShadows(mesh, options) {
        if (!mesh || mesh.name === "__root__") {
            return;
        }

        options = options || {};

        configureMeshMaterialForMainShadows(mesh);

        if (options.receive) {
            addLocalShadowReceiver(mesh);
        }

        if (options.cast) {
            addLocalShadowCaster(mesh);
        }
    }

    function registerCommonShadowMesh(mesh, options) {
        if (!mesh || mesh.name === "__root__") {
            return;
        }

        options = options || {};

        if (options.global) {
            setupMeshForMainShadows(mesh, {
                receive: !!options.receive,
                cast: !!options.cast
            });
        }

        if (options.local) {
            setupMeshForLocalLightingShadows(mesh, {
                receive: !!options.receive,
                cast: !!options.cast
            });
        }
    }

    function disableLocalPointLightShadow(item) {
        if (!item || !item.light) {
            return;
        }

        if (!(BABYLON.PointLight && item.light instanceof BABYLON.PointLight)) {
            return;
        }

        if (item.localShadowGenerator) {
            try {
                var shadowMap = item.localShadowGenerator.getShadowMap();

                if (shadowMap) {
                    shadowMap.renderList = [];
                }
            } catch (error) {
                console.warn("Point shadow cleanup warning:", error);
            }

            if (item.localShadowGenerator.dispose) {
                item.localShadowGenerator.dispose();
            }

            item.localShadowGenerator = null;
        }
    }

    function isLocalLightNativeShadowCapable(item) {
        if (!item || !item.light) {
            return false;
        }

        // W Etapie 5 Point Light jest tylko swiatlem wypelniajacym / akcentowym.
        // Natywne cienie lokalne zostaja wylacznie dla Spot Light.
        if (BABYLON.PointLight && item.light instanceof BABYLON.PointLight) {
            disableLocalPointLightShadow(item);
            return false;
        }

        if (BABYLON.SpotLight && item.light instanceof BABYLON.SpotLight) {
            return true;
        }

        return false;
    }

    function ensureCommonLightShadowLogic(item) {
        if (!item || !item.light) {
            return;
        }

        if (isLocalLightNativeShadowCapable(item)) {
            refreshLocalSpotShadowForItem(item);
        }
    }

    function setMainDirectionalAngles(horizontalDegrees, verticalDegrees) {
        var horizontal = Number(horizontalDegrees);
        var vertical = Number(verticalDegrees);

        if (!isFinite(horizontal)) {
            horizontal = 0;
        }

        if (!isFinite(vertical)) {
            vertical = 45;
        }

        vertical = Math.max(1, Math.min(89, vertical));

        var horizontalRad = BABYLON.Tools.ToRadians(horizontal);
        var verticalRad = BABYLON.Tools.ToRadians(vertical);

        var horizontalLength = Math.cos(verticalRad);

        mainDirectionalLight.direction = new BABYLON.Vector3(
            Math.sin(horizontalRad) * horizontalLength,
            -Math.sin(verticalRad),
            Math.cos(horizontalRad) * horizontalLength
        ).normalize();
    }

    function getMainDirectionalAngles() {
        var direction = mainDirectionalLight.direction.clone();

        if (direction.length() === 0) {
            return {
                horizontal: 0,
                vertical: 45
            };
        }

        direction.normalize();

        return {
            horizontal: BABYLON.Tools.ToDegrees(
                Math.atan2(direction.x, direction.z)
            ),
            vertical: BABYLON.Tools.ToDegrees(
                Math.asin(Math.max(-1, Math.min(1, -direction.y)))
            )
        };
    }

    canvas.addEventListener("contextmenu", (e) => {
        e.preventDefault();
    });

    // UI ANCHOR FIX
    // Elementy UI galerii nie moga byc przyklejone do calego viewportu strony,
    // bo podczas scrollowania podazaly za uzytkownikiem poza sekcje 3D.
    // Od teraz panele, przycisk edycji i joystick sa przypiete do kontenera canvasu
    // czyli do sekcji galerii, a nie do document.body.
    function getGalleryUiRoot() {
        if (canvas && canvas.parentElement) {
            return canvas.parentElement;
        }

        return document.getElementById("gallerySection") || document.body;
    }

    function prepareGalleryUiRoot() {
        var galleryUiRoot = getGalleryUiRoot();

        if (!galleryUiRoot || galleryUiRoot === document.body) {
            return galleryUiRoot || document.body;
        }

        var rootPosition = "relative";

        try {
            rootPosition = window.getComputedStyle(galleryUiRoot).position;
        } catch (error) {
            rootPosition = galleryUiRoot.style.position || "relative";
        }

        if (!rootPosition || rootPosition === "static") {
            galleryUiRoot.style.position = "relative";
        }

        return galleryUiRoot;
    }

    function appendGalleryUiElement(element) {
        if (!element) {
            return;
        }

        prepareGalleryUiRoot().appendChild(element);
    }

    var floorMeshes = [];
    var wallMeshes = [];
    var ceilingMeshes = [];
    var propMeshes = [];
    var artSpheres = [];
    var artworks = [];
    var artworkLights = [];
    var artworkCreateCounter = 0;
    var deletedArtworkNames = [];
    var artworkAuthors = [];

    // STAGE 9B - VIEWER BUILT-IN COLLISION STEP 1
    // Poprzedni Stage 9 zepsul chodzenie, bo dodal agresywny custom guard
    // i reczne cofanie kamery. Tutaj uzywamy tylko natywnego systemu Babylon:
    // scene.collisionsEnabled + camera.checkCollisions + mesh.checkCollisions.
    var viewerCollisionRadius = 0.34;
    var viewerCollisionHeight = 0.72;
    var viewerCollisionTargets = {
        walls: true,
        // Stage 9C: na tym etapie blokujemy tylko ściany.
        // Obiekty, obrazy i rzeźby zostają wyłączone, żeby nie psuć chodzenia.
        props: false,
        artworks: false,
        sculptures: false
    };

    var viewerWallBlockRadius = 0.72;
    var viewerWallRayExtraDistance = 1.08;
    var viewerWallVisualStopDistance = 0.82;
    var viewerWallLastSafeCameraPosition = camera.position.clone();

    scene.collisionsEnabled = true;
    camera.ellipsoid = new BABYLON.Vector3(
        viewerCollisionRadius,
        viewerCollisionHeight,
        viewerCollisionRadius
    );
    camera.ellipsoidOffset = new BABYLON.Vector3(0, 0, 0);

    function isViewerCollisionActive() {
        return !editMode;
    }

    function updateViewerCollisionMode() {
        scene.collisionsEnabled = true;
        camera.checkCollisions = isViewerCollisionActive();
    }

    function canUseViewerCollisionMesh(mesh) {
        if (!mesh || mesh.name === "__root__") {
            return false;
        }

        if (mesh.isDisposed && mesh.isDisposed()) {
            return false;
        }

        if (mesh.metadata && mesh.metadata.deletedArtwork) {
            return false;
        }

        return true;
    }

    function isViewerCollisionTargetEnabled(type) {
        if (type === "wall") {
            return !!viewerCollisionTargets.walls;
        }

        if (type === "prop") {
            return !!viewerCollisionTargets.props;
        }

        if (type === "artwork") {
            return !!viewerCollisionTargets.artworks;
        }

        if (type === "pedestal" || type === "sculpture") {
            return !!viewerCollisionTargets.sculptures;
        }

        return false;
    }

    function registerViewerCollisionMesh(mesh, type) {
        type = type || "generic";

        if (!canUseViewerCollisionMesh(mesh)) {
            return;
        }

        mesh.metadata = mesh.metadata || {};

        if (!isViewerCollisionTargetEnabled(type)) {
            if (mesh.metadata.viewerCollisionType === type) {
                mesh.metadata.viewerCollisionType = "";
            }

            mesh.checkCollisions = false;
            return;
        }

        mesh.metadata.viewerCollisionType = type;
        mesh.checkCollisions = true;
    }

    function unregisterViewerCollisionMesh(mesh) {
        if (!mesh) {
            return;
        }

        mesh.checkCollisions = false;

        if (mesh.metadata) {
            mesh.metadata.viewerCollisionType = "";
        }
    }

    function refreshViewerCollisionMeshes() {
        if (viewerCollisionTargets.walls) {
            wallMeshes.forEach(function (mesh) {
                registerViewerCollisionMesh(mesh, "wall");
            });
        }

        if (viewerCollisionTargets.props) {
            propMeshes.forEach(function (mesh) {
                registerViewerCollisionMesh(mesh, "prop");
            });
        }

        if (viewerCollisionTargets.artworks) {
            getActiveArtworks().forEach(function (artwork) {
                registerViewerCollisionMesh(artwork, "artwork");
            });
        }

        if (viewerCollisionTargets.sculptures) {
            artSpheres.forEach(function (displayMesh) {
                registerViewerCollisionMesh(displayMesh, "pedestal");

                if (
                    displayMesh &&
                    displayMesh.metadata &&
                    displayMesh.metadata.sculptureMesh
                ) {
                    registerViewerCollisionMesh(displayMesh.metadata.sculptureMesh, "sculpture");
                }
            });
        }
    }

    function moveCameraWithViewerCollisionIfActive(deltaVector) {
        if (!deltaVector || deltaVector.lengthSquared() <= 0) {
            return false;
        }

        if (isViewerCollisionActive() && camera.moveWithCollisions) {
            camera.moveWithCollisions(deltaVector);
            return true;
        }

        camera.position.addInPlace(deltaVector);
        return true;
    }

    // STAGE 9C - WALL RAYCAST BLOCKER
    // Natywne checkCollisions nie zatrzymało kamery na ścianach.
    // Zamiast szerokiego AABB całego wall.gltf używamy raycastu po faktycznej geometrii ściany.
    function isViewerWallBlockActive() {
        return isViewerCollisionActive() && viewerCollisionTargets.walls;
    }

    function getViewerWallCollisionMeshes() {
        return wallMeshes.filter(function (mesh) {
            return canUseViewerCollisionMesh(mesh);
        });
    }

    function getViewerHorizontalPerpendicular(direction) {
        return new BABYLON.Vector3(-direction.z, 0, direction.x);
    }

    function isViewerWallHitBetweenPositions(fromPosition, toPosition) {
        if (!isViewerWallBlockActive()) {
            return false;
        }

        if (!fromPosition || !toPosition) {
            return false;
        }

        var wallCollisionMeshes = getViewerWallCollisionMeshes();

        if (!wallCollisionMeshes.length) {
            return false;
        }

        var movement = toPosition.subtract(fromPosition);
        movement.y = 0;

        var movementLength = movement.length();

        if (movementLength <= 0.0001) {
            return false;
        }

        var direction = movement.normalize();
        var perpendicular = getViewerHorizontalPerpendicular(direction);

        if (perpendicular.lengthSquared() > 0) {
            perpendicular.normalize();
        }

        // Stage 9D:
        // Nie wystarczy sprawdzić, czy kamera PRZESZŁA przez ścianę.
        // Musimy też zatrzymać ją wcześniej, bo inaczej near-plane kamery
        // zaczyna clipować przez powierzchnię i widać wnętrze galerii przez ścianę.
        var safetyDistance = Math.max(
            viewerWallRayExtraDistance,
            viewerWallVisualStopDistance
        );

        var offsets = [
            BABYLON.Vector3.Zero(),
            perpendicular.scale(viewerWallBlockRadius),
            perpendicular.scale(-viewerWallBlockRadius),
            perpendicular.scale(viewerWallBlockRadius * 0.5),
            perpendicular.scale(-viewerWallBlockRadius * 0.5),
            direction.scale(viewerWallBlockRadius * 0.35)
        ];

        for (var i = 0; i < offsets.length; i++) {
            var origin = fromPosition.add(offsets[i]);
            var target = toPosition.add(offsets[i]);
            var rayDirection = target.subtract(origin);
            rayDirection.y = 0;

            var rayLength = rayDirection.length();

            if (rayLength <= 0.0001) {
                continue;
            }

            rayDirection.normalize();

            var ray = new BABYLON.Ray(
                origin,
                rayDirection,
                rayLength + safetyDistance
            );

            var hit = scene.pickWithRay(
                ray,
                function (mesh) {
                    return wallCollisionMeshes.indexOf(mesh) !== -1;
                }
            );

            if (
                hit &&
                hit.hit &&
                hit.pickedMesh &&
                hit.distance <= rayLength + safetyDistance
            ) {
                return true;
            }
        }

        return false;
    }

    function isViewerWallTooCloseAtPosition(position, movementDirection) {
        if (!isViewerWallBlockActive()) {
            return false;
        }

        var wallCollisionMeshes = getViewerWallCollisionMeshes();

        if (!wallCollisionMeshes.length || !position) {
            return false;
        }

        var directions = [];

        if (
            movementDirection &&
            movementDirection.lengthSquared &&
            movementDirection.lengthSquared() > 0.0001
        ) {
            var forward = movementDirection.clone();
            forward.y = 0;

            if (forward.lengthSquared() > 0.0001) {
                forward.normalize();
                var side = getViewerHorizontalPerpendicular(forward);

                if (side.lengthSquared() > 0.0001) {
                    side.normalize();
                }

                directions.push(forward);
                directions.push(side);
                directions.push(side.scale(-1));
            }
        }

        // Dodatkowe kierunki bezpieczeństwa. Dzięki temu clipping boczny przy narożnikach
        // jest też wykrywany.
        directions.push(new BABYLON.Vector3(1, 0, 0));
        directions.push(new BABYLON.Vector3(-1, 0, 0));
        directions.push(new BABYLON.Vector3(0, 0, 1));
        directions.push(new BABYLON.Vector3(0, 0, -1));

        // Stage 9E: dodatkowe raycasty po przekątnych pomagają przy narożnikach
        // i cienkich krawędziach ścian, gdzie clipping jest najbardziej widoczny.
        directions.push(new BABYLON.Vector3(1, 0, 1));
        directions.push(new BABYLON.Vector3(1, 0, -1));
        directions.push(new BABYLON.Vector3(-1, 0, 1));
        directions.push(new BABYLON.Vector3(-1, 0, -1));

        for (var i = 0; i < directions.length; i++) {
            var direction = directions[i];

            if (!direction || direction.lengthSquared() <= 0.0001) {
                continue;
            }

            direction = direction.normalize();

            var ray = new BABYLON.Ray(
                position,
                direction,
                viewerWallVisualStopDistance
            );

            var hit = scene.pickWithRay(
                ray,
                function (mesh) {
                    return wallCollisionMeshes.indexOf(mesh) !== -1;
                }
            );

            if (
                hit &&
                hit.hit &&
                hit.pickedMesh &&
                hit.distance <= viewerWallVisualStopDistance
            ) {
                return true;
            }
        }

        return false;
    }

    function isViewerCameraPositionSafeAgainstWalls(position) {
        if (!viewerWallLastSafeCameraPosition) {
            return true;
        }

        var movementDirection = position.subtract(viewerWallLastSafeCameraPosition);
        movementDirection.y = 0;

        if (
            isViewerWallHitBetweenPositions(
                viewerWallLastSafeCameraPosition,
                position
            )
        ) {
            return false;
        }

        if (isViewerWallTooCloseAtPosition(position, movementDirection)) {
            return false;
        }

        return true;
    }

    function resolveViewerWallCollisionAfterMovement() {
        if (!isViewerWallBlockActive()) {
            viewerWallLastSafeCameraPosition = camera.position.clone();
            return;
        }

        if (!viewerWallLastSafeCameraPosition) {
            viewerWallLastSafeCameraPosition = camera.position.clone();
            return;
        }

        var currentPosition = camera.position.clone();

        if (isViewerCameraPositionSafeAgainstWalls(currentPosition)) {
            viewerWallLastSafeCameraPosition = currentPosition;
            return;
        }

        // Sliding fallback: jeżeli pełny ruch przeciął ścianę,
        // próbujemy zachować tylko X albo tylko Z. Dzięki temu chodzenie wzdłuż ściany
        // nie zamienia się w całkowite zablokowanie ruchu.
        var slideX = new BABYLON.Vector3(
            currentPosition.x,
            viewerWallLastSafeCameraPosition.y,
            viewerWallLastSafeCameraPosition.z
        );

        var slideZ = new BABYLON.Vector3(
            viewerWallLastSafeCameraPosition.x,
            viewerWallLastSafeCameraPosition.y,
            currentPosition.z
        );

        if (!isViewerWallHitBetweenPositions(viewerWallLastSafeCameraPosition, slideX)) {
            camera.position.copyFrom(slideX);
            viewerWallLastSafeCameraPosition = camera.position.clone();
            return;
        }

        if (!isViewerWallHitBetweenPositions(viewerWallLastSafeCameraPosition, slideZ)) {
            camera.position.copyFrom(slideZ);
            viewerWallLastSafeCameraPosition = camera.position.clone();
            return;
        }

        camera.position.copyFrom(viewerWallLastSafeCameraPosition);
    }

    updateViewerCollisionMode();

    var lampCeilingY = -0.55;
    var lampCubeY = -1.2;
    var lampDistanceFromWall = 2.0;

    var unifiedSpotDefaults = {
        intensity: 57.2,
        range: 13.8,
        angleDegrees: 61,
        blend: 0.66
    };

    function getSpotBlendFromExponent(exponent) {
        var safeExponent = isFinite(exponent) ? Number(exponent) : 1.0;
        var normalized = Math.min(Math.max((safeExponent - 0.5) / 127.5, 0), 1);

        return Math.sqrt(normalized);
    }

    function getExponentFromSpotBlend(blend) {
        var safeBlend = Math.max(0, Math.min(1, Number(blend)));

        return 0.5 + Math.pow(safeBlend, 2) * 127.5;
    }

    function forceStandardSpotFalloff(light) {
        if (
            light &&
            BABYLON.Light &&
            BABYLON.Light.FALLOFF_STANDARD !== undefined
        ) {
            light.falloffType = BABYLON.Light.FALLOFF_STANDARD;
        }
    }

    function createUnifiedSpotLight(name, position, direction, options) {
        options = options || {};

        var spotBlend = options.blend !== undefined
            ? options.blend
            : unifiedSpotDefaults.blend;

        var angleDegrees = options.angleDegrees !== undefined
            ? options.angleDegrees
            : unifiedSpotDefaults.angleDegrees;

        var spotLight = new BABYLON.SpotLight(
            name,
            position.clone(),
            direction.clone(),
            BABYLON.Tools.ToRadians(angleDegrees),
            getExponentFromSpotBlend(spotBlend),
            scene
        );

        forceStandardSpotFalloff(spotLight);

        spotLight.intensity = options.intensity !== undefined
            ? options.intensity
            : unifiedSpotDefaults.intensity;

        spotLight.range = options.range !== undefined
            ? options.range
            : unifiedSpotDefaults.range;

        spotLight.shadowMinZ = 0.05;
        spotLight.shadowMaxZ = spotLight.range + 2;

        spotLight.diffuse = options.diffuse || new BABYLON.Color3(1.0, 0.94, 0.82);
        spotLight.specular = options.specular || new BABYLON.Color3(0.10, 0.08, 0.05);

        return {
            light: spotLight,
            blend: spotBlend,
            range: spotLight.range
        };
    }

    function getLocalLightItemByLight(light) {
        if (!light) {
            return null;
        }

        return localLightItems.find(function (localLightItem) {
            return localLightItem.light === light;
        }) || null;
    }

    function getSpotTargetPointForDisplay(ownerMesh) {
        if (!ownerMesh) {
            return new BABYLON.Vector3(0, -2.5, 0);
        }

        if (artworks.indexOf(ownerMesh) >= 0) {
            return ownerMesh.position.clone();
        }

        if (
            ownerMesh.metadata &&
            ownerMesh.metadata.sculptureMesh &&
            ownerMesh.metadata.sculptureMesh.getAbsolutePosition
        ) {
            return ownerMesh.metadata.sculptureMesh.getAbsolutePosition().clone();
        }

        return ownerMesh.position.add(new BABYLON.Vector3(0, 0.95, 0));
    }

    function getSpotIncludedMeshesForDisplay(ownerMesh) {
        var includedMeshes = [];

        if (!ownerMesh) {
            return includedMeshes;
        }

        includedMeshes.push(ownerMesh);

        if (artworks.indexOf(ownerMesh) >= 0) {
            var wallMesh = getWallMeshForArtwork(ownerMesh);

            if (wallMesh) {
                includedMeshes.push(wallMesh);
            }

            floorMeshes.forEach(function (floorMesh) {
                includedMeshes.push(floorMesh);
            });
        } else {
            if (ownerMesh.metadata && ownerMesh.metadata.sculptureMesh) {
                includedMeshes.push(ownerMesh.metadata.sculptureMesh);
            }

            floorMeshes.forEach(function (floorMesh) {
                includedMeshes.push(floorMesh);
            });
        }

        return includedMeshes.filter(function (mesh, index, array) {
            return mesh && array.indexOf(mesh) === index;
        });
    }

    function addMeshUnique(targetList, mesh) {
        if (!mesh || mesh.name === "__root__") {
            return;
        }

        if (targetList.indexOf(mesh) === -1) {
            targetList.push(mesh);
        }
    }

    function addMeshArrayUnique(targetList, meshes) {
        (meshes || []).forEach(function (mesh) {
            addMeshUnique(targetList, mesh);
        });
    }

    // STAGE 10B - WALL SEGMENT LIGHT TARGETING
    // Teraz wall model jest podzielony na Wall_segment_001 - Wall_segment_071.
    // Local Lights z targetem Walls nie powinny już trafiać we wszystkie wallMeshes,
    // tylko w najbliższe segmenty ściany.
    var localLightWallSegmentTargetingEnabled = true;
    // STAGE 10C:
    // Poprzednio limit 5 oznaczał: jedna lampa -> maksymalnie 5 segmentów.
    // To dawało twarde odcięcia światła na granicach segmentów.
    // Teraz limit oznacza: jeden segment -> maksymalnie 5 świateł.
    var localLightWallSegmentMaxLightsPerSegment = 5;
    var localLightWallSegmentTargetMaxCount = 14;
    var localLightWallSegmentTargetRadius = 8.5;
    var localLightWallSegmentSoftEdgeExtraRadius = 2.0;
    var localLightWallSegmentBudgetPassActive = false;
    var localLightWallSegmentBudgetMap = {};

    // STAGE 10F - DYNAMIC WALL SEGMENT RETARGETING WHILE MOVING LOCAL LIGHTS
    // Lampa nie może zostać przypisana raz na stałe do starych segmentów.
    // Podczas przesuwania/rotacji ręcznej targetowanie segmentów ma być przeliczane,
    // ale nadal obowiązuje zasada: jeden segment -> maksymalnie 5 świateł.
    var localLightDynamicWallRetargetEnabled = true;
    var localLightDynamicWallRetargetThrottleMs = 80;
    var localLightDynamicWallRetargetLastTime = 0;
    var localLightDynamicWallRetargetCount = 0;
    var localLightDynamicWallRetargetLastReason = null;

    function isLightingWallSegmentMesh(mesh) {
        return !!(
            mesh &&
            mesh.name &&
            mesh.name.indexOf("Wall_segment_") === 0
        );
    }

    function getLightingWallSegmentMeshes() {
        return wallMeshes.filter(function (mesh) {
            return isLightingWallSegmentMesh(mesh);
        });
    }

    function getMeshWorldCenter(mesh) {
        if (!mesh || !mesh.getBoundingInfo) {
            return mesh && mesh.position ? mesh.position.clone() : BABYLON.Vector3.Zero();
        }

        try {
            mesh.computeWorldMatrix(true);

            var boundingInfo = mesh.getBoundingInfo();

            if (
                boundingInfo &&
                boundingInfo.boundingBox &&
                boundingInfo.boundingBox.centerWorld
            ) {
                return boundingInfo.boundingBox.centerWorld.clone();
            }
        } catch (error) {
            console.warn("Wall segment center warning:", error);
        }

        return mesh.position ? mesh.position.clone() : BABYLON.Vector3.Zero();
    }

    function getLocalLightPosition(item) {
        if (item && item.light && item.light.position) {
            return item.light.position.clone();
        }

        if (item && item.markerMesh && item.markerMesh.position) {
            return item.markerMesh.position.clone();
        }

        if (item && item.ownerMesh && item.ownerMesh.position) {
            return item.ownerMesh.position.clone();
        }

        return camera.position.clone();
    }

    // STAGE 10E - CAMERA VIEW LOCAL LIGHT CULLING TEST
    // Test optymalizacji: Local Light działa tylko, gdy znajduje się w środkowej części widoku kamery.
    // Na próbę ustawione na 2/3 kadru, żeby efekt był łatwy do zauważenia.
    var localLightCameraCullingEnabled = true;
    var localLightCameraCullingViewScale = 1.0; // STAGE 10E2 - full camera view
    var localLightCameraCullingCheckEveryFrames = 1;
    var localLightCameraCullingFrameCounter = 0;

    // STAGE 10E3 - SMOOTH CAMERA LIGHT FADE
    // Camera culling nie robi już natychmiastowego intensity 0 / userIntensity.
    // Zamiast tego światło płynnie dochodzi do target intensity.
    var localLightCameraCullingSmoothFadeEnabled = true;
    var localLightCameraCullingFadeInSpeed = 7.5;
    var localLightCameraCullingFadeOutSpeed = 5.0;
    var localLightCameraCullingSnapEpsilon = 0.003;

    // STAGE 10G - BEAM / TARGET AWARE CAMERA CULLING
    // Nie wystarczy sprawdzać pozycji lampy. Jeśli patrzymy na ścianę/obraz,
    // który lampa oświetla, albo na promień/stożek światła, lampa ma zostać aktywna.
    var localLightCameraCullingBeamAwareEnabled = true;
    var localLightCameraCullingMaxTargetMeshSamples = 10;
    var localLightCameraCullingPointLightSampleRadiusFactor = 0.35;

    function getLocalLightUserEnabled(item) {
        if (!item) {
            return false;
        }

        if (item.userEnabled !== undefined) {
            return !!item.userEnabled;
        }

        if (item.light && item.light.isEnabled) {
            item.userEnabled = !!item.light.isEnabled();
            return item.userEnabled;
        }

        item.userEnabled = true;
        return true;
    }

    // STAGE 10E1 - CAMERA CULLING WITHOUT LIGHT SETENABLED FLICKER
    // Camera culling nie wyłącza już świateł przez setEnabled(true/false),
    // bo to potrafi wymuszać przebudowę materiałów i wygląda jak przeładowanie tekstur.
    // Zamiast tego światło zostaje enabled, a runtime intensity spada do 0.
    function getLocalLightUserIntensity(item) {
        if (!item || !item.light) {
            return 0;
        }

        if (item.userIntensity !== undefined) {
            return Number(item.userIntensity) || 0;
        }

        item.userIntensity = Number(item.light.intensity) || 0;
        return item.userIntensity;
    }

    function setLocalLightUserIntensity(item, value) {
        if (!item || !item.light) {
            return;
        }

        item.userIntensity = Math.max(0, Number(value) || 0);

        if (!item.cameraCulled && getLocalLightUserEnabled(item)) {
            item.light.intensity = item.userIntensity;
        }
    }

    function isProjectedPointInsideCameraCullingViewport(point, viewportInfo) {
        var projected = BABYLON.Vector3.Project(
            point,
            BABYLON.Matrix.Identity(),
            scene.getTransformMatrix(),
            viewportInfo.viewport
        );

        var inside =
            projected.z >= 0 &&
            projected.z <= 1 &&
            projected.x >= viewportInfo.minX &&
            projected.x <= viewportInfo.maxX &&
            projected.y >= viewportInfo.minY &&
            projected.y <= viewportInfo.maxY;

        return {
            inside: inside,
            screenX: Math.round(projected.x),
            screenY: Math.round(projected.y),
            screenZ: Number(projected.z.toFixed ? projected.z.toFixed(4) : projected.z)
        };
    }

    function addLocalLightCameraCullingSample(samples, label, point) {
        if (!point || !isFinite(point.x) || !isFinite(point.y) || !isFinite(point.z)) {
            return;
        }

        samples.push({
            label: label,
            point: point.clone ? point.clone() : point
        });
    }

    function getLocalLightCameraCullingSamples(item) {
        var samples = [];
        var lightPosition = getLocalLightPosition(item);

        addLocalLightCameraCullingSample(samples, "lightPosition", lightPosition);

        if (
            localLightCameraCullingBeamAwareEnabled &&
            item &&
            item.light
        ) {
            if (item.type === "spot" && item.light.direction) {
                var direction = item.light.direction.clone();

                if (direction.length() > 0.0001) {
                    direction.normalize();

                    var range = item.light.range && isFinite(item.light.range)
                        ? item.light.range
                        : 8;

                    [0.20, 0.40, 0.65, 0.90].forEach(function (factor) {
                        addLocalLightCameraCullingSample(
                            samples,
                            "spotBeam_" + factor,
                            lightPosition.add(direction.scale(range * factor))
                        );
                    });
                }
            } else if (item.type === "point") {
                var pointRange = item.light.range && isFinite(item.light.range)
                    ? item.light.range
                    : 8;

                var radius = Math.max(
                    0.5,
                    pointRange * localLightCameraCullingPointLightSampleRadiusFactor
                );

                addLocalLightCameraCullingSample(
                    samples,
                    "pointRadius_forward",
                    lightPosition.add(camera.getDirection(new BABYLON.Vector3(0, 0, 1)).scale(radius))
                );
                addLocalLightCameraCullingSample(
                    samples,
                    "pointRadius_right",
                    lightPosition.add(camera.getDirection(new BABYLON.Vector3(1, 0, 0)).scale(radius))
                );
                addLocalLightCameraCullingSample(
                    samples,
                    "pointRadius_left",
                    lightPosition.add(camera.getDirection(new BABYLON.Vector3(-1, 0, 0)).scale(radius))
                );
            }

            if (item.light.includedOnlyMeshes && item.light.includedOnlyMeshes.length) {
                item.light.includedOnlyMeshes.slice(0, localLightCameraCullingMaxTargetMeshSamples).forEach(function (mesh, index) {
                    if (!mesh || mesh.isDisposed && mesh.isDisposed()) {
                        return;
                    }

                    addLocalLightCameraCullingSample(
                        samples,
                        "targetMesh_" + index + "_" + mesh.name,
                        getMeshWorldCenter(mesh)
                    );
                });
            }

            if (item.ownerMesh) {
                addLocalLightCameraCullingSample(
                    samples,
                    "ownerMesh_" + item.ownerMesh.name,
                    getMeshWorldCenter(item.ownerMesh)
                );
            }
        }

        return samples;
    }

    function getLocalLightCameraCullingViewportData(item) {
        if (
            !item ||
            !scene ||
            !scene.getTransformMatrix ||
            !engine ||
            !engine.getRenderWidth ||
            !engine.getRenderHeight
        ) {
            return {
                inside: true,
                reason: "missingSceneData"
            };
        }

        var width = Math.max(1, engine.getRenderWidth());
        var height = Math.max(1, engine.getRenderHeight());
        var viewport = camera.viewport.toGlobal(width, height);
        var margin = (1 - localLightCameraCullingViewScale) * 0.5;
        var viewportInfo = {
            viewport: viewport,
            minX: width * margin,
            maxX: width * (1 - margin),
            minY: height * margin,
            maxY: height * (1 - margin)
        };

        var samples = getLocalLightCameraCullingSamples(item);
        var projectedSamples = [];
        var firstInsideSample = null;

        try {
            samples.forEach(function (sample) {
                var projected = isProjectedPointInsideCameraCullingViewport(
                    sample.point,
                    viewportInfo
                );

                projected.label = sample.label;
                projectedSamples.push(projected);

                if (!firstInsideSample && projected.inside) {
                    firstInsideSample = projected;
                }
            });
        } catch (error) {
            return {
                inside: true,
                reason: "projectionError"
            };
        }

        var inside = !!firstInsideSample;
        var fallbackSample = projectedSamples.length ? projectedSamples[0] : null;

        return {
            inside: inside,
            reason: inside
                ? ("insideCameraView:" + firstInsideSample.label)
                : "outsideCameraView",
            matchedSampleLabel: firstInsideSample ? firstInsideSample.label : null,
            screenX: firstInsideSample
                ? firstInsideSample.screenX
                : (fallbackSample ? fallbackSample.screenX : null),
            screenY: firstInsideSample
                ? firstInsideSample.screenY
                : (fallbackSample ? fallbackSample.screenY : null),
            screenZ: firstInsideSample
                ? firstInsideSample.screenZ
                : (fallbackSample ? fallbackSample.screenZ : null),
            minX: Math.round(viewportInfo.minX),
            maxX: Math.round(viewportInfo.maxX),
            minY: Math.round(viewportInfo.minY),
            maxY: Math.round(viewportInfo.maxY),
            viewScale: localLightCameraCullingViewScale,
            beamAware: localLightCameraCullingBeamAwareEnabled,
            sampleCount: samples.length,
            insideSampleCount: projectedSamples.filter(function (sample) {
                return !!sample.inside;
            }).length,
            sampleLabels: projectedSamples.map(function (sample) {
                return sample.label + ":" + (sample.inside ? "in" : "out");
            })
        };
    }

    function shouldLocalLightBeRuntimeEnabled(item) {
        if (!getLocalLightUserEnabled(item)) {
            return false;
        }

        if (!localLightCameraCullingEnabled) {
            item.cameraCulled = false;
            item._cameraCullingDebug = {
                inside: true,
                reason: "disabled"
            };
            return true;
        }

        var viewportData = getLocalLightCameraCullingViewportData(item);
        item._cameraCullingDebug = viewportData;
        item.cameraCulled = !viewportData.inside;

        return viewportData.inside;
    }

    function getLocalLightRuntimeTargetIntensity(item) {
        if (!item || !item.light) {
            return 0;
        }

        var userEnabled = getLocalLightUserEnabled(item);
        var runtimeEnabled = shouldLocalLightBeRuntimeEnabled(item);

        if (!userEnabled) {
            return 0;
        }

        return runtimeEnabled ? getLocalLightUserIntensity(item) : 0;
    }

    function applyLocalLightRuntimeEnabled(item) {
        if (!item || !item.light) {
            return;
        }

        var userEnabled = getLocalLightUserEnabled(item);
        var targetIntensity = getLocalLightRuntimeTargetIntensity(item);

        item.runtimeTargetIntensity = targetIntensity;

        if (!userEnabled) {
            if (item.light.setEnabled && item.light.isEnabled && item.light.isEnabled()) {
                item.light.setEnabled(false);
            }

            item.light.intensity = 0;
            item.runtimeCurrentIntensity = 0;
            return;
        }

        if (item.light.setEnabled && item.light.isEnabled && !item.light.isEnabled()) {
            item.light.setEnabled(true);
        }

        if (!localLightCameraCullingSmoothFadeEnabled) {
            item.light.intensity = targetIntensity;
            item.runtimeCurrentIntensity = targetIntensity;
            return;
        }

        if (item.runtimeCurrentIntensity === undefined) {
            item.runtimeCurrentIntensity = Number(item.light.intensity) || 0;
        }
    }

    function updateLocalLightSmoothIntensity(item, deltaSeconds) {
        if (!item || !item.light || !getLocalLightUserEnabled(item)) {
            return;
        }

        var targetIntensity = item.runtimeTargetIntensity !== undefined
            ? item.runtimeTargetIntensity
            : getLocalLightRuntimeTargetIntensity(item);

        var currentIntensity = Number(item.light.intensity) || 0;
        var speed = targetIntensity > currentIntensity
            ? localLightCameraCullingFadeInSpeed
            : localLightCameraCullingFadeOutSpeed;

        var alpha = 1 - Math.exp(-Math.max(0.0001, speed) * Math.max(0, deltaSeconds));
        var nextIntensity = currentIntensity + (targetIntensity - currentIntensity) * alpha;

        if (Math.abs(nextIntensity - targetIntensity) <= localLightCameraCullingSnapEpsilon) {
            nextIntensity = targetIntensity;
        }

        item.runtimeCurrentIntensity = nextIntensity;
        item.light.intensity = nextIntensity;
    }

    function updateLocalLightsCameraCulling(force) {
        if (!localLightItems || !localLightItems.length) {
            return;
        }

        localLightCameraCullingFrameCounter += 1;

        var shouldRefreshCulling =
            force ||
            localLightCameraCullingCheckEveryFrames <= 1 ||
            localLightCameraCullingFrameCounter % localLightCameraCullingCheckEveryFrames === 0;

        var deltaSeconds = engine && engine.getDeltaTime
            ? Math.min(0.1, engine.getDeltaTime() / 1000)
            : 1 / 60;

        localLightItems.forEach(function (item) {
            if (shouldRefreshCulling) {
                applyLocalLightRuntimeEnabled(item);
            }

            updateLocalLightSmoothIntensity(item, deltaSeconds);
        });
    }

    function getLocalLightCameraCullingDebug() {
        updateLocalLightsCameraCulling(true);

        return {
            enabled: localLightCameraCullingEnabled,
            viewScale: localLightCameraCullingViewScale,
            checkEveryFrames: localLightCameraCullingCheckEveryFrames,
            smoothFadeEnabled: localLightCameraCullingSmoothFadeEnabled,
            fadeInSpeed: localLightCameraCullingFadeInSpeed,
            fadeOutSpeed: localLightCameraCullingFadeOutSpeed,
            beamAwareEnabled: localLightCameraCullingBeamAwareEnabled,
            maxTargetMeshSamples: localLightCameraCullingMaxTargetMeshSamples,
            activeCount: localLightItems.filter(function (item) {
                return item && item.light && item.light.isEnabled && item.light.isEnabled() && item.light.intensity > 0;
            }).length,
            culledCount: localLightItems.filter(function (item) {
                return !!(item && item.cameraCulled);
            }).length,
            softDeletedCount: localLightSoftDeletedItems.length,
            reusePoolCount: localLightSoftDeletedItems.length,
            cleanDisabledLightsAvailable: localLightSoftDeletedItems.length > 0,
            zeroTouchDeleteMode: true,
            reusePoolByType: {
                spot: localLightSoftDeletedItems.filter(function (item) {
                    return item && item.type === "spot";
                }).length,
                point: localLightSoftDeletedItems.filter(function (item) {
                    return item && item.type === "point";
                }).length
            },
            quarantineDummyMeshName: localLightQuarantineDummyMesh ? localLightQuarantineDummyMesh.name : null,
            quarantinedLights: localLightSoftDeletedItems.map(function (item) {
                return {
                    id: item.id,
                    name: item.name,
                    type: item.type,
                    lightExists: !!item.light,
                    intensity: item.light ? item.light.intensity : null,
                    zeroTouchDeleted: !!(item.light && item.light.metadata && item.light.metadata.zeroTouchDeleted),
                    includedOnlyMeshNames: item.light && item.light.includedOnlyMeshes
                        ? item.light.includedOnlyMeshes.map(function (mesh) {
                            return mesh ? mesh.name : null;
                        })
                        : []
                };
            }),
            lights: localLightItems.map(function (item) {
                return {
                    id: item.id,
                    name: item.name,
                    type: item.type,
                    userEnabled: getLocalLightUserEnabled(item),
                    runtimeEnabled: item.light && item.light.isEnabled
                        ? item.light.isEnabled() && item.light.intensity > 0
                        : false,
                    actualLightEnabled: item.light && item.light.isEnabled
                        ? item.light.isEnabled()
                        : false,
                    userIntensity: getLocalLightUserIntensity(item),
                    runtimeTargetIntensity: item.runtimeTargetIntensity !== undefined
                        ? item.runtimeTargetIntensity
                        : null,
                    runtimeIntensity: item.light ? item.light.intensity : null,
                    cameraCulled: !!item.cameraCulled,
                    cameraCulling: item._cameraCullingDebug || null
                };
            })
        };
    }

    function setLocalLightCameraCullingDebugOptions(options) {
        options = options || {};

        if (options.enabled !== undefined) {
            localLightCameraCullingEnabled = !!options.enabled;
        }

        if (options.viewScale !== undefined) {
            localLightCameraCullingViewScale = Math.max(
                0.1,
                Math.min(1.0, Number(options.viewScale) || 0.66)
            );
        }

        if (options.checkEveryFrames !== undefined) {
            localLightCameraCullingCheckEveryFrames = Math.max(
                1,
                Math.floor(Number(options.checkEveryFrames) || 1)
            );
        }

        if (options.smoothFadeEnabled !== undefined) {
            localLightCameraCullingSmoothFadeEnabled = !!options.smoothFadeEnabled;
        }

        if (options.fadeInSpeed !== undefined) {
            localLightCameraCullingFadeInSpeed = Math.max(
                0.1,
                Number(options.fadeInSpeed) || 7.5
            );
        }

        if (options.fadeOutSpeed !== undefined) {
            localLightCameraCullingFadeOutSpeed = Math.max(
                0.1,
                Number(options.fadeOutSpeed) || 5.0
            );
        }

        if (options.beamAwareEnabled !== undefined) {
            localLightCameraCullingBeamAwareEnabled = !!options.beamAwareEnabled;
        }

        if (options.maxTargetMeshSamples !== undefined) {
            localLightCameraCullingMaxTargetMeshSamples = Math.max(
                0,
                Math.floor(Number(options.maxTargetMeshSamples) || 0)
            );
        }

        updateLocalLightsCameraCulling(true);

        return getLocalLightCameraCullingDebug();
    }

    function getLocalLightWallHitFromSpotRay(item, wallSegments) {
        if (
            !item ||
            item.type !== "spot" ||
            !item.light ||
            !item.light.position ||
            !item.light.direction ||
            !wallSegments ||
            !wallSegments.length
        ) {
            return null;
        }

        var direction = item.light.direction.clone();

        if (direction.lengthSquared() <= 0.0001) {
            return null;
        }

        direction.normalize();

        var rayLength = item.light.range || 12;
        var ray = new BABYLON.Ray(
            item.light.position.clone(),
            direction,
            rayLength
        );

        var hit = scene.pickWithRay(
            ray,
            function (mesh) {
                return wallSegments.indexOf(mesh) !== -1;
            }
        );

        if (hit && hit.hit && hit.pickedMesh && hit.pickedPoint) {
            return {
                source: "spotRay",
                point: hit.pickedPoint.clone(),
                primaryMesh: hit.pickedMesh
            };
        }

        return null;
    }

    function getLocalLightWallReference(item, wallSegments) {
        var spotHit = getLocalLightWallHitFromSpotRay(item, wallSegments);

        if (spotHit) {
            return spotHit;
        }

        if (item && item.ownerMesh) {
            var ownerWallMesh = getWallMeshForArtwork(item.ownerMesh);

            if (isLightingWallSegmentMesh(ownerWallMesh)) {
                return {
                    source: "ownerWall",
                    point: item.ownerMesh.position.clone(),
                    primaryMesh: ownerWallMesh
                };
            }

            if (item.ownerMesh.position) {
                return {
                    source: "ownerPosition",
                    point: item.ownerMesh.position.clone(),
                    primaryMesh: null
                };
            }
        }

        return {
            source: "lightPosition",
            point: getLocalLightPosition(item),
            primaryMesh: null
        };
    }

    function getWallSegmentDistanceToReference(mesh, referencePoint) {
        if (!mesh || !referencePoint) {
            return Number.POSITIVE_INFINITY;
        }

        return BABYLON.Vector3.Distance(
            getMeshWorldCenter(mesh),
            referencePoint
        );
    }

    // STAGE 10D - FRONT-FACING WALL SEGMENT LIGHT FILTER
    // Segment ściany powinien być targetowany tylko wtedy, gdy światło jest po jego frontowej stronie.
    // To ogranicza przypadki, gdzie światło zza ściany zużywa budżet albo daje dziwne odcięcia.
    var localLightWallSegmentFrontFacingFilterEnabled = true;
    var localLightWallSegmentFrontFacingDotLimit = -0.08;

    function isWallSegmentFrontFacingLocalLight(mesh, item) {
        if (!localLightWallSegmentFrontFacingFilterEnabled) {
            return true;
        }

        if (!mesh || !isLightingWallSegmentMesh(mesh)) {
            return false;
        }

        var origin = getLocalLightPosition(item);
        var target = getMeshWorldCenter(mesh);
        var direction = target.subtract(origin);
        var distance = direction.length();

        if (distance <= 0.0001) {
            return true;
        }

        direction.normalize();

        try {
            var ray = new BABYLON.Ray(
                origin,
                direction,
                distance + 0.2
            );

            var hit = scene.pickWithRay(
                ray,
                function (candidate) {
                    return candidate === mesh;
                }
            );

            if (!hit || !hit.hit || !hit.pickedMesh) {
                return false;
            }

            if (!hit.getNormal) {
                return true;
            }

            var normal = hit.getNormal(true, true);

            if (!normal || normal.lengthSquared() <= 0.0001) {
                return true;
            }

            normal.normalize();

            // Ray direction idzie od światła do ściany.
            // Frontowa strona ściany ma normalną skierowaną w stronę światła,
            // więc normal dot direction powinien być ujemny.
            var facingDot = BABYLON.Vector3.Dot(normal, direction);

            return facingDot <= localLightWallSegmentFrontFacingDotLimit;
        } catch (error) {
            console.warn("Wall segment front-facing light filter warning:", error);
            return true;
        }
    }

    function addWallSegmentBudgetUse(mesh, item) {
        if (!mesh || !isLightingWallSegmentMesh(mesh)) {
            return false;
        }

        var key = mesh.name;

        if (!localLightWallSegmentBudgetMap[key]) {
            localLightWallSegmentBudgetMap[key] = [];
        }

        if (localLightWallSegmentBudgetMap[key].indexOf(item) !== -1) {
            return true;
        }

        if (
            localLightWallSegmentBudgetPassActive &&
            localLightWallSegmentBudgetMap[key].length >= localLightWallSegmentMaxLightsPerSegment
        ) {
            return false;
        }

        localLightWallSegmentBudgetMap[key].push(item);
        return true;
    }

    function getWallSegmentCandidateListForLocalLight(item, wallSegments) {
        var reference = getLocalLightWallReference(item, wallSegments);
        var referencePoint = reference && reference.point
            ? reference.point
            : getLocalLightPosition(item);

        var radius = localLightWallSegmentTargetRadius;

        if (item && item.light && item.light.range) {
            radius = Math.max(
                radius,
                Math.min(item.light.range * 0.9, 10.0)
            );
        }

        var softRadius = radius + localLightWallSegmentSoftEdgeExtraRadius;

        var candidates = wallSegments.map(function (mesh) {
            var distance = getWallSegmentDistanceToReference(mesh, referencePoint);
            var frontFacing = isWallSegmentFrontFacingLocalLight(mesh, item);

            return {
                mesh: mesh,
                distance: distance,
                frontFacing: frontFacing,
                priority: distance <= radius ? 0 : 1
            };
        }).filter(function (candidate) {
            if (!candidate.frontFacing) {
                return false;
            }

            return (
                candidate.distance <= softRadius ||
                (
                    reference &&
                    reference.primaryMesh &&
                    candidate.mesh === reference.primaryMesh
                )
            );
        }).sort(function (a, b) {
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }

            return a.distance - b.distance;
        });

        if (
            reference &&
            reference.primaryMesh &&
            isLightingWallSegmentMesh(reference.primaryMesh) &&
            isWallSegmentFrontFacingLocalLight(reference.primaryMesh, item)
        ) {
            var alreadyHasPrimary = candidates.some(function (candidate) {
                return candidate.mesh === reference.primaryMesh;
            });

            if (!alreadyHasPrimary) {
                candidates.unshift({
                    mesh: reference.primaryMesh,
                    distance: 0,
                    frontFacing: true,
                    priority: -1
                });
            }
        }

        return {
            reference: reference,
            referencePoint: referencePoint,
            radius: radius,
            softRadius: softRadius,
            candidates: candidates
        };
    }

    function addWallSegmentTargetsForLocalLight(targetList, item) {
        if (!localLightWallSegmentTargetingEnabled) {
            addMeshArrayUnique(targetList, wallMeshes);
            return;
        }

        var wallSegments = getLightingWallSegmentMeshes();

        // Fallback dla starego modelu bez segmentów.
        if (!wallSegments.length) {
            addMeshArrayUnique(targetList, wallMeshes);
            return;
        }

        var candidateData = getWallSegmentCandidateListForLocalLight(item, wallSegments);
        var candidates = candidateData.candidates;
        var selectedSegments = [];

        function addSegment(mesh) {
            if (
                mesh &&
                isLightingWallSegmentMesh(mesh) &&
                selectedSegments.indexOf(mesh) === -1 &&
                addWallSegmentBudgetUse(mesh, item)
            ) {
                selectedSegments.push(mesh);
            }
        }

        // Primary segment jest najważniejszy, ale też szanuje budżet segmentu.
        if (
            candidateData.reference &&
            candidateData.reference.primaryMesh &&
            isLightingWallSegmentMesh(candidateData.reference.primaryMesh)
        ) {
            addSegment(candidateData.reference.primaryMesh);
        }

        candidates.forEach(function (candidate) {
            if (selectedSegments.length >= localLightWallSegmentTargetMaxCount) {
                return;
            }

            addSegment(candidate.mesh);
        });

        // Fallback awaryjny: jeśli budżet zablokował wszystko, bierzemy najbliższy segment.
        // To zapobiega sytuacji, w której aktywna lampa z targetem Walls nie świeci na żadną ścianę.
        if (!selectedSegments.length && candidates.length) {
            selectedSegments.push(candidates[0].mesh);
        }

        item._wallSegmentTargetDebug = {
            mode: "segmentLightBudget",
            source: candidateData.reference ? candidateData.reference.source : "unknown",
            referencePoint: candidateData.referencePoint ? serializeVector3(candidateData.referencePoint) : null,
            radius: candidateData.radius,
            softRadius: candidateData.softRadius,
            frontFacingFilterEnabled: localLightWallSegmentFrontFacingFilterEnabled,
            frontFacingDotLimit: localLightWallSegmentFrontFacingDotLimit,
            dynamicRetargetEnabled: localLightDynamicWallRetargetEnabled,
            dynamicRetargetThrottleMs: localLightDynamicWallRetargetThrottleMs,
            dynamicRetargetCount: localLightDynamicWallRetargetCount,
            dynamicRetargetLastReason: localLightDynamicWallRetargetLastReason,
            maxLightsPerSegment: localLightWallSegmentMaxLightsPerSegment,
            maxSegmentsPerLight: localLightWallSegmentTargetMaxCount,
            candidateCountAfterFrontFilter: candidates.length,
            targetCount: selectedSegments.length,
            targetNames: selectedSegments.map(function (mesh) {
                return mesh.name;
            })
        };

        addMeshArrayUnique(targetList, selectedSegments);
    }

    function getWallSegmentLightTargetDebug() {
        refreshAllCommonLocalLightTargets();

        var segmentLightMap = {};

        getLightingWallSegmentMeshes().forEach(function (segment) {
            segmentLightMap[segment.name] = {
                segment: segment.name,
                lightCount: 0,
                lights: []
            };
        });

        var lightDebug = localLightItems.map(function (item) {
            var included = item && item.light && item.light.includedOnlyMeshes
                ? item.light.includedOnlyMeshes
                : [];

            var wallTargets = included.filter(function (mesh) {
                return isLightingWallSegmentMesh(mesh);
            });

            wallTargets.forEach(function (mesh) {
                if (!segmentLightMap[mesh.name]) {
                    segmentLightMap[mesh.name] = {
                        segment: mesh.name,
                        lightCount: 0,
                        lights: []
                    };
                }

                segmentLightMap[mesh.name].lightCount += 1;
                segmentLightMap[mesh.name].lights.push(item.name || item.id || item.light.name);
            });

            return {
                id: item.id,
                name: item.name,
                type: item.type,
                enabled: getLocalLightUserEnabled(item),
                runtimeEnabled: item.light && item.light.isEnabled
                    ? item.light.isEnabled()
                    : false,
                cameraCulled: !!item.cameraCulled,
                cameraCulling: item._cameraCullingDebug || null,
                wallTargetCount: wallTargets.length,
                wallTargetNames: wallTargets.map(function (mesh) {
                    return mesh.name;
                }),
                wallTargetDebug: item._wallSegmentTargetDebug || null
            };
        });

        return {
            enabled: localLightWallSegmentTargetingEnabled,
            segmentCount: getLightingWallSegmentMeshes().length,
            maxLightsPerSegment: localLightWallSegmentMaxLightsPerSegment,
            maxSegmentsPerLight: localLightWallSegmentTargetMaxCount,
            targetRadius: localLightWallSegmentTargetRadius,
            softEdgeExtraRadius: localLightWallSegmentSoftEdgeExtraRadius,
            frontFacingFilterEnabled: localLightWallSegmentFrontFacingFilterEnabled,
            frontFacingDotLimit: localLightWallSegmentFrontFacingDotLimit,
            lights: lightDebug,
            segments: Object.keys(segmentLightMap).sort().map(function (name) {
                return segmentLightMap[name];
            })
        };
    }

    function getDefaultLocalTargetOptions() {
        return {
            floor: true,
            walls: true,
            ceiling: true,
            artworks: true,
            sculptures: true,
            props: true,
            owner: true
        };
    }

    function normalizeLocalTargetOptions(options) {
        return Object.assign(
            getDefaultLocalTargetOptions(),
            options || {}
        );
    }

    function getLocalTargetOption(item, key) {
        if (!item) {
            return getDefaultLocalTargetOptions()[key];
        }

        item.targetOptions = normalizeLocalTargetOptions(item.targetOptions);

        return item.targetOptions[key] !== false;
    }

    function setLocalTargetOption(item, key, value) {
        if (!item) {
            return;
        }

        item.targetOptions = normalizeLocalTargetOptions(item.targetOptions);
        item.targetOptions[key] = !!value;
    }

    function addArtworkMeshesUnique(targetList) {
        artworks.forEach(function (artwork) {
            addMeshUnique(targetList, artwork);
        });
    }

    function addSculptureMeshesUnique(targetList) {
        artSpheres.forEach(function (displayMesh) {
            addMeshUnique(targetList, displayMesh);

            if (
                displayMesh.metadata &&
                displayMesh.metadata.sculptureMesh
            ) {
                addMeshUnique(targetList, displayMesh.metadata.sculptureMesh);
            }
        });
    }

    function addCeilingMeshesUnique(targetList) {
        addMeshArrayUnique(targetList, ceilingMeshes);
    }

    function addPropMeshesUnique(targetList) {
        addMeshArrayUnique(targetList, propMeshes);
    }

    function getCommonLocalLightTargetMeshes(item) {
        var includedMeshes = [];

        if (!item) {
            return includedMeshes;
        }

        item.targetOptions = normalizeLocalTargetOptions(item.targetOptions);

        if (getLocalTargetOption(item, "floor")) {
            addMeshArrayUnique(includedMeshes, floorMeshes);
        }

        if (getLocalTargetOption(item, "walls")) {
            addWallSegmentTargetsForLocalLight(includedMeshes, item);
        }

        if (getLocalTargetOption(item, "ceiling")) {
            addCeilingMeshesUnique(includedMeshes);
        }

        // Lampy przypisane do ekspozycji zawsze moga zachowac swoj owner jako
        // glowny target. Reszta kategorii nadal steruje dodatkowymi odbiornikami.
        if (item.ownerMesh && getLocalTargetOption(item, "owner")) {
            addMeshUnique(includedMeshes, item.ownerMesh);

            if (
                item.ownerMesh.metadata &&
                item.ownerMesh.metadata.sculptureMesh
            ) {
                addMeshUnique(includedMeshes, item.ownerMesh.metadata.sculptureMesh);
            }
        }

        if (!item.ownerMesh && getLocalTargetOption(item, "artworks")) {
            addArtworkMeshesUnique(includedMeshes);
        }

        if (!item.ownerMesh && getLocalTargetOption(item, "sculptures")) {
            addSculptureMeshesUnique(includedMeshes);
        }

        if (getLocalTargetOption(item, "props")) {
            addPropMeshesUnique(includedMeshes);
        }

        return includedMeshes;
    }

    function applyCommonLocalLightTargets(item) {
        if (!item || !item.light) {
            return;
        }

        if (item.type !== "spot" && item.type !== "point") {
            return;
        }

        item.light.includedOnlyMeshes = getCommonLocalLightTargetMeshes(item);
        item.light.excludedMeshes = [];
    }

    function refreshAllCommonLocalLightTargets() {
        localLightWallSegmentBudgetMap = {};
        localLightWallSegmentBudgetPassActive = true;

        localLightItems.forEach(function (item) {
            if (!item || item.softDeleted) {
                return;
            }

            applyCommonLocalLightTargets(item);
        });

        localLightWallSegmentBudgetPassActive = false;
    }

    function requestDynamicWallSegmentRetargetForLocalLight(item, force, reason) {
        if (!localLightDynamicWallRetargetEnabled) {
            return;
        }

        if (!item || item.softDeleted || !item.light) {
            return;
        }

        if (!item.targetOptions || item.targetOptions.walls !== true) {
            return;
        }

        var now = Date.now();

        if (
            !force &&
            localLightDynamicWallRetargetThrottleMs > 0 &&
            now - localLightDynamicWallRetargetLastTime < localLightDynamicWallRetargetThrottleMs
        ) {
            return;
        }

        localLightDynamicWallRetargetLastTime = now;
        localLightDynamicWallRetargetLastReason = reason || "unknown";
        localLightDynamicWallRetargetCount += 1;

        // Budżet jest per segment, więc przy zmianie pozycji jednej lampy
        // najbezpieczniej przeliczyć całą aktywną pulę Local Lights.
        // To NIE jest używane przy Delete Selected; delete w Stage 10E9 pozostaje zero-touch.
        refreshAllCommonLocalLightTargets();
    }

    function updateDisplaySpotLight(ownerMesh) {
        if (
            !ownerMesh ||
            !ownerMesh.metadata ||
            !ownerMesh.metadata.lampMesh ||
            !ownerMesh.metadata.spotLight
        ) {
            return;
        }

        var lampMesh = ownerMesh.metadata.lampMesh;
        var spotLight = ownerMesh.metadata.spotLight;
        var item = getLocalLightItemByLight(spotLight);

        if (item && item.manualTransformOverride) {
            applyCommonLocalLightTargets(item);
            item.helperLength = spotLight.range || unifiedSpotDefaults.range;
            item.helperMaxRadius = spotLight.range || unifiedSpotDefaults.range;
            item.helperSoftness = getSpotBlendFromExponent(spotLight.exponent);
            updateLocalLightHelperForLight(spotLight);
            requestLocalSpotShadowRefresh(item, false);
            return;
        }

        var targetPoint = getSpotTargetPointForDisplay(ownerMesh);
        var lampPosition;

        if (artworks.indexOf(ownerMesh) >= 0) {
            var frontDirection = BABYLON.Vector3.TransformNormal(
                new BABYLON.Vector3(0, 0, 1),
                ownerMesh.getWorldMatrix()
            ).normalize();

            lampPosition = ownerMesh.position.add(
                frontDirection.scale(lampDistanceFromWall)
            );

            var absX = Math.abs(frontDirection.x);
            var absZ = Math.abs(frontDirection.z);

            if (absX > absZ) {
                lampMesh.rotation = new BABYLON.Vector3(
                    0,
                    frontDirection.x > 0 ? Math.PI / 2 : -Math.PI / 2,
                    0
                );
            } else {
                lampMesh.rotation = new BABYLON.Vector3(
                    0,
                    frontDirection.z > 0 ? 0 : Math.PI,
                    0
                );
            }
        } else {
            lampPosition = new BABYLON.Vector3(
                ownerMesh.position.x,
                0,
                ownerMesh.position.z
            );

            lampMesh.rotation = new BABYLON.Vector3(0, 0, 0);
        }

        lampPosition.y = lampCubeY;

        lampMesh.position.copyFrom(lampPosition);
        spotLight.position.copyFrom(lampPosition);

        var directionToTarget = targetPoint.subtract(lampPosition);

        if (directionToTarget.length() === 0) {
            directionToTarget = new BABYLON.Vector3(0, -1, 0);
        }

        spotLight.direction.copyFrom(directionToTarget.normalize());

        if (item) {
            applyCommonLocalLightTargets(item);

            item.helperLength = spotLight.range || unifiedSpotDefaults.range;
            item.helperMaxRadius = spotLight.range || unifiedSpotDefaults.range;
            item.helperSoftness = getSpotBlendFromExponent(spotLight.exponent);
        } else {
            spotLight.includedOnlyMeshes = getSpotIncludedMeshesForDisplay(ownerMesh);
            spotLight.excludedMeshes = [];
        }

        updateLocalLightHelperForLight(spotLight);
        requestLocalSpotShadowRefresh(item, false);
    }

    var artworkWidth = 1.3;
    var artworkHeight = 0.9;
    var artworkDepth = 0.04;

    // STAGE 11F - ARTWORK IMAGE PLANE SURFACE OFFSET FIX
    // Detached imagePlane ma siedzieć prawie na froncie boxa obrazu.
    // Wcześniej był odsunięty zbyt daleko od powierzchni i z boku było widać szczelinę.
    // Zostaje tylko mały epsilon, żeby uniknąć z-fightingu.
    var artworkImagePlaneSurfaceEpsilon = 0.003;
    var artworkImagePlanePickableForPopup = true;

    var artworkWallOffset = 0.04;
    var artworkTransformScaleMin = 0.25;
    var artworkTransformScaleMax = 3.0;
    var artworkTransformScaleStep = 0.05;
    var artworkTransformRotationStepDegrees = 15;

    var artworkBoundsSafeMargin = 0.0;
    var artworkCollisionPadding = 0.0;
    var artworkCollisionTouchTolerance = 0.001;
    var artworkSameWallTolerance = 0.35;


    function getArtworkImageState(artwork) {
        if (!artwork || !artwork.metadata) {
            return null;
        }

        return artwork.metadata.artworkImage || null;
    }

    function isArtworkMobileTextureDevice() {
        if (typeof window === "undefined") {
            return false;
        }

        var userAgent = navigator && navigator.userAgent
            ? navigator.userAgent
            : "";

        var mobileByAgent = /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(userAgent);
        var mobileByWidth = window.innerWidth !== undefined && window.innerWidth <= 768;
        var mobileByTouch = navigator && navigator.maxTouchPoints && navigator.maxTouchPoints > 1 && window.innerWidth <= 1024;

        return !!(mobileByAgent || mobileByWidth || mobileByTouch);
    }

    function getPublicArtworkUrlFromPath(imagePath, storageBucket) {
        if (!imagePath || !window.gallerySupabase || !window.gallerySupabase.storage) {
            return "";
        }

        try {
            var publicUrlResponse = window.gallerySupabase
                .storage
                .from(storageBucket || galleryArtworkStorageBucket)
                .getPublicUrl(imagePath);

            if (
                publicUrlResponse &&
                publicUrlResponse.data &&
                publicUrlResponse.data.publicUrl
            ) {
                return publicUrlResponse.data.publicUrl;
            }
        } catch (error) {
            console.warn("Artwork public URL warning:", error);
        }

        return "";
    }

    function getArtworkOriginalImageUrlFromState(imageState) {
        if (!imageState) {
            return "";
        }

        if (imageState.imageUrlOriginal) {
            return imageState.imageUrlOriginal;
        }

        if (imageState.imageUrl) {
            return imageState.imageUrl;
        }

        if (imageState.publicUrl) {
            return imageState.publicUrl;
        }

        if (imageState.imagePath) {
            return getPublicArtworkUrlFromPath(
                imageState.imagePath,
                imageState.storageBucket || galleryArtworkStorageBucket
            );
        }

        return "";
    }

    function getArtworkImageUrlFromState(imageState) {
        if (!imageState) {
            return "";
        }

        var isMobile = isArtworkMobileTextureDevice();

        if (isMobile && imageState.imageUrlMobile) {
            return imageState.imageUrlMobile;
        }

        if (!isMobile && imageState.imageUrlWeb) {
            return imageState.imageUrlWeb;
        }

        if (imageState.imageUrlWeb) {
            return imageState.imageUrlWeb;
        }

        if (imageState.imageUrlMobile) {
            return imageState.imageUrlMobile;
        }

        if (imageState.imageUrlPreview) {
            return imageState.imageUrlPreview;
        }

        return getArtworkOriginalImageUrlFromState(imageState);
    }

    function getArtworkTextureNoMipmap(imageState) {
        return !!(
            imageState &&
            isArtworkMobileTextureDevice() &&
            (
                imageState.imageUrlMobile ||
                imageState.imagePathMobile
            )
        );
    }

    function createSafeStorageFileName(fileName) {
        var originalName = String(fileName || "artwork-image").trim();
        var extensionMatch = originalName.match(/\.([a-zA-Z0-9]+)$/);
        var extension = extensionMatch ? extensionMatch[1].toLowerCase() : "jpg";

        if (extension === "jpeg") {
            extension = "jpg";
        }

        if (!/^(jpg|png|webp|gif|avif)$/.test(extension)) {
            extension = "jpg";
        }

        var baseName = originalName
            .replace(/\.[^/.]+$/, "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");

        if (!baseName) {
            baseName = "artwork-image";
        }

        return baseName + "." + extension;
    }

    function createSafeModel3dFileName(fileName) {
        var originalName = String(fileName || "model.glb").trim();
        var extensionMatch = originalName.match(/\.([a-zA-Z0-9]+)$/);
        var extension = extensionMatch ? extensionMatch[1].toLowerCase() : "glb";

        // Stage 12A startowo obsługuje tylko GLB, bo to jeden plik z teksturami.
        if (extension !== "glb") {
            extension = "glb";
        }

        var baseName = originalName
            .replace(/\.[^/.]+$/, "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");

        if (!baseName) {
            baseName = "model";
        }

        return baseName + "." + extension;
    }

    function createModel3dStoragePath(slot, file) {
        var safeFileName = createSafeModel3dFileName(file && file.name);
        var slotName = slot && slot.name
            ? slot.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
            : "model-slot";

        return galleryArtworkStoragePrefix + "/" + galleryModel3dStorageFolder + "/" + slotName + "-" + Date.now() + "-" + safeFileName;
    }

    function isValidModel3dFile(file) {
        if (!file || !file.name) {
            return false;
        }

        return /\.glb$/i.test(file.name);
    }

    function createArtworkStoragePath(artwork, file) {
        var safeFileName = createSafeStorageFileName(file && file.name);
        var artworkName = artwork && artwork.name
            ? artwork.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
            : "artwork";

        // STAGE 11C - STORAGE FOLDERS
        // Nowe oryginały artworków trafiają do czytelnego folderu Original.
        return galleryArtworkStoragePrefix + "/artworks/Original/" + artworkName + "-" + Date.now() + "-" + safeFileName;
    }


    function getStorageVariantFolderName(variantName) {
        var safeVariant = String(variantName || "variant").replace(/[^a-z0-9-]+/gi, "-").toLowerCase();

        if (safeVariant === "web") {
            return "Desktop";
        }

        if (safeVariant === "mobile") {
            return "Mobile";
        }

        if (safeVariant === "preview") {
            return "Preview";
        }

        return safeVariant || "Variant";
    }

    function getImageStorageCategoryFromPath(originalPath) {
        var sourcePath = String(originalPath || "");

        if (
            sourcePath.indexOf("/authors/") !== -1 ||
            sourcePath.indexOf("authors/") === 0
        ) {
            return "authors";
        }

        return "artworks";
    }

    function createArtworkVariantStoragePath(originalPath, variantName, extension) {
        var safeExtension = String(extension || galleryArtworkImageVariantExtension || "webp").replace(/[^a-z0-9]+/gi, "").toLowerCase() || "webp";
        var sourcePath = String(originalPath || "");
        var slashIndex = sourcePath.lastIndexOf("/");
        var fileName = slashIndex !== -1 ? sourcePath.slice(slashIndex + 1) : sourcePath;
        var category = getImageStorageCategoryFromPath(sourcePath);
        var folderName = getStorageVariantFolderName(variantName);

        if (!fileName) {
            fileName = "image-" + Date.now() + ".jpg";
        }

        var baseName = fileName.replace(/\.[^/.]+$/, "");

        // STAGE 11C - STORAGE FOLDERS
        // Warianty idą do czytelnych folderów:
        // main/artworks/Desktop, main/artworks/Mobile, main/artworks/Preview
        // main/authors/Desktop,  main/authors/Mobile,  main/authors/Preview
        return galleryArtworkStoragePrefix + "/" + category + "/" + folderName + "/" + baseName + "." + safeExtension;
    }

    function loadImageElementFromBlob(blob) {
        return new Promise(function (resolve, reject) {
            var image = new Image();
            var objectUrl = URL.createObjectURL(blob);

            image.onload = function () {
                URL.revokeObjectURL(objectUrl);
                resolve(image);
            };

            image.onerror = function (error) {
                URL.revokeObjectURL(objectUrl);
                reject(error);
            };

            image.src = objectUrl;
        });
    }

    function canvasToBlobSafe(canvas, mimeType, quality) {
        return new Promise(function (resolve, reject) {
            if (!canvas || !canvas.toBlob) {
                reject(new Error("Canvas toBlob is not supported."));
                return;
            }

            canvas.toBlob(
                function (blob) {
                    if (blob) {
                        resolve({
                            blob: blob,
                            mimeType: blob.type || mimeType
                        });
                        return;
                    }

                    if (mimeType !== "image/jpeg") {
                        canvas.toBlob(
                            function (fallbackBlob) {
                                if (fallbackBlob) {
                                    resolve({
                                        blob: fallbackBlob,
                                        mimeType: fallbackBlob.type || "image/jpeg"
                                    });
                                } else {
                                    reject(new Error("Canvas fallback toBlob returned empty blob."));
                                }
                            },
                            "image/jpeg",
                            quality
                        );
                        return;
                    }

                    reject(new Error("Canvas toBlob returned empty blob."));
                },
                mimeType,
                quality
            );
        });
    }

    async function createArtworkImageVariantBlob(sourceBlob, variantName, settings) {
        var image = await loadImageElementFromBlob(sourceBlob);
        var sourceWidth = image.naturalWidth || image.width || 1;
        var sourceHeight = image.naturalHeight || image.height || 1;
        var maxSide = settings && settings.maxSide ? settings.maxSide : 1024;
        var scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
        var targetWidth = Math.max(1, Math.round(sourceWidth * scale));
        var targetHeight = Math.max(1, Math.round(sourceHeight * scale));
        var canvas = document.createElement("canvas");

        canvas.width = targetWidth;
        canvas.height = targetHeight;

        var context = canvas.getContext("2d", {
            alpha: true,
            desynchronized: true
        });

        if (!context) {
            throw new Error("Cannot create 2D canvas context.");
        }

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, targetWidth, targetHeight);

        var encoded = await canvasToBlobSafe(
            canvas,
            galleryArtworkImageVariantFormat,
            settings && settings.quality !== undefined ? settings.quality : 0.8
        );

        var extension = encoded.mimeType === "image/jpeg"
            ? "jpg"
            : galleryArtworkImageVariantExtension;

        return {
            name: variantName,
            blob: encoded.blob,
            mimeType: encoded.mimeType,
            extension: extension,
            width: targetWidth,
            height: targetHeight,
            size: encoded.blob.size || 0,
            sourceWidth: sourceWidth,
            sourceHeight: sourceHeight
        };
    }

    async function uploadArtworkVariantBlob(client, originalPath, variantName, variantBlobData) {
        var variantPath = createArtworkVariantStoragePath(
            originalPath,
            variantName,
            variantBlobData.extension
        );

        var uploadResponse = await client
            .storage
            .from(galleryArtworkStorageBucket)
            .upload(variantPath, variantBlobData.blob, {
                cacheControl: "31536000",
                upsert: true,
                contentType: variantBlobData.mimeType
            });

        if (uploadResponse.error) {
            throw uploadResponse.error;
        }

        var publicUrlResponse = client
            .storage
            .from(galleryArtworkStorageBucket)
            .getPublicUrl(variantPath);

        var publicUrl = publicUrlResponse &&
            publicUrlResponse.data &&
            publicUrlResponse.data.publicUrl
                ? publicUrlResponse.data.publicUrl
                : "";

        return {
            path: variantPath,
            url: publicUrl,
            width: variantBlobData.width,
            height: variantBlobData.height,
            size: variantBlobData.size,
            mimeType: variantBlobData.mimeType
        };
    }

    async function createAndUploadArtworkImageVariants(artwork, sourceBlob, originalPath, client) {
        if (!galleryArtworkImageVariantsEnabled || !sourceBlob || !client || !client.storage) {
            return {};
        }

        var variantState = {
            imageVariantsGeneratedAt: new Date().toISOString()
        };

        var variantNames = ["web", "mobile", "preview"];

        for (var i = 0; i < variantNames.length; i++) {
            var variantName = variantNames[i];
            var settings = galleryArtworkImageVariantSettings[variantName];

            try {
                var variantBlobData = await createArtworkImageVariantBlob(
                    sourceBlob,
                    variantName,
                    settings
                );

                var uploadedVariant = await uploadArtworkVariantBlob(
                    client,
                    originalPath,
                    variantName,
                    variantBlobData
                );

                var keySuffix = variantName.charAt(0).toUpperCase() + variantName.slice(1);

                variantState["imagePath" + keySuffix] = uploadedVariant.path;
                variantState["imageUrl" + keySuffix] = uploadedVariant.url;
                variantState["imageWidth" + keySuffix] = uploadedVariant.width;
                variantState["imageHeight" + keySuffix] = uploadedVariant.height;
                variantState["imageSize" + keySuffix] = uploadedVariant.size;
                variantState["imageMimeType" + keySuffix] = uploadedVariant.mimeType;
            } catch (variantError) {
                console.warn("Artwork image variant generation/upload failed:", {
                    artwork: artwork ? artwork.name : null,
                    variantName: variantName,
                    error: variantError
                });
                variantState["imageVariantError" + variantName.charAt(0).toUpperCase() + variantName.slice(1)] =
                    variantError && variantError.message ? variantError.message : String(variantError);
            }
        }

        return variantState;
    }

    function artworkImageStateNeedsVariants(imageState) {
        return !!(
            imageState &&
            getArtworkOriginalImageUrlFromState(imageState) &&
            (
                !imageState.imageUrlWeb ||
                !imageState.imageUrlMobile ||
                !imageState.imageUrlPreview
            )
        );
    }

    async function fetchArtworkImageBlobForVariantRebuild(imageState) {
        var sourceUrl = getArtworkOriginalImageUrlFromState(imageState);

        if (!sourceUrl) {
            throw new Error("Missing source image URL.");
        }

        var response = await fetch(sourceUrl, {
            mode: "cors",
            cache: "reload"
        });

        if (!response.ok) {
            throw new Error("Cannot fetch source image: " + response.status);
        }

        return response.blob();
    }

    async function rebuildArtworkImageVariants(artwork) {
        var imageState = getArtworkImageState(artwork);

        if (!artwork || !imageState) {
            return {
                ok: false,
                skipped: true,
                reason: "missingArtworkOrImage"
            };
        }

        var client = window.gallerySupabase;

        if (!client || !client.storage) {
            throw new Error("Supabase Storage is not configured.");
        }

        var originalPath = imageState.imagePath || getArtworkStoragePathFromPublicUrl(
            imageState.imageUrl || imageState.publicUrl || "",
            imageState.storageBucket || galleryArtworkStorageBucket
        );

        if (!originalPath) {
            originalPath = createArtworkStoragePath(artwork, {
                name: imageState.originalName || artwork.name + "-rebuild.jpg"
            });
        }

        var sourceBlob = await fetchArtworkImageBlobForVariantRebuild(imageState);
        var variantState = await createAndUploadArtworkImageVariants(
            artwork,
            sourceBlob,
            originalPath,
            client
        );

        var rebuiltState = Object.assign(
            {},
            imageState,
            variantState,
            {
                imageUrlOriginal: imageState.imageUrlOriginal || imageState.imageUrl || imageState.publicUrl || "",
                imagePath: imageState.imagePath || originalPath,
                storageBucket: imageState.storageBucket || galleryArtworkStorageBucket,
                variantsRebuiltAt: new Date().toISOString()
            }
        );

        applyArtworkImageStateSafely(
            artwork,
            rebuiltState,
            "rebuild artwork image variants"
        );

        return {
            ok: true,
            skipped: false,
            artwork: artwork.name,
            hasWeb: !!rebuiltState.imageUrlWeb,
            hasMobile: !!rebuiltState.imageUrlMobile,
            hasPreview: !!rebuiltState.imageUrlPreview
        };
    }

    async function rebuildAllArtworkImageVariants() {
        var activeArtworks = getActiveArtworks().filter(function (artwork) {
            return artworkImageStateNeedsVariants(getArtworkImageState(artwork));
        });

        var result = {
            total: activeArtworks.length,
            rebuilt: 0,
            failed: 0,
            skipped: 0,
            items: []
        };

        for (var i = 0; i < activeArtworks.length; i++) {
            var artwork = activeArtworks[i];

            notifyGalleryStatus("Rebuild image variants " + (i + 1) + "/" + activeArtworks.length + "...");

            try {
                var itemResult = await rebuildArtworkImageVariants(artwork);
                result.items.push(itemResult);

                if (itemResult && itemResult.ok) {
                    result.rebuilt += 1;
                } else {
                    result.skipped += 1;
                }
            } catch (error) {
                console.warn("Artwork variant rebuild failed:", artwork ? artwork.name : null, error);
                result.failed += 1;
                result.items.push({
                    ok: false,
                    artwork: artwork ? artwork.name : null,
                    error: error && error.message ? error.message : String(error)
                });
            }
        }

        updateArtworkImageUi();
        updateArtworkTransformUi();

        return result;
    }


    function copyImageVariantStateToAuthorPhotoState(variantState) {
        variantState = variantState || {};

        var mapped = {
            authorPhotoVariantsGeneratedAt: variantState.imageVariantsGeneratedAt || new Date().toISOString()
        };

        [
            "Web",
            "Mobile",
            "Preview"
        ].forEach(function (suffix) {
            if (variantState["imagePath" + suffix]) {
                mapped["authorPhotoPath" + suffix] = variantState["imagePath" + suffix];
            }

            if (variantState["imageUrl" + suffix]) {
                mapped["authorPhotoUrl" + suffix] = variantState["imageUrl" + suffix];
            }

            if (variantState["imageWidth" + suffix]) {
                mapped["authorPhotoWidth" + suffix] = variantState["imageWidth" + suffix];
            }

            if (variantState["imageHeight" + suffix]) {
                mapped["authorPhotoHeight" + suffix] = variantState["imageHeight" + suffix];
            }

            if (variantState["imageSize" + suffix]) {
                mapped["authorPhotoSize" + suffix] = variantState["imageSize" + suffix];
            }

            if (variantState["imageMimeType" + suffix]) {
                mapped["authorPhotoMimeType" + suffix] = variantState["imageMimeType" + suffix];
            }
        });

        return mapped;
    }

    async function createAndUploadAuthorPhotoVariants(sourceBlob, originalPath, client) {
        if (!galleryAuthorPhotoVariantsEnabled || !sourceBlob || !client || !client.storage) {
            return {};
        }

        var originalArtworkVariantSettings = galleryArtworkImageVariantSettings;

        // Reuse the same generic canvas/upload code from artwork variants,
        // but with smaller max sizes for author photos.
        galleryArtworkImageVariantSettings = galleryAuthorPhotoVariantSettings;

        try {
            var genericState = await createAndUploadArtworkImageVariants(
                null,
                sourceBlob,
                originalPath,
                client
            );

            return copyImageVariantStateToAuthorPhotoState(genericState);
        } finally {
            galleryArtworkImageVariantSettings = originalArtworkVariantSettings;
        }
    }

    function getBestAuthorPhotoUrlFromInfo(infoOrAuthor) {
        var data = infoOrAuthor || {};

        if (isArtworkMobileTextureDevice() && data.authorPhotoUrlMobile) {
            return data.authorPhotoUrlMobile;
        }

        if (isArtworkMobileTextureDevice() && data.photoUrlMobile) {
            return data.photoUrlMobile;
        }

        if (!isArtworkMobileTextureDevice() && data.authorPhotoUrlWeb) {
            return data.authorPhotoUrlWeb;
        }

        if (!isArtworkMobileTextureDevice() && data.photoUrlWeb) {
            return data.photoUrlWeb;
        }

        return (
            data.authorPhotoUrlWeb ||
            data.photoUrlWeb ||
            data.authorPhotoUrlMobile ||
            data.photoUrlMobile ||
            data.authorPhotoUrlPreview ||
            data.photoUrlPreview ||
            data.authorPhotoUrlOriginal ||
            data.photoUrlOriginal ||
            data.authorPhotoUrl ||
            data.photoUrl ||
            ""
        );
    }

    function getOriginalAuthorPhotoUrlFromInfo(infoOrAuthor) {
        var data = infoOrAuthor || {};

        return (
            data.authorPhotoUrlOriginal ||
            data.photoUrlOriginal ||
            data.authorPhotoUrl ||
            data.photoUrl ||
            ""
        );
    }

    function getAuthorPhotoPathsForDelete(infoOrAuthor) {
        var data = infoOrAuthor || {};
        var paths = [];

        [
            data.authorPhotoPath,
            data.photoPath,
            data.authorPhotoPathWeb,
            data.photoPathWeb,
            data.authorPhotoPathMobile,
            data.photoPathMobile,
            data.authorPhotoPathPreview,
            data.photoPathPreview
        ].forEach(function (path) {
            if (path && paths.indexOf(path) === -1) {
                paths.push(path);
            }
        });

        return paths;
    }

    function authorPhotoStateNeedsVariants(data) {
        data = data || {};

        return !!(
            getOriginalAuthorPhotoUrlFromInfo(data) &&
            (
                !data.authorPhotoUrlWeb && !data.photoUrlWeb ||
                !data.authorPhotoUrlMobile && !data.photoUrlMobile ||
                !data.authorPhotoUrlPreview && !data.photoUrlPreview
            )
        );
    }

    function getAuthorRecordsNeedingPhotoVariants() {
        return artworkAuthors.filter(function (author) {
            return authorPhotoStateNeedsVariants(author);
        });
    }

    function syncAllArtworksForAuthor(author) {
        if (!author || !author.id) {
            return;
        }

        getActiveArtworks().forEach(function (artwork) {
            var info = getArtworkInfoState(artwork);

            if (info && info.authorId === author.id) {
                syncArtworkInfoWithAuthor(artwork, author);
            }
        });
    }

    async function fetchAuthorPhotoBlobForVariantRebuild(author) {
        var sourceUrl = getOriginalAuthorPhotoUrlFromInfo(author);

        if (!sourceUrl) {
            throw new Error("Missing author source photo URL.");
        }

        var response = await fetch(sourceUrl, {
            mode: "cors",
            cache: "reload"
        });

        if (!response.ok) {
            throw new Error("Cannot fetch author source photo: " + response.status);
        }

        return response.blob();
    }

    async function rebuildAuthorPhotoVariants(authorIdOrName) {
        var author = getAuthorById(authorIdOrName) || getAuthorByName(authorIdOrName);

        if (!author) {
            return {
                ok: false,
                skipped: true,
                reason: "authorNotFound"
            };
        }

        var client = window.gallerySupabase;

        if (!client || !client.storage) {
            throw new Error("Supabase Storage is not configured.");
        }

        var originalPath = author.photoPath || createAuthorPhotoStoragePath(
            null,
            {
                name: (author.name || author.id || "author") + "-rebuild.jpg"
            }
        );

        var sourceBlob = await fetchAuthorPhotoBlobForVariantRebuild(author);
        var variantState = await createAndUploadAuthorPhotoVariants(
            sourceBlob,
            originalPath,
            client
        );

        var updatedAuthor = upsertAuthorRecord(Object.assign(
            {},
            author,
            variantState,
            {
                photoUrlOriginal: author.photoUrlOriginal || author.photoUrl || "",
                photoPath: author.photoPath || originalPath,
                photoBucket: author.photoBucket || galleryArtworkStorageBucket,
                photoVariantsRebuiltAt: new Date().toISOString()
            }
        ));

        syncAllArtworksForAuthor(updatedAuthor);

        return {
            ok: true,
            skipped: false,
            author: updatedAuthor ? updatedAuthor.name : author.name,
            hasWeb: !!(updatedAuthor && updatedAuthor.photoUrlWeb),
            hasMobile: !!(updatedAuthor && updatedAuthor.photoUrlMobile),
            hasPreview: !!(updatedAuthor && updatedAuthor.photoUrlPreview)
        };
    }

    async function rebuildAllAuthorPhotoVariants() {
        var authors = getAuthorRecordsNeedingPhotoVariants();

        var result = {
            total: authors.length,
            rebuilt: 0,
            failed: 0,
            skipped: 0,
            items: []
        };

        for (var i = 0; i < authors.length; i++) {
            var author = authors[i];

            notifyGalleryStatus("Rebuild author photo variants " + (i + 1) + "/" + authors.length + "...");

            try {
                var itemResult = await rebuildAuthorPhotoVariants(author.id);
                result.items.push(itemResult);

                if (itemResult && itemResult.ok) {
                    result.rebuilt += 1;
                } else {
                    result.skipped += 1;
                }
            } catch (error) {
                console.warn("Author photo variant rebuild failed:", author ? author.name : null, error);
                result.failed += 1;
                result.items.push({
                    ok: false,
                    author: author ? author.name : null,
                    error: error && error.message ? error.message : String(error)
                });
            }
        }

        updateArtworkInfoUi();
        updateArtworkInfoPopupContent(getArtworkInfoUiTarget());

        return result;
    }

    function getArtworkVisualNormal(artwork) {
        if (!artwork || !artwork.getWorldMatrix) {
            return new BABYLON.Vector3(0, 0, 1);
        }

        try {
            artwork.computeWorldMatrix(true);

            var normal = BABYLON.Vector3.TransformNormal(
                new BABYLON.Vector3(0, 0, 1),
                artwork.getWorldMatrix()
            );

            if (!normal || normal.lengthSquared() <= 0.0001) {
                return new BABYLON.Vector3(0, 0, 1);
            }

            return normal.normalize();
        } catch (error) {
            console.warn("Artwork visual normal warning:", error);
            return new BABYLON.Vector3(0, 0, 1);
        }
    }

    function getArtworkImageDepthSafeRenderingGroupId(artwork) {
        // STAGE 9F:
        // Artwork image planes must stay in the normal scene rendering group.
        // renderingGroupId = 2 made images draw over walls on the web build.
        if (
            artwork &&
            typeof artwork.renderingGroupId === "number" &&
            artwork.renderingGroupId > 0
        ) {
            return artwork.renderingGroupId;
        }

        return 0;
    }

    function syncDetachedArtworkImagePlane(artwork) {
        if (!artwork || !artwork.metadata || !artwork.metadata.imagePlane) {
            return;
        }

        var imagePlane = artwork.metadata.imagePlane;

        if (!imagePlane || (imagePlane.isDisposed && imagePlane.isDisposed())) {
            return;
        }

        try {
            artwork.computeWorldMatrix(true);

            var normal = getArtworkVisualNormal(artwork);
            var position = artwork.getAbsolutePosition
                ? artwork.getAbsolutePosition()
                : artwork.position;

            var artworkDepthScale = artwork.scaling && isFinite(artwork.scaling.z)
                ? Math.abs(artwork.scaling.z)
                : 1;

            var imagePlaneSurfaceOffset =
                (artworkDepth * artworkDepthScale * 0.5) +
                artworkImagePlaneSurfaceEpsilon;

            imagePlane.parent = null;
            imagePlane.position.copyFrom(position.add(normal.scale(imagePlaneSurfaceOffset)));
            imagePlane.rotationQuaternion = null;
            imagePlane.rotation.copyFrom(artwork.rotation);
            // STAGE 11G - ARTWORK IMAGE MIRROR FIX
            // Negative X flips only the displayed texture plane, not the physical artwork box.
            imagePlane.scaling.x = -Math.abs(artwork.scaling.x || 1);
            imagePlane.scaling.y = artwork.scaling.y;
            imagePlane.scaling.z = 1;
            imagePlane.renderingGroupId = getArtworkImageDepthSafeRenderingGroupId(artwork);
            imagePlane.alwaysSelectAsActiveMesh = true;
            imagePlane.computeWorldMatrix(true);
        } catch (error) {
            console.warn("Detached artwork image plane sync warning:", error);
        }
    }

    function getArtworkImagePlane(artwork) {
        if (!artwork) {
            return null;
        }

        artwork.metadata = artwork.metadata || {};

        if (
            artwork.metadata.imagePlane &&
            !artwork.metadata.imagePlane.isDisposed()
        ) {
            syncDetachedArtworkImagePlane(artwork);
            return artwork.metadata.imagePlane;
        }

        var imagePlane = BABYLON.MeshBuilder.CreatePlane(
            artwork.name + "_ImagePlane",
            {
                width: artworkWidth,
                height: artworkHeight
            },
            scene
        );

        // Stage 8U:
        // Image plane jest odpinany od artwork boxa i pozycjonowany w world space.
        // To omija problem, w którym czerwony placeholder / dynamiczny box przykrywał teksturę.
        imagePlane.parent = null;
        imagePlane.position = BABYLON.Vector3.Zero();
        imagePlane.rotation = BABYLON.Vector3.Zero();
        // Stage 11F:
        // Pozwala center-ray popupowi trafiać dokładnie w widoczną grafikę.
        // Standardowa selekcja obrazów i tak działa na artwork boxie.
        imagePlane.isPickable = artworkImagePlanePickableForPopup;

        // STAGE 11G - ARTWORK IMAGE MIRROR FIX
        // Plane był wizualnie lustrzany względem fizycznego boxa obrazu.
        // Odwracamy front-facing side imagePlane przez skalę X, bez ruszania boxa i bez zmiany położenia obrazu.
        imagePlane.scaling.x = -Math.abs(imagePlane.scaling.x || 1);

        imagePlane.renderingGroupId = getArtworkImageDepthSafeRenderingGroupId(artwork);
        imagePlane.alwaysSelectAsActiveMesh = true;
        imagePlane.metadata = imagePlane.metadata || {};
        imagePlane.metadata.isArtworkImagePlane = true;
        imagePlane.metadata.parentArtworkName = artwork.name;

        artwork.metadata.imagePlane = imagePlane;
        syncDetachedArtworkImagePlane(artwork);

        return imagePlane;
    }

    function clampArtworkTransformScale(value) {
        var scale = Number(value);

        if (!isFinite(scale)) {
            scale = 1;
        }

        return BABYLON.Scalar.Clamp(
            scale,
            artworkTransformScaleMin,
            artworkTransformScaleMax
        );
    }

    function getUniformArtworkScaleFromStoredTransform(storedTransform) {
        if (!storedTransform) {
            return 1;
        }

        if (storedTransform.scale !== undefined) {
            return storedTransform.scale;
        }

        var scaleX = storedTransform.scaleX !== undefined ? Number(storedTransform.scaleX) : NaN;
        var scaleY = storedTransform.scaleY !== undefined ? Number(storedTransform.scaleY) : NaN;

        if (isFinite(scaleX) && isFinite(scaleY)) {
            return (scaleX + scaleY) * 0.5;
        }

        if (isFinite(scaleX)) {
            return scaleX;
        }

        if (isFinite(scaleY)) {
            return scaleY;
        }

        return 1;
    }

    function normalizeArtworkTransformRotationDegrees(value) {
        var degrees = Number(value);

        if (!isFinite(degrees)) {
            degrees = 0;
        }

        degrees = Math.round(degrees / artworkTransformRotationStepDegrees) * artworkTransformRotationStepDegrees;

        while (degrees > 180) {
            degrees -= 360;
        }

        while (degrees < -180) {
            degrees += 360;
        }

        return degrees;
    }

    function getArtworkTransformState(artwork) {
        var storedTransform = null;

        if (artwork && artwork.metadata) {
            storedTransform = artwork.metadata.artworkTransform || null;

            if (!storedTransform && artwork.metadata.artworkImage) {
                storedTransform = artwork.metadata.artworkImage.transform || null;
            }
        }

        var uniformScale = clampArtworkTransformScale(
            getUniformArtworkScaleFromStoredTransform(storedTransform)
        );

        var rotationDegrees = normalizeArtworkTransformRotationDegrees(
            storedTransform && storedTransform.rotationDegrees !== undefined
                ? storedTransform.rotationDegrees
                : 0
        );

        return {
            scale: uniformScale,
            scaleX: uniformScale,
            scaleY: uniformScale,
            rotationDegrees: rotationDegrees
        };
    }

    function setArtworkTransformState(artwork, transformState) {
        if (!artwork) {
            return null;
        }

        artwork.metadata = artwork.metadata || {};

        var uniformScale = clampArtworkTransformScale(
            transformState && transformState.scale !== undefined
                ? transformState.scale
                : getUniformArtworkScaleFromStoredTransform(transformState)
        );

        var normalizedTransform = {
            scale: uniformScale,
            scaleX: uniformScale,
            scaleY: uniformScale,
            rotationDegrees: normalizeArtworkTransformRotationDegrees(
                transformState && transformState.rotationDegrees !== undefined
                    ? transformState.rotationDegrees
                    : 0
            )
        };

        artwork.metadata.artworkTransform = normalizedTransform;

        if (artwork.metadata.artworkImage) {
            artwork.metadata.artworkImage.transform = normalizedTransform;
        }

        return normalizedTransform;
    }

    function resetArtworkTransformState(artwork) {
        return setArtworkTransformState(artwork, {
            scale: 1,
            rotationDegrees: 0
        });
    }

    function getArtworkBaseDimensionsForCurrentImage(artwork) {
        var imageAspect = null;

        if (artwork && artwork.metadata) {
            if (
                artwork.metadata.dynamicArtworkSize &&
                artwork.metadata.dynamicArtworkSize.aspectRatio
            ) {
                imageAspect = artwork.metadata.dynamicArtworkSize.aspectRatio;
            } else if (
                artwork.metadata.artworkImage &&
                artwork.metadata.artworkImage.aspectRatio
            ) {
                imageAspect = artwork.metadata.artworkImage.aspectRatio;
            }
        }

        if (!imageAspect) {
            imageAspect = artworkWidth / artworkHeight;
        }

        return getArtworkDimensionsForAspectRatio(imageAspect);
    }

    function applyArtworkTransformToMesh(artwork) {
        if (!artwork) {
            return null;
        }

        var baseDimensions = getArtworkBaseDimensionsForCurrentImage(artwork);
        var transformState = getArtworkTransformState(artwork);

        setArtworkTransformState(artwork, transformState);

        artwork.scaling.x = (baseDimensions.width / artworkWidth) * transformState.scale;
        artwork.scaling.y = (baseDimensions.height / artworkHeight) * transformState.scale;
        artwork.scaling.z = 1;
        artwork.rotation.z = BABYLON.Tools.ToRadians(transformState.rotationDegrees);

        syncDetachedArtworkImagePlane(artwork);

        artwork.computeWorldMatrix(true);
        updateArtworkLight(artwork);

        return {
            width: baseDimensions.width * transformState.scale,
            height: baseDimensions.height * transformState.scale,
            aspectRatio: baseDimensions.aspectRatio,
            scale: transformState.scale,
            scaleX: transformState.scale,
            scaleY: transformState.scale,
            rotationDegrees: transformState.rotationDegrees
        };
    }

    function setSelectedArtworkTransform(scale, rotationDegrees, shouldNotify) {
        var artwork = getSingleSelectedArtworkForImageUi();

        if (!artwork) {
            notifyGalleryStatus("Zaznacz jeden obraz, aby zmienic skale lub rotacje.");
            return;
        }

        var currentTransform = getArtworkTransformState(artwork);
        var nextTransform = {
            scale: scale !== undefined ? scale : currentTransform.scale,
            rotationDegrees: rotationDegrees !== undefined ? rotationDegrees : currentTransform.rotationDegrees
        };

        setArtworkTransformState(artwork, nextTransform);
        applyArtworkTransformToMesh(artwork);
        updateArtworkTransformUi();
        updateAlignmentPanel();

        if (shouldNotify) {
            notifyGalleryStatus("Zmieniono transformacje obrazu. Zapisz stan galerii, aby zachowac zmiane.");
        }
    }

    function changeSelectedArtworkTransform(deltaScaleX, deltaScaleY, deltaRotationDegrees) {
        var artwork = getSingleSelectedArtworkForImageUi();

        if (!artwork) {
            notifyGalleryStatus("Zaznacz jeden obraz, aby zmienic skale lub rotacje.");
            return;
        }

        var currentTransform = getArtworkTransformState(artwork);
        var scaleDelta = 0;

        if (deltaScaleX || deltaScaleY) {
            scaleDelta = ((deltaScaleX || 0) + (deltaScaleY || 0)) * 0.5;
        }

        setSelectedArtworkTransform(
            currentTransform.scale + scaleDelta,
            currentTransform.rotationDegrees + (deltaRotationDegrees || 0),
            true
        );
    }

    function resetSelectedArtworkTransform() {
        var artwork = getSingleSelectedArtworkForImageUi();

        if (!artwork) {
            return;
        }

        resetArtworkTransformState(artwork);
        applyArtworkTransformToMesh(artwork);
        updateArtworkTransformUi();
        updateAlignmentPanel();
        notifyGalleryStatus("Zresetowano skale i rotacje obrazu. Zapisz stan galerii, aby zachowac zmiane.");
    }

    function getArtworkDimensionsForAspectRatio(imageAspect) {
        var safeAspect = Number(imageAspect);
        var baseAspect = artworkWidth / artworkHeight;

        if (!isFinite(safeAspect) || safeAspect <= 0) {
            safeAspect = baseAspect;
        }

        var fittedWidth = artworkWidth;
        var fittedHeight = artworkHeight;

        if (safeAspect >= baseAspect) {
            fittedWidth = artworkWidth;
            fittedHeight = artworkWidth / safeAspect;
        } else {
            fittedHeight = artworkHeight;
            fittedWidth = artworkHeight * safeAspect;
        }

        return {
            width: fittedWidth,
            height: fittedHeight,
            aspectRatio: safeAspect
        };
    }

    function applyArtworkAspectRatioToMesh(artwork, imageAspect) {
        if (!artwork) {
            return null;
        }

        var fittedDimensions = getArtworkDimensionsForAspectRatio(imageAspect);
        getArtworkImagePlane(artwork);

        artwork.metadata = artwork.metadata || {};
        artwork.metadata.dynamicArtworkSize = {
            width: fittedDimensions.width,
            height: fittedDimensions.height,
            aspectRatio: fittedDimensions.aspectRatio
        };

        applyArtworkTransformToMesh(artwork);

        return fittedDimensions;
    }

    function resetArtworkAspectRatioToDefault(artwork) {
        if (!artwork) {
            return;
        }

        artwork.scaling.x = 1;
        artwork.scaling.y = 1;
        artwork.scaling.z = 1;
        artwork.rotation.z = 0;

        if (artwork.metadata) {
            artwork.metadata.dynamicArtworkSize = null;
            resetArtworkTransformState(artwork);
        }

        syncDetachedArtworkImagePlane(artwork);
    }

    function cloneArtworkMaterialColor(color) {
        if (!color) {
            return null;
        }

        if (color.clone) {
            return color.clone();
        }

        return color;
    }

    function storeArtworkOriginalMaterialState(artwork) {
        if (
            !artwork ||
            (
                artwork.metadata &&
                artwork.metadata.originalArtworkMaterialState
            )
        ) {
            return;
        }

        artwork.metadata = artwork.metadata || {};

        artwork.metadata.originalArtworkMaterialState = {
            material: artwork.material || null,
            diffuseColor: artwork.material ? cloneArtworkMaterialColor(artwork.material.diffuseColor) : null,
            emissiveColor: artwork.material ? cloneArtworkMaterialColor(artwork.material.emissiveColor) : null,
            specularColor: artwork.material ? cloneArtworkMaterialColor(artwork.material.specularColor) : null,
            albedoColor: artwork.material ? cloneArtworkMaterialColor(artwork.material.albedoColor) : null
        };
    }

    function isBabylonMaterialDisposedSafe(material) {
        if (!material) {
            return true;
        }

        if (typeof material.isDisposed === "function") {
            return material.isDisposed();
        }

        if (typeof material.isDisposed === "boolean") {
            return material.isDisposed;
        }

        if (typeof material._isDisposed === "boolean") {
            return material._isDisposed;
        }

        // W tej wersji Babylon Material może nie mieć isDisposed().
        // Jeśli obiekt istnieje i nie ma jawnej flagi disposed, traktujemy go jako aktywny.
        return false;
    }

    function getArtworkImageBaseMaterial() {
        if (
            galleryArtworkImageBaseMaterial &&
            !isBabylonMaterialDisposedSafe(galleryArtworkImageBaseMaterial)
        ) {
            return galleryArtworkImageBaseMaterial;
        }

        galleryArtworkImageBaseMaterial = new BABYLON.StandardMaterial(
            "Artwork_Image_Base_White_Material",
            scene
        );

        galleryArtworkImageBaseMaterial.diffuseColor = new BABYLON.Color3(1, 1, 1);
        galleryArtworkImageBaseMaterial.emissiveColor = new BABYLON.Color3(0.12, 0.12, 0.12);
        galleryArtworkImageBaseMaterial.specularColor = new BABYLON.Color3(0.12, 0.12, 0.12);
        galleryArtworkImageBaseMaterial.backFaceCulling = false;

        configureMaterialForCommonLighting(galleryArtworkImageBaseMaterial);

        return galleryArtworkImageBaseMaterial;
    }

    function applyArtworkImageBaseMaterial(artwork) {
        if (!artwork) {
            return;
        }

        storeArtworkOriginalMaterialState(artwork);
        artwork.material = getArtworkImageBaseMaterial();
        configureMeshMaterialForMainShadows(artwork);
    }

    function restoreArtworkPlaceholderBaseMaterial(artwork) {
        if (!artwork || !artwork.metadata) {
            return;
        }

        var originalState = artwork.metadata.originalArtworkMaterialState;

        if (!originalState) {
            return;
        }

        if (originalState.material) {
            artwork.material = originalState.material;
        }

        if (artwork.material) {
            if (originalState.diffuseColor && artwork.material.diffuseColor) {
                artwork.material.diffuseColor = originalState.diffuseColor.clone
                    ? originalState.diffuseColor.clone()
                    : originalState.diffuseColor;
            }

            if (originalState.emissiveColor && artwork.material.emissiveColor) {
                artwork.material.emissiveColor = originalState.emissiveColor.clone
                    ? originalState.emissiveColor.clone()
                    : originalState.emissiveColor;
            }

            if (originalState.specularColor && artwork.material.specularColor) {
                artwork.material.specularColor = originalState.specularColor.clone
                    ? originalState.specularColor.clone()
                    : originalState.specularColor;
            }

            if (originalState.albedoColor && artwork.material.albedoColor) {
                artwork.material.albedoColor = originalState.albedoColor.clone
                    ? originalState.albedoColor.clone()
                    : originalState.albedoColor;
            }
        }

        configureMeshMaterialForMainShadows(artwork);
    }

    function fitArtworkImagePlaneToTexture(artwork, texture, fitMode) {
        if (!artwork || !texture) {
            return;
        }

        var baseSize = texture.getBaseSize ? texture.getBaseSize() : null;

        if (!baseSize || !baseSize.width || !baseSize.height) {
            resetArtworkAspectRatioToDefault(artwork);
            return;
        }

        var imageAspect = baseSize.width / baseSize.height;
        var fittedDimensions = applyArtworkAspectRatioToMesh(artwork, imageAspect);

        artwork.metadata = artwork.metadata || {};
        artwork.metadata.artworkImage = artwork.metadata.artworkImage || {};
        artwork.metadata.artworkImage.fitMode = fitMode || galleryArtworkDefaultFitMode;
        artwork.metadata.artworkImage.aspectRatio = imageAspect;
        artwork.metadata.artworkImage.width = baseSize.width;
        artwork.metadata.artworkImage.height = baseSize.height;
        artwork.metadata.artworkImage.fittedWidth = fittedDimensions ? fittedDimensions.width : artworkWidth;
        artwork.metadata.artworkImage.fittedHeight = fittedDimensions ? fittedDimensions.height : artworkHeight;
        artwork.metadata.artworkImage.transform = getArtworkTransformState(artwork);
    }

    function disposeArtworkImageMaterial(artwork) {
        if (
            artwork &&
            artwork.metadata &&
            artwork.metadata.imageMaterial
        ) {
            try {
                if (artwork.metadata.imageMaterial.diffuseTexture) {
                    artwork.metadata.imageMaterial.diffuseTexture.dispose();
                }

                if (artwork.metadata.imageMaterial.emissiveTexture) {
                    artwork.metadata.imageMaterial.emissiveTexture.dispose();
                }

                artwork.metadata.imageMaterial.dispose();
            } catch (error) {
                console.warn("Artwork image material dispose warning:", error);
            }

            artwork.metadata.imageMaterial = null;
        }
    }

    function applyArtworkImageState(artwork, imageState) {
        if (!artwork) {
            return false;
        }

        var imageUrl = getArtworkImageUrlFromState(imageState);

        if (!imageUrl) {
            removeArtworkImageFromMesh(artwork, false);
            return false;
        }

        artwork.metadata = artwork.metadata || {};

        var normalizedState = Object.assign(
            {
                fitMode: galleryArtworkDefaultFitMode,
                storageBucket: galleryArtworkStorageBucket
            },
            imageState || {},
            {
                imageUrl: imageUrl
            }
        );

        artwork.metadata.artworkImage = normalizedState;
        applyArtworkImageBaseMaterial(artwork);

        if (normalizedState.transform) {
            setArtworkTransformState(artwork, normalizedState.transform);
        }

        var imagePlane = getArtworkImagePlane(artwork);
        disposeArtworkImageMaterial(artwork);

        var imageMaterial = new BABYLON.StandardMaterial(
            artwork.name + "_ImageMaterial",
            scene
        );

        imageMaterial.diffuseColor = new BABYLON.Color3(1, 1, 1);
        imageMaterial.emissiveColor = new BABYLON.Color3(1, 1, 1);
        imageMaterial.specularColor = new BABYLON.Color3(0.03, 0.03, 0.03);
        imageMaterial.backFaceCulling = false;
        imageMaterial.disableLighting = true;
        imageMaterial.alpha = 1;

        // Stage 9F:
        // Obraz ma być normalnie zasłaniany przez ściany i geometrię sceny.
        // Nie wymuszamy późniejszej grupy renderowania ani transparentnego passu.
        if (imageMaterial.disableDepthWrite !== undefined) {
            imageMaterial.disableDepthWrite = false;
        }

        if (imageMaterial.forceDepthWrite !== undefined) {
            imageMaterial.forceDepthWrite = true;
        }

        var texture = new BABYLON.Texture(
            imageUrl,
            scene,
            getArtworkTextureNoMipmap(normalizedState),
            true,
            BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
            function () {
                fitArtworkImagePlaneToTexture(
                    artwork,
                    texture,
                    normalizedState.fitMode || galleryArtworkDefaultFitMode
                );

                syncDetachedArtworkImagePlane(artwork);
                artwork.computeWorldMatrix(true);
                updateArtworkLight(artwork);
                updateArtworkImageUi();
                updateArtworkTransformUi();
            },
            function (message, exception) {
                console.warn("Nie udalo sie wczytac obrazu:", message, exception);
                notifyGalleryStatus("Nie udalo sie wczytac tekstury obrazu.");
            }
        );

        texture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
        texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

        imageMaterial.diffuseTexture = texture;
        imageMaterial.emissiveTexture = texture;

        imagePlane.material = imageMaterial;
        imagePlane.setEnabled(true);
        syncDetachedArtworkImagePlane(artwork);

        artwork.metadata.imageMaterial = imageMaterial;

        refreshCommonLightingMaterialSupport();
        updateArtworkLight(artwork);
        updateArtworkImageUi();

        return true;
    }

    function removeArtworkImageFromMesh(artwork, shouldDisposePlane) {
        if (!artwork) {
            return false;
        }

        artwork.metadata = artwork.metadata || {};
        disposeArtworkImageMaterial(artwork);

        if (artwork.metadata.imagePlane) {
            if (shouldDisposePlane) {
                try {
                    artwork.metadata.imagePlane.dispose();
                } catch (error) {
                    console.warn("Artwork image plane dispose warning:", error);
                }

                artwork.metadata.imagePlane = null;
            } else {
                artwork.metadata.imagePlane.setEnabled(false);
            }
        }

        resetArtworkAspectRatioToDefault(artwork);
        restoreArtworkPlaceholderBaseMaterial(artwork);
        artwork.metadata.artworkImage = null;
        updateArtworkLight(artwork);
        updateArtworkImageUi();
        updateArtworkTransformUi();
        return true;
    }

    function rememberArtworkImageStateWithoutDisplay(artwork, imageState) {
        if (!artwork || !imageState) {
            return false;
        }

        artwork.metadata = artwork.metadata || {};

        var imageUrl = getArtworkImageUrlFromState(imageState);

        artwork.metadata.artworkImage = Object.assign(
            {
                fitMode: galleryArtworkDefaultFitMode,
                storageBucket: galleryArtworkStorageBucket
            },
            imageState || {},
            {
                imageUrl: imageUrl || imageState.imageUrl || imageState.publicUrl || ""
            }
        );

        try {
            applyArtworkImageBaseMaterial(artwork);
            getArtworkImagePlane(artwork);
            syncDetachedArtworkImagePlane(artwork);
        } catch (baseMaterialError) {
            console.warn("Artwork image base material fallback warning:", baseMaterialError);
        }

        updateArtworkImageUi();
        updateArtworkTransformUi();

        return true;
    }

    function applyArtworkImageStateSafely(artwork, imageState, contextLabel) {
        try {
            return applyArtworkImageState(artwork, imageState);
        } catch (error) {
            console.warn("Artwork image display apply failed:", contextLabel || "", error);
            rememberArtworkImageStateWithoutDisplay(artwork, imageState);
            return false;
        }
    }

    async function uploadArtworkImageToSupabase(artwork, file) {
        if (!artwork || !file) {
            notifyGalleryStatus("Zaznacz jeden obraz i wybierz plik.");
            return false;
        }

        if (!galleryArtworkUploadEnabled) {
            notifyGalleryStatus("Upload obrazow jest wylaczony w tej wersji.");
            return false;
        }

        var client = window.gallerySupabase;

        if (!client || !client.storage) {
            notifyGalleryStatus("Supabase Storage nie jest skonfigurowany.");
            return false;
        }

        if (galleryEditorLoginEnabled && !editorAuthenticated) {
            notifyGalleryStatus("Zaloguj sie jako edytor, aby wgrac obraz.");
            return false;
        }

        if (!file.type || file.type.indexOf("image/") !== 0) {
            notifyGalleryStatus("Wybierz plik obrazu.");
            return false;
        }

        var previousImageState = getArtworkImageState(artwork);
        var storagePath = createArtworkStoragePath(artwork, file);
        notifyGalleryStatus("Wgrywam obraz i kompresuje warianty...");

        var uploadResponse = await client
            .storage
            .from(galleryArtworkStorageBucket)
            .upload(storagePath, file, {
                cacheControl: "3600",
                upsert: false,
                contentType: file.type
            });

        if (uploadResponse.error) {
            var uploadErrorMessage = uploadResponse.error.message ||
                uploadResponse.error.error_description ||
                uploadResponse.error.name ||
                "Nieznany blad Supabase Storage";

            console.warn("Artwork upload error:", {
                bucket: galleryArtworkStorageBucket,
                path: storagePath,
                mimeType: file.type,
                size: file.size,
                error: uploadResponse.error
            });

            notifyGalleryStatus("Upload nieudany: " + uploadErrorMessage);
            return false;
        }

        var publicUrlResponse = client
            .storage
            .from(galleryArtworkStorageBucket)
            .getPublicUrl(storagePath);

        var publicUrl = publicUrlResponse &&
            publicUrlResponse.data &&
            publicUrlResponse.data.publicUrl
                ? publicUrlResponse.data.publicUrl
                : "";

        var variantState = {};

        try {
            variantState = await createAndUploadArtworkImageVariants(
                artwork,
                file,
                storagePath,
                client
            );
        } catch (variantBuildError) {
            console.warn("Artwork image variants warning:", variantBuildError);
            notifyGalleryStatus("Wgrano oryginal, ale warianty web/mobile nie powstaly. Sprawdz konsole.");
        }

        var uploadedImageState = Object.assign(
            {
                imagePath: storagePath,
                imageUrl: publicUrl,
                imageUrlOriginal: publicUrl,
                storageBucket: galleryArtworkStorageBucket,
                originalName: file.name || null,
                size: file.size || null,
                mimeType: file.type || null,
                fitMode: galleryArtworkDefaultFitMode,
                uploadedAt: new Date().toISOString()
            },
            variantState || {}
        );

        var displayedNow = applyArtworkImageStateSafely(
            artwork,
            uploadedImageState,
            "after artwork upload"
        );

        // Stage 8T2:
        // Upload do Storage nie moze byc traktowany jako nieudany tylko dlatego,
        // ze lokalne nalozenie tekstury rzucilo wyjatek. Metadata zostaje zapamietana,
        // zeby Save State mial imagePath/imageUrl.
        if (!displayedNow) {
            notifyGalleryStatus("Wgrano plik, ale tekstura nie wskoczyla od razu. Zapisz stan lub sprobuj APPLY URL.");
        }

        // Ponawiamy probe wyswietlenia po chwili, ale bez rzucania bledem do upload catch.
        setTimeout(function () {
            try {
                if (
                    artwork &&
                    artwork.metadata &&
                    artwork.metadata.artworkImage &&
                    artwork.metadata.artworkImage.imagePath === storagePath
                ) {
                    applyArtworkImageStateSafely(
                        artwork,
                        uploadedImageState,
                        "delayed artwork upload retry"
                    );
                }
            } catch (delayedApplyError) {
                console.warn("Delayed artwork image apply warning:", delayedApplyError);
            }
        }, 850);

        var previousDeleteState = null;

        try {
            previousDeleteState = getArtworkStorageDeleteState(previousImageState);
        } catch (deleteStateError) {
            console.warn("Previous artwork delete state warning:", deleteStateError);
        }

        if (
            previousDeleteState &&
            previousDeleteState.imagePath &&
            previousDeleteState.imagePath !== storagePath
        ) {
            try {
                deleteArtworkImageFromSupabase(previousDeleteState)
                    .then(function (removedOldFile) {
                        if (!removedOldFile) {
                            console.warn("Previous artwork image was not removed from Storage:", previousDeleteState);
                        }
                    })
                    .catch(function (error) {
                        console.warn("Previous artwork image delete warning:", error);
                    });
            } catch (previousDeleteError) {
                console.warn("Previous artwork image delete startup warning:", previousDeleteError);
            }
        }

        notifyGalleryStatus("Wgrano obraz i warianty. Zapisz stan galerii, aby zachowac zmiane.");
        return true;
    }

    function getArtworkStoragePathFromPublicUrl(publicUrl, bucketName) {
        if (!publicUrl) {
            return "";
        }

        var safeBucketName = bucketName || galleryArtworkStorageBucket;
        var urlText = String(publicUrl);
        var marker = "/storage/v1/object/public/" + safeBucketName + "/";

        var markerIndex = urlText.indexOf(marker);

        if (markerIndex === -1) {
            return "";
        }

        var pathWithQuery = urlText.slice(markerIndex + marker.length);
        var queryIndex = pathWithQuery.indexOf("?");

        if (queryIndex !== -1) {
            pathWithQuery = pathWithQuery.slice(0, queryIndex);
        }

        try {
            return decodeURIComponent(pathWithQuery);
        } catch (error) {
            return pathWithQuery;
        }
    }

    function getArtworkStorageDeleteState(imageState) {
        if (!imageState) {
            return null;
        }

        var bucketName = imageState.storageBucket || galleryArtworkStorageBucket;
        var imagePath = imageState.imagePath || "";

        if (!imagePath && (imageState.imageUrl || imageState.publicUrl)) {
            imagePath = getArtworkStoragePathFromPublicUrl(
                imageState.imageUrl || imageState.publicUrl,
                bucketName
            );
        }

        if (!imagePath) {
            return null;
        }

        var imagePaths = [imagePath];

        [
            imageState.imagePathWeb,
            imageState.imagePathMobile,
            imageState.imagePathPreview
        ].forEach(function (variantPath) {
            if (variantPath && imagePaths.indexOf(variantPath) === -1) {
                imagePaths.push(variantPath);
            }
        });

        return {
            imagePath: imagePath,
            imagePaths: imagePaths,
            storageBucket: bucketName
        };
    }

    async function deleteArtworkImageFromSupabase(imageState) {
        var deleteState = getArtworkStorageDeleteState(imageState);

        if (!deleteState || !deleteState.imagePath) {
            return true;
        }

        var client = window.gallerySupabase;

        if (!client || !client.storage) {
            notifyGalleryStatus("Supabase Storage nie jest skonfigurowany. Usuwam tylko z aktualnego obrazu.");
            return true;
        }

        var pathsToRemove = deleteState.imagePaths && deleteState.imagePaths.length
            ? deleteState.imagePaths
            : [deleteState.imagePath];

        var removeResponse = await client
            .storage
            .from(deleteState.storageBucket)
            .remove(pathsToRemove);

        if (removeResponse.error) {
            console.warn("Artwork Storage delete error:", {
                bucket: deleteState.storageBucket,
                path: deleteState.imagePath,
                paths: pathsToRemove,
                originalState: imageState,
                error: removeResponse.error
            });
            notifyGalleryStatus("Nie udalo sie usunac pliku ze Storage.");
            return false;
        }

        console.info("Artwork Storage file removed:", {
            bucket: deleteState.storageBucket,
            path: deleteState.imagePath,
            data: removeResponse.data || null
        });

        return true;
    }

    async function removeArtworkImageWithStorageDelete(artwork) {
        if (!artwork) {
            return false;
        }

        var imageState = getArtworkImageState(artwork);
        var removedFromStorage = await deleteArtworkImageFromSupabase(imageState);

        if (!removedFromStorage) {
            return false;
        }

        removeArtworkImageFromMesh(artwork, true);
        updateArtworkTransformUi();
        return true;
    }

    var selectedArtwork = null;
    var activeArtwork = null;
    var selectedArtworks = [];
    var primaryArtwork = null;
    var referenceArtwork = null;
    var isDraggingArtwork = false;

    var selectedSphere = null;
    var isDraggingSphere = false;

    // STAGE 12B - MODEL SLOT SELECTION LIKE ARTWORKS
    // selectedSphere zostaje jako aktywne zaznaczenie slotu, a nie tylko obiekt chwilowo chwytany.
    var activeModel3dSlot = null;
    var model3dSlotSelectionOutlineColor = new BABYLON.Color3(0.55, 0.72, 1.0);

    var dragMoved = false;

    var lookAtObserver = null;

    var selectedWallMaterial = null;
    var wallColorMaterials = {};

    var lastArtworkClickTime = 0;
    var lastArtworkClickMesh = null;
    var doubleClickDelay = 350;

    var editMoveSpeed = 0.18;
    var editMoveKeys = {
        w: false,
        a: false,
        s: false,
        d: false
    };


    // MOBILE VIEWER MODE
    // MOBILE RESPONSIVE BREAKPOINT
    // Tryb mobilny wlacza sie przy szerokosci renderu/canvasu do 768 px.
    // Nie ma recznego wlaczania przez parametr w adresie.
    // STAGE 12C4 - SCROLL / OVERSCROLL LOCK
    function ensureGalleryScrollLockStyles() {
        if (document.getElementById("berryboy-gallery-scroll-lock-style")) {
            return;
        }

        var style = document.createElement("style");
        style.id = "berryboy-gallery-scroll-lock-style";
        style.textContent = `
            html,
            body {
                overscroll-behavior: none;
            }

            body.gallery-app-scroll-locked {
                overflow: hidden;
                overscroll-behavior: none;
                touch-action: none;
            }

            canvas,
            #renderCanvas {
                overscroll-behavior: none;
                touch-action: none;
            }

            #mobileViewerControls,
            #mobileViewerControls *,
            .mobile-viewer-controls,
            .mobile-viewer-controls *,
            .mobile-viewer-joystick,
            .mobile-viewer-joystick *,
            .mobile-viewer-joystick-knob,
            .mobile-viewer-joystick-knob * {
                touch-action: none;
                overscroll-behavior: none;
                -webkit-user-select: none;
                user-select: none;
                -webkit-touch-callout: none;
            }

            .gallery-editor-panel,
            .gallery-editor-scroll,
            .gallery-editor-body,
            .gallery-panel,
            .editor-panel,
            .editor-scroll {
                overscroll-behavior: contain;
            }
        `;

        document.head.appendChild(style);
        document.body.classList.add("gallery-app-scroll-locked");
    }

    function isGalleryScrollableInDirection(element, deltaY) {
        if (!element || element.scrollHeight <= element.clientHeight + 1) {
            return false;
        }

        if (deltaY < 0) {
            return element.scrollTop > 0;
        }

        if (deltaY > 0) {
            return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
        }

        return true;
    }

    function findGalleryEditorScrollParent(target) {
        var current = target;

        while (current && current !== document.body && current !== document.documentElement) {
            if (
                current.classList &&
                (
                    current.classList.contains("gallery-editor-panel") ||
                    current.classList.contains("gallery-editor-scroll") ||
                    current.classList.contains("gallery-editor-body") ||
                    current.classList.contains("gallery-panel") ||
                    current.classList.contains("editor-panel") ||
                    current.classList.contains("editor-scroll")
                )
            ) {
                return current;
            }

            var style = window.getComputedStyle ? window.getComputedStyle(current) : null;
            var overflowY = style ? style.overflowY : "";

            if (
                current.scrollHeight > current.clientHeight + 1 &&
                (
                    overflowY === "auto" ||
                    overflowY === "scroll" ||
                    overflowY === "overlay"
                )
            ) {
                return current;
            }

            current = current.parentElement;
        }

        return null;
    }

    function preventGalleryBrowserScroll(event) {
        if (event && event.cancelable) {
            event.preventDefault();
        }
    }

    function setupGalleryScrollContainment() {
        if (window.__berryboyGalleryScrollContainmentReady) {
            return;
        }

        window.__berryboyGalleryScrollContainmentReady = true;

        document.addEventListener(
            "wheel",
            function (event) {
                var editorScroller = findGalleryEditorScrollParent(event.target);

                if (!editorScroller) {
                    return;
                }

                var deltaY = event.deltaY || 0;
                event.stopPropagation();

                if (!isGalleryScrollableInDirection(editorScroller, deltaY)) {
                    preventGalleryBrowserScroll(event);
                }
            },
            { passive: false, capture: true }
        );

        var lastEditorTouchY = null;

        document.addEventListener(
            "touchstart",
            function (event) {
                var touch = event.touches && event.touches.length ? event.touches[0] : null;

                if (!touch) {
                    lastEditorTouchY = null;
                    return;
                }

                lastEditorTouchY = findGalleryEditorScrollParent(event.target) ? touch.clientY : null;
            },
            { passive: false, capture: true }
        );

        document.addEventListener(
            "touchmove",
            function (event) {
                var editorScroller = findGalleryEditorScrollParent(event.target);
                var touch = event.touches && event.touches.length ? event.touches[0] : null;

                if (editorScroller && touch && lastEditorTouchY !== null) {
                    var deltaY = lastEditorTouchY - touch.clientY;
                    lastEditorTouchY = touch.clientY;
                    event.stopPropagation();

                    if (!isGalleryScrollableInDirection(editorScroller, deltaY)) {
                        preventGalleryBrowserScroll(event);
                    }

                    return;
                }

                if (
                    mobileJoystickActive ||
                    mobileLookActive ||
                    (
                        event.target &&
                        event.target.closest &&
                        (
                            event.target.closest("#mobileViewerControls") ||
                            event.target.closest(".mobile-viewer-controls") ||
                            event.target.closest(".mobile-viewer-joystick") ||
                            event.target.closest(".mobile-viewer-joystick-knob")
                        )
                    )
                ) {
                    preventGalleryBrowserScroll(event);
                }
            },
            { passive: false, capture: true }
        );

        document.addEventListener(
            "gesturestart",
            preventGalleryBrowserScroll,
            { passive: false, capture: true }
        );
    }

    var mobileViewerBreakpoint = 768;
    var mobileViewerEnabled = false;
    var mobileStartCameraApplied = false;

    var mobileViewerControls = null;
    var mobileJoystickBase = null;
    var mobileJoystickKnob = null;
    var mobileJoystickActive = false;
    var mobileJoystickPointerId = null;
    var mobileJoystickVector = {
        x: 0,
        y: 0
    };

    var mobileLookActive = false;
    var mobileLookPointerId = null;
    var mobileLookStartX = 0;
    var mobileLookStartY = 0;
    var mobileLookLastX = 0;
    var mobileLookLastY = 0;
    var mobileLookMoved = false;

    var mobileTapMoveThreshold = 9;
    var mobileLookSensitivityX = 0.004;
    var mobileLookSensitivityY = 0.003;
    var mobileMoveSpeed = 0.085;
    var mobileJoystickTurnSpeed = 0.026;

    // STAGE 12C3:
    // Joystick mobile zachowuje poprzedni schemat:
    // Y = przód/tył, X = obrót kamery, nie strafe.
    var viewerMovementMobileJoystickTurnEnabled = true;
    var viewerMovementMobileJoystickTurnSpeed = 1.62;
    var viewerMovementMobileJoystickTurnDeadZone = 0.08;

    var mobileInitialCameraPosition = camera.position.clone();
    var mobileInitialCameraRotation = camera.rotation.clone();

    var mobileFocusActive = false;
    var mobilePreviousCameraPosition = null;
    var mobilePreviousCameraRotation = null;

    var mobileFloorBounds = null;
    var mobileFloorRayLength = 12;


    // STAGE 12C1 - VIEWER WASD / MOBILE JOYSTICK GROUNDED WALK
    // Edytor zostaje bez zmian. Ten system działa tylko w Viewer Mode.
    // Baza ruchu: V11 preset 4 - Bound Gallery Polish V11.
    var viewerWASDMovementEnabled = true;
    var viewerMoveKeys = {
        w: false,
        a: false,
        s: false,
        d: false,
        shift: false
    };

    var viewerMovementConfig = {
        speed: 3.58,
        sprintMultiplier: 1.22,
        acceleration: 15.0,
        braking: 35.0,
        sideFriction: 43.0,
        snapStopSpeed: 0.037,
        inputRampTime: 0.105,
        inputStartStrength: 0.91,
        stepFrequency: 1.12,
        bobHeight: 0.0078,
        compression: 0.0054,
        pitchAmount: 0.0017,
        // STAGE 12C2:
        // Roll kamery w viewer movement wyłączony, żeby nie zostawał kadr pod skosem.
        rollAmount: 0.0,
        stopSettlePitch: 0.0009,
        stopSettleDuration: 0.10,
        stopBounceDistance: 0.032,
        stopBouncePitch: 0.0044,
        stopBounceDuration: 0.23,
        stopBounceFrequency: 0.66,
        joystickDeadZone: 0.08
    };

    var viewerMovementVelocity = new BABYLON.Vector3(0, 0, 0);
    var viewerMovementCurrentSpeed01 = 0;
    var viewerMovementTargetSpeed01 = 0;
    var viewerMovementStepTimer = 0;
    var viewerMovementLastHadInput = false;
    var viewerMovementStopSettleTimer = 999;
    var viewerMovementLastMoveDirection = new BABYLON.Vector3(0, 0, 1);
    var viewerMovementStopBounceDirection = new BABYLON.Vector3(0, 0, 1);
    var viewerMovementStopBounceSpeed01 = 0;
    var viewerMovementVisualOffset = new BABYLON.Vector3(0, 0, 0);
    var viewerMovementVisualPitchOffset = 0;
    var viewerMovementVisualRollOffset = 0;
    var viewerMovementWasManualInputActive = false;
    var viewerCameraRollLockEnabled = true;

    // CUSTOM LOADING SCREEN
    var oldLoadingScreen = document.getElementById("customLoadingScreen");

    if (oldLoadingScreen) {
        oldLoadingScreen.remove();
    }

    var loadingScreen = document.createElement("div");
    loadingScreen.id = "customLoadingScreen";

    loadingScreen.innerHTML = `
        <div id="loadingContent">
            <img id="loadingLogo" src="https://raw.githubusercontent.com/Rivanes/babylon-assets/main/Follow_yes_logo.jpg.jpg" alt="Follow Yes logo">
            <div id="loaderSpinner"></div>
        </div>
    `;

    loadingScreen.style.position = "fixed";
    loadingScreen.style.inset = "0";
    loadingScreen.style.background = "#F0EADE";
    loadingScreen.style.color = "white";
    loadingScreen.style.display = "flex";
    loadingScreen.style.alignItems = "center";
    loadingScreen.style.justifyContent = "center";
    loadingScreen.style.zIndex = "9999";

    document.body.appendChild(loadingScreen);

    var oldLoaderStyle = document.getElementById("customLoaderStyle");

    if (oldLoaderStyle) {
        oldLoaderStyle.remove();
    }

    var loaderStyle = document.createElement("style");
    loaderStyle.id = "customLoaderStyle";

    loaderStyle.innerHTML = `
        #loadingContent {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 34px;
        }

        #loadingLogo {
            width: min(520px, 72vw);
            height: auto;
            display: block;
        }

        #loaderSpinner {
            width: 58px;
            height: 58px;
            border: 6px solid rgba(0, 0, 0, 0.12);
            border-top: 6px solid #111111;
            border-radius: 50%;
            animation: galleryLoaderSpin 1s linear infinite;
        }

        @keyframes galleryLoaderSpin {
            from {
                transform: rotate(0deg);
            }

            to {
                transform: rotate(360deg);
            }
        }
    `;

    document.head.appendChild(loaderStyle);

    var assetsToLoad = 4;
    var assetsLoaded = 0;
    var galleryWebStateLoadedOnce = false;

    function finishGalleryStartup() {
        // Ustawia kierunek patrzenia kamery tak samo dla desktopu i mobile.
        camera.rotation = new BABYLON.Vector3(0, Math.PI / 50, 0);

        refreshMobileViewerMode();
        updateViewerModePlaceholderVisibility();

        if (mobileViewerEnabled) {
            setMobileStartCameraPosition();
        }

        setTimeout(function () {
            loadingScreen.style.display = "none";
        }, 300);
    }

    function assetLoaded() {
        assetsLoaded++;

        if (assetsLoaded >= assetsToLoad && !galleryWebStateLoadedOnce) {
            galleryWebStateLoadedOnce = true;

            loadGalleryStateFromSupabase()
                .catch(function (error) {
                    console.warn("Nie udalo sie wczytac stanu galerii:", error);
                    notifyGalleryStatus("Nie udalo sie wczytac zapisanego stanu galerii.");
                })
                .finally(function () {
                    finishGalleryStartup();
                });
        }
    }

    // TRYB EDYCJI / OGLADANIA
    var oldButton = document.getElementById("editModeButton");

    if (oldButton) {
        oldButton.remove();
    }

    var editMode = false;

    // DEV / ENGINE MODE:
    // false = logowanie edytora jest wylaczone, panel edytora dziala bez strony WEB/loginu.
    // true  = wraca normalna blokada logowania przez globalThis.galleryEditorAuthenticated.
    // Nie usuwamy systemu logowania, tylko omijamy go podczas pracy w samym silniku Babylon.
    var galleryEditorLoginEnabled = true;
    var editorAuthenticated = !galleryEditorLoginEnabled || !!globalThis.galleryEditorAuthenticated;

    // ARTWORK UPLOAD / SUPABASE STORAGE
    // Pliki obrazow trzymamy w Supabase Storage, a w gallery_state zapisujemy tylko path/url.
    var galleryArtworkUploadEnabled = true;
    var galleryArtworkStorageBucket = "gallery-artworks";
    var galleryArtworkStoragePrefix = "main";
    var galleryArtworkDefaultFitMode = "contain";
    var galleryArtworkImageBaseMaterial = null;

    // STAGE 12A - 3D MODEL SLOTS FROM SCULPTURES
    // Obecne ArtSphere_* są traktowane jako sloty modeli 3D.
    // Model GLB wgrywamy raz do Storage, a potem można go kopiować/duplikować bez ponownego uploadu.
    var galleryModel3dUploadEnabled = true;
    var galleryModel3dStorageFolder = "models/Original";
    var galleryModel3dMaxUploadSizeMb = 50;
    var galleryModel3dClipboardState = null;
    var galleryModel3dCreateCounter = 0;
    var galleryModel3dLastDebug = null;

    // STAGE 12C - SCULPTURE ADD/DELETE UNIFIED ARTWORK FLOW
    // Statyczne sloty ArtSphere_* muszą mieć listę usuniętych nazw, tak jak artworki.
    // Inaczej po reloadzie domyślne rzeźby wróciłyby mimo usunięcia.
    var deletedModel3dSlotNames = [];

    // STAGE 11A - ARTWORK IMAGE VARIANTS / MOBILE TEXTURE BUDGET
    // Upload jednego pliku tworzy automatycznie warianty:
    // - web: desktop
    // - mobile: telefon
    // - preview: lekka miniatura/fallback
    // W gallery_state zapisujemy URL/path wariantów, telefon nie musi ładować oryginałów.
    var galleryArtworkImageVariantsEnabled = true;
    var galleryArtworkImageVariantFormat = "image/webp";
    var galleryArtworkImageVariantExtension = "webp";
    var galleryArtworkImageVariantSettings = {
        web: {
            maxSide: 2048,
            quality: 0.82
        },
        mobile: {
            maxSide: 1024,
            quality: 0.78
        },
        preview: {
            maxSide: 384,
            quality: 0.70
        }
    };

    // STAGE 11B - AUTHOR PHOTO VARIANTS
    // Zdjęcia autorów też muszą mieć warianty, bo duże portrety mogą zabić mobile
    // nawet wtedy, gdy obrazy na ścianach są już skompresowane.
    var galleryAuthorPhotoVariantsEnabled = true;
    var galleryAuthorPhotoVariantSettings = {
        web: {
            maxSide: 1024,
            quality: 0.82
        },
        mobile: {
            maxSide: 512,
            quality: 0.78
        },
        preview: {
            maxSide: 256,
            quality: 0.70
        }
    };

    var oldEditorStyle = document.getElementById("galleryEditorStyle");

    if (oldEditorStyle) {
        oldEditorStyle.remove();
    }

    var editorStyle = document.createElement("style");
    editorStyle.id = "galleryEditorStyle";
    editorStyle.innerHTML = `
        :root {
            --gallery-editor-radius-panel: 30px;
            --gallery-editor-radius-control: 15px;
            --gallery-editor-radius-swatch: 10px;
            --gallery-editor-screen-gap: clamp(30px, 3.2vw, 40px);
            --gallery-editor-bottom-gap: calc(var(--gallery-editor-screen-gap) + 34px);
            --gallery-editor-top-gap: var(--gallery-editor-bottom-gap);
            --gallery-editor-border-soft: rgba(255, 255, 255, 0.62);
        }

        #galleryEditorPanel {
            --gallery-editor-radius-panel: 30px;
            --gallery-editor-radius-control: 15px;
            --gallery-editor-radius-swatch: 10px;
            --gallery-editor-screen-gap: clamp(30px, 3.2vw, 40px);
            --gallery-editor-bottom-gap: calc(var(--gallery-editor-screen-gap) + 34px);
            --gallery-editor-border-soft: rgba(255, 255, 255, 0.62);
            position: absolute;
            right: var(--gallery-editor-screen-gap);
            bottom: var(--gallery-editor-bottom-gap);
            width: min(420px, calc(100vw - 32px));
            max-height: calc(100vh - var(--gallery-editor-top-gap) - var(--gallery-editor-bottom-gap));
            z-index: 1000;
            display: none;
            flex-direction: column;
            box-sizing: border-box;
            overflow: hidden;
            /* Glass 5 - Strong Frost */
            background:
                linear-gradient(145deg, rgba(255, 255, 255, 0.50), rgba(246, 245, 240, 0.20)),
                rgba(255, 255, 255, 0.56);
            color: #303030;
            border: 1.25px solid rgba(255, 255, 255, 0.94);
            border-radius: var(--gallery-editor-radius-panel);
            box-shadow:
                0 28px 60px rgba(0, 0, 0, 0.18),
                inset 0 1px 0 rgba(255, 255, 255, 0.96),
                inset 0 -1px 0 rgba(255, 255, 255, 0.28),
                inset 0 0 30px rgba(255, 255, 255, 0.18);
            backdrop-filter: blur(34px) saturate(1.30) brightness(1.05);
            -webkit-backdrop-filter: blur(34px) saturate(1.30) brightness(1.05);
            font-family: Arial, Helvetica, sans-serif;
            pointer-events: auto;
        }

        #galleryEditorPanel::before {
            content: "";
            position: absolute;
            inset: 0;
            border-radius: inherit;
            pointer-events: none;
            background:
                radial-gradient(circle at 14% 8%, rgba(255, 255, 255, 0.76), transparent 34%),
                radial-gradient(circle at 84% 92%, rgba(255, 255, 255, 0.34), transparent 38%),
                linear-gradient(180deg, rgba(255, 255, 255, 0.42), rgba(255, 255, 255, 0.10) 44%, rgba(255, 255, 255, 0.18));
            opacity: 0.92;
        }

        #galleryEditorPanel > * {
            position: relative;
            z-index: 1;
        }

        #galleryEditorPanel * {
            box-sizing: border-box;
        }

        .gallery-editor-scroll {
            max-height: calc(100vh - var(--gallery-editor-top-gap) - var(--gallery-editor-bottom-gap));
            overflow-y: auto;
            padding: 22px 28px 22px;
            scrollbar-width: thin;
        }

        .gallery-editor-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            padding-bottom: 18px;
            border-bottom: 1px solid rgba(66, 66, 66, 0.10);
        }

        .gallery-editor-mode-label {
            color: #3f7f3d;
            font-size: 18px;
            line-height: 1.2;
            letter-spacing: 0.01em;
            font-weight: 500;
        }

        .gallery-editor-menu-button {
            width: 44px;
            height: 44px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border: 1px solid rgba(0, 0, 0, 0.13);
            border-radius: var(--gallery-editor-radius-control);
            background: rgba(255, 255, 255, 0.28);
            color: #3b3b3b;
            cursor: default;
        }

        .gallery-editor-section {
            padding: 19px 0 18px;
            border-bottom: 1px solid rgba(66, 66, 66, 0.10);
        }

        .gallery-editor-section.is-hidden {
            display: none;
        }

        .gallery-editor-section-title {
            margin: 0 0 14px;
            font-size: 16px;
            font-weight: 700;
            line-height: 1.2;
            letter-spacing: 0.02em;
            color: #3d3d3d;
            text-transform: uppercase;
        }

        .gallery-editor-status-line {
            margin: 0 0 10px;
            font-size: 16px;
            line-height: 1.35;
            color: #3c3c3c;
        }

        .gallery-editor-status-line:last-child {
            margin-bottom: 0;
        }

        .gallery-editor-align-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
        }

        .gallery-editor-align-button {
            height: 56px;
            border: 1px solid rgba(0, 0, 0, 0.11);
            border-radius: var(--gallery-editor-radius-control);
            background: rgba(255, 255, 255, 0.26);
            color: #303030;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: background 140ms ease, border-color 140ms ease, transform 140ms ease, opacity 140ms ease;
        }

        .gallery-editor-align-button svg {
            width: 30px;
            height: 30px;
            stroke: currentColor;
        }

        .gallery-editor-align-button:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.78);
            border-color: rgba(63, 127, 61, 0.45);
        }

        .gallery-editor-align-button:active:not(:disabled) {
            transform: translateY(1px);
        }

        .gallery-editor-align-button:disabled {
            opacity: 0.35;
            cursor: not-allowed;
        }

        #wallColorPalette {
            display: flex;
            align-items: center;
            gap: 12px;
            flex-wrap: nowrap;
            margin-top: 2px;
        }

        .gallery-editor-swatch {
            width: 34px;
            height: 34px;
            padding: 0;
            border: 1px solid rgba(0, 0, 0, 0.16);
            border-radius: var(--gallery-editor-radius-swatch);
            background-size: cover;
            background-position: center;
            cursor: pointer;
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.40);
            transition: border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
        }

        .gallery-editor-swatch:hover {
            transform: translateY(-1px);
        }

        .gallery-editor-swatch.is-selected {
            border-color: rgba(63, 127, 61, 0.95);
            box-shadow: 0 0 0 3px rgba(63, 127, 61, 0.24), inset 0 0 0 1px rgba(255, 255, 255, 0.55);
        }

        .gallery-editor-color-status {
            margin-top: 14px;
            font-size: 15px;
            line-height: 1.35;
            color: #3c3c3c;
        }

        .gallery-editor-accent-text {
            color: #3f7f3d;
        }

        .gallery-editor-help-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 18px;
            margin-bottom: 0;
        }

        .gallery-editor-help-header .gallery-editor-section-title {
            margin-bottom: 0;
        }

        .gallery-editor-help-toggle {
            min-width: 112px;
            height: 40px;
            padding: 0 15px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 9px;
            border: 1px solid rgba(0, 0, 0, 0.14);
            border-radius: var(--gallery-editor-radius-control);
            background: rgba(255, 255, 255, 0.30);
            color: #4a4a4a;
            font-size: 15px;
            cursor: pointer;
        }

        .gallery-editor-help-toggle:hover {
            background: rgba(255, 255, 255, 0.84);
        }

        .gallery-editor-help-content {
            display: none;
            margin-top: 16px;
            font-size: 14px;
            line-height: 1.45;
            color: #414141;
        }

        .gallery-editor-help-content.is-open {
            display: block;
        }

        .gallery-editor-help-group {
            margin: 0 0 15px;
        }

        .gallery-editor-help-group:last-child {
            margin-bottom: 0;
        }

        .gallery-editor-help-title {
            margin: 0 0 8px;
            font-weight: 700;
            color: #333333;
        }

        .gallery-editor-help-line {
            margin: 0 0 5px;
        }

        .gallery-editor-help-line strong {
            font-weight: 700;
        }

        .gallery-editor-footer {
            padding-top: 18px;
        }

        .gallery-editor-footer-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
        }

        .gallery-editor-panel-mode-button,
        .gallery-editor-panel-lighting-button,
        .gallery-editor-floating-mode-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            min-height: 56px;
            padding: 0 22px;
            border-radius: 15px;
            border: 1px solid rgba(0, 0, 0, 0.24);
            background: linear-gradient(180deg, rgba(45, 45, 45, 0.96), rgba(25, 25, 25, 0.96));
            color: #ffffff;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 16px;
            font-weight: 800;
            letter-spacing: 0.02em;
            cursor: pointer;
            box-shadow: 0 12px 24px rgba(0, 0, 0, 0.16);
            transition: background 140ms ease, transform 140ms ease, box-shadow 140ms ease;
        }

        .gallery-editor-panel-mode-button:hover,
        .gallery-editor-panel-lighting-button:hover,
        .gallery-editor-floating-mode-button:hover {
            background: linear-gradient(180deg, rgba(55, 55, 55, 0.98), rgba(28, 28, 28, 0.98));
            box-shadow: 0 14px 28px rgba(0, 0, 0, 0.18);
        }

        .gallery-editor-panel-mode-button:active,
        .gallery-editor-panel-lighting-button:active,
        .gallery-editor-floating-mode-button:active {
            transform: translateY(1px);
        }

        .gallery-editor-panel-mode-button,
        .gallery-editor-panel-lighting-button {
            width: 100%;
        }

        .gallery-editor-floating-mode-button {
            position: absolute;
            right: var(--gallery-editor-screen-gap);
            bottom: var(--gallery-editor-bottom-gap);
            z-index: 999;
            background:
                linear-gradient(145deg, rgba(255, 255, 255, 0.48), rgba(246, 245, 240, 0.26)),
                rgba(255, 255, 255, 0.20);
            border-color: rgba(63, 127, 61, 0.86);
            backdrop-filter: blur(36px) saturate(1.50) brightness(1.08);
            -webkit-backdrop-filter: blur(36px) saturate(1.50) brightness(1.08);
            box-shadow:
                0 12px 34px rgba(0, 0, 0, 0.15),
                inset 0 1px 0 rgba(255, 255, 255, 0.90);
        }

        .gallery-editor-icon {
            width: 21px;
            height: 21px;
            flex: 0 0 auto;
        }

        .gallery-editor-caret {
            width: 13px;
            height: 13px;
            flex: 0 0 auto;
            stroke: currentColor;
        }


        #galleryEditorPanel.is-lighting-mode {
            width: min(520px, calc(100vw - 32px));
        }

        .gallery-lighting-scroll {
            max-height: calc(100vh - var(--gallery-editor-top-gap) - var(--gallery-editor-bottom-gap));
            overflow: hidden;
            padding: 22px 28px 22px;
            scrollbar-width: thin;
            display: none;
            flex-direction: column;
        }

        .gallery-lighting-content-stack {
            flex: 0 1 auto;
            min-height: 0;
            overflow-y: auto;
            overflow-x: hidden;
            padding-right: 10px;
            scrollbar-width: thin;
        }

        .gallery-lighting-header {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            padding-bottom: 18px;
            border-bottom: 1px solid rgba(66, 66, 66, 0.10);
        }

        .gallery-lighting-mode-label {
            color: #3f7f3d;
            font-size: 18px;
            line-height: 1.2;
            letter-spacing: 0.01em;
            font-weight: 500;
        }

        .gallery-lighting-menu-button {
            width: 44px;
            height: 44px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border: 1px solid rgba(0, 0, 0, 0.13);
            border-radius: var(--gallery-editor-radius-control);
            background: rgba(255, 255, 255, 0.28);
            color: #3b3b3b;
            cursor: pointer;
        }


        .gallery-lighting-dropdown {
            position: absolute;
            top: 52px;
            right: 0;
            min-width: 168px;
            padding: 8px;
            border-radius: 14px;
            border: 1px solid rgba(0, 0, 0, 0.12);
            background:
                linear-gradient(145deg, rgba(255, 255, 255, 0.62), rgba(246, 245, 240, 0.36)),
                rgba(255, 255, 255, 0.28);
            backdrop-filter: blur(28px) saturate(1.35);
            -webkit-backdrop-filter: blur(28px) saturate(1.35);
            box-shadow:
                0 12px 26px rgba(0, 0, 0, 0.13),
                inset 0 1px 0 rgba(255, 255, 255, 0.78);
            display: none;
            z-index: 5;
        }

        .gallery-lighting-dropdown.is-open {
            display: grid;
            gap: 6px;
        }

        .gallery-lighting-dropdown-button {
            appearance: none;
            min-height: 36px;
            padding: 0 12px;
            border-radius: 10px;
            border: 1px solid rgba(0, 0, 0, 0.10);
            background: rgba(255, 255, 255, 0.22);
            color: #303030;
            font-size: 13px;
            font-weight: 800;
            cursor: pointer;
            text-align: left;
        }

        .gallery-lighting-dropdown-button:hover {
            background: rgba(255, 255, 255, 0.36);
        }

        .gallery-lighting-section {
            padding: 18px 0 18px;
            border-bottom: 1px solid rgba(66, 66, 66, 0.10);
        }

        .gallery-lighting-section-title {
            margin: 0 0 14px;
            font-size: 16px;
            font-weight: 800;
            line-height: 1.2;
            letter-spacing: 0.05em;
            color: #303030;
        }

        .gallery-lighting-row {
            display: grid;
            grid-template-columns: 142px 1fr 50px;
            align-items: center;
            gap: 18px;
            margin-bottom: 13px;
        }

        .gallery-lighting-row:last-child {
            margin-bottom: 0;
        }

        .gallery-lighting-label {
            font-size: 15px;
            line-height: 1.25;
            color: #3a3a3a;
            font-family: Arial, Helvetica, sans-serif;
        }

        .gallery-lighting-value {
            text-align: right;
            font-size: 14px;
            color: #585858;
            font-family: Arial, Helvetica, sans-serif;
            font-variant-numeric: tabular-nums;
        }

        .gallery-lighting-range {
            width: 100%;
            appearance: none;
            -webkit-appearance: none;
            height: 4px;
            border-radius: 999px;
            background: rgba(28, 28, 28, 0.18);
            outline: none;
        }

        .gallery-lighting-range::-webkit-slider-runnable-track {
            height: 4px;
            border-radius: 999px;
            background: rgba(28, 28, 28, 0.18);
        }

        .gallery-lighting-range::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 12px;
            height: 12px;
            margin-top: -4px;
            border-radius: 2px;
            border: 1px solid rgba(18, 18, 18, 0.88);
            background: #222222;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
        }

        .gallery-lighting-range::-moz-range-track {
            height: 4px;
            border: none;
            border-radius: 999px;
            background: rgba(28, 28, 28, 0.18);
        }

        .gallery-lighting-range::-moz-range-thumb {
            width: 12px;
            height: 12px;
            border-radius: 2px;
            border: 1px solid rgba(18, 18, 18, 0.88);
            background: #222222;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
        }

        .gallery-lighting-color-row {
            display: grid;
            grid-template-columns: 1fr 72px;
            align-items: center;
            gap: 12px;
            margin-bottom: 13px;
        }

        .gallery-lighting-color-row:last-child {
            margin-bottom: 0;
        }

        .gallery-lighting-color {
            width: 72px;
            height: 32px;
            padding: 0;
            border: 1px solid rgba(0, 0, 0, 0.18);
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.18);
            cursor: pointer;
        }

        .gallery-lighting-checkbox-row {
            display: inline-flex;
            align-items: center;
            gap: 9px;
            margin: 0 0 13px;
            font-size: 15px;
            line-height: 1.25;
            color: #333333;
            cursor: pointer;
            user-select: none;
        }

        .gallery-lighting-checkbox-row:last-child {
            margin-bottom: 0;
        }

        .gallery-lighting-checkbox-row input {
            width: 16px;
            height: 16px;
            margin: 0;
            accent-color: #303030;
        }

        .gallery-lighting-quick-presets {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
            margin-bottom: 12px;
        }

        .gallery-lighting-quick-button {
            appearance: none;
            min-height: 38px;
            padding: 0 10px;
            border-radius: 10px;
            border: 1px solid rgba(0, 0, 0, 0.12);
            background: rgba(255, 255, 255, 0.26);
            color: #303030;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
        }

        .gallery-lighting-reset-button {
            appearance: none;
            width: 100%;
            min-height: 38px;
            margin-bottom: 12px;
            padding: 0 12px;
            border-radius: 10px;
            border: 1px solid rgba(0, 0, 0, 0.12);
            background: rgba(255, 255, 255, 0.22);
            color: #303030;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
        }

        .gallery-lighting-presets {
            display: grid;
            gap: 9px;
        }

        .gallery-lighting-preset-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) repeat(3, minmax(64px, 72px));
            gap: 10px;
            align-items: center;
            min-height: 56px;
            padding: 8px 10px 8px 14px;
            border: 1px solid rgba(255, 255, 255, 0.56);
            border-radius: 14px;
            background: rgba(255, 255, 255, 0.20);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.54);
        }

        .gallery-lighting-preset-name {
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: 2px;
            font-size: 14px;
            font-weight: 800;
            line-height: 1.15;
            color: #303030;
        }

        .gallery-lighting-preset-status {
            display: block;
            margin-top: 0;
            font-size: 11px;
            font-weight: 600;
            color: #707070;
        }

        .gallery-lighting-preset-button {
            appearance: none;
            width: 100%;
            min-width: 0;
            min-height: 34px;
            padding: 0 10px;
            border-radius: 10px;
            border: 1px solid rgba(0, 0, 0, 0.12);
            background: rgba(255, 255, 255, 0.28);
            color: #303030;
            font-size: 13px;
            font-family: Arial, Helvetica, sans-serif;
            font-weight: 700;
            cursor: pointer;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.62);
        }

        .gallery-lighting-preset-button:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.38);
        }

        .gallery-lighting-preset-button:disabled {
            opacity: 0.42;
            cursor: default;
        }

        .gallery-lighting-note {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            margin: 12px 0 0;
            font-size: 12px;
            line-height: 1.35;
            color: #696969;
        }

        .gallery-lighting-note-icon {
            width: 16px;
            height: 16px;
            flex: 0 0 auto;
            border: 1px solid rgba(0, 0, 0, 0.18);
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            line-height: 1;
            margin-top: 1px;
        }



        .gallery-lighting-value.is-mixed {
            min-width: 56px;
            padding: 3px 7px;
            border-radius: 999px;
            text-align: center;
            color: #4a4a4a;
            background: rgba(0, 0, 0, 0.07);
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.035em;
            text-transform: uppercase;
        }


        .gallery-local-helper-legend {
            margin: 10px 0 0;
            padding: 10px 12px;
            border-radius: 12px;
            border: 1px solid rgba(0, 0, 0, 0.08);
            background: rgba(255, 255, 255, 0.18);
            color: #616161;
            font-size: 12px;
            line-height: 1.35;
        }

        .gallery-local-helper-legend strong {
            color: #3f3f3f;
        }

        .gallery-local-mixed-note {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            margin: 10px 0 14px;
            padding: 10px 12px;
            border-radius: 12px;
            border: 1px solid rgba(0, 0, 0, 0.08);
            background: rgba(255, 255, 255, 0.18);
            color: #606060;
            font-size: 12px;
            line-height: 1.35;
        }

        .gallery-local-mixed-dot {
            width: 17px;
            height: 17px;
            flex: 0 0 auto;
            margin-top: 1px;
            border-radius: 999px;
            border: 1px solid rgba(0, 0, 0, 0.14);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 800;
            color: #4a4a4a;
        }

        .gallery-local-collapsible-header {
            width: 100%;
            appearance: none;
            padding: 0;
            border: 0;
            background: transparent;
            color: #303030;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 14px;
            text-align: left;
        }

        .gallery-local-collapsible-header .gallery-lighting-section-title {
            margin-bottom: 0;
        }

        .gallery-local-collapsible-icon {
            width: 28px;
            height: 28px;
            border-radius: 999px;
            border: 1px solid rgba(0, 0, 0, 0.10);
            background: rgba(255, 255, 255, 0.24);
            color: #444444;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            font-weight: 700;
            line-height: 1;
            transition: transform 0.18s ease;
        }

        .gallery-local-collapsible-content {
            padding-top: 14px;
        }

        .gallery-local-collapsible-section.is-collapsed {
            padding-bottom: 18px;
        }

        .gallery-local-collapsible-section.is-collapsed .gallery-local-collapsible-content {
            display: none;
        }

        .gallery-local-collapsible-section.is-collapsed .gallery-local-collapsible-icon {
            transform: rotate(180deg);
        }

        .gallery-local-type-section.is-hidden {
            display: none;
        }



        .gallery-local-helper-note {
            margin: 10px 0 0;
            color: #6c6c6c;
            font-size: 12px;
            line-height: 1.35;
        }

        .gallery-local-status-line {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
        }

        .gallery-local-status-line strong {
            font-variant-numeric: tabular-nums;
        }

        .gallery-local-stage-note {
            margin: 12px 0 0;
            padding: 12px 14px;
            border: 1px solid rgba(0, 0, 0, 0.08);
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.18);
            color: #6a6a6a;
            font-size: 12px;
            line-height: 1.35;
        }

        .gallery-local-section-hidden {
            display: none;
        }

        .gallery-lighting-back-button {
            width: 100%;
            height: 56px;
            min-height: 56px;
            flex: 0 0 56px;
            margin-top: 14px;
            border-radius: 15px;
            border: 1px solid rgba(0, 0, 0, 0.24);
            background: linear-gradient(180deg, rgba(45, 45, 45, 0.96), rgba(25, 25, 25, 0.96));
            color: #ffffff;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 16px;
            font-weight: 800;
            letter-spacing: 0.02em;
            cursor: pointer;
            box-shadow: 0 12px 24px rgba(0, 0, 0, 0.16);
        }

        .gallery-lighting-back-button:hover {
            background: linear-gradient(180deg, rgba(55, 55, 55, 0.98), rgba(28, 28, 28, 0.98));
        }

        .gallery-lighting-back-button:active {
            transform: translateY(1px);
        }



        .gallery-lighting-mode-tabs {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
            flex: 0 0 auto;
            margin: 18px 0 0;
            padding: 4px;
            border: 1px solid rgba(0, 0, 0, 0.09);
            border-radius: 14px;
            background: rgba(255, 255, 255, 0.16);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.58);
        }

        .gallery-lighting-tab-button {
            appearance: none;
            height: 40px;
            width: 100%;
            padding: 0 12px;
            border-radius: 11px;
            border: 1px solid transparent;
            background: transparent;
            color: #6b6b6b;
            font-size: 13px;
            font-weight: 800;
            letter-spacing: 0.035em;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            text-align: center;
        }

        .gallery-lighting-tab-button.is-active {
            border-color: rgba(0, 0, 0, 0.13);
            background: rgba(255, 255, 255, 0.46);
            color: #2f2f2f;
            box-shadow:
                0 4px 12px rgba(0, 0, 0, 0.08),
                inset 0 1px 0 rgba(255, 255, 255, 0.72);
        }

        .gallery-lighting-tab-button,
        .gallery-lighting-tab-button.is-active {
            height: 40px;
            min-height: 40px;
            max-height: 40px;
        }

        .gallery-lighting-main-content,
        .gallery-lighting-local-content {
            display: block;
        }

        .gallery-lighting-content-hidden {
            display: none;
        }

        .gallery-local-create-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
        }

        .gallery-local-tool-button {
            appearance: none;
            min-height: 42px;
            padding: 0 12px;
            border-radius: 12px;
            border: 1px solid rgba(0, 0, 0, 0.12);
            background: rgba(255, 255, 255, 0.24);
            color: #333333;
            font-size: 14px;
            font-weight: 700;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }

        .gallery-local-tool-button:hover {
            background: rgba(255, 255, 255, 0.34);
        }

        .gallery-local-tool-button.is-primary {
            color: #2f5f2e;
            border-color: rgba(63, 127, 61, 0.34);
            background:
                linear-gradient(145deg, rgba(236, 248, 232, 0.48), rgba(255, 255, 255, 0.22));
        }

        .gallery-local-tool-button.is-active {
            color: #ffffff;
            border-color: rgba(47, 95, 46, 0.58);
            background: linear-gradient(180deg, rgba(63, 127, 61, 0.86), rgba(47, 95, 46, 0.88));
            box-shadow: 0 8px 18px rgba(47, 95, 46, 0.18);
        }

        .gallery-local-tool-button.is-danger {
            color: #5d2525;
            border-color: rgba(120, 40, 40, 0.20);
            background: rgba(255, 255, 255, 0.20);
        }

        .gallery-local-tool-button.is-wide {
            grid-column: 1 / -1;
            width: 100%;
        }

        .gallery-local-create-grid .gallery-local-tool-button.is-danger {
            grid-column: 1 / -1;
            width: 100%;
        }

        .gallery-local-tool-icon {
            font-size: 18px;
            line-height: 1;
        }

        .gallery-local-selection-lines {
            display: grid;
            gap: 7px;
            font-size: 15px;
            color: #333333;
        }

        .gallery-local-selection-lines strong {
            color: #303030;
            font-weight: 800;
        }

        .gallery-local-empty-note {
            margin: 12px 0 0;
            padding: 12px 14px;
            border: 1px solid rgba(0, 0, 0, 0.08);
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.18);
            color: #6a6a6a;
            font-size: 12px;
            line-height: 1.35;
        }

        .gallery-local-groups-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 8px;
        }

        .gallery-local-group-tile {
            appearance: none;
            min-height: 58px;
            padding: 8px 7px;
            border-radius: 13px;
            border: 1px solid rgba(0, 0, 0, 0.11);
            background: rgba(255, 255, 255, 0.22);
            color: #303030;
            cursor: pointer;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.58);
            display: grid;
            gap: 3px;
            align-content: center;
            justify-items: center;
        }

        .gallery-local-group-tile.is-active {
            border-color: rgba(63, 127, 61, 0.72);
            background:
                linear-gradient(145deg, rgba(236, 248, 232, 0.48), rgba(255, 255, 255, 0.24));
            box-shadow:
                0 6px 16px rgba(0, 0, 0, 0.08),
                inset 0 1px 0 rgba(255, 255, 255, 0.78);
        }

        .gallery-local-group-tile.is-solo {
            border-color: rgba(220, 142, 42, 0.74);
            background:
                linear-gradient(145deg, rgba(255, 233, 201, 0.58), rgba(255, 255, 255, 0.24));
            box-shadow:
                0 7px 18px rgba(180, 110, 32, 0.12),
                inset 0 1px 0 rgba(255, 255, 255, 0.82);
        }

        .gallery-local-group-name {
            font-size: 13px;
            font-weight: 800;
            line-height: 1.1;
        }

        .gallery-local-group-count {
            min-width: 24px;
            padding: 2px 7px;
            border-radius: 999px;
            background: rgba(0, 0, 0, 0.08);
            color: #3d3d3d;
            font-size: 12px;
            line-height: 1.1;
            font-variant-numeric: tabular-nums;
        }

        .gallery-local-group-actions {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
            margin-top: 12px;
        }

        .gallery-local-targets-grid,
        .gallery-local-transform-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
            margin-top: 2px;
        }

        .gallery-local-transform-grid {
            gap: 12px;
            margin: 0 0 18px;
            padding-bottom: 16px;
            border-bottom: 1px solid rgba(66, 66, 66, 0.10);
        }

        .gallery-local-targets-grid .gallery-lighting-checkbox-row,
        .gallery-local-transform-grid .gallery-lighting-checkbox-row {
            min-height: 40px;
            margin: 0;
            padding: 0 12px;
            border-radius: 12px;
            border: 1px solid rgba(0, 0, 0, 0.10);
            background: rgba(255, 255, 255, 0.20);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.58);
            gap: 8px;
        }

        .gallery-local-targets-grid .gallery-lighting-checkbox-row:hover,
        .gallery-local-transform-grid .gallery-lighting-checkbox-row:hover {
            background: rgba(255, 255, 255, 0.30);
        }

        .gallery-local-targets-grid .gallery-lighting-checkbox-row input,
        .gallery-local-transform-grid .gallery-lighting-checkbox-row input {
            flex: 0 0 auto;
            width: 16px;
            height: 16px;
            accent-color: #4f8f4e;
        }

        .gallery-local-targets-grid .gallery-lighting-checkbox-row span,
        .gallery-local-transform-grid .gallery-lighting-checkbox-row span {
            font-size: 14px;
            font-weight: 700;
            color: #373737;
        }

        .gallery-local-general-transform-note {
            margin-top: 10px;
        }

        .gallery-local-advanced-targets {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px 10px;
        }

        .gallery-local-advanced-targets .gallery-lighting-checkbox-row {
            margin-bottom: 0;
        }

        .gallery-local-subtle-heading {
            margin: 0 0 10px;
            color: #555555;
            font-size: 12px;
            line-height: 1.2;
            font-weight: 800;
            letter-spacing: 0.035em;
            text-transform: uppercase;
        }

        .gallery-local-general-section .gallery-local-subtle-heading {
            margin-top: 4px;
            margin-bottom: 12px;
        }

        .gallery-local-general-section .gallery-local-enabled-row {
            margin: 0 0 16px;
        }

        .gallery-local-general-section .gallery-lighting-color-row {
            margin-top: 2px;
        }


        .gallery-artwork-image-section.is-hidden,
        .gallery-artwork-transform-section.is-hidden {
            display: none;
        }

        .gallery-artwork-transform-grid {
            display: grid;
            gap: 12px;
        }

        .gallery-artwork-transform-row {
            display: grid;
            grid-template-columns: 72px minmax(120px, 1fr) 64px;
            gap: 10px;
            align-items: center;
        }

        .gallery-artwork-transform-label {
            margin: 0;
            color: #555555;
            font-size: 12px;
            line-height: 1.2;
            font-weight: 800;
            letter-spacing: 0.035em;
            text-transform: uppercase;
        }

        .gallery-artwork-transform-value {
            min-height: 34px;
            padding: 0 8px;
            border-radius: 11px;
            border: 1px solid rgba(0, 0, 0, 0.10);
            background: rgba(255, 255, 255, 0.22);
            color: #303030;
            font-size: 12px;
            font-weight: 800;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            white-space: nowrap;
        }

        .gallery-artwork-transform-slider {
            appearance: none;
            width: 100%;
            height: 34px;
            margin: 0;
            background: transparent;
            cursor: pointer;
        }

        .gallery-artwork-transform-slider::-webkit-slider-runnable-track {
            height: 10px;
            border-radius: 999px;
            border: 1px solid rgba(0, 0, 0, 0.10);
            background: rgba(255, 255, 255, 0.28);
            box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.10);
        }

        .gallery-artwork-transform-slider::-webkit-slider-thumb {
            appearance: none;
            width: 22px;
            height: 22px;
            margin-top: -7px;
            border-radius: 50%;
            border: 2px solid rgba(0, 0, 0, 0.18);
            background: rgba(255, 255, 255, 0.95);
            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.18);
        }

        .gallery-artwork-transform-slider::-moz-range-track {
            height: 10px;
            border-radius: 999px;
            border: 1px solid rgba(0, 0, 0, 0.10);
            background: rgba(255, 255, 255, 0.28);
            box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.10);
        }

        .gallery-artwork-transform-slider::-moz-range-thumb {
            width: 22px;
            height: 22px;
            border-radius: 50%;
            border: 2px solid rgba(0, 0, 0, 0.18);
            background: rgba(255, 255, 255, 0.95);
            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.18);
        }

        .gallery-artwork-transform-slider:disabled {
            opacity: 0.45;
            cursor: not-allowed;
        }

        .gallery-artwork-transform-reset {
            margin-top: 12px;
            width: 100%;
        }

        .gallery-artwork-image-status {
            margin: 0 0 12px;
            font-size: 14px;
            line-height: 1.35;
            color: #555555;
            overflow-wrap: anywhere;
        }

        .gallery-artwork-image-status strong {
            color: #303030;
            font-weight: 800;
        }

        .gallery-editor-field-label {
            display: block;
            margin: 0 0 8px;
            color: #555555;
            font-size: 12px;
            line-height: 1.2;
            font-weight: 800;
            letter-spacing: 0.035em;
            text-transform: uppercase;
        }

        .gallery-editor-text-input {
            appearance: none;
            width: 100%;
            min-height: 40px;
            padding: 0 12px;
            border-radius: 12px;
            border: 1px solid rgba(0, 0, 0, 0.13);
            background: rgba(255, 255, 255, 0.24);
            color: #303030;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 13px;
            outline: none;
        }

        .gallery-editor-text-input:focus {
            border-color: rgba(63, 127, 61, 0.45);
            background: rgba(255, 255, 255, 0.36);
        }

        .gallery-artwork-image-actions {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
            margin-top: 12px;
        }

        .gallery-artwork-image-actions.is-three {
            grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .gallery-artwork-image-actions.is-four {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .gallery-editor-action-button {
            appearance: none;
            min-height: 40px;
            padding: 0 10px;
            border-radius: 12px;
            border: 1px solid rgba(0, 0, 0, 0.12);
            background: rgba(255, 255, 255, 0.24);
            color: #333333;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 13px;
            font-weight: 800;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            text-align: center;
        }

        .gallery-editor-action-button:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.36);
        }

        .gallery-editor-action-button:disabled {
            opacity: 0.42;
            cursor: not-allowed;
        }

        .gallery-editor-action-button.is-primary {
            color: #2f5f2e;
            border-color: rgba(63, 127, 61, 0.34);
            background:
                linear-gradient(145deg, rgba(236, 248, 232, 0.48), rgba(255, 255, 255, 0.22));
        }

        .gallery-editor-action-button.is-danger {
            color: #6b2b2b;
            border-color: rgba(130, 45, 45, 0.22);
        }

        .gallery-artwork-image-note {
            margin: 10px 0 0;
            color: #6c6c6c;
            font-size: 12px;
            line-height: 1.35;
        }


        .gallery-artwork-info-popup {
            position: absolute;
            left: 50%;
            bottom: 34px;
            transform: translateX(-50%);
            width: min(640px, calc(100% - 40px));
            padding: 16px;
            border-radius: 24px;
            border: 1px solid rgba(255, 255, 255, 0.90);
            background:
                linear-gradient(145deg, rgba(255, 255, 255, 0.52), rgba(246, 245, 240, 0.24)),
                rgba(255, 255, 255, 0.56);
            box-shadow:
                0 22px 54px rgba(0, 0, 0, 0.20),
                inset 0 1px 0 rgba(255, 255, 255, 0.96),
                inset 0 -1px 0 rgba(255, 255, 255, 0.28),
                inset 0 0 30px rgba(255, 255, 255, 0.18);
            backdrop-filter: blur(28px) saturate(1.20) brightness(1.04);
            -webkit-backdrop-filter: blur(28px) saturate(1.20) brightness(1.04);
            z-index: 40;
            pointer-events: none;
            opacity: 0;
            visibility: hidden;
            transition: opacity 180ms ease, transform 180ms ease, visibility 180ms ease;
        }

        .gallery-artwork-info-popup.is-visible {
            opacity: 1;
            visibility: visible;
            transform: translateX(-50%) translateY(-6px);
        }

        .gallery-artwork-info-popup-inner {
            display: grid;
            grid-template-columns: 140px minmax(0, 1fr);
            gap: 16px;
            align-items: stretch;
        }

        .gallery-artwork-info-author-card,
        .gallery-artwork-info-details-card {
            min-width: 0;
            border-radius: 18px;
            border: 1px solid rgba(255, 255, 255, 0.72);
            background: rgba(255, 255, 255, 0.20);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
        }

        .gallery-artwork-info-author-card {
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            align-items: stretch;
        }

        .gallery-artwork-info-photo-frame {
            position: relative;
            width: 100%;
            aspect-ratio: 1 / 1;
            border-radius: 16px;
            overflow: hidden;
            background: rgba(255, 255, 255, 0.34);
            border: 1px solid rgba(255, 255, 255, 0.76);
        }

        .gallery-artwork-info-author-photo {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: none;
        }

        .gallery-artwork-info-author-photo.is-visible {
            display: block;
        }

        .gallery-artwork-info-author-photo-placeholder {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 10px;
            color: #6f6f6f;
            font-size: 13px;
            line-height: 1.25;
            font-weight: 600;
            text-align: center;
        }

        .gallery-artwork-info-author-name {
            min-height: 20px;
            color: #333333;
            font-size: 15px;
            line-height: 1.35;
            font-weight: 700;
            text-align: center;
            overflow-wrap: anywhere;
        }

        .gallery-artwork-info-details-card {
            padding: 16px 18px;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
        }

        .gallery-artwork-info-kicker {
            margin: 0 0 6px;
            color: #6a6a6a;
            font-size: 11px;
            line-height: 1.2;
            font-weight: 800;
            letter-spacing: 0.12em;
            text-transform: uppercase;
        }

        .gallery-artwork-info-title {
            margin: 0;
            color: #2f2f2f;
            font-size: 21px;
            line-height: 1.14;
            font-weight: 700;
            letter-spacing: -0.01em;
            overflow-wrap: anywhere;
        }

        .gallery-artwork-info-description {
            margin: 10px 0 0;
            color: #474747;
            font-size: 14px;
            line-height: 1.5;
            max-height: 112px;
            overflow: hidden;
            white-space: pre-wrap;
            word-break: break-word;
        }

        .gallery-artwork-info-empty {
            margin: 4px 0 0;
            color: #6f6f6f;
            font-size: 13px;
            line-height: 1.45;
        }

        .gallery-artwork-info-editor-grid {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
            gap: 14px;
            align-items: stretch;
        }

        .gallery-artwork-info-editor-card {
            min-width: 0;
            padding: 12px;
            border-radius: 18px;
            border: 1px solid rgba(255, 255, 255, 0.68);
            background: rgba(255, 255, 255, 0.20);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.60);
        }

        .gallery-artwork-info-editor-photo-preview {
            position: relative;
            width: 100%;
            min-height: 112px;
            aspect-ratio: 1 / 0.84;
            border-radius: 16px;
            overflow: hidden;
            background: rgba(255, 255, 255, 0.34);
            border: 1px solid rgba(255, 255, 255, 0.76);
            margin-bottom: 14px;
        }

        .gallery-artwork-info-editor-photo-preview img {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: none;
        }

        .gallery-artwork-info-editor-photo-preview img.is-visible {
            display: block;
        }

        .gallery-artwork-info-editor-photo-placeholder {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 10px;
            color: #6f6f6f;
            font-size: 13px;
            line-height: 1.25;
            font-weight: 600;
            text-align: center;
        }

        .gallery-artwork-info-field-group + .gallery-artwork-info-field-group {
            margin-top: 12px;
        }

        .gallery-artwork-info-artwork-fields {
            margin-top: 14px;
            padding-top: 12px;
            border-top: 1px solid rgba(255, 255, 255, 0.45);
        }

        .gallery-artwork-info-author-tools {
            display: grid;
            gap: 10px;
        }

        .gallery-artwork-info-author-tools-note {
            margin: 0;
            color: #6c6c6c;
            font-size: 12px;
            line-height: 1.35;
        }

        .gallery-artwork-info-author-found {
            min-height: 40px;
            padding: 10px 12px;
            border-radius: 12px;
            border: 1px solid rgba(0, 0, 0, 0.10);
            background: rgba(255, 255, 255, 0.22);
            color: #4c4c4c;
            font-size: 12px;
            line-height: 1.35;
        }

        .gallery-artwork-info-textarea {
            display: block;
            width: 100%;
            min-height: 110px;
            padding: 10px 12px;
            border-radius: 12px;
            border: 1px solid rgba(0, 0, 0, 0.13);
            background: rgba(255, 255, 255, 0.24);
            color: #303030;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 13px;
            resize: vertical;
            line-height: 1.45;
            outline: none;
        }

        .gallery-artwork-info-textarea:focus {
            border-color: rgba(63, 127, 61, 0.45);
            background: rgba(255, 255, 255, 0.36);
        }

        /* Stage 8X1 final mobile popup override.
           This block is intentionally late to win over earlier mobile rules. */
        @media (max-width: 768px), (pointer: coarse) {
            .gallery-artwork-info-popup {
                left: 50% !important;
                bottom: 156px !important;
                width: min(340px, calc(100% - 24px)) !important;
                max-height: 27vh !important;
                padding: 10px !important;
                border-radius: 18px !important;
                overflow: hidden !important;
            }

            .gallery-artwork-info-popup.is-visible {
                transform: translateX(-50%) translateY(-4px) !important;
            }

            .gallery-artwork-info-popup-inner {
                display: grid !important;
                grid-template-columns: 76px minmax(0, 1fr) !important;
                gap: 8px !important;
                align-items: stretch !important;
            }

            .gallery-artwork-info-author-card {
                width: auto !important;
                max-width: none !important;
                padding: 7px !important;
                gap: 6px !important;
                border-radius: 14px !important;
            }

            .gallery-artwork-info-details-card {
                padding: 9px 10px !important;
                border-radius: 14px !important;
                justify-content: flex-start !important;
                min-width: 0 !important;
            }

            .gallery-artwork-info-photo-frame {
                width: 100% !important;
                max-width: 62px !important;
                height: 62px !important;
                aspect-ratio: auto !important;
                margin: 0 auto !important;
                border-radius: 12px !important;
            }

            .gallery-artwork-info-author-photo-placeholder {
                padding: 4px !important;
                font-size: 9px !important;
                line-height: 1.12 !important;
            }

            .gallery-artwork-info-author-name {
                min-height: 14px !important;
                font-size: 10px !important;
                line-height: 1.15 !important;
                font-weight: 700 !important;
            }

            .gallery-artwork-info-title {
                font-size: 14px !important;
                line-height: 1.14 !important;
                margin: 0 !important;
            }

            .gallery-artwork-info-description {
                margin-top: 5px !important;
                font-size: 10px !important;
                line-height: 1.25 !important;
                max-height: 36px !important;
                overflow: hidden !important;
            }

            .gallery-artwork-info-empty {
                font-size: 10px !important;
                line-height: 1.25 !important;
            }
        }

        @media (max-width: 420px), (pointer: coarse) {
            .gallery-artwork-info-popup {
                bottom: 150px !important;
                width: min(326px, calc(100% - 18px)) !important;
                max-height: 26vh !important;
                padding: 9px !important;
            }

            .gallery-artwork-info-popup-inner {
                grid-template-columns: 70px minmax(0, 1fr) !important;
                gap: 7px !important;
            }

            .gallery-artwork-info-photo-frame {
                max-width: 56px !important;
                height: 56px !important;
            }

            .gallery-artwork-info-title {
                font-size: 13px !important;
            }

            .gallery-artwork-info-description {
                max-height: 32px !important;
            }
        }


        @media (max-width: 768px) {
            .gallery-artwork-info-popup {
                left: 50%;
                bottom: 18px;
                width: min(360px, calc(100% - 22px));
                padding: 12px;
                border-radius: 20px;
                max-height: 42vh;
                overflow: hidden;
            }

            .gallery-artwork-info-popup.is-visible {
                transform: translateX(-50%) translateY(-4px);
            }

            .gallery-artwork-info-popup-inner {
                grid-template-columns: 92px minmax(0, 1fr);
                gap: 10px;
                align-items: stretch;
            }

            .gallery-artwork-info-author-card,
            .gallery-artwork-info-details-card {
                border-radius: 16px;
            }

            .gallery-artwork-info-author-card {
                padding: 9px;
                gap: 8px;
            }

            .gallery-artwork-info-details-card {
                padding: 11px 12px;
            }

            .gallery-artwork-info-photo-frame {
                border-radius: 13px;
            }

            .gallery-artwork-info-author-photo-placeholder {
                padding: 7px;
                font-size: 11px;
            }

            .gallery-artwork-info-author-name {
                min-height: 16px;
                font-size: 12px;
                line-height: 1.22;
            }

            .gallery-artwork-info-title {
                font-size: 16px;
                line-height: 1.16;
            }

            .gallery-artwork-info-description {
                margin-top: 7px;
                font-size: 12px;
                line-height: 1.34;
                max-height: 58px;
            }

            .gallery-artwork-info-empty {
                font-size: 12px;
            }
        }

        @media (max-width: 420px) {
            .gallery-artwork-info-popup {
                bottom: 12px;
                width: calc(100% - 16px);
                padding: 10px;
                border-radius: 18px;
                max-height: 40vh;
            }

            .gallery-artwork-info-popup-inner {
                grid-template-columns: 78px minmax(0, 1fr);
                gap: 8px;
            }

            .gallery-artwork-info-author-card {
                padding: 8px;
            }

            .gallery-artwork-info-details-card {
                padding: 10px;
            }

            .gallery-artwork-info-title {
                font-size: 15px;
            }

            .gallery-artwork-info-description {
                max-height: 48px;
                font-size: 11px;
            }

            .gallery-artwork-info-author-name {
                font-size: 11px;
            }
        }

        @media (max-width: 768px) {
            .gallery-artwork-info-popup {
                width: min(420px, calc(100% - 24px));
                padding: 14px;
                border-radius: 22px;
            }

            .gallery-artwork-info-popup-inner,
            .gallery-artwork-info-editor-grid {
                grid-template-columns: 1fr;
            }

            .gallery-artwork-info-author-card,
            .gallery-artwork-info-editor-card {
                width: 100%;
            }

            #galleryEditorPanel {
                left: 18px;
                right: 18px;
                bottom: 58px;
                width: auto;
                max-height: calc(100vh - 116px);
                border-radius: 24px;
            }

            .gallery-editor-scroll {
                max-height: calc(100vh - 116px);
                padding: 20px 20px 20px;
            }

            .gallery-editor-floating-mode-button {
                right: 18px;
                bottom: 58px;
            }

            .gallery-editor-footer-actions {
                grid-template-columns: 1fr;
            }

            .gallery-editor-align-grid {
                gap: 10px;
            }

            .gallery-editor-align-button {
                height: 54px;
            }

            #wallColorPalette {
                gap: 9px;
            }

            .gallery-editor-swatch {
                width: 30px;
                height: 30px;
            }

            .gallery-artwork-transform-row {
                grid-template-columns: 64px minmax(104px, 1fr) 58px;
            }

            #galleryEditorPanel.is-lighting-mode {
                width: auto;
            }

            .gallery-lighting-scroll {
                max-height: calc(100vh - 116px);
                padding: 20px 20px 20px;
            }

            .gallery-lighting-content-stack {
                padding-right: 6px;
            }

            .gallery-lighting-row {
                grid-template-columns: 128px 1fr 44px;
                gap: 14px;
            }

            .gallery-lighting-quick-presets {
                grid-template-columns: 1fr;
            }

            .gallery-lighting-preset-row {
                grid-template-columns: 1fr;
            }

            .gallery-local-targets-grid,
            .gallery-local-transform-grid,
            .gallery-local-advanced-targets {
                grid-template-columns: 1fr;
            }

            .gallery-lighting-preset-button,
            .gallery-lighting-quick-button {
                width: 100%;
            }
        }
    `;

    document.head.appendChild(editorStyle);

    var editHelpPanel = document.createElement("div");
    editHelpPanel.id = "galleryEditorPanel";

    var editorScroll = document.createElement("div");
    editorScroll.className = "gallery-editor-scroll";

    var editorHeader = document.createElement("div");
    editorHeader.className = "gallery-editor-header";

    var editModeLabel = document.createElement("div");
    editModeLabel.className = "gallery-editor-mode-label";
    editModeLabel.innerText = "Mode: Edit";

    var editorMenuButton = document.createElement("button");
    editorMenuButton.type = "button";
    editorMenuButton.className = "gallery-editor-menu-button";
    editorMenuButton.title = "Lighting settings";
    editorMenuButton.innerHTML = `
        <svg viewBox="0 0 24 24" width="23" height="23" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M8 6h10"></path>
            <path d="M8 12h10"></path>
            <path d="M8 18h10"></path>
            <path d="M4.5 6h.01"></path>
            <path d="M4.5 12h.01"></path>
            <path d="M4.5 18h.01"></path>
        </svg>
    `;

    editorHeader.appendChild(editModeLabel);
    editorHeader.appendChild(editorMenuButton);
    editorScroll.appendChild(editorHeader);

    function createEditorSection(title) {
        var section = document.createElement("section");
        section.className = "gallery-editor-section";

        var heading = document.createElement("h3");
        heading.className = "gallery-editor-section-title";
        heading.innerText = title;

        section.appendChild(heading);

        return {
            section: section,
            heading: heading
        };
    }

    var selectionSectionData = createEditorSection("SELECTION");
    var selectedArtworkStatus = document.createElement("p");
    selectedArtworkStatus.id = "editorSelectedArtworkStatus";
    selectedArtworkStatus.className = "gallery-editor-status-line";
    selectedArtworkStatus.innerText = "Selected: None";

    var selectedArtworkCountStatus = document.createElement("p");
    selectedArtworkCountStatus.id = "editorSelectedArtworkCountStatus";
    selectedArtworkCountStatus.className = "gallery-editor-status-line";
    selectedArtworkCountStatus.innerText = "Selected Count: 0";

    selectionSectionData.section.appendChild(selectedArtworkStatus);
    selectionSectionData.section.appendChild(selectedArtworkCountStatus);
    editorScroll.appendChild(selectionSectionData.section);

    var artworkManageSectionData = createEditorSection("ARTWORKS / SCULPTURES");
    var artworkManageActions = document.createElement("div");
    artworkManageActions.className = "gallery-artwork-image-actions is-three";

    var artworkAddButton = document.createElement("button");
    artworkAddButton.type = "button";
    artworkAddButton.className = "gallery-editor-action-button is-primary";
    artworkAddButton.innerText = "ADD ARTWORK";

    var sculptureAddButton = document.createElement("button");
    sculptureAddButton.type = "button";
    sculptureAddButton.className = "gallery-editor-action-button is-primary";
    sculptureAddButton.innerText = "ADD SCULPTURE";

    var artworkDeleteSelectedButton = document.createElement("button");
    artworkDeleteSelectedButton.type = "button";
    artworkDeleteSelectedButton.className = "gallery-editor-action-button is-danger";
    artworkDeleteSelectedButton.innerText = "DELETE SELECTED";

    var artworkManageNote = document.createElement("p");
    artworkManageNote.className = "gallery-artwork-image-note";
    artworkManageNote.innerText = "Add Artwork works on walls. Add Sculpture creates a 3D model slot on the floor. Delete Selected removes the currently selected artwork or sculpture slot.";

    artworkManageActions.appendChild(artworkAddButton);
    artworkManageActions.appendChild(sculptureAddButton);
    artworkManageActions.appendChild(artworkDeleteSelectedButton);
    artworkManageSectionData.section.appendChild(artworkManageActions);
    artworkManageSectionData.section.appendChild(artworkManageNote);
    editorScroll.appendChild(artworkManageSectionData.section);

    function updateArtworkManagementUi() {
        if (!artworkManageSectionData || !artworkManageSectionData.section) {
            return;
        }

        artworkManageSectionData.section.classList.toggle(
            "is-hidden",
            !editMode
        );

        artworkAddButton.disabled = !editMode;
        sculptureAddButton.disabled = !editMode;
        artworkDeleteSelectedButton.disabled = !editMode || (
            selectedArtworks.length === 0 &&
            !activeModel3dSlot
        );
    }

    artworkAddButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();

        var artwork = addNewArtworkToScene();

        if (artwork) {
            notifyGalleryStatus("Added new artwork without automatic light. Upload an image, move it on the wall, then save state.");
        }
    };

    sculptureAddButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();

        var slot = addNewModel3dSlotToScene();

        if (slot) {
            notifyGalleryStatus("Added new sculpture/model slot. Upload GLB, move it on the floor, then save state.");
        }
    };

    artworkDeleteSelectedButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();

        deleteSelectedGalleryObjectsNoAutoLights()
            .catch(function (error) {
                console.warn("Delete selected gallery objects error:", error);
                notifyGalleryStatus("Delete selected error.");
            });
    };

    var artworkImageSectionData = createEditorSection("ARTWORK IMAGE");
    artworkImageSectionData.section.classList.add("gallery-artwork-image-section", "is-hidden");

    var artworkImageStatus = document.createElement("div");
    artworkImageStatus.className = "gallery-artwork-image-status";
    artworkImageStatus.innerHTML = "Image: <strong>None</strong>";

    var artworkImageUrlLabel = document.createElement("label");
    artworkImageUrlLabel.className = "gallery-editor-field-label";
    artworkImageUrlLabel.innerText = "Image URL / public path";

    var artworkImageUrlInput = document.createElement("input");
    artworkImageUrlInput.type = "text";
    artworkImageUrlInput.className = "gallery-editor-text-input";
    artworkImageUrlInput.placeholder = "https://... albo Supabase public URL";

    var artworkImageFileInput = document.createElement("input");
    artworkImageFileInput.type = "file";
    artworkImageFileInput.accept = "image/*";
    artworkImageFileInput.style.display = "none";

    var artworkImageActions = document.createElement("div");
    artworkImageActions.className = "gallery-artwork-image-actions is-three";

    var artworkImageUploadButton = document.createElement("button");
    artworkImageUploadButton.type = "button";
    artworkImageUploadButton.className = "gallery-editor-action-button is-primary";
    artworkImageUploadButton.innerText = "UPLOAD";

    var artworkImageApplyUrlButton = document.createElement("button");
    artworkImageApplyUrlButton.type = "button";
    artworkImageApplyUrlButton.className = "gallery-editor-action-button";
    artworkImageApplyUrlButton.innerText = "APPLY URL";

    var artworkImageRemoveButton = document.createElement("button");
    artworkImageRemoveButton.type = "button";
    artworkImageRemoveButton.className = "gallery-editor-action-button is-danger";
    artworkImageRemoveButton.innerText = "REMOVE";

    var artworkImageNote = document.createElement("p");
    artworkImageNote.className = "gallery-artwork-image-note";
    artworkImageNote.innerText = "Upload creates Original/Desktop/Mobile/Preview files in Supabase Storage. Mobile loads the smaller variant.";

    artworkImageActions.appendChild(artworkImageUploadButton);
    artworkImageActions.appendChild(artworkImageApplyUrlButton);
    artworkImageActions.appendChild(artworkImageRemoveButton);

    artworkImageSectionData.section.appendChild(artworkImageStatus);
    artworkImageSectionData.section.appendChild(artworkImageUrlLabel);
    artworkImageSectionData.section.appendChild(artworkImageUrlInput);
    artworkImageSectionData.section.appendChild(artworkImageFileInput);
    artworkImageSectionData.section.appendChild(artworkImageActions);
    artworkImageSectionData.section.appendChild(artworkImageNote);
    editorScroll.appendChild(artworkImageSectionData.section);

    // STAGE 11C - GLOBAL IMAGE OPTIMIZATION UI
    // Dodatkowa sekcja jest widoczna bez szukania przycisku w środku konkretnego pola.
    // Rebuild działa globalnie na wszystkie brakujące warianty.
    var imageOptimizationSectionData = createEditorSection("IMAGE OPTIMIZATION");

    var imageOptimizationNote = document.createElement("p");
    imageOptimizationNote.className = "gallery-artwork-image-note";
    imageOptimizationNote.innerText = "This is the only place for rebuilding image variants. Creates Desktop/Mobile/Preview files in Supabase Storage for artwork images and author photos.";

    var imageOptimizationActions = document.createElement("div");
    imageOptimizationActions.className = "gallery-artwork-image-actions is-two";

    var imageOptimizationArtworkButton = document.createElement("button");
    imageOptimizationArtworkButton.type = "button";
    imageOptimizationArtworkButton.className = "gallery-editor-action-button is-primary";
    imageOptimizationArtworkButton.innerText = "REBUILD ARTWORK VARIANTS";

    var imageOptimizationAuthorButton = document.createElement("button");
    imageOptimizationAuthorButton.type = "button";
    imageOptimizationAuthorButton.className = "gallery-editor-action-button is-primary";
    imageOptimizationAuthorButton.innerText = "REBUILD AUTHOR VARIANTS";

    imageOptimizationActions.appendChild(imageOptimizationArtworkButton);
    imageOptimizationActions.appendChild(imageOptimizationAuthorButton);
    imageOptimizationSectionData.section.appendChild(imageOptimizationNote);
    imageOptimizationSectionData.section.appendChild(imageOptimizationActions);
    editorScroll.appendChild(imageOptimizationSectionData.section);

    // STAGE 12A - 3D MODEL SLOT UI
    var model3dSectionData = createEditorSection("3D MODEL SLOT");
    model3dSectionData.section.classList.add("gallery-artwork-image-section", "is-hidden");

    var model3dStatus = document.createElement("div");
    model3dStatus.className = "gallery-artwork-image-status";
    model3dStatus.innerHTML = "Model: <strong>None</strong>";

    var model3dUrlLabel = document.createElement("label");
    model3dUrlLabel.className = "gallery-editor-field-label";
    model3dUrlLabel.innerText = "GLB URL / already uploaded model";

    var model3dUrlInput = document.createElement("input");
    model3dUrlInput.type = "text";
    model3dUrlInput.className = "gallery-editor-text-input";
    model3dUrlInput.placeholder = "https://.../model.glb";

    var model3dFileInput = document.createElement("input");
    model3dFileInput.type = "file";
    model3dFileInput.accept = ".glb,model/gltf-binary";
    model3dFileInput.style.display = "none";

    var model3dActionsMain = document.createElement("div");
    model3dActionsMain.className = "gallery-artwork-image-actions is-three";

    var model3dUploadButton = document.createElement("button");
    model3dUploadButton.type = "button";
    model3dUploadButton.className = "gallery-editor-action-button is-primary";
    model3dUploadButton.innerText = "UPLOAD GLB";

    var model3dApplyUrlButton = document.createElement("button");
    model3dApplyUrlButton.type = "button";
    model3dApplyUrlButton.className = "gallery-editor-action-button";
    model3dApplyUrlButton.innerText = "APPLY URL";

    var model3dRemoveButton = document.createElement("button");
    model3dRemoveButton.type = "button";
    model3dRemoveButton.className = "gallery-editor-action-button is-danger";
    model3dRemoveButton.innerText = "REMOVE MODEL";

    model3dActionsMain.appendChild(model3dUploadButton);
    model3dActionsMain.appendChild(model3dApplyUrlButton);
    model3dActionsMain.appendChild(model3dRemoveButton);

    var model3dActionsCopy = document.createElement("div");
    model3dActionsCopy.className = "gallery-artwork-image-actions is-three";

    var model3dDuplicateButton = document.createElement("button");
    model3dDuplicateButton.type = "button";
    model3dDuplicateButton.className = "gallery-editor-action-button";
    model3dDuplicateButton.innerText = "DUPLICATE SLOT";

    var model3dCopyButton = document.createElement("button");
    model3dCopyButton.type = "button";
    model3dCopyButton.className = "gallery-editor-action-button";
    model3dCopyButton.innerText = "COPY MODEL";

    var model3dPasteButton = document.createElement("button");
    model3dPasteButton.type = "button";
    model3dPasteButton.className = "gallery-editor-action-button";
    model3dPasteButton.innerText = "PASTE MODEL";

    model3dActionsCopy.appendChild(model3dDuplicateButton);
    model3dActionsCopy.appendChild(model3dCopyButton);
    model3dActionsCopy.appendChild(model3dPasteButton);

    var model3dNote = document.createElement("p");
    model3dNote.className = "gallery-artwork-image-note";
    model3dNote.innerText = "GLB is uploaded once. Duplicate / paste reuses the same model URL without another upload.";

    model3dSectionData.section.appendChild(model3dStatus);
    model3dSectionData.section.appendChild(model3dUrlLabel);
    model3dSectionData.section.appendChild(model3dUrlInput);
    model3dSectionData.section.appendChild(model3dFileInput);
    model3dSectionData.section.appendChild(model3dActionsMain);
    model3dSectionData.section.appendChild(model3dActionsCopy);
    model3dSectionData.section.appendChild(model3dNote);
    editorScroll.appendChild(model3dSectionData.section);

    // STAGE 12C - model UI ma siedzieć w tym samym miejscu co panel artworka.
    // Fizycznie przenosimy sekcję przed ARTWORK IMAGE, żeby po zaznaczeniu obiektu
    // nie trzeba było szukać kontrolek niżej przy globalnej optymalizacji.
    if (artworkImageSectionData && artworkImageSectionData.section) {
        editorScroll.insertBefore(model3dSectionData.section, artworkImageSectionData.section);
    }

    function runArtworkImageVariantsRebuildFromUi() {
        var missingCount = getActiveArtworks().filter(function (candidate) {
            return artworkImageStateNeedsVariants(getArtworkImageState(candidate));
        }).length;

        if (!missingCount) {
            notifyGalleryStatus("All artwork images already have Desktop/Mobile variants.");
            return;
        }

        var confirmed = true;

        if (typeof window !== "undefined" && window.confirm) {
            confirmed = window.confirm(
                "Rebuild artwork image variants for " + missingCount + " image(s)? This can take a while."
            );
        }

        if (!confirmed) {
            return;
        }

        rebuildAllArtworkImageVariants()
            .then(function (result) {
                console.info("Artwork image variants rebuild:", result);

                if (result.rebuilt > 0) {
                    return saveGalleryStateToSupabase()
                        .then(function () {
                            notifyGalleryStatus("Artwork variants ready and saved. Rebuilt: " + result.rebuilt + ", failed: " + result.failed + ".");
                            return result;
                        });
                }

                notifyGalleryStatus("No artwork variants to rebuild. Failed: " + result.failed + ".");
                return result;
            })
            .catch(function (error) {
                console.warn("Rebuild artwork image variants error:", error);
                notifyGalleryStatus("Artwork variants rebuild failed.");
            })
            .finally(function () {
                updateArtworkImageUi();
                updateArtworkTransformUi();
            });
    }

    function runAuthorPhotoVariantsRebuildFromUi() {
        var missingCount = getAuthorRecordsNeedingPhotoVariants().length;

        if (!missingCount) {
            notifyGalleryStatus("All author photos already have Desktop/Mobile variants.");
            return;
        }

        var confirmed = true;

        if (typeof window !== "undefined" && window.confirm) {
            confirmed = window.confirm(
                "Rebuild author photo variants for " + missingCount + " author(s)? This can take a while."
            );
        }

        if (!confirmed) {
            return;
        }

        rebuildAllAuthorPhotoVariants()
            .then(function (result) {
                console.info("Author photo variants rebuild:", result);

                if (result.rebuilt > 0) {
                    return saveGalleryStateToSupabase()
                        .then(function () {
                            notifyGalleryStatus("Author variants ready and saved. Rebuilt: " + result.rebuilt + ", failed: " + result.failed + ".");
                            return result;
                        });
                }

                notifyGalleryStatus("No author variants to rebuild. Failed: " + result.failed + ".");
                return result;
            })
            .catch(function (error) {
                console.warn("Rebuild author photo variants error:", error);
                notifyGalleryStatus("Author variants rebuild failed.");
            })
            .finally(function () {
                updateArtworkInfoUi();
                updateArtworkTransformUi();
            });
    }

    imageOptimizationArtworkButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();
        runArtworkImageVariantsRebuildFromUi();
    };

    imageOptimizationAuthorButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();
        runAuthorPhotoVariantsRebuildFromUi();
    };

    function createGalleryTextInputCompat(placeholder) {
        var input = document.createElement("input");
        input.type = "text";
        input.className = "gallery-editor-text-input";
        input.placeholder = placeholder || "";
        return input;
    }

    var artworkInfoSectionData = createEditorSection("ARTWORK INFO");
    var artworkInfoAuthorPhotoInput = createGalleryTextInputCompat("https://... image URL");
    var artworkInfoAuthorPhotoFileInput = document.createElement("input");
    artworkInfoAuthorPhotoFileInput.type = "file";
    artworkInfoAuthorPhotoFileInput.accept = "image/jpeg,image/png,image/webp,image/avif";
    artworkInfoAuthorPhotoFileInput.style.display = "none";

    var artworkInfoUploadPhotoButton = document.createElement("button");
    artworkInfoUploadPhotoButton.type = "button";
    artworkInfoUploadPhotoButton.className = "gallery-editor-action-button is-primary";
    artworkInfoUploadPhotoButton.innerText = "UPLOAD PHOTO";

    var artworkInfoFindAuthorButton = document.createElement("button");
    artworkInfoFindAuthorButton.type = "button";
    artworkInfoFindAuthorButton.className = "gallery-editor-action-button is-primary";
    artworkInfoFindAuthorButton.innerText = "FIND AUTHOR";

    var artworkInfoAuthorNameInput = createGalleryTextInputCompat("Author name");
    var artworkInfoTitleInput = createGalleryTextInputCompat("Artwork title");
    var artworkInfoDescriptionInput = document.createElement("textarea");
    artworkInfoDescriptionInput.className = "gallery-artwork-info-textarea";
    artworkInfoDescriptionInput.placeholder = "Description";

    var artworkInfoEditorGrid = document.createElement("div");
    artworkInfoEditorGrid.className = "gallery-artwork-info-editor-grid";

    var artworkInfoAuthorCard = document.createElement("div");
    artworkInfoAuthorCard.className = "gallery-artwork-info-editor-card";

    var artworkInfoPhotoPreview = document.createElement("div");
    artworkInfoPhotoPreview.className = "gallery-artwork-info-editor-photo-preview";

    var artworkInfoPhotoPreviewImage = document.createElement("img");
    artworkInfoPhotoPreviewImage.alt = "Author photo preview";

    var artworkInfoPhotoPreviewPlaceholder = document.createElement("div");
    artworkInfoPhotoPreviewPlaceholder.className = "gallery-artwork-info-editor-photo-placeholder";
    artworkInfoPhotoPreviewPlaceholder.innerText = "Author photo";

    artworkInfoPhotoPreview.appendChild(artworkInfoPhotoPreviewImage);
    artworkInfoPhotoPreview.appendChild(artworkInfoPhotoPreviewPlaceholder);

    var artworkInfoAuthorNameGroup = document.createElement("div");
    artworkInfoAuthorNameGroup.className = "gallery-artwork-info-field-group";
    var artworkInfoAuthorNameLabel = document.createElement("label");
    artworkInfoAuthorNameLabel.className = "gallery-editor-field-label";
    artworkInfoAuthorNameLabel.innerText = "AUTHOR NAME";
    artworkInfoAuthorNameGroup.appendChild(artworkInfoAuthorNameLabel);
    artworkInfoAuthorNameGroup.appendChild(artworkInfoAuthorNameInput);
    artworkInfoAuthorCard.appendChild(artworkInfoAuthorNameGroup);

    artworkInfoAuthorCard.appendChild(artworkInfoPhotoPreview);

    var artworkInfoAuthorPhotoGroup = document.createElement("div");
    artworkInfoAuthorPhotoGroup.className = "gallery-artwork-info-field-group";
    var artworkInfoAuthorPhotoLabel = document.createElement("label");
    artworkInfoAuthorPhotoLabel.className = "gallery-editor-field-label";
    artworkInfoAuthorPhotoLabel.innerText = "AUTHOR PHOTO";
    artworkInfoAuthorPhotoGroup.appendChild(artworkInfoAuthorPhotoLabel);
    artworkInfoAuthorPhotoGroup.appendChild(artworkInfoAuthorPhotoInput);
    artworkInfoAuthorCard.appendChild(artworkInfoAuthorPhotoGroup);

    var artworkInfoAuthorPhotoActions = document.createElement("div");
    artworkInfoAuthorPhotoActions.className = "gallery-artwork-image-actions";
    artworkInfoAuthorPhotoActions.style.gridTemplateColumns = "1fr";
    artworkInfoAuthorPhotoActions.appendChild(artworkInfoUploadPhotoButton);
    artworkInfoAuthorCard.appendChild(artworkInfoAuthorPhotoActions);

    var artworkInfoDetailsCard = document.createElement("div");
    artworkInfoDetailsCard.className = "gallery-artwork-info-editor-card";

    var artworkInfoAuthorTools = document.createElement("div");
    artworkInfoAuthorTools.className = "gallery-artwork-info-author-tools";

    var artworkInfoFindAuthorLabel = document.createElement("label");
    artworkInfoFindAuthorLabel.className = "gallery-editor-field-label";
    artworkInfoFindAuthorLabel.innerText = "FIND AUTHOR";
    artworkInfoAuthorTools.appendChild(artworkInfoFindAuthorLabel);

    var artworkInfoFindAuthorNote = document.createElement("p");
    artworkInfoFindAuthorNote.className = "gallery-artwork-info-author-tools-note";
    artworkInfoFindAuthorNote.innerText = "Looks for an existing author by name and reuses their photo.";
    artworkInfoAuthorTools.appendChild(artworkInfoFindAuthorNote);

    artworkInfoAuthorTools.appendChild(artworkInfoFindAuthorButton);

    var artworkInfoAuthorFound = document.createElement("div");
    artworkInfoAuthorFound.className = "gallery-artwork-info-author-found";
    artworkInfoAuthorFound.innerText = "No author selected.";
    artworkInfoAuthorTools.appendChild(artworkInfoAuthorFound);

    var artworkInfoArtworkFields = document.createElement("div");
    artworkInfoArtworkFields.className = "gallery-artwork-info-artwork-fields";

    var artworkInfoTitleGroup = document.createElement("div");
    artworkInfoTitleGroup.className = "gallery-artwork-info-field-group";
    var artworkInfoTitleLabel = document.createElement("label");
    artworkInfoTitleLabel.className = "gallery-editor-field-label";
    artworkInfoTitleLabel.innerText = "ARTWORK TITLE";
    artworkInfoTitleGroup.appendChild(artworkInfoTitleLabel);
    artworkInfoTitleGroup.appendChild(artworkInfoTitleInput);
    artworkInfoArtworkFields.appendChild(artworkInfoTitleGroup);

    var artworkInfoDescriptionGroup = document.createElement("div");
    artworkInfoDescriptionGroup.className = "gallery-artwork-info-field-group";
    var artworkInfoDescriptionLabel = document.createElement("label");
    artworkInfoDescriptionLabel.className = "gallery-editor-field-label";
    artworkInfoDescriptionLabel.innerText = "DESCRIPTION";
    artworkInfoDescriptionGroup.appendChild(artworkInfoDescriptionLabel);
    artworkInfoDescriptionGroup.appendChild(artworkInfoDescriptionInput);
    artworkInfoArtworkFields.appendChild(artworkInfoDescriptionGroup);

    artworkInfoDetailsCard.appendChild(artworkInfoAuthorTools);
    artworkInfoDetailsCard.appendChild(artworkInfoArtworkFields);

    artworkInfoEditorGrid.appendChild(artworkInfoAuthorCard);
    artworkInfoEditorGrid.appendChild(artworkInfoDetailsCard);

    var artworkInfoActions = document.createElement("div");
    artworkInfoActions.className = "gallery-artwork-image-actions";

    var artworkInfoApplyButton = document.createElement("button");
    artworkInfoApplyButton.type = "button";
    artworkInfoApplyButton.className = "gallery-editor-action-button is-primary";
    artworkInfoApplyButton.innerText = "APPLY INFO";

    var artworkInfoClearButton = document.createElement("button");
    artworkInfoClearButton.type = "button";
    artworkInfoClearButton.className = "gallery-editor-action-button";
    artworkInfoClearButton.innerText = "CLEAR";

    var artworkInfoNote = document.createElement("p");
    artworkInfoNote.className = "gallery-artwork-image-note";
    artworkInfoNote.innerText = "Shown near the artwork in Viewer Mode and Edit Mode.";

    artworkInfoActions.appendChild(artworkInfoApplyButton);
    artworkInfoActions.appendChild(artworkInfoClearButton);
    artworkInfoSectionData.section.appendChild(artworkInfoAuthorPhotoFileInput);
    artworkInfoSectionData.section.appendChild(artworkInfoEditorGrid);
    artworkInfoSectionData.section.appendChild(artworkInfoActions);
    artworkInfoSectionData.section.appendChild(artworkInfoNote);
    editorScroll.appendChild(artworkInfoSectionData.section);

    function updateArtworkInfoEditorPhotoPreview(url) {
        var hasPhoto = !!(url && String(url).trim());

        if (hasPhoto) {
            artworkInfoPhotoPreviewImage.src = String(url).trim();
            artworkInfoPhotoPreviewImage.classList.add("is-visible");
            artworkInfoPhotoPreviewPlaceholder.style.display = "none";
        } else {
            artworkInfoPhotoPreviewImage.removeAttribute("src");
            artworkInfoPhotoPreviewImage.classList.remove("is-visible");
            artworkInfoPhotoPreviewPlaceholder.style.display = "flex";
        }
    }

    function getArtworkInfoUiTarget() {
        return selectedArtworks.length === 1 ? selectedArtworks[0] : null;
    }

    function updateArtworkInfoUi() {
        var artwork = getArtworkInfoUiTarget();
        var isVisible = editMode && !!artwork;

        artworkInfoSectionData.section.classList.toggle("is-hidden", !isVisible);

        artworkInfoAuthorPhotoInput.disabled = !isVisible;
        artworkInfoUploadPhotoButton.disabled = !isVisible;
        artworkInfoFindAuthorButton.disabled = !isVisible;
        artworkInfoAuthorNameInput.disabled = !isVisible;
        artworkInfoTitleInput.disabled = !isVisible;
        artworkInfoDescriptionInput.disabled = !isVisible;
        artworkInfoApplyButton.disabled = !isVisible;
        artworkInfoClearButton.disabled = !isVisible;

        if (!isVisible) {
            updateArtworkInfoEditorPhotoPreview("");
            return;
        }

        var info = getArtworkInfoState(artwork);

        if (document.activeElement !== artworkInfoAuthorPhotoInput) {
            artworkInfoAuthorPhotoInput.value = getOriginalAuthorPhotoUrlFromInfo(info);
        }

        if (document.activeElement !== artworkInfoAuthorNameInput) {
            artworkInfoAuthorNameInput.value = info.authorName;
        }

        if (document.activeElement !== artworkInfoTitleInput) {
            artworkInfoTitleInput.value = info.title;
        }

        if (document.activeElement !== artworkInfoDescriptionInput) {
            artworkInfoDescriptionInput.value = info.description;
        }

        updateArtworkInfoEditorPhotoPreview(getBestAuthorPhotoUrlFromInfo(info));
        updateAuthorFoundUi(getAuthorById(info.authorId) || getAuthorByName(info.authorName));
    }

    artworkInfoAuthorPhotoInput.addEventListener("input", function () {
        updateArtworkInfoEditorPhotoPreview(artworkInfoAuthorPhotoInput.value);
    });

    function normalizeAuthorName(name) {
        return String(name || "")
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
    }

    function getAuthorIdFromName(name) {
        var slug = normalizeAuthorName(name);

        return slug ? "author-" + slug : "";
    }

    function normalizeAuthorRecord(author) {
        author = author || {};

        return {
            id: String(author.id || getAuthorIdFromName(author.name || author.authorName || "")).trim(),
            name: String(author.name || author.authorName || "").trim(),
            photoUrl: String(author.photoUrl || author.authorPhotoUrl || "").trim(),
            photoUrlOriginal: String(author.photoUrlOriginal || author.authorPhotoUrlOriginal || author.photoUrl || author.authorPhotoUrl || "").trim(),
            photoUrlWeb: String(author.photoUrlWeb || author.authorPhotoUrlWeb || "").trim(),
            photoUrlMobile: String(author.photoUrlMobile || author.authorPhotoUrlMobile || "").trim(),
            photoUrlPreview: String(author.photoUrlPreview || author.authorPhotoUrlPreview || "").trim(),
            photoPath: String(author.photoPath || author.authorPhotoPath || "").trim(),
            photoPathWeb: String(author.photoPathWeb || author.authorPhotoPathWeb || "").trim(),
            photoPathMobile: String(author.photoPathMobile || author.authorPhotoPathMobile || "").trim(),
            photoPathPreview: String(author.photoPathPreview || author.authorPhotoPathPreview || "").trim(),
            photoBucket: String(author.photoBucket || author.authorPhotoBucket || galleryArtworkStorageBucket || "").trim(),
            photoOriginalName: String(author.photoOriginalName || author.authorPhotoOriginalName || "").trim(),
            photoMimeType: String(author.photoMimeType || author.authorPhotoMimeType || "").trim(),
            photoMimeTypeWeb: String(author.photoMimeTypeWeb || author.authorPhotoMimeTypeWeb || "").trim(),
            photoMimeTypeMobile: String(author.photoMimeTypeMobile || author.authorPhotoMimeTypeMobile || "").trim(),
            photoMimeTypePreview: String(author.photoMimeTypePreview || author.authorPhotoMimeTypePreview || "").trim(),
            photoSize: Number(author.photoSize || author.authorPhotoSize || 0) || 0,
            photoSizeWeb: Number(author.photoSizeWeb || author.authorPhotoSizeWeb || 0) || 0,
            photoSizeMobile: Number(author.photoSizeMobile || author.authorPhotoSizeMobile || 0) || 0,
            photoSizePreview: Number(author.photoSizePreview || author.authorPhotoSizePreview || 0) || 0,
            photoWidthWeb: Number(author.photoWidthWeb || author.authorPhotoWidthWeb || 0) || 0,
            photoHeightWeb: Number(author.photoHeightWeb || author.authorPhotoHeightWeb || 0) || 0,
            photoWidthMobile: Number(author.photoWidthMobile || author.authorPhotoWidthMobile || 0) || 0,
            photoHeightMobile: Number(author.photoHeightMobile || author.authorPhotoHeightMobile || 0) || 0,
            photoWidthPreview: Number(author.photoWidthPreview || author.authorPhotoWidthPreview || 0) || 0,
            photoHeightPreview: Number(author.photoHeightPreview || author.authorPhotoHeightPreview || 0) || 0,
            photoUploadedAt: String(author.photoUploadedAt || author.authorPhotoUploadedAt || "").trim(),
            photoVariantsGeneratedAt: String(author.photoVariantsGeneratedAt || author.authorPhotoVariantsGeneratedAt || "").trim(),
            photoVariantsRebuiltAt: String(author.photoVariantsRebuiltAt || author.authorPhotoVariantsRebuiltAt || "").trim()
        };
    }

    function getAuthorById(authorId) {
        if (!authorId) {
            return null;
        }

        for (var i = 0; i < artworkAuthors.length; i++) {
            if (artworkAuthors[i] && artworkAuthors[i].id === authorId) {
                return artworkAuthors[i];
            }
        }

        return null;
    }

    function getAuthorByName(name) {
        return getAuthorById(getAuthorIdFromName(name));
    }

    function upsertAuthorRecord(author) {
        author = normalizeAuthorRecord(author);

        if (!author.id) {
            return null;
        }

        var existing = getAuthorById(author.id);

        if (existing) {
            Object.keys(author).forEach(function (key) {
                if (author[key] !== "" && author[key] !== 0) {
                    existing[key] = author[key];
                }
            });

            return existing;
        }

        artworkAuthors.push(author);

        return author;
    }

    function getArtworkCountForAuthor(authorId, exceptArtwork) {
        if (!authorId) {
            return 0;
        }

        var active = typeof getActiveArtworks === "function"
            ? getActiveArtworks()
            : artworks;

        var count = 0;

        active.forEach(function (artwork) {
            if (!artwork || artwork === exceptArtwork || (artwork.isDisposed && artwork.isDisposed())) {
                return;
            }

            var info = getArtworkInfoState(artwork);

            if (info && info.authorId === authorId) {
                count++;
            }
        });

        return count;
    }

    function syncArtworkInfoWithAuthor(artwork, author) {
        if (!artwork || !author) {
            return null;
        }

        author = normalizeAuthorRecord(author);

        var info = getArtworkInfoState(artwork);
        info.authorId = author.id;
        info.authorName = author.name || info.authorName;
        info.authorPhotoUrl = author.photoUrl || info.authorPhotoUrl;
        info.authorPhotoUrlOriginal = author.photoUrlOriginal || author.photoUrl || info.authorPhotoUrlOriginal;
        info.authorPhotoUrlWeb = author.photoUrlWeb || info.authorPhotoUrlWeb;
        info.authorPhotoUrlMobile = author.photoUrlMobile || info.authorPhotoUrlMobile;
        info.authorPhotoUrlPreview = author.photoUrlPreview || info.authorPhotoUrlPreview;
        info.authorPhotoPath = author.photoPath || info.authorPhotoPath;
        info.authorPhotoPathWeb = author.photoPathWeb || info.authorPhotoPathWeb;
        info.authorPhotoPathMobile = author.photoPathMobile || info.authorPhotoPathMobile;
        info.authorPhotoPathPreview = author.photoPathPreview || info.authorPhotoPathPreview;
        info.authorPhotoBucket = author.photoBucket || info.authorPhotoBucket;
        info.authorPhotoOriginalName = author.photoOriginalName || info.authorPhotoOriginalName;
        info.authorPhotoMimeType = author.photoMimeType || info.authorPhotoMimeType;
        info.authorPhotoMimeTypeWeb = author.photoMimeTypeWeb || info.authorPhotoMimeTypeWeb;
        info.authorPhotoMimeTypeMobile = author.photoMimeTypeMobile || info.authorPhotoMimeTypeMobile;
        info.authorPhotoMimeTypePreview = author.photoMimeTypePreview || info.authorPhotoMimeTypePreview;
        info.authorPhotoSize = author.photoSize || info.authorPhotoSize;
        info.authorPhotoSizeWeb = author.photoSizeWeb || info.authorPhotoSizeWeb;
        info.authorPhotoSizeMobile = author.photoSizeMobile || info.authorPhotoSizeMobile;
        info.authorPhotoSizePreview = author.photoSizePreview || info.authorPhotoSizePreview;
        info.authorPhotoWidthWeb = author.photoWidthWeb || info.authorPhotoWidthWeb;
        info.authorPhotoHeightWeb = author.photoHeightWeb || info.authorPhotoHeightWeb;
        info.authorPhotoWidthMobile = author.photoWidthMobile || info.authorPhotoWidthMobile;
        info.authorPhotoHeightMobile = author.photoHeightMobile || info.authorPhotoHeightMobile;
        info.authorPhotoWidthPreview = author.photoWidthPreview || info.authorPhotoWidthPreview;
        info.authorPhotoHeightPreview = author.photoHeightPreview || info.authorPhotoHeightPreview;
        info.authorPhotoUploadedAt = author.photoUploadedAt || info.authorPhotoUploadedAt;
        info.authorPhotoVariantsGeneratedAt = author.photoVariantsGeneratedAt || info.authorPhotoVariantsGeneratedAt;
        info.authorPhotoVariantsRebuiltAt = author.photoVariantsRebuiltAt || info.authorPhotoVariantsRebuiltAt;

        setArtworkInfoState(artwork, info);

        return info;
    }

    function updateAuthorFoundUi(author) {
        if (!artworkInfoAuthorFound) {
            return;
        }

        if (!author) {
            artworkInfoAuthorFound.innerText = "No existing author found.";
            return;
        }

        artworkInfoAuthorFound.innerText = "Found: " + author.name + (author.photoUrl ? " — photo ready" : " — no photo yet");
    }

    function findAndApplyAuthorForCurrentArtwork() {
        var artwork = getArtworkInfoUiTarget();

        if (!artwork) {
            notifyGalleryStatus("Select one artwork first.");
            return null;
        }

        var authorName = artworkInfoAuthorNameInput.value.trim();

        if (!authorName) {
            notifyGalleryStatus("Type author name first.");
            updateAuthorFoundUi(null);
            return null;
        }

        var author = getAuthorByName(authorName);
        var info = getArtworkInfoState(artwork);

        info.authorId = getAuthorIdFromName(authorName);
        info.authorName = authorName;

        if (!author) {
            setArtworkInfoState(artwork, info);
            updateAuthorFoundUi(null);
            notifyGalleryStatus("No existing author found. Upload a photo to create this author.");
            return null;
        }

        syncArtworkInfoWithAuthor(artwork, author);

        artworkInfoAuthorPhotoInput.value = author.photoUrlOriginal || author.photoUrl || "";
        updateArtworkInfoEditorPhotoPreview(getBestAuthorPhotoUrlFromInfo(author));
        updateArtworkInfoPopupContent(artwork);
        updateAuthorFoundUi(author);

        notifyGalleryStatus("Existing author applied. Save state to keep the change.");

        return author;
    }

    async function cleanupUnusedAuthorPhotoIfNeeded(authorId, exceptArtwork) {
        var author = getAuthorById(authorId);

        if (!author) {
            return;
        }

        var usageCount = getArtworkCountForAuthor(authorId, exceptArtwork);

        if (usageCount > 0) {
            return;
        }

        if (author.photoPath || author.photoPathWeb || author.photoPathMobile || author.photoPathPreview) {
            await deleteAuthorPhotoFromSupabase({
                authorPhotoPath: author.photoPath,
                authorPhotoPathWeb: author.photoPathWeb,
                authorPhotoPathMobile: author.photoPathMobile,
                authorPhotoPathPreview: author.photoPathPreview,
                authorPhotoBucket: author.photoBucket
            });
        }

        artworkAuthors = artworkAuthors.filter(function (item) {
            return !(item && item.id === authorId);
        });
    }

    function createAuthorPhotoStoragePath(artwork, file) {
        var safeFileName = createSafeStorageFileName(file && file.name ? file.name : "author-photo.jpg");
        var artworkName = artwork && artwork.name
            ? artwork.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
            : "artwork";

        // STAGE 11C - STORAGE FOLDERS
        // Nowe oryginały zdjęć autorów trafiają do czytelnego folderu Original.
        return galleryArtworkStoragePrefix + "/authors/Original/" + artworkName + "-" + Date.now() + "-" + safeFileName;
    }

    async function deleteAuthorPhotoFromSupabase(info) {
        info = Object.assign({}, info || {});

        var pathsToRemove = getAuthorPhotoPathsForDelete(info);

        if (!pathsToRemove.length) {
            return true;
        }

        var client = window.gallerySupabase;

        if (!client || !client.storage) {
            return true;
        }

        var response = await client
            .storage
            .from(info.authorPhotoBucket || info.photoBucket || galleryArtworkStorageBucket)
            .remove(pathsToRemove);

        if (response.error) {
            console.warn("Author photo delete warning:", response.error);
            return false;
        }

        return true;
    }

    async function uploadAuthorPhotoForArtwork(artwork, file) {
        if (!artwork || !file) {
            notifyGalleryStatus("Select one artwork and choose an author photo.");
            return false;
        }

        if (!galleryArtworkUploadEnabled) {
            notifyGalleryStatus("Upload is disabled in this version.");
            return false;
        }

        var client = window.gallerySupabase;

        if (!client || !client.storage) {
            notifyGalleryStatus("Supabase Storage is not configured.");
            return false;
        }

        if (galleryEditorLoginEnabled && !editorAuthenticated) {
            notifyGalleryStatus("Log in as editor to upload author photo.");
            return false;
        }

        if (!file.type || file.type.indexOf("image/") !== 0) {
            notifyGalleryStatus("Choose an image file.");
            return false;
        }

        var authorNameForUpload = artworkInfoAuthorNameInput
            ? artworkInfoAuthorNameInput.value.trim()
            : "";

        if (!authorNameForUpload) {
            notifyGalleryStatus("Type author name before uploading photo.");
            return false;
        }

        var previousInfo = normalizeArtworkInfo(getArtworkInfoState(artwork));
        var info = normalizeArtworkInfo(previousInfo);
        var storagePath = createAuthorPhotoStoragePath(artwork, file);

        notifyGalleryStatus("Uploading author photo and creating variants...");

        var uploadResponse = await client
            .storage
            .from(galleryArtworkStorageBucket)
            .upload(storagePath, file, {
                cacheControl: "3600",
                upsert: false,
                contentType: file.type
            });

        if (uploadResponse.error) {
            var message = uploadResponse.error.message || "Unknown upload error";
            console.warn("Author photo upload error:", uploadResponse.error);
            notifyGalleryStatus("Author photo upload failed: " + message);
            return false;
        }

        var publicUrlResponse = client
            .storage
            .from(galleryArtworkStorageBucket)
            .getPublicUrl(storagePath);

        info.authorPhotoUrl = publicUrlResponse &&
            publicUrlResponse.data &&
            publicUrlResponse.data.publicUrl
                ? publicUrlResponse.data.publicUrl
                : "";

        var authorVariantState = {};

        try {
            authorVariantState = await createAndUploadAuthorPhotoVariants(
                file,
                storagePath,
                client
            );
        } catch (authorVariantError) {
            console.warn("Author photo variants warning:", authorVariantError);
            notifyGalleryStatus("Author photo uploaded, but web/mobile variants failed. Check console.");
        }

        info = Object.assign(
            info,
            {
                authorPhotoUrl: info.authorPhotoUrl,
                authorPhotoUrlOriginal: info.authorPhotoUrl,
                authorPhotoPath: storagePath,
                authorPhotoBucket: galleryArtworkStorageBucket,
                authorPhotoOriginalName: file.name || "",
                authorPhotoMimeType: file.type || "",
                authorPhotoSize: file.size || 0,
                authorPhotoUploadedAt: new Date().toISOString(),
                authorName: authorNameForUpload,
                authorId: getAuthorIdFromName(authorNameForUpload)
            },
            authorVariantState || {}
        );

        var authorRecord = upsertAuthorRecord({
            id: info.authorId,
            name: info.authorName,
            photoUrl: info.authorPhotoUrl,
            photoUrlOriginal: info.authorPhotoUrlOriginal,
            photoUrlWeb: info.authorPhotoUrlWeb,
            photoUrlMobile: info.authorPhotoUrlMobile,
            photoUrlPreview: info.authorPhotoUrlPreview,
            photoPath: info.authorPhotoPath,
            photoPathWeb: info.authorPhotoPathWeb,
            photoPathMobile: info.authorPhotoPathMobile,
            photoPathPreview: info.authorPhotoPathPreview,
            photoBucket: info.authorPhotoBucket,
            photoOriginalName: info.authorPhotoOriginalName,
            photoMimeType: info.authorPhotoMimeType,
            photoMimeTypeWeb: info.authorPhotoMimeTypeWeb,
            photoMimeTypeMobile: info.authorPhotoMimeTypeMobile,
            photoMimeTypePreview: info.authorPhotoMimeTypePreview,
            photoSize: info.authorPhotoSize,
            photoSizeWeb: info.authorPhotoSizeWeb,
            photoSizeMobile: info.authorPhotoSizeMobile,
            photoSizePreview: info.authorPhotoSizePreview,
            photoWidthWeb: info.authorPhotoWidthWeb,
            photoHeightWeb: info.authorPhotoHeightWeb,
            photoWidthMobile: info.authorPhotoWidthMobile,
            photoHeightMobile: info.authorPhotoHeightMobile,
            photoWidthPreview: info.authorPhotoWidthPreview,
            photoHeightPreview: info.authorPhotoHeightPreview,
            photoUploadedAt: info.authorPhotoUploadedAt,
            photoVariantsGeneratedAt: info.authorPhotoVariantsGeneratedAt
        });

        if (authorRecord) {
            syncArtworkInfoWithAuthor(artwork, authorRecord);
        } else {
            setArtworkInfoState(artwork, info);
        }

        if (artworkInfoAuthorPhotoInput) {
            artworkInfoAuthorPhotoInput.value = info.authorPhotoUrlOriginal || info.authorPhotoUrl;
        }

        updateArtworkInfoEditorPhotoPreview(getBestAuthorPhotoUrlFromInfo(info));
        updateArtworkInfoPopupContent(artwork);
        updateAuthorFoundUi(authorRecord);

        if (
            previousInfo.authorPhotoPath &&
            previousInfo.authorPhotoPath !== storagePath
        ) {
            deleteAuthorPhotoFromSupabase(previousInfo)
                .catch(function (error) {
                    console.warn("Previous author photo delete warning:", error);
                });
        }

        notifyGalleryStatus("Author photo uploaded with web/mobile variants. Save state to keep the change.");
        return true;
    }

    function applyArtworkInfoFromUi() {
        var artwork = getArtworkInfoUiTarget();

        if (!artwork) {
            notifyGalleryStatus("Select one artwork to edit info.");
            return;
        }

        var currentInfo = normalizeArtworkInfo(getArtworkInfoState(artwork));
        var previousPhotoUrl = currentInfo.authorPhotoUrl;

        currentInfo.authorPhotoUrl = artworkInfoAuthorPhotoInput.value.trim();
        currentInfo.authorName = artworkInfoAuthorNameInput.value.trim();
        currentInfo.authorId = getAuthorIdFromName(currentInfo.authorName);
        currentInfo.title = artworkInfoTitleInput.value.trim();
        currentInfo.description = artworkInfoDescriptionInput.value.trim();

        if (currentInfo.authorPhotoUrl !== previousPhotoUrl) {
            currentInfo.authorPhotoUrlOriginal = currentInfo.authorPhotoUrl;
            currentInfo.authorPhotoUrlWeb = "";
            currentInfo.authorPhotoUrlMobile = "";
            currentInfo.authorPhotoUrlPreview = "";
            currentInfo.authorPhotoPath = "";
            currentInfo.authorPhotoPathWeb = "";
            currentInfo.authorPhotoPathMobile = "";
            currentInfo.authorPhotoPathPreview = "";
            currentInfo.authorPhotoBucket = galleryArtworkStorageBucket;
            currentInfo.authorPhotoOriginalName = "";
            currentInfo.authorPhotoMimeType = "";
            currentInfo.authorPhotoMimeTypeWeb = "";
            currentInfo.authorPhotoMimeTypeMobile = "";
            currentInfo.authorPhotoMimeTypePreview = "";
            currentInfo.authorPhotoSize = 0;
            currentInfo.authorPhotoSizeWeb = 0;
            currentInfo.authorPhotoSizeMobile = 0;
            currentInfo.authorPhotoSizePreview = 0;
            currentInfo.authorPhotoUploadedAt = "";
            currentInfo.authorPhotoVariantsGeneratedAt = "";
            currentInfo.authorPhotoVariantsRebuiltAt = "";
        }

        if (currentInfo.authorId) {
            var existingAuthor = getAuthorById(currentInfo.authorId);

            if (existingAuthor && existingAuthor.photoUrl && !currentInfo.authorPhotoUrl) {
                syncArtworkInfoWithAuthor(artwork, existingAuthor);
                currentInfo = getArtworkInfoState(artwork);
            } else {
                upsertAuthorRecord({
                    id: currentInfo.authorId,
                    name: currentInfo.authorName,
                    photoUrl: currentInfo.authorPhotoUrl,
                    photoUrlOriginal: currentInfo.authorPhotoUrlOriginal || currentInfo.authorPhotoUrl,
                    photoUrlWeb: currentInfo.authorPhotoUrlWeb,
                    photoUrlMobile: currentInfo.authorPhotoUrlMobile,
                    photoUrlPreview: currentInfo.authorPhotoUrlPreview,
                    photoPath: currentInfo.authorPhotoPath,
                    photoPathWeb: currentInfo.authorPhotoPathWeb,
                    photoPathMobile: currentInfo.authorPhotoPathMobile,
                    photoPathPreview: currentInfo.authorPhotoPathPreview,
                    photoBucket: currentInfo.authorPhotoBucket,
                    photoOriginalName: currentInfo.authorPhotoOriginalName,
                    photoMimeType: currentInfo.authorPhotoMimeType,
                    photoMimeTypeWeb: currentInfo.authorPhotoMimeTypeWeb,
                    photoMimeTypeMobile: currentInfo.authorPhotoMimeTypeMobile,
                    photoMimeTypePreview: currentInfo.authorPhotoMimeTypePreview,
                    photoSize: currentInfo.authorPhotoSize,
                    photoSizeWeb: currentInfo.authorPhotoSizeWeb,
                    photoSizeMobile: currentInfo.authorPhotoSizeMobile,
                    photoSizePreview: currentInfo.authorPhotoSizePreview,
                    photoUploadedAt: currentInfo.authorPhotoUploadedAt,
                    photoVariantsGeneratedAt: currentInfo.authorPhotoVariantsGeneratedAt,
                    photoVariantsRebuiltAt: currentInfo.authorPhotoVariantsRebuiltAt
                });

                setArtworkInfoState(artwork, currentInfo);
            }
        } else {
            setArtworkInfoState(artwork, currentInfo);
        }

        updateArtworkInfoEditorPhotoPreview(getBestAuthorPhotoUrlFromInfo(currentInfo));
        updateArtworkInfoPopupContent(artwork);
        updateAuthorFoundUi(getAuthorById(currentInfo.authorId));
        notifyGalleryStatus("Artwork info updated. Save state to keep the change.");
    }

    artworkInfoApplyButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();
        applyArtworkInfoFromUi();
    };

    artworkInfoClearButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();

        var artwork = getArtworkInfoUiTarget();

        if (!artwork) {
            return;
        }

        setArtworkInfoState(artwork, null);
        updateArtworkInfoUi();
        updateArtworkInfoPopupContent(artwork);
        notifyGalleryStatus("Artwork info cleared. Save state to keep the change.");
    };

    artworkInfoFindAuthorButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();
        findAndApplyAuthorForCurrentArtwork();
    };

    artworkInfoUploadPhotoButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();

        if (!getArtworkInfoUiTarget()) {
            notifyGalleryStatus("Select one artwork first.");
            return;
        }

        artworkInfoAuthorPhotoFileInput.value = "";
        artworkInfoAuthorPhotoFileInput.click();
    };

    artworkInfoAuthorPhotoFileInput.onchange = function () {
        var artwork = getArtworkInfoUiTarget();
        var file = artworkInfoAuthorPhotoFileInput.files && artworkInfoAuthorPhotoFileInput.files[0]
            ? artworkInfoAuthorPhotoFileInput.files[0]
            : null;

        if (!artwork || !file) {
            return;
        }

        uploadAuthorPhotoForArtwork(artwork, file)
            .catch(function (error) {
                console.warn("Author photo upload failed:", error);
                notifyGalleryStatus("Author photo upload failed.");
            });
    };

    var artworkTransformSectionData = createEditorSection("ARTWORK TRANSFORM");
    artworkTransformSectionData.section.classList.add("gallery-artwork-transform-section", "is-hidden");

    var artworkTransformGrid = document.createElement("div");
    artworkTransformGrid.className = "gallery-artwork-transform-grid";

    function createArtworkTransformSliderRow(labelText, minValue, maxValue, stepValue) {
        var row = document.createElement("div");
        row.className = "gallery-artwork-transform-row";

        var label = document.createElement("p");
        label.className = "gallery-artwork-transform-label";
        label.innerText = labelText;

        var input = document.createElement("input");
        input.type = "range";
        input.className = "gallery-artwork-transform-slider";
        input.min = String(minValue);
        input.max = String(maxValue);
        input.step = String(stepValue);
        input.value = "0";

        var value = document.createElement("span");
        value.className = "gallery-artwork-transform-value";
        value.innerText = "-";

        row.appendChild(label);
        row.appendChild(input);
        row.appendChild(value);

        return {
            row: row,
            label: label,
            input: input,
            value: value
        };
    }

    var artworkTransformScaleRow = createArtworkTransformSliderRow(
        "Scale",
        Math.round(artworkTransformScaleMin * 100),
        Math.round(artworkTransformScaleMax * 100),
        1
    );
    var artworkTransformRotationRow = createArtworkTransformSliderRow("Rotate", -180, 180, artworkTransformRotationStepDegrees);

    artworkTransformGrid.appendChild(artworkTransformScaleRow.row);
    artworkTransformGrid.appendChild(artworkTransformRotationRow.row);

    var artworkTransformResetButton = document.createElement("button");
    artworkTransformResetButton.type = "button";
    artworkTransformResetButton.className = "gallery-editor-action-button gallery-artwork-transform-reset";
    artworkTransformResetButton.innerText = "RESET TRANSFORM";

    var artworkTransformNote = document.createElement("p");
    artworkTransformNote.className = "gallery-artwork-image-note";
    artworkTransformNote.innerText = "Scale changes width and height together, without changing depth. Rotation snaps every 15°.";

    artworkTransformSectionData.section.appendChild(artworkTransformGrid);
    artworkTransformSectionData.section.appendChild(artworkTransformResetButton);
    artworkTransformSectionData.section.appendChild(artworkTransformNote);
    editorScroll.appendChild(artworkTransformSectionData.section);

    function getSingleSelectedArtworkForImageUi() {
        return selectedArtworks.length === 1 ? selectedArtworks[0] : null;
    }

    function updateArtworkImageUi() {
        if (!artworkImageSectionData || !artworkImageSectionData.section) {
            return;
        }

        var artwork = getSingleSelectedArtworkForImageUi();
        var imageState = getArtworkImageState(artwork);

        artworkImageSectionData.section.classList.toggle(
            "is-hidden",
            !editMode || !artwork
        );

        artworkImageUploadButton.disabled = !artwork;
        artworkImageApplyUrlButton.disabled = !artwork;
        artworkImageRemoveButton.disabled = !artwork || !imageState;

        if (!artwork) {
            artworkImageStatus.innerHTML = "Image: <strong>None</strong>";
            artworkImageUrlInput.value = "";
            return;
        }

        if (imageState) {
            var label = imageState.originalName || imageState.imagePath || imageState.imageUrl || "Custom image";
            var variantInfo = imageState.imageUrlMobile && imageState.imageUrlWeb
                ? " <span style=\"opacity:.75\">(variants ready)</span>"
                : " <span style=\"opacity:.75\">(variants missing)</span>";
            artworkImageStatus.innerHTML = "Image: <strong>" + label + "</strong>" + variantInfo;
            artworkImageUrlInput.value = imageState.imageUrlOriginal || imageState.imageUrl || "";
        } else {
            artworkImageStatus.innerHTML = "Image: <strong>None</strong>";
            artworkImageUrlInput.value = "";
        }
    }

    function updateArtworkTransformUi() {
        if (!artworkTransformSectionData || !artworkTransformSectionData.section) {
            return;
        }

        var artwork = getSingleSelectedArtworkForImageUi();

        artworkTransformSectionData.section.classList.toggle(
            "is-hidden",
            !editMode || !artwork
        );

        var disabled = !artwork;
        artworkTransformScaleRow.input.disabled = disabled;
        artworkTransformRotationRow.input.disabled = disabled;
        artworkTransformResetButton.disabled = disabled;

        if (!artwork) {
            artworkTransformScaleRow.value.innerText = "-";
            artworkTransformRotationRow.value.innerText = "-";
            return;
        }

        var transformState = getArtworkTransformState(artwork);
        var scalePercent = Math.round(transformState.scale * 100);

        artworkTransformScaleRow.input.value = String(scalePercent);
        artworkTransformRotationRow.input.value = String(transformState.rotationDegrees);
        artworkTransformScaleRow.value.innerText = scalePercent + "%";
        artworkTransformRotationRow.value.innerText = transformState.rotationDegrees + "°";
    }

    function applyArtworkTransformSliderValues(shouldNotify) {
        var scaleValue = Number(artworkTransformScaleRow.input.value) / 100;
        var rotationValue = Number(artworkTransformRotationRow.input.value);

        setSelectedArtworkTransform(
            scaleValue,
            rotationValue,
            !!shouldNotify
        );
    }

    artworkTransformScaleRow.input.addEventListener("input", function (event) {
        event.preventDefault();
        event.stopPropagation();
        applyArtworkTransformSliderValues(false);
    });

    artworkTransformScaleRow.input.addEventListener("change", function (event) {
        event.preventDefault();
        event.stopPropagation();
        applyArtworkTransformSliderValues(true);
    });

    artworkTransformRotationRow.input.addEventListener("input", function (event) {
        event.preventDefault();
        event.stopPropagation();
        applyArtworkTransformSliderValues(false);
    });

    artworkTransformRotationRow.input.addEventListener("change", function (event) {
        event.preventDefault();
        event.stopPropagation();
        applyArtworkTransformSliderValues(true);
    });

    artworkTransformResetButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();
        resetSelectedArtworkTransform();
    };

    artworkImageUploadButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();

        var artwork = getSingleSelectedArtworkForImageUi();

        if (!artwork) {
            notifyGalleryStatus("Zaznacz jeden obraz, aby wgrac plik.");
            return;
        }

        artworkImageFileInput.value = "";
        artworkImageFileInput.click();
    };

    artworkImageFileInput.onchange = function () {
        var artwork = getSingleSelectedArtworkForImageUi();
        var file = artworkImageFileInput.files && artworkImageFileInput.files[0]
            ? artworkImageFileInput.files[0]
            : null;

        if (!artwork || !file) {
            return;
        }

        uploadArtworkImageToSupabase(artwork, file)
            .catch(function (error) {
                console.warn("Artwork upload hard error:", error);
                notifyGalleryStatus("Blad uploadu obrazu: " + (error && error.message ? error.message : "sprawdz konsole."));
            })
            .finally(function () {
                artworkImageFileInput.value = "";
                updateArtworkImageUi();
                updateArtworkTransformUi();
            });
    };

    artworkImageApplyUrlButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();

        var artwork = getSingleSelectedArtworkForImageUi();
        var imageUrl = artworkImageUrlInput.value.trim();

        if (!artwork) {
            notifyGalleryStatus("Zaznacz jeden obraz, aby ustawic URL.");
            return;
        }

        if (!imageUrl) {
            notifyGalleryStatus("Wklej URL obrazu.");
            return;
        }

        applyArtworkImageState(artwork, {
            imageUrl: imageUrl,
            imageUrlOriginal: imageUrl,
            fitMode: galleryArtworkDefaultFitMode,
            source: "manual-url",
            updatedAt: new Date().toISOString()
        });

        updateArtworkTransformUi();
        notifyGalleryStatus("Ustawiono obraz z URL. Zapisz stan galerii, aby zachowac zmiane.");
    };

    artworkImageRemoveButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();

        var artwork = getSingleSelectedArtworkForImageUi();

        if (!artwork) {
            return;
        }

        if (!getArtworkImageState(artwork)) {
            removeArtworkImageFromMesh(artwork, true);
            updateArtworkTransformUi();
            notifyGalleryStatus("Obraz jest juz pusty.");
            return;
        }

        notifyGalleryStatus("Usuwam obraz...");

        removeArtworkImageWithStorageDelete(artwork)
            .then(function (removedImage) {
                if (!removedImage) {
                    return;
                }

                notifyGalleryStatus("Usunieto obraz i plik ze Storage. Zapisz stan galerii, aby zachowac zmiane.");
            })
            .catch(function (error) {
                console.warn("Artwork remove error:", error);
                notifyGalleryStatus("Blad usuwania obrazu.");
            });
    };

    var alignSectionData = createEditorSection("ALIGN");
    var artworkAlignPanel = document.createElement("div");
    artworkAlignPanel.id = "artworkAlignPanel";
    artworkAlignPanel.className = "gallery-editor-align-grid";

    function createAlignIconButton(mode, title, iconSvg) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "gallery-editor-align-button";
        button.setAttribute("data-align", mode);
        button.title = title;
        button.innerHTML = iconSvg;

        button.onpointerdown = function (event) {
            event.preventDefault();
            event.stopPropagation();

            if (button.disabled) {
                return;
            }

            alignSelectedArtworks(
                button.getAttribute("data-align")
            );
        };

        return button;
    }

    var iconAlignLeft = `
        <svg viewBox="0 0 32 32" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M7 6v20"></path>
            <path d="M12 10h13"></path>
            <path d="M12 16h9"></path>
            <path d="M12 22h15"></path>
        </svg>
    `;

    var iconAlignCenterH = `
        <svg viewBox="0 0 32 32" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M16 6v20"></path>
            <path d="M10 10h12"></path>
            <path d="M8 16h16"></path>
            <path d="M11 22h10"></path>
        </svg>
    `;

    var iconAlignRight = `
        <svg viewBox="0 0 32 32" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M25 6v20"></path>
            <path d="M7 10h13"></path>
            <path d="M11 16h9"></path>
            <path d="M5 22h15"></path>
        </svg>
    `;

    var iconAlignWallH = `
        <svg viewBox="0 0 32 32" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M10 8v16"></path>
            <path d="M22 8v16"></path>
            <path d="M14 11h4"></path>
            <path d="M13 16h6"></path>
            <path d="M14 21h4"></path>
        </svg>
    `;

    var iconAlignTop = `
        <svg viewBox="0 0 32 32" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M7 8h18"></path>
            <path d="M10 13v11"></path>
            <path d="M16 13v7"></path>
            <path d="M22 13v13"></path>
        </svg>
    `;

    var iconAlignCenterV = `
        <svg viewBox="0 0 32 32" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M7 16h18"></path>
            <path d="M10 10v12"></path>
            <path d="M16 8v16"></path>
            <path d="M22 11v10"></path>
        </svg>
    `;

    var iconAlignBottom = `
        <svg viewBox="0 0 32 32" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M7 24h18"></path>
            <path d="M10 8v11"></path>
            <path d="M16 12v7"></path>
            <path d="M22 6v13"></path>
        </svg>
    `;

    var iconAlignWallV = `
        <svg viewBox="0 0 32 32" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M8 10h16"></path>
            <path d="M8 22h16"></path>
            <path d="M11 14v4"></path>
            <path d="M16 13v6"></path>
            <path d="M21 14v4"></path>
        </svg>
    `;

    [
        createAlignIconButton("left", "Align left", iconAlignLeft),
        createAlignIconButton("centerH", "Align horizontal center", iconAlignCenterH),
        createAlignIconButton("right", "Align right", iconAlignRight),
        createAlignIconButton("centerWallV", "Center vertically on wall", iconAlignWallH),
        createAlignIconButton("top", "Align top", iconAlignTop),
        createAlignIconButton("centerV", "Align vertical center", iconAlignCenterV),
        createAlignIconButton("bottom", "Align bottom", iconAlignBottom),
        createAlignIconButton("centerWallH", "Center horizontally on wall", iconAlignWallV)
    ].forEach(function (button) {
        artworkAlignPanel.appendChild(button);
    });

    alignSectionData.section.appendChild(artworkAlignPanel);
    editorScroll.appendChild(alignSectionData.section);

    var wallColorSectionData = createEditorSection("WALL COLOR");
    var wallPalette = document.createElement("div");
    wallPalette.id = "wallColorPalette";

    var selectedWallColorStatus = document.createElement("div");
    selectedWallColorStatus.id = "editorSelectedWallColorStatus";
    selectedWallColorStatus.className = "gallery-editor-color-status";
    selectedWallColorStatus.innerHTML = "Selected Color: <span class=\"gallery-editor-accent-text\">None</span>";

    wallColorSectionData.section.appendChild(wallPalette);
    wallColorSectionData.section.appendChild(selectedWallColorStatus);
    editorScroll.appendChild(wallColorSectionData.section);

    var helpSection = document.createElement("section");
    helpSection.className = "gallery-editor-section";

    var helpHeader = document.createElement("div");
    helpHeader.className = "gallery-editor-help-header";

    var helpTitle = document.createElement("h3");
    helpTitle.className = "gallery-editor-section-title";
    helpTitle.innerText = "HELP & SHORTCUTS";

    var editHelpToggle = document.createElement("button");
    editHelpToggle.type = "button";
    editHelpToggle.className = "gallery-editor-help-toggle";

    function getEditorCaretSvg(isOpen) {
        var path = isOpen ? "M4 8l4-4 4 4" : "M4 5l4 4 4-4";

        return `
            <svg class="gallery-editor-caret" viewBox="0 0 16 16" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="${path}"></path>
            </svg>
        `;
    }

    function setHelpToggleState(isOpen) {
        editHelpToggle.innerHTML =
            "<span>" + (isOpen ? "Collapse" : "Expand") + "</span>" +
            getEditorCaretSvg(isOpen);
    }

    setHelpToggleState(false);

    var editHelpContent = document.createElement("div");
    editHelpContent.className = "gallery-editor-help-content";
    editHelpContent.innerHTML = `
        <div class="gallery-editor-help-group">
            <p class="gallery-editor-help-title">Selection</p>
            <p class="gallery-editor-help-line"><strong>Click</strong> — Select artwork</p>
            <p class="gallery-editor-help-line"><strong>Shift + Click</strong> — Add or remove from selection</p>
            <p class="gallery-editor-help-line"><strong>Drag</strong> — Move artwork along the wall</p>
            <p class="gallery-editor-help-line"><strong>Double-click</strong> — Focus camera on artwork</p>
            <p class="gallery-editor-help-line"><strong>Right-click</strong> — Clear selection</p>
        </div>
        <div class="gallery-editor-help-group">
            <p class="gallery-editor-help-title">Wall</p>
            <p class="gallery-editor-help-line"><strong>Click wall</strong> — Place or move the selected artwork</p>
            <p class="gallery-editor-help-line"><strong>Click color swatch</strong> — Select wall color</p>
        </div>
        <div class="gallery-editor-help-group">
            <p class="gallery-editor-help-title">Navigation</p>
            <p class="gallery-editor-help-line"><strong>W / A / S / D</strong> — Move in edit mode</p>
        </div>
    `;

    var helpExpanded = false;

    editHelpToggle.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();

        helpExpanded = !helpExpanded;

        if (helpExpanded) {
            editHelpContent.classList.add("is-open");
        } else {
            editHelpContent.classList.remove("is-open");
        }

        setHelpToggleState(helpExpanded);
    };

    helpHeader.appendChild(helpTitle);
    helpHeader.appendChild(editHelpToggle);
    helpSection.appendChild(helpHeader);
    helpSection.appendChild(editHelpContent);
    editorScroll.appendChild(helpSection);

    var editorFooter = document.createElement("div");
    editorFooter.className = "gallery-editor-footer";

    var editorFooterActions = document.createElement("div");
    editorFooterActions.className = "gallery-editor-footer-actions";

    var editButton = document.createElement("button");
    editButton.id = "editModeButton";
    editButton.type = "button";
    editButton.className = "gallery-editor-floating-mode-button";

    var lightingQuickButton = document.createElement("button");
    lightingQuickButton.type = "button";
    lightingQuickButton.className = "gallery-editor-panel-lighting-button";

    function getEditModeIconSvg() {
        return `
            <svg class="gallery-editor-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
            </svg>
        `;
    }

    function getViewerModeIconSvg() {
        return `
            <svg class="gallery-editor-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"></path>
                <circle cx="12" cy="12" r="2.5"></circle>
            </svg>
        `;
    }

    function getLightingModeIconSvg() {
        return `
            <svg class="gallery-editor-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M9 18h6"></path>
                <path d="M10 22h4"></path>
                <path d="M12 2a7 7 0 0 0-4 12.7c.6.45 1 1.15 1 1.9V18h6v-1.4c0-.75.4-1.45 1-1.9A7 7 0 0 0 12 2Z"></path>
            </svg>
        `;
    }

    function setModeButtonContent(isEditing) {
        editButton.innerHTML = (isEditing ? getViewerModeIconSvg() : getEditModeIconSvg()) +
            "<span>" + (isEditing ? "VIEWER MODE" : "EDIT MODE") + "</span>";
    }

    setModeButtonContent(false);

    lightingQuickButton.innerHTML = getLightingModeIconSvg() + "<span>LIGHT MODE</span>";

    editorFooterActions.appendChild(editButton);
    editorFooterActions.appendChild(lightingQuickButton);
    editorFooter.appendChild(editorFooterActions);
    editorScroll.appendChild(editorFooter);
    editHelpPanel.appendChild(editorScroll);

    var lightingPanelMode = "edit";
    var lightingControlRefs = {};
    var lightingPresetStorageKey = "BerryboyArtGallery_LightingPresets_V0_9_1";
    var lightingStateStorageKey = "BerryboyArtGallery_LightingState_V0_9_1";
    var localLightStateStorageKey = "BerryboyArtGallery_LocalLightState_V0_9_1";

    var localLightItems = [];
    var selectedLocalLights = [];
    var localLightGroups = [[], [], [], [], [], [], [], []];
    var activeLocalGroupIndex = 0;
    var localLightSoloState = {
        active: false,
        groupIndex: null,
        enabledById: {}
    };
    var localLightCreateCounter = 0;
    var localLightStateRestoring = false;
    var localLightStateRestoreApplied = false;
    var localLightPersistTimer = null;
    var localLightTransformGizmoEnabled = true;
    var localLightRotationGizmoEnabled = true;
    var localLightGizmoManager = null;
    var localLightGizmoAttachedItem = null;
    var localLightGizmoDragObserver = null;
    var localLightGizmoDragEndObserver = null;
    var localLightRotationGizmoDragObserver = null;
    var localLightRotationGizmoDragEndObserver = null;

    var localLightHighlightLayer = new BABYLON.HighlightLayer(
        "LocalLightHighlightLayer",
        scene
    );
    localLightHighlightLayer.outerGlow = true;
    localLightHighlightLayer.innerGlow = false;
    localLightHighlightLayer.blurHorizontalSize = 1.35;
    localLightHighlightLayer.blurVerticalSize = 1.35;

    var localLightGlowColor = new BABYLON.Color3(1, 1, 1);

    // STAGE 12C2 - MODEL / SCULPTURE OBJECT SELECTION GLOW
    // Rzeźby i sloty modeli nie używają już płaskiego rectangular plane jak obrazy.
    // Highlight idzie po sylwetce/krawędziach całego zaznaczonego obiektu.
    var model3dSelectionHighlightLayer = new BABYLON.HighlightLayer(
        "Model3dSelectionHighlightLayer",
        scene
    );
    model3dSelectionHighlightLayer.outerGlow = true;
    model3dSelectionHighlightLayer.innerGlow = false;
    model3dSelectionHighlightLayer.blurHorizontalSize = 1.55;
    model3dSelectionHighlightLayer.blurVerticalSize = 1.55;

    var model3dSelectionGlowColor = new BABYLON.Color3(1, 1, 1);

    var localLightUiRefs = {
        selectedCountValue: null,
        registeredCountValue: null,
        activeGroupValue: null,
        groupTiles: [],
        groupCountValues: [],
        groupSoloButton: null,
        gizmoToggleInput: null,
        rotationGizmoToggleInput: null,
        selectionDependentSections: [],
        typeSections: {},
        controls: {}
    };

    function color3ToHex(color) {
        function toHex(value) {
            var clamped = Math.max(0, Math.min(255, Math.round(value * 255)));
            var hex = clamped.toString(16);

            return hex.length === 1 ? "0" + hex : hex;
        }

        return "#" + toHex(color.r) + toHex(color.g) + toHex(color.b);
    }

    function hexToColor3(hex) {
        var cleaned = (hex || "#ffffff").replace("#", "");

        if (cleaned.length !== 6) {
            return new BABYLON.Color3(1, 1, 1);
        }

        return new BABYLON.Color3(
            parseInt(cleaned.substring(0, 2), 16) / 255,
            parseInt(cleaned.substring(2, 4), 16) / 255,
            parseInt(cleaned.substring(4, 6), 16) / 255
        );
    }

    function createLightingSection(title) {
        var section = document.createElement("section");
        section.className = "gallery-lighting-section";

        var heading = document.createElement("h3");
        heading.className = "gallery-lighting-section-title";
        heading.innerText = title;

        section.appendChild(heading);

        return section;
    }

    function createLightingSlider(parent, key, labelText, min, max, step, value, decimals, onInput) {
        var row = document.createElement("div");
        row.className = "gallery-lighting-row";

        var label = document.createElement("label");
        label.className = "gallery-lighting-label";
        label.innerText = labelText;

        var input = document.createElement("input");
        input.type = "range";
        input.className = "gallery-lighting-range";
        input.min = min;
        input.max = max;
        input.step = step;
        input.value = value;

        var valueLabel = document.createElement("span");
        valueLabel.className = "gallery-lighting-value";
        valueLabel.innerText = Number(value).toFixed(decimals);

        input.oninput = function () {
            var parsedValue = parseFloat(input.value);
            valueLabel.innerText = parsedValue.toFixed(decimals);
            onInput(parsedValue);
            persistCurrentLightingSettings();
        };

        row.appendChild(label);
        row.appendChild(input);
        row.appendChild(valueLabel);
        parent.appendChild(row);

        lightingControlRefs[key] = {
            input: input,
            valueLabel: valueLabel,
            decimals: decimals,
            setValue: function (newValue) {
                input.value = newValue;
                valueLabel.innerText = Number(newValue).toFixed(decimals);
            }
        };

        return input;
    }

    function createLightingCheckbox(parent, key, labelText, checked, onChange) {
        var label = document.createElement("label");
        label.className = "gallery-lighting-checkbox-row";

        var input = document.createElement("input");
        input.type = "checkbox";
        input.checked = checked;

        var text = document.createElement("span");
        text.innerText = labelText;

        input.onchange = function () {
            onChange(input.checked);
            persistCurrentLightingSettings();
        };

        label.appendChild(input);
        label.appendChild(text);
        parent.appendChild(label);

        lightingControlRefs[key] = {
            input: input,
            setValue: function (newValue) {
                input.checked = !!newValue;
            }
        };

        return input;
    }

    function createLightingColor(parent, key, labelText, color, onInput) {
        var row = document.createElement("div");
        row.className = "gallery-lighting-color-row";

        var label = document.createElement("label");
        label.className = "gallery-lighting-label";
        label.innerText = labelText;

        var input = document.createElement("input");
        input.type = "color";
        input.className = "gallery-lighting-color";
        input.value = color3ToHex(color);

        input.oninput = function () {
            onInput(hexToColor3(input.value));
            persistCurrentLightingSettings();
        };

        row.appendChild(label);
        row.appendChild(input);
        parent.appendChild(row);

        lightingControlRefs[key] = {
            input: input,
            setValue: function (newValue) {
                input.value = newValue;
            }
        };

        return input;
    }


    function getLocalControlSelectedItems(typeFilter) {
        return selectedLocalLights.filter(function (item) {
            if (!item || !item.light) {
                return false;
            }

            if (typeFilter && item.type !== typeFilter) {
                return false;
            }

            return item.type === "spot" || item.type === "point";
        });
    }

    function getMixedNumberState(items, getter, fallbackValue, tolerance) {
        tolerance = tolerance === undefined ? 0.0001 : tolerance;

        if (!items.length) {
            return {
                hasValue: false,
                mixed: false,
                value: fallbackValue
            };
        }

        var firstValue = Number(getter(items[0]));

        if (!isFinite(firstValue)) {
            firstValue = fallbackValue;
        }

        for (var i = 1; i < items.length; i++) {
            var nextValue = Number(getter(items[i]));

            if (!isFinite(nextValue)) {
                nextValue = fallbackValue;
            }

            if (Math.abs(nextValue - firstValue) > tolerance) {
                return {
                    hasValue: true,
                    mixed: true,
                    value: firstValue
                };
            }
        }

        return {
            hasValue: true,
            mixed: false,
            value: firstValue
        };
    }

    function getMixedBoolState(items, getter, fallbackValue) {
        if (!items.length) {
            return {
                hasValue: false,
                mixed: false,
                value: !!fallbackValue
            };
        }

        var firstValue = !!getter(items[0]);

        for (var i = 1; i < items.length; i++) {
            if (!!getter(items[i]) !== firstValue) {
                return {
                    hasValue: true,
                    mixed: true,
                    value: firstValue
                };
            }
        }

        return {
            hasValue: true,
            mixed: false,
            value: firstValue
        };
    }

    function getMixedColorState(items, getter, fallbackHex) {
        if (!items.length) {
            return {
                hasValue: false,
                mixed: false,
                value: fallbackHex || "#ffffff"
            };
        }

        var firstValue = color3ToHex(getter(items[0]) || new BABYLON.Color3(1, 1, 1));

        for (var i = 1; i < items.length; i++) {
            var nextValue = color3ToHex(getter(items[i]) || new BABYLON.Color3(1, 1, 1));

            if (nextValue.toLowerCase() !== firstValue.toLowerCase()) {
                return {
                    hasValue: true,
                    mixed: true,
                    value: firstValue
                };
            }
        }

        return {
            hasValue: true,
            mixed: false,
            value: firstValue
        };
    }

    function setLocalControlValueDisplay(control, value, isMixed) {
        if (!control) {
            return;
        }

        if (control.input) {
            control.input.disabled = !control.hasActiveSelection;
        }

        if (isMixed) {
            control.valueLabel.classList.add("is-mixed");
            control.valueLabel.innerText = "Mixed";
            return;
        }

        control.valueLabel.classList.remove("is-mixed");
        control.valueLabel.innerText =
            Number(value).toFixed(control.decimals || 0) + (control.suffix || "");
    }

    function serializeVector3(value) {
        if (!value) {
            return {
                x: 0,
                y: 0,
                z: 0
            };
        }

        return {
            x: Number(value.x) || 0,
            y: Number(value.y) || 0,
            z: Number(value.z) || 0
        };
    }

    function deserializeVector3(value, fallback) {
        fallback = fallback || new BABYLON.Vector3(0, 0, 0);

        if (!value || typeof value !== "object") {
            return fallback.clone();
        }

        return new BABYLON.Vector3(
            Number(value.x) || 0,
            Number(value.y) || 0,
            Number(value.z) || 0
        );
    }

    function cloneLocalLightGroupsForState() {
        sanitizeLocalLightGroups();

        return localLightGroups.map(function (group) {
            return group.slice();
        });
    }

    function getLocalLightStateColor(item) {
        if (item && item.light && item.light.diffuse) {
            return color3ToHex(item.light.diffuse);
        }

        return "#ffffff";
    }

    function readLocalLightItemState(item) {
        if (!item || !item.light || !item.markerMesh) {
            return null;
        }

        var state = {
            id: item.id,
            name: item.name,
            type: item.type,
            ownerMeshName: item.ownerMesh ? item.ownerMesh.name : null,
            hasOwner: !!item.ownerMesh,
            manualTransformOverride: !!item.manualTransformOverride,
            enabled: getLocalLightUserEnabled(item),
            color: getLocalLightStateColor(item),
            intensity: getLocalLightUserIntensity(item),
            range: Number(item.light.range) || 0,
            targetOptions: normalizeLocalTargetOptions(item.targetOptions),
            position: serializeVector3(item.markerMesh.position),
            rotation: serializeVector3(item.markerMesh.rotation)
        };

        if (item.type === "spot") {
            state.direction = serializeVector3(item.light.direction);
            state.spotAngle = BABYLON.Tools.ToDegrees(item.light.angle || BABYLON.Tools.ToRadians(61));
            state.spotBlend = getSpotBlendFromExponent(item.light.exponent);
        }

        return state;
    }

    function readLocalLightStateFromScene() {
        return {
            version: 9,
            activeGroupIndex: activeLocalGroupIndex,
            createCounter: localLightCreateCounter,
            groups: cloneLocalLightGroupsForState(),
            lights: localLightItems
                .map(function (item) {
                    return readLocalLightItemState(item);
                })
                .filter(function (state) {
                    return !!state;
                })
        };
    }

    function persistCurrentLocalLightState() {
        if (localLightStateRestoring) {
            return;
        }

        try {
            localStorage.setItem(
                localLightStateStorageKey,
                JSON.stringify(readLocalLightStateFromScene())
            );
        } catch (error) {
            console.warn("Local Lights save warning:", error);
        }
    }

    function schedulePersistLocalLightState(immediate) {
        if (localLightStateRestoring) {
            return;
        }

        if (localLightPersistTimer) {
            clearTimeout(localLightPersistTimer);
            localLightPersistTimer = null;
        }

        if (immediate) {
            persistCurrentLocalLightState();
            return;
        }

        localLightPersistTimer = setTimeout(function () {
            localLightPersistTimer = null;
            persistCurrentLocalLightState();
        }, 180);
    }

    function readSavedLocalLightState() {
        try {
            var rawData = localStorage.getItem(localLightStateStorageKey);

            if (!rawData) {
                return null;
            }

            var parsedData = JSON.parse(rawData);

            if (!parsedData || typeof parsedData !== "object") {
                return null;
            }

            if (!Array.isArray(parsedData.lights)) {
                return null;
            }

            return parsedData;
        } catch (error) {
            console.warn("Local Lights read warning:", error);
            return null;
        }
    }

    function updateLocalLightCreateCounterFromId(lightId) {
        var match = String(lightId || "").match(/^Local(?:Spot|Point)Light_(\d+)$/);

        if (!match) {
            return;
        }

        localLightCreateCounter = Math.max(
            localLightCreateCounter,
            Number(match[1]) || 0
        );
    }

    function getSavedLocalLightStateById(localLightState, lightId) {
        if (!localLightState || !Array.isArray(localLightState.lights)) {
            return null;
        }

        return localLightState.lights.find(function (state) {
            return state && state.id === lightId;
        }) || null;
    }

    function applySavedLocalLightStateToItem(item, savedState) {
        if (!item || !item.light || !item.markerMesh || !savedState) {
            return;
        }

        item.name = savedState.name || item.name;
        item.manualTransformOverride = !!savedState.manualTransformOverride;
        item.targetOptions = normalizeLocalTargetOptions(savedState.targetOptions);

        if (item.light.setEnabled) {
            item.userEnabled = savedState.enabled !== false;
        }

        var color = hexToColor3(savedState.color || getLocalLightStateColor(item));
        item.light.diffuse = color;
        item.light.specular = color.scale(item.type === "point" ? 0.12 : 0.10);
        updateLocalLightMarkerColor(item, color);

        if (savedState.intensity !== undefined) {
            item.userIntensity = Math.max(0, Number(savedState.intensity));
            item.light.intensity = item.userIntensity;
        }

        applyLocalLightRuntimeEnabled(item);

        if (savedState.range !== undefined) {
            item.light.range = Math.max(0.1, Number(savedState.range));
        }

        if (savedState.position) {
            var position = deserializeVector3(savedState.position, item.markerMesh.position);
            item.markerMesh.position.copyFrom(position);
            item.light.position.copyFrom(position);
        }

        if (savedState.rotation) {
            item.markerMesh.rotation.copyFrom(
                deserializeVector3(savedState.rotation, item.markerMesh.rotation)
            );
        }

        if (item.type === "spot") {
            if (savedState.spotAngle !== undefined) {
                item.light.angle = BABYLON.Tools.ToRadians(
                    Math.max(1, Math.min(120, Number(savedState.spotAngle)))
                );
            }

            if (savedState.spotBlend !== undefined) {
                item.light.exponent = getExponentFromSpotBlend(
                    Math.max(0, Math.min(1, Number(savedState.spotBlend)))
                );
            }

            if (savedState.direction) {
                item.light.direction.copyFrom(
                    deserializeVector3(savedState.direction, item.light.direction)
                );

                if (item.light.direction.length() === 0) {
                    item.light.direction.copyFrom(getSpotDirectionFromMarker(item));
                } else {
                    item.light.direction.normalize();
                }
            } else {
                item.light.direction.copyFrom(getSpotDirectionFromMarker(item));
            }

            if (isFinite(item.light.range) && item.light.range > 0) {
                item.light.shadowMaxZ = item.light.range + 2;
                item.helperLength = item.light.range;
                item.helperMaxRadius = item.light.range;
            }

            item.helperSoftness = getSpotBlendFromExponent(item.light.exponent);
        }

        if (item.type === "point") {
            if (isFinite(item.light.range) && item.light.range > 0) {
                item.helperMaxRadius = item.light.range;
            }

            disableLocalPointLightShadow(item);
        }

        applyCommonLocalLightTargets(item);
        updateLocalLightHelper(item);
        updateLocalLightVisualState(item);
        requestLocalSpotShadowRefresh(item, true);
    }

    function createRestoredManualSpotLight(savedState) {
        var position = deserializeVector3(
            savedState.position,
            getLocalLightSpawnPosition()
        );

        var rotation = deserializeVector3(
            savedState.rotation,
            new BABYLON.Vector3(0, 0, 0)
        );

        var direction = savedState.direction
            ? deserializeVector3(savedState.direction, new BABYLON.Vector3(0, -1, 0))
            : new BABYLON.Vector3(0, -1, 0);

        if (direction.length() === 0) {
            direction = new BABYLON.Vector3(0, -1, 0);
        }

        direction.normalize();

        var markerMesh = BABYLON.MeshBuilder.CreateBox(
            savedState.id + "_Marker",
            {
                width: 0.42,
                height: 0.16,
                depth: 0.22
            },
            scene
        );

        markerMesh.position.copyFrom(position);
        markerMesh.rotation.copyFrom(rotation);
        markerMesh.material = makeLocalLightMaterial(
            savedState.id + "_MarkerMat",
            hexToColor3(savedState.color || "#fff1c8")
        );

        var unifiedSpot = createUnifiedSpotLight(
            savedState.id,
            position,
            direction,
            {
                intensity: savedState.intensity,
                range: savedState.range,
                angleDegrees: savedState.spotAngle,
                blend: savedState.spotBlend,
                diffuse: hexToColor3(savedState.color || "#fff1c8"),
                specular: hexToColor3(savedState.color || "#fff1c8").scale(0.10)
            }
        );

        return registerLocalLight({
            id: savedState.id,
            name: savedState.name || savedState.id,
            type: "spot",
            light: unifiedSpot.light,
            markerMesh: markerMesh,
            helperLength: unifiedSpot.range,
            helperMaxRadius: unifiedSpot.range,
            helperSoftness: unifiedSpot.blend,
            targetOptions: savedState.targetOptions
        });
    }

    function createRestoredManualPointLight(savedState) {
        var position = deserializeVector3(
            savedState.position,
            getLocalLightSpawnPosition()
        );

        var markerMesh = BABYLON.MeshBuilder.CreateSphere(
            savedState.id + "_Marker",
            {
                diameter: 0.28,
                segments: 16
            },
            scene
        );

        markerMesh.position.copyFrom(position);
        markerMesh.rotation.copyFrom(
            deserializeVector3(savedState.rotation, markerMesh.rotation)
        );
        markerMesh.material = makeLocalLightMaterial(
            savedState.id + "_MarkerMat",
            hexToColor3(savedState.color || "#c7e6ff")
        );

        var pointLight = new BABYLON.PointLight(
            savedState.id,
            position.clone(),
            scene
        );

        pointLight.intensity = savedState.intensity !== undefined
            ? Number(savedState.intensity)
            : 2.0;
        pointLight.range = savedState.range !== undefined
            ? Math.max(0.1, Number(savedState.range))
            : 8;
        pointLight.diffuse = hexToColor3(savedState.color || "#c7e6ff");
        pointLight.specular = pointLight.diffuse.scale(0.12);

        return registerLocalLight({
            id: savedState.id,
            name: savedState.name || savedState.id,
            type: "point",
            light: pointLight,
            markerMesh: markerMesh,
            helperMaxRadius: pointLight.range,
            targetOptions: savedState.targetOptions
        });
    }

    function createMissingLocalLightFromState(savedState) {
        if (!savedState || savedState.hasOwner) {
            return null;
        }

        if (savedState.type === "spot") {
            return createRestoredManualSpotLight(savedState);
        }

        if (savedState.type === "point") {
            return createRestoredManualPointLight(savedState);
        }

        return null;
    }

    function restoreLocalLightGroupsFromState(localLightState) {
        if (!localLightState || !Array.isArray(localLightState.groups)) {
            return;
        }

        localLightGroups = [[], [], [], [], [], [], [], []];

        localLightState.groups.slice(0, 8).forEach(function (group, index) {
            if (!Array.isArray(group)) {
                return;
            }

            localLightGroups[index] = group.filter(function (lightId, lightIndex, array) {
                return typeof lightId === "string" && array.indexOf(lightId) === lightIndex;
            });
        });

        activeLocalGroupIndex = Math.max(
            0,
            Math.min(7, Number(localLightState.activeGroupIndex) || 0)
        );

        sanitizeLocalLightGroups();
    }

    function restoreLocalLightState(localLightState) {
        if (!localLightState || !Array.isArray(localLightState.lights)) {
            return;
        }

        localLightStateRestoring = true;

        try {
            var savedLightIds = localLightState.lights
                .filter(function (savedState) {
                    return !!savedState && !!savedState.id;
                })
                .map(function (savedState) {
                    return savedState.id;
                });

            localLightCreateCounter = Math.max(
                localLightCreateCounter,
                Number(localLightState.createCounter) || 0
            );

            localLightState.lights.forEach(function (savedState) {
                if (!savedState || !savedState.id) {
                    return;
                }

                updateLocalLightCreateCounterFromId(savedState.id);

                var item = getLocalLightItemById(savedState.id);

                if (!item) {
                    item = createMissingLocalLightFromState(savedState);
                }

                if (item) {
                    applySavedLocalLightStateToItem(item, savedState);
                }
            });

            // Jesli uzytkownik usunal domyslna lampe przy obrazie/rzezbie,
            // zapisany stan nie zawiera jej ID. Po starcie scena tworzy ja ponownie,
            // wiec tutaj usuwamy wszystko, czego nie ma w zapisanym stanie.
            localLightItems.slice().forEach(function (item) {
                if (item && savedLightIds.indexOf(item.id) === -1) {
                    disposeLocalLightItem(item);
                }
            });

            restoreLocalLightGroupsFromState(localLightState);
            clearLocalLightSelection();
            refreshAllCommonLocalLightTargets();
            refreshAllLocalSpotShadows();
            updateLocalLightsUi();
        } finally {
            localLightStateRestoring = false;
        }
    }

    function restoreSavedLocalLightStateOnce() {
        if (localLightStateRestoreApplied) {
            return;
        }

        localLightStateRestoreApplied = true;

        var savedLocalLightState = readSavedLocalLightState();

        if (!savedLocalLightState) {
            return;
        }

        restoreLocalLightState(savedLocalLightState);
    }

    globalThis.BerryboyArtGalleryLocalLights = {
        exportState: readLocalLightStateFromScene,
        importState: function (state) {
            restoreLocalLightState(state);
            schedulePersistLocalLightState(true);
        },
        save: function () {
            schedulePersistLocalLightState(true);
        },
        load: function () {
            restoreLocalLightState(readSavedLocalLightState());
        },
        clearSavedState: function () {
            localStorage.removeItem(localLightStateStorageKey);
        }
    };

    function updateLocalLightAfterParameterChange(item, forceShadowRefresh) {
        if (!item || !item.light) {
            return;
        }

        if (item.type === "spot") {
            forceStandardSpotFalloff(item.light);

            if (isFinite(item.light.range) && item.light.range > 0) {
                item.light.shadowMaxZ = item.light.range + 2;
                item.helperLength = item.light.range;
                item.helperMaxRadius = item.light.range;
            }

            if (isFinite(item.light.exponent)) {
                item.helperSoftness = getSpotBlendFromExponent(item.light.exponent);
            }
        }

        if (item.type === "point") {
            if (isFinite(item.light.range) && item.light.range > 0) {
                item.helperMaxRadius = item.light.range;
            }
        }

        updateLocalLightHelper(item);
        updateLocalLightVisualState(item);
        requestLocalSpotShadowRefresh(item, !!forceShadowRefresh);
    }

    function updateLocalLightMarkerColor(item, color) {
        if (!item || !item.markerMesh || !item.markerMesh.material || !color) {
            return;
        }

        var material = item.markerMesh.material;

        if (material.diffuseColor) {
            material.diffuseColor = color;
        }

        if (material.emissiveColor) {
            material.emissiveColor = color.scale(0.72);
        }
    }

    function applyLocalLightControlValue(key, value, typeFilter, forceShadowRefresh, skipControlSync) {
        var items = getLocalControlSelectedItems(typeFilter);

        items.forEach(function (item) {
            if (!item || !item.light) {
                return;
            }

            var needsGeometryUpdate = false;

            if (key === "enabled") {
                item.userEnabled = !!value;
                applyLocalLightRuntimeEnabled(item);
            } else if (key === "color") {
                var color = hexToColor3(value);
                item.light.diffuse = color;
                item.light.specular = color.scale(item.type === "point" ? 0.12 : 0.10);
                updateLocalLightMarkerColor(item, color);
            } else if (key === "intensity") {
                setLocalLightUserIntensity(item, value);
            } else if (key === "range") {
                item.light.range = Math.max(0.1, Number(value));
                needsGeometryUpdate = true;
            } else if (key === "spotAngle") {
                if (item.type === "spot") {
                    item.light.angle = BABYLON.Tools.ToRadians(
                        Math.max(1, Math.min(120, Number(value)))
                    );
                    needsGeometryUpdate = true;
                }
            } else if (key === "spotBlend") {
                if (item.type === "spot") {
                    item.light.exponent = getExponentFromSpotBlend(
                        Math.max(0, Math.min(1, Number(value)))
                    );
                    needsGeometryUpdate = true;
                }
            } else if (key === "targetFloor") {
                setLocalTargetOption(item, "floor", value);
                applyCommonLocalLightTargets(item);
                needsGeometryUpdate = true;
            } else if (key === "targetWalls") {
                setLocalTargetOption(item, "walls", value);
                applyCommonLocalLightTargets(item);
                needsGeometryUpdate = true;
            } else if (key === "targetCeiling") {
                setLocalTargetOption(item, "ceiling", value);
                applyCommonLocalLightTargets(item);
                needsGeometryUpdate = true;
            } else if (key === "targetArtworks") {
                setLocalTargetOption(item, "artworks", value);
                applyCommonLocalLightTargets(item);
                needsGeometryUpdate = true;
            } else if (key === "targetSculptures") {
                setLocalTargetOption(item, "sculptures", value);
                applyCommonLocalLightTargets(item);
                needsGeometryUpdate = true;
            } else if (key === "targetProps") {
                setLocalTargetOption(item, "props", value);
                applyCommonLocalLightTargets(item);
                needsGeometryUpdate = true;
            }

            if (needsGeometryUpdate) {
                updateLocalLightAfterParameterChange(item, !!forceShadowRefresh);
            } else {
                updateLocalLightVisualState(item);
            }
        });

        if (!skipControlSync) {
            syncLocalLightControlsFromSelection();
        }

        schedulePersistLocalLightState(false);
    }

    function createLocalEditSlider(parent, key, labelText, min, max, step, value, decimals, suffix, typeFilter) {
        var row = document.createElement("div");
        row.className = "gallery-lighting-row";

        var label = document.createElement("label");
        label.className = "gallery-lighting-label";
        label.innerText = labelText;

        var input = document.createElement("input");
        input.type = "range";
        input.className = "gallery-lighting-range";
        input.min = min;
        input.max = max;
        input.step = step;
        input.value = value;

        var valueLabel = document.createElement("span");
        valueLabel.className = "gallery-lighting-value";
        valueLabel.innerText = Number(value).toFixed(decimals) + (suffix || "");

        input.oninput = function () {
            var parsedValue = parseFloat(input.value);

            valueLabel.classList.remove("is-mixed");
            valueLabel.innerText = parsedValue.toFixed(decimals) + (suffix || "");

            applyLocalLightControlValue(key, parsedValue, typeFilter || null, false);
        };

        input.onchange = function () {
            applyLocalLightControlValue(key, parseFloat(input.value), typeFilter || null, true);
        };

        row.appendChild(label);
        row.appendChild(input);
        row.appendChild(valueLabel);
        parent.appendChild(row);

        localLightUiRefs.controls[key] = {
            row: row,
            input: input,
            valueLabel: valueLabel,
            decimals: decimals,
            suffix: suffix || "",
            hasActiveSelection: false,
            setValue: function (newValue, isMixed, hasActiveSelection) {
                this.hasActiveSelection = !!hasActiveSelection;
                input.disabled = !hasActiveSelection;

                if (hasActiveSelection && isFinite(newValue)) {
                    input.value = newValue;
                }

                setLocalControlValueDisplay(this, newValue, !!isMixed);
            }
        };

        return input;
    }

    function createLocalEditCheckbox(parent, key, labelText, checked, typeFilter) {
        var label = document.createElement("label");
        label.className = "gallery-lighting-checkbox-row";

        var input = document.createElement("input");
        input.type = "checkbox";
        input.checked = !!checked;

        var text = document.createElement("span");
        text.innerText = labelText;

        input.onchange = function () {
            input.indeterminate = false;
            applyLocalLightControlValue(key, input.checked, typeFilter || null, true);
        };

        label.appendChild(input);
        label.appendChild(text);
        parent.appendChild(label);

        localLightUiRefs.controls[key] = {
            row: label,
            input: input,
            setValue: function (newValue, isMixed, hasActiveSelection) {
                input.disabled = !hasActiveSelection;
                input.indeterminate = !!isMixed && !!hasActiveSelection;
                input.checked = !!newValue;
            }
        };

        return input;
    }

    function createLocalEditColor(parent, key, labelText, defaultColor, typeFilter) {
        var row = document.createElement("div");
        row.className = "gallery-lighting-color-row";
        row.style.gridTemplateColumns = "1fr 72px 56px";

        var label = document.createElement("label");
        label.className = "gallery-lighting-label";
        label.innerText = labelText;

        var input = document.createElement("input");
        input.type = "color";
        input.className = "gallery-lighting-color";
        input.value = defaultColor || "#ffffff";

        var valueLabel = document.createElement("span");
        valueLabel.className = "gallery-lighting-value";
        valueLabel.innerText = "";

        input.oninput = function () {
            valueLabel.classList.remove("is-mixed");
            valueLabel.innerText = "";
            // Color picker potrafi wysylac dziesiatki eventow na sekunde.
            // Przy kolorze nie ma sensu przebudowywac helperow ani shadow map.
            applyLocalLightControlValue(key, input.value, typeFilter || null, false, true);
        };

        input.onchange = function () {
            applyLocalLightControlValue(key, input.value, typeFilter || null, false, false);
        };

        row.appendChild(label);
        row.appendChild(input);
        row.appendChild(valueLabel);
        parent.appendChild(row);

        localLightUiRefs.controls[key] = {
            row: row,
            input: input,
            valueLabel: valueLabel,
            setValue: function (newValue, isMixed, hasActiveSelection) {
                input.disabled = !hasActiveSelection;

                if (newValue) {
                    input.value = newValue;
                }

                if (isMixed) {
                    valueLabel.classList.add("is-mixed");
                    valueLabel.innerText = "Mixed";
                } else {
                    valueLabel.classList.remove("is-mixed");
                    valueLabel.innerText = "";
                }
            }
        };

        return input;
    }

    function syncLocalLightControlsFromSelection() {
        var allItems = getLocalControlSelectedItems(null);
        var spotItems = getLocalControlSelectedItems("spot");

        if (localLightUiRefs.controls.enabled) {
            var enabledState = getMixedBoolState(
                allItems,
                function (item) {
                    return getLocalLightUserEnabled(item);
                },
                true
            );

            localLightUiRefs.controls.enabled.setValue(
                enabledState.value,
                enabledState.mixed,
                enabledState.hasValue
            );
        }

        if (localLightUiRefs.controls.color) {
            var colorState = getMixedColorState(
                allItems,
                function (item) {
                    return item.light.diffuse;
                },
                "#ffffff"
            );

            localLightUiRefs.controls.color.setValue(
                colorState.value,
                colorState.mixed,
                colorState.hasValue
            );
        }

        if (localLightUiRefs.controls.intensity) {
            var intensityState = getMixedNumberState(
                allItems,
                function (item) {
                    return getLocalLightUserIntensity(item);
                },
                0,
                0.001
            );

            localLightUiRefs.controls.intensity.setValue(
                intensityState.value,
                intensityState.mixed,
                intensityState.hasValue
            );
        }

        if (localLightUiRefs.controls.range) {
            var rangeState = getMixedNumberState(
                allItems,
                function (item) {
                    return item.light.range || 0;
                },
                1,
                0.001
            );

            localLightUiRefs.controls.range.setValue(
                rangeState.value,
                rangeState.mixed,
                rangeState.hasValue
            );
        }

        if (localLightUiRefs.controls.spotAngle) {
            var angleState = getMixedNumberState(
                spotItems,
                function (item) {
                    return BABYLON.Tools.ToDegrees(item.light.angle || BABYLON.Tools.ToRadians(61));
                },
                61,
                0.01
            );

            localLightUiRefs.controls.spotAngle.setValue(
                angleState.value,
                angleState.mixed,
                angleState.hasValue
            );
        }

        if (localLightUiRefs.controls.spotBlend) {
            var blendState = getMixedNumberState(
                spotItems,
                function (item) {
                    return getSpotBlendFromExponent(item.light.exponent);
                },
                unifiedSpotDefaults.blend,
                0.001
            );

            localLightUiRefs.controls.spotBlend.setValue(
                blendState.value,
                blendState.mixed,
                blendState.hasValue
            );
        }

        [
            {
                controlKey: "targetFloor",
                optionKey: "floor"
            },
            {
                controlKey: "targetWalls",
                optionKey: "walls"
            },
            {
                controlKey: "targetCeiling",
                optionKey: "ceiling"
            },
            {
                controlKey: "targetArtworks",
                optionKey: "artworks"
            },
            {
                controlKey: "targetSculptures",
                optionKey: "sculptures"
            },
            {
                controlKey: "targetProps",
                optionKey: "props"
            }
        ].forEach(function (targetControl) {
            var control = localLightUiRefs.controls[targetControl.controlKey];

            if (!control) {
                return;
            }

            var targetState = getMixedBoolState(
                allItems,
                function (item) {
                    return getLocalTargetOption(item, targetControl.optionKey);
                },
                true
            );

            control.setValue(
                targetState.value,
                targetState.mixed,
                targetState.hasValue
            );
        });
    }

    function createLocalToolButton(labelText, className, iconText) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "gallery-local-tool-button" + (className ? " " + className : "");

        if (iconText && String(iconText).trim() !== "") {
            var icon = document.createElement("span");
            icon.className = "gallery-local-tool-icon";
            icon.innerText = iconText;
            button.appendChild(icon);
        }

        var label = document.createElement("span");
        label.innerText = labelText;
        button.appendChild(label);

        button.onclick = function (event) {
            event.preventDefault();
            event.stopPropagation();
        };

        return button;
    }

    function createLocalCollapsibleSection(title, isCollapsed) {
        var section = document.createElement("section");
        section.className = "gallery-lighting-section gallery-local-collapsible-section";

        var headerButton = document.createElement("button");
        headerButton.type = "button";
        headerButton.className = "gallery-local-collapsible-header";

        var heading = document.createElement("h3");
        heading.className = "gallery-lighting-section-title";
        heading.innerText = title;

        var icon = document.createElement("span");
        icon.className = "gallery-local-collapsible-icon";
        icon.innerText = "⌄";

        var content = document.createElement("div");
        content.className = "gallery-local-collapsible-content";

        headerButton.appendChild(heading);
        headerButton.appendChild(icon);

        section.appendChild(headerButton);
        section.appendChild(content);

        if (isCollapsed) {
            section.classList.add("is-collapsed");
        }

        headerButton.onclick = function (event) {
            event.preventDefault();
            event.stopPropagation();
            section.classList.toggle("is-collapsed");
        };

        return {
            section: section,
            content: content
        };
    }


    function getSpotDirectionFromMarker(item) {
        if (!item || !item.markerMesh) {
            return new BABYLON.Vector3(0, -1, 0);
        }

        item.markerMesh.computeWorldMatrix(true);

        var direction = BABYLON.Vector3.TransformNormal(
            new BABYLON.Vector3(0, 0, 1),
            item.markerMesh.getWorldMatrix()
        );

        if (direction.length() === 0) {
            if (item.light && item.light.direction && item.light.direction.length() > 0) {
                direction = item.light.direction.clone();
            } else {
                direction = new BABYLON.Vector3(0, -1, 0);
            }
        }

        return direction.normalize();
    }

    function alignLocalSpotMarkerToLightDirection(item) {
        if (!item || item.type !== "spot" || !item.markerMesh || !item.light || !item.light.direction) {
            return;
        }

        var direction = item.light.direction.clone();

        if (direction.length() === 0) {
            direction = new BABYLON.Vector3(0, -1, 0);
        }

        direction.normalize();

        item.markerMesh.lookAt(item.markerMesh.position.add(direction));
    }

    function syncLocalLightTransformFromMarker(item, forceShadowRefresh) {
        if (!item || !item.light || !item.markerMesh) {
            return;
        }

        // Od tego momentu lampa jest traktowana jak recznie ustawiona.
        // Dotyczy tez lamp generowanych przy obrazach/rzezbach, bo one sa tym samym Local Light.
        item.manualTransformOverride = true;

        item.light.position.copyFrom(item.markerMesh.position);

        if (item.type === "spot") {
            item.light.direction.copyFrom(getSpotDirectionFromMarker(item));

            if (isFinite(item.light.range) && item.light.range > 0) {
                item.light.shadowMaxZ = item.light.range + 2;
                item.helperLength = item.light.range;
                item.helperMaxRadius = item.light.range;
            }

            if (isFinite(item.light.exponent)) {
                item.helperSoftness = getSpotBlendFromExponent(item.light.exponent);
            }
        }

        if (item.type === "point") {
            if (isFinite(item.light.range) && item.light.range > 0) {
                item.helperMaxRadius = item.light.range;
            }

            disableLocalPointLightShadow(item);
        }

        updateLocalLightHelper(item);
        updateLocalLightVisualState(item);

        requestDynamicWallSegmentRetargetForLocalLight(
            item,
            !!forceShadowRefresh,
            forceShadowRefresh ? "dragEnd" : "drag"
        );

        if (item.type === "spot") {
            requestLocalSpotShadowRefresh(item, !!forceShadowRefresh);
        }

        schedulePersistLocalLightState(false);
    }

    function ensureLocalLightGizmoManager() {
        if (localLightGizmoManager) {
            return localLightGizmoManager;
        }

        if (!BABYLON.GizmoManager) {
            console.warn("BABYLON.GizmoManager is not available in this build.");
            return null;
        }

        localLightGizmoManager = new BABYLON.GizmoManager(scene);
        localLightGizmoManager.usePointerToAttachGizmos = false;
        localLightGizmoManager.positionGizmoEnabled = localLightTransformGizmoEnabled;
        localLightGizmoManager.rotationGizmoEnabled = localLightRotationGizmoEnabled;
        localLightGizmoManager.scaleGizmoEnabled = false;
        localLightGizmoManager.boundingBoxGizmoEnabled = false;
        localLightGizmoManager.clearGizmoOnEmptyPointerEvent = false;

        var positionGizmo = localLightGizmoManager.gizmos.positionGizmo;

        if (positionGizmo) {
            positionGizmo.updateGizmoRotationToMatchAttachedMesh = false;

            if (positionGizmo.onDragObservable) {
                localLightGizmoDragObserver = positionGizmo.onDragObservable.add(function () {
                    syncLocalLightTransformFromMarker(localLightGizmoAttachedItem, false);
                });
            }

            if (positionGizmo.onDragEndObservable) {
                localLightGizmoDragEndObserver = positionGizmo.onDragEndObservable.add(function () {
                    syncLocalLightTransformFromMarker(localLightGizmoAttachedItem, true);
                });
            }
        }

        var rotationGizmo = localLightGizmoManager.gizmos.rotationGizmo;

        if (rotationGizmo) {
            rotationGizmo.updateGizmoRotationToMatchAttachedMesh = false;

            if (rotationGizmo.onDragObservable) {
                localLightRotationGizmoDragObserver = rotationGizmo.onDragObservable.add(function () {
                    syncLocalLightTransformFromMarker(localLightGizmoAttachedItem, false);
                });
            }

            if (rotationGizmo.onDragEndObservable) {
                localLightRotationGizmoDragEndObserver = rotationGizmo.onDragEndObservable.add(function () {
                    syncLocalLightTransformFromMarker(localLightGizmoAttachedItem, true);
                });
            }
        }

        return localLightGizmoManager;
    }

    function detachLocalLightGizmo() {
        if (localLightGizmoManager) {
            localLightGizmoManager.attachToMesh(null);
        }

        localLightGizmoAttachedItem = null;
    }

    function updateLocalLightGizmoAttachment() {
        if (
            !editMode ||
            !isLocalLightsPanelActive() ||
            (!localLightTransformGizmoEnabled && !localLightRotationGizmoEnabled)
        ) {
            detachLocalLightGizmo();
            return;
        }

        if (selectedLocalLights.length !== 1) {
            detachLocalLightGizmo();
            return;
        }

        var item = selectedLocalLights[0];

        if (!item || !item.markerMesh) {
            detachLocalLightGizmo();
            return;
        }

        var manager = ensureLocalLightGizmoManager();

        if (!manager) {
            return;
        }

        manager.positionGizmoEnabled = localLightTransformGizmoEnabled;
        manager.rotationGizmoEnabled = localLightRotationGizmoEnabled;
        manager.scaleGizmoEnabled = false;
        manager.boundingBoxGizmoEnabled = false;

        if (item.type === "spot" && !item.manualTransformOverride) {
            alignLocalSpotMarkerToLightDirection(item);
        }

        localLightGizmoAttachedItem = item;
        manager.attachToMesh(item.markerMesh);
    }

    function setLocalLightTransformGizmoEnabled(isEnabled) {
        localLightTransformGizmoEnabled = !!isEnabled;

        if (localLightUiRefs.gizmoToggleInput) {
            localLightUiRefs.gizmoToggleInput.checked = localLightTransformGizmoEnabled;
        }

        updateLocalLightGizmoAttachment();
    }

    function setLocalLightRotationGizmoEnabled(isEnabled) {
        localLightRotationGizmoEnabled = !!isEnabled;

        if (localLightUiRefs.rotationGizmoToggleInput) {
            localLightUiRefs.rotationGizmoToggleInput.checked = localLightRotationGizmoEnabled;
        }

        updateLocalLightGizmoAttachment();
    }

    function createLocalGizmoToggle(parent) {
        var label = document.createElement("label");
        label.className = "gallery-lighting-checkbox-row";

        var input = document.createElement("input");
        input.type = "checkbox";
        input.checked = localLightTransformGizmoEnabled;

        var text = document.createElement("span");
        text.innerText = "Move Gizmo";

        input.onchange = function () {
            setLocalLightTransformGizmoEnabled(input.checked);
        };

        label.appendChild(input);
        label.appendChild(text);
        parent.appendChild(label);

        localLightUiRefs.gizmoToggleInput = input;

        return input;
    }

    function createLocalRotationGizmoToggle(parent) {
        var label = document.createElement("label");
        label.className = "gallery-lighting-checkbox-row";

        var input = document.createElement("input");
        input.type = "checkbox";
        input.checked = localLightRotationGizmoEnabled;

        var text = document.createElement("span");
        text.innerText = "Rotate Gizmo";

        input.onchange = function () {
            setLocalLightRotationGizmoEnabled(input.checked);
        };

        label.appendChild(input);
        label.appendChild(text);
        parent.appendChild(label);

        localLightUiRefs.rotationGizmoToggleInput = input;

        return input;
    }

    function getLocalGroupLabel(index) {
        return "Group " + (index + 1);
    }

    function getLocalLightTypeSet() {
        var typeSet = {};

        selectedLocalLights.forEach(function (item) {
            typeSet[item.type] = true;
        });

        return typeSet;
    }


    function disposeLocalLightHelper(item) {
        if (!item) {
            return;
        }

        if (item.helperMeshes && item.helperMeshes.length) {
            item.helperMeshes.forEach(function (helperMesh) {
                if (helperMesh && helperMesh.dispose) {
                    helperMesh.dispose();
                }
            });
        }

        item.helperMeshes = [];

        if (item.helperMesh) {
            item.helperMesh.dispose();
            item.helperMesh = null;
        }
    }


    function getLocalLightSpawnPosition() {
        var forward = camera.getDirection(new BABYLON.Vector3(0, 0, 1));

        if (forward.length() === 0) {
            forward = new BABYLON.Vector3(0, 0, 1);
        }

        forward.normalize();

        var position = camera.position.add(forward.scale(3.2));
        position.y = lampCubeY;

        return position;
    }

    function getLocalLightSpawnDirection() {
        var forward = camera.getDirection(new BABYLON.Vector3(0, 0, 1));

        if (forward.length() === 0) {
            forward = new BABYLON.Vector3(0, 0, 1);
        }

        forward.normalize();

        return new BABYLON.Vector3(
            forward.x * 0.22,
            -1,
            forward.z * 0.22
        ).normalize();
    }

    function makeLocalLightMaterial(name, color, alpha) {
        var material = new BABYLON.StandardMaterial(name, scene);
        material.diffuseColor = color;
        material.emissiveColor = color.scale(0.72);
        material.specularColor = new BABYLON.Color3(0.10, 0.10, 0.10);

        if (alpha !== undefined && alpha < 1) {
            material.alpha = alpha;
            material.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
        }

        return material;
    }

    function removeLocalLightIdFromGroups(lightId) {
        localLightGroups = localLightGroups.map(function (group) {
            return group.filter(function (storedLightId) {
                return storedLightId !== lightId;
            });
        });
    }

    // STAGE 10E4 - SOFT DELETE LOCAL LIGHTS
    // Usuwanie światła przez light.dispose() usuwa je z listy świateł sceny i może
    // wymuszać przebudowę shaderów/materiałów. To wygląda jak przeładowanie tekstur.
    // Delete z UI robi więc soft-delete: światło zostaje technicznie w scenie,
    // ale ma intensity 0, nie jest widoczne w UI, nie jest targetowane i nie zapisuje się.
    var localLightSoftDeletedItems = [];
    var localLightQuarantineDummyMesh = null;

    function getLocalLightQuarantineDummyMesh() {
        if (localLightQuarantineDummyMesh && !localLightQuarantineDummyMesh.isDisposed()) {
            return localLightQuarantineDummyMesh;
        }

        // STAGE 10E5 - LIGHT QUARANTINE DUMMY TARGET
        // Ukryty dummy mesh służy jako jedyny target dla usuniętych lamp.
        // Dzięki temu soft-deleted light nie świeci na prawdziwe ściany/obrazy/podłogę
        // i nie zajmuje ich budżetu targetowania.
        localLightQuarantineDummyMesh = BABYLON.MeshBuilder.CreateBox(
            "berryboy_local_light_quarantine_dummy",
            {
                size: 0.01
            },
            scene
        );

        localLightQuarantineDummyMesh.position = new BABYLON.Vector3(0, -9999, 0);
        localLightQuarantineDummyMesh.isVisible = false;
        localLightQuarantineDummyMesh.visibility = 0;
        localLightQuarantineDummyMesh.isPickable = false;
        localLightQuarantineDummyMesh.checkCollisions = false;
        localLightQuarantineDummyMesh.metadata = {
            role: "localLightQuarantineDummy",
            hiddenHelper: true
        };

        return localLightQuarantineDummyMesh;
    }

    function hideLocalLightEditorMeshesForSoftDelete(item) {
        [
            item ? item.markerMesh : null,
            item ? item.helperMesh : null,
            item ? item.targetMesh : null,
            item ? item.rootNode : null
        ].forEach(function (mesh) {
            if (!mesh) {
                return;
            }

            // STAGE 10E9 - ZERO TOUCH LIGHT DELETE
            // Przy zwykłym Delete Selected nie zmieniamy enabled-state mesha.
            // Chowanie ma być wizualne, bez zmian w grafie sceny.
            if (mesh.isVisible !== undefined) {
                mesh.isVisible = false;
            }

            if (mesh.visibility !== undefined) {
                mesh.visibility = 0;
            }

            if (mesh.isPickable !== undefined) {
                mesh.isPickable = false;
            }

            mesh.metadata = mesh.metadata || {};
            mesh.metadata.softDeletedLocalLight = true;
        });

        if (item && item.helperMeshes && item.helperMeshes.length) {
            item.helperMeshes.forEach(function (helperMesh) {
                if (!helperMesh) {
                    return;
                }

                if (helperMesh.isVisible !== undefined) {
                    helperMesh.isVisible = false;
                }

                if (helperMesh.visibility !== undefined) {
                    helperMesh.visibility = 0;
                }

                if (helperMesh.isPickable !== undefined) {
                    helperMesh.isPickable = false;
                }
            });
        }
    }

    function softDeleteLocalLightItem(item) {
        if (!item || item.softDeleted) {
            return false;
        }

        if (
            localLightHighlightLayer &&
            localLightHighlightLayer.removeMesh &&
            item.markerMesh
        ) {
            localLightHighlightLayer.removeMesh(item.markerMesh);
        }

        if (localLightGizmoAttachedItem === item) {
            detachLocalLightGizmo();
        }

        item.softDeleted = true;
        item.selected = false;
        item.userEnabled = false;
        item.userIntensity = 0;
        item.runtimeTargetIntensity = 0;
        item.runtimeCurrentIntensity = 0;
        item.cameraCulled = true;

        if (item.light) {
            item._zeroTouchDeleteOriginalIncludedOnlyMeshes = item.light.includedOnlyMeshes
                ? item.light.includedOnlyMeshes.slice()
                : [];
            item._zeroTouchDeleteOriginalExcludedMeshes = item.light.excludedMeshes
                ? item.light.excludedMeshes.slice()
                : [];

            item.light.intensity = 0;
            item.light.metadata = item.light.metadata || {};
            item.light.metadata.softDeletedLocalLight = true;
            item.light.metadata.zeroTouchDeleted = true;

            // STAGE 10E9:
            // Nie zmieniamy enabled-state, nie robimy dispose i nie przepinamy targetów.
            // W poprzednich wersjach nawet przepięcie includedOnlyMeshes na dummy
            // mogło powodować przebudowę materiałów. Tu zmieniamy tylko intensity.
        }

        hideLocalLightEditorMeshesForSoftDelete(item);

        // STAGE 10E9:
        // Nie robimy disposeLocalLightHelper(item) przy zwykłym Delete Selected.
        // Helpery są ukryte, ale ich geometria zostaje do reuse albo ręcznego cleanupu.
        // Nie odświeżamy też globalnych targetów świateł.

        if (item.ownerMesh && item.ownerMesh.metadata) {
            if (item.ownerMesh.metadata.lampMesh === item.markerMesh) {
                item.ownerMesh.metadata.lampMesh = null;
            }

            if (item.ownerMesh.metadata.spotLight === item.light) {
                item.ownerMesh.metadata.spotLight = null;
            }
        }

        artworkLights = artworkLights.filter(function (lightData) {
            return lightData.lampMesh !== item.markerMesh && lightData.spotLight !== item.light;
        });

        localLightItems = localLightItems.filter(function (localLightItem) {
            return localLightItem !== item;
        });

        selectedLocalLights = selectedLocalLights.filter(function (selectedItem) {
            return selectedItem !== item;
        });

        removeLocalLightIdFromGroups(item.id);

        if (localLightSoftDeletedItems.indexOf(item) === -1) {
            localLightSoftDeletedItems.push(item);
        }

        return true;
    }

    // STAGE 10E7 - NO DISPOSE LIGHT REUSE POOL
    // Skoro light.dispose() dalej powoduje przeładowanie materiałów,
    // Delete Selected nie robi żadnego hard dispose w trakcie sesji.
    // Zamiast tego usunięte lampy są trzymane w kwarantannie i odzyskiwane
    // przy tworzeniu nowej lampy tego samego typu.
    function takeLocalLightFromReusePool(type) {
        var item = null;

        localLightSoftDeletedItems = localLightSoftDeletedItems.filter(function (candidate) {
            if (!item && candidate && candidate.type === type && !candidate.hardDisposed) {
                item = candidate;
                return false;
            }

            return true;
        });

        return item;
    }

    function reactivateLocalLightFromReusePool(type, position, direction, createIndex) {
        var item = takeLocalLightFromReusePool(type);

        if (!item || !item.light || !item.markerMesh) {
            return null;
        }

        var isPoint = type === "point";
        var idPrefix = isPoint ? "LocalPointLight_" : "LocalSpotLight_";
        var markerPrefix = isPoint ? "LocalPointMarker_" : "LocalSpotMarker_";
        var displayPrefix = isPoint ? "Point Light " : "Spot Light ";
        var id = idPrefix + createIndex;

        item.id = id;
        item.name = displayPrefix + createIndex;
        item.type = type;
        item.softDeleted = false;
        item.selected = false;
        item.userEnabled = true;
        item.cameraCulled = false;
        item.runtimeTargetIntensity = 0;
        item.runtimeCurrentIntensity = 0;
        item.targetOptions = normalizeLocalTargetOptions(null);
        item.localShadowGenerator = null;
        item.helperMesh = null;
        item.helperMeshes = [];

        item.light.name = id;
        item.light.position.copyFrom(position);
        item.light.intensity = isPoint ? 2.0 : unifiedSpotDefaults.intensity;
        item.userIntensity = item.light.intensity;
        item.light.range = isPoint ? 8 : unifiedSpotDefaults.range;
        item.light.diffuse = isPoint
            ? new BABYLON.Color3(0.78, 0.90, 1.0)
            : new BABYLON.Color3(1.0, 0.92, 0.74);
        item.light.specular = isPoint
            ? new BABYLON.Color3(0.08, 0.09, 0.10)
            : new BABYLON.Color3(0.10, 0.08, 0.05);
        item.light.includedOnlyMeshes = [];
        item.light.excludedMeshes = [];

        if (!isPoint && direction && item.light.direction) {
            item.light.direction.copyFrom(direction);
            forceStandardSpotFalloff(item.light);
            item.light.angle = BABYLON.Tools.ToRadians(unifiedSpotDefaults.angleDegrees);
            item.light.exponent = getExponentFromSpotBlend(unifiedSpotDefaults.blend);
            item.helperLength = item.light.range;
            item.helperMaxRadius = item.light.range;
            item.helperSoftness = unifiedSpotDefaults.blend;
        } else if (isPoint) {
            item.helperMaxRadius = item.light.range;
        }

        item.light.metadata = item.light.metadata || {};
        item.light.metadata.softDeletedLocalLight = false;
        item.light.metadata.reusedFromLocalLightPool = true;
        item.light.metadata.quarantinedToDummyMesh = null;

        item.markerMesh.name = markerPrefix + createIndex;
        item.markerMesh.position.copyFrom(position);
        item.markerMesh.isPickable = editMode;
        item.markerMesh.isVisible = true;
        if (item.markerMesh.setEnabled) {
            item.markerMesh.setEnabled(true);
        }
        item.markerMesh.metadata = item.markerMesh.metadata || {};
        item.markerMesh.metadata.localLightId = id;
        item.markerMesh.metadata.softDeletedLocalLight = false;
        item.markerMesh.metadata.reusedFromLocalLightPool = true;

        if (!isPoint && direction && item.markerMesh.lookAt) {
            item.markerMesh.lookAt(position.add(direction));
        }

        if (item.rootNode && item.rootNode.setEnabled) {
            item.rootNode.setEnabled(true);
        }

        localLightItems.push(item);

        refreshCommonLightingMaterialSupport();
        applyCommonLocalLightTargets(item);
        disableLocalPointLightShadow(item);
        ensureCommonLightShadowLogic(item);
        updateLocalLightHelper(item);
        applyLocalLightRuntimeEnabled(item);
        updateLocalLightsUi();
        updateViewerModePlaceholderVisibility();

        return item;
    }

    // STAGE 10E8 - SAFE MANUAL CLEAN DISABLED LIGHTS BUTTON
    // Standardowy Delete Selected nadal NIE robi light.dispose(), żeby nie było flickera.
    // Ten helper jest odpalany tylko ręcznie z przycisku CLEAN DISABLED LIGHTS.
    // Czyści wyłącznie lampy z puli/kwarantanny, nigdy aktywne lampy.
    function safeDisposeObjectForDisabledLocalLightCleanup(object, label) {
        if (!object || !object.dispose) {
            return;
        }

        try {
            object.dispose();
        } catch (error) {
            console.warn("Clean disabled local light warning [" + label + "]:", error);
        }
    }

    function cleanDisabledLocalLightPool() {
        var itemsToClean = localLightSoftDeletedItems.slice();
        var cleanedCount = 0;

        itemsToClean.forEach(function (item) {
            if (!item || !item.softDeleted || item.hardDisposed) {
                return;
            }

            if (
                localLightHighlightLayer &&
                localLightHighlightLayer.removeMesh &&
                item.markerMesh
            ) {
                try {
                    localLightHighlightLayer.removeMesh(item.markerMesh);
                } catch (error) {
                    console.warn("Clean disabled local highlight warning:", error);
                }
            }

            if (localLightGizmoAttachedItem === item) {
                detachLocalLightGizmo();
            }

            disposeLocalLightHelper(item);

            if (item.localShadowGenerator && item.localShadowGenerator.dispose) {
                safeDisposeObjectForDisabledLocalLightCleanup(
                    item.localShadowGenerator,
                    "shadowGenerator"
                );
            }

            safeDisposeObjectForDisabledLocalLightCleanup(item.light, "light");
            safeDisposeObjectForDisabledLocalLightCleanup(item.markerMesh, "markerMesh");
            safeDisposeObjectForDisabledLocalLightCleanup(item.targetMesh, "targetMesh");
            safeDisposeObjectForDisabledLocalLightCleanup(item.helperMesh, "helperMesh");
            safeDisposeObjectForDisabledLocalLightCleanup(item.rootNode, "rootNode");

            item.light = null;
            item.markerMesh = null;
            item.targetMesh = null;
            item.helperMesh = null;
            item.rootNode = null;
            item.localShadowGenerator = null;
            item.hardDisposed = true;

            cleanedCount += 1;
        });

        localLightSoftDeletedItems = localLightSoftDeletedItems.filter(function (item) {
            return !!(item && !item.hardDisposed);
        });

        updateLocalLightsUi();

        return {
            cleanedCount: cleanedCount,
            remainingReusePoolCount: localLightSoftDeletedItems.length
        };
    }

    function disposeLocalLightItem(item) {
        if (!item) {
            return;
        }

        if (
            localLightHighlightLayer &&
            localLightHighlightLayer.removeMesh &&
            item.markerMesh
        ) {
            localLightHighlightLayer.removeMesh(item.markerMesh);
        }

        disposeLocalLightHelper(item);

        if (localLightGizmoAttachedItem === item) {
            detachLocalLightGizmo();
        }

        if (item.localShadowGenerator && item.localShadowGenerator.dispose) {
            item.localShadowGenerator.dispose();
            item.localShadowGenerator = null;
        }

        if (item.light && item.light.dispose) {
            item.light.dispose();
        }

        if (item.markerMesh && item.markerMesh.dispose) {
            item.markerMesh.dispose();
        }

        if (item.rootNode && item.rootNode.dispose) {
            item.rootNode.dispose();
        }

        if (item.ownerMesh && item.ownerMesh.metadata) {
            if (item.ownerMesh.metadata.lampMesh === item.markerMesh) {
                item.ownerMesh.metadata.lampMesh = null;
            }

            if (item.ownerMesh.metadata.spotLight === item.light) {
                item.ownerMesh.metadata.spotLight = null;
            }
        }

        artworkLights = artworkLights.filter(function (lightData) {
            return lightData.lampMesh !== item.markerMesh && lightData.spotLight !== item.light;
        });

        localLightItems = localLightItems.filter(function (localLightItem) {
            return localLightItem !== item;
        });

        selectedLocalLights = selectedLocalLights.filter(function (selectedItem) {
            return selectedItem !== item;
        });

        removeLocalLightIdFromGroups(item.id);
        refreshArtworkLightExclusions();
        refreshPedestalLightIncludedMeshes();
    }

    function deleteSelectedLocalLights() {
        var itemsToDelete = selectedLocalLights.slice();

        itemsToDelete.forEach(function (item) {
            softDeleteLocalLightItem(item);
        });

        selectedLocalLights = [];
        updateLocalLightsUi();
        schedulePersistLocalLightState(true);
    }

    function getSpotLightHelperLength(item) {
        if (item && item.helperLength) {
            return item.helperLength;
        }

        if (
            item &&
            item.light &&
            isFinite(item.light.range) &&
            item.light.range > 0
        ) {
            return Math.min(item.light.range, 5);
        }

        return 4;
    }


    function isMeshValidForLocalLightHelperHit(mesh, item) {
        if (!mesh || !mesh.isEnabled() || !mesh.isVisible) {
            return false;
        }

        if (item && mesh === item.markerMesh) {
            return false;
        }

        if (mesh.metadata) {
            if (mesh.metadata.localLightId) {
                return false;
            }

            if (mesh.metadata.localLightHelperFor) {
                return false;
            }
        }

        if (mesh.name && mesh.name.indexOf("_SelectionGradientGlow") !== -1) {
            return false;
        }

        // Helper ma pokazywac footprint na scenie, a nie zatrzymywac sie na obrazach.
        if (artworks.includes(mesh)) {
            return false;
        }

        return true;
    }

    function getProjectedHelperPoint(origin, direction, maxDistance, item) {
        var rayDirection = direction.clone();

        if (rayDirection.length() === 0) {
            rayDirection = new BABYLON.Vector3(0, -1, 0);
        }

        rayDirection.normalize();

        var ray = new BABYLON.Ray(
            origin,
            rayDirection,
            maxDistance
        );

        var hit = scene.pickWithRay(
            ray,
            function (mesh) {
                return isMeshValidForLocalLightHelperHit(mesh, item);
            },
            true
        );

        if (hit && hit.hit && hit.pickedPoint) {
            var point = hit.pickedPoint.clone();
            var normal = null;

            if (hit.getNormal) {
                normal = hit.getNormal(true);
            }

            if (normal && normal.length && normal.length() > 0) {
                normal.normalize();
                point.addInPlace(normal.scale(0.018));
            } else {
                point.addInPlace(rayDirection.scale(-0.018));
            }

            return point;
        }

        return origin.add(rayDirection.scale(maxDistance));
    }

    function getSpotHelperRayDirection(direction, right, up, halfAngle, t) {
        var coneDirection = direction
            .scale(Math.cos(halfAngle))
            .add(right.scale(Math.cos(t) * Math.sin(halfAngle)))
            .add(up.scale(Math.sin(t) * Math.sin(halfAngle)));

        if (coneDirection.length() === 0) {
            return direction.clone();
        }

        return coneDirection.normalize();
    }

    function createSpotLightHelperLines(item) {
        if (!item || !item.light || item.type !== "spot") {
            return null;
        }

        var light = item.light;
        var position = light.position.clone();
        var direction = light.direction.clone();

        if (direction.length() === 0) {
            direction = new BABYLON.Vector3(0, -1, 0);
        }

        direction.normalize();

        var length = getSpotLightHelperLength(item);
        var maxDistance = Math.max(length, 0.1);
        var angle = light.angle || Math.PI / 3;
        var halfAngle = angle * 0.5;

        var exponent = isFinite(light.exponent) ? light.exponent : 1;

        // Inner boundary = umowny core swiatla.
        // Pas pomiedzy inner i outer pokazuje Blend / soft edge.
        var innerFactor = 0.42 + Math.min(Math.max(exponent / 8, 0), 1) * 0.42;
        var innerHalfAngle = halfAngle * innerFactor;

        var helperUp = Math.abs(BABYLON.Vector3.Dot(direction, BABYLON.Axis.Y)) > 0.92
            ? BABYLON.Axis.X.clone()
            : BABYLON.Axis.Y.clone();

        var right = BABYLON.Vector3.Cross(direction, helperUp).normalize();
        var up = BABYLON.Vector3.Cross(right, direction).normalize();

        var outerLines = [];
        var blendLines = [];
        var outerPoints = [];
        var innerPoints = [];
        var segments = 32;

        for (var i = 0; i < segments; i++) {
            var t = (Math.PI * 2 * i) / segments;

            var outerDirection = getSpotHelperRayDirection(
                direction,
                right,
                up,
                halfAngle,
                t
            );

            var innerDirection = getSpotHelperRayDirection(
                direction,
                right,
                up,
                innerHalfAngle,
                t
            );

            outerPoints.push(
                getProjectedHelperPoint(
                    position,
                    outerDirection,
                    maxDistance,
                    item
                )
            );

            innerPoints.push(
                getProjectedHelperPoint(
                    position,
                    innerDirection,
                    maxDistance,
                    item
                )
            );
        }

        for (var j = 0; j < segments; j++) {
            var next = (j + 1) % segments;

            // Zewnetrzny ring = Angle / granica stozka.
            outerLines.push([outerPoints[j], outerPoints[next]]);

            if (j % 4 === 0) {
                outerLines.push([position, outerPoints[j]]);
            }

            // Przerywany inner ring = core swiatla.
            if (j % 2 === 0) {
                blendLines.push([innerPoints[j], innerPoints[next]]);
            }

            // Linie miedzy core i outer ring = soft edge / Blend.
            if (j % 4 === 0) {
                blendLines.push([innerPoints[j], outerPoints[j]]);
            }
        }

        var centerPoint = getProjectedHelperPoint(
            position,
            direction,
            maxDistance,
            item
        );

        outerLines.push([position, centerPoint]);

        var outerMesh = BABYLON.MeshBuilder.CreateLineSystem(
            item.id + "_HelperConeAngle",
            {
                lines: outerLines
            },
            scene
        );

        outerMesh.color = new BABYLON.Color3(1.0, 0.78, 0.18);
        outerMesh.isPickable = false;
        outerMesh.isVisible = false;
        outerMesh.metadata = outerMesh.metadata || {};
        outerMesh.metadata.localLightHelperFor = item.id;

        var blendMesh = BABYLON.MeshBuilder.CreateLineSystem(
            item.id + "_HelperConeBlend",
            {
                lines: blendLines
            },
            scene
        );

        // Blend jest celowo jasniejszy, zeby nie znikal na tle zoltego Angle.
        blendMesh.color = new BABYLON.Color3(0.35, 0.95, 1.0);
        blendMesh.isPickable = false;
        blendMesh.isVisible = false;
        blendMesh.metadata = blendMesh.metadata || {};
        blendMesh.metadata.localLightHelperFor = item.id;

        item.helperMeshes = [outerMesh, blendMesh];

        return outerMesh;
    }

    function getLocalLightWorldPosition(item) {
        if (!item || !item.light) {
            return BABYLON.Vector3.Zero();
        }

        if (item.light.getAbsolutePosition) {
            return item.light.getAbsolutePosition().clone();
        }

        if (item.light.position) {
            if (item.light.parent && item.light.parent.getWorldMatrix) {
                return BABYLON.Vector3.TransformCoordinates(
                    item.light.position,
                    item.light.parent.getWorldMatrix()
                );
            }

            return item.light.position.clone();
        }

        if (item.markerMesh && item.markerMesh.getAbsolutePosition) {
            return item.markerMesh.getAbsolutePosition().clone();
        }

        return BABYLON.Vector3.Zero();
    }

    function createPointLightHelperLines(item) {
        if (!item || !item.light || item.type !== "point") {
            return null;
        }

        var radius = item.light.range && item.light.range > 0
            ? Math.min(item.light.range, item.helperMaxRadius || item.light.range)
            : 2.5;

        var position = getLocalLightWorldPosition(item);
        var rangeLines = [];
        var segments = 40;

        function circlePoint(axis, angle) {
            var c = Math.cos(angle) * radius;
            var s = Math.sin(angle) * radius;

            if (axis === "xy") {
                return position.add(new BABYLON.Vector3(c, s, 0));
            }

            if (axis === "xz") {
                return position.add(new BABYLON.Vector3(c, 0, s));
            }

            return position.add(new BABYLON.Vector3(0, c, s));
        }

        // Point Light pokazuje tylko zasieg.
        // Usuwamy zolte promienie, bo przy poincie byly mylace i dublowaly logike spota.
        ["xy", "xz", "yz"].forEach(function (axis) {
            for (var i = 0; i < segments; i++) {
                var t0 = (Math.PI * 2 * i) / segments;
                var t1 = (Math.PI * 2 * (i + 1)) / segments;
                rangeLines.push([circlePoint(axis, t0), circlePoint(axis, t1)]);
            }
        });

        var rangeMesh = BABYLON.MeshBuilder.CreateLineSystem(
            item.id + "_HelperPointRange",
            {
                lines: rangeLines
            },
            scene
        );

        rangeMesh.color = new BABYLON.Color3(0.35, 0.95, 1.0);
        rangeMesh.isPickable = false;
        rangeMesh.isVisible = false;
        rangeMesh.metadata = rangeMesh.metadata || {};
        rangeMesh.metadata.localLightHelperFor = item.id;

        item.helperMeshes = [rangeMesh];

        return rangeMesh;
    }

    function updateLocalLightHelper(item) {
        if (!item) {
            return;
        }

        disposeLocalLightHelper(item);

        if (item.type === "spot") {
            item.helperMesh = createSpotLightHelperLines(item);
        } else if (item.type === "point") {
            item.helperMesh = createPointLightHelperLines(item);
        }
    }

    function updateLocalLightHelperForLight(light) {
        var item = localLightItems.find(function (localLightItem) {
            return localLightItem.light === light;
        });

        if (item) {
            updateLocalLightHelper(item);
            updateLocalLightVisualState(item);
        }
    }

    function updateLocalLightVisualState(item) {
        if (!item || !item.markerMesh) {
            return;
        }

        var isLocalModeActive = isLocalLightsPanelActive();
        var shouldShowSelection = isLocalModeActive && item.selected;

        item.markerMesh.isPickable = editMode;

        item.markerMesh.renderOutline = false;
        item.markerMesh.renderOverlay = false;

        // Lampy nie uzywaja prostokatnego plane glow jak obrazy.
        // Tutaj glow idzie po sylwetce / ksztalcie samego mesha lampy.
        if (localLightHighlightLayer && localLightHighlightLayer.removeMesh) {
            localLightHighlightLayer.removeMesh(item.markerMesh);
        }

        if (
            shouldShowSelection &&
            localLightHighlightLayer &&
            localLightHighlightLayer.addMesh
        ) {
            localLightHighlightLayer.addMesh(
                item.markerMesh,
                localLightGlowColor
            );
        }

        if (item.helperMeshes && item.helperMeshes.length) {
            item.helperMeshes.forEach(function (helperMesh) {
                if (helperMesh) {
                    helperMesh.isVisible = shouldShowSelection;
                }
            });
        } else if (item.helperMesh) {
            item.helperMesh.isVisible = shouldShowSelection;
        }
    }

    function updateLocalLightVisuals() {
        localLightItems.forEach(function (item) {
            if (!item.helperMesh && (!item.helperMeshes || item.helperMeshes.length === 0)) {
                updateLocalLightHelper(item);
            }

            updateLocalLightVisualState(item);
        });
    }

    function updateLocalLightUiVisibility() {
        var hasSelection = selectedLocalLights.length > 0;
        var typeSet = getLocalLightTypeSet();

        localLightUiRefs.selectionDependentSections.forEach(function (section) {
            if (!section) {
                return;
            }

            section.classList.toggle("gallery-local-section-hidden", !hasSelection);
        });

        Object.keys(localLightUiRefs.typeSections).forEach(function (typeKey) {
            var section = localLightUiRefs.typeSections[typeKey];

            if (!section) {
                return;
            }

            section.classList.toggle(
                "gallery-local-section-hidden",
                !hasSelection || !typeSet[typeKey]
            );
        });
    }

    function getLocalLightItemById(lightId) {
        return localLightItems.find(function (item) {
            return item && item.id === lightId;
        }) || null;
    }

    function getLocalLightGroupItems(index) {
        var safeIndex = Math.max(0, Math.min(7, Number(index) || 0));

        return localLightGroups[safeIndex]
            .map(function (lightId) {
                return getLocalLightItemById(lightId);
            })
            .filter(function (item) {
                return !!item && !!item.light;
            });
    }

    function sanitizeLocalLightGroups() {
        localLightGroups = localLightGroups.map(function (group) {
            var cleanedGroup = [];

            group.forEach(function (lightId) {
                if (getLocalLightItemById(lightId) && cleanedGroup.indexOf(lightId) === -1) {
                    cleanedGroup.push(lightId);
                }
            });

            return cleanedGroup;
        });
    }

    function setLocalLightItemEnabled(item, isEnabled, forceShadowRefresh) {
        if (!item || !item.light || !item.light.setEnabled) {
            return;
        }

        item.userEnabled = !!isEnabled;
        applyLocalLightRuntimeEnabled(item);

        if (item.type === "point") {
            disableLocalPointLightShadow(item);
        } else if (item.type === "spot") {
            requestLocalSpotShadowRefresh(item, !!forceShadowRefresh);
        }
    }

    function enableActiveLocalGroup() {
        getLocalLightGroupItems(activeLocalGroupIndex).forEach(function (item) {
            setLocalLightItemEnabled(item, true, true);
        });

        updateLocalLightsUi();
        schedulePersistLocalLightState(true);
    }

    function disableActiveLocalGroup() {
        getLocalLightGroupItems(activeLocalGroupIndex).forEach(function (item) {
            setLocalLightItemEnabled(item, false, true);
        });

        updateLocalLightsUi();
        schedulePersistLocalLightState(true);
    }

    function enterLocalLightGroupSolo(index) {
        var groupItems = getLocalLightGroupItems(index);

        if (!groupItems.length) {
            return;
        }

        if (!localLightSoloState.active) {
            localLightSoloState.enabledById = {};
            localLightItems.forEach(function (item) {
                if (item && item.light && item.light.isEnabled) {
                    localLightSoloState.enabledById[item.id] = getLocalLightUserEnabled(item);
                }
            });
        }

        localLightSoloState.active = true;
        localLightSoloState.groupIndex = index;

        var groupIds = groupItems.map(function (item) {
            return item.id;
        });

        localLightItems.forEach(function (item) {
            setLocalLightItemEnabled(
                item,
                groupIds.indexOf(item.id) !== -1,
                true
            );
        });

        updateLocalLightsUi();
    }

    function exitLocalLightGroupSolo() {
        if (!localLightSoloState.active) {
            return;
        }

        localLightItems.forEach(function (item) {
            var restoredEnabled = localLightSoloState.enabledById[item.id];

            setLocalLightItemEnabled(
                item,
                restoredEnabled !== undefined ? restoredEnabled : true,
                true
            );
        });

        localLightSoloState.active = false;
        localLightSoloState.groupIndex = null;
        localLightSoloState.enabledById = {};

        updateLocalLightsUi();
    }

    function toggleActiveLocalLightGroupSolo() {
        if (
            localLightSoloState.active &&
            localLightSoloState.groupIndex === activeLocalGroupIndex
        ) {
            exitLocalLightGroupSolo();
            return;
        }

        enterLocalLightGroupSolo(activeLocalGroupIndex);
    }

    function updateLocalLightGroupUi() {
        sanitizeLocalLightGroups();

        localLightUiRefs.groupTiles.forEach(function (tile, index) {
            tile.classList.toggle("is-active", index === activeLocalGroupIndex);
            tile.classList.toggle(
                "is-solo",
                !!localLightSoloState.active && localLightSoloState.groupIndex === index
            );
        });

        localLightUiRefs.groupCountValues.forEach(function (countValue, index) {
            countValue.innerText = String(localLightGroups[index].length);
        });

        if (localLightUiRefs.groupSoloButton) {
            var isCurrentGroupSolo =
                !!localLightSoloState.active &&
                localLightSoloState.groupIndex === activeLocalGroupIndex;

            localLightUiRefs.groupSoloButton.classList.toggle("is-active", isCurrentGroupSolo);
            localLightUiRefs.groupSoloButton.innerText = isCurrentGroupSolo
                ? "Exit Solo Group"
                : "Solo Group";
        }
    }

    function updateLocalLightsUi() {
        if (localLightUiRefs.selectedCountValue) {
            localLightUiRefs.selectedCountValue.innerText = String(selectedLocalLights.length);
        }

        if (localLightUiRefs.registeredCountValue) {
            localLightUiRefs.registeredCountValue.innerText = String(localLightItems.length);
        }

        if (localLightUiRefs.activeGroupValue) {
            localLightUiRefs.activeGroupValue.innerText = getLocalGroupLabel(activeLocalGroupIndex);
        }

        updateLocalLightGroupUi();
        updateLocalLightUiVisibility();
        syncLocalLightControlsFromSelection();
        updateLocalLightVisuals();
        updateLocalLightGizmoAttachment();
    }

    function registerLocalLight(options) {
        if (!options || !options.light || !options.markerMesh) {
            return null;
        }

        if (options.type === "area") {
            console.warn("Area Light is disabled in Stage 5.1. Registration skipped.");
            return null;
        }

        var id = options.id || ("LocalLight_" + localLightItems.length);

        var existing = localLightItems.find(function (item) {
            return item.id === id;
        });

        if (existing) {
            return existing;
        }

        var item = {
            id: id,
            name: options.name || id,
            type: options.type || "spot",
            light: options.light,
            markerMesh: options.markerMesh,
            ownerMesh: options.ownerMesh || null,
            rootNode: options.rootNode || null,
            helperMesh: null,
            helperMeshes: [],
            helperLength: options.helperLength || null,
            helperMaxRadius: options.helperMaxRadius || null,
            helperSoftness: options.helperSoftness !== undefined ? options.helperSoftness : 0.45,
            targetOptions: normalizeLocalTargetOptions(options.targetOptions),
            localShadowGenerator: null,
            selected: false,
            userEnabled: options.light && options.light.isEnabled
                ? !!options.light.isEnabled()
                : true,
            userIntensity: options.light ? Number(options.light.intensity) || 0 : 0,
            cameraCulled: false
        };

        options.markerMesh.isPickable = editMode;
        options.markerMesh.renderOutline = false;
        options.markerMesh.metadata = options.markerMesh.metadata || {};
        options.markerMesh.metadata.localLightId = id;

        localLightItems.push(item);

        refreshCommonLightingMaterialSupport();
        applyCommonLocalLightTargets(item);
        disableLocalPointLightShadow(item);
        ensureCommonLightShadowLogic(item);
        updateLocalLightHelper(item);
        applyLocalLightRuntimeEnabled(item);

        updateLocalLightsUi();

        return item;
    }

    function getLocalLightItemByMesh(mesh) {
        if (!mesh || !mesh.metadata || !mesh.metadata.localLightId) {
            return null;
        }

        return localLightItems.find(function (item) {
            return item.id === mesh.metadata.localLightId;
        }) || null;
    }

    function setLocalLightSelected(item, isSelected) {
        if (!item) {
            return;
        }

        item.selected = !!isSelected;

        if (item.selected) {
            if (!selectedLocalLights.includes(item)) {
                selectedLocalLights.push(item);
            }
        } else {
            selectedLocalLights = selectedLocalLights.filter(function (selectedItem) {
                return selectedItem !== item;
            });
        }
    }

    function clearLocalLightSelection() {
        selectedLocalLights.forEach(function (item) {
            item.selected = false;
        });

        selectedLocalLights = [];
        updateLocalLightsUi();
        updateLightingDropdownOptions();

        if (lightingPanelMode === "edit") {
            closeLightingDropdown();
        }
    }

    function selectLocalLightItem(item, additive) {
        if (!item) {
            return;
        }

        if (!additive) {
            clearLocalLightSelection();
        }

        if (additive && item.selected) {
            setLocalLightSelected(item, false);
        } else {
            setLocalLightSelected(item, true);
        }

        updateLocalLightsUi();
    }

    function selectLocalLightGroup(index) {
        activeLocalGroupIndex = Math.max(0, Math.min(7, index));

        clearLocalLightSelection();

        getLocalLightGroupItems(activeLocalGroupIndex).forEach(function (item) {
            setLocalLightSelected(item, true);
        });

        updateLocalLightsUi();
    }

    function saveCurrentLocalSelectionToActiveGroup() {
        localLightGroups[activeLocalGroupIndex] = selectedLocalLights
            .filter(function (item) {
                return !!item && !!item.id;
            })
            .map(function (item) {
                return item.id;
            });

        sanitizeLocalLightGroups();
        updateLocalLightsUi();
        schedulePersistLocalLightState(true);
    }

    function clearActiveLocalGroup() {
        localLightGroups[activeLocalGroupIndex] = [];

        if (
            localLightSoloState.active &&
            localLightSoloState.groupIndex === activeLocalGroupIndex
        ) {
            exitLocalLightGroupSolo();
            return;
        }

        clearLocalLightSelection();
        updateLocalLightsUi();
        schedulePersistLocalLightState(true);
    }


    function createLocalSpotLight() {
        localLightCreateCounter += 1;

        var position = getLocalLightSpawnPosition();
        var direction = getLocalLightSpawnDirection();

        var reusedItem = reactivateLocalLightFromReusePool("spot", position, direction, localLightCreateCounter);
        if (reusedItem) {
            selectLocalLightItem(reusedItem, false);
            schedulePersistLocalLightState(true);
            return;
        }

        var markerMesh = BABYLON.MeshBuilder.CreateBox(
            "LocalSpotMarker_" + localLightCreateCounter,
            {
                width: 0.42,
                height: 0.16,
                depth: 0.22
            },
            scene
        );

        markerMesh.position.copyFrom(position);
        markerMesh.material = makeLocalLightMaterial(
            "LocalSpotMarkerMat_" + localLightCreateCounter,
            new BABYLON.Color3(1.0, 0.52, 0.10)
        );

        markerMesh.lookAt(position.add(direction));

        var unifiedSpot = createUnifiedSpotLight(
            "LocalSpotLight_" + localLightCreateCounter,
            position,
            direction,
            {
                diffuse: new BABYLON.Color3(1.0, 0.92, 0.74),
                specular: new BABYLON.Color3(0.10, 0.08, 0.05)
            }
        );

        var spotLight = unifiedSpot.light;

        var item = registerLocalLight({
            id: spotLight.name,
            name: "Spot Light " + localLightCreateCounter,
            type: "spot",
            light: spotLight,
            markerMesh: markerMesh,
            helperLength: unifiedSpot.range,
            helperMaxRadius: unifiedSpot.range,
            helperSoftness: unifiedSpot.blend
        });

        selectLocalLightItem(item, false);
        schedulePersistLocalLightState(true);
    }

    function createLocalPointLight() {
        localLightCreateCounter += 1;

        var position = getLocalLightSpawnPosition();

        var reusedItem = reactivateLocalLightFromReusePool("point", position, null, localLightCreateCounter);
        if (reusedItem) {
            selectLocalLightItem(reusedItem, false);
            schedulePersistLocalLightState(true);
            return;
        }

        var markerMesh = BABYLON.MeshBuilder.CreateSphere(
            "LocalPointMarker_" + localLightCreateCounter,
            {
                diameter: 0.28,
                segments: 16
            },
            scene
        );

        markerMesh.position.copyFrom(position);
        markerMesh.material = makeLocalLightMaterial(
            "LocalPointMarkerMat_" + localLightCreateCounter,
            new BABYLON.Color3(0.46, 0.74, 1.0)
        );

        var pointLight = new BABYLON.PointLight(
            "LocalPointLight_" + localLightCreateCounter,
            position.clone(),
            scene
        );

        pointLight.intensity = 2.0;
        pointLight.range = 8;
        pointLight.diffuse = new BABYLON.Color3(0.78, 0.90, 1.0);
        pointLight.specular = new BABYLON.Color3(0.08, 0.09, 0.10);

        var item = registerLocalLight({
            id: pointLight.name,
            name: "Point Light " + localLightCreateCounter,
            type: "point",
            light: pointLight,
            markerMesh: markerMesh,
            helperMaxRadius: pointLight.range
        });

        selectLocalLightItem(item, false);
        schedulePersistLocalLightState(true);
    }

    function isLocalLightsPanelActive() {
        return editMode && lightingPanelMode === "lighting" && lightingContentMode === "local";
    }

    function readLightingSettingsFromScene() {
        return {
            exposure: scene.imageProcessingConfiguration.exposure,
            contrast: scene.imageProcessingConfiguration.contrast,
            environmentIntensity: scene.environmentIntensity,
            environmentRotation: environmentRotationY,

            hemiEnabled: light.isEnabled(),
            hemiIntensity: light.intensity,
            hemiSkyColor: color3ToHex(light.diffuse),
            hemiGroundColor: color3ToHex(light.groundColor),

            directionalEnabled: mainDirectionalLight.isEnabled(),
            directionalIntensity: mainDirectionalLight.intensity,
            directionalColor: color3ToHex(mainDirectionalLight.diffuse),
            directionalHorizontalAngle: getMainDirectionalAngles().horizontal,
            directionalVerticalAngle: getMainDirectionalAngles().vertical,

            shadowsEnabled: shadowsEnabled,
            shadowDarkness: mainShadowGenerator.darkness,
            shadowSoftness: mainShadowSoftnessValue
        };
    }

    var lightingDefaultSettings = null;

    var lightingLookPresets = [
        {
            name: "Neutral",
            settings: {
                exposure: 0.95,
                contrast: 1.05,
                environmentIntensity: 0.55,
                environmentRotation: 0,
                hemiEnabled: true,
                hemiIntensity: 0.45,
                hemiSkyColor: "#fff5e6",
                hemiGroundColor: "#292624",
                directionalEnabled: true,
                directionalIntensity: 0.85,
                directionalColor: "#fff5e6",
                directionalHorizontalAngle: 66,
                directionalVerticalAngle: 47,
                shadowsEnabled: true,
                shadowDarkness: 0.34,
                shadowSoftness: 34
            }
        },
        {
            name: "Warm",
            settings: {
                exposure: 0.92,
                contrast: 1.10,
                environmentIntensity: 0.68,
                environmentRotation: 35,
                hemiEnabled: true,
                hemiIntensity: 0.52,
                hemiSkyColor: "#ffeccf",
                hemiGroundColor: "#2f2419",
                directionalEnabled: true,
                directionalIntensity: 1.08,
                directionalColor: "#ffdba6",
                directionalHorizontalAngle: 70,
                directionalVerticalAngle: 53,
                shadowsEnabled: true,
                shadowDarkness: 0.38,
                shadowSoftness: 42
            }
        },
        {
            name: "Cool",
            settings: {
                exposure: 1.00,
                contrast: 1.02,
                environmentIntensity: 0.62,
                environmentRotation: -30,
                hemiEnabled: true,
                hemiIntensity: 0.50,
                hemiSkyColor: "#d8edff",
                hemiGroundColor: "#1c2431",
                directionalEnabled: true,
                directionalIntensity: 0.92,
                directionalColor: "#eef6ff",
                directionalHorizontalAngle: 76,
                directionalVerticalAngle: 43,
                shadowsEnabled: true,
                shadowDarkness: 0.30,
                shadowSoftness: 30
            }
        }
    ];

    function persistCurrentLightingSettings() {
        try {
            localStorage.setItem(
                lightingStateStorageKey,
                JSON.stringify(readLightingSettingsFromScene())
            );
        } catch (error) {
        }
    }

    function readSavedLightingState() {
        try {
            var rawData = localStorage.getItem(lightingStateStorageKey);

            if (!rawData) {
                return null;
            }

            var parsedData = JSON.parse(rawData);

            if (!parsedData || typeof parsedData !== "object") {
                return null;
            }

            return parsedData;
        } catch (error) {
            return null;
        }
    }

    function syncLightingControls(settings) {
        lightingControlRefs.exposure.setValue(settings.exposure);
        lightingControlRefs.contrast.setValue(settings.contrast);
        lightingControlRefs.environmentIntensity.setValue(settings.environmentIntensity);
        lightingControlRefs.environmentRotation.setValue(settings.environmentRotation);

        lightingControlRefs.hemiEnabled.setValue(settings.hemiEnabled);
        lightingControlRefs.hemiIntensity.setValue(settings.hemiIntensity);
        lightingControlRefs.hemiSkyColor.setValue(settings.hemiSkyColor);
        lightingControlRefs.hemiGroundColor.setValue(settings.hemiGroundColor);

        lightingControlRefs.directionalEnabled.setValue(settings.directionalEnabled);
        lightingControlRefs.directionalIntensity.setValue(settings.directionalIntensity);
        lightingControlRefs.directionalColor.setValue(settings.directionalColor);
        lightingControlRefs.directionalHorizontalAngle.setValue(settings.directionalHorizontalAngle);
        lightingControlRefs.directionalVerticalAngle.setValue(settings.directionalVerticalAngle);

        lightingControlRefs.shadowsEnabled.setValue(settings.shadowsEnabled);
        lightingControlRefs.shadowDarkness.setValue(settings.shadowDarkness);
        lightingControlRefs.shadowSoftness.setValue(settings.shadowSoftness);
    }

    function applyLightingSettings(settings, shouldSyncControls) {
        if (!settings) {
            return;
        }

        var fallbackSettings = lightingDefaultSettings || readLightingSettingsFromScene();
        settings = Object.assign({}, fallbackSettings, settings);

        // Kompatybilnosc ze starszymi presetami, ktore zapisywaly Direction X/Y/Z.
        if (
            settings.directionalHorizontalAngle === undefined &&
            settings.directionalX !== undefined &&
            settings.directionalY !== undefined &&
            settings.directionalZ !== undefined
        ) {
            var oldDirection = new BABYLON.Vector3(
                Number(settings.directionalX),
                Number(settings.directionalY),
                Number(settings.directionalZ)
            );

            if (oldDirection.length() > 0) {
                oldDirection.normalize();
                settings.directionalHorizontalAngle = BABYLON.Tools.ToDegrees(
                    Math.atan2(oldDirection.x, oldDirection.z)
                );
                settings.directionalVerticalAngle = BABYLON.Tools.ToDegrees(
                    Math.asin(Math.max(-1, Math.min(1, -oldDirection.y)))
                );
            }
        }

        scene.imageProcessingConfiguration.exposure = Number(settings.exposure);
        scene.imageProcessingConfiguration.contrast = Number(settings.contrast);
        scene.environmentIntensity = Number(settings.environmentIntensity);
        setEnvironmentRotationY(settings.environmentRotation);

        light.setEnabled(!!settings.hemiEnabled);
        light.intensity = Number(settings.hemiIntensity);
        light.diffuse = hexToColor3(settings.hemiSkyColor);
        light.groundColor = hexToColor3(settings.hemiGroundColor);

        mainDirectionalLight.setEnabled(!!settings.directionalEnabled);
        mainDirectionalLight.intensity = Number(settings.directionalIntensity);
        mainDirectionalLight.diffuse = hexToColor3(settings.directionalColor);
        mainDirectionalLight.specular = hexToColor3(settings.directionalColor).scale(0.35);
        setMainDirectionalAngles(
            settings.directionalHorizontalAngle,
            settings.directionalVerticalAngle
        );

        setMainShadowsEnabled(settings.shadowsEnabled);
        mainShadowGenerator.darkness = Number(settings.shadowDarkness);
        setMainShadowSoftness(settings.shadowSoftness);

        if (shouldSyncControls) {
            syncLightingControls(readLightingSettingsFromScene());
        }

        persistCurrentLightingSettings();
    }

    function readLightingPresets() {
        try {
            var rawData = localStorage.getItem(lightingPresetStorageKey);

            if (!rawData) {
                return [null, null, null];
            }

            var parsedData = JSON.parse(rawData);

            if (!Array.isArray(parsedData)) {
                return [null, null, null];
            }

            return [
                parsedData[0] || null,
                parsedData[1] || null,
                parsedData[2] || null
            ];
        } catch (error) {
            return [null, null, null];
        }
    }

    function writeLightingPresets(presets) {
        localStorage.setItem(
            lightingPresetStorageKey,
            JSON.stringify([
                presets[0] || null,
                presets[1] || null,
                presets[2] || null
            ])
        );
    }

    var lightingPresetRows = [];

    function updateLightingPresetRows() {
        var presets = readLightingPresets();

        lightingPresetRows.forEach(function (rowData, index) {
            var isSaved = !!presets[index];

            rowData.status.innerText = isSaved ? "Saved" : "Empty";
            rowData.loadButton.disabled = !isSaved;
            rowData.clearButton.disabled = !isSaved;
        });
    }

    function saveLightingPreset(index) {
        var presets = readLightingPresets();

        presets[index] = readLightingSettingsFromScene();

        writeLightingPresets(presets);
        updateLightingPresetRows();
    }

    function loadLightingPreset(index) {
        var presets = readLightingPresets();
        var preset = presets[index];

        if (!preset) {
            return;
        }

        // Bardzo wazne: preset aktualizuje scene ORAZ suwaki / checkboxy / color pickery.
        applyLightingSettings(preset, true);
        updateLightingPresetRows();
    }

    function clearLightingPreset(index) {
        var presets = readLightingPresets();

        presets[index] = null;

        writeLightingPresets(presets);
        updateLightingPresetRows();
    }

    var lightingScroll = document.createElement("div");
    lightingScroll.className = "gallery-lighting-scroll";

    var lightingHeader = document.createElement("div");
    lightingHeader.className = "gallery-lighting-header";

    var lightingModeLabel = document.createElement("div");
    lightingModeLabel.className = "gallery-lighting-mode-label";
    lightingModeLabel.innerText = "Mode: Lighting";

    var lightingMenuButton = document.createElement("button");
    lightingMenuButton.type = "button";
    lightingMenuButton.className = "gallery-lighting-menu-button";
    lightingMenuButton.title = "Back to edit";
    lightingMenuButton.innerHTML = `
        <svg viewBox="0 0 24 24" width="23" height="23" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 6h10"></path>
            <path d="M8 12h10"></path>
            <path d="M8 18h10"></path>
            <path d="M4.5 6h.01"></path>
            <path d="M4.5 12h.01"></path>
            <path d="M4.5 18h.01"></path>
        </svg>
    `;

    var lightingDropdown = document.createElement("div");
    lightingDropdown.className = "gallery-lighting-dropdown";

    lightingHeader.appendChild(lightingModeLabel);
    lightingHeader.appendChild(lightingMenuButton);
    lightingHeader.appendChild(lightingDropdown);
    lightingScroll.appendChild(lightingHeader);

    var lightingContentMode = "main";

    var lightingModeTabs = document.createElement("div");
    lightingModeTabs.className = "gallery-lighting-mode-tabs";

    var lightingMainTabButton = document.createElement("button");
    lightingMainTabButton.type = "button";
    lightingMainTabButton.className = "gallery-lighting-tab-button is-active";
    lightingMainTabButton.innerText = "MAIN LIGHTS";

    var lightingLocalTabButton = document.createElement("button");
    lightingLocalTabButton.type = "button";
    lightingLocalTabButton.className = "gallery-lighting-tab-button";
    lightingLocalTabButton.innerText = "LOCAL LIGHTS";

    lightingModeTabs.appendChild(lightingMainTabButton);
    lightingModeTabs.appendChild(lightingLocalTabButton);

    var lightingContentStack = document.createElement("div");
    lightingContentStack.className = "gallery-lighting-content-stack";

    var mainLightingContent = document.createElement("div");
    mainLightingContent.className = "gallery-lighting-main-content";

    var localLightingContent = document.createElement("div");
    localLightingContent.className = "gallery-lighting-local-content gallery-lighting-content-hidden";

    function closeLightingDropdown() {
        lightingDropdown.classList.remove("is-open");
    }

    function addLightingDropdownOption(labelText, onClick) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "gallery-lighting-dropdown-button";
        button.innerText = labelText;

        button.onclick = function (event) {
            event.preventDefault();
            event.stopPropagation();
            closeLightingDropdown();
            onClick();
        };

        lightingDropdown.appendChild(button);
    }

    function updateLightingDropdownOptions() {
        lightingDropdown.innerHTML = "";

        addLightingDropdownOption("Edit Mode", function () {
            setEditorPanelMode("edit");
        });

        if (lightingContentMode !== "main") {
            addLightingDropdownOption("Main Lights", function () {
                setEditorPanelMode("lighting");
                setLightingContentMode("main");
            });
        }

        if (lightingContentMode !== "local") {
            addLightingDropdownOption("Local Lights", function () {
                setEditorPanelMode("lighting");
                setLightingContentMode("local");
            });
        }
    }

    function setLightingContentMode(nextMode) {
        lightingContentMode = nextMode === "local" ? "local" : "main";

        mainLightingContent.classList.toggle("gallery-lighting-content-hidden", lightingContentMode !== "main");
        localLightingContent.classList.toggle("gallery-lighting-content-hidden", lightingContentMode !== "local");

        lightingMainTabButton.classList.toggle("is-active", lightingContentMode === "main");
        lightingLocalTabButton.classList.toggle("is-active", lightingContentMode === "local");

        if (lightingContentMode === "local") {
            updateLocalLightsUi();
        }

        if (lightingContentStack) {
            lightingContentStack.scrollTop = 0;
        }

        updateLightingDropdownOptions();
    }

    lightingMainTabButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();
        setLightingContentMode("main");
    };

    lightingLocalTabButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();
        setLightingContentMode("local");
    };

    lightingContentStack.appendChild(mainLightingContent);
    lightingContentStack.appendChild(localLightingContent);
    lightingScroll.appendChild(lightingContentStack);

    var globalLookSection = createLightingSection("GLOBAL LOOK");

    createLightingSlider(globalLookSection, "exposure", "Exposure", 0.2, 2.5, 0.01, scene.imageProcessingConfiguration.exposure, 2, function (value) {
        scene.imageProcessingConfiguration.exposure = value;
    });

    createLightingSlider(globalLookSection, "contrast", "Contrast", 0.5, 2.0, 0.01, scene.imageProcessingConfiguration.contrast, 2, function (value) {
        scene.imageProcessingConfiguration.contrast = value;
    });

    createLightingSlider(globalLookSection, "environmentIntensity", "Environment Reflections", 0, 2.5, 0.01, scene.environmentIntensity, 2, function (value) {
        scene.environmentIntensity = value;
    });

    createLightingSlider(globalLookSection, "environmentRotation", "Environment Rotation", -180, 180, 1, environmentRotationY, 0, function (value) {
        setEnvironmentRotationY(value);
    });

    mainLightingContent.appendChild(globalLookSection);

    var hemisphericSection = createLightingSection("HEMISPHERIC LIGHT");

    createLightingCheckbox(hemisphericSection, "hemiEnabled", "Enabled", light.isEnabled(), function (checked) {
        light.setEnabled(checked);
    });

    createLightingSlider(hemisphericSection, "hemiIntensity", "Intensity", 0, 4, 0.01, light.intensity, 2, function (value) {
        light.intensity = value;
    });

    createLightingColor(hemisphericSection, "hemiSkyColor", "Sky Color", light.diffuse, function (color) {
        light.diffuse = color;
    });

    createLightingColor(hemisphericSection, "hemiGroundColor", "Ground Color", light.groundColor, function (color) {
        light.groundColor = color;
    });

    mainLightingContent.appendChild(hemisphericSection);

    var directionalSection = createLightingSection("DIRECTIONAL LIGHT");

    createLightingCheckbox(directionalSection, "directionalEnabled", "Enabled", mainDirectionalLight.isEnabled(), function (checked) {
        mainDirectionalLight.setEnabled(checked);
    });

    createLightingSlider(directionalSection, "directionalIntensity", "Intensity", 0, 6, 0.01, mainDirectionalLight.intensity, 2, function (value) {
        mainDirectionalLight.intensity = value;
    });

    createLightingColor(directionalSection, "directionalColor", "Color", mainDirectionalLight.diffuse, function (color) {
        mainDirectionalLight.diffuse = color;
        mainDirectionalLight.specular = color.scale(0.35);
    });

    var initialDirectionalAngles = getMainDirectionalAngles();

    createLightingSlider(directionalSection, "directionalHorizontalAngle", "Horizontal Angle", -180, 180, 1, initialDirectionalAngles.horizontal, 0, function (value) {
        setMainDirectionalAngles(
            value,
            parseFloat(lightingControlRefs.directionalVerticalAngle.input.value)
        );
    });

    createLightingSlider(directionalSection, "directionalVerticalAngle", "Vertical Angle", 1, 89, 1, initialDirectionalAngles.vertical, 0, function (value) {
        setMainDirectionalAngles(
            parseFloat(lightingControlRefs.directionalHorizontalAngle.input.value),
            value
        );
    });

    createLightingCheckbox(directionalSection, "shadowsEnabled", "Shadows Enabled", shadowsEnabled, function (checked) {
        setMainShadowsEnabled(checked);
    });

    createLightingSlider(directionalSection, "shadowDarkness", "Shadow Darkness", 0, 1, 0.01, mainShadowGenerator.darkness, 2, function (value) {
        mainShadowGenerator.darkness = value;
    });

    createLightingSlider(directionalSection, "shadowSoftness", "Shadow Softness", 0, 100, 1, mainShadowSoftnessValue, 0, function (value) {
        setMainShadowSoftness(value);
    });

    mainLightingContent.appendChild(directionalSection);

    var presetsSection = createLightingSection("LIGHTING PRESETS");

    var quickPresetsWrap = document.createElement("div");
    quickPresetsWrap.className = "gallery-lighting-quick-presets";

    lightingLookPresets.forEach(function (presetData) {
        var quickButton = document.createElement("button");
        quickButton.type = "button";
        quickButton.className = "gallery-lighting-quick-button";
        quickButton.innerText = presetData.name;
        quickButton.onclick = function (event) {
            event.preventDefault();
            event.stopPropagation();
            applyLightingSettings(presetData.settings, true);
        };
        quickPresetsWrap.appendChild(quickButton);
    });

    presetsSection.appendChild(quickPresetsWrap);

    var resetLightingButton = document.createElement("button");
    resetLightingButton.type = "button";
    resetLightingButton.className = "gallery-lighting-reset-button";
    resetLightingButton.innerText = "RESET CURRENT LIGHTING";
    resetLightingButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();

        if (lightingDefaultSettings) {
            applyLightingSettings(lightingDefaultSettings, true);
        }
    };
    presetsSection.appendChild(resetLightingButton);

    var presetsWrapper = document.createElement("div");
    presetsWrapper.className = "gallery-lighting-presets";

    for (var presetIndex = 0; presetIndex < 3; presetIndex++) {
        (function (index) {
            var row = document.createElement("div");
            row.className = "gallery-lighting-preset-row";

            var nameWrap = document.createElement("div");
            nameWrap.className = "gallery-lighting-preset-name";
            nameWrap.innerHTML = "Preset " + (index + 1) + "<span class=\"gallery-lighting-preset-status\">Empty</span>";

            var status = nameWrap.querySelector(".gallery-lighting-preset-status");

            var loadButton = document.createElement("button");
            loadButton.type = "button";
            loadButton.className = "gallery-lighting-preset-button";
            loadButton.innerText = "Load";
            loadButton.onclick = function (event) {
                event.preventDefault();
                event.stopPropagation();
                loadLightingPreset(index);
            };

            var saveButton = document.createElement("button");
            saveButton.type = "button";
            saveButton.className = "gallery-lighting-preset-button";
            saveButton.innerText = "Save";
            saveButton.onclick = function (event) {
                event.preventDefault();
                event.stopPropagation();
                saveLightingPreset(index);
            };

            var clearButton = document.createElement("button");
            clearButton.type = "button";
            clearButton.className = "gallery-lighting-preset-button";
            clearButton.innerText = "Clear";
            clearButton.onclick = function (event) {
                event.preventDefault();
                event.stopPropagation();
                clearLightingPreset(index);
            };

            row.appendChild(nameWrap);
            row.appendChild(loadButton);
            row.appendChild(saveButton);
            row.appendChild(clearButton);

            presetsWrapper.appendChild(row);

            lightingPresetRows.push({
                status: status,
                loadButton: loadButton,
                clearButton: clearButton
            });
        })(presetIndex);
    }

    presetsSection.appendChild(presetsWrapper);

    var presetNote = document.createElement("p");
    presetNote.className = "gallery-lighting-note";
    presetNote.innerHTML = "<span class=\"gallery-lighting-note-icon\">i</span><span>Loaded presets also update sliders and color controls.</span>";
    presetsSection.appendChild(presetNote);

    mainLightingContent.appendChild(presetsSection);

    var localCreateSection = createLightingSection("CREATE");

    var localCreateGrid = document.createElement("div");
    localCreateGrid.className = "gallery-local-create-grid";

    var localAddSpotButton = createLocalToolButton("Spot", "", "+");
    localAddSpotButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();
        createLocalSpotLight();
    };

    var localAddPointButton = createLocalToolButton("Point", "", "+");
    localAddPointButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();
        createLocalPointLight();
    };

    var localDeleteSelectedButton = createLocalToolButton("Delete Selected", "is-danger", "×");
    localDeleteSelectedButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();
        deleteSelectedLocalLights();
    };

    var localCleanDisabledLightsButton = createLocalToolButton("Clean Disabled Lights", "is-danger", "!");
    localCleanDisabledLightsButton.title = "Hard-clean quarantined/deleted lights from memory. This may cause a short material reload.";
    localCleanDisabledLightsButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();

        if (!localLightSoftDeletedItems.length) {
            console.info("No disabled local lights to clean.");
            return;
        }

        var message = "Clean " + localLightSoftDeletedItems.length + " disabled Local Light(s) from memory? This may cause a short material reload.";
        var confirmed = true;

        if (typeof window !== "undefined" && window.confirm) {
            confirmed = window.confirm(message);
        }

        if (!confirmed) {
            return;
        }

        var result = cleanDisabledLocalLightPool();
        console.info("Clean Disabled Lights:", result);
    };

    localCreateGrid.appendChild(localAddSpotButton);
    localCreateGrid.appendChild(localAddPointButton);
    localCreateGrid.appendChild(localDeleteSelectedButton);
    localCreateGrid.appendChild(localCleanDisabledLightsButton);
    localCreateSection.appendChild(localCreateGrid);
    localLightingContent.appendChild(localCreateSection);

    var localSelectionSection = createLightingSection("SELECTION");

    var localSelectionLines = document.createElement("div");
    localSelectionLines.className = "gallery-local-selection-lines";

    var localSelectedLine = document.createElement("span");
    localSelectedLine.className = "gallery-local-status-line";
    localSelectedLine.innerHTML = "Selected Lights: <strong>0</strong>";
    localLightUiRefs.selectedCountValue = localSelectedLine.querySelector("strong");

    var localRegisteredLine = document.createElement("span");
    localRegisteredLine.className = "gallery-local-status-line";
    localRegisteredLine.innerHTML = "Registered Lights: <strong>0</strong>";
    localLightUiRefs.registeredCountValue = localRegisteredLine.querySelector("strong");

    var localActiveGroupLine = document.createElement("span");
    localActiveGroupLine.className = "gallery-local-status-line";
    localActiveGroupLine.innerHTML = "Active Group: <strong>Group 1</strong>";
    localLightUiRefs.activeGroupValue = localActiveGroupLine.querySelector("strong");

    localSelectionLines.appendChild(localSelectedLine);
    localSelectionLines.appendChild(localRegisteredLine);
    localSelectionLines.appendChild(localActiveGroupLine);

    localSelectionSection.appendChild(localSelectionLines);

    var localEmptyNote = document.createElement("div");
    localEmptyNote.className = "gallery-local-stage-note";
    localEmptyNote.innerText = "Stage 9: Local Lights save and restore automatically. Targets stay inside Advanced.";
    localSelectionSection.appendChild(localEmptyNote);
    localLightingContent.appendChild(localSelectionSection);

    var localGeneralSection = createLightingSection("GENERAL SETTINGS");
    localGeneralSection.classList.add("gallery-local-general-section");

    var localTransformTitle = document.createElement("p");
    localTransformTitle.className = "gallery-local-subtle-heading";
    localTransformTitle.innerText = "TRANSFORM";
    localGeneralSection.appendChild(localTransformTitle);

    var localTransformGrid = document.createElement("div");
    localTransformGrid.className = "gallery-local-transform-grid";
    localGeneralSection.appendChild(localTransformGrid);

    createLocalGizmoToggle(localTransformGrid);
    createLocalRotationGizmoToggle(localTransformGrid);


    var localEnabledInput = createLocalEditCheckbox(localGeneralSection, "enabled", "Enabled", true);

    if (localEnabledInput && localEnabledInput.parentElement) {
        localEnabledInput.parentElement.classList.add("gallery-local-enabled-row");
    }

    createLocalEditColor(localGeneralSection, "color", "Color", "#fff1c8");
    createLocalEditSlider(localGeneralSection, "intensity", "Intensity", 0, 120, 0.1, 2.2, 1, "");
    createLocalEditSlider(localGeneralSection, "range", "Range", 0.1, 30, 0.1, 12.5, 1, "");

    var localMixedNote = document.createElement("div");
    localMixedNote.className = "gallery-local-mixed-note";
    localMixedNote.innerHTML = "<span class=\"gallery-local-mixed-dot\">!</span><span>Mixed means selected lights currently have different values. Moving a control applies the new value to all selected compatible lights.</span>";
    localGeneralSection.appendChild(localMixedNote);

    localLightUiRefs.selectionDependentSections.push(localGeneralSection);
    localLightingContent.appendChild(localGeneralSection);

    var localSpotSection = createLightingSection("SPOT SETTINGS");
    localSpotSection.classList.add("gallery-local-type-section");
    localSpotSection.dataset.localTypeSection = "spot";
    createLocalEditSlider(localSpotSection, "spotAngle", "Angle", 1, 120, 1, 61, 0, "°", "spot");
    createLocalEditSlider(localSpotSection, "spotBlend", "Blend", 0, 1, 0.01, 0.66, 2, "", "spot");

    var localSpotLegend = document.createElement("div");
    localSpotLegend.className = "gallery-local-helper-legend";
    localSpotLegend.innerHTML = "<strong>Cone helper:</strong> yellow footprint = Angle, blue dashed/inner band = Blend soft edge. Helper stops on walls, floor, ceiling or props.";
    localSpotSection.appendChild(localSpotLegend);

    localLightUiRefs.typeSections.spot = localSpotSection;
    localLightingContent.appendChild(localSpotSection);

    var localPointSection = createLightingSection("POINT SETTINGS");
    localPointSection.classList.add("gallery-local-type-section");
    localPointSection.dataset.localTypeSection = "point";

    var localPointLegend = document.createElement("div");
    localPointLegend.className = "gallery-local-helper-legend";
    localPointLegend.innerHTML = "<strong>Point helper:</strong> cyan sphere = Range. Point Light is fill / accent only. It does not create local shadows.";
    localPointSection.appendChild(localPointLegend);

    localLightUiRefs.typeSections.point = localPointSection;
    localLightingContent.appendChild(localPointSection);

    var localAdvancedData = createLocalCollapsibleSection("ADVANCED", true);
    var localAdvancedSection = localAdvancedData.section;
    var localAdvancedContent = localAdvancedData.content;

    var localTargetsTitle = document.createElement("p");
    localTargetsTitle.className = "gallery-local-subtle-heading";
    localTargetsTitle.innerText = "LIGHT TARGETS";
    localAdvancedContent.appendChild(localTargetsTitle);

    var localTargetsGrid = document.createElement("div");
    localTargetsGrid.className = "gallery-local-targets-grid";
    localAdvancedContent.appendChild(localTargetsGrid);

    createLocalEditCheckbox(localTargetsGrid, "targetFloor", "Floor", true, null);
    createLocalEditCheckbox(localTargetsGrid, "targetWalls", "Walls", true, null);
    createLocalEditCheckbox(localTargetsGrid, "targetCeiling", "Ceiling", true, null);
    createLocalEditCheckbox(localTargetsGrid, "targetArtworks", "Artworks", true, null);
    createLocalEditCheckbox(localTargetsGrid, "targetSculptures", "Sculptures", true, null);
    createLocalEditCheckbox(localTargetsGrid, "targetProps", "Props", true, null);

    var localTargetsLegend = document.createElement("div");
    localTargetsLegend.className = "gallery-local-helper-legend";
    localTargetsLegend.innerHTML = "<strong>Targets:</strong> choose which scene groups are affected by the selected local light. Ceiling controls Roof.gltf; Props currently include imported scene props such as Went.gltf.";
    localAdvancedContent.appendChild(localTargetsLegend);

    localLightUiRefs.selectionDependentSections.push(localAdvancedSection);
    localLightingContent.appendChild(localAdvancedSection);

    var localGroupsSection = createLightingSection("GROUPS");

    var localGroupsGrid = document.createElement("div");
    localGroupsGrid.className = "gallery-local-groups-grid";

    for (var localGroupIndex = 0; localGroupIndex < 8; localGroupIndex++) {
        (function (index) {
            var tile = document.createElement("button");
            tile.type = "button";
            tile.className = "gallery-local-group-tile" + (index === 0 ? " is-active" : "");

            var name = document.createElement("span");
            name.className = "gallery-local-group-name";
            name.innerText = getLocalGroupLabel(index);

            var count = document.createElement("span");
            count.className = "gallery-local-group-count";
            count.innerText = "0";

            tile.appendChild(name);
            tile.appendChild(count);

            tile.onclick = function (event) {
                event.preventDefault();
                event.stopPropagation();
                selectLocalLightGroup(index);
            };

            localLightUiRefs.groupTiles[index] = tile;
            localLightUiRefs.groupCountValues[index] = count;

            localGroupsGrid.appendChild(tile);
        })(localGroupIndex);
    }

    localGroupsSection.appendChild(localGroupsGrid);

    var localGroupActions = document.createElement("div");
    localGroupActions.className = "gallery-local-group-actions";

    var localSaveGroupButton = createLocalToolButton("Save Selection to Group", "", "");
    localSaveGroupButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();
        saveCurrentLocalSelectionToActiveGroup();
    };

    var localClearGroupButton = createLocalToolButton("Clear Group", "is-danger", "×");
    localClearGroupButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();
        clearActiveLocalGroup();
    };

    var localEnableGroupButton = createLocalToolButton("Enable Group", "is-primary", "");
    localEnableGroupButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();
        enableActiveLocalGroup();
    };

    var localDisableGroupButton = createLocalToolButton("Disable Group", "", "");
    localDisableGroupButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();
        disableActiveLocalGroup();
    };

    var localSoloGroupButton = createLocalToolButton("Solo Group", "is-primary is-wide", "");
    localSoloGroupButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();
        toggleActiveLocalLightGroupSolo();
    };
    localLightUiRefs.groupSoloButton = localSoloGroupButton;

    localGroupActions.appendChild(localSaveGroupButton);
    localGroupActions.appendChild(localClearGroupButton);
    localGroupActions.appendChild(localEnableGroupButton);
    localGroupActions.appendChild(localDisableGroupButton);
    localGroupActions.appendChild(localSoloGroupButton);

    var localGroupLegend = document.createElement("div");
    localGroupLegend.className = "gallery-local-helper-legend";
    localGroupLegend.innerHTML = "<strong>Groups:</strong> save a light selection, then enable, disable or solo the active group without changing target settings.";

    localGroupsSection.appendChild(localGroupActions);
    localGroupsSection.appendChild(localGroupLegend);
    localLightingContent.appendChild(localGroupsSection);

    updateLocalLightsUi();


    lightingScroll.appendChild(lightingModeTabs);

    var lightingBackButton = document.createElement("button");
    lightingBackButton.type = "button";
    lightingBackButton.className = "gallery-lighting-back-button";
    lightingBackButton.innerText = "BACK TO EDIT";

    lightingScroll.appendChild(lightingBackButton);
    editHelpPanel.appendChild(lightingScroll);

    function setEditorPanelMode(nextMode) {
        lightingPanelMode = nextMode === "lighting" ? "lighting" : "edit";

        editHelpPanel.classList.toggle("is-lighting-mode", lightingPanelMode === "lighting");
        editorScroll.style.display = lightingPanelMode === "edit" ? "block" : "none";
        lightingScroll.style.display = lightingPanelMode === "lighting" ? "flex" : "none";

        if (lightingPanelMode === "lighting") {
            syncLightingControls(readLightingSettingsFromScene());
            updateLightingPresetRows();
        }

        updateLocalLightsUi();
    }

    editorMenuButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();

        if (!editMode) {
            return;
        }

        setEditorPanelMode("lighting");
    };

    lightingQuickButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();

        if (!editMode) {
            return;
        }

        setEditorPanelMode("lighting");
    };

    lightingMenuButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();
        updateLightingDropdownOptions();
        lightingDropdown.classList.toggle("is-open");
    };

    document.addEventListener("pointerdown", function () {
        closeLightingDropdown();
    });

    lightingBackButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();
        closeLightingDropdown();
        setEditorPanelMode("edit");
    };

    lightingDefaultSettings = readLightingSettingsFromScene();

    var savedLightingState = readSavedLightingState();

    if (savedLightingState) {
        applyLightingSettings(savedLightingState, true);
    }

    updateLightingPresetRows();
    setEditorPanelMode("edit");

    appendGalleryUiElement(editHelpPanel);

    cleanupArtworkInfoPopupDom();

    var artworkInfoPopup = document.createElement("div");
    artworkInfoPopup.id = "galleryArtworkInfoPopup";
    artworkInfoPopup.className = "gallery-artwork-info-popup";
    artworkInfoPopup.innerHTML = ''
        + '<div class="gallery-artwork-info-popup-inner">'
        + '  <div class="gallery-artwork-info-author-card">'
        + '    <div class="gallery-artwork-info-photo-frame">'
        + '      <img class="gallery-artwork-info-author-photo" alt="Author photo" />'
        + '      <div class="gallery-artwork-info-author-photo-placeholder">Author photo</div>'
        + '    </div>'
        + '    <div class="gallery-artwork-info-author-name"></div>'
        + '  </div>'
        + '  <div class="gallery-artwork-info-details-card">'
        + '    <div class="gallery-artwork-info-title"></div>'
        + '    <div class="gallery-artwork-info-description"></div>'
        + '    <div class="gallery-artwork-info-empty">No artwork information added yet.</div>'
        + '  </div>'
        + '</div>';
    appendGalleryUiElement(artworkInfoPopup);

    var artworkInfoPopupRefs = {
        photo: artworkInfoPopup.querySelector(".gallery-artwork-info-author-photo"),
        photoPlaceholder: artworkInfoPopup.querySelector(".gallery-artwork-info-author-photo-placeholder"),
        authorName: artworkInfoPopup.querySelector(".gallery-artwork-info-author-name"),
        title: artworkInfoPopup.querySelector(".gallery-artwork-info-title"),
        description: artworkInfoPopup.querySelector(".gallery-artwork-info-description"),
        empty: artworkInfoPopup.querySelector(".gallery-artwork-info-empty")
    };

    var currentArtworkInfoPopupMesh = null;

    artworkInfoPopup.classList.remove("is-visible");
    artworkInfoPopup.style.visibility = "hidden";
    artworkInfoPopup.style.opacity = "0";


    function setEditorUiVisible(isVisible) {
        editHelpPanel.style.display = isVisible ? "flex" : "none";
        setModeButtonContent(isVisible);

        if (isVisible) {
            setEditorPanelMode("edit");

            if (editButton.parentElement !== editorFooterActions) {
                editorFooterActions.appendChild(editButton);
            }

            if (lightingQuickButton.parentElement !== editorFooterActions) {
                editorFooterActions.appendChild(lightingQuickButton);
            }

            lightingQuickButton.style.display = "inline-flex";
            editButton.className = "gallery-editor-panel-mode-button";
        } else {
            setEditorPanelMode("edit");

            lightingQuickButton.style.display = "none";

            if (editButton.parentElement !== prepareGalleryUiRoot()) {
                appendGalleryUiElement(editButton);
            }

            editButton.className = "gallery-editor-floating-mode-button";
        }
    }

    // STAGE 11G - WALL COLOR PATHS
    // Nowe tekstury ścian są w repo assetów:
    // https://raw.githubusercontent.com/followyes/berryboy-art-gallery-assets/main/wall_color/basecolor_*.png
    var wallColorTextureBaseUrl = "https://raw.githubusercontent.com/followyes/berryboy-art-gallery-assets/main/wall_color/";

    function getWallColorTextureUrl(fileName) {
        return wallColorTextureBaseUrl + fileName;
    }

    var wallColors = [
        {
            name: "black",
            label: "Black",
            url: getWallColorTextureUrl("basecolor_black.png")
        },
        {
            name: "blue",
            label: "Blue",
            url: getWallColorTextureUrl("basecolor_blue.png")
        },
        {
            name: "cyan",
            label: "Cyan",
            url: getWallColorTextureUrl("basecolor_cyan.png")
        },
        {
            name: "green",
            label: "Green",
            url: getWallColorTextureUrl("basecolor_green.png")
        },
        {
            name: "orange",
            label: "Orange",
            url: getWallColorTextureUrl("basecolor_orange.png")
        },
        {
            name: "purple",
            label: "Purple",
            url: getWallColorTextureUrl("basecolor_purple.png")
        },
        {
            name: "red",
            label: "Red",
            url: getWallColorTextureUrl("basecolor_red.png")
        },
        {
            name: "white",
            label: "White",
            url: getWallColorTextureUrl("basecolor_white.png")
        },
        {
            name: "yellow",
            label: "Yellow",
            url: getWallColorTextureUrl("basecolor_yellow.png")
        }
    ];

    wallColors.forEach(function (colorData) {

        var material = new BABYLON.PBRMaterial("WallColor_" + colorData.name, scene);
        var wallColorTexture = new BABYLON.Texture(colorData.url, scene);

        material.albedoTexture = wallColorTexture;
        material.roughness = 0.85;
        material.metallic = 0;
        configureMaterialForCommonLighting(material);
        material.metadata = material.metadata || {};
        material.metadata.uiName = colorData.label;
        material.metadata.wallColorName = colorData.name;
        material.metadata.wallColorTextureUrl = colorData.url;
        material.metadata.wallColorTexture = wallColorTexture;
        material.metadata.wallPaintSelector = true;

        wallColorMaterials[colorData.name] = material;

        var swatch = document.createElement("button");
        swatch.type = "button";
        swatch.className = "gallery-editor-swatch";
        swatch.title = colorData.label;
        swatch.setAttribute("data-color-name", colorData.name);

        swatch.style.backgroundImage = "url('" + colorData.url + "')";

        swatch.onpointerdown = function (event) {
            event.preventDefault();
            event.stopPropagation();

            deselectArtwork();

            selectedWallMaterial = material;

            Array.from(wallPalette.querySelectorAll("button")).forEach(function (item) {
                item.classList.remove("is-selected");
            });

            swatch.classList.add("is-selected");

            updateEditHelpStatus();
        };

        wallPalette.appendChild(swatch);
    });

    // STAGE 10A - WALL SEGMENT PAINTING
    // Po przejściu na Wall_segment_001 - Wall_segment_071 kolor/tekstura ściany
    // ma być nakładana tylko na kliknięty segment, a nie na wszystkie wallMeshes.
    function isPaintableWallSegmentMesh(mesh) {
        return !!(
            mesh &&
            mesh.name &&
            mesh.name.indexOf("Wall_segment_") === 0
        );
    }

    function normalizeWallColorName(colorName) {
        colorName = String(colorName || "").trim();

        if (colorName === "yellowish") {
            return "yellow";
        }

        if (colorName === "steel") {
            return "cyan";
        }

        return colorName;
    }

    function getWallPaintColorDataFromMaterial(material) {
        if (!material) {
            return null;
        }

        material.metadata = material.metadata || {};

        var colorName = normalizeWallColorName(
            material.metadata.wallColorName ||
            getWallColorNameFromMaterial(material)
        );

        if (!colorName) {
            return null;
        }

        var colorTexture =
            material.metadata.wallColorTexture ||
            material.albedoTexture ||
            material.diffuseTexture ||
            null;

        if (!colorTexture && material.metadata.wallColorTextureUrl) {
            colorTexture = new BABYLON.Texture(
                material.metadata.wallColorTextureUrl,
                scene
            );
            material.metadata.wallColorTexture = colorTexture;
        }

        return {
            name: colorName,
            texture: colorTexture,
            url: material.metadata.wallColorTextureUrl || null,
            label: material.metadata.uiName || colorName
        };
    }

    function getOrCreateWallSegmentPaintMaterial(wallMesh) {
        wallMesh.metadata = wallMesh.metadata || {};

        if (
            wallMesh.metadata.wallSegmentPaintMaterial &&
            !(wallMesh.metadata.wallSegmentPaintMaterial.isDisposed && wallMesh.metadata.wallSegmentPaintMaterial.isDisposed())
        ) {
            return wallMesh.metadata.wallSegmentPaintMaterial;
        }

        var sourceMaterial = wallMesh.material || null;
        var paintMaterial = null;

        if (sourceMaterial && sourceMaterial.clone) {
            paintMaterial = sourceMaterial.clone(
                wallMesh.name + "_BaseColorPaintMaterial"
            );
        }

        if (!paintMaterial) {
            paintMaterial = new BABYLON.PBRMaterial(
                wallMesh.name + "_BaseColorPaintMaterial",
                scene
            );
            paintMaterial.roughness = 0.85;
            paintMaterial.metallic = 0;
        }

        paintMaterial.metadata = Object.assign(
            {},
            sourceMaterial && sourceMaterial.metadata ? sourceMaterial.metadata : {},
            paintMaterial.metadata || {},
            {
                wallBaseColorOnlyPaintMaterial: true,
                wallSegmentSourceMaterialName: sourceMaterial && sourceMaterial.name
                    ? sourceMaterial.name
                    : ""
            }
        );

        wallMesh.metadata.wallSegmentBaseMaterialName = sourceMaterial && sourceMaterial.name
            ? sourceMaterial.name
            : "";
        wallMesh.metadata.wallSegmentPaintMaterial = paintMaterial;
        wallMesh.material = paintMaterial;

        return paintMaterial;
    }

    function applyWallBaseColorOnlyToMaterial(targetMaterial, colorData) {
        if (!targetMaterial || !colorData || !colorData.texture) {
            return false;
        }

        // STAGE 11J - WALL PAINT BASE COLOR ONLY FIX
        // Malowanie ściany nie może wymieniać całego materiału.
        // Zmieniamy tylko base color / albedo texture, a normal/roughness/metallic/AO zostają z modelu.
        if (targetMaterial.albedoTexture !== undefined) {
            targetMaterial.albedoTexture = colorData.texture;
        }

        if (targetMaterial.diffuseTexture !== undefined) {
            targetMaterial.diffuseTexture = colorData.texture;
        }

        if (targetMaterial.baseTexture !== undefined) {
            targetMaterial.baseTexture = colorData.texture;
        }

        if (targetMaterial.albedoColor) {
            targetMaterial.albedoColor = BABYLON.Color3.White();
        }

        if (targetMaterial.diffuseColor) {
            targetMaterial.diffuseColor = BABYLON.Color3.White();
        }

        targetMaterial.metadata = targetMaterial.metadata || {};
        targetMaterial.metadata.wallColorName = colorData.name;
        targetMaterial.metadata.uiName = colorData.label;
        targetMaterial.metadata.wallColorTextureUrl = colorData.url;
        targetMaterial.metadata.wallBaseColorOnlyPaintMaterial = true;

        return true;
    }

    function applyWallColorMaterialToSegment(wallMesh, material) {
        if (!wallMesh || !material || !isPaintableWallSegmentMesh(wallMesh)) {
            return false;
        }

        var colorData = getWallPaintColorDataFromMaterial(material);

        if (!colorData || !colorData.texture) {
            console.warn("Wall paint skipped: missing base color texture", {
                wall: wallMesh ? wallMesh.name : null,
                material: material ? material.name : null
            });
            return false;
        }

        var paintMaterial = getOrCreateWallSegmentPaintMaterial(wallMesh);

        if (!applyWallBaseColorOnlyToMaterial(paintMaterial, colorData)) {
            return false;
        }

        wallMesh.material = paintMaterial;
        wallMesh.metadata = wallMesh.metadata || {};
        wallMesh.metadata.wallSegmentColorName = colorData.name;
        wallMesh.metadata.wallSegmentPaintedAt = new Date().toISOString();
        wallMesh.metadata.wallSegmentPaintMode = "baseColorOnly";

        configureMeshMaterialForMainShadows(wallMesh);
        refreshCommonLightingMaterialSupport();
        updateEditHelpStatus();

        return true;
    }

    function getWallSegmentPaintDebug() {
        return wallMeshes.map(function (wallMesh) {
            return {
                name: wallMesh.name,
                paintable: isPaintableWallSegmentMesh(wallMesh),
                materialName: wallMesh.material ? wallMesh.material.name : null,
                colorName: getWallColorNameFromMaterial(wallMesh.material),
                segmentColorName: wallMesh.metadata
                    ? wallMesh.metadata.wallSegmentColorName || null
                    : null,
                paintMode: wallMesh.metadata
                    ? wallMesh.metadata.wallSegmentPaintMode || null
                    : null,
                baseMaterialName: wallMesh.metadata
                    ? wallMesh.metadata.wallSegmentBaseMaterialName || null
                    : null,
                hasNormalTexture: !!(wallMesh.material && (wallMesh.material.bumpTexture || wallMesh.material.normalTexture)),
                hasRoughnessTexture: !!(wallMesh.material && (wallMesh.material.metallicTexture || wallMesh.material.roughnessTexture)),
                hasAmbientTexture: !!(wallMesh.material && wallMesh.material.ambientTexture),
                albedoTextureUrl: wallMesh.material && wallMesh.material.albedoTexture
                    ? wallMesh.material.albedoTexture.url || null
                    : null
            };
        });
    }

    // STAGE 11K - VIEWER MODE HIDE EDITOR PLACEHOLDERS
    // Viewer / Observer Mode ma pokazywać finalną galerię, bez roboczych placeholderów.
    // Dla bezpieczeństwa nie wyłączamy meshów z grafu sceny.
    // Zmieniamy tylko widoczność i pickowanie meshów edytorskich.
    var viewerHideEmptyArtworkPlaceholders = true;
    var viewerHideLocalLightEditorMeshes = true;
    var viewerHideSculpturePlaceholders = true;
    var viewerPlaceholderVisibilityDebug = {
        emptyArtworksHidden: 0,
        localLightMeshesHidden: 0,
        spherePlaceholdersHidden: 0,
        mode: "viewer"
    };

    function isMeshSoftDeletedLocalLightEditorMesh(mesh) {
        return !!(
            mesh &&
            mesh.metadata &&
            mesh.metadata.softDeletedLocalLight
        );
    }

    function setEditorOnlyMeshVisible(mesh, shouldBeVisible, shouldBePickable) {
        if (!mesh) {
            return false;
        }

        if (isMeshSoftDeletedLocalLightEditorMesh(mesh)) {
            shouldBeVisible = false;
            shouldBePickable = false;
        }

        if (mesh.isVisible !== undefined) {
            mesh.isVisible = !!shouldBeVisible;
        }

        if (mesh.visibility !== undefined) {
            mesh.visibility = shouldBeVisible ? 1 : 0;
        }

        if (mesh.isPickable !== undefined) {
            mesh.isPickable = !!shouldBePickable;
        }

        mesh.metadata = mesh.metadata || {};
        mesh.metadata.viewerPlaceholderVisibilityManaged = true;

        return !shouldBeVisible;
    }

    function hasArtworkViewerImage(artwork) {
        if (!artwork || !artwork.metadata) {
            return false;
        }

        if (artwork.metadata.imagePlane && !(artwork.metadata.imagePlane.isDisposed && artwork.metadata.imagePlane.isDisposed())) {
            return true;
        }

        return !!getArtworkImageState(artwork);
    }

    function updateViewerModeArtworkPlaceholderVisibility() {
        var hiddenCount = 0;
        var active = typeof getActiveArtworks === "function"
            ? getActiveArtworks()
            : artworks;

        active.forEach(function (artwork) {
            if (!artwork) {
                return;
            }

            var showArtworkBox = editMode || !viewerHideEmptyArtworkPlaceholders || hasArtworkViewerImage(artwork);

            if (!showArtworkBox) {
                hiddenCount += 1;
            }

            setEditorOnlyMeshVisible(
                artwork,
                showArtworkBox,
                editMode || hasArtworkViewerImage(artwork)
            );

            if (artwork.metadata && artwork.metadata.imagePlane) {
                var imagePlane = artwork.metadata.imagePlane;

                if (imagePlane && !(imagePlane.isDisposed && imagePlane.isDisposed())) {
                    setEditorOnlyMeshVisible(
                        imagePlane,
                        !isArtworkDeleted(artwork),
                        true
                    );
                }
            }
        });

        viewerPlaceholderVisibilityDebug.emptyArtworksHidden = hiddenCount;
    }

    function setLocalLightEditorMeshVisibility(mesh, shouldBeVisible) {
        if (!mesh) {
            return 0;
        }

        var hidden = setEditorOnlyMeshVisible(
            mesh,
            shouldBeVisible,
            shouldBeVisible
        );

        return hidden ? 1 : 0;
    }

    function updateViewerModeLocalLightPlaceholderVisibility() {
        var hiddenCount = 0;

        localLightItems.forEach(function (item) {
            if (!item) {
                return;
            }

            // STAGE 12C2:
            // W Edit Mode pokazujemy tylko marker lampy/cube na suficie.
            // Helpery stożka/range/target są widoczne wyłącznie dla zaznaczonej lampy w Local Lights.
            var shouldShowMarker = editMode || !viewerHideLocalLightEditorMeshes;
            var shouldShowHelper = !!(
                editMode &&
                typeof isLocalLightsPanelActive === "function" &&
                isLocalLightsPanelActive() &&
                item.selected
            );

            if (!editMode && !viewerHideLocalLightEditorMeshes) {
                shouldShowHelper = true;
            }

            hiddenCount += setLocalLightEditorMeshVisibility(item.markerMesh, shouldShowMarker);
            hiddenCount += setLocalLightEditorMeshVisibility(item.helperMesh, shouldShowHelper);
            hiddenCount += setLocalLightEditorMeshVisibility(item.targetMesh, shouldShowHelper);
            hiddenCount += setLocalLightEditorMeshVisibility(item.rootNode, shouldShowHelper);

            if (item.helperMeshes && item.helperMeshes.length) {
                item.helperMeshes.forEach(function (helperMesh) {
                    hiddenCount += setLocalLightEditorMeshVisibility(helperMesh, shouldShowHelper);
                });
            }
        });

        viewerPlaceholderVisibilityDebug.localLightMeshesHidden = hiddenCount;
    }

    function updateViewerModeSpherePlaceholderVisibility() {
        var hiddenCount = 0;
        var shouldShow = editMode || !viewerHideSculpturePlaceholders;

        artSpheres.forEach(function (sphereMesh) {
            if (!sphereMesh) {
                return;
            }

            hiddenCount += setEditorOnlyMeshVisible(
                sphereMesh,
                shouldShow,
                shouldShow
            ) ? 1 : 0;

            if (sphereMesh.getChildMeshes) {
                sphereMesh.getChildMeshes(false).forEach(function (childMesh) {
                    hiddenCount += setEditorOnlyMeshVisible(
                        childMesh,
                        shouldShow,
                        false
                    ) ? 1 : 0;
                });
            }
        });

        viewerPlaceholderVisibilityDebug.spherePlaceholdersHidden = hiddenCount;
    }

    function updateViewerModePlaceholderVisibility() {
        viewerPlaceholderVisibilityDebug.mode = editMode ? "edit" : "viewer";

        updateViewerModeArtworkPlaceholderVisibility();
        updateViewerModeLocalLightPlaceholderVisibility();
        updateViewerModeSpherePlaceholderVisibility();
        updateModel3dSlotsVisibility();

        return Object.assign({}, viewerPlaceholderVisibilityDebug);
    }

    editButton.onclick = function (event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        if (galleryEditorLoginEnabled && !editorAuthenticated) {
            editMode = false;
            setEditorUiVisible(false);
            notifyGalleryStatus("Zaloguj sie jako edytor, aby otworzyc panel edycji.");
            return;
        }

        editMode = !editMode;

        if (editMode) {
            resetViewerWASDMovementRuntime(true);
            setEditorUiVisible(true);

            refreshMobileViewerMode();
            updateViewerCollisionMode();
            updateViewerModePlaceholderVisibility();
            setMobileViewerUiVisible(false);

            if (mobileViewerEnabled) {
                attachGalleryCameraControl();
            }

            updateEditHelpStatus();
            updateAlignmentPanel();
        } else {
            resetViewerWASDMovementRuntime(true);
            setEditorUiVisible(false);
            clearEditSelection();

            refreshMobileViewerMode();
            updateViewerCollisionMode();
            updateViewerModePlaceholderVisibility();

            if (mobileViewerEnabled) {
                camera.detachControl(canvas);
                setMobileViewerUiVisible(true);
            }
        }
    };

    setEditorUiVisible(false);

    function setEditorAuthenticated(isAuthenticated) {
        editorAuthenticated = !galleryEditorLoginEnabled || !!isAuthenticated;
        globalThis.galleryEditorAuthenticated = editorAuthenticated;
        window.galleryEditorAuthenticated = editorAuthenticated;

        if (document.body) {
            document.body.classList.toggle("is-editor-authenticated", editorAuthenticated);
        }

        if (editButton) {
            editButton.style.display = (!galleryEditorLoginEnabled || editorAuthenticated) ? "" : "none";
        }

        if (galleryEditorLoginEnabled && !editorAuthenticated && editMode) {
            editMode = false;
            resetViewerWASDMovementRuntime(true);
            setEditorUiVisible(false);
            clearEditSelection();

            refreshMobileViewerMode();
            updateViewerCollisionMode();
            updateViewerModePlaceholderVisibility();

            if (mobileViewerEnabled) {
                camera.detachControl(canvas);
                setMobileViewerUiVisible(true);
            }
        }
    }

    setEditorAuthenticated(editorAuthenticated);



    function getMobileResponsiveWidth() {
        var values = [];

        if (typeof window !== "undefined" && window.innerWidth) {
            values.push(window.innerWidth);
        }

        if (document.documentElement && document.documentElement.clientWidth) {
            values.push(document.documentElement.clientWidth);
        }

        if (canvas) {
            var canvasRect = canvas.getBoundingClientRect();

            if (canvasRect && canvasRect.width) {
                values.push(canvasRect.width);
            }

            if (canvas.clientWidth) {
                values.push(canvas.clientWidth);
            }
        }

        if (scene && scene.getEngine && scene.getEngine()) {
            var renderWidth = scene.getEngine().getRenderWidth();

            if (renderWidth) {
                values.push(renderWidth);
            }
        }

        if (!values.length) {
            return window.innerWidth || 9999;
        }

        return Math.min.apply(null, values);
    }

    function shouldUseMobileViewerMode() {
        return getMobileResponsiveWidth() <= mobileViewerBreakpoint;
    }

    function refreshMobileViewerMode() {
        var shouldEnable = shouldUseMobileViewerMode();

        if (shouldEnable === mobileViewerEnabled) {
            setMobileViewerUiVisible(isMobileViewerActive());
            return;
        }

        mobileViewerEnabled = shouldEnable;

        if (mobileViewerEnabled) {
            canvas.style.touchAction = "none";

            if (!editMode) {
                camera.detachControl(canvas);
                setMobileViewerUiVisible(true);
            } else {
                setMobileViewerUiVisible(false);
            }

            if (!mobileStartCameraApplied && assetsLoaded >= assetsToLoad) {
                setMobileStartCameraPosition();
            }
        } else {
            resetMobileJoystick();

            mobileLookActive = false;
            mobileLookPointerId = null;
            mobileFocusActive = false;

            setMobileViewerUiVisible(false);
            canvas.style.touchAction = "";

            if (!editMode) {
                attachGalleryCameraControl();
            }
        }
    }

    function isMobileViewerActive() {
        return mobileViewerEnabled && !editMode;
    }

    function setMobileViewerUiVisible(isVisible) {
        if (!mobileViewerControls) {
            return;
        }

        mobileViewerControls.style.display = isVisible ? "block" : "none";
    }

    function updateMobileBackButton() {
        // Przyciski mobilne Wroc/Reset zostaly usuniete z UI.
        // Funkcja zostaje jako bezpieczny no-op dla logiki focusu.
    }

    function resetMobileJoystick() {
        mobileJoystickActive = false;
        mobileJoystickPointerId = null;
        mobileJoystickVector.x = 0;
        mobileJoystickVector.y = 0;

        if (mobileJoystickKnob) {
            mobileJoystickKnob.style.transform = "translate(-50%, -50%)";
        }
    }

    function updateMobileFloorBounds() {
        if (!floorMeshes || floorMeshes.length === 0) {
            mobileFloorBounds = null;
            return;
        }

        var minX = Infinity;
        var maxX = -Infinity;
        var minZ = Infinity;
        var maxZ = -Infinity;

        floorMeshes.forEach(function (mesh) {
            mesh.computeWorldMatrix(true);

            var boundingInfo = mesh.getBoundingInfo();
            var minimum = boundingInfo.boundingBox.minimumWorld;
            var maximum = boundingInfo.boundingBox.maximumWorld;

            minX = Math.min(minX, minimum.x);
            maxX = Math.max(maxX, maximum.x);
            minZ = Math.min(minZ, minimum.z);
            maxZ = Math.max(maxZ, maximum.z);
        });

        if (
            isFinite(minX) &&
            isFinite(maxX) &&
            isFinite(minZ) &&
            isFinite(maxZ)
        ) {
            mobileFloorBounds = {
                minX: minX,
                maxX: maxX,
                minZ: minZ,
                maxZ: maxZ
            };
        }
    }

    function isMobileCameraPositionOnFloor(candidatePosition) {
        if (!floorMeshes || floorMeshes.length === 0) {
            return true;
        }

        if (mobileFloorBounds) {
            var margin = 0.22;

            if (
                candidatePosition.x < mobileFloorBounds.minX + margin ||
                candidatePosition.x > mobileFloorBounds.maxX - margin ||
                candidatePosition.z < mobileFloorBounds.minZ + margin ||
                candidatePosition.z > mobileFloorBounds.maxZ - margin
            ) {
                return false;
            }
        }

        var rayOrigin = new BABYLON.Vector3(
            candidatePosition.x,
            candidatePosition.y + 4,
            candidatePosition.z
        );

        var ray = new BABYLON.Ray(
            rayOrigin,
            new BABYLON.Vector3(0, -1, 0),
            mobileFloorRayLength
        );

        var hit = scene.pickWithRay(
            ray,
            function (mesh) {
                return floorMeshes.includes(mesh);
            }
        );

        return !!(hit && hit.hit);
    }

    function setMobileStartCameraPosition() {
        // Mobile nie ma osobnej pozycji startowej.
        // Zapamietuje aktualna pozycje i rotacje kamery, czyli te same ustawienia,
        // ktore dostaje wersja desktopowa.
        mobileInitialCameraPosition = camera.position.clone();
        mobileInitialCameraRotation = camera.rotation.clone();
        mobileStartCameraApplied = true;
    }

    function getMobileArtworkFocusDistance(artwork) {
        // Na pionowym ekranie telefon ma waski kadr, dlatego dystans do obrazu
        // musi byc wiekszy niz na desktopie. Liczymy go z rozmiaru obiektu i FOV kamery.
        var fallbackDistance = 5.4;

        if (!artwork || !artwork.getBoundingInfo) {
            return fallbackDistance;
        }

        artwork.computeWorldMatrix(true);

        var boundingInfo = artwork.getBoundingInfo();
        var radius = boundingInfo.boundingSphere.radiusWorld || 1.4;

        var renderWidth = scene.getEngine().getRenderWidth();
        var renderHeight = scene.getEngine().getRenderHeight();
        var aspect = renderHeight > 0 ? renderWidth / renderHeight : 1;

        var verticalFov = camera.fov || 0.8;
        var horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
        var limitingFov = Math.max(0.24, Math.min(verticalFov, horizontalFov));

        var distance = radius / Math.sin(limitingFov / 2) * 1.04;

        return BABYLON.Scalar.Clamp(distance, 4.2, 6.4);
    }

    function updateMobileJoystickFromPointer(event) {
        if (!mobileJoystickBase || !mobileJoystickKnob) {
            return;
        }

        var rect = mobileJoystickBase.getBoundingClientRect();
        var centerX = rect.left + rect.width / 2;
        var centerY = rect.top + rect.height / 2;
        var maxDistance = rect.width * 0.34;

        var dx = event.clientX - centerX;
        var dy = event.clientY - centerY;

        var distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > maxDistance && distance > 0) {
            dx = dx / distance * maxDistance;
            dy = dy / distance * maxDistance;
        }

        mobileJoystickVector.x = dx / maxDistance;
        mobileJoystickVector.y = dy / maxDistance;

        mobileJoystickKnob.style.transform =
            "translate(calc(-50% + " + dx + "px), calc(-50% + " + dy + "px))";
    }

    function updateMobileJoystickMovement() {
        // STAGE 12C3:
        // Ruch joysticka jest obsługiwany w updateViewerWASDMovement().
        // Y = przód/tył, X = obrót kamery. X nie robi już strafe.
    }


    // STAGE 12C1 - VIEWER WASD / MOBILE JOYSTICK GROUNDED WALK
    function viewerMovementExpBlend(rate, dt) {
        return 1 - Math.exp(-Math.max(0.001, rate) * dt);
    }

    function viewerMovementClamp01(value) {
        return Math.max(0, Math.min(1, value));
    }

    function viewerMovementSmoothstep(value) {
        value = viewerMovementClamp01(value);
        return value * value * (3 - 2 * value);
    }

    function clearViewerWASDMoveKeys() {
        viewerMoveKeys.w = false;
        viewerMoveKeys.a = false;
        viewerMoveKeys.s = false;
        viewerMoveKeys.d = false;
        viewerMoveKeys.shift = false;
    }

    function clearViewerWASDVisualOffsets() {
        if (!camera) {
            return;
        }

        if (viewerMovementVisualOffset.lengthSquared() > 0.0000001) {
            camera.position.subtractInPlace(viewerMovementVisualOffset);
            viewerMovementVisualOffset.set(0, 0, 0);
        }

        if (Math.abs(viewerMovementVisualPitchOffset) > 0.0000001) {
            camera.rotation.x -= viewerMovementVisualPitchOffset;
            viewerMovementVisualPitchOffset = 0;
        }

        if (Math.abs(viewerMovementVisualRollOffset) > 0.0000001) {
            camera.rotation.z -= viewerMovementVisualRollOffset;
            viewerMovementVisualRollOffset = 0;
        }

        // STAGE 12C2:
        // Viewer ma trzymać horyzont. Poprzedni visual roll potrafił zostawić kadr pod skosem,
        // a start chodzenia prostował kamerę skokiem.
        if (
            viewerCameraRollLockEnabled &&
            !editMode &&
            Math.abs(camera.rotation.z) > 0.000001
        ) {
            camera.rotation.z = 0;
        }
    }

    function resetViewerWASDMovementRuntime(clearKeys) {
        clearViewerWASDVisualOffsets();

        viewerMovementVelocity.set(0, 0, 0);
        viewerMovementCurrentSpeed01 = 0;
        viewerMovementTargetSpeed01 = 0;
        viewerMovementStepTimer = 0;
        viewerMovementLastHadInput = false;
        viewerMovementStopSettleTimer = 999;
        viewerMovementStopBounceSpeed01 = 0;
        viewerMovementWasManualInputActive = false;

        if (clearKeys) {
            clearViewerWASDMoveKeys();
        }
    }

    function isViewerWASDMovementActive() {
        return !!(
            viewerWASDMovementEnabled &&
            !editMode &&
            !isDraggingArtwork &&
            !isDraggingSphere
        );
    }

    function getViewerMovementForwardFlat() {
        var forward = camera.getDirection(new BABYLON.Vector3(0, 0, 1));
        forward.y = 0;

        if (forward.lengthSquared() > 0.00001) {
            forward.normalize();
        }

        return forward;
    }

    function getViewerMovementRightFlat() {
        var right = camera.getDirection(new BABYLON.Vector3(1, 0, 0));
        right.y = 0;

        if (right.lengthSquared() > 0.00001) {
            right.normalize();
        }

        return right;
    }

    function getViewerWASDInputState() {
        var x = 0;
        var z = 0;
        var analog = false;

        if (isMobileViewerActive() && mobileJoystickActive) {
            var deadZone = viewerMovementConfig.joystickDeadZone || 0.08;
            var joystickZ = Math.abs(mobileJoystickVector.y) >= deadZone ? -mobileJoystickVector.y : 0;

            // STAGE 12C3:
            // Mobile joystick X wraca do obrotu kamery.
            // Nie dodajemy go do x/strafe, bo to psuło poprzedni feeling mobile.
            x += 0;
            z += joystickZ;
            analog = true;
        } else {
            if (viewerMoveKeys.d) {
                x += 1;
            }

            if (viewerMoveKeys.a) {
                x -= 1;
            }

            if (viewerMoveKeys.w) {
                z += 1;
            }

            if (viewerMoveKeys.s) {
                z -= 1;
            }
        }

        var magnitude = Math.sqrt(x * x + z * z);

        if (magnitude > 1) {
            x /= magnitude;
            z /= magnitude;
            magnitude = 1;
        }

        if (magnitude <= 0.0001) {
            return {
                hasInput: false,
                analog: analog,
                magnitude: 0,
                direction: BABYLON.Vector3.Zero(),
                rawX: 0,
                rawZ: 0
            };
        }

        var forward = getViewerMovementForwardFlat();
        var right = getViewerMovementRightFlat();
        var direction = forward.scale(z).add(right.scale(x));
        direction.y = 0;

        if (direction.lengthSquared() > 0.00001) {
            direction.normalize();
        }

        return {
            hasInput: true,
            analog: analog,
            magnitude: magnitude,
            direction: direction,
            rawX: x,
            rawZ: z
        };
    }

    function updateViewerMovementSpeedFactor(inputState, dt) {
        var hasInput = inputState && inputState.hasInput;
        var target = hasInput ? inputState.magnitude : 0;
        viewerMovementTargetSpeed01 = target;

        var rate = hasInput
            ? 1 / Math.max(0.001, viewerMovementConfig.inputRampTime || 0.105)
            : viewerMovementConfig.braking || 35.0;

        viewerMovementCurrentSpeed01 +=
            (viewerMovementTargetSpeed01 - viewerMovementCurrentSpeed01) *
            viewerMovementExpBlend(rate, dt);

        viewerMovementCurrentSpeed01 = viewerMovementClamp01(viewerMovementCurrentSpeed01);

        if (
            hasInput &&
            !inputState.analog &&
            inputState.magnitude > 0.95
        ) {
            viewerMovementCurrentSpeed01 = Math.max(
                viewerMovementCurrentSpeed01,
                viewerMovementConfig.inputStartStrength || 0.91
            );
        }

        return viewerMovementSmoothstep(viewerMovementCurrentSpeed01);
    }

    function updateViewerMovementStopSettle(dt, hasInput, speedBeforeStop) {
        if (viewerMovementLastHadInput && !hasInput) {
            viewerMovementStopSettleTimer = 0;
            viewerMovementStopBounceSpeed01 = Math.min(
                1,
                speedBeforeStop / Math.max(0.001, viewerMovementConfig.speed || 3.58)
            );

            if (viewerMovementLastMoveDirection.lengthSquared() > 0.00001) {
                viewerMovementStopBounceDirection.copyFrom(viewerMovementLastMoveDirection);
                viewerMovementStopBounceDirection.normalize();
            }
        }

        viewerMovementLastHadInput = hasInput;

        var settleDuration = viewerMovementConfig.stopSettleDuration || 0.10;
        var bounceDuration = viewerMovementConfig.stopBounceDuration || 0.23;
        var duration = Math.max(settleDuration, bounceDuration);

        if (viewerMovementStopSettleTimer > duration) {
            return {
                pitch: 0,
                positionOffset: BABYLON.Vector3.Zero()
            };
        }

        viewerMovementStopSettleTimer += dt;

        var settlePitch = 0;

        if (settleDuration > 0 && viewerMovementStopSettleTimer <= settleDuration) {
            var tSettle = viewerMovementClamp01(viewerMovementStopSettleTimer / settleDuration);
            var settleWave = Math.sin(tSettle * Math.PI);
            var settleDecay = Math.pow(1 - tSettle, 1.4);

            settlePitch = -settleWave * settleDecay * (viewerMovementConfig.stopSettlePitch || 0.0009);
        }

        var bouncePitch = 0;
        var bounceOffset = BABYLON.Vector3.Zero();

        if (bounceDuration > 0 && viewerMovementStopSettleTimer <= bounceDuration) {
            var tBounce = viewerMovementClamp01(viewerMovementStopSettleTimer / bounceDuration);
            var frequency = viewerMovementConfig.stopBounceFrequency || 0.66;
            var wave = Math.sin(tBounce * Math.PI * 2 * frequency);
            var decay = Math.pow(1 - tBounce, 2.15);
            var amount = wave * decay * (0.45 + viewerMovementStopBounceSpeed01 * 0.55);

            bounceOffset = viewerMovementStopBounceDirection.scale(
                amount * (viewerMovementConfig.stopBounceDistance || 0.032)
            );
            bouncePitch = -amount * (viewerMovementConfig.stopBouncePitch || 0.0044);
        }

        return {
            pitch: settlePitch + bouncePitch,
            positionOffset: bounceOffset
        };
    }

    function getViewerMovementStepVisual(dt, hasInput, speedMagnitude) {
        var speed01 = Math.min(1, speedMagnitude / Math.max(0.001, viewerMovementConfig.speed || 3.58));

        if (hasInput && speed01 > 0.04) {
            viewerMovementStepTimer += dt *
                (viewerMovementConfig.stepFrequency || 1.12) *
                (0.75 + speed01 * 0.35);
        } else {
            viewerMovementStepTimer += dt * 0.4;
        }

        var phase = viewerMovementStepTimer * Math.PI * 2;
        var up = Math.abs(Math.sin(phase));
        var compression = Math.pow(Math.max(0, Math.sin(phase + Math.PI * 0.35)), 2);

        var height =
            up * (viewerMovementConfig.bobHeight || 0.0078) * speed01 -
            compression * (viewerMovementConfig.compression || 0.0054) * speed01;

        var pitch =
            Math.sin(phase + Math.PI * 0.2) *
            (viewerMovementConfig.pitchAmount || 0.0017) *
            speed01;

        var roll =
            Math.sin(phase * 0.5) *
            (viewerMovementConfig.rollAmount || 0.0016) *
            speed01;

        return {
            height: height,
            pitch: pitch,
            roll: roll
        };
    }

    function applyViewerMovementVisualOffsets(offset, pitch, roll) {
        clearViewerWASDVisualOffsets();

        viewerMovementVisualOffset.copyFrom(offset || BABYLON.Vector3.Zero());
        viewerMovementVisualPitchOffset = pitch || 0;
        viewerMovementVisualRollOffset = roll || 0;

        if (viewerMovementVisualOffset.lengthSquared() > 0.0000001) {
            camera.position.addInPlace(viewerMovementVisualOffset);
        }

        if (Math.abs(viewerMovementVisualPitchOffset) > 0.0000001) {
            camera.rotation.x += viewerMovementVisualPitchOffset;
        }

        if (Math.abs(viewerMovementVisualRollOffset) > 0.0000001) {
            camera.rotation.z += viewerMovementVisualRollOffset;
        }
    }

    function moveViewerCameraWithGroundedCollision(deltaVector) {
        if (!deltaVector || deltaVector.lengthSquared() <= 0.0000001) {
            return false;
        }

        var beforeMove = camera.position.clone();
        var candidatePosition = camera.position.add(deltaVector);

        if (isMobileViewerActive() && !isMobileCameraPositionOnFloor(candidatePosition)) {
            viewerMovementVelocity.set(0, 0, 0);
            return false;
        }

        moveCameraWithViewerCollisionIfActive(deltaVector);

        if (isMobileViewerActive() && !isMobileCameraPositionOnFloor(camera.position)) {
            camera.position.copyFrom(beforeMove);
            viewerMovementVelocity.set(0, 0, 0);
            return false;
        }

        return true;
    }

    function updateViewerMobileJoystickTurn(dt) {
        if (
            !viewerMovementMobileJoystickTurnEnabled ||
            !isMobileViewerActive() ||
            !mobileJoystickActive ||
            editMode ||
            !camera
        ) {
            return false;
        }

        var turnInput = mobileJoystickVector.x || 0;

        if (Math.abs(turnInput) < viewerMovementMobileJoystickTurnDeadZone) {
            return false;
        }

        // STAGE 12C3:
        // Stary mobile feeling: joystick w lewo/prawo obraca kamerę.
        // Nie ma bocznego dryfu i nie ma A/D strafe na mobile.
        clearViewerWASDVisualOffsets();
        scene.stopAnimation(camera);
        camera.rotation.y += turnInput * viewerMovementMobileJoystickTurnSpeed * dt;
        camera.rotation.z = 0;

        return true;
    }

    function updateViewerWASDMovement() {
        clearViewerWASDVisualOffsets();

        var dt = scene.getEngine().getDeltaTime() / 1000;
        dt = Math.min(0.05, Math.max(0.001, dt));

        if (!isViewerWASDMovementActive()) {
            resetViewerWASDMovementRuntime(false);
            return;
        }

        var mobileJoystickTurnActive = updateViewerMobileJoystickTurn(dt);

        var inputState = getViewerWASDInputState();
        var hasInput = inputState.hasInput;
        var speedBeforeStop = viewerMovementVelocity.length();

        if (hasInput && inputState.direction.lengthSquared() > 0.00001) {
            viewerMovementLastMoveDirection.copyFrom(inputState.direction);
            viewerMovementLastMoveDirection.normalize();
        }

        if ((hasInput || mobileJoystickTurnActive) && !viewerMovementWasManualInputActive) {
            scene.stopAnimation(camera);
        }

        viewerMovementWasManualInputActive = hasInput || mobileJoystickTurnActive;

        var speedFactor = updateViewerMovementSpeedFactor(inputState, dt);
        var speed = viewerMovementConfig.speed || 3.58;

        if (viewerMoveKeys.shift && !isMobileViewerActive()) {
            speed *= viewerMovementConfig.sprintMultiplier || 1.22;
        }

        var desiredVelocity = hasInput
            ? inputState.direction.scale(speed * speedFactor)
            : BABYLON.Vector3.Zero();

        var blend = viewerMovementExpBlend(
            hasInput ? viewerMovementConfig.acceleration : viewerMovementConfig.braking,
            dt
        );

        viewerMovementVelocity.x += (desiredVelocity.x - viewerMovementVelocity.x) * blend;
        viewerMovementVelocity.z += (desiredVelocity.z - viewerMovementVelocity.z) * blend;

        if (
            !hasInput ||
            Math.abs(inputState.rawX) < 0.001 ||
            isMobileViewerActive()
        ) {
            var right = getViewerMovementRightFlat();
            var lateral = BABYLON.Vector3.Dot(viewerMovementVelocity, right);
            var sideBlend = viewerMovementExpBlend(viewerMovementConfig.sideFriction || 43.0, dt);
            viewerMovementVelocity.subtractInPlace(right.scale(lateral * sideBlend));
        }

        if (!hasInput && viewerMovementVelocity.length() < (viewerMovementConfig.snapStopSpeed || 0.037)) {
            viewerMovementVelocity.set(0, 0, 0);
        }

        var movementDelta = viewerMovementVelocity.scale(dt);
        moveViewerCameraWithGroundedCollision(movementDelta);

        var step = getViewerMovementStepVisual(dt, hasInput, viewerMovementVelocity.length());
        var stopSettle = updateViewerMovementStopSettle(dt, hasInput, speedBeforeStop);

        var visualOffset = new BABYLON.Vector3(
            stopSettle.positionOffset.x,
            step.height,
            stopSettle.positionOffset.z
        );

        applyViewerMovementVisualOffsets(
            visualOffset,
            step.pitch + stopSettle.pitch,
            0
        );
    }

    function beginMobileCanvasLook(event) {
        if (!isMobileViewerActive()) {
            return false;
        }

        if (event.target && event.target.closest && event.target.closest("#mobileViewerControls")) {
            return false;
        }

        mobileLookActive = true;
        mobileLookPointerId = event.pointerId;
        mobileLookStartX = event.clientX;
        mobileLookStartY = event.clientY;
        mobileLookLastX = event.clientX;
        mobileLookLastY = event.clientY;
        mobileLookMoved = false;

        return true;
    }

    function updateMobileCanvasLook(event) {
        if (!mobileLookActive) {
            return false;
        }

        if (mobileLookPointerId !== null && event.pointerId !== mobileLookPointerId) {
            return false;
        }

        var totalDx = event.clientX - mobileLookStartX;
        var totalDy = event.clientY - mobileLookStartY;

        if (
            Math.abs(totalDx) > mobileTapMoveThreshold ||
            Math.abs(totalDy) > mobileTapMoveThreshold
        ) {
            mobileLookMoved = true;
        }

        var dx = event.clientX - mobileLookLastX;
        var dy = event.clientY - mobileLookLastY;

        mobileLookLastX = event.clientX;
        mobileLookLastY = event.clientY;

        if (mobileLookMoved) {
            // STAGE 12C2:
            // Obrót na mobile też trzyma horyzont. Bez zostawiania kadru pod skosem.
            if (!editMode && typeof clearViewerWASDVisualOffsets === "function") {
                clearViewerWASDVisualOffsets();
                camera.rotation.z = 0;
            }

            camera.rotation.y += dx * mobileLookSensitivityX;
            camera.rotation.x += dy * mobileLookSensitivityY;

            camera.rotation.x = BABYLON.Scalar.Clamp(
                camera.rotation.x,
                -0.58,
                0.58
            );

            camera.rotation.z = 0;
        }

        return true;
    }

    function handleMobileViewerTap(event) {
        if (!isMobileViewerActive()) {
            return;
        }

        var pickResult = scene.pick(
            scene.pointerX,
            scene.pointerY
        );

        if (!pickResult || !pickResult.hit || !pickResult.pickedMesh) {
            return;
        }

        if (artworks.includes(pickResult.pickedMesh)) {
            focusCameraOnObject(pickResult.pickedMesh);
            return;
        }

        if (artSpheres.includes(pickResult.pickedMesh)) {
            focusCameraOnObject(pickResult.pickedMesh);
            return;
        }

        // Podloga na mobile nie wykonuje juz skoku kamery.
        // Chodzenie jest tylko z joysticka, a ekran sluzy do obrotu kamery.
    }

    function endMobileCanvasLook(event) {
        if (!mobileLookActive) {
            return false;
        }

        if (mobileLookPointerId !== null && event.pointerId !== mobileLookPointerId) {
            return false;
        }

        var wasTap = !mobileLookMoved;

        mobileLookActive = false;
        mobileLookPointerId = null;

        if (wasTap) {
            handleMobileViewerTap(event);
        }

        return true;
    }

    function animateMobileCameraTo(targetPosition, targetRotation, frames) {
        var easing = new BABYLON.CubicEase();
        easing.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);

        BABYLON.Animation.CreateAndStartAnimation(
            "mobileCameraMove",
            camera,
            "position",
            60,
            frames || 60,
            camera.position.clone(),
            targetPosition.clone(),
            BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT,
            easing
        );

        BABYLON.Animation.CreateAndStartAnimation(
            "mobileCameraRotate",
            camera,
            "rotation",
            60,
            frames || 60,
            camera.rotation.clone(),
            targetRotation.clone(),
            BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT,
            easing
        );
    }

    function enterMobileFocusState() {
        if (!isMobileViewerActive()) {
            return;
        }

        if (!mobileFocusActive) {
            mobilePreviousCameraPosition = camera.position.clone();
            mobilePreviousCameraRotation = camera.rotation.clone();
        }

        mobileFocusActive = true;
        updateMobileBackButton();
    }

    function exitMobileFocusView() {
        if (!mobileFocusActive || !mobilePreviousCameraPosition || !mobilePreviousCameraRotation) {
            mobileFocusActive = false;
            updateMobileBackButton();
            return;
        }

        animateMobileCameraTo(
            mobilePreviousCameraPosition,
            mobilePreviousCameraRotation,
            55
        );

        mobileFocusActive = false;
        updateMobileBackButton();
    }

    function resetMobileCameraView() {
        mobileFocusActive = false;
        mobilePreviousCameraPosition = null;
        mobilePreviousCameraRotation = null;

        updateMobileBackButton();

        animateMobileCameraTo(
            mobileInitialCameraPosition,
            mobileInitialCameraRotation,
            65
        );
    }

    function createMobileViewerUi() {
        var oldMobileControls = document.getElementById("mobileViewerControls");

        if (oldMobileControls) {
            oldMobileControls.remove();
        }

        var oldMobileStyle = document.getElementById("mobileViewerStyle");

        if (oldMobileStyle) {
            oldMobileStyle.remove();
        }

        var mobileStyle = document.createElement("style");
        mobileStyle.id = "mobileViewerStyle";

        mobileStyle.innerHTML = `
            #mobileViewerControls {
                position: absolute;
                inset: 0;
                /* Header strony ma z-index 8000, więc mobile UI galerii musi zostać niżej. */
                z-index: 7000;
                pointer-events: none;
                display: none;
                font-family: Arial, sans-serif;
                user-select: none;
                -webkit-user-select: none;
                touch-action: none;
            }

            #mobileJoystickBase {
                position: absolute;
                left: 22px;
                bottom: 28px;
                width: 108px;
                height: 108px;
                border-radius: 999px;
                border: 1px solid rgba(255, 255, 255, 0.42);
                background: rgba(0, 0, 0, 0.28);
                box-shadow: 0 0 26px rgba(0, 0, 0, 0.22);
                backdrop-filter: blur(8px);
                pointer-events: auto;
                touch-action: none;
            }

            #mobileJoystickKnob {
                position: absolute;
                left: 50%;
                top: 50%;
                width: 40px;
                height: 40px;
                border-radius: 999px;
                background: rgba(255, 255, 255, 0.78);
                box-shadow: 0 0 20px rgba(255, 255, 255, 0.18);
                transform: translate(-50%, -50%);
                pointer-events: none;
            }
        `;

        document.head.appendChild(mobileStyle);

        mobileViewerControls = document.createElement("div");
        mobileViewerControls.id = "mobileViewerControls";
        mobileViewerControls.style.touchAction = "none";
        mobileViewerControls.style.overscrollBehavior = "none";

        mobileJoystickBase = document.createElement("div");
        mobileJoystickBase.id = "mobileJoystickBase";

        mobileJoystickKnob = document.createElement("div");
        mobileJoystickKnob.id = "mobileJoystickKnob";

        mobileJoystickBase.appendChild(mobileJoystickKnob);

        mobileViewerControls.appendChild(mobileJoystickBase);

        appendGalleryUiElement(mobileViewerControls);

        mobileJoystickBase.addEventListener("pointerdown", function (event) {
            if (!isMobileViewerActive()) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            mobileJoystickActive = true;
            mobileJoystickPointerId = event.pointerId;
            mobileJoystickBase.setPointerCapture(event.pointerId);

            updateMobileJoystickFromPointer(event);
        });

        mobileJoystickBase.addEventListener("pointermove", function (event) {
            if (!mobileJoystickActive || event.pointerId !== mobileJoystickPointerId) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            updateMobileJoystickFromPointer(event);
        });

        function endJoystick(event) {
            if (mobileJoystickPointerId !== null && event.pointerId !== mobileJoystickPointerId) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            resetMobileJoystick();
        }

        mobileJoystickBase.addEventListener("pointerup", endJoystick);
        mobileJoystickBase.addEventListener("pointercancel", endJoystick);
        mobileJoystickBase.addEventListener("lostpointercapture", function () {
            resetMobileJoystick();
        });

        updateMobileBackButton();
        setMobileViewerUiVisible(isMobileViewerActive());
    }

    ensureGalleryScrollLockStyles();
    setupGalleryScrollContainment();

    function setupMobileViewerControls() {
        createMobileViewerUi();

        scene.onBeforeRenderObservable.add(function () {
            updateViewerWASDMovement();
        });

        window.addEventListener("resize", function () {
            refreshMobileViewerMode();
        });

        if (scene && scene.getEngine && scene.getEngine().onResizeObservable) {
            scene.getEngine().onResizeObservable.add(function () {
                refreshMobileViewerMode();
            });
        }

        // Pierwsze sprawdzenie po utworzeniu UI.
        refreshMobileViewerMode();

        // Drugie sprawdzenie po chwili pomaga w silnikach/podgladach,
        // gdzie canvas dostaje docelowy rozmiar dopiero po pierwszym renderze.
        setTimeout(function () {
            refreshMobileViewerMode();
        }, 150);
    }

    setupMobileViewerControls();

    scene.onBeforeRenderObservable.add(function () {
        resolveViewerWallCollisionAfterMovement();
    });

    scene.onBeforeRenderObservable.add(function () {
        updateLocalLightsCameraCulling(false);
    });


    scene.onBeforeRenderObservable.add(function () {
        updateArtworkInfoPopup();
    });



    function updateModel3dSlotUi() {
        if (!model3dSectionData || !model3dSectionData.section) {
            return;
        }

        var slot = selectedSphere || null;
        var isVisible = !!(editMode && slot);
        var modelState = getModel3dState(slot);

        model3dSectionData.section.classList.toggle("is-hidden", !isVisible);

        if (model3dStatus) {
            if (slot && modelState) {
                model3dStatus.innerHTML = "Slot: <strong>" + slot.name + "</strong><br>Model: <strong>" + (modelState.originalName || "GLB") + "</strong>";
            } else if (slot) {
                model3dStatus.innerHTML = "Slot: <strong>" + slot.name + "</strong><br>Model: <strong>None</strong>";
            } else {
                model3dStatus.innerHTML = "Model: <strong>None</strong>";
            }
        }

        if (model3dUrlInput) {
            model3dUrlInput.value = modelState ? modelState.modelUrl || "" : "";
            model3dUrlInput.disabled = !isVisible;
        }

        [
            model3dUploadButton,
            model3dApplyUrlButton,
            model3dRemoveButton,
            model3dDuplicateButton,
            model3dCopyButton,
            model3dPasteButton
        ].forEach(function (button) {
            if (button) {
                button.disabled = !isVisible;
            }
        });

        if (model3dRemoveButton) {
            model3dRemoveButton.disabled = !isVisible || !modelState;
        }

        if (model3dCopyButton) {
            model3dCopyButton.disabled = !isVisible || !modelState;
        }

        if (model3dPasteButton) {
            model3dPasteButton.disabled = !isVisible || !galleryModel3dClipboardState;
        }
    }

    model3dUploadButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();

        if (!selectedSphere) {
            notifyGalleryStatus("Zaznacz slot modelu 3D.");
            return;
        }

        model3dFileInput.value = "";
        model3dFileInput.click();
    };

    model3dFileInput.onchange = function () {
        var file = model3dFileInput.files && model3dFileInput.files[0]
            ? model3dFileInput.files[0]
            : null;

        if (!file || !selectedSphere) {
            return;
        }

        uploadModel3dToSlot(selectedSphere, file)
            .then(function (ok) {
                if (ok) {
                    return saveGalleryStateToSupabase();
                }

                return false;
            })
            .catch(function (error) {
                console.warn("3D model upload UI error:", error);
                notifyGalleryStatus("Upload modelu 3D nieudany.");
            })
            .finally(function () {
                updateModel3dSlotUi();
                model3dFileInput.value = "";
            });
    };

    model3dApplyUrlButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();

        if (!selectedSphere) {
            notifyGalleryStatus("Zaznacz slot modelu 3D.");
            return;
        }

        var modelUrl = model3dUrlInput.value.trim();

        if (!modelUrl) {
            notifyGalleryStatus("Wklej URL do pliku GLB.");
            return;
        }

        var modelState = createModel3dStateFromUrl(selectedSphere, modelUrl);

        applyModel3dStateToSlot(selectedSphere, modelState)
            .then(function (ok) {
                if (ok) {
                    notifyGalleryStatus("Model przypisany z URL. Zapisz stan galerii.");
                    return saveGalleryStateToSupabase();
                }

                return false;
            })
            .catch(function (error) {
                console.warn("Apply 3D model URL error:", error);
                notifyGalleryStatus("Nie udalo sie przypisac modelu z URL.");
            });
    };

    model3dRemoveButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();

        if (!selectedSphere) {
            return;
        }

        removeModel3dFromSlot(selectedSphere);
        saveGalleryStateToSupabase();
    };

    model3dDuplicateButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();

        duplicateSelectedModel3dSlot();
        saveGalleryStateToSupabase();
    };

    model3dCopyButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();

        copySelectedModel3dToClipboard();
    };

    model3dPasteButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();

        pasteModel3dFromClipboardToSelectedSlot();
        saveGalleryStateToSupabase();
    };

    function updateEditHelpStatus() {

        var selectedStatus = document.getElementById("editorSelectedArtworkStatus");
        var countStatus = document.getElementById("editorSelectedArtworkCountStatus");
        var colorStatus = document.getElementById("editorSelectedWallColorStatus");

        if (selectedStatus) {
            var selectedLabel = "None";

            if (activeModel3dSlot) {
                selectedLabel = "Sculpture: " + activeModel3dSlot.name;
            } else if (selectedArtworks.length === 1 && selectedArtworks[0]) {
                selectedLabel = selectedArtworks[0].name;
            } else if (selectedArtworks.length > 1 && primaryArtwork) {
                selectedLabel = primaryArtwork.name + " + " + (selectedArtworks.length - 1);
            }

            selectedStatus.innerText = "Selected: " + selectedLabel;
        }

        if (countStatus) {
            countStatus.innerText = "Selected Count: " + (activeModel3dSlot ? 1 : selectedArtworks.length);
        }

        if (colorStatus) {
            var colorName = "None";

            if (selectedWallMaterial) {
                colorName = selectedWallMaterial.metadata && selectedWallMaterial.metadata.uiName
                    ? selectedWallMaterial.metadata.uiName
                    : selectedWallMaterial.name.replace("WallColor_", "");
            }

            colorStatus.innerHTML = "Selected Color: <span class=\"gallery-editor-accent-text\">" + colorName + "</span>";
        }

        updateArtworkManagementUi();
        updateArtworkImageUi();
        updateArtworkInfoUi();
        updateArtworkTransformUi();
        updateModel3dSlotUi();
        updateAlignmentPanel();
    }

    var selectionGlowShaderReady = false;
    var selectionGlowMaterials = {};

    function setupSelectionGlowShader() {

        if (selectionGlowShaderReady) {
            return;
        }

        BABYLON.Effect.ShadersStore["selectionGlowVertexShader"] = `
            precision highp float;

            attribute vec3 position;
            attribute vec2 uv;

            uniform mat4 worldViewProjection;

            varying vec2 vUV;

            void main(void) {
                vUV = uv;
                gl_Position = worldViewProjection * vec4(position, 1.0);
            }
        `;

        BABYLON.Effect.ShadersStore["selectionGlowFragmentShader"] = `
            precision highp float;

            varying vec2 vUV;

            uniform vec2 planeSize;
            uniform vec2 rectSize;

            uniform float lineWidth;
            uniform float lineSoftness;
            uniform float glowWidth;
            uniform float glowPower;
            uniform float edgeBoost;

            uniform float lineAlpha;
            uniform float glowAlpha;
            uniform float overallAlpha;

            uniform vec3 glowColor;

            float rectSignedDistance(vec2 point, vec2 halfSize) {
                vec2 d = abs(point) - halfSize;
                float outsideDistance = length(max(d, 0.0));
                float insideDistance = min(max(d.x, d.y), 0.0);
                return outsideDistance + insideDistance;
            }

            void main(void) {
                vec2 local = (vUV - 0.5) * planeSize;
                vec2 halfRect = rectSize * 0.5;

                float sd = rectSignedDistance(local, halfRect);

                // Outline/glow nie wchodzi do srodka obrazu.
                if (sd < 0.0) {
                    discard;
                }

                float outsideDist = sd;

                // Cienka linia przy samej krawedzi.
                float line = 1.0 - smoothstep(
                    lineWidth,
                    lineWidth + lineSoftness,
                    outsideDist
                );

                // Glow startuje od krawedzi i zanika na zewnatrz.
                float glow = 1.0 - smoothstep(
                    0.0,
                    glowWidth,
                    outsideDist
                );

                float edgeCore = 1.0 - smoothstep(
                    0.0,
                    glowWidth * 0.34,
                    outsideDist
                );

                glow = pow(max(glow, 0.0), glowPower);

                float alpha = (
                    line * lineAlpha +
                    glow * glowAlpha +
                    edgeCore * glowAlpha * edgeBoost
                ) * overallAlpha;

                if (alpha < 0.004) {
                    discard;
                }

                vec3 color = glowColor * (0.82 + line * 0.36 + edgeCore * 0.18);
                gl_FragColor = vec4(color, alpha);
            }
        `;

        selectionGlowShaderReady = true;
    }

    function getSelectionGlowMaterial(artwork, styleName, planeWidth, planeHeight, artWidth, artHeight) {

        setupSelectionGlowShader();

        var key = artwork.name + "_" + styleName;

        if (selectionGlowMaterials[key]) {
            return selectionGlowMaterials[key];
        }

        var config = {
            // Wybrany wariant 2: EDGE_A_close_short.
            lineWidth: 0.0035,
            lineSoftness: 0.004,
            glowWidth: 0.065,
            glowPower: 1.75,
            edgeBoost: 0.38,
            lineAlpha: 0.95,
            glowAlpha: 0.38,
            overallAlpha: 0.84
        };

        if (styleName === "reference") {
            config.lineAlpha = 1.0;
            config.glowAlpha = 0.42;
            config.overallAlpha = 0.90;
        } else if (styleName === "primary") {
            config.lineAlpha = 0.98;
            config.glowAlpha = 0.40;
            config.overallAlpha = 0.87;
        }

        var material = new BABYLON.ShaderMaterial(
            "SelectionGlowMat_" + key,
            scene,
            {
                vertex: "selectionGlow",
                fragment: "selectionGlow"
            },
            {
                attributes: ["position", "uv"],
                uniforms: [
                    "worldViewProjection",
                    "planeSize",
                    "rectSize",
                    "lineWidth",
                    "lineSoftness",
                    "glowWidth",
                    "glowPower",
                    "edgeBoost",
                    "lineAlpha",
                    "glowAlpha",
                    "overallAlpha",
                    "glowColor"
                ],
                needAlphaBlending: true
            }
        );

        material.backFaceCulling = false;
        material.alphaMode = BABYLON.Engine.ALPHA_ADD;

        material.setVector2("planeSize", new BABYLON.Vector2(planeWidth, planeHeight));
        material.setVector2("rectSize", new BABYLON.Vector2(artWidth, artHeight));
        material.setFloat("lineWidth", config.lineWidth);
        material.setFloat("lineSoftness", config.lineSoftness);
        material.setFloat("glowWidth", config.glowWidth);
        material.setFloat("glowPower", config.glowPower);
        material.setFloat("edgeBoost", config.edgeBoost);
        material.setFloat("lineAlpha", config.lineAlpha);
        material.setFloat("glowAlpha", config.glowAlpha);
        material.setFloat("overallAlpha", config.overallAlpha);
        material.setColor3("glowColor", new BABYLON.Color3(1, 1, 1));

        selectionGlowMaterials[key] = material;

        return material;
    }

    function ensureArtworkSelectionGlow(artwork, styleName) {

        artwork.metadata = artwork.metadata || {};

        var boundingBox = artwork.getBoundingInfo().boundingBox;
        var artWidth = boundingBox.extendSize.x * 2;
        var artHeight = boundingBox.extendSize.y * 2;
        var halfDepth = boundingBox.extendSize.z;

        var planeExtra = 0.20;
        var planeWidth = artWidth + planeExtra;
        var planeHeight = artHeight + planeExtra;

        var existing = artwork.metadata.selectionGlowPlane;

        if (!existing) {
            existing = BABYLON.MeshBuilder.CreatePlane(
                artwork.name + "_SelectionGradientGlow",
                {
                    width: planeWidth,
                    height: planeHeight,
                    sideOrientation: BABYLON.Mesh.DOUBLESIDE
                },
                scene
            );

            existing.parent = artwork;
            existing.position = new BABYLON.Vector3(0, 0, halfDepth + 0.003);
            existing.isPickable = false;
            existing.renderingGroupId = 2;

            artwork.metadata.selectionGlowPlane = existing;
        }

        existing.setEnabled(true);
        existing.visibility = 1;
        existing.material = getSelectionGlowMaterial(
            artwork,
            styleName,
            planeWidth,
            planeHeight,
            artWidth,
            artHeight
        );

        return existing;
    }

    function hideArtworkSelectionGlow(artwork) {

        if (
            artwork &&
            artwork.metadata &&
            artwork.metadata.selectionGlowPlane
        ) {
            artwork.metadata.selectionGlowPlane.setEnabled(false);
            artwork.metadata.selectionGlowPlane.visibility = 0;
        }
    }

    function refreshArtworkOutlines() {

        artworks.forEach(function (artwork) {
            if (artwork.disableEdgesRendering) {
                artwork.disableEdgesRendering();
            }

            artwork.renderOutline = false;
            artwork.renderOverlay = false;

            hideArtworkSelectionGlow(artwork);
        });

        selectedArtworks.forEach(function (artwork) {
            if (artwork === referenceArtwork) {
                ensureArtworkSelectionGlow(artwork, "reference");
            } else if (artwork === primaryArtwork) {
                ensureArtworkSelectionGlow(artwork, "primary");
            } else {
                ensureArtworkSelectionGlow(artwork, "default");
            }
        });
    }

    function selectArtwork(artwork, addToSelection) {

        // Selekcja obrazow, modeli 3D i lokalnych lamp jest rozdzielna.
        // Nie moze byc jednoczesnie zaznaczony obraz, rzezba/model i lampa.
        clearLocalLightSelection();
        clearModel3dSlotSelection(true);

        if (addToSelection) {

            var existingIndex = selectedArtworks.indexOf(artwork);

            if (existingIndex >= 0) {
                selectedArtworks.splice(existingIndex, 1);

                if (primaryArtwork === artwork) {
                    primaryArtwork = selectedArtworks.length > 0
                        ? selectedArtworks[selectedArtworks.length - 1]
                        : null;
                }
            } else {
                selectedArtworks.push(artwork);
                primaryArtwork = artwork;
            }

        } else {
            selectedArtworks = [artwork];
            primaryArtwork = artwork;
        }

        referenceArtwork = selectedArtworks.length > 0
            ? selectedArtworks[0]
            : null;

        activeArtwork = primaryArtwork;

        clearWallColorSelection();
        refreshArtworkOutlines();
        updateEditHelpStatus();
        updateAlignmentPanel();
    }

    function deselectArtwork() {

        selectedArtworks.forEach(function (artwork) {
            if (artwork.disableEdgesRendering) {
                artwork.disableEdgesRendering();
            }

            hideArtworkSelectionGlow(artwork);
        });

        selectedArtworks = [];
        primaryArtwork = null;
        referenceArtwork = null;
        activeArtwork = null;
        selectedArtwork = null;
        isDraggingArtwork = false;

        editMoveKeys.w = false;
        editMoveKeys.a = false;
        editMoveKeys.s = false;
        editMoveKeys.d = false;

        artworkAlignPanel.style.display = "none";

        attachGalleryCameraControl();
        updateEditHelpStatus();
    }

    function clearWallColorSelection() {

        selectedWallMaterial = null;

        Array.from(wallPalette.querySelectorAll("button")).forEach(function (item) {
            item.classList.remove("is-selected");
        });

        updateEditHelpStatus();
    }

    function clearEditSelection() {

        deselectArtwork();
        clearWallColorSelection();

        isDraggingArtwork = false;
        selectedArtwork = null;

        clearModel3dSlotSelection();

        dragMoved = false;

        lastArtworkClickTime = 0;
        lastArtworkClickMesh = null;

        artworkAlignPanel.style.display = "none";

        attachGalleryCameraControl();
        updateEditHelpStatus();
    }

    function clearEditMoveKeys() {
        editMoveKeys.w = false;
        editMoveKeys.a = false;
        editMoveKeys.s = false;
        editMoveKeys.d = false;
    }

    function isGalleryTextEditingElement(target) {
        if (!target) {
            return false;
        }

        var tagName = target.tagName ? target.tagName.toLowerCase() : "";

        return !!(
            target.isContentEditable ||
            tagName === "input" ||
            tagName === "textarea" ||
            tagName === "select"
        );
    }

    function stopGalleryTextEditingKeyboardBubble(event) {
        if (!isGalleryTextEditingElement(event.target)) {
            return;
        }

        clearEditMoveKeys();

        if (event.stopPropagation) {
            event.stopPropagation();
        }
    }

    editHelpPanel.addEventListener("keydown", stopGalleryTextEditingKeyboardBubble);
    editHelpPanel.addEventListener("keyup", stopGalleryTextEditingKeyboardBubble);
    editHelpPanel.addEventListener("focusin", function (event) {
        if (isGalleryTextEditingElement(event.target)) {
            clearEditMoveKeys();
        }
    });
    editHelpPanel.addEventListener("focusout", function () {
        clearEditMoveKeys();
    });

    window.addEventListener("keydown", function (event) {

        if (isGalleryTextEditingElement(event.target)) {
            clearEditMoveKeys();
            return;
        }

        var key = event.key.toLowerCase();

        if (key === "w" || key === "a" || key === "s" || key === "d") {
            if (editMode) {
                editMoveKeys[key] = true;
                event.preventDefault();
            } else {
                viewerMoveKeys[key] = true;
                event.preventDefault();
            }
        }

        if (key === "shift" && !editMode) {
            viewerMoveKeys.shift = true;
        }
    });

    window.addEventListener("keyup", function (event) {

        if (isGalleryTextEditingElement(event.target)) {
            clearEditMoveKeys();
            return;
        }

        var key = event.key.toLowerCase();

        if (key === "w" || key === "a" || key === "s" || key === "d") {
            if (editMode) {
                editMoveKeys[key] = false;
            } else {
                viewerMoveKeys[key] = false;
            }
        }

        if (key === "shift") {
            viewerMoveKeys.shift = false;
        }
    });

    scene.onBeforeRenderObservable.add(function () {

        if (!editMode || isDraggingArtwork || isDraggingSphere) {
            return;
        }

        var moveDirection = BABYLON.Vector3.Zero();

        var forward = camera.getDirection(new BABYLON.Vector3(0, 0, 1));
        forward.y = 0;

        if (forward.lengthSquared() > 0) {
            forward.normalize();
        }

        var right = camera.getDirection(new BABYLON.Vector3(1, 0, 0));
        right.y = 0;

        if (right.lengthSquared() > 0) {
            right.normalize();
        }

        if (editMoveKeys.w) {
            moveDirection.addInPlace(forward);
        }

        if (editMoveKeys.s) {
            moveDirection.subtractInPlace(forward);
        }

        if (editMoveKeys.d) {
            moveDirection.addInPlace(right);
        }

        if (editMoveKeys.a) {
            moveDirection.subtractInPlace(right);
        }

        if (moveDirection.lengthSquared() > 0) {
            moveDirection.normalize();

            var delta = scene.getEngine().getDeltaTime() / 16.666;

            camera.position.addInPlace(
                moveDirection.scale(editMoveSpeed * delta)
            );
        }

        updateAlignmentPanel();
    });

    function getArtworkHalfSizeOnAxis(artwork, axis) {

        var bounds = artwork.getBoundingInfo().boundingBox.extendSizeWorld;

        if (axis === "x") {
            return bounds.x;
        }

        if (axis === "y") {
            return bounds.y;
        }

        if (axis === "z") {
            return bounds.z;
        }

        return 0;
    }

    // STAGE 10H - WALL SEGMENT ALIGNMENT GROUP
    // Po segmentacji ścian system wyrównywania nie może traktować pojedynczego
    // Wall_segment_0xx jako całej ściany. Do bounds/center używamy grupy segmentów
    // leżących na tej samej płaszczyźnie ściany.
    var wallSegmentAlignmentGroupEnabled = true;
    var wallSegmentAlignmentPlaneTolerance = 0.75;

    // STAGE 10J - WALL SEGMENT CORNER GUARD
    // Segmenty na jednej płaszczyźnie są traktowane jak jedna ściana,
    // ale tylko w obrębie ciągłego odcinka. Narożniki / przerwy / końce ścian
    // mają nadal blokować przesuwanie obrazu.
    var wallSegmentAlignmentCornerGuardEnabled = true;
    var wallSegmentAlignmentIntervalMergeTolerance = 0.22;

    function isAlignmentWallSegmentMesh(mesh) {
        return !!(
            mesh &&
            mesh.name &&
            mesh.name.indexOf("Wall_segment_") === 0
        );
    }

    function getWallSegmentMeshBounds(mesh) {
        if (!mesh || !mesh.getBoundingInfo) {
            return null;
        }

        mesh.computeWorldMatrix(true);

        var box = mesh.getBoundingInfo().boundingBox;

        return {
            minX: Math.min(box.minimumWorld.x, box.maximumWorld.x),
            maxX: Math.max(box.minimumWorld.x, box.maximumWorld.x),
            minY: Math.min(box.minimumWorld.y, box.maximumWorld.y),
            maxY: Math.max(box.minimumWorld.y, box.maximumWorld.y),
            minZ: Math.min(box.minimumWorld.z, box.maximumWorld.z),
            maxZ: Math.max(box.minimumWorld.z, box.maximumWorld.z)
        };
    }

    function getWallSegmentApproxPlaneValue(mesh, wallAxis) {
        var bounds = getWallSegmentMeshBounds(mesh);

        if (!bounds) {
            return null;
        }

        if (wallAxis === "x") {
            return (bounds.minX + bounds.maxX) / 2;
        }

        if (wallAxis === "z") {
            return (bounds.minZ + bounds.maxZ) / 2;
        }

        return null;
    }

    function mergeWallSegmentAlignmentIntervals(intervals) {
        if (!intervals.length) {
            return [];
        }

        intervals.sort(function (a, b) {
            return a.min - b.min;
        });

        var merged = [];

        intervals.forEach(function (interval) {
            if (!merged.length) {
                merged.push({
                    min: interval.min,
                    max: interval.max,
                    minY: interval.minY,
                    maxY: interval.maxY,
                    segmentNames: interval.segmentNames.slice()
                });
                return;
            }

            var last = merged[merged.length - 1];

            if (
                !wallSegmentAlignmentCornerGuardEnabled ||
                interval.min <= last.max + wallSegmentAlignmentIntervalMergeTolerance
            ) {
                last.max = Math.max(last.max, interval.max);
                last.minY = Math.min(last.minY, interval.minY);
                last.maxY = Math.max(last.maxY, interval.maxY);
                last.segmentNames = last.segmentNames.concat(interval.segmentNames);
            } else {
                merged.push({
                    min: interval.min,
                    max: interval.max,
                    minY: interval.minY,
                    maxY: interval.maxY,
                    segmentNames: interval.segmentNames.slice()
                });
            }
        });

        return merged;
    }

    function chooseWallSegmentAlignmentInterval(intervals, referenceValue) {
        if (!intervals.length) {
            return null;
        }

        if (referenceValue !== undefined && referenceValue !== null && isFinite(referenceValue)) {
            for (var i = 0; i < intervals.length; i++) {
                if (
                    referenceValue >= intervals[i].min - wallSegmentAlignmentIntervalMergeTolerance &&
                    referenceValue <= intervals[i].max + wallSegmentAlignmentIntervalMergeTolerance
                ) {
                    return intervals[i];
                }
            }

            var nearest = intervals[0];
            var nearestDistance = Number.POSITIVE_INFINITY;

            intervals.forEach(function (interval) {
                var center = (interval.min + interval.max) / 2;
                var distance = Math.abs(center - referenceValue);

                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearest = interval;
                }
            });

            return nearest;
        }

        var largest = intervals[0];
        var largestSize = largest.max - largest.min;

        intervals.forEach(function (interval) {
            var size = interval.max - interval.min;

            if (size > largestSize) {
                largestSize = size;
                largest = interval;
            }
        });

        return largest;
    }

    function getWallSegmentAlignmentGroupBounds(referenceWallMesh, wallAxis, wallValue, horizontalAxis, referenceValue) {
        if (!wallSegmentAlignmentGroupEnabled || !isAlignmentWallSegmentMesh(referenceWallMesh)) {
            return null;
        }

        if (!wallAxis && horizontalAxis) {
            wallAxis = getWallAxisFromHorizontalAxis(horizontalAxis);
        }

        if (!wallAxis) {
            var referenceBounds = getWallSegmentMeshBounds(referenceWallMesh);

            if (!referenceBounds) {
                return null;
            }

            var sizeX = Math.abs(referenceBounds.maxX - referenceBounds.minX);
            var sizeZ = Math.abs(referenceBounds.maxZ - referenceBounds.minZ);
            wallAxis = sizeX <= sizeZ ? "x" : "z";
        }

        if (wallValue === undefined || wallValue === null || !isFinite(wallValue)) {
            wallValue = getWallSegmentApproxPlaneValue(referenceWallMesh, wallAxis);
        }

        if (wallValue === null) {
            return null;
        }

        var intervals = [];

        wallMeshes.forEach(function (mesh) {
            if (!isAlignmentWallSegmentMesh(mesh)) {
                return;
            }

            var meshPlaneValue = getWallSegmentApproxPlaneValue(mesh, wallAxis);

            if (meshPlaneValue === null) {
                return;
            }

            if (Math.abs(meshPlaneValue - wallValue) > wallSegmentAlignmentPlaneTolerance) {
                return;
            }

            var bounds = getWallSegmentMeshBounds(mesh);

            if (!bounds) {
                return;
            }

            var minHorizontal;
            var maxHorizontal;

            if (horizontalAxis === "x") {
                minHorizontal = bounds.minX;
                maxHorizontal = bounds.maxX;
            } else if (horizontalAxis === "z") {
                minHorizontal = bounds.minZ;
                maxHorizontal = bounds.maxZ;
            } else {
                return;
            }

            intervals.push({
                min: minHorizontal,
                max: maxHorizontal,
                minY: bounds.minY,
                maxY: bounds.maxY,
                segmentNames: [mesh.name]
            });
        });

        if (!intervals.length) {
            return null;
        }

        var mergedIntervals = mergeWallSegmentAlignmentIntervals(intervals);
        var selectedInterval = chooseWallSegmentAlignmentInterval(
            mergedIntervals,
            referenceValue
        );

        if (!selectedInterval) {
            return null;
        }

        return {
            min: selectedInterval.min,
            max: selectedInterval.max,
            minY: selectedInterval.minY,
            maxY: selectedInterval.maxY,
            wallAxis: wallAxis,
            wallValue: wallValue,
            horizontalAxis: horizontalAxis,
            segmentCount: selectedInterval.segmentNames.length,
            segmentNames: selectedInterval.segmentNames.slice(),
            intervalCount: mergedIntervals.length,
            selectedIntervalIndex: mergedIntervals.indexOf(selectedInterval),
            referenceValue: referenceValue,
            cornerGuardEnabled: wallSegmentAlignmentCornerGuardEnabled,
            mergeTolerance: wallSegmentAlignmentIntervalMergeTolerance
        };
    }

    function getWallVerticalLimits(wallMesh) {

        if (!wallMesh) {
            return null;
        }

        var groupedBounds = getWallSegmentAlignmentGroupBounds(
            wallMesh,
            null,
            null,
            "x"
        );

        if (groupedBounds) {
            return {
                minY: groupedBounds.minY,
                maxY: groupedBounds.maxY
            };
        }

        wallMesh.computeWorldMatrix(true);

        var box = wallMesh.getBoundingInfo().boundingBox;

        return {
            minY: Math.min(box.minimumWorld.y, box.maximumWorld.y),
            maxY: Math.max(box.minimumWorld.y, box.maximumWorld.y)
        };
    }

    function clampArtworkYByWallBounds(artwork, targetY, wallMesh) {

        var limits = getWallVerticalLimits(wallMesh);

        if (!limits) {
            return targetY;
        }

        var halfHeight = getArtworkHalfSizeOnAxis(artwork, "y");

        var minCenterY = limits.minY + halfHeight + artworkBoundsSafeMargin;
        var maxCenterY = limits.maxY - halfHeight - artworkBoundsSafeMargin;

        if (minCenterY > maxCenterY) {
            return (limits.minY + limits.maxY) / 2;
        }

        return BABYLON.Scalar.Clamp(
            targetY,
            minCenterY,
            maxCenterY
        );
    }

    function getWallHorizontalLimits(wallMesh, horizontalAxis) {

        if (!wallMesh) {
            return null;
        }

        var groupedBounds = getWallSegmentAlignmentGroupBounds(
            wallMesh,
            getWallAxisFromHorizontalAxis(horizontalAxis),
            null,
            horizontalAxis,
            null
        );

        if (groupedBounds) {
            return {
                min: groupedBounds.min,
                max: groupedBounds.max
            };
        }

        wallMesh.computeWorldMatrix(true);

        var box = wallMesh.getBoundingInfo().boundingBox;

        if (horizontalAxis === "x") {
            return {
                min: Math.min(box.minimumWorld.x, box.maximumWorld.x),
                max: Math.max(box.minimumWorld.x, box.maximumWorld.x)
            };
        }

        if (horizontalAxis === "z") {
            return {
                min: Math.min(box.minimumWorld.z, box.maximumWorld.z),
                max: Math.max(box.minimumWorld.z, box.maximumWorld.z)
            };
        }

        return null;
    }

    function getArtworkHalfSizeOnAxisForRotation(artwork, axis, targetRotation) {

        var oldRotation = artwork.rotation.clone();

        artwork.rotation = targetRotation;
        artwork.computeWorldMatrix(true);

        var halfSize = getArtworkHalfSizeOnAxis(
            artwork,
            axis
        );

        artwork.rotation = oldRotation;
        artwork.computeWorldMatrix(true);

        return halfSize;
    }

    function getWallAxisFromHorizontalAxis(horizontalAxis) {
        return horizontalAxis === "x" ? "z" : "x";
    }

    function getWorldTriangleFromMesh(wallMesh, positions, indices, triangleStartIndex) {

        var worldMatrix = wallMesh.getWorldMatrix();

        function getPoint(indexOffset) {

            var vertexIndex = indices[triangleStartIndex + indexOffset] * 3;

            var localPoint = new BABYLON.Vector3(
                positions[vertexIndex],
                positions[vertexIndex + 1],
                positions[vertexIndex + 2]
            );

            return BABYLON.Vector3.TransformCoordinates(
                localPoint,
                worldMatrix
            );
        }

        return [
            getPoint(0),
            getPoint(1),
            getPoint(2)
        ];
    }

    function getTriangleNormalFromPoints(points) {

        var normal = BABYLON.Vector3.Cross(
            points[1].subtract(points[0]),
            points[2].subtract(points[0])
        );

        if (normal.lengthSquared() < 0.000001) {
            return null;
        }

        normal.normalize();

        return normal;
    }

    function mergeWallIntervals(intervals, mergeTolerance) {

        if (intervals.length === 0) {
            return [];
        }

        intervals.sort(function (a, b) {
            return a.min - b.min;
        });

        var merged = [];

        intervals.forEach(function (interval) {

            if (merged.length === 0) {
                merged.push({
                    min: interval.min,
                    max: interval.max,
                    minY: interval.minY,
                    maxY: interval.maxY
                });

                return;
            }

            var last = merged[merged.length - 1];

            if (interval.min <= last.max + mergeTolerance) {
                last.max = Math.max(last.max, interval.max);
                last.minY = Math.min(last.minY, interval.minY);
                last.maxY = Math.max(last.maxY, interval.maxY);
            } else {
                merged.push({
                    min: interval.min,
                    max: interval.max,
                    minY: interval.minY,
                    maxY: interval.maxY
                });
            }
        });

        return merged;
    }

    function chooseWallIntervalForValue(intervals, value, mergeTolerance) {

        if (intervals.length === 0) {
            return null;
        }

        for (var i = 0; i < intervals.length; i++) {
            if (
                value >= intervals[i].min - mergeTolerance &&
                value <= intervals[i].max + mergeTolerance
            ) {
                return intervals[i];
            }
        }

        var nearest = intervals[0];
        var nearestDistance = Number.MAX_VALUE;

        intervals.forEach(function (interval) {

            var center = (interval.min + interval.max) / 2;
            var distance = Math.abs(center - value);

            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearest = interval;
            }
        });

        return nearest;
    }

    function splitWallIntervalByPerpendicularCuts(baseInterval, cuts, referenceValue, mergeTolerance) {

        var boundaries = [
            baseInterval.min,
            baseInterval.max
        ];

        cuts.forEach(function (cutValue) {

            if (
                cutValue > baseInterval.min + mergeTolerance &&
                cutValue < baseInterval.max - mergeTolerance
            ) {
                boundaries.push(cutValue);
            }
        });

        boundaries = boundaries
            .sort(function (a, b) {
                return a - b;
            })
            .filter(function (value, index, array) {
                return index === 0 || Math.abs(value - array[index - 1]) > mergeTolerance;
            });

        var segments = [];

        for (var i = 0; i < boundaries.length - 1; i++) {
            segments.push({
                min: boundaries[i],
                max: boundaries[i + 1],
                minY: baseInterval.minY,
                maxY: baseInterval.maxY
            });
        }

        return chooseWallIntervalForValue(
            segments,
            referenceValue,
            mergeTolerance
        ) || baseInterval;
    }

    function getWallSegmentBoundsFromGeometry(wallMesh, wallAxis, wallValue, horizontalAxis, referenceValue) {

        if (!wallMesh) {
            return null;
        }

        wallMesh.computeWorldMatrix(true);

        var positions = wallMesh.getVerticesData(
            BABYLON.VertexBuffer.PositionKind
        );

        var indices = wallMesh.getIndices();

        if (!positions || !indices) {
            var fallbackLimits = getWallHorizontalLimits(
                wallMesh,
                horizontalAxis
            );

            if (!fallbackLimits) {
                return null;
            }

            var verticalLimits = getWallVerticalLimits(wallMesh) || {
                minY: -9999,
                maxY: 9999
            };

            return {
                min: fallbackLimits.min,
                max: fallbackLimits.max,
                minY: verticalLimits.minY,
                maxY: verticalLimits.maxY
            };
        }

        var planeTolerance = 0.12;
        var normalTolerance = 0.78;
        var cutTolerance = 0.55;
        var mergeTolerance = 0.06;

        var wallIntervals = [];
        var cutBoundaries = [];

        for (var i = 0; i < indices.length; i += 3) {

            var points = getWorldTriangleFromMesh(
                wallMesh,
                positions,
                indices,
                i
            );

            var triangleNormal = getTriangleNormalFromPoints(points);

            if (!triangleNormal) {
                continue;
            }

            var minWallAxis = Math.min(
                points[0][wallAxis],
                points[1][wallAxis],
                points[2][wallAxis]
            );

            var maxWallAxis = Math.max(
                points[0][wallAxis],
                points[1][wallAxis],
                points[2][wallAxis]
            );

            var minHorizontal = Math.min(
                points[0][horizontalAxis],
                points[1][horizontalAxis],
                points[2][horizontalAxis]
            );

            var maxHorizontal = Math.max(
                points[0][horizontalAxis],
                points[1][horizontalAxis],
                points[2][horizontalAxis]
            );

            var minY = Math.min(
                points[0].y,
                points[1].y,
                points[2].y
            );

            var maxY = Math.max(
                points[0].y,
                points[1].y,
                points[2].y
            );

            var isCurrentWallPlane =
                Math.abs(points[0][wallAxis] - wallValue) <= planeTolerance &&
                Math.abs(points[1][wallAxis] - wallValue) <= planeTolerance &&
                Math.abs(points[2][wallAxis] - wallValue) <= planeTolerance &&
                Math.abs(triangleNormal[wallAxis]) >= normalTolerance;

            if (isCurrentWallPlane) {
                wallIntervals.push({
                    min: minHorizontal,
                    max: maxHorizontal,
                    minY: minY,
                    maxY: maxY
                });

                continue;
            }

            var isPerpendicularCut =
                Math.abs(triangleNormal[horizontalAxis]) >= normalTolerance &&
                wallValue >= minWallAxis - cutTolerance &&
                wallValue <= maxWallAxis + cutTolerance;

            if (isPerpendicularCut) {
                cutBoundaries.push(
                    (minHorizontal + maxHorizontal) / 2
                );
            }
        }

        var mergedIntervals = mergeWallIntervals(
            wallIntervals,
            mergeTolerance
        );

        if (mergedIntervals.length === 0) {
            var limits = getWallHorizontalLimits(
                wallMesh,
                horizontalAxis
            );

            if (!limits) {
                return null;
            }

            var fallbackVerticalLimits = getWallVerticalLimits(wallMesh) || {
                minY: -9999,
                maxY: 9999
            };

            return {
                min: limits.min,
                max: limits.max,
                minY: fallbackVerticalLimits.minY,
                maxY: fallbackVerticalLimits.maxY
            };
        }

        var baseInterval = chooseWallIntervalForValue(
            mergedIntervals,
            referenceValue,
            mergeTolerance
        );

        return splitWallIntervalByPerpendicularCuts(
            baseInterval,
            cutBoundaries,
            referenceValue,
            mergeTolerance
        );
    }

    function getImprovedWallHorizontalLimits(wallMesh, horizontalAxis, wallAxis, wallValue, referenceValue) {

        var groupedBounds = getWallSegmentAlignmentGroupBounds(
            wallMesh,
            wallAxis,
            wallValue,
            horizontalAxis,
            referenceValue
        );

        if (groupedBounds) {
            return groupedBounds;
        }

        return getWallSegmentBoundsFromGeometry(
            wallMesh,
            wallAxis,
            wallValue,
            horizontalAxis,
            referenceValue
        );
    }

    function clampArtworkHorizontalByWallBounds(artwork, targetValue, wallMesh, horizontalAxis, targetRotation, wallAxis, wallValue) {

        var referenceValue = targetValue;
        var currentWallData = getArtworkWallDataFromRotation(artwork);

        if (
            currentWallData.wallAxis === wallAxis &&
            Math.abs(currentWallData.wallValue - wallValue) < 0.2
        ) {
            referenceValue = artwork.position[horizontalAxis];
        }

        var limits = getImprovedWallHorizontalLimits(
            wallMesh,
            horizontalAxis,
            wallAxis,
            wallValue,
            referenceValue
        );

        if (!limits) {
            return targetValue;
        }

        var halfWidth = getArtworkHalfSizeOnAxisForRotation(
            artwork,
            horizontalAxis,
            targetRotation
        );

        var minCenter = limits.min + halfWidth + artworkBoundsSafeMargin;
        var maxCenter = limits.max - halfWidth - artworkBoundsSafeMargin;

        if (minCenter > maxCenter) {
            return (limits.min + limits.max) / 2;
        }

        return BABYLON.Scalar.Clamp(
            targetValue,
            minCenter,
            maxCenter
        );
    }

    function clampArtworkHorizontalByTargetSegment(artwork, targetValue, wallMesh, horizontalAxis, targetRotation, wallAxis, wallValue) {

        var limits = getImprovedWallHorizontalLimits(
            wallMesh,
            horizontalAxis,
            wallAxis,
            wallValue,
            targetValue
        );

        if (!limits) {
            return targetValue;
        }

        var halfWidth = getArtworkHalfSizeOnAxisForRotation(
            artwork,
            horizontalAxis,
            targetRotation
        );

        var minCenter = limits.min + halfWidth + artworkBoundsSafeMargin;
        var maxCenter = limits.max - halfWidth - artworkBoundsSafeMargin;

        if (minCenter > maxCenter) {
            return (limits.min + limits.max) / 2;
        }

        return BABYLON.Scalar.Clamp(
            targetValue,
            minCenter,
            maxCenter
        );
    }

    function setArtworkWallMetadata(artwork, wallMesh, wallAxis, wallValue, horizontalAxis) {

        if (!artwork) {
            return;
        }

        artwork.metadata = artwork.metadata || {};

        artwork.metadata.wallMesh = wallMesh || null;
        artwork.metadata.wallAxis = wallAxis;
        artwork.metadata.wallValue = wallValue;
        artwork.metadata.horizontalAxis = horizontalAxis;
    }

    function getArtworkWallDataFromRotation(artwork) {

        if (
            artwork &&
            artwork.metadata &&
            artwork.metadata.wallAxis &&
            artwork.metadata.horizontalAxis &&
            artwork.metadata.wallValue !== undefined
        ) {
            return {
                wallAxis: artwork.metadata.wallAxis,
                wallValue: artwork.metadata.wallValue,
                horizontalAxis: artwork.metadata.horizontalAxis
            };
        }

        var rotationY = artwork.rotation.y;

        while (rotationY > Math.PI) {
            rotationY -= Math.PI * 2;
        }

        while (rotationY < -Math.PI) {
            rotationY += Math.PI * 2;
        }

        if (Math.abs(Math.abs(rotationY) - Math.PI / 2) < 0.2) {
            return {
                wallAxis: "x",
                wallValue: artwork.position.x,
                horizontalAxis: "z"
            };
        }

        return {
            wallAxis: "z",
            wallValue: artwork.position.z,
            horizontalAxis: "x"
        };
    }

    function getArtworkWallRect(artwork, wallData, targetPosition, targetRotation) {

        var oldPosition = artwork.position.clone();
        var oldRotation = artwork.rotation.clone();

        var shouldRestore = false;

        if (targetPosition) {
            artwork.position.copyFrom(targetPosition);
            shouldRestore = true;
        }

        if (targetRotation) {
            artwork.rotation = targetRotation.clone();
            shouldRestore = true;
        }

        artwork.computeWorldMatrix(true);

        var corners = artwork.getBoundingInfo().boundingBox.vectorsWorld;

        var minHorizontal = Number.POSITIVE_INFINITY;
        var maxHorizontal = Number.NEGATIVE_INFINITY;
        var minVertical = Number.POSITIVE_INFINITY;
        var maxVertical = Number.NEGATIVE_INFINITY;

        corners.forEach(function (corner) {

            var horizontalValue = corner[wallData.horizontalAxis];
            var verticalValue = corner.y;

            minHorizontal = Math.min(
                minHorizontal,
                horizontalValue
            );

            maxHorizontal = Math.max(
                maxHorizontal,
                horizontalValue
            );

            minVertical = Math.min(
                minVertical,
                verticalValue
            );

            maxVertical = Math.max(
                maxVertical,
                verticalValue
            );
        });

        if (shouldRestore) {
            artwork.position.copyFrom(oldPosition);
            artwork.rotation = oldRotation;
            artwork.computeWorldMatrix(true);
        }

        return {
            minHorizontal: minHorizontal,
            maxHorizontal: maxHorizontal,
            minVertical: minVertical,
            maxVertical: maxVertical
        };
    }

    function doArtworkRectsOverlap(firstRect, secondRect) {

        // Dotkniecie krawedzi jest dozwolone.
        // Realne wejscie jednej krawedzi w druga wieksze niz 0.001 blokuje ruch.
        var horizontalGap =
            Math.min(firstRect.maxHorizontal, secondRect.maxHorizontal) -
            Math.max(firstRect.minHorizontal, secondRect.minHorizontal);

        var verticalGap =
            Math.min(firstRect.maxVertical, secondRect.maxVertical) -
            Math.max(firstRect.minVertical, secondRect.minVertical);

        var horizontalOverlap =
            horizontalGap > artworkCollisionTouchTolerance;

        var verticalOverlap =
            verticalGap > artworkCollisionTouchTolerance;

        return horizontalOverlap && verticalOverlap;
    }

    function wouldArtworkOverlap(movingArtwork, candidatePosition, candidateWallAxis, candidateWallValue, candidateHorizontalAxis) {

        var movingWallData = {
            wallAxis: candidateWallAxis,
            wallValue: candidateWallValue,
            horizontalAxis: candidateHorizontalAxis
        };

        var movingRect = getArtworkWallRect(
            movingArtwork,
            movingWallData,
            candidatePosition,
            movingArtwork.rotation
        );

        for (var i = 0; i < artworks.length; i++) {

            var otherArtwork = artworks[i];

            if (otherArtwork === movingArtwork || isArtworkDeleted(otherArtwork)) {
                continue;
            }

            var otherWallData = getArtworkWallDataFromRotation(
                otherArtwork
            );

            if (otherWallData.wallAxis !== candidateWallAxis) {
                continue;
            }

            if (Math.abs(otherWallData.wallValue - candidateWallValue) > artworkSameWallTolerance) {
                continue;
            }

            var otherRect = getArtworkWallRect(
                otherArtwork,
                movingWallData,
                null,
                null
            );

            if (
                doArtworkRectsOverlap(
                    movingRect,
                    otherRect
                )
            ) {
                return true;
            }
        }

        return false;
    }


    function getCameraHorizontalSign(wallData) {

        var cameraRight = camera.getDirection(
            new BABYLON.Vector3(1, 0, 0)
        );

        cameraRight.y = 0;

        if (cameraRight.lengthSquared() > 0) {
            cameraRight.normalize();
        }

        var wallHorizontalVector;

        if (wallData.horizontalAxis === "x") {
            wallHorizontalVector = new BABYLON.Vector3(1, 0, 0);
        } else {
            wallHorizontalVector = new BABYLON.Vector3(0, 0, 1);
        }

        return BABYLON.Vector3.Dot(
            wallHorizontalVector,
            cameraRight
        ) >= 0 ? 1 : -1;
    }

    function getArtworkWallEdges(artwork, wallData) {

        var halfHorizontal = getArtworkHalfSizeOnAxis(
            artwork,
            wallData.horizontalAxis
        );

        var halfVertical = getArtworkHalfSizeOnAxis(
            artwork,
            "y"
        );

        var cameraSign = getCameraHorizontalSign(wallData);
        var centerHorizontal = artwork.position[wallData.horizontalAxis];
        var visualCenterHorizontal = centerHorizontal * cameraSign;

        return {
            left: visualCenterHorizontal - halfHorizontal,
            right: visualCenterHorizontal + halfHorizontal,
            centerH: visualCenterHorizontal,
            top: artwork.position.y + halfVertical,
            bottom: artwork.position.y - halfVertical,
            centerV: artwork.position.y,
            halfHorizontal: halfHorizontal,
            halfVertical: halfVertical,
            cameraSign: cameraSign
        };
    }


    function getArtworkHorizontalPositionFromVisual(wallData, visualValue) {
        var cameraSign = getCameraHorizontalSign(wallData);
        return visualValue / cameraSign;
    }


    function getWallMeshForArtwork(artwork) {

        if (
            artwork &&
            artwork.metadata &&
            artwork.metadata.wallMesh &&
            wallMeshes.indexOf(artwork.metadata.wallMesh) >= 0
        ) {
            return artwork.metadata.wallMesh;
        }

        var wallData = getArtworkWallDataFromRotation(artwork);
        var bestWallMesh = null;
        var bestDistance = Number.MAX_VALUE;

        wallMeshes.forEach(function (wallMesh) {

            wallMesh.computeWorldMatrix(true);

            var box = wallMesh.getBoundingInfo().boundingBox;
            var minX = Math.min(box.minimumWorld.x, box.maximumWorld.x);
            var maxX = Math.max(box.minimumWorld.x, box.maximumWorld.x);
            var minY = Math.min(box.minimumWorld.y, box.maximumWorld.y);
            var maxY = Math.max(box.minimumWorld.y, box.maximumWorld.y);
            var minZ = Math.min(box.minimumWorld.z, box.maximumWorld.z);
            var maxZ = Math.max(box.minimumWorld.z, box.maximumWorld.z);

            var wallValue;

            if (wallData.wallAxis === "x") {
                wallValue = Math.abs(artwork.position.x - minX) < Math.abs(artwork.position.x - maxX)
                    ? minX
                    : maxX;
            } else {
                wallValue = Math.abs(artwork.position.z - minZ) < Math.abs(artwork.position.z - maxZ)
                    ? minZ
                    : maxZ;
            }

            var distance = Math.abs(wallValue - wallData.wallValue);

            var horizontalValue = artwork.position[wallData.horizontalAxis];

            var horizontalInside =
                wallData.horizontalAxis === "x"
                    ? horizontalValue >= minX - 0.5 && horizontalValue <= maxX + 0.5
                    : horizontalValue >= minZ - 0.5 && horizontalValue <= maxZ + 0.5;

            var verticalInside =
                artwork.position.y >= minY - 0.5 &&
                artwork.position.y <= maxY + 0.5;

            if (horizontalInside && verticalInside && distance < bestDistance) {
                bestDistance = distance;
                bestWallMesh = wallMesh;
            }
        });

        return bestWallMesh;
    }

    function canMoveArtworkToPosition(artwork, targetPosition, wallData) {

        var oldPosition = artwork.position.clone();
        var oldRotation = artwork.rotation.clone();

        artwork.position.copyFrom(targetPosition);
        artwork.computeWorldMatrix(true);

        var overlaps = wouldArtworkOverlap(
            artwork,
            targetPosition,
            wallData.wallAxis,
            wallData.wallValue,
            wallData.horizontalAxis
        );

        artwork.position.copyFrom(oldPosition);
        artwork.rotation = oldRotation;
        artwork.computeWorldMatrix(true);

        return !overlaps;
    }


    function getExtremeReferenceForMode(mode) {

        if (selectedArtworks.length < 2) {
            return null;
        }

        if (mode === "centerH" || mode === "centerV") {
            return primaryArtwork;
        }

        if (mode === "centerWallH" || mode === "centerWallV") {
            return null;
        }

        var bestArtwork = selectedArtworks[0];
        var bestValue = null;

        selectedArtworks.forEach(function (artwork) {

            var wallData = getArtworkWallDataFromRotation(artwork);
            var edges = getArtworkWallEdges(artwork, wallData);

            var value;

            if (mode === "top") {
                value = edges.top;
            }

            if (mode === "bottom") {
                value = edges.bottom;
            }

            if (bestValue === null) {
                bestValue = value;
                bestArtwork = artwork;
                return;
            }

            if (mode === "top" && value > bestValue) {
                bestValue = value;
                bestArtwork = artwork;
            }

            if (mode === "bottom" && value < bestValue) {
                bestValue = value;
                bestArtwork = artwork;
            }
        });

        return bestArtwork;
    }

    function getWallCenterForArtwork(artwork, wallData, axisMode) {

        var wallMesh = getWallMeshForArtwork(artwork);

        if (!wallMesh) {
            return null;
        }

        var groupedBounds = getWallSegmentAlignmentGroupBounds(
            wallMesh,
            wallData.wallAxis,
            wallData.wallValue,
            wallData.horizontalAxis,
            artwork.position[wallData.horizontalAxis]
        );

        if (groupedBounds) {
            if (axisMode === "horizontal") {
                return (groupedBounds.min + groupedBounds.max) / 2;
            }

            if (axisMode === "vertical") {
                return (groupedBounds.minY + groupedBounds.maxY) / 2;
            }

            return null;
        }

        wallMesh.computeWorldMatrix(true);

        var box = wallMesh.getBoundingInfo().boundingBox;

        var minHorizontal;
        var maxHorizontal;

        if (wallData.horizontalAxis === "x") {
            minHorizontal = Math.min(box.minimumWorld.x, box.maximumWorld.x);
            maxHorizontal = Math.max(box.minimumWorld.x, box.maximumWorld.x);
        } else {
            minHorizontal = Math.min(box.minimumWorld.z, box.maximumWorld.z);
            maxHorizontal = Math.max(box.minimumWorld.z, box.maximumWorld.z);
        }

        var minY = Math.min(box.minimumWorld.y, box.maximumWorld.y);
        var maxY = Math.max(box.minimumWorld.y, box.maximumWorld.y);

        if (axisMode === "horizontal") {
            return (minHorizontal + maxHorizontal) / 2;
        }

        if (axisMode === "vertical") {
            return (minY + maxY) / 2;
        }

        return null;
    }

    function getSnapTargetForVerticalMove(artwork, wallData, targetPosition) {

        var edges = getArtworkWallEdges(artwork, wallData);

        var currentCenterY = artwork.position.y;
        var targetCenterY = targetPosition.y;

        var direction = targetCenterY > currentCenterY ? 1 : -1;

        if (Math.abs(targetCenterY - currentCenterY) < 0.001) {
            return null;
        }

        var bestTarget = null;
        var bestDistance = Number.MAX_VALUE;

        artworks.forEach(function (otherArtwork) {

            if (otherArtwork === artwork || isArtworkDeleted(otherArtwork)) {
                return;
            }

            var otherWallData = getArtworkWallDataFromRotation(otherArtwork);

            if (otherWallData.wallAxis !== wallData.wallAxis) {
                return;
            }

            if (Math.abs(otherWallData.wallValue - wallData.wallValue) > artworkSameWallTolerance) {
                return;
            }

            var otherRect = getArtworkWallRect(
                otherArtwork,
                wallData,
                null,
                null
            );

            var movingRect = getArtworkWallRect(
                artwork,
                wallData,
                null,
                null
            );

            var horizontalOverlap =
                (
                    Math.min(movingRect.maxHorizontal, otherRect.maxHorizontal) -
                    Math.max(movingRect.minHorizontal, otherRect.minHorizontal)
                ) > artworkCollisionTouchTolerance;

            if (!horizontalOverlap) {
                return;
            }

            var otherEdges = getArtworkWallEdges(otherArtwork, otherWallData);

            var snapCenterY;

            if (direction > 0) {
                // Ruch w gore: gorna krawedz przesuwanego obrazu
                // zatrzymuje sie pod dolna krawedzia obrazu po drodze.
                snapCenterY =
                    otherEdges.bottom -
                    edges.halfVertical -
                    artworkCollisionPadding;

                if (snapCenterY <= currentCenterY) {
                    return;
                }

                if (snapCenterY > targetCenterY) {
                    return;
                }
            } else {
                // Ruch w dol: dolna krawedz przesuwanego obrazu
                // zatrzymuje sie nad gorna krawedzia obrazu po drodze.
                snapCenterY =
                    otherEdges.top +
                    edges.halfVertical +
                    artworkCollisionPadding;

                if (snapCenterY >= currentCenterY) {
                    return;
                }

                if (snapCenterY < targetCenterY) {
                    return;
                }
            }

            var distance = Math.abs(
                snapCenterY -
                currentCenterY
            );

            if (distance < bestDistance) {
                bestDistance = distance;
                bestTarget = snapCenterY;
            }
        });

        return bestTarget;
    }


    function canApplyArtworkTransform(artwork, targetPosition, targetRotation, wallData) {

        var oldPosition = artwork.position.clone();
        var oldRotation = artwork.rotation.clone();

        artwork.position.copyFrom(targetPosition);
        artwork.rotation = targetRotation.clone();
        artwork.computeWorldMatrix(true);

        var overlaps = wouldArtworkOverlap(
            artwork,
            targetPosition,
            wallData.wallAxis,
            wallData.wallValue,
            wallData.horizontalAxis
        );

        artwork.position.copyFrom(oldPosition);
        artwork.rotation = oldRotation;
        artwork.computeWorldMatrix(true);

        return !overlaps;
    }

    function areArtworksOnSameWall(firstWallData, secondWallData) {

        return (
            firstWallData.wallAxis === secondWallData.wallAxis &&
            Math.abs(firstWallData.wallValue - secondWallData.wallValue) <= artworkSameWallTolerance
        );
    }

    function getArtworkRectForWallAxis(artwork, wallData, targetPosition, targetRotation) {

        return getArtworkWallRect(
            artwork,
            wallData,
            targetPosition || null,
            targetRotation || null
        );
    }

    function getArtworkCenterForWallAxis(artwork, wallData) {

        var rect = getArtworkRectForWallAxis(
            artwork,
            wallData,
            null,
            null
        );

        return (
            rect.minHorizontal +
            rect.maxHorizontal
        ) / 2;
    }

    function getSameWallArtworks(referenceWallData) {

        return selectedArtworks.filter(function (artwork) {

            var wallData = getArtworkWallDataFromRotation(
                artwork
            );

            return areArtworksOnSameWall(
                referenceWallData,
                wallData
            );
        });
    }

    function getCameraRightFlatForAlignment() {

        var cameraRight = camera.getDirection(
            new BABYLON.Vector3(1, 0, 0)
        );

        cameraRight.y = 0;

        if (cameraRight.lengthSquared() > 0) {
            cameraRight.normalize();
        }

        return cameraRight;
    }

    function getArtworkCameraRect(artwork, targetPosition, targetRotation) {

        var oldPosition = artwork.position.clone();
        var oldRotation = artwork.rotation.clone();

        var shouldRestore = false;

        if (targetPosition) {
            artwork.position.copyFrom(targetPosition);
            shouldRestore = true;
        }

        if (targetRotation) {
            artwork.rotation = targetRotation.clone();
            shouldRestore = true;
        }

        artwork.computeWorldMatrix(true);

        var cameraRight = getCameraRightFlatForAlignment();
        var corners = artwork.getBoundingInfo().boundingBox.vectorsWorld;

        var minValue = Number.POSITIVE_INFINITY;
        var maxValue = Number.NEGATIVE_INFINITY;

        corners.forEach(function (corner) {

            var value = BABYLON.Vector3.Dot(
                corner,
                cameraRight
            );

            minValue = Math.min(
                minValue,
                value
            );

            maxValue = Math.max(
                maxValue,
                value
            );
        });

        if (shouldRestore) {
            artwork.position.copyFrom(oldPosition);
            artwork.rotation = oldRotation;
            artwork.computeWorldMatrix(true);
        }

        return {
            min: minValue,
            max: maxValue,
            center: (minValue + maxValue) / 2,
            half: (maxValue - minValue) / 2
        };
    }

    function getArtworkVisualRectOnWallByCamera(artwork, wallData, targetPosition, targetRotation) {

        var rect = getArtworkWallRect(
            artwork,
            wallData,
            targetPosition || null,
            targetRotation || null
        );

        var cameraSign = getCameraHorizontalSign(
            wallData
        );

        if (cameraSign >= 0) {
            return {
                min: rect.minHorizontal,
                max: rect.maxHorizontal,
                center: (rect.minHorizontal + rect.maxHorizontal) / 2,
                half: (rect.maxHorizontal - rect.minHorizontal) / 2,
                cameraSign: cameraSign
            };
        }

        return {
            min: -rect.maxHorizontal,
            max: -rect.minHorizontal,
            center: (-rect.maxHorizontal - rect.minHorizontal) / 2,
            half: (rect.maxHorizontal - rect.minHorizontal) / 2,
            cameraSign: cameraSign
        };
    }

    function setArtworkHorizontalFromWallVisualCenter(targetPosition, wallData, visualCenter) {

        var cameraSign = getCameraHorizontalSign(
            wallData
        );

        targetPosition[wallData.horizontalAxis] =
            visualCenter / cameraSign;
    }

    function moveTargetPositionToCameraCenter(targetPosition, wallData, currentCameraCenter, targetCameraCenter) {

        var cameraRight = getCameraRightFlatForAlignment();

        var wallHorizontalVector =
            wallData.horizontalAxis === "x"
                ? new BABYLON.Vector3(1, 0, 0)
                : new BABYLON.Vector3(0, 0, 1);

        var influence = BABYLON.Vector3.Dot(
            wallHorizontalVector,
            cameraRight
        );

        if (Math.abs(influence) < 0.0001) {
            return false;
        }

        targetPosition[wallData.horizontalAxis] +=
            (targetCameraCenter - currentCameraCenter) / influence;

        return true;
    }

    function alignSelectedArtworksLeftRightSingleWall(mode) {

        if (selectedArtworks.length < 2) {
            return;
        }

        var sortedArtworks = selectedArtworks.slice().sort(function (firstArtwork, secondArtwork) {

            // Kamera służy tylko do ustalenia, który obraz jest po lewej/prawej na ekranie.
            var firstRect = getArtworkCameraRect(
                firstArtwork,
                null,
                null
            );

            var secondRect = getArtworkCameraRect(
                secondArtwork,
                null,
                null
            );

            return firstRect.center - secondRect.center;
        });

        var visualDirection = 1;

        if (mode === "right") {
            sortedArtworks.reverse();
            visualDirection = -1;
        }

        var anchorArtwork = sortedArtworks[0];

        var anchorWallData = getArtworkWallDataFromRotation(
            anchorArtwork
        );

        var anchorWallMesh = getWallMeshForArtwork(
            anchorArtwork
        );

        if (!anchorWallMesh) {
            return;
        }

        var anchorRotation = anchorArtwork.rotation.clone();

        // Sam styk liczymy po osi ściany kotwicy, a nie projekcją kamery.
        // Dzięki temu patrzenie pod kątem nie tworzy sztucznego odstępu.
        var anchorVisualRect = getArtworkVisualRectOnWallByCamera(
            anchorArtwork,
            anchorWallData,
            null,
            null
        );

        var currentVisualEdge =
            visualDirection > 0
                ? anchorVisualRect.max
                : anchorVisualRect.min;

        for (var i = 1; i < sortedArtworks.length; i++) {

            var artwork = sortedArtworks[i];

            var oldPosition = artwork.position.clone();
            var oldRotation = artwork.rotation.clone();

            var targetRotation = anchorRotation.clone();
            var targetPosition = artwork.position.clone();

            // Przenosi obraz na ścianę kotwicy i nadaje ten sam kąt.
            targetPosition[anchorWallData.wallAxis] =
                anchorWallData.wallValue;

            targetPosition.y = clampArtworkYByWallBounds(
                artwork,
                targetPosition.y,
                anchorWallMesh
            );

            var targetVisualRectBeforeMove = getArtworkVisualRectOnWallByCamera(
                artwork,
                anchorWallData,
                targetPosition,
                targetRotation
            );

            var targetVisualCenter =
                visualDirection > 0
                    ? currentVisualEdge + targetVisualRectBeforeMove.half + artworkCollisionPadding
                    : currentVisualEdge - targetVisualRectBeforeMove.half - artworkCollisionPadding;

            setArtworkHorizontalFromWallVisualCenter(
                targetPosition,
                anchorWallData,
                targetVisualCenter
            );

            var requestedHorizontal =
                targetPosition[anchorWallData.horizontalAxis];

            targetPosition[anchorWallData.horizontalAxis] =
                clampArtworkHorizontalByTargetSegment(
                    artwork,
                    targetPosition[anchorWallData.horizontalAxis],
                    anchorWallMesh,
                    anchorWallData.horizontalAxis,
                    targetRotation,
                    anchorWallData.wallAxis,
                    anchorWallData.wallValue
                );

            // Jeżeli ściana przesunęła obraz, sprawdzamy czy nadal jest idealny styk.
            var finalVisualRect = getArtworkVisualRectOnWallByCamera(
                artwork,
                anchorWallData,
                targetPosition,
                targetRotation
            );

            var finalEdge =
                visualDirection > 0
                    ? finalVisualRect.min
                    : finalVisualRect.max;

            var desiredEdge =
                visualDirection > 0
                    ? currentVisualEdge + artworkCollisionPadding
                    : currentVisualEdge - artworkCollisionPadding;

            var finalEdgeError = Math.abs(
                finalEdge -
                desiredEdge
            );

            if (finalEdgeError > 0.01) {
                artwork.position.copyFrom(oldPosition);
                artwork.rotation = oldRotation;
                artwork.computeWorldMatrix(true);
                continue;
            }

            if (
                !canApplyArtworkTransform(
                    artwork,
                    targetPosition,
                    targetRotation,
                    anchorWallData
                )
            ) {
                artwork.position.copyFrom(oldPosition);
                artwork.rotation = oldRotation;
                artwork.computeWorldMatrix(true);
                continue;
            }

            artwork.position.copyFrom(targetPosition);
            artwork.rotation = targetRotation;
            artwork.computeWorldMatrix(true);

            setArtworkWallMetadata(
                artwork,
                anchorWallMesh,
                anchorWallData.wallAxis,
                anchorWallData.wallValue,
                anchorWallData.horizontalAxis
            );

            updateArtworkLight(artwork);

            var movedVisualRect = getArtworkVisualRectOnWallByCamera(
                artwork,
                anchorWallData,
                null,
                null
            );

            currentVisualEdge =
                visualDirection > 0
                    ? movedVisualRect.max
                    : movedVisualRect.min;
        }

        refreshArtworkOutlines();
        updateAlignmentPanel();
    }

    function alignSelectedArtworks(mode) {

        if (selectedArtworks.length < 2) {
            return;
        }

        if (mode === "left" || mode === "right") {
            alignSelectedArtworksLeftRightSingleWall(
                mode
            );

            return;
        }

        var referenceArtworkForMode = getExtremeReferenceForMode(mode);

        if (!referenceArtworkForMode && mode !== "centerWallH" && mode !== "centerWallV") {
            return;
        }

        var referenceWallData = referenceArtworkForMode
            ? getArtworkWallDataFromRotation(referenceArtworkForMode)
            : null;

        var referenceEdges = referenceArtworkForMode
            ? getArtworkWallEdges(referenceArtworkForMode, referenceWallData)
            : null;

        selectedArtworks.forEach(function (artwork) {

            if (
                referenceArtworkForMode &&
                artwork === referenceArtworkForMode
            ) {
                return;
            }

            artwork.computeWorldMatrix(true);

            var wallData = getArtworkWallDataFromRotation(artwork);
            var edges = getArtworkWallEdges(artwork, wallData);
            var targetPosition = artwork.position.clone();

            if (mode === "top") {
                targetPosition.y =
                    referenceEdges.top - edges.halfVertical;
            }

            if (mode === "bottom") {
                targetPosition.y =
                    referenceEdges.bottom + edges.halfVertical;
            }

            if (mode === "centerH") {
                targetPosition[wallData.horizontalAxis] =
                    getArtworkHorizontalPositionFromVisual(
                        wallData,
                        referenceEdges.centerH
                    );
            }

            if (mode === "centerV") {
                targetPosition.y =
                    referenceEdges.centerV;
            }

            if (mode === "centerWallH") {
                var wallCenterH = getWallCenterForArtwork(
                    artwork,
                    wallData,
                    "horizontal"
                );

                if (wallCenterH !== null) {
                    targetPosition[wallData.horizontalAxis] =
                        getArtworkHorizontalPositionFromVisual(
                            wallData,
                            wallCenterH * getCameraHorizontalSign(wallData)
                        );
                }
            }

            if (mode === "centerWallV") {
                var wallCenterV = getWallCenterForArtwork(
                    artwork,
                    wallData,
                    "vertical"
                );

                if (wallCenterV !== null) {
                    targetPosition.y = wallCenterV;
                }
            }

            var wallMesh = getWallMeshForArtwork(artwork);

            if (wallMesh) {
                targetPosition.y = clampArtworkYByWallBounds(
                    artwork,
                    targetPosition.y,
                    wallMesh
                );

                targetPosition[wallData.horizontalAxis] =
                    clampArtworkHorizontalByWallBounds(
                        artwork,
                        targetPosition[wallData.horizontalAxis],
                        wallMesh,
                        wallData.horizontalAxis,
                        artwork.rotation,
                        wallData.wallAxis,
                        wallData.wallValue
                    );
            }

            var canMove = canMoveArtworkToPosition(
                artwork,
                targetPosition,
                wallData
            );

            if (
                !canMove &&
                (mode === "top" || mode === "bottom")
            ) {
                var snapTargetY = getSnapTargetForVerticalMove(
                    artwork,
                    wallData,
                    targetPosition
                );

                if (snapTargetY !== null) {
                    var snapVerticalPosition = artwork.position.clone();

                    snapVerticalPosition.y = snapTargetY;

                    var wallMeshForVerticalSnap = getWallMeshForArtwork(artwork);

                    if (wallMeshForVerticalSnap) {
                        snapVerticalPosition.y = clampArtworkYByWallBounds(
                            artwork,
                            snapVerticalPosition.y,
                            wallMeshForVerticalSnap
                        );

                        snapVerticalPosition[wallData.horizontalAxis] =
                            clampArtworkHorizontalByWallBounds(
                                artwork,
                                snapVerticalPosition[wallData.horizontalAxis],
                                wallMeshForVerticalSnap,
                                wallData.horizontalAxis,
                                artwork.rotation,
                                wallData.wallAxis,
                                wallData.wallValue
                            );
                    }

                    if (
                        canMoveArtworkToPosition(
                            artwork,
                            snapVerticalPosition,
                            wallData
                        )
                    ) {
                        targetPosition = snapVerticalPosition;
                        canMove = true;
                    }
                }
            }

            if (canMove) {
                artwork.position.copyFrom(targetPosition);
                artwork.computeWorldMatrix(true);

                if (wallMesh) {
                    setArtworkWallMetadata(
                        artwork,
                        wallMesh,
                        wallData.wallAxis,
                        wallData.wallValue,
                        wallData.horizontalAxis
                    );
                }

                updateArtworkLight(artwork);
            }
        });

        refreshArtworkOutlines();
        updateAlignmentPanel();
    }

    function updateAlignmentPanel() {

        if (!artworkAlignPanel || !alignSectionData || !alignSectionData.section) {
            return;
        }

        var canAlign = editMode && selectedArtworks.length >= 2 && primaryArtwork && referenceArtwork;

        alignSectionData.section.classList.toggle("is-hidden", !canAlign);
        artworkAlignPanel.style.display = canAlign ? "grid" : "none";

        Array.from(artworkAlignPanel.querySelectorAll("button")).forEach(function (button) {
            button.disabled = !canAlign;
        });
    }


    // STAGE 10I - WALL SEGMENT DRAG GROUP
    // Drag obrazu po ścianie też nie może traktować pojedynczego Wall_segment_0xx
    // jako całej dostępnej ściany. Przy przesuwaniu używamy tej samej grupy
    // segmentów co przy wyrównywaniu Stage 10H.
    function getPickedWallSegmentBounds(pickWall, normal, horizontalAxis) {

        if (!pickWall || !pickWall.pickedMesh || !pickWall.pickedPoint) {
            return null;
        }

        var wallAxis = getWallAxisFromHorizontalAxis(
            horizontalAxis
        );

        var groupedBounds = getWallSegmentAlignmentGroupBounds(
            pickWall.pickedMesh,
            wallAxis,
            pickWall.pickedPoint[wallAxis],
            horizontalAxis,
            pickWall.pickedPoint[horizontalAxis]
        );

        if (groupedBounds) {
            groupedBounds.source = "wallSegmentAlignmentGroup";
            groupedBounds.pickedMeshName = pickWall.pickedMesh.name;
            return groupedBounds;
        }

        var geometryBounds = getWallSegmentBoundsFromGeometry(
            pickWall.pickedMesh,
            wallAxis,
            pickWall.pickedPoint[wallAxis],
            horizontalAxis,
            pickWall.pickedPoint[horizontalAxis]
        );

        if (geometryBounds) {
            geometryBounds.source = "singleMeshGeometry";
            geometryBounds.pickedMeshName = pickWall.pickedMesh.name;
        }

        return geometryBounds;
    }

    function clampArtworkToPickedWallSegment(artwork, candidatePosition, pickWall, normal, horizontalAxis, targetRotation) {

        var segmentBounds = getPickedWallSegmentBounds(
            pickWall,
            normal,
            horizontalAxis
        );

        if (!segmentBounds) {
            return candidatePosition;
        }

        var halfWidth = getArtworkHalfSizeOnAxisForRotation(
            artwork,
            horizontalAxis,
            targetRotation
        );

        var halfHeight = getArtworkHalfSizeOnAxis(
            artwork,
            "y"
        );

        var minCenterHorizontal =
            segmentBounds.min +
            halfWidth +
            artworkBoundsSafeMargin;

        var maxCenterHorizontal =
            segmentBounds.max -
            halfWidth -
            artworkBoundsSafeMargin;

        if (minCenterHorizontal <= maxCenterHorizontal) {
            candidatePosition[horizontalAxis] = BABYLON.Scalar.Clamp(
                candidatePosition[horizontalAxis],
                minCenterHorizontal,
                maxCenterHorizontal
            );
        } else {
            candidatePosition[horizontalAxis] =
                (segmentBounds.min + segmentBounds.max) / 2;
        }

        var minCenterY =
            segmentBounds.minY +
            halfHeight +
            artworkBoundsSafeMargin;

        var maxCenterY =
            segmentBounds.maxY -
            halfHeight -
            artworkBoundsSafeMargin;

        if (minCenterY <= maxCenterY) {
            candidatePosition.y = BABYLON.Scalar.Clamp(
                candidatePosition.y,
                minCenterY,
                maxCenterY
            );
        } else {
            candidatePosition.y =
                (segmentBounds.minY + segmentBounds.maxY) / 2;
        }

        return candidatePosition;
    }

    function placeArtworkOnWall(artwork, pickWall) {

        if (!artwork || !pickWall.hit) {
            return;
        }

        let point = pickWall.pickedPoint;
        let normal = pickWall.getNormal(true);
        var preservedRoll = artwork.rotation ? artwork.rotation.z : 0;

        if (!normal) {
            return;
        }

        let absX = Math.abs(normal.x);
        let absZ = Math.abs(normal.z);

        let candidatePosition;
        let candidateRotation;
        let candidateWallAxis;
        let candidateWallValue;
        let candidateHorizontalAxis;

        if (absX > absZ) {

            candidatePosition = point.add(new BABYLON.Vector3(
                Math.sign(normal.x) * artworkWallOffset,
                0,
                0
            ));

            candidatePosition.y = clampArtworkYByWallBounds(artwork, candidatePosition.y, pickWall.pickedMesh);

            candidateRotation = new BABYLON.Vector3(
                0,
                normal.x > 0 ? Math.PI / 2 : -Math.PI / 2,
                preservedRoll
            );

            candidateWallAxis = "x";
            candidateWallValue = candidatePosition.x;
            candidateHorizontalAxis = "z";

            candidatePosition = clampArtworkToPickedWallSegment(
                artwork,
                candidatePosition,
                pickWall,
                normal,
                candidateHorizontalAxis,
                candidateRotation
            );

        } else {

            candidatePosition = point.add(new BABYLON.Vector3(
                0,
                0,
                Math.sign(normal.z) * artworkWallOffset
            ));

            candidatePosition.y = clampArtworkYByWallBounds(artwork, candidatePosition.y, pickWall.pickedMesh);

            candidateRotation = new BABYLON.Vector3(
                0,
                normal.z > 0 ? 0 : Math.PI,
                preservedRoll
            );

            candidateWallAxis = "z";
            candidateWallValue = candidatePosition.z;
            candidateHorizontalAxis = "x";

            candidatePosition = clampArtworkToPickedWallSegment(
                artwork,
                candidatePosition,
                pickWall,
                normal,
                candidateHorizontalAxis,
                candidateRotation
            );
        }

        var oldPosition = artwork.position.clone();
        var oldRotation = artwork.rotation.clone();

        artwork.position.copyFrom(candidatePosition);
        artwork.rotation = candidateRotation;
        artwork.computeWorldMatrix(true);

        if (
            wouldArtworkOverlap(
                artwork,
                candidatePosition,
                candidateWallAxis,
                candidateWallValue,
                candidateHorizontalAxis
            )
        ) {
            artwork.position.copyFrom(oldPosition);
            artwork.rotation = oldRotation;
            artwork.computeWorldMatrix(true);

            return;
        }

        setArtworkWallMetadata(
            artwork,
            pickWall.pickedMesh,
            candidateWallAxis,
            candidateWallValue,
            candidateHorizontalAxis
        );

        artwork.metadata = artwork.metadata || {};
        artwork.metadata.wallSegmentDragGroupEnabled = !!(
            pickWall &&
            pickWall.pickedMesh &&
            isAlignmentWallSegmentMesh(pickWall.pickedMesh)
        );

        updateArtworkLight(artwork);
    }


    function updateArtworkLight(artwork) {
        syncDetachedArtworkImagePlane(artwork);
        updateDisplaySpotLight(artwork);
    }

    function getMeshesExcludedFromArtworkLights() {

        var excludedMeshes = [];

        floorMeshes.forEach(function (mesh) {
            excludedMeshes.push(mesh);
        });

        artSpheres.forEach(function (displayMesh) {
            excludedMeshes.push(displayMesh);

            if (
                displayMesh.metadata &&
                displayMesh.metadata.sculptureMesh
            ) {
                excludedMeshes.push(displayMesh.metadata.sculptureMesh);
            }
        });

        return excludedMeshes;
    }

    function refreshArtworkLightExclusions() {

        artworkLights.forEach(function (lightData) {
            if (lightData && lightData.artwork) {
                updateDisplaySpotLight(lightData.artwork);
            }
        });
    }

    function createArtworkLight(artwork, index) {
        // Stage 8M:
        // Automatyczne lampy przy artworkach są wyłączone.
        // Obrazy mają być tylko obrazami. Oświetlenie ma być dodawane ręcznie
        // przez Local Lights Spot / Point albo przez przyszły system fake glow.
        if (artwork && artwork.metadata) {
            artwork.metadata.lampMesh = null;
            artwork.metadata.spotLight = null;
        }

        return null;
    }

    function focusCameraOnObject(targetMesh) {

        enterMobileFocusState();

        let objectPosition = targetMesh.position.clone();

        // Dla postumentu ustawiamy fokus na rzezbie, a nie na samym piedestale.
        if (
            targetMesh &&
            targetMesh.metadata &&
            targetMesh.metadata.sculptureMesh &&
            targetMesh.metadata.sculptureMesh.getAbsolutePosition
        ) {
            objectPosition = targetMesh.metadata.sculptureMesh.getAbsolutePosition().clone();
        }

        let viewDirection;

        // Jesli klikniety obiekt jest obrazem, kamera podjezdza frontem do obrazu.
        if (artworks.includes(targetMesh)) {
            viewDirection = BABYLON.Vector3.TransformNormal(
                new BABYLON.Vector3(0, 0, 1),
                targetMesh.getWorldMatrix()
            ).normalize();
        }
        // Jesli to postument, kamera podjezdza od aktualnego kierunku patrzenia.
        else {
            let cameraToObject = objectPosition.subtract(camera.position).normalize();
            viewDirection = cameraToObject.scale(-1);
        }

        let focusDistance = 3;

        if (isMobileViewerActive() && artworks.includes(targetMesh)) {
            focusDistance = getMobileArtworkFocusDistance(targetMesh);
        }

        let targetCameraPosition = objectPosition.add(
            viewDirection.scale(focusDistance)
        );

        targetCameraPosition.y = camera.position.y;

        let startPosition = camera.position.clone();
        let startRotation = camera.rotation.clone();

        let tempCamera = new BABYLON.UniversalCamera(
            "tempCamera",
            targetCameraPosition.clone(),
            scene
        );

        tempCamera.setTarget(objectPosition);
        let targetRotation = tempCamera.rotation.clone();
        tempCamera.dispose();

        function fixRotation(target, current) {
            while (target - current > Math.PI) {
                target -= Math.PI * 2;
            }

            while (target - current < -Math.PI) {
                target += Math.PI * 2;
            }

            return target;
        }

        targetRotation.x = fixRotation(targetRotation.x, startRotation.x);
        targetRotation.y = fixRotation(targetRotation.y, startRotation.y);
        targetRotation.z = fixRotation(targetRotation.z, startRotation.z);

        let easing = new BABYLON.CubicEase();
        easing.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);

        BABYLON.Animation.CreateAndStartAnimation(
            "cameraMoveToObject",
            camera,
            "position",
            60,
            120,
            startPosition,
            targetCameraPosition,
            BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT,
            easing
        );

        BABYLON.Animation.CreateAndStartAnimation(
            "cameraRotateToObject",
            camera,
            "rotation",
            60,
            120,
            startRotation,
            targetRotation,
            BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT,
            easing
        );
    }

    BABYLON.SceneLoader.ImportMesh(
        "",
        "https://raw.githubusercontent.com/followyes/berryboy-art-gallery-assets/main/Models/Floor/",
        "Floor.gltf",
        scene,
        function (meshes) {

            floorMeshes = meshes.filter(mesh => mesh.name !== "__root__");

            floorMeshes.forEach(mesh => {
                mesh.isPickable = true;

                // Podloga odbiera cienie globalne i lokalne.
                registerCommonShadowMesh(mesh, {
                    global: true,
                    local: true,
                    receive: true,
                    cast: false
                });
            });

            updateMobileFloorBounds();
            refreshViewerCollisionMeshes();
            refreshArtworkLightExclusions();
            refreshPedestalLightIncludedMeshes();
            refreshAllCommonLocalLightTargets();
            refreshAllLocalSpotShadows();

            assetLoaded();
        }
    );

    // STAGE 11H - WALL GLTF ASSET PATH UPDATE
    // Ściany są teraz ładowane z folderu Models/Wall jako GLTF + BIN + tekstury.
    // Dzięki temu GitHub raw sam dociąga pliki powiązane z Wall_segments.gltf.
    var wallModelRootUrl = "https://raw.githubusercontent.com/followyes/berryboy-art-gallery-assets/main/Models/Wall/";

    BABYLON.SceneLoader.ImportMesh(
        "",
        wallModelRootUrl,
        "Wall_segments.gltf",
        scene,
        function (meshes) {

            wallMeshes = meshes.filter(mesh => mesh.name !== "__root__");

            wallMeshes.forEach(mesh => {
                mesh.isPickable = true;
                registerViewerCollisionMesh(mesh, "wall");

                if (mesh.material) {
                    configureMaterialForCommonLighting(mesh.material);
                    configureMeshMaterialForMainShadows(mesh);
                }

                registerCommonShadowMesh(mesh, {
                    global: true,
                    local: true,
                    receive: true,
                    cast: true
                });
            });

            console.log("Wall GLTF loaded", {
                rootUrl: wallModelRootUrl,
                file: "Wall_segments.gltf",
                meshes: wallMeshes
            });
            refreshViewerCollisionMeshes();
            refreshCommonLightingMaterialSupport();
            refreshAllCommonLocalLightTargets();
            refreshAllLocalSpotShadows();

            assetLoaded();
        },
        null,
        function (scene, message, exception) {
            console.error("Wall GLTF load failed:", {
                rootUrl: wallModelRootUrl,
                file: "Wall_segments.gltf",
                message: message,
                exception: exception
            });

            assetLoaded();
        }
    );

    BABYLON.SceneLoader.ImportMesh(
        "",
        "https://raw.githubusercontent.com/followyes/berryboy-art-gallery-assets/main/Models/",
        "Props.glb",
        scene,
        function (meshes) {
            meshes.forEach(mesh => {
                mesh.isPickable = true;

                if (mesh.name !== "__root__" && propMeshes.indexOf(mesh) === -1) {
                    propMeshes.push(mesh);
                    registerViewerCollisionMesh(mesh, "prop");
                }

                registerCommonShadowMesh(mesh, {
                    global: true,
                    local: true,
                    receive: true,
                    cast: true
                });
            });

            refreshViewerCollisionMeshes();
            refreshAllCommonLocalLightTargets();
            refreshAllLocalSpotShadows();

            assetLoaded();
        }
    );

    BABYLON.SceneLoader.ImportMesh(
        "",
        "https://raw.githubusercontent.com/followyes/berryboy-art-gallery-assets/main/Models/",
        "Ceiling.glb",
        scene,
        function (meshes) {
            meshes.forEach(mesh => {
                mesh.isPickable = true;

                if (mesh.name !== "__root__" && ceilingMeshes.indexOf(mesh) === -1) {
                    ceilingMeshes.push(mesh);
                }

                // Sufit moze teraz odbierac lokalne swiatlo jako osobny target per lampa.
                // Nie dodajemy go jako lokalnego castera, zeby nie blokowal swiatla z lamp.
                registerCommonShadowMesh(mesh, {
                    global: true,
                    local: true,
                    receive: true,
                    cast: false
                });
            });

            refreshAllCommonLocalLightTargets();
            refreshAllLocalSpotShadows();

            assetLoaded();
        }
    );


    // STAGE 12A - 3D MODEL SLOT LOGIC
    function getModel3dState(slot) {
        return slot && slot.metadata ? slot.metadata.model3d || null : null;
    }

    function normalizeModel3dState(modelState) {
        if (!modelState || typeof modelState !== "object") {
            return null;
        }

        var modelUrl = modelState.modelUrl || modelState.url || modelState.publicUrl || "";
        var modelPath = modelState.modelPath || modelState.path || "";

        if (!modelUrl && modelPath) {
            modelUrl = getPublicArtworkUrlFromPath(modelPath, modelState.storageBucket || galleryArtworkStorageBucket);
        }

        if (!modelUrl) {
            return null;
        }

        return {
            modelUrl: modelUrl,
            modelPath: modelPath,
            storageBucket: modelState.storageBucket || galleryArtworkStorageBucket,
            originalName: modelState.originalName || modelState.name || "model.glb",
            size: modelState.size || null,
            mimeType: modelState.mimeType || "model/gltf-binary",
            uploadedAt: modelState.uploadedAt || null,
            assignedAt: modelState.assignedAt || new Date().toISOString(),
            sourceSlotName: modelState.sourceSlotName || "",
            isDuplicate: !!modelState.isDuplicate,
            transform: {
                position: modelState.transform && modelState.transform.position
                    ? modelState.transform.position
                    : { x: 0, y: 0.65, z: 0 },
                rotation: modelState.transform && modelState.transform.rotation
                    ? modelState.transform.rotation
                    : { x: 0, y: 0, z: 0 },
                scaling: modelState.transform && modelState.transform.scaling
                    ? modelState.transform.scaling
                    : { x: 1, y: 1, z: 1 }
            }
        };
    }

    function getModel3dSlotByName(name) {
        return getSphereByName(name);
    }

    function getNextModel3dSlotIndex() {
        var maxIndex = -1;

        artSpheres.forEach(function (slot) {
            if (!slot || !slot.name) {
                return;
            }

            var match = slot.name.match(/ArtSphere_(\d+)/);

            if (match) {
                maxIndex = Math.max(maxIndex, Number(match[1]) || 0);
            }
        });

        galleryModel3dCreateCounter = Math.max(galleryModel3dCreateCounter, maxIndex + 1);

        return galleryModel3dCreateCounter++;
    }

    function getModel3dSlotFromPickedMesh(mesh) {
        if (!mesh) {
            return null;
        }

        if (artSpheres.indexOf(mesh) >= 0) {
            return mesh;
        }

        var current = mesh;

        while (current) {
            if (
                current.metadata &&
                current.metadata.model3dSlotName
            ) {
                return getModel3dSlotByName(current.metadata.model3dSlotName);
            }

            current = current.parent || null;
        }

        return null;
    }

    function disposeModel3dSlotRuntime(slot) {
        if (!slot || !slot.metadata) {
            return;
        }

        if (typeof clearModel3dSlotSelectionGlow === "function") {
            clearModel3dSlotSelectionGlow(slot);
        }

        var runtime = slot.metadata.model3dRuntime;

        if (runtime) {
            if (runtime.root && runtime.root.dispose) {
                runtime.root.dispose();
            } else if (runtime.meshes && runtime.meshes.length) {
                runtime.meshes.forEach(function (mesh) {
                    if (mesh && mesh.dispose) {
                        mesh.dispose();
                    }
                });
            }
        }

        slot.metadata.model3dRuntime = null;
    }

    function markModel3dRuntimeMesh(mesh, slot) {
        if (!mesh || !slot) {
            return;
        }

        mesh.metadata = mesh.metadata || {};
        mesh.metadata.model3dSlotName = slot.name;
        mesh.metadata.isModel3dRuntimeMesh = true;
        mesh.isPickable = true;

        if (mesh.material) {
            configureMaterialForCommonLighting(mesh.material);
        }

        try {
            registerCommonShadowMesh(mesh, {
                global: true,
                local: true,
                receive: true,
                cast: true
            });
        } catch (shadowError) {
            console.warn("Model 3D shadow register warning:", shadowError);
        }
    }

    function applyModel3dRuntimeVisibility(slot) {
        if (!slot || !slot.metadata || !slot.metadata.model3dRuntime) {
            return;
        }

        var runtime = slot.metadata.model3dRuntime;
        var shouldShowModel = !!getModel3dState(slot);

        if (runtime.root) {
            if (runtime.root.isVisible !== undefined) {
                runtime.root.isVisible = shouldShowModel;
            }

            if (runtime.root.visibility !== undefined) {
                runtime.root.visibility = shouldShowModel ? 1 : 0;
            }
        }

        if (runtime.meshes && runtime.meshes.length) {
            runtime.meshes.forEach(function (mesh) {
                if (!mesh) {
                    return;
                }

                if (mesh.isVisible !== undefined) {
                    mesh.isVisible = shouldShowModel;
                }

                if (mesh.visibility !== undefined) {
                    mesh.visibility = shouldShowModel ? 1 : 0;
                }

                if (mesh.isPickable !== undefined) {
                    mesh.isPickable = shouldShowModel;
                }
            });
        }
    }

    function updateModel3dSlotsVisibility() {
        artSpheres.forEach(function (slot) {
            applyModel3dRuntimeVisibility(slot);
        });
    }

    function setModel3dSlotTransformFromState(slot, modelState) {
        if (!slot || !slot.metadata || !slot.metadata.model3dRuntime) {
            return;
        }

        var runtime = slot.metadata.model3dRuntime;
        var root = runtime.root;

        if (!root) {
            return;
        }

        var transform = modelState && modelState.transform ? modelState.transform : {};
        var position = transform.position || { x: 0, y: 0.65, z: 0 };
        var rotation = transform.rotation || { x: 0, y: 0, z: 0 };
        var scaling = transform.scaling || { x: 1, y: 1, z: 1 };

        root.parent = slot;
        root.position.copyFrom(vectorFromState(position, new BABYLON.Vector3(0, 0.65, 0)));
        root.rotation.copyFrom(vectorFromState(rotation, BABYLON.Vector3.Zero()));
        root.scaling.copyFrom(vectorFromState(scaling, new BABYLON.Vector3(1, 1, 1)));
        root.computeWorldMatrix(true);
    }

    async function loadModel3dIntoSlot(slot, modelState) {
        modelState = normalizeModel3dState(modelState);

        if (!slot || !modelState || !modelState.modelUrl) {
            return false;
        }

        slot.metadata = slot.metadata || {};
        slot.metadata.model3d = modelState;

        disposeModel3dSlotRuntime(slot);

        var root = new BABYLON.TransformNode(slot.name + "_Model3DRoot", scene);
        root.parent = slot;
        root.metadata = root.metadata || {};
        root.metadata.model3dSlotName = slot.name;
        root.metadata.isModel3dRuntimeRoot = true;

        slot.metadata.model3dRuntime = {
            root: root,
            meshes: [],
            loadedAt: new Date().toISOString()
        };

        try {
            var result = await BABYLON.SceneLoader.ImportMeshAsync(
                "",
                "",
                modelState.modelUrl,
                scene
            );

            var loadedMeshes = (result && result.meshes ? result.meshes : []).filter(function (mesh) {
                return mesh && mesh.name !== "__root__";
            });

            loadedMeshes.forEach(function (mesh) {
                mesh.parent = root;
                markModel3dRuntimeMesh(mesh, slot);
            });

            slot.metadata.model3dRuntime.meshes = loadedMeshes;
            setModel3dSlotTransformFromState(slot, modelState);
            applyModel3dRuntimeVisibility(slot);

            if (activeModel3dSlot === slot) {
                applyModel3dSlotSelectionGlow(slot);
            }

            galleryModel3dLastDebug = {
                slot: slot.name,
                modelUrl: modelState.modelUrl,
                meshCount: loadedMeshes.length,
                loadedAt: new Date().toISOString()
            };

            refreshViewerCollisionMeshes();
            refreshCommonLightingMaterialSupport();
            refreshAllCommonLocalLightTargets();
            refreshAllLocalSpotShadows();
            updateViewerModePlaceholderVisibility();
            updateModel3dSlotUi();

            return true;
        } catch (error) {
            console.warn("3D model load failed:", {
                slot: slot.name,
                modelUrl: modelState.modelUrl,
                error: error
            });

            disposeModel3dSlotRuntime(slot);
            galleryModel3dLastDebug = {
                slot: slot.name,
                modelUrl: modelState.modelUrl,
                error: error && error.message ? error.message : String(error)
            };
            notifyGalleryStatus("Nie udalo sie wczytac modelu 3D. Sprawdz URL/GLB i konsolę.");
            return false;
        }
    }

    function applyModel3dStateToSlot(slot, modelState) {
        modelState = normalizeModel3dState(modelState);

        if (!slot || !modelState) {
            return Promise.resolve(false);
        }

        return loadModel3dIntoSlot(slot, modelState);
    }

    function removeModel3dFromSlot(slot) {
        if (!slot) {
            return false;
        }

        slot.metadata = slot.metadata || {};
        disposeModel3dSlotRuntime(slot);
        slot.metadata.model3d = null;

        updateViewerModePlaceholderVisibility();
        updateModel3dSlotUi();
        notifyGalleryStatus("Model usuniety ze slotu. Plik w Storage nie zostal usuniety, bo moze byc uzywany przez kopie.");
        return true;
    }

    function createModel3dStateFromUrl(slot, modelUrl) {
        if (!modelUrl) {
            return null;
        }

        return normalizeModel3dState({
            modelUrl: String(modelUrl).trim(),
            originalName: slot && slot.name ? slot.name + ".glb" : "model.glb",
            assignedAt: new Date().toISOString()
        });
    }

    async function uploadModel3dToSlot(slot, file) {
        if (!slot || !file) {
            notifyGalleryStatus("Zaznacz slot modelu i wybierz plik GLB.");
            return false;
        }

        if (!galleryModel3dUploadEnabled) {
            notifyGalleryStatus("Upload modeli 3D jest wylaczony.");
            return false;
        }

        if (galleryEditorLoginEnabled && !editorAuthenticated) {
            notifyGalleryStatus("Zaloguj sie jako edytor, aby wgrac model 3D.");
            return false;
        }

        if (!isValidModel3dFile(file)) {
            notifyGalleryStatus("Wybierz plik .glb.");
            return false;
        }

        var maxBytes = galleryModel3dMaxUploadSizeMb * 1024 * 1024;

        if (file.size && file.size > maxBytes) {
            notifyGalleryStatus("Model jest za duzy. Limit: " + galleryModel3dMaxUploadSizeMb + " MB.");
            return false;
        }

        var client = window.gallerySupabase;

        if (!client || !client.storage) {
            notifyGalleryStatus("Supabase Storage nie jest skonfigurowany.");
            return false;
        }

        var storagePath = createModel3dStoragePath(slot, file);

        notifyGalleryStatus("Wgrywam model 3D GLB...");

        var uploadResponse = await client
            .storage
            .from(galleryArtworkStorageBucket)
            .upload(storagePath, file, {
                cacheControl: "31536000",
                upsert: false,
                contentType: file.type || "model/gltf-binary"
            });

        if (uploadResponse.error) {
            console.warn("3D model upload error:", uploadResponse.error);
            notifyGalleryStatus("Upload modelu 3D nieudany: " + (uploadResponse.error.message || "unknown error"));
            return false;
        }

        var publicUrlResponse = client
            .storage
            .from(galleryArtworkStorageBucket)
            .getPublicUrl(storagePath);

        var publicUrl = publicUrlResponse &&
            publicUrlResponse.data &&
            publicUrlResponse.data.publicUrl
                ? publicUrlResponse.data.publicUrl
                : "";

        var modelState = normalizeModel3dState({
            modelUrl: publicUrl,
            modelPath: storagePath,
            storageBucket: galleryArtworkStorageBucket,
            originalName: file.name || "model.glb",
            size: file.size || null,
            mimeType: file.type || "model/gltf-binary",
            uploadedAt: new Date().toISOString(),
            assignedAt: new Date().toISOString()
        });

        var loaded = await applyModel3dStateToSlot(slot, modelState);

        if (loaded) {
            notifyGalleryStatus("Model 3D wgrany. Zapisz stan galerii, aby zachowac zmiane.");
        }

        return loaded;
    }

    function copySelectedModel3dToClipboard() {
        var modelState = getModel3dState(selectedSphere);

        if (!selectedSphere || !modelState) {
            notifyGalleryStatus("Zaznacz slot z modelem 3D.");
            return false;
        }

        galleryModel3dClipboardState = JSON.parse(JSON.stringify(modelState));
        notifyGalleryStatus("Model skopiowany do schowka slotow.");
        updateModel3dSlotUi();
        return true;
    }

    function pasteModel3dFromClipboardToSelectedSlot() {
        if (!selectedSphere || !galleryModel3dClipboardState) {
            notifyGalleryStatus("Brak modelu w schowku albo brak zaznaczonego slotu.");
            return false;
        }

        var pastedState = JSON.parse(JSON.stringify(galleryModel3dClipboardState));
        pastedState.sourceSlotName = pastedState.sourceSlotName || "clipboard";
        pastedState.isDuplicate = true;
        pastedState.assignedAt = new Date().toISOString();

        applyModel3dStateToSlot(selectedSphere, pastedState);
        notifyGalleryStatus("Model przypisany do slotu bez ponownego uploadu.");
        return true;
    }

    function duplicateSelectedModel3dSlot() {
        if (!selectedSphere) {
            notifyGalleryStatus("Zaznacz slot modelu 3D.");
            return null;
        }

        var index = getNextModel3dSlotIndex();
        var position = selectedSphere.position.clone().add(new BABYLON.Vector3(1.4, 0, 0));
        var newSlot = createPedestalDisplay(position, index);

        if (!newSlot) {
            notifyGalleryStatus("Nie udalo sie utworzyc kopii slotu.");
            return null;
        }

        newSlot.rotation.copyFrom(selectedSphere.rotation);
        newSlot.scaling.copyFrom(selectedSphere.scaling);
        newSlot.metadata = newSlot.metadata || {};
        newSlot.metadata.isDynamicModelSlot = true;

        var modelState = getModel3dState(selectedSphere);

        if (modelState) {
            var duplicateState = JSON.parse(JSON.stringify(modelState));
            duplicateState.sourceSlotName = selectedSphere.name;
            duplicateState.isDuplicate = true;
            duplicateState.assignedAt = new Date().toISOString();
            applyModel3dStateToSlot(newSlot, duplicateState);
        }

        selectModel3dSlot(newSlot);
        updateViewerModePlaceholderVisibility();
        updateModel3dSlotUi();
        updateEditHelpStatus();
        notifyGalleryStatus("Slot modelu zduplikowany bez ponownego uploadu.");

        return newSlot;
    }


    function getModel3dSlotSelectionMeshes(slot) {
        var result = [];

        function addMesh(mesh) {
            if (!mesh) {
                return;
            }

            if (mesh.isDisposed && mesh.isDisposed()) {
                return;
            }

            if (result.indexOf(mesh) !== -1) {
                return;
            }

            result.push(mesh);
        }

        addMesh(slot);

        if (slot && slot.metadata) {
            addMesh(slot.metadata.sculptureMesh);

            var runtime = slot.metadata.model3dRuntime;

            if (runtime && runtime.meshes && runtime.meshes.length) {
                runtime.meshes.forEach(function (mesh) {
                    addMesh(mesh);
                });
            }
        }

        return result;
    }

    function clearModel3dSlotSelectionGlow(slot) {
        if (!slot || !slot.metadata || !model3dSelectionHighlightLayer) {
            return;
        }

        var storedMeshes = slot.metadata.model3dSelectionGlowMeshes || [];

        storedMeshes.forEach(function (mesh) {
            if (
                mesh &&
                !(mesh.isDisposed && mesh.isDisposed()) &&
                model3dSelectionHighlightLayer.removeMesh
            ) {
                model3dSelectionHighlightLayer.removeMesh(mesh);
            }
        });

        getModel3dSlotSelectionMeshes(slot).forEach(function (mesh) {
            if (
                mesh &&
                !(mesh.isDisposed && mesh.isDisposed()) &&
                model3dSelectionHighlightLayer.removeMesh
            ) {
                model3dSelectionHighlightLayer.removeMesh(mesh);
            }
        });

        slot.metadata.model3dSelectionGlowMeshes = [];
    }

    function applyModel3dSlotSelectionGlow(slot) {
        if (!slot || !slot.metadata || !model3dSelectionHighlightLayer) {
            return;
        }

        clearModel3dSlotSelectionGlow(slot);

        var meshes = getModel3dSlotSelectionMeshes(slot);
        var appliedMeshes = [];

        meshes.forEach(function (mesh) {
            if (!mesh || (mesh.isDisposed && mesh.isDisposed())) {
                return;
            }

            if (mesh.renderOutline !== undefined) {
                mesh.renderOutline = false;
            }

            if (mesh.renderOverlay !== undefined) {
                mesh.renderOverlay = false;
            }

            if (
                mesh.disableEdgesRendering &&
                typeof mesh.disableEdgesRendering === "function"
            ) {
                try {
                    mesh.disableEdgesRendering();
                } catch (edgeDisableError) {}
            }

            if (
                mesh.isVisible === false ||
                mesh.visibility === 0
            ) {
                return;
            }

            if (model3dSelectionHighlightLayer.addMesh) {
                model3dSelectionHighlightLayer.addMesh(
                    mesh,
                    model3dSelectionGlowColor
                );
                appliedMeshes.push(mesh);
            }
        });

        slot.metadata.model3dSelectionGlowMeshes = appliedMeshes;
    }

    function setModel3dSlotSelected(slot, isSelected) {
        if (!slot) {
            return;
        }

        // STAGE 12C2:
        // Rzeźba/model slot ma selection po całym obiekcie/sylwetce.
        // Nie używamy płaskiego rectangular plane jak dla obrazów.
        slot.renderOutline = false;
        slot.renderOverlay = false;

        var sculpture = slot.metadata ? slot.metadata.sculptureMesh : null;

        if (sculpture) {
            sculpture.renderOutline = false;
            sculpture.renderOverlay = false;
        }

        hideArtworkSelectionGlow(slot);
        clearModel3dSlotSelectionGlow(slot);

        if (isSelected) {
            applyModel3dSlotSelectionGlow(slot);
        }
    }

    function selectModel3dSlot(slot) {
        if (!slot) {
            return false;
        }

        clearLocalLightSelection();
        deselectArtwork();
        clearWallColorSelection();

        if (activeModel3dSlot && activeModel3dSlot !== slot) {
            setModel3dSlotSelected(activeModel3dSlot, false);
        }

        activeModel3dSlot = slot;
        selectedSphere = slot;
        setModel3dSlotSelected(slot, true);
        updateModel3dSlotUi();
        updateEditHelpStatus();

        return true;
    }

    function clearModel3dSlotSelection(skipUiUpdate) {
        if (activeModel3dSlot) {
            setModel3dSlotSelected(activeModel3dSlot, false);
        }

        activeModel3dSlot = null;
        selectedSphere = null;
        isDraggingSphere = false;

        if (!skipUiUpdate) {
            updateModel3dSlotUi();
        }
    }

    function rememberDeletedModel3dSlotName(slotName) {
        if (!slotName) {
            return;
        }

        if (deletedModel3dSlotNames.indexOf(slotName) === -1) {
            deletedModel3dSlotNames.push(slotName);
        }
    }

    function forgetDeletedModel3dSlotName(slotName) {
        deletedModel3dSlotNames = deletedModel3dSlotNames.filter(function (name) {
            return name !== slotName;
        });
    }

    function getDefaultModel3dSlotAddPosition() {
        if (activeModel3dSlot && activeModel3dSlot.position) {
            return activeModel3dSlot.position.clone().add(new BABYLON.Vector3(1.4, 0, 0));
        }

        var forward = camera.getDirection(new BABYLON.Vector3(0, 0, 1));

        if (forward.lengthSquared && forward.lengthSquared() > 0) {
            forward.normalize();
        } else {
            forward = new BABYLON.Vector3(0, 0, 1);
        }

        return new BABYLON.Vector3(
            camera.position.x + forward.x * 3.2,
            -3,
            camera.position.z + forward.z * 3.2
        );
    }

    function addNewModel3dSlotToScene() {
        var index = getNextModel3dSlotIndex();
        var slot = createPedestalDisplay(
            getDefaultModel3dSlotAddPosition(),
            index
        );

        if (!slot) {
            return null;
        }

        slot.metadata = slot.metadata || {};
        slot.metadata.isDynamicModelSlot = true;
        slot.metadata.isModel3dSlot = true;

        forgetDeletedModel3dSlotName(slot.name);
        selectModel3dSlot(slot);
        updateViewerModePlaceholderVisibility();
        updateEditHelpStatus();

        return slot;
    }

    function deleteModel3dSlotRuntime(slot, options) {
        options = options || {};

        if (!slot || (slot.isDisposed && slot.isDisposed())) {
            return false;
        }

        var slotName = slot.name;
        var isDynamic = !!(slot.metadata && slot.metadata.isDynamicModelSlot);

        if (!isDynamic && !options.skipRememberDeleted) {
            rememberDeletedModel3dSlotName(slotName);
        }

        if (activeModel3dSlot === slot) {
            setModel3dSlotSelected(slot, false);
            activeModel3dSlot = null;
        }

        if (selectedSphere === slot) {
            selectedSphere = null;
        }

        disposeModel3dSlotRuntime(slot);

        if (slot.metadata && slot.metadata.sculptureMesh) {
            unregisterViewerCollisionMesh(slot.metadata.sculptureMesh);

            try {
                slot.metadata.sculptureMesh.dispose();
            } catch (sculptureDisposeError) {
                console.warn("Sculpture placeholder dispose warning:", sculptureDisposeError);
            }

            slot.metadata.sculptureMesh = null;
        }

        unregisterViewerCollisionMesh(slot);

        artSpheres = artSpheres.filter(function (candidate) {
            return candidate !== slot;
        });

        try {
            slot.dispose();
        } catch (slotDisposeError) {
            console.warn("Model slot dispose warning:", slotDisposeError);
        }

        refreshViewerCollisionMeshes();
        refreshCommonLightingMaterialSupport();
        refreshAllCommonLocalLightTargets();
        refreshAllLocalSpotShadows();
        updateViewerModePlaceholderVisibility();
        updateModel3dSlotUi();
        updateEditHelpStatus();

        if (!options.silent) {
            notifyGalleryStatus("Deleted sculpture/model slot. Save state to keep the change.");
        }

        return true;
    }

    async function deleteSelectedGalleryObjectsNoAutoLights() {
        var hasArtworkSelection = selectedArtworks.length > 0;
        var hasModelSlotSelection = !!activeModel3dSlot;

        if (!hasArtworkSelection && !hasModelSlotSelection) {
            notifyGalleryStatus("Select artwork or sculpture to delete.");
            return false;
        }

        var deletedSomething = false;

        if (hasArtworkSelection) {
            deletedSomething = await deleteSelectedArtworksNoAutoLights() || deletedSomething;
        }

        if (hasModelSlotSelection) {
            deletedSomething = deleteModel3dSlotRuntime(activeModel3dSlot) || deletedSomething;
        }

        updateArtworkManagementUi();
        updateModel3dSlotUi();
        updateEditHelpStatus();

        return deletedSomething;
    }

    function getModel3dSlotDebug() {
        return artSpheres.map(function (slot, index) {
            var modelState = getModel3dState(slot);
            var runtime = slot && slot.metadata ? slot.metadata.model3dRuntime : null;

            return {
                name: slot ? slot.name : null,
                index: index,
                selected: slot === selectedSphere,
                active: slot === activeModel3dSlot,
                hasModel: !!modelState,
                modelUrl: modelState ? modelState.modelUrl : "",
                modelPath: modelState ? modelState.modelPath : "",
                runtimeMeshCount: runtime && runtime.meshes ? runtime.meshes.length : 0,
                placeholderVisible: slot ? !!slot.isVisible : false,
                clipboardHasModel: !!galleryModel3dClipboardState,
                deletedModel3dSlotNames: deletedModel3dSlotNames.slice()
            };
        });
    }

    var spherePositions = [
        new BABYLON.Vector3(-3, -3, -2),
        new BABYLON.Vector3(2, -3, 1),
        new BABYLON.Vector3(4, -3, -4)
    ];

    function updatePedestalLight(displayMesh) {
        updateDisplaySpotLight(displayMesh);
    }

    function updatePedestalLightIncludedMeshes(displayMesh) {

        if (!displayMesh || !displayMesh.metadata || !displayMesh.metadata.spotLight) {
            return;
        }

        displayMesh.metadata.spotLight.includedOnlyMeshes =
            getSpotIncludedMeshesForDisplay(displayMesh);
        displayMesh.metadata.spotLight.excludedMeshes = [];
    }

    function refreshPedestalLightIncludedMeshes() {

        artSpheres.forEach(function (displayMesh) {
            updatePedestalLightIncludedMeshes(displayMesh);
        });
    }

    function createPedestalLight(displayMesh, index) {
        // Stage 8M:
        // Automatyczne lampy przy rzeźbach są wyłączone.
        return null;
    }

    function createPedestalDisplay(position, index) {

        var pedestal = BABYLON.MeshBuilder.CreateBox(
            "ArtSphere_" + index,
            {
                width: 0.95,
                height: 1.1,
                depth: 0.95
            },
            scene
        );

        pedestal.position = position.clone();
        pedestal.isPickable = true;

        var pedestalMat = new BABYLON.StandardMaterial("PedestalMat_" + index, scene);
        pedestalMat.diffuseColor = new BABYLON.Color3(0.66, 0.66, 0.66);
        pedestalMat.specularColor = new BABYLON.Color3(0.08, 0.08, 0.08);
        pedestal.material = pedestalMat;
        registerViewerCollisionMesh(pedestal, "pedestal");
        registerCommonShadowMesh(pedestal, {
            global: true,
            local: true,
            receive: true,
            cast: true
        });

        var sculpture = BABYLON.MeshBuilder.CreateTorusKnot(
            "PedestalSculpture_" + index,
            {
                radius: 0.22,
                tube: 0.07,
                radialSegments: 80,
                tubularSegments: 64,
                p: 2,
                q: 3
            },
            scene
        );

        sculpture.parent = pedestal;
        sculpture.position = new BABYLON.Vector3(0, 0.72, 0);
        sculpture.rotation.x = Math.PI / 2;
        sculpture.rotation.z = 0.28;
        sculpture.isPickable = false;

        var sculptureMat = new BABYLON.StandardMaterial("PedestalSculptureMat_" + index, scene);
        sculptureMat.diffuseColor = new BABYLON.Color3(0.56, 0.56, 0.54);
        sculptureMat.specularColor = new BABYLON.Color3(0.12, 0.12, 0.10);
        sculpture.material = sculptureMat;
        registerViewerCollisionMesh(sculpture, "sculpture");
        registerCommonShadowMesh(sculpture, {
            global: true,
            local: true,
            receive: true,
            cast: true
        });

        pedestal.metadata = pedestal.metadata || {};
        pedestal.metadata.displayType = "pedestal";
        pedestal.metadata.sculptureMesh = sculpture;

        pedestal.metadata.isModel3dSlot = true;
        pedestal.metadata.model3d = pedestal.metadata.model3d || null;
        pedestal.metadata.model3dRuntime = pedestal.metadata.model3dRuntime || null;

        forgetDeletedModel3dSlotName(pedestal.name);
        artSpheres.push(pedestal);

        createPedestalLight(pedestal, index);
        refreshArtworkLightExclusions();
        refreshAllCommonLocalLightTargets();

        if (typeof updateViewerModePlaceholderVisibility === "function") {
            updateViewerModePlaceholderVisibility();
        }

        return pedestal;
    }

    spherePositions.forEach((pos, index) => {
        createPedestalDisplay(pos, index);
    });

    var artworkMaterials = [
        new BABYLON.Color3(0.8, 0.05, 0.05),
        new BABYLON.Color3(0.05, 0.6, 0.05),
        new BABYLON.Color3(0.05, 0.2, 0.8)
    ];

    var artworkStartPositions = [
        new BABYLON.Vector3(-3, -2.5, -4.8),
        new BABYLON.Vector3(0, -2.5, -4.8),
        new BABYLON.Vector3(3, -2.5, -4.8)
    ];

    artworkStartPositions.forEach((pos, index) => {

        var mat = new BABYLON.StandardMaterial("ArtworkMat_" + index, scene);
        mat.diffuseColor = artworkMaterials[index];
        mat.emissiveColor = artworkMaterials[index];
        mat.disableLighting = true;

        var artwork = BABYLON.MeshBuilder.CreateBox(
            "Artwork_" + index,
            {
                width: artworkWidth,
                height: artworkHeight,
                depth: artworkDepth
            },
            scene
        );

        artwork.position = pos;
        artwork.material = mat;
        artwork.isPickable = true;
        artwork.metadata = artwork.metadata || {};
        artwork.metadata.artworkImage = null;
        artwork.metadata.artworkInfo = normalizeArtworkInfo();
        artwork.metadata.lampMesh = null;
        artwork.metadata.spotLight = null;
        artwork.metadata.isDynamicArtwork = false;
        artwork.metadata.deletedArtwork = false;
        updateArtworkCreateCounterFromName(artwork.name);
        registerViewerCollisionMesh(artwork, "artwork");
        // Obraz nie jest casterem cieni.
        // Wczesniej obraz jako lokalny/globalny caster zostawial prostokatny cien na scianie
        // i wymuszal drogie odswiezanie shadow map podczas przeciagania.
        registerCommonShadowMesh(artwork, {
            global: false,
            local: false,
            receive: false,
            cast: false
        });

        artworks.push(artwork);

        // Auto artwork lights disabled in Stage 8M.
        refreshAllCommonLocalLightTargets();
    });


    artworkCreateCounter = Math.max(artworkCreateCounter, artworks.length);

    function isArtworkDeleted(artwork) {
        return !!(
            artwork &&
            artwork.metadata &&
            artwork.metadata.deletedArtwork
        );
    }

    function getActiveArtworks() {
        return artworks.filter(function (artwork) {
            return !!artwork && !isArtworkDeleted(artwork) && !(artwork.isDisposed && artwork.isDisposed());
        });
    }

    function rememberDeletedArtworkName(name) {
        if (!name) {
            return;
        }

        if (deletedArtworkNames.indexOf(name) === -1) {
            deletedArtworkNames.push(name);
        }
    }

    function forgetDeletedArtworkName(name) {
        deletedArtworkNames = deletedArtworkNames.filter(function (storedName) {
            return storedName !== name;
        });
    }

    function updateArtworkCreateCounterFromName(name) {
        var match = String(name || "").match(/^Artwork_(\d+)$/);

        if (!match) {
            return;
        }

        artworkCreateCounter = Math.max(
            artworkCreateCounter,
            Number(match[1]) + 1
        );
    }

    function getNextArtworkCreateIndex() {
        while (getArtworkByName("Artwork_" + artworkCreateCounter)) {
            artworkCreateCounter += 1;
        }

        var index = artworkCreateCounter;
        artworkCreateCounter += 1;

        return index;
    }

    function getArtworkDisplayIndex(artwork) {
        if (!artwork || !artwork.name) {
            return Math.max(0, artworks.indexOf(artwork));
        }

        var match = String(artwork.name).match(/^Artwork_(\d+)$/);

        if (match) {
            return Number(match[1]);
        }

        return Math.max(0, artworks.indexOf(artwork));
    }

    function getDefaultArtworkPlaceholderColor(index) {
        if (artworkMaterials && artworkMaterials.length) {
            return artworkMaterials[Math.abs(index) % artworkMaterials.length];
        }

        return new BABYLON.Color3(0.75, 0.05, 0.05);
    }

    function createArtworkPlaceholderMaterial(index, baseColor) {
        var material = new BABYLON.StandardMaterial("ArtworkMat_" + index, scene);
        var color = baseColor || getDefaultArtworkPlaceholderColor(index);

        material.diffuseColor = color.clone ? color.clone() : color;
        material.emissiveColor = color.clone ? color.clone() : color;
        material.disableLighting = true;

        return material;
    }

    function createArtworkMeshNoAutoLight(options) {
        options = options || {};

        var index = Number(options.index);

        if (!isFinite(index)) {
            index = getNextArtworkCreateIndex();
        }

        var artworkName = options.name || ("Artwork_" + index);

        if (getArtworkByName(artworkName)) {
            index = getNextArtworkCreateIndex();
            artworkName = "Artwork_" + index;
        }

        var artwork = BABYLON.MeshBuilder.CreateBox(
            artworkName,
            {
                width: artworkWidth,
                height: artworkHeight,
                depth: artworkDepth
            },
            scene
        );

        artwork.position = options.position && options.position.clone
            ? options.position.clone()
            : new BABYLON.Vector3(0, -2.5, -4.8);

        artwork.rotation = options.rotation && options.rotation.clone
            ? options.rotation.clone()
            : new BABYLON.Vector3(0, 0, 0);

        artwork.scaling = options.scaling && options.scaling.clone
            ? options.scaling.clone()
            : new BABYLON.Vector3(1, 1, 1);

        artwork.material = options.material || createArtworkPlaceholderMaterial(index);
        artwork.isPickable = true;
        artwork.metadata = artwork.metadata || {};
        artwork.metadata.artworkImage = null;
        artwork.metadata.artworkInfo = normalizeArtworkInfo(options.artworkInfo);
        artwork.metadata.lampMesh = null;
        artwork.metadata.spotLight = null;
        artwork.metadata.isDynamicArtwork = !!options.isDynamicArtwork;
        artwork.metadata.deletedArtwork = false;
        artwork.metadata.createdAt = options.createdAt || new Date().toISOString();

        registerViewerCollisionMesh(artwork, "artwork");

        registerCommonShadowMesh(artwork, {
            global: false,
            local: false,
            receive: false,
            cast: false
        });

        artworks.push(artwork);
        updateArtworkCreateCounterFromName(artwork.name);
        refreshAllCommonLocalLightTargets();

        return artwork;
    }

    function restoreDeletedArtworkIfNeeded(artwork) {
        if (!artwork) {
            return;
        }

        artwork.metadata = artwork.metadata || {};
        artwork.metadata.deletedArtwork = false;
        forgetDeletedArtworkName(artwork.name);

        artwork.setEnabled(true);
        artwork.isVisible = true;
        artwork.visibility = 1;
        artwork.isPickable = true;
        registerViewerCollisionMesh(artwork, "artwork");
    }

    function getReferenceArtworkForAdd() {
        if (primaryArtwork && !isArtworkDeleted(primaryArtwork)) {
            return primaryArtwork;
        }

        if (activeArtwork && !isArtworkDeleted(activeArtwork)) {
            return activeArtwork;
        }

        var active = getActiveArtworks();

        return active.length ? active[active.length - 1] : null;
    }

    function makeAlternatingOffsets(step, count) {
        var offsets = [0];

        for (var i = 1; i <= count; i++) {
            offsets.push(step * i);
            offsets.push(-step * i);
        }

        return offsets;
    }

    function getArtworkPlacementLimitsForWall(artwork, wallMesh, horizontalAxis, wallAxis, wallValue, targetRotation, referenceHorizontal) {
        if (!wallMesh) {
            return null;
        }

        var horizontalLimits = getImprovedWallHorizontalLimits(
            wallMesh,
            horizontalAxis,
            wallAxis,
            wallValue,
            referenceHorizontal
        );

        var verticalLimits = getWallVerticalLimits(wallMesh);

        if (!horizontalLimits || !verticalLimits) {
            return null;
        }

        var halfWidth = getArtworkHalfSizeOnAxisForRotation(
            artwork,
            horizontalAxis,
            targetRotation
        );

        var halfHeight = getArtworkHalfSizeOnAxis(artwork, "y");

        var minHorizontal = horizontalLimits.min + halfWidth + artworkBoundsSafeMargin;
        var maxHorizontal = horizontalLimits.max - halfWidth - artworkBoundsSafeMargin;
        var minY = verticalLimits.minY + halfHeight + artworkBoundsSafeMargin;
        var maxY = verticalLimits.maxY - halfHeight - artworkBoundsSafeMargin;

        if (minHorizontal > maxHorizontal || minY > maxY) {
            return null;
        }

        return {
            minHorizontal: minHorizontal,
            maxHorizontal: maxHorizontal,
            minY: minY,
            maxY: maxY,
            halfWidth: halfWidth,
            halfHeight: halfHeight
        };
    }

    function tryPlaceArtworkCandidate(newArtwork, wallMesh, wallAxis, wallValue, horizontalAxis, targetRotation, horizontalValue, verticalValue, testedKeys) {
        var key = horizontalValue.toFixed(3) + "|" + verticalValue.toFixed(3);

        if (testedKeys[key]) {
            return false;
        }

        testedKeys[key] = true;

        var candidatePosition = newArtwork.position.clone();
        candidatePosition[horizontalAxis] = horizontalValue;
        candidatePosition[wallAxis] = wallValue;
        candidatePosition.y = verticalValue;

        if (
            !wouldArtworkOverlap(
                newArtwork,
                candidatePosition,
                wallAxis,
                wallValue,
                horizontalAxis
            )
        ) {
            newArtwork.position.copyFrom(candidatePosition);
            newArtwork.rotation.copyFrom(targetRotation);

            setArtworkWallMetadata(
                newArtwork,
                wallMesh,
                wallAxis,
                wallValue,
                horizontalAxis
            );

            newArtwork.computeWorldMatrix(true);
            return true;
        }

        return false;
    }

    function findFreeArtworkPlacementOnWall(newArtwork, reference, wallMesh, wallAxis, wallValue, horizontalAxis, targetRotation) {
        if (!newArtwork || !wallMesh) {
            return false;
        }

        var limits = getArtworkPlacementLimitsForWall(
            newArtwork,
            wallMesh,
            horizontalAxis,
            wallAxis,
            wallValue,
            targetRotation,
            reference ? reference.position[horizontalAxis] : newArtwork.position[horizontalAxis]
        );

        if (!limits) {
            return false;
        }

        var horizontalStep = Math.max(
            limits.halfWidth * 2 + 0.22,
            0.45
        );

        var verticalStep = Math.max(
            limits.halfHeight * 2 + 0.22,
            0.45
        );

        var referenceHorizontal = reference
            ? reference.position[horizontalAxis]
            : (limits.minHorizontal + limits.maxHorizontal) / 2;

        var referenceY = reference
            ? reference.position.y
            : (limits.minY + limits.maxY) / 2;

        referenceHorizontal = BABYLON.Scalar.Clamp(
            referenceHorizontal,
            limits.minHorizontal,
            limits.maxHorizontal
        );

        referenceY = BABYLON.Scalar.Clamp(
            referenceY,
            limits.minY,
            limits.maxY
        );

        var testedKeys = {};
        var horizontalOffsets = makeAlternatingOffsets(horizontalStep, 16);
        var verticalOffsets = makeAlternatingOffsets(verticalStep, 10);

        // Najpierw szukamy najbliżej obrazu referencyjnego:
        // obok, potem wyżej/niżej, coraz dalej po ścianie.
        for (var yIndex = 0; yIndex < verticalOffsets.length; yIndex++) {
            var candidateY = BABYLON.Scalar.Clamp(
                referenceY + verticalOffsets[yIndex],
                limits.minY,
                limits.maxY
            );

            for (var xIndex = 0; xIndex < horizontalOffsets.length; xIndex++) {
                var candidateHorizontal = BABYLON.Scalar.Clamp(
                    referenceHorizontal + horizontalOffsets[xIndex],
                    limits.minHorizontal,
                    limits.maxHorizontal
                );

                if (
                    tryPlaceArtworkCandidate(
                        newArtwork,
                        wallMesh,
                        wallAxis,
                        wallValue,
                        horizontalAxis,
                        targetRotation,
                        candidateHorizontal,
                        candidateY,
                        testedKeys
                    )
                ) {
                    return true;
                }
            }
        }

        // Fallback: pełniejsze skanowanie ściany po siatce.
        // Dzięki temu gdy obok obrazu nie ma miejsca, szukamy dalej na tej samej ścianie.
        var rows = Math.max(
            1,
            Math.floor((limits.maxY - limits.minY) / verticalStep) + 1
        );

        var columns = Math.max(
            1,
            Math.floor((limits.maxHorizontal - limits.minHorizontal) / horizontalStep) + 1
        );

        for (var row = 0; row <= rows; row++) {
            var gridY = rows === 0
                ? (limits.minY + limits.maxY) / 2
                : limits.maxY - ((limits.maxY - limits.minY) * row / rows);

            for (var col = 0; col <= columns; col++) {
                var gridHorizontal = columns === 0
                    ? (limits.minHorizontal + limits.maxHorizontal) / 2
                    : limits.minHorizontal + ((limits.maxHorizontal - limits.minHorizontal) * col / columns);

                if (
                    tryPlaceArtworkCandidate(
                        newArtwork,
                        wallMesh,
                        wallAxis,
                        wallValue,
                        horizontalAxis,
                        targetRotation,
                        gridHorizontal,
                        gridY,
                        testedKeys
                    )
                ) {
                    return true;
                }
            }
        }

        return false;
    }

    function placeArtworkNearReference(newArtwork, reference) {
        if (!newArtwork || !reference) {
            return false;
        }

        var wallData = getArtworkWallDataFromRotation(reference);
        var wallMesh = getWallMeshForArtwork(reference);
        var horizontalAxis = wallData && wallData.horizontalAxis ? wallData.horizontalAxis : "x";
        var wallAxis = wallData && wallData.wallAxis ? wallData.wallAxis : "z";
        var wallValue = wallData && wallData.wallValue !== undefined
            ? wallData.wallValue
            : reference.position[wallAxis];

        var candidateRotation = new BABYLON.Vector3(
            0,
            reference.rotation ? reference.rotation.y : 0,
            0
        );

        newArtwork.rotation.copyFrom(candidateRotation);

        if (
            findFreeArtworkPlacementOnWall(
                newArtwork,
                reference,
                wallMesh,
                wallAxis,
                wallValue,
                horizontalAxis,
                candidateRotation
            )
        ) {
            return true;
        }

        return false;
    }

    function addNewArtworkToScene() {
        var reference = getReferenceArtworkForAdd();
        var index = getNextArtworkCreateIndex();

        var startPosition = reference
            ? reference.position.clone()
            : new BABYLON.Vector3(0, -2.5, -4.8);

        var startRotation = reference
            ? new BABYLON.Vector3(0, reference.rotation.y, 0)
            : new BABYLON.Vector3(0, 0, 0);

        var artwork = createArtworkMeshNoAutoLight({
            index: index,
            name: "Artwork_" + index,
            position: startPosition,
            rotation: startRotation,
            isDynamicArtwork: true
        });

        var placed = false;

        if (reference) {
            placed = placeArtworkNearReference(artwork, reference);
        } else {
            setArtworkWallMetadata(
                artwork,
                null,
                "z",
                artwork.position.z,
                "x"
            );
            placed = true;
        }

        if (!placed) {
            // Stage 8O:
            // Jeżeli nie znaleziono wolnego miejsca, nie zostawiamy nowego obrazu
            // w pozycji startowej, bo mógłby wejść na inny obraz i zostać zapisany.
            deleteArtworkRuntimeNoLights(artwork);
            notifyGalleryStatus("No free space found on this wall. Move or delete another artwork first.");
            return null;
        }

        selectArtwork(artwork, false);
        updateEditHelpStatus();

        return artwork;
    }

    function createMissingArtworkFromState(artworkState) {
        if (!artworkState || !artworkState.name) {
            return null;
        }

        var existing = getArtworkByName(artworkState.name);

        if (existing) {
            restoreDeletedArtworkIfNeeded(existing);
            return existing;
        }

        var stateIndex = artworkState.index !== undefined
            ? Number(artworkState.index)
            : NaN;

        if (!isFinite(stateIndex)) {
            var match = String(artworkState.name).match(/^Artwork_(\d+)$/);
            stateIndex = match ? Number(match[1]) : getNextArtworkCreateIndex();
        }

        var position = artworkState.position
            ? vectorFromState(artworkState.position, new BABYLON.Vector3(0, -2.5, -4.8))
            : new BABYLON.Vector3(0, -2.5, -4.8);

        var rotation = artworkState.rotation
            ? vectorFromState(artworkState.rotation, new BABYLON.Vector3(0, 0, 0))
            : new BABYLON.Vector3(0, 0, 0);

        var scaling = artworkState.scaling
            ? vectorFromState(artworkState.scaling, new BABYLON.Vector3(1, 1, 1))
            : new BABYLON.Vector3(1, 1, 1);

        return createArtworkMeshNoAutoLight({
            index: stateIndex,
            name: artworkState.name,
            position: position,
            rotation: rotation,
            scaling: scaling,
            isDynamicArtwork: !!artworkState.isDynamicArtwork,
            createdAt: artworkState.createdAt || null,
            artworkInfo: artworkState.info || artworkState.artworkInfo || null
        });
    }

    function applyDeletedArtworkNamesFromState(editorState) {
        deletedArtworkNames = Array.isArray(editorState.deletedArtworkNames)
            ? editorState.deletedArtworkNames.slice()
            : [];

        deletedArtworkNames.slice().forEach(function (artworkName) {
            var artwork = getArtworkByName(artworkName);

            if (artwork) {
                // Stage 8N:
                // Bazowe placeholdery są tworzone na starcie sceny, więc po loadzie
                // trzeba je faktycznie usunąć z aktywnego runtime, a nie tylko ukrywać.
                // deleteArtworkRuntimeNoLights() nie dotyka ścian/podłogi/lamp.
                deleteArtworkRuntimeNoLights(artwork);
            }
        });
    }

    function detachArtworkSelectionForDelete(artwork) {
        hideArtworkSelectionGlow(artwork);

        if (
            artwork &&
            artwork.metadata &&
            artwork.metadata.selectionGlowPlane &&
            !artwork.metadata.selectionGlowPlane.isDisposed()
        ) {
            artwork.metadata.selectionGlowPlane.dispose();
            artwork.metadata.selectionGlowPlane = null;
        }

        selectedArtworks = selectedArtworks.filter(function (candidate) {
            return candidate !== artwork;
        });

        if (selectedArtwork === artwork) {
            selectedArtwork = null;
        }

        if (primaryArtwork === artwork) {
            primaryArtwork = selectedArtworks.length ? selectedArtworks[selectedArtworks.length - 1] : null;
        }

        if (referenceArtwork === artwork) {
            referenceArtwork = selectedArtworks.length ? selectedArtworks[0] : null;
        }

        if (activeArtwork === artwork) {
            activeArtwork = primaryArtwork || null;
        }

        isDraggingArtwork = false;
    }

    function disposeArtworkImageOnly(artwork) {
        if (!artwork || !artwork.metadata) {
            return;
        }

        var imagePlane = artwork.metadata.imagePlane || null;
        var imageMaterial = artwork.metadata.imageMaterial || null;

        if (imagePlane && !imagePlane.isDisposed()) {
            try {
                imagePlane.dispose();
            } catch (error) {
                console.warn("Artwork image plane dispose warning:", error);
            }
        }

        if (imageMaterial && imageMaterial.dispose) {
            try {
                if (imageMaterial.diffuseTexture && imageMaterial.diffuseTexture.dispose) {
                    imageMaterial.diffuseTexture.dispose();
                }

                if (
                    imageMaterial.emissiveTexture &&
                    imageMaterial.emissiveTexture !== imageMaterial.diffuseTexture &&
                    imageMaterial.emissiveTexture.dispose
                ) {
                    imageMaterial.emissiveTexture.dispose();
                }

                imageMaterial.dispose();
            } catch (error) {
                console.warn("Artwork image material dispose warning:", error);
            }
        }

        artwork.metadata.imagePlane = null;
        artwork.metadata.imageMaterial = null;
        artwork.metadata.artworkImage = null;
    }

    function deleteArtworkRuntimeNoLights(artwork) {
        if (!artwork || (artwork.isDisposed && artwork.isDisposed())) {
            return false;
        }

        var isDynamicArtwork = !!(
            artwork.metadata &&
            artwork.metadata.isDynamicArtwork
        );

        if (!isDynamicArtwork) {
            rememberDeletedArtworkName(artwork.name);
        }

        detachArtworkSelectionForDelete(artwork);
        unregisterViewerCollisionMesh(artwork);
        disposeArtworkImageOnly(artwork);

        artworks = artworks.filter(function (candidate) {
            return candidate !== artwork;
        });

        artworkLights = artworkLights.filter(function (lightData) {
            return !(lightData && lightData.artwork === artwork);
        });

        if (artwork.metadata) {
            artwork.metadata.lampMesh = null;
            artwork.metadata.spotLight = null;
            artwork.metadata.deletedArtwork = true;
        }

        try {
            artwork.dispose();
        } catch (error) {
            console.warn("Artwork mesh dispose warning:", error);
        }

        refreshAllCommonLocalLightTargets();
        updateEditHelpStatus();
        updateAlignmentPanel();

        return true;
    }

    async function deleteArtworkSafelyNoAutoLights(artwork) {
        if (!artwork || (artwork.isDisposed && artwork.isDisposed()) || isArtworkDeleted(artwork)) {
            return false;
        }

        var imageState = getArtworkImageState(artwork);

        if (imageState) {
            var removedImage = await deleteArtworkImageFromSupabase(imageState);

            if (!removedImage) {
                return false;
            }
        }

        var infoState = getArtworkInfoState(artwork);

        if (infoState && infoState.authorId) {
            await cleanupUnusedAuthorPhotoIfNeeded(infoState.authorId, artwork);
        }

        return deleteArtworkRuntimeNoLights(artwork);
    }

    async function deleteSelectedArtworksNoAutoLights() {
        if (!selectedArtworks.length) {
            notifyGalleryStatus("Select an artwork to delete.");
            return false;
        }

        var artworksToDelete = selectedArtworks.slice();
        notifyGalleryStatus("Deleting selected artwork...");

        var deletedCount = 0;

        for (var i = 0; i < artworksToDelete.length; i++) {
            var deleted = await deleteArtworkSafelyNoAutoLights(artworksToDelete[i]);

            if (deleted) {
                deletedCount += 1;
            }
        }

        selectedArtworks = [];
        primaryArtwork = null;
        referenceArtwork = null;
        activeArtwork = null;
        selectedArtwork = null;
        isDraggingArtwork = false;

        updateEditHelpStatus();
        updateAlignmentPanel();

        if (deletedCount > 0) {
            notifyGalleryStatus("Deleted " + deletedCount + " artwork(s). Save state to keep the change.");
        }

        return deletedCount > 0;
    }


    function normalizeArtworkInfo(info) {
        info = info || {};

        return {
            authorId: String(info.authorId || "").trim(),
            authorPhotoUrl: String(info.authorPhotoUrl || "").trim(),
            authorPhotoUrlOriginal: String(info.authorPhotoUrlOriginal || info.authorPhotoUrl || "").trim(),
            authorPhotoUrlWeb: String(info.authorPhotoUrlWeb || "").trim(),
            authorPhotoUrlMobile: String(info.authorPhotoUrlMobile || "").trim(),
            authorPhotoUrlPreview: String(info.authorPhotoUrlPreview || "").trim(),
            authorPhotoPath: String(info.authorPhotoPath || "").trim(),
            authorPhotoPathWeb: String(info.authorPhotoPathWeb || "").trim(),
            authorPhotoPathMobile: String(info.authorPhotoPathMobile || "").trim(),
            authorPhotoPathPreview: String(info.authorPhotoPathPreview || "").trim(),
            authorPhotoBucket: String(info.authorPhotoBucket || galleryArtworkStorageBucket || "").trim(),
            authorPhotoOriginalName: String(info.authorPhotoOriginalName || "").trim(),
            authorPhotoMimeType: String(info.authorPhotoMimeType || "").trim(),
            authorPhotoMimeTypeWeb: String(info.authorPhotoMimeTypeWeb || "").trim(),
            authorPhotoMimeTypeMobile: String(info.authorPhotoMimeTypeMobile || "").trim(),
            authorPhotoMimeTypePreview: String(info.authorPhotoMimeTypePreview || "").trim(),
            authorPhotoSize: Number(info.authorPhotoSize || 0) || 0,
            authorPhotoSizeWeb: Number(info.authorPhotoSizeWeb || 0) || 0,
            authorPhotoSizeMobile: Number(info.authorPhotoSizeMobile || 0) || 0,
            authorPhotoSizePreview: Number(info.authorPhotoSizePreview || 0) || 0,
            authorPhotoWidthWeb: Number(info.authorPhotoWidthWeb || 0) || 0,
            authorPhotoHeightWeb: Number(info.authorPhotoHeightWeb || 0) || 0,
            authorPhotoWidthMobile: Number(info.authorPhotoWidthMobile || 0) || 0,
            authorPhotoHeightMobile: Number(info.authorPhotoHeightMobile || 0) || 0,
            authorPhotoWidthPreview: Number(info.authorPhotoWidthPreview || 0) || 0,
            authorPhotoHeightPreview: Number(info.authorPhotoHeightPreview || 0) || 0,
            authorPhotoUploadedAt: String(info.authorPhotoUploadedAt || "").trim(),
            authorPhotoVariantsGeneratedAt: String(info.authorPhotoVariantsGeneratedAt || "").trim(),
            authorPhotoVariantsRebuiltAt: String(info.authorPhotoVariantsRebuiltAt || "").trim(),
            authorName: String(info.authorName || "").trim(),
            title: String(info.title || "").trim(),
            description: String(info.description || "").trim()
        };
    }

    function getArtworkInfoState(artwork) {
        if (!artwork || !artwork.metadata) {
            return normalizeArtworkInfo();
        }

        return normalizeArtworkInfo(artwork.metadata.artworkInfo);
    }

    function setArtworkInfoState(artwork, info) {
        if (!artwork) {
            return;
        }

        artwork.metadata = artwork.metadata || {};
        artwork.metadata.artworkInfo = normalizeArtworkInfo(info);
    }

    function hasArtworkInfo(info) {
        info = normalizeArtworkInfo(info);

        return !!(
            info.authorPhotoUrl ||
            info.authorName ||
            info.title ||
            info.description
        );
    }

    function getArtworkInfoPopupMobileMode() {
        if (typeof window === "undefined") {
            return false;
        }

        return window.matchMedia
            ? window.matchMedia("(max-width: 768px), (pointer: coarse)").matches
            : window.innerWidth <= 768;
    }

    function getArtworkPopupDistance() {
        // Stage 8V:
        // Na mobile kamera zwykle stoi dalej od obrazu i ma inne FOV/sterowanie,
        // więc popup musi aktywować się z większego dystansu niż na desktopie.
        if (getArtworkInfoPopupMobileMode()) {
            // Stage 8Y:
            // Mobile ma taki sam dystans w Viewer Mode i Edit Mode,
            // ale mniejszy niż w 8X1, żeby popup pokazywał się nieco później.
            return 6.65;
        }

        // Desktop też ma mieć taki sam dystans w Viewer Mode i Edit Mode.
        return 3.9;
    }

    // STAGE 11E - CENTER RAY POPUP TARGET
    // Popup nie wybiera już najbliższego obrazu w promieniu.
    // Najpierw musi trafić "niewidzialnym punktem" w środku kamery / ekranu.
    // Dystans aktywacji zostaje taki sam jak wcześniej.
    var artworkInfoPopupCenterRayEnabled = true;
    var artworkInfoPopupCenterRayLengthExtra = 1.5;
    var artworkInfoPopupLastTargetDebug = null;

    function getArtworkFromPopupPickMesh(mesh) {
        if (!mesh) {
            return null;
        }

        if (artworks.indexOf(mesh) >= 0) {
            return mesh;
        }

        if (
            mesh.metadata &&
            mesh.metadata.isArtworkImagePlane
        ) {
            var baseName = mesh.metadata.parentArtworkName || (
                mesh.name
                    ? mesh.name.replace(/_ImagePlane$/, "")
                    : ""
            );

            for (var i = 0; i < artworks.length; i++) {
                if (artworks[i] && artworks[i].name === baseName) {
                    return artworks[i];
                }
            }
        }

        return null;
    }

    function isArtworkPopupRayCandidate(mesh) {
        var artwork = getArtworkFromPopupPickMesh(mesh);

        if (!artwork) {
            return false;
        }

        if (artwork.isDisposed && artwork.isDisposed()) {
            return false;
        }

        if (typeof isArtworkDeleted === "function" && isArtworkDeleted(artwork)) {
            return false;
        }

        return true;
    }

    function getCenterRayArtworkForInfoPopup() {
        if (!camera || !scene || !scene.pickWithRay) {
            return null;
        }

        var maxDistance = getArtworkPopupDistance();
        var rayLength = maxDistance + artworkInfoPopupCenterRayLengthExtra;
        var ray;

        try {
            ray = camera.getForwardRay(rayLength);
        } catch (error) {
            console.warn("Artwork popup center ray warning:", error);
            return null;
        }

        var pickResult = scene.pickWithRay(
            ray,
            isArtworkPopupRayCandidate
        );

        if (!pickResult || !pickResult.hit || !pickResult.pickedMesh) {
            artworkInfoPopupLastTargetDebug = {
                mode: "centerRay",
                hit: false,
                maxDistance: maxDistance
            };
            return null;
        }

        var artwork = getArtworkFromPopupPickMesh(pickResult.pickedMesh);

        if (!artwork) {
            artworkInfoPopupLastTargetDebug = {
                mode: "centerRay",
                hit: true,
                rejected: "notArtwork",
                pickedMesh: pickResult.pickedMesh ? pickResult.pickedMesh.name : ""
            };
            return null;
        }

        var artworkPosition = artwork.getAbsolutePosition
            ? artwork.getAbsolutePosition()
            : artwork.position;

        var distance = BABYLON.Vector3.Distance(
            camera.position,
            artworkPosition
        );

        if (distance > maxDistance) {
            artworkInfoPopupLastTargetDebug = {
                mode: "centerRay",
                hit: true,
                rejected: "distance",
                artwork: artwork.name,
                distance: distance,
                maxDistance: maxDistance
            };
            return null;
        }

        artworkInfoPopupLastTargetDebug = {
            mode: "centerRay",
            hit: true,
            artwork: artwork.name,
            pickedMesh: pickResult.pickedMesh.name,
            distance: distance,
            maxDistance: maxDistance
        };

        return artwork;
    }

    function getNearestArtworkForInfoPopup() {
        if (!camera) {
            return null;
        }

        if (artworkInfoPopupCenterRayEnabled) {
            return getCenterRayArtworkForInfoPopup();
        }

        var activeArtworks = typeof getActiveArtworks === "function"
            ? getActiveArtworks()
            : artworks;

        var nearestArtwork = null;
        var nearestDistance = Infinity;
        var maxDistance = getArtworkPopupDistance();

        activeArtworks.forEach(function (artwork) {
            if (!artwork || (artwork.isDisposed && artwork.isDisposed())) {
                return;
            }

            if (typeof isArtworkDeleted === "function" && isArtworkDeleted(artwork)) {
                return;
            }

            var distance = BABYLON.Vector3.Distance(
                camera.position,
                artwork.getAbsolutePosition()
            );

            if (distance < maxDistance && distance < nearestDistance) {
                nearestArtwork = artwork;
                nearestDistance = distance;
            }
        });

        artworkInfoPopupLastTargetDebug = {
            mode: "nearestFallback",
            artwork: nearestArtwork ? nearestArtwork.name : null,
            distance: nearestDistance,
            maxDistance: maxDistance
        };

        return nearestArtwork;
    }

    function updateArtworkInfoPopupContent(artwork) {
        if (!artworkInfoPopup || !artworkInfoPopupRefs) {
            return;
        }

        var info = getArtworkInfoState(artwork);
        var hasInfo = hasArtworkInfo(info);

        if (artworkInfoPopupRefs.photo) {
            var popupAuthorPhotoUrl = getBestAuthorPhotoUrlFromInfo(info);

            if (popupAuthorPhotoUrl) {
                artworkInfoPopupRefs.photo.src = popupAuthorPhotoUrl;
                artworkInfoPopupRefs.photo.classList.add("is-visible");

                if (artworkInfoPopupRefs.photoPlaceholder) {
                    artworkInfoPopupRefs.photoPlaceholder.style.display = "none";
                }
            } else {
                artworkInfoPopupRefs.photo.removeAttribute("src");
                artworkInfoPopupRefs.photo.classList.remove("is-visible");

                if (artworkInfoPopupRefs.photoPlaceholder) {
                    artworkInfoPopupRefs.photoPlaceholder.style.display = hasInfo ? "flex" : "none";
                }
            }
        }

        if (artworkInfoPopupRefs.authorName) {
            artworkInfoPopupRefs.authorName.innerText = hasInfo ? (info.authorName || "Unknown author") : "";
            artworkInfoPopupRefs.authorName.style.display = hasInfo ? "block" : "none";
        }

        if (artworkInfoPopupRefs.title) {
            artworkInfoPopupRefs.title.innerText = info.title || "Untitled artwork";
            artworkInfoPopupRefs.title.style.display = hasInfo ? "" : "none";
        }

        if (artworkInfoPopupRefs.description) {
            artworkInfoPopupRefs.description.innerText = info.description || "";
            artworkInfoPopupRefs.description.style.display = info.description ? "" : "none";
        }

        if (artworkInfoPopupRefs.empty) {
            artworkInfoPopupRefs.empty.style.display = hasInfo ? "none" : "";
        }
    }

    function showArtworkInfoPopup(artwork) {
        if (!artworkInfoPopup || !artwork) {
            return;
        }

        if (currentArtworkInfoPopupMesh !== artwork) {
            updateArtworkInfoPopupContent(artwork);
            currentArtworkInfoPopupMesh = artwork;
        }

        artworkInfoPopup.style.visibility = "";
        artworkInfoPopup.style.opacity = "";
        artworkInfoPopup.classList.add("is-visible");
    }

    function hideArtworkInfoPopup() {
        if (!artworkInfoPopup) {
            return;
        }

        artworkInfoPopup.classList.remove("is-visible");
        artworkInfoPopup.style.visibility = "hidden";
        artworkInfoPopup.style.opacity = "0";
        currentArtworkInfoPopupMesh = null;
    }

    function updateArtworkInfoPopup() {
        if (artworkInfoPopup) {
            artworkInfoPopup.classList.toggle(
                "is-mobile-popup",
                getArtworkInfoPopupMobileMode()
            );
        }

        var artwork = getNearestArtworkForInfoPopup();

        if (!artwork) {
            hideArtworkInfoPopup();
            return;
        }

        showArtworkInfoPopup(artwork);
    }

    scene.onPointerDown = function (evt, pickResult) {

        if (isMobileViewerActive()) {
            evt.preventDefault();
            beginMobileCanvasLook(evt);
            return;
        }

        // TRYB EDYCJI = prawy przycisk myszy czysci zaznaczenie i aktywne narzedzia.
        if (editMode && evt.button === 2) {
            evt.preventDefault();
            clearEditSelection();

            if (lightingPanelMode === "lighting" && lightingContentMode === "local") {
                clearLocalLightSelection();
                setLightingContentMode("main");
                setEditorPanelMode("edit");
            }

            return;
        }

        if (evt.button === 0) {

            evt.preventDefault();

            // STAGE 11I - IMAGE PLANE EDIT SELECTION PASS-THROUGH
            // Po Stage 11F widoczna grafika imagePlane jest pickable dla center-ray popupu.
            // Kliknięcie w grafikę ma jednak działać jak kliknięcie w fizyczny Artwork_XX.
            var pickedArtworkMesh = pickResult.hit
                ? getArtworkFromPopupPickMesh(pickResult.pickedMesh)
                : null;

            var pickedLocalLightItem = pickResult.hit
                ? getLocalLightItemByMesh(pickResult.pickedMesh)
                : null;

            if (editMode && pickedLocalLightItem) {
                // Selekcja lamp automatycznie odznacza obrazy i narzedzia edycji obrazow.
                clearEditSelection();

                setEditorPanelMode("lighting");
                setLightingContentMode("local");
                selectLocalLightItem(
                    pickedLocalLightItem,
                    evt.shiftKey
                );
                return;
            }

            if (isLocalLightsPanelActive()) {
                if (
                    pickResult.hit &&
                    pickedArtworkMesh
                ) {
                    clearLocalLightSelection();
                    setLightingContentMode("main");
                    setEditorPanelMode("edit");
                    // Nie returnujemy - ponizej standardowa logika zaznaczy obraz.
                } else {
                    if (!evt.shiftKey) {
                        clearLocalLightSelection();
                    }

                    return;
                }
            }

            // TRYB EDYCJI = wybrany kolor nakłada się tylko na kliknięty segment ściany.
            if (
                editMode &&
                selectedWallMaterial &&
                !activeArtwork &&
                pickResult.hit &&
                wallMeshes.includes(pickResult.pickedMesh) &&
                isPaintableWallSegmentMesh(pickResult.pickedMesh)
            ) {
                applyWallColorMaterialToSegment(
                    pickResult.pickedMesh,
                    selectedWallMaterial
                );

                return;
            }

            // TRYB EDYCJI = klik w obraz zaznacza go.
            // Klik + przeciagniecie obrazu przesuwa go po scianie jak w pierwotnej wersji.
            // Dwuklik w ten sam obraz podjezdza kamera do obrazu.
            if (
                editMode &&
                pickResult.hit &&
                pickedArtworkMesh
            ) {
                var clickedArtwork = pickedArtworkMesh;
                var currentClickTime = Date.now();

                var isDoubleClick =
                    lastArtworkClickMesh === clickedArtwork &&
                    currentClickTime - lastArtworkClickTime <= doubleClickDelay;

                selectArtwork(
                    clickedArtwork,
                    evt.shiftKey
                );

                if (!evt.shiftKey) {
                    selectedArtwork = clickedArtwork;
                    isDraggingArtwork = true;
                    dragMoved = false;

                    camera.detachControl(canvas);
                }

                if (isDoubleClick && !evt.shiftKey) {
                    focusCameraOnObject(clickedArtwork);

                    isDraggingArtwork = false;
                    selectedArtwork = null;

                    attachGalleryCameraControl();

                    lastArtworkClickMesh = null;
                    lastArtworkClickTime = 0;
                } else {
                    lastArtworkClickMesh = clickedArtwork;
                    lastArtworkClickTime = currentClickTime;
                }

                return;
            }

            // TRYB EDYCJI = klik w sciane z aktywnym obrazem zaczyna jego przesuwanie.
            if (
                editMode &&
                activeArtwork &&
                pickResult.hit &&
                wallMeshes.includes(pickResult.pickedMesh)
            ) {
                selectedArtwork = activeArtwork;
                primaryArtwork = activeArtwork;
                isDraggingArtwork = true;
                dragMoved = false;

                camera.detachControl(canvas);

                placeArtworkOnWall(
                    selectedArtwork,
                    pickResult
                );

                return;
            }

            // TRYB EDYCJI = klik w postument zaczyna przeciaganie po podlodze.
            // Jesli tylko klikniesz bez przeciagania, kamera podjedzie do postumentu.
            if (
                editMode &&
                pickResult.hit &&
                (
                    artSpheres.includes(pickResult.pickedMesh) ||
                    getModel3dSlotFromPickedMesh(pickResult.pickedMesh)
                )
            ) {
                var clickedModel3dSlot = getModel3dSlotFromPickedMesh(pickResult.pickedMesh) || pickResult.pickedMesh;

                selectModel3dSlot(clickedModel3dSlot);

                // Klik nadal może rozpocząć drag, ale zaznaczenie zostaje po puszczeniu.
                isDraggingSphere = true;
                dragMoved = false;

                camera.detachControl(canvas);

                return;
            }

            // STAGE 12B - aktywny slot modelu można przestawiać kliknięciem/przeciągnięciem po podłodze.
            if (
                editMode &&
                activeModel3dSlot &&
                pickResult.hit &&
                floorMeshes.includes(pickResult.pickedMesh)
            ) {
                selectedSphere = activeModel3dSlot;
                isDraggingSphere = true;
                dragMoved = false;

                camera.detachControl(canvas);

                return;
            }

            // TRYB OGLADANIA = klik w obraz podjezdza kamera frontem do obrazu.
            if (
                !editMode &&
                pickResult.hit &&
                pickedArtworkMesh
            ) {
                focusCameraOnObject(pickedArtworkMesh);
                return;
            }

            // TRYB OGLADANIA = klik w postument podjezdza kamera do postumentu.
            if (
                !editMode &&
                pickResult.hit &&
                (
                    artSpheres.includes(pickResult.pickedMesh) ||
                    getModel3dSlotFromPickedMesh(pickResult.pickedMesh)
                )
            ) {
                focusCameraOnObject(getModel3dSlotFromPickedMesh(pickResult.pickedMesh) || pickResult.pickedMesh);
                return;
            }

            // TRYB EDYCJI = klik w podloge nie wykonuje akcji, jeśli nie mamy aktywnego slotu/modelu.
            if (
                editMode &&
                pickResult.hit &&
                floorMeshes.includes(pickResult.pickedMesh)
            ) {
                return;
            }

            // Klik w podloge = chodzenie.
            if (
                pickResult.hit &&
                floorMeshes.includes(pickResult.pickedMesh)
            ) {
                let targetPoint = pickResult.pickedPoint;

                if (lookAtObserver) {
                    scene.onBeforeRenderObservable.remove(lookAtObserver);
                    lookAtObserver = null;
                }

                resetViewerWASDMovementRuntime(true);

                BABYLON.Animation.CreateAndStartAnimation(
                    "cameraMove",
                    camera,
                    "position",
                    60,
                    120,
                    camera.position.clone(),
                    new BABYLON.Vector3(
                        targetPoint.x,
                        camera.position.y,
                        targetPoint.z
                    ),
                    BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
                );
            }
        }
    };

    scene.onPointerMove = function (evt) {

        if (isMobileViewerActive() && mobileLookActive) {
            evt.preventDefault();
            updateMobileCanvasLook(evt);
            return;
        }

        // PRZESUWANIE ZAZNACZONEGO OBRAZU PO SCIANIE W TRYBIE EDYCJI
        if (editMode && isDraggingArtwork && selectedArtwork) {

            var pickWall = scene.pick(
                scene.pointerX,
                scene.pointerY,
                function (mesh) {
                    return wallMeshes.includes(mesh);
                }
            );

            if (pickWall.hit) {
                dragMoved = true;

                placeArtworkOnWall(
                    selectedArtwork,
                    pickWall
                );

                updateAlignmentPanel();
            }
        }

        // PRZESUWANIE POSTUMENTU PO PODLODZE W TRYBIE EDYCJI
        if (editMode && isDraggingSphere && selectedSphere) {

            var pickFloor = scene.pick(
                scene.pointerX,
                scene.pointerY,
                function (mesh) {
                    return floorMeshes.includes(mesh);
                }
            );

            if (pickFloor.hit) {

                dragMoved = true;

                var floorPoint = pickFloor.pickedPoint;

                selectedSphere.position.x = floorPoint.x;
                selectedSphere.position.z = floorPoint.z;

                // wysokosc postumentu zostaje taka sama jak byla
                // jesli chcesz inna wysokosc, zmien wartosc Y tutaj.
                selectedSphere.position.y = selectedSphere.position.y;

                updatePedestalLight(selectedSphere);
                updateViewerModePlaceholderVisibility();
            }
        }
    };

    scene.onPointerUp = function (evt) {

        if (isMobileViewerActive() && mobileLookActive) {
            evt.preventDefault();
            endMobileCanvasLook(evt);
            return;
        }

        if (editMode && isDraggingArtwork) {

            var releasedArtwork = selectedArtwork;

            isDraggingArtwork = false;
            selectedArtwork = null;
            dragMoved = false;

            // Finalny refresh po puszczeniu obrazu.
            // Obraz nie jest casterem, wiec nie ma sensu odswiezac wszystkich lokalnych shadow map.
            // Wystarczy lampa przypisana do tego obrazu.
            if (
                releasedArtwork &&
                releasedArtwork.metadata &&
                releasedArtwork.metadata.spotLight
            ) {
                requestLocalSpotShadowRefresh(
                    getLocalLightItemByLight(releasedArtwork.metadata.spotLight),
                    true
                );
            }

            attachGalleryCameraControl();
            updateAlignmentPanel();
        }

        if (editMode && isDraggingSphere) {

            // STAGE 12B:
            // Klik bez przeciagania nie robi focusu i nie kasuje zaznaczenia.
            // Ma działać jak zaznaczenie obrazu: slot zostaje aktywny w panelu.
            if (!dragMoved && selectedSphere) {
                selectModel3dSlot(selectedSphere);
            }

            isDraggingSphere = false;
            dragMoved = false;

            requestAllLocalSpotShadowRefresh(true);
            updateViewerModePlaceholderVisibility();
            updateModel3dSlotUi();

            attachGalleryCameraControl();
        }
    };


    // ============================================================
    // WEB STATE / SUPABASE
    // ============================================================

    function notifyGalleryStatus(message) {
        if (!message) {
            return;
        }

        window.dispatchEvent(new CustomEvent("gallery-status", {
            detail: {
                message: message
            }
        }));
    }

    function vectorToState(vector) {
        return serializeVector3(vector);
    }

    function vectorFromState(data, fallback) {
        return deserializeVector3(data, fallback || new BABYLON.Vector3(0, 0, 0));
    }

    function colorToState(color) {
        if (!color) {
            return null;
        }

        return color3ToHex(color);
    }

    function colorFromState(data, fallback) {
        if (!data) {
            return fallback || null;
        }

        if (typeof data === "string") {
            return hexToColor3(data);
        }

        if (typeof data === "object") {
            return new BABYLON.Color3(
                Number(data.r) || 0,
                Number(data.g) || 0,
                Number(data.b) || 0
            );
        }

        return fallback || null;
    }

    function getMeshByNameFromList(list, name) {
        if (!name || !Array.isArray(list)) {
            return null;
        }

        for (var i = 0; i < list.length; i++) {
            if (list[i] && list[i].name === name) {
                return list[i];
            }
        }

        return null;
    }

    function getArtworkByName(name) {
        return getMeshByNameFromList(artworks, name);
    }

    function getSphereByName(name) {
        return getMeshByNameFromList(artSpheres, name);
    }

    function getWallMeshByName(name) {
        return getMeshByNameFromList(wallMeshes, name);
    }

    function getWallColorNameFromMaterial(material) {
        if (!material) {
            return null;
        }

        if (material.metadata && material.metadata.wallColorName) {
            return normalizeWallColorName(material.metadata.wallColorName);
        }

        if (material.name && material.name.indexOf("WallColor_") === 0) {
            return normalizeWallColorName(material.name.replace("WallColor_", ""));
        }

        return null;
    }

    function getMaterialState(material) {
        if (!material) {
            return null;
        }

        return {
            name: material.name || null,
            diffuseColor: material.diffuseColor ? colorToState(material.diffuseColor) : null,
            emissiveColor: material.emissiveColor ? colorToState(material.emissiveColor) : null,
            albedoColor: material.albedoColor ? colorToState(material.albedoColor) : null
        };
    }

    function applyMaterialStateToMesh(mesh, materialState) {
        if (!mesh || !materialState || !mesh.material) {
            return;
        }

        var diffuseColor = colorFromState(materialState.diffuseColor, null);
        var emissiveColor = colorFromState(materialState.emissiveColor, null);
        var albedoColor = colorFromState(materialState.albedoColor, null);

        if (diffuseColor && mesh.material.diffuseColor) {
            mesh.material.diffuseColor = diffuseColor;
        }

        if (emissiveColor && mesh.material.emissiveColor) {
            mesh.material.emissiveColor = emissiveColor;
        }

        if (albedoColor && mesh.material.albedoColor) {
            mesh.material.albedoColor = albedoColor;
        }
    }

    function serializeEditorState() {
        return {
            version: "Gallery_V0_11_editor",
            selectedWallMaterialName: getWallColorNameFromMaterial(selectedWallMaterial),
            walls: wallMeshes.map(function (wallMesh) {
                return {
                    name: wallMesh.name,
                    materialName: wallMesh.material ? wallMesh.material.name : null,
                    colorName: getWallColorNameFromMaterial(wallMesh.material),
                    isSegment: isPaintableWallSegmentMesh(wallMesh),
                    paintable: isPaintableWallSegmentMesh(wallMesh),
                    segmentColorName: wallMesh.metadata
                        ? wallMesh.metadata.wallSegmentColorName || null
                        : null
                };
            }),
            deletedArtworkNames: deletedArtworkNames.slice(),
            deletedModel3dSlotNames: deletedModel3dSlotNames.slice(),
            authors: artworkAuthors.map(function (author) {
                return normalizeAuthorRecord(author);
            }),
            artworks: getActiveArtworks().map(function (artwork, index) {
                var wallData = getArtworkWallDataFromRotation(artwork);
                var wallMesh = getWallMeshForArtwork(artwork);

                return {
                    name: artwork.name,
                    index: getArtworkDisplayIndex(artwork),
                    isDynamicArtwork: !!(artwork.metadata && artwork.metadata.isDynamicArtwork),
                    createdAt: artwork.metadata && artwork.metadata.createdAt ? artwork.metadata.createdAt : null,
                    position: vectorToState(artwork.position),
                    rotation: vectorToState(artwork.rotation),
                    scaling: vectorToState(artwork.scaling),
                    wall: {
                        wallMeshName: wallMesh ? wallMesh.name : null,
                        wallAxis: wallData ? wallData.wallAxis : null,
                        wallValue: wallData ? wallData.wallValue : null,
                        horizontalAxis: wallData ? wallData.horizontalAxis : null
                    },
                    material: getMaterialState(artwork.material),
                    image: getArtworkImageState(artwork),
                    artworkTransform: getArtworkTransformState(artwork),
                    info: getArtworkInfoState(artwork)
                };
            }),
            spheres: artSpheres.map(function (sphere, index) {
                return {
                    name: sphere.name,
                    index: index,
                    position: vectorToState(sphere.position),
                    rotation: vectorToState(sphere.rotation),
                    scaling: vectorToState(sphere.scaling),
                    material: getMaterialState(sphere.material),
                    isModel3dSlot: !!(sphere.metadata && sphere.metadata.isModel3dSlot),
                    isDynamicModelSlot: !!(sphere.metadata && sphere.metadata.isDynamicModelSlot),
                    model3d: getModel3dState(sphere)
                };
            })
        };
    }

    function applyEditorState(editorState) {
        if (!editorState || typeof editorState !== "object") {
            return;
        }

        if (editorState.selectedWallMaterialName && wallColorMaterials[editorState.selectedWallMaterialName]) {
            selectedWallMaterial = wallColorMaterials[editorState.selectedWallMaterialName];
        }

        if (Array.isArray(editorState.walls)) {
            editorState.walls.forEach(function (wallState) {
                if (!wallState) {
                    return;
                }

                var wallMesh = getWallMeshByName(wallState.name);
                var colorName = normalizeWallColorName(
                    wallState.segmentColorName ||
                    wallState.colorName ||
                    (
                        wallState.materialName && wallState.materialName.indexOf("WallColor_") === 0
                            ? wallState.materialName.replace("WallColor_", "")
                            : null
                    )
                );

                if (
                    wallMesh &&
                    colorName &&
                    wallColorMaterials[colorName] &&
                    isPaintableWallSegmentMesh(wallMesh)
                ) {
                    applyWallColorMaterialToSegment(
                        wallMesh,
                        wallColorMaterials[colorName]
                    );
                }
            });
        }

        try {
            artworkAuthors = Array.isArray(editorState.authors)
                ? editorState.authors.map(function (author) {
                    return normalizeAuthorRecord(author);
                }).filter(function (author) {
                    return !!(author && author.id);
                })
                : [];
        } catch (authorLoadError) {
            console.warn("Author library load warning:", authorLoadError);
            artworkAuthors = [];
        }

        if (Array.isArray(editorState.artworks)) {
            applyDeletedArtworkNamesFromState(editorState);

            editorState.artworks.forEach(function (artworkState) {
                createMissingArtworkFromState(artworkState);
            });

            editorState.artworks.forEach(function (artworkState) {
                if (!artworkState) {
                    return;
                }

                var artwork = getArtworkByName(artworkState.name);

                if (!artwork && artworkState.index !== undefined) {
                    artwork = artworks[Number(artworkState.index)] || null;
                }

                if (!artwork || isArtworkDeleted(artwork)) {
                    return;
                }

                if (artworkState.position) {
                    artwork.position.copyFrom(
                        vectorFromState(artworkState.position, artwork.position)
                    );
                }

                if (artworkState.rotation) {
                    artwork.rotation.copyFrom(
                        vectorFromState(artworkState.rotation, artwork.rotation)
                    );
                }

                if (artworkState.scaling) {
                    artwork.scaling.copyFrom(
                        vectorFromState(artworkState.scaling, artwork.scaling)
                    );
                }

                if (artworkState.wall) {
                    setArtworkWallMetadata(
                        artwork,
                        getWallMeshByName(artworkState.wall.wallMeshName),
                        artworkState.wall.wallAxis,
                        artworkState.wall.wallValue,
                        artworkState.wall.horizontalAxis
                    );
                }

                applyMaterialStateToMesh(artwork, artworkState.material);

                setArtworkInfoState(
                    artwork,
                    artworkState.info || artworkState.artworkInfo || null
                );

                try {
                    var restoredInfo = getArtworkInfoState(artwork);
                    var restoredAuthor = getAuthorById(restoredInfo.authorId) || getAuthorByName(restoredInfo.authorName);

                    if (restoredAuthor) {
                        syncArtworkInfoWithAuthor(artwork, restoredAuthor);
                    }
                } catch (artworkAuthorRestoreError) {
                    console.warn("Artwork author restore warning:", artworkAuthorRestoreError);
                }

                var savedArtworkTransform = null;

                if (artworkState.artworkTransform) {
                    savedArtworkTransform = artworkState.artworkTransform;
                    setArtworkTransformState(artwork, savedArtworkTransform);
                } else if (
                    artworkState.image &&
                    artworkState.image.transform
                ) {
                    savedArtworkTransform = artworkState.image.transform;
                    setArtworkTransformState(artwork, savedArtworkTransform);
                }

                var hasArtworkImageState = !!(
                    artworkState.image ||
                    artworkState.artworkImage ||
                    artworkState.imageUrl ||
                    artworkState.imagePath
                );

                if (hasArtworkImageState) {
                    try {
                        applyArtworkImageState(
                            artwork,
                            artworkState.image || artworkState.artworkImage || {
                                imageUrl: artworkState.imageUrl || "",
                                imagePath: artworkState.imagePath || "",
                                fitMode: artworkState.fitMode || galleryArtworkDefaultFitMode
                            }
                        );
                    } catch (artworkImageApplyError) {
                        console.warn("Artwork image apply warning:", artworkImageApplyError, artworkState);
                    }
                } else {
                    // Stage 8P:
                    // Placeholder bez tekstury też jest pełnoprawnym artworkiem.
                    // Nie wolno przy loadzie resetować jego skali/rotacji tylko dlatego,
                    // że image = null.
                    // Usuwamy imagePlane tylko wtedy, gdy realnie istnieje po poprzednim stanie.
                    if (
                        artwork.metadata &&
                        (
                            artwork.metadata.artworkImage ||
                            artwork.metadata.imagePlane ||
                            artwork.metadata.imageMaterial
                        )
                    ) {
                        removeArtworkImageFromMesh(artwork, true);
                    }

                    if (artworkState.position) {
                        artwork.position.copyFrom(
                            vectorFromState(artworkState.position, artwork.position)
                        );
                    }

                    if (artworkState.rotation) {
                        artwork.rotation.copyFrom(
                            vectorFromState(artworkState.rotation, artwork.rotation)
                        );
                    }

                    if (artworkState.scaling) {
                        artwork.scaling.copyFrom(
                            vectorFromState(artworkState.scaling, artwork.scaling)
                        );
                    }

                    if (savedArtworkTransform) {
                        setArtworkTransformState(artwork, savedArtworkTransform);
                    }
                }

                artwork.computeWorldMatrix(true);
                updateArtworkLight(artwork);
            });
        }

        deletedModel3dSlotNames = Array.isArray(editorState.deletedModel3dSlotNames)
            ? editorState.deletedModel3dSlotNames.slice()
            : [];

        deletedModel3dSlotNames.slice().forEach(function (slotName) {
            var deletedSlot = getSphereByName(slotName);

            if (deletedSlot) {
                deleteModel3dSlotRuntime(deletedSlot, {
                    skipRememberDeleted: true,
                    silent: true
                });
            }
        });

        if (Array.isArray(editorState.spheres)) {
            editorState.spheres.forEach(function (sphereState) {
                if (!sphereState || getSphereByName(sphereState.name)) {
                    return;
                }

                if (sphereState.isDynamicModelSlot || sphereState.model3d) {
                    var slotIndex = sphereState.index !== undefined
                        ? Number(sphereState.index)
                        : getNextModel3dSlotIndex();

                    var slotPosition = sphereState.position
                        ? vectorFromState(sphereState.position, new BABYLON.Vector3(0, -3, 0))
                        : new BABYLON.Vector3(0, -3, 0);

                    var createdSlot = createPedestalDisplay(slotPosition, slotIndex);

                    if (createdSlot && sphereState.name) {
                        createdSlot.name = sphereState.name;
                    }

                    if (createdSlot) {
                        createdSlot.metadata = createdSlot.metadata || {};
                        createdSlot.metadata.isDynamicModelSlot = true;
                        forgetDeletedModel3dSlotName(createdSlot.name);
                    }
                }
            });

            editorState.spheres.forEach(function (sphereState) {
                if (!sphereState) {
                    return;
                }

                var sphere = getSphereByName(sphereState.name);

                if (!sphere && sphereState.index !== undefined) {
                    sphere = artSpheres[Number(sphereState.index)] || null;
                }

                if (!sphere) {
                    return;
                }

                if (sphereState.position) {
                    sphere.position.copyFrom(
                        vectorFromState(sphereState.position, sphere.position)
                    );
                }

                if (sphereState.rotation) {
                    sphere.rotation.copyFrom(
                        vectorFromState(sphereState.rotation, sphere.rotation)
                    );
                }

                if (sphereState.scaling) {
                    sphere.scaling.copyFrom(
                        vectorFromState(sphereState.scaling, sphere.scaling)
                    );
                }

                applyMaterialStateToMesh(sphere, sphereState.material);

                sphere.metadata = sphere.metadata || {};
                sphere.metadata.isModel3dSlot = sphereState.isModel3dSlot !== false;
                sphere.metadata.isDynamicModelSlot = !!sphereState.isDynamicModelSlot;

                if (sphereState.model3d) {
                    applyModel3dStateToSlot(sphere, sphereState.model3d);
                } else {
                    removeModel3dFromSlot(sphere);
                }

                sphere.computeWorldMatrix(true);
                updatePedestalLight(sphere);

                if (sphere === activeModel3dSlot) {
                    setModel3dSlotSelected(sphere, true);
                }
            });
        }

        refreshCommonLightingMaterialSupport();
        refreshArtworkLightExclusions();
        refreshPedestalLightIncludedMeshes();
        refreshAllCommonLocalLightTargets();
        refreshAllLocalSpotShadows();
        updateEditHelpStatus();
        updateAlignmentPanel();
    }

    function serializeGalleryState() {
        return {
            version: "Gallery_V0_11_WEB",
            savedAt: new Date().toISOString(),
            editor: serializeEditorState(),
            lighting: readLightingSettingsFromScene(),
            lightingPresets: readLightingPresets(),
            localLights: readLocalLightStateFromScene()
        };
    }

    function getStateLightCount(state) {
        if (
            state &&
            state.localLights &&
            Array.isArray(state.localLights.lights)
        ) {
            return state.localLights.lights.length;
        }

        return 0;
    }

    function applyGalleryState(state) {
        if (!state || typeof state !== "object") {
            return;
        }

        // Kompatybilność ze starym V0_8: jeśli state nie ma sekcji editor,
        // traktujemy go jako dawny serializeGalleryState().
        var editorState = state.editor || state;

        if (
            editorState &&
            (
                Array.isArray(editorState.walls) ||
                Array.isArray(editorState.artworks) ||
                Array.isArray(editorState.spheres)
            )
        ) {
            applyEditorState(editorState);
        }

        if (state.lighting) {
            applyLightingSettings(state.lighting, true);
        }

        if (Array.isArray(state.lightingPresets)) {
            writeLightingPresets(state.lightingPresets);
            updateLightingPresetRows();
        }

        if (state.localLights) {
            restoreLocalLightState(state.localLights);
        }

        if (state.editor || state.deletedArtworkNames) {
            applyDeletedArtworkNamesFromState(editorState);
        }

        refreshCommonLightingMaterialSupport();
        refreshArtworkLightExclusions();
        refreshPedestalLightIncludedMeshes();
        refreshAllCommonLocalLightTargets();
        refreshAllLocalSpotShadows();
        updateLocalLightsUi();
    }

    function cloneStateWithoutAuthorLibrary(state) {
        var clone = null;

        try {
            clone = JSON.parse(JSON.stringify(state || {}));
        } catch (error) {
            console.warn("State clone warning:", error);
            return null;
        }

        var editorState = clone && clone.editor ? clone.editor : clone;

        if (editorState && typeof editorState === "object") {
            editorState.authors = [];

            if (Array.isArray(editorState.artworks)) {
                editorState.artworks.forEach(function (artworkState) {
                    if (
                        artworkState &&
                        artworkState.info &&
                        typeof artworkState.info === "object"
                    ) {
                        artworkState.info.authorId = "";
                    }

                    if (
                        artworkState &&
                        artworkState.artworkInfo &&
                        typeof artworkState.artworkInfo === "object"
                    ) {
                        artworkState.artworkInfo.authorId = "";
                    }
                });
            }
        }

        return clone;
    }

    function tryApplyGalleryStateSafely(state) {
        try {
            applyGalleryState(state);
            return {
                ok: true,
                usedFallback: false
            };
        } catch (error) {
            console.warn("Saved gallery state apply failed:", error);
        }

        var fallbackState = cloneStateWithoutAuthorLibrary(state);

        if (!fallbackState) {
            return {
                ok: false,
                usedFallback: false
            };
        }

        try {
            artworkAuthors = [];
            applyGalleryState(fallbackState);
            return {
                ok: true,
                usedFallback: true
            };
        } catch (fallbackError) {
            console.warn("Saved gallery state fallback apply failed:", fallbackError);
            return {
                ok: false,
                usedFallback: true
            };
        }
    }

    async function loadGalleryStateFromSupabase() {
        var client = window.gallerySupabase;

        if (!client) {
            // Tryb developerski poza stroną WEB.
            restoreSavedLocalLightStateOnce();
            notifyGalleryStatus("Supabase nie jest skonfigurowany. Uzywam lokalnego fallbacku.");
            return false;
        }

        var response = await client
            .from("gallery_state")
            .select("state, updated_at")
            .eq("id", "main")
            .order("updated_at", {
                ascending: false,
                nullsFirst: false
            })
            .limit(10);

        if (response.error) {
            console.warn(response.error);
            notifyGalleryStatus("Nie udalo sie wczytac stanu galerii.");
            return false;
        }

        var rows = Array.isArray(response.data)
            ? response.data
            : (response.data ? [response.data] : []);

        var row = rows.find(function (candidate) {
            return !!(
                candidate &&
                candidate.state &&
                candidate.state.localLights &&
                Array.isArray(candidate.state.localLights.lights)
            );
        }) || rows[0];

        if (
            row &&
            row.state &&
            Object.keys(row.state).length > 0
        ) {
            var applyResult = tryApplyGalleryStateSafely(row.state);

            if (!applyResult.ok) {
                notifyGalleryStatus("Nie udalo sie wczytac zapisanego stanu galerii.");
                return false;
            }

            if (applyResult.usedFallback) {
                notifyGalleryStatus("Wczytano stan galerii bez biblioteki autorow. Sprawdz ARTWORK INFO i zapisz ponownie.");
            } else {
                notifyGalleryStatus("Wczytano zapisany stan galerii. Lampy: " + getStateLightCount(row.state) + ".");
            }

            return true;
        }

        notifyGalleryStatus("Brak zapisanego stanu. Uzywam ukladu startowego.");
        return false;
    }

    async function saveGalleryStateToSupabase() {
        if (galleryEditorLoginEnabled && !editorAuthenticated) {
            notifyGalleryStatus("Zaloguj sie jako edytor, aby zapisac stan.");
            return false;
        }

        var client = window.gallerySupabase;

        if (!client) {
            notifyGalleryStatus("Supabase nie jest skonfigurowany.");
            return false;
        }

        var state = serializeGalleryState();
        globalThis.BerryboyArtGalleryLatestState = state;

        var payload = {
            id: "main",
            state: state,
            updated_at: new Date().toISOString()
        };

        var response = await client
            .from("gallery_state")
            .upsert(payload, {
                onConflict: "id"
            });

        if (response.error) {
            console.warn(response.error);

            // Fallback dla tabeli bez constraintu/unikalnego id.
            // V0_8 dzialal na id=main; tutaj probujemy utrzymac jeden aktualny rekord.
            var deleteResponse = await client
                .from("gallery_state")
                .delete()
                .eq("id", "main");

            if (deleteResponse.error) {
                console.warn(deleteResponse.error);
            }

            response = await client
                .from("gallery_state")
                .insert(payload);
        }

        if (response.error) {
            console.warn(response.error);
            notifyGalleryStatus("Blad zapisu stanu galerii.");
            return false;
        }

        notifyGalleryStatus("Zapisano stan galerii online. Lampy: " + getStateLightCount(state) + ".");
        return true;
    }

    globalThis.BerryboyArtGalleryWebState = {
        exportState: serializeGalleryState,
        importState: applyGalleryState,
        save: saveGalleryStateToSupabase,
        load: loadGalleryStateFromSupabase
    };

    globalThis.GalleryApp = {
        setEditorAuthenticated: setEditorAuthenticated,
        isEditorLoginEnabled: function () {
            return galleryEditorLoginEnabled;
        },
        setEditorLoginEnabled: function (isEnabled) {
            galleryEditorLoginEnabled = !!isEnabled;
            setEditorAuthenticated(globalThis.galleryEditorAuthenticated);
        },
        saveStateToSupabase: saveGalleryStateToSupabase,
        loadStateFromSupabase: loadGalleryStateFromSupabase,
        getState: serializeGalleryState,
        applyState: applyGalleryState,
        serializeGalleryState: serializeGalleryState,
        applyGalleryState: applyGalleryState,
        getStateSummary: function () {
            var state = serializeGalleryState();

            return {
                version: state.version,
                artworks: state.editor && state.editor.artworks ? state.editor.artworks.length : 0,
                walls: state.editor && state.editor.walls ? state.editor.walls.length : 0,
                spheres: state.editor && state.editor.spheres ? state.editor.spheres.length : 0,
                localLights: state.localLights && state.localLights.lights ? state.localLights.lights.length : 0,
                localGroups: state.localLights && state.localLights.groups ? state.localLights.groups.length : 0,
                hasLighting: !!state.lighting,
                artworkImages: state.editor && state.editor.artworks
                    ? state.editor.artworks.filter(function (artworkState) {
                        return !!(artworkState && artworkState.image);
                    }).length
                    : 0
            };
        },
        applyArtworkImageUrl: function (artworkNameOrIndex, imageUrl) {
            var artwork = typeof artworkNameOrIndex === "number"
                ? artworks[artworkNameOrIndex]
                : getArtworkByName(artworkNameOrIndex);

            return applyArtworkImageState(artwork, {
                imageUrl: imageUrl,
                fitMode: galleryArtworkDefaultFitMode,
                source: "GalleryApp"
            });
        },
        rebuildArtworkImageVariants: function (artworkNameOrIndex) {
            var artwork = typeof artworkNameOrIndex === "number"
                ? artworks[artworkNameOrIndex]
                : getArtworkByName(artworkNameOrIndex);

            return rebuildArtworkImageVariants(artwork);
        },
        rebuildAllArtworkImageVariants: function () {
            return rebuildAllArtworkImageVariants();
        },
        getArtworkImageVariantDebug: function () {
            return getActiveArtworks().map(function (artwork) {
                var imageState = getArtworkImageState(artwork);

                return {
                    name: artwork.name,
                    hasImage: !!imageState,
                    needsVariants: artworkImageStateNeedsVariants(imageState),
                    selectedUrl: getArtworkImageUrlFromState(imageState),
                    mobileDevice: isArtworkMobileTextureDevice(),
                    imageUrl: imageState ? imageState.imageUrl || "" : "",
                    imageUrlWeb: imageState ? imageState.imageUrlWeb || "" : "",
                    imageUrlMobile: imageState ? imageState.imageUrlMobile || "" : "",
                    imageUrlPreview: imageState ? imageState.imageUrlPreview || "" : ""
                };
            });
        },
        removeArtworkImage: function (artworkNameOrIndex) {
            var artwork = typeof artworkNameOrIndex === "number"
                ? artworks[artworkNameOrIndex]
                : getArtworkByName(artworkNameOrIndex);

            return removeArtworkImageWithStorageDelete(artwork);
        },
        addArtwork: function () {
            return addNewArtworkToScene();
        },
        addSculpture: function () {
            return addNewModel3dSlotToScene();
        },
        deleteArtwork: function (artworkNameOrIndex) {
            var artwork = typeof artworkNameOrIndex === "number"
                ? artworks[artworkNameOrIndex]
                : getArtworkByName(artworkNameOrIndex);

            return deleteArtworkSafelyNoAutoLights(artwork);
        },
        deleteSelectedArtworks: deleteSelectedArtworksNoAutoLights,
        deleteSelected: deleteSelectedGalleryObjectsNoAutoLights,
        deleteModel3dSlot: function (slotNameOrIndex) {
            var slot = typeof slotNameOrIndex === "number"
                ? artSpheres[slotNameOrIndex]
                : getSphereByName(slotNameOrIndex);

            return deleteModel3dSlotRuntime(slot);
        },
        uploadModel3dToSlot: function (slotNameOrIndex, file) {
            var slot = typeof slotNameOrIndex === "number"
                ? artSpheres[slotNameOrIndex]
                : getSphereByName(slotNameOrIndex);

            return uploadModel3dToSlot(slot, file);
        },
        applyModel3dUrlToSlot: function (slotNameOrIndex, modelUrl) {
            var slot = typeof slotNameOrIndex === "number"
                ? artSpheres[slotNameOrIndex]
                : getSphereByName(slotNameOrIndex);

            return applyModel3dStateToSlot(slot, createModel3dStateFromUrl(slot, modelUrl));
        },
        removeModel3dFromSlot: function (slotNameOrIndex) {
            var slot = typeof slotNameOrIndex === "number"
                ? artSpheres[slotNameOrIndex]
                : getSphereByName(slotNameOrIndex);

            return removeModel3dFromSlot(slot);
        },
        duplicateSelectedModel3dSlot: duplicateSelectedModel3dSlot,
        copySelectedModel3dToClipboard: copySelectedModel3dToClipboard,
        pasteModel3dFromClipboardToSelectedSlot: pasteModel3dFromClipboardToSelectedSlot,
        getModel3dSlotDebug: getModel3dSlotDebug,
        selectModel3dSlot: function (slotNameOrIndex) {
            var slot = typeof slotNameOrIndex === "number"
                ? artSpheres[slotNameOrIndex]
                : getSphereByName(slotNameOrIndex);

            return selectModel3dSlot(slot);
        },
        clearModel3dSlotSelection: clearModel3dSlotSelection,
        getArtworkImageState: function (artworkNameOrIndex) {
            var artwork = typeof artworkNameOrIndex === "number"
                ? artworks[artworkNameOrIndex]
                : getArtworkByName(artworkNameOrIndex);

            return getArtworkImageState(artwork);
        },
        reapplyArtworkImage: function (artworkNameOrIndex) {
            var artwork = typeof artworkNameOrIndex === "number"
                ? artworks[artworkNameOrIndex]
                : getArtworkByName(artworkNameOrIndex);

            var imageState = getArtworkImageState(artwork);

            if (!artwork || !imageState) {
                return false;
            }

            return applyArtworkImageStateSafely(
                artwork,
                imageState,
                "GalleryApp.reapplyArtworkImage"
            );
        },
        getArtworkInfo: function (artworkNameOrIndex) {
            var artwork = typeof artworkNameOrIndex === "number"
                ? artworks[artworkNameOrIndex]
                : getArtworkByName(artworkNameOrIndex);

            return getArtworkInfoState(artwork);
        },
        setArtworkInfo: function (artworkNameOrIndex, info) {
            var artwork = typeof artworkNameOrIndex === "number"
                ? artworks[artworkNameOrIndex]
                : getArtworkByName(artworkNameOrIndex);

            setArtworkInfoState(artwork, info);
            updateArtworkInfoPopupContent(artwork);

            return getArtworkInfoState(artwork);
        },
        getAuthors: function () {
            return artworkAuthors.map(function (author) {
                return normalizeAuthorRecord(author);
            });
        },
        rebuildAuthorPhotoVariants: function (authorIdOrName) {
            return rebuildAuthorPhotoVariants(authorIdOrName);
        },
        rebuildAllAuthorPhotoVariants: function () {
            return rebuildAllAuthorPhotoVariants();
        },
        getAuthorPhotoVariantDebug: function () {
            return artworkAuthors.map(function (author) {
                author = normalizeAuthorRecord(author);

                return {
                    id: author.id,
                    name: author.name,
                    needsVariants: authorPhotoStateNeedsVariants(author),
                    mobileDevice: isArtworkMobileTextureDevice(),
                    selectedUrl: getBestAuthorPhotoUrlFromInfo(author),
                    photoUrl: author.photoUrl,
                    photoUrlWeb: author.photoUrlWeb,
                    photoUrlMobile: author.photoUrlMobile,
                    photoUrlPreview: author.photoUrlPreview,
                    deletePaths: getAuthorPhotoPathsForDelete(author)
                };
            });
        },
        getArtworkInfoPopupTargetDebug: function () {
            return Object.assign(
                {
                    centerRayEnabled: artworkInfoPopupCenterRayEnabled,
                    popupDistance: getArtworkPopupDistance(),
                    imagePlaneSurfaceEpsilon: artworkImagePlaneSurfaceEpsilon,
                    imagePlanePickableForPopup: artworkImagePlanePickableForPopup,
                    wallColorTextureBaseUrl: wallColorTextureBaseUrl,
                    wallModelRootUrl: typeof wallModelRootUrl !== "undefined" ? wallModelRootUrl : "",
                    artworkImagePlaneMirrorFix: true,
                    imagePlaneEditSelectionPassthrough: true
                },
                artworkInfoPopupLastTargetDebug || {}
            );
        },
        setArtworkInfoPopupCenterRay: function (enabled) {
            artworkInfoPopupCenterRayEnabled = !!enabled;
            return {
                centerRayEnabled: artworkInfoPopupCenterRayEnabled
            };
        },
        updateViewerModePlaceholderVisibility: function () {
            return updateViewerModePlaceholderVisibility();
        },
        getViewerModePlaceholderVisibilityDebug: function () {
            return Object.assign({}, viewerPlaceholderVisibilityDebug);
        },
        getViewerWASDMovementDebug: function () {
            return {
                enabled: viewerWASDMovementEnabled,
                scrollContainmentReady: !!window.__berryboyGalleryScrollContainmentReady,
                editMode: editMode,
                mobileViewerActive: isMobileViewerActive(),
                keys: Object.assign({}, viewerMoveKeys),
                joystick: {
                    active: mobileJoystickActive,
                    x: mobileJoystickVector.x,
                    y: mobileJoystickVector.y,
                    turnEnabled: viewerMovementMobileJoystickTurnEnabled,
                    turnSpeed: viewerMovementMobileJoystickTurnSpeed,
                    turnDeadZone: viewerMovementMobileJoystickTurnDeadZone
                },
                velocity: {
                    x: viewerMovementVelocity.x,
                    y: viewerMovementVelocity.y,
                    z: viewerMovementVelocity.z
                },
                rollLockEnabled: viewerCameraRollLockEnabled,
                cameraRoll: camera && camera.rotation ? camera.rotation.z : 0,
                config: Object.assign({}, viewerMovementConfig)
            };
        },
        setViewerWASDMovementEnabled: function (isEnabled) {
            viewerWASDMovementEnabled = !!isEnabled;

            if (!viewerWASDMovementEnabled) {
                resetViewerWASDMovementRuntime(true);
            }

            return viewerWASDMovementEnabled;
        },
        setViewerMobileJoystickTurnEnabled: function (isEnabled) {
            viewerMovementMobileJoystickTurnEnabled = !!isEnabled;
            return viewerMovementMobileJoystickTurnEnabled;
        },
        setViewerMobileJoystickTurnSpeed: function (speed) {
            var parsed = parseFloat(speed);

            if (!isFinite(parsed)) {
                return viewerMovementMobileJoystickTurnSpeed;
            }

            viewerMovementMobileJoystickTurnSpeed = Math.max(0.1, Math.min(6, parsed));
            return viewerMovementMobileJoystickTurnSpeed;
        },
        findAuthorByName: function (name) {
            return getAuthorByName(name);
        },
        getArtworkStorageSettings: function () {
            return {
                uploadEnabled: galleryArtworkUploadEnabled,
                bucket: galleryArtworkStorageBucket,
                prefix: galleryArtworkStoragePrefix,
                defaultFitMode: galleryArtworkDefaultFitMode
            };
        },
        getViewerCollisionDebug: function () {
            refreshViewerCollisionMeshes();

            return {
                active: isViewerCollisionActive(),
                cameraCheckCollisions: !!camera.checkCollisions,
                sceneCollisionsEnabled: !!scene.collisionsEnabled,
                ellipsoid: camera.ellipsoid ? serializeVector3(camera.ellipsoid) : null,
                targets: Object.assign({}, viewerCollisionTargets),
                wallRaycastBlockActive: isViewerWallBlockActive(),
                wallBlockRadius: viewerWallBlockRadius,
                wallRayExtraDistance: viewerWallRayExtraDistance,
                wallVisualStopDistance: viewerWallVisualStopDistance,
                cameraMinZ: camera.minZ,
                wallLastSafeCameraPosition: viewerWallLastSafeCameraPosition
                    ? serializeVector3(viewerWallLastSafeCameraPosition)
                    : null,
                wallMeshes: wallMeshes.length,
                activeWallCollisionMeshes: getViewerWallCollisionMeshes().length,
                propMeshes: propMeshes.length,
                artworks: getActiveArtworks().length,
                sculptures: artSpheres.length,
                collisionMeshes: scene.meshes.filter(function (mesh) {
                    return !!(mesh && mesh.checkCollisions);
                }).map(function (mesh) {
                    return {
                        name: mesh.name,
                        type: mesh.metadata && mesh.metadata.viewerCollisionType
                            ? mesh.metadata.viewerCollisionType
                            : ""
                    };
                })
            };
        },
        getWallSegmentPaintDebug: function () {
            return getWallSegmentPaintDebug();
        },
        getWallSegmentAlignmentGroupDebug: function () {
            var groups = [];

            wallMeshes.forEach(function (mesh) {
                if (!isAlignmentWallSegmentMesh(mesh)) {
                    return;
                }

                var boundsX = getWallSegmentAlignmentGroupBounds(mesh, "x", null, "z");
                var boundsZ = getWallSegmentAlignmentGroupBounds(mesh, "z", null, "x");

                groups.push({
                    meshName: mesh.name,
                    xPlaneGroup: boundsX
                        ? {
                            segmentCount: boundsX.segmentCount,
                            min: boundsX.min,
                            max: boundsX.max,
                            minY: boundsX.minY,
                            maxY: boundsX.maxY
                        }
                        : null,
                    zPlaneGroup: boundsZ
                        ? {
                            segmentCount: boundsZ.segmentCount,
                            min: boundsZ.min,
                            max: boundsZ.max,
                            minY: boundsZ.minY,
                            maxY: boundsZ.maxY
                        }
                        : null
                });
            });

            return {
                enabled: wallSegmentAlignmentGroupEnabled,
                planeTolerance: wallSegmentAlignmentPlaneTolerance,
                cornerGuardEnabled: wallSegmentAlignmentCornerGuardEnabled,
                intervalMergeTolerance: wallSegmentAlignmentIntervalMergeTolerance,
                wallSegments: groups.length,
                dragUsesAlignmentGroup: true,
                groups: groups
            };
        },
        getWallSegmentLightTargetDebug: function () {
            return getWallSegmentLightTargetDebug();
        },
        refreshLocalLightWallSegmentTargets: function () {
            refreshAllCommonLocalLightTargets();
            return getWallSegmentLightTargetDebug();
        },
        getLocalLightCameraCullingDebug: function () {
            return getLocalLightCameraCullingDebug();
        },
        setLocalLightCameraCulling: function (options) {
            return setLocalLightCameraCullingDebugOptions(options);
        },
        cleanDisabledLocalLights: function () {
            return cleanDisabledLocalLightPool();
        },
        setViewerCollisionTargets: function (targets) {
            targets = targets || {};

            Object.keys(viewerCollisionTargets).forEach(function (key) {
                if (targets[key] !== undefined) {
                    viewerCollisionTargets[key] = !!targets[key];
                }
            });

            scene.meshes.forEach(function (mesh) {
                if (
                    mesh &&
                    mesh.metadata &&
                    mesh.metadata.viewerCollisionType
                ) {
                    unregisterViewerCollisionMesh(mesh);
                }
            });

            refreshViewerCollisionMeshes();
            updateViewerCollisionMode();
            viewerWallLastSafeCameraPosition = camera.position.clone();

            return this.getViewerCollisionDebug();
        },
        getArtworkImagePlaneDepthDebug: function () {
            return scene.meshes.filter(function (mesh) {
                return !!(
                    mesh &&
                    mesh.metadata &&
                    mesh.metadata.isArtworkImagePlane
                );
            }).map(function (mesh) {
                return {
                    name: mesh.name,
                    renderingGroupId: mesh.renderingGroupId,
                    enabled: mesh.isEnabled ? mesh.isEnabled() : false,
                    material: mesh.material ? mesh.material.name : null,
                    depthWriteDisabled: mesh.material && mesh.material.disableDepthWrite !== undefined
                        ? !!mesh.material.disableDepthWrite
                        : null,
                    forceDepthWrite: mesh.material && mesh.material.forceDepthWrite !== undefined
                        ? !!mesh.material.forceDepthWrite
                        : null
                };
            });
        }
    };

    setEditorAuthenticated(editorAuthenticated);
    window.dispatchEvent(new CustomEvent("gallery-ready"));


    return scene;
};