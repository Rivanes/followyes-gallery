/*
  Followyes Gallery
  Plik: Gallery_V0_10.js

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

        camera.rotation.y += dx * desktopViewerMiddleLookSensitivityX;
        camera.rotation.x += dy * desktopViewerMiddleLookSensitivityY;
        camera.rotation.x = BABYLON.Scalar.Clamp(camera.rotation.x, -0.58, 0.58);

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
            addMeshArrayUnique(includedMeshes, wallMeshes);
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
        localLightItems.forEach(function (item) {
            applyCommonLocalLightTargets(item);
        });
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

    function getArtworkImageUrlFromState(imageState) {
        if (!imageState) {
            return "";
        }

        if (imageState.imageUrl) {
            return imageState.imageUrl;
        }

        if (imageState.publicUrl) {
            return imageState.publicUrl;
        }

        if (imageState.imagePath && window.gallerySupabase && window.gallerySupabase.storage) {
            try {
                var publicUrlResponse = window.gallerySupabase
                    .storage
                    .from(imageState.storageBucket || galleryArtworkStorageBucket)
                    .getPublicUrl(imageState.imagePath);

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
        }

        return "";
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

    function createArtworkStoragePath(artwork, file) {
        var safeFileName = createSafeStorageFileName(file && file.name);
        var artworkName = artwork && artwork.name
            ? artwork.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
            : "artwork";

        return galleryArtworkStoragePrefix + "/" + artworkName + "-" + Date.now() + "-" + safeFileName;
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

        imagePlane.parent = artwork;
        imagePlane.position = new BABYLON.Vector3(0, 0, artworkDepth * 0.56);
        imagePlane.rotation = BABYLON.Vector3.Zero();
        imagePlane.isPickable = false;
        imagePlane.metadata = imagePlane.metadata || {};
        imagePlane.metadata.isArtworkImagePlane = true;

        artwork.metadata.imagePlane = imagePlane;

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

        if (
            artwork.metadata &&
            artwork.metadata.imagePlane &&
            !artwork.metadata.imagePlane.isDisposed()
        ) {
            artwork.metadata.imagePlane.scaling.x = 1;
            artwork.metadata.imagePlane.scaling.y = 1;
            artwork.metadata.imagePlane.position = new BABYLON.Vector3(0, 0, artworkDepth * 0.56);
        }

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

        if (
            artwork.metadata &&
            artwork.metadata.imagePlane &&
            !artwork.metadata.imagePlane.isDisposed()
        ) {
            artwork.metadata.imagePlane.scaling.x = 1;
            artwork.metadata.imagePlane.scaling.y = 1;
            artwork.metadata.imagePlane.position = new BABYLON.Vector3(0, 0, artworkDepth * 0.56);
        }
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

    function getArtworkImageBaseMaterial() {
        if (
            galleryArtworkImageBaseMaterial &&
            !galleryArtworkImageBaseMaterial.isDisposed()
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
        imageMaterial.emissiveColor = new BABYLON.Color3(0.16, 0.16, 0.16);
        imageMaterial.specularColor = new BABYLON.Color3(0.03, 0.03, 0.03);
        imageMaterial.backFaceCulling = false;
        imageMaterial.disableLighting = false;

        var texture = new BABYLON.Texture(
            imageUrl,
            scene,
            false,
            true,
            BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
            function () {
                fitArtworkImagePlaneToTexture(
                    artwork,
                    texture,
                    normalizedState.fitMode || galleryArtworkDefaultFitMode
                );

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

        configureMaterialForCommonLighting(imageMaterial);

        imagePlane.material = imageMaterial;
        imagePlane.setEnabled(true);

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
        notifyGalleryStatus("Wgrywam obraz...");

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

        applyArtworkImageState(artwork, {
            imagePath: storagePath,
            imageUrl: publicUrl,
            storageBucket: galleryArtworkStorageBucket,
            originalName: file.name || null,
            size: file.size || null,
            mimeType: file.type || null,
            fitMode: galleryArtworkDefaultFitMode,
            uploadedAt: new Date().toISOString()
        });

        var previousDeleteState = getArtworkStorageDeleteState(previousImageState);

        if (
            previousDeleteState &&
            previousDeleteState.imagePath &&
            previousDeleteState.imagePath !== storagePath
        ) {
            deleteArtworkImageFromSupabase(previousDeleteState)
                .then(function (removedOldFile) {
                    if (!removedOldFile) {
                        console.warn("Previous artwork image was not removed from Storage:", previousDeleteState);
                    }
                })
                .catch(function (error) {
                    console.warn("Previous artwork image delete warning:", error);
                });
        }

        notifyGalleryStatus("Wgrano obraz. Zapisz stan galerii, aby zachowac zmiane.");
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

        return {
            imagePath: imagePath,
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

        var removeResponse = await client
            .storage
            .from(deleteState.storageBucket)
            .remove([deleteState.imagePath]);

        if (removeResponse.error) {
            console.warn("Artwork Storage delete error:", {
                bucket: deleteState.storageBucket,
                path: deleteState.imagePath,
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

    var mobileInitialCameraPosition = camera.position.clone();
    var mobileInitialCameraRotation = camera.rotation.clone();

    var mobileFocusActive = false;
    var mobilePreviousCameraPosition = null;
    var mobilePreviousCameraRotation = null;

    var mobileFloorBounds = null;
    var mobileFloorRayLength = 12;

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

        @media (max-width: 768px) {
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

    var artworkManageSectionData = createEditorSection("ARTWORKS");
    var artworkManageActions = document.createElement("div");
    artworkManageActions.className = "gallery-artwork-image-actions";

    var artworkAddButton = document.createElement("button");
    artworkAddButton.type = "button";
    artworkAddButton.className = "gallery-editor-action-button is-primary";
    artworkAddButton.innerText = "ADD ARTWORK";

    var artworkDeleteSelectedButton = document.createElement("button");
    artworkDeleteSelectedButton.type = "button";
    artworkDeleteSelectedButton.className = "gallery-editor-action-button is-danger";
    artworkDeleteSelectedButton.innerText = "DELETE SELECTED";

    var artworkManageNote = document.createElement("p");
    artworkManageNote.className = "gallery-artwork-image-note";
    artworkManageNote.innerText = "Add creates a new artwork placeholder. Delete removes the selected artwork and its Storage image.";

    artworkManageActions.appendChild(artworkAddButton);
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
        artworkDeleteSelectedButton.disabled = !editMode || selectedArtworks.length === 0;
    }

    artworkAddButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();

        var artwork = addNewArtworkToScene();

        if (artwork) {
            notifyGalleryStatus("Added new artwork. Drag it on a wall, upload an image, then save state.");
        }
    };

    artworkDeleteSelectedButton.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();

        deleteSelectedArtworksWithStorageDelete()
            .catch(function (error) {
                console.warn("Delete selected artworks error:", error);
                notifyGalleryStatus("Artwork delete error.");
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
    artworkImageNote.innerText = "Upload saves the file in Supabase Storage. Gallery state stores only the URL/path.";

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
            artworkImageStatus.innerHTML = "Image: <strong>" + label + "</strong>";
            artworkImageUrlInput.value = imageState.imageUrl || "";
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
                console.warn(error);
                notifyGalleryStatus("Blad uploadu obrazu.");
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
    var lightingPresetStorageKey = "FollowyesGallery_LightingPresets_V0_9_1";
    var lightingStateStorageKey = "FollowyesGallery_LightingState_V0_9_1";
    var localLightStateStorageKey = "FollowyesGallery_LocalLightState_V0_9_1";

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
            enabled: item.light.isEnabled ? item.light.isEnabled() : true,
            color: getLocalLightStateColor(item),
            intensity: Number(item.light.intensity) || 0,
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
            item.light.setEnabled(savedState.enabled !== false);
        }

        var color = hexToColor3(savedState.color || getLocalLightStateColor(item));
        item.light.diffuse = color;
        item.light.specular = color.scale(item.type === "point" ? 0.12 : 0.10);
        updateLocalLightMarkerColor(item, color);

        if (savedState.intensity !== undefined) {
            item.light.intensity = Math.max(0, Number(savedState.intensity));
        }

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

    globalThis.FollowyesGalleryLocalLights = {
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
                item.light.setEnabled(!!value);
            } else if (key === "color") {
                var color = hexToColor3(value);
                item.light.diffuse = color;
                item.light.specular = color.scale(item.type === "point" ? 0.12 : 0.10);
                updateLocalLightMarkerColor(item, color);
            } else if (key === "intensity") {
                item.light.intensity = Math.max(0, Number(value));
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
                    return item.light.isEnabled();
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
                    return item.light.intensity;
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
            disposeLocalLightItem(item);
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

        item.light.setEnabled(!!isEnabled);

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
                    localLightSoloState.enabledById[item.id] = item.light.isEnabled();
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
            selected: false
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

    localCreateGrid.appendChild(localAddSpotButton);
    localCreateGrid.appendChild(localAddPointButton);
    localCreateGrid.appendChild(localDeleteSelectedButton);
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

    var wallColors = [
        {
            name: "blue",
            label: "Blue",
            url: "https://raw.githubusercontent.com/Rivanes/babylon-assets/main/ColorTexture/Substance_graph_basecolor_b.png"
        },
        {
            name: "black",
            label: "Black",
            url: "https://raw.githubusercontent.com/Rivanes/babylon-assets/main/ColorTexture/Substance_graph_basecolor_black.png"
        },
        {
            name: "green",
            label: "Green",
            url: "https://raw.githubusercontent.com/Rivanes/babylon-assets/main/ColorTexture/Substance_graph_basecolor_g.png"
        },
        {
            name: "red",
            label: "Red",
            url: "https://raw.githubusercontent.com/Rivanes/babylon-assets/main/ColorTexture/Substance_graph_basecolor_r.png"
        },
        {
            name: "steel",
            label: "Steel",
            url: "https://raw.githubusercontent.com/Rivanes/babylon-assets/main/ColorTexture/Substance_graph_basecolor_steel_b.png"
        },
        {
            name: "white",
            label: "White",
            url: "https://raw.githubusercontent.com/Rivanes/babylon-assets/main/ColorTexture/Substance_graph_basecolor_w.png"
        },
        {
            name: "yellowish",
            label: "Yellowish",
            url: "https://raw.githubusercontent.com/Rivanes/babylon-assets/main/ColorTexture/Substance_graph_basecolor_yellowish.png"
        }
    ];

    wallColors.forEach(function (colorData) {

        var material = new BABYLON.PBRMaterial("WallColor_" + colorData.name, scene);
        material.albedoTexture = new BABYLON.Texture(colorData.url, scene);
        material.roughness = 0.85;
        material.metallic = 0;
        configureMaterialForCommonLighting(material);
        material.metadata = material.metadata || {};
        material.metadata.uiName = colorData.label;

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
            setEditorUiVisible(true);

            refreshMobileViewerMode();
            setMobileViewerUiVisible(false);

            if (mobileViewerEnabled) {
                attachGalleryCameraControl();
            }

            updateEditHelpStatus();
            updateAlignmentPanel();
        } else {
            setEditorUiVisible(false);
            clearEditSelection();

            refreshMobileViewerMode();

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
            setEditorUiVisible(false);
            clearEditSelection();

            refreshMobileViewerMode();

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
        if (!isMobileViewerActive() || !mobileJoystickActive) {
            return;
        }

        var delta = scene.getEngine().getDeltaTime() / 16.666;

        var turnInput = mobileJoystickVector.x;
        var moveInput = -mobileJoystickVector.y;

        // Lewo/prawo na joysticku obraca kamere. To ulatwia obsluge jedna reka.
        if (Math.abs(turnInput) > 0.08) {
            camera.rotation.y += turnInput * mobileJoystickTurnSpeed * delta;
        }

        // Gora/dol na joysticku idzie do przodu lub cofa.
        if (Math.abs(moveInput) < 0.08) {
            return;
        }

        var forward = camera.getDirection(new BABYLON.Vector3(0, 0, 1));
        forward.y = 0;

        if (forward.lengthSquared() <= 0) {
            return;
        }

        forward.normalize();

        var candidatePosition = camera.position.add(
            forward.scale(mobileMoveSpeed * moveInput * delta)
        );

        // Mobile nie moze wyjechac poza galerie. Ruch jest akceptowany tylko tam,
        // gdzie pod kamera dalej znajduje sie floor mesh.
        if (isMobileCameraPositionOnFloor(candidatePosition)) {
            camera.position.copyFrom(candidatePosition);
        }
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
            camera.rotation.y += dx * mobileLookSensitivityX;
            camera.rotation.x += dy * mobileLookSensitivityY;

            camera.rotation.x = BABYLON.Scalar.Clamp(
                camera.rotation.x,
                -0.58,
                0.58
            );
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

    function setupMobileViewerControls() {
        createMobileViewerUi();

        scene.onBeforeRenderObservable.add(function () {
            updateMobileJoystickMovement();
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


    function updateEditHelpStatus() {

        var selectedStatus = document.getElementById("editorSelectedArtworkStatus");
        var countStatus = document.getElementById("editorSelectedArtworkCountStatus");
        var colorStatus = document.getElementById("editorSelectedWallColorStatus");

        if (selectedStatus) {
            var selectedLabel = "None";

            if (selectedArtworks.length === 1 && selectedArtworks[0]) {
                selectedLabel = selectedArtworks[0].name;
            } else if (selectedArtworks.length > 1 && primaryArtwork) {
                selectedLabel = primaryArtwork.name + " + " + (selectedArtworks.length - 1);
            }

            selectedStatus.innerText = "Selected: " + selectedLabel;
        }

        if (countStatus) {
            countStatus.innerText = "Selected Count: " + selectedArtworks.length;
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
        updateArtworkTransformUi();
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

        // Selekcja obrazow i lokalnych lamp jest rozdzielna.
        // Nie moze byc jednoczesnie zaznaczony obraz i lampa.
        clearLocalLightSelection();

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

        isDraggingSphere = false;
        selectedSphere = null;

        dragMoved = false;

        lastArtworkClickTime = 0;
        lastArtworkClickMesh = null;

        artworkAlignPanel.style.display = "none";

        attachGalleryCameraControl();
        updateEditHelpStatus();
    }

    window.addEventListener("keydown", function (event) {

        var key = event.key.toLowerCase();

        if (key === "w" || key === "a" || key === "s" || key === "d") {
            editMoveKeys[key] = true;

            if (editMode) {
                event.preventDefault();
            }
        }
    });

    window.addEventListener("keyup", function (event) {

        var key = event.key.toLowerCase();

        if (key === "w" || key === "a" || key === "s" || key === "d") {
            editMoveKeys[key] = false;
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

    function getWallVerticalLimits(wallMesh) {

        if (!wallMesh) {
            return null;
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

            if (otherArtwork === movingArtwork) {
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

            if (otherArtwork === artwork) {
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


    function getPickedWallSegmentBounds(pickWall, normal, horizontalAxis) {

        if (!pickWall || !pickWall.pickedMesh || !pickWall.pickedPoint) {
            return null;
        }

        var wallAxis = getWallAxisFromHorizontalAxis(
            horizontalAxis
        );

        return getWallSegmentBoundsFromGeometry(
            pickWall.pickedMesh,
            wallAxis,
            pickWall.pickedPoint[wallAxis],
            horizontalAxis,
            pickWall.pickedPoint[horizontalAxis]
        );
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

        updateArtworkLight(artwork);
    }


    function updateArtworkLight(artwork) {
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

        let lampMaterial = new BABYLON.StandardMaterial("LampMaterial_" + index, scene);
        lampMaterial.diffuseColor = new BABYLON.Color3(1, 0.35, 0);
        lampMaterial.emissiveColor = new BABYLON.Color3(1, 0.35, 0);
        lampMaterial.disableLighting = true;

        let lampMesh = BABYLON.MeshBuilder.CreateBox(
            "ArtworkLamp_" + index,
            {
                width: 0.6,
                height: 0.15,
                depth: 0.15
            },
            scene
        );

        lampMesh.material = lampMaterial;
        lampMesh.isPickable = true;

        let unifiedSpot = createUnifiedSpotLight(
            "ArtworkSpotLight_" + index,
            new BABYLON.Vector3(0, lampCubeY, 0),
            new BABYLON.Vector3(0, -1, 0),
            {
                diffuse: new BABYLON.Color3(1.0, 0.94, 0.82),
                specular: new BABYLON.Color3(0.10, 0.08, 0.05)
            }
        );

        let spotLight = unifiedSpot.light;

        artwork.metadata = artwork.metadata || {};
        artwork.metadata.lampMesh = lampMesh;
        artwork.metadata.spotLight = spotLight;

        artworkLights.push({
            artwork: artwork,
            lampMesh: lampMesh,
            spotLight: spotLight
        });

        registerLocalLight({
            id: "ArtworkSpotLight_" + index,
            name: "Artwork Spot " + (index + 1),
            type: "spot",
            light: spotLight,
            markerMesh: lampMesh,
            ownerMesh: artwork,
            helperLength: unifiedSpot.range,
            helperMaxRadius: unifiedSpot.range,
            helperSoftness: unifiedSpot.blend
        });

        refreshArtworkLightExclusions();
        updateArtworkLight(artwork);
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
        "https://raw.githubusercontent.com/Rivanes/babylon-assets/main/Floor/",
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
            refreshArtworkLightExclusions();
            refreshPedestalLightIncludedMeshes();
            refreshAllCommonLocalLightTargets();
            refreshAllLocalSpotShadows();

            assetLoaded();
        }
    );

    BABYLON.SceneLoader.ImportMesh(
        "",
        "https://raw.githubusercontent.com/Rivanes/babylon-assets/main/",
        "wall.gltf",
        scene,
        function (meshes) {

            wallMeshes = meshes.filter(mesh => mesh.name !== "__root__");

            wallMeshes.forEach(mesh => {
                mesh.isPickable = true;

                registerCommonShadowMesh(mesh, {
                    global: true,
                    local: true,
                    receive: true,
                    cast: true
                });
            });

            console.log("Wall loaded", wallMeshes);
            refreshAllCommonLocalLightTargets();
            refreshAllLocalSpotShadows();

            assetLoaded();
        }
    );

    BABYLON.SceneLoader.ImportMesh(
        "",
        "https://raw.githubusercontent.com/Rivanes/babylon-assets/main/",
        "Went.gltf",
        scene,
        function (meshes) {
            meshes.forEach(mesh => {
                mesh.isPickable = true;

                if (mesh.name !== "__root__" && propMeshes.indexOf(mesh) === -1) {
                    propMeshes.push(mesh);
                }

                registerCommonShadowMesh(mesh, {
                    global: true,
                    local: true,
                    receive: true,
                    cast: true
                });
            });

            refreshAllCommonLocalLightTargets();
            refreshAllLocalSpotShadows();

            assetLoaded();
        }
    );

    BABYLON.SceneLoader.ImportMesh(
        "",
        "https://raw.githubusercontent.com/Rivanes/babylon-assets/main/",
        "Roof.gltf",
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

        var lampMaterial = new BABYLON.StandardMaterial("PedestalLampMaterial_" + index, scene);
        lampMaterial.diffuseColor = new BABYLON.Color3(1, 0.35, 0);
        lampMaterial.emissiveColor = new BABYLON.Color3(1, 0.35, 0);
        lampMaterial.disableLighting = true;

        var lampMesh = BABYLON.MeshBuilder.CreateBox(
            "PedestalLamp_" + index,
            {
                width: 0.6,
                height: 0.15,
                depth: 0.15
            },
            scene
        );

        lampMesh.material = lampMaterial;
        lampMesh.isPickable = true;

        var unifiedSpot = createUnifiedSpotLight(
            "PedestalSpotLight_" + index,
            new BABYLON.Vector3(displayMesh.position.x, lampCubeY, displayMesh.position.z),
            new BABYLON.Vector3(0, -1, 0),
            {
                diffuse: new BABYLON.Color3(1.0, 0.88, 0.66),
                specular: new BABYLON.Color3(0.025, 0.022, 0.016)
            }
        );

        var spotLight = unifiedSpot.light;

        displayMesh.metadata = displayMesh.metadata || {};
        displayMesh.metadata.lampMesh = lampMesh;
        displayMesh.metadata.spotLight = spotLight;

        registerLocalLight({
            id: "PedestalSpotLight_" + index,
            name: "Pedestal Spot " + (index + 1),
            type: "spot",
            light: spotLight,
            markerMesh: lampMesh,
            ownerMesh: displayMesh,
            helperLength: unifiedSpot.range,
            helperMaxRadius: unifiedSpot.range,
            helperSoftness: unifiedSpot.blend
        });

        updatePedestalLightIncludedMeshes(displayMesh);
        updatePedestalLight(displayMesh);
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
        registerCommonShadowMesh(sculpture, {
            global: true,
            local: true,
            receive: true,
            cast: true
        });

        pedestal.metadata = pedestal.metadata || {};
        pedestal.metadata.displayType = "pedestal";
        pedestal.metadata.sculptureMesh = sculpture;

        artSpheres.push(pedestal);

        createPedestalLight(pedestal, index);
        refreshArtworkLightExclusions();
        refreshAllCommonLocalLightTargets();
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

        createArtworkLight(artwork, index);
        refreshAllCommonLocalLightTargets();
    });


    artworkCreateCounter = Math.max(artworkCreateCounter, artworks.length);

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

    function getDefaultArtworkColor(index) {
        if (artworkMaterials.length === 0) {
            return new BABYLON.Color3(0.8, 0.05, 0.05);
        }

        return artworkMaterials[Math.abs(index) % artworkMaterials.length];
    }

    function createArtworkPlaceholderMaterial(index, baseColor) {
        var material = new BABYLON.StandardMaterial("ArtworkMat_" + index, scene);
        var color = baseColor || getDefaultArtworkColor(index);

        material.diffuseColor = color.clone ? color.clone() : color;
        material.emissiveColor = color.clone ? color.clone() : color;
        material.disableLighting = true;

        return material;
    }

    function createArtworkDisplay(options) {
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

        var material = createArtworkPlaceholderMaterial(
            index,
            options.baseColor || getDefaultArtworkColor(index)
        );

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

        artwork.material = material;
        artwork.isPickable = true;
        artwork.metadata = artwork.metadata || {};
        artwork.metadata.artworkImage = null;
        artwork.metadata.isDynamicArtwork = !options.isDefaultArtwork;
        artwork.metadata.createdAt = options.createdAt || new Date().toISOString();

        registerCommonShadowMesh(artwork, {
            global: false,
            local: false,
            receive: false,
            cast: false
        });

        artworks.push(artwork);
        updateArtworkCreateCounterFromName(artwork.name);

        createArtworkLight(artwork, index);

        if (options.wallData) {
            setArtworkWallMetadata(
                artwork,
                options.wallData.wallMesh || null,
                options.wallData.wallAxis,
                options.wallData.wallValue,
                options.wallData.horizontalAxis
            );
        }

        artwork.computeWorldMatrix(true);
        updateArtworkLight(artwork);
        refreshAllCommonLocalLightTargets();

        return artwork;
    }

    function getDefaultNewArtworkReference() {
        if (primaryArtwork && artworks.includes(primaryArtwork)) {
            return primaryArtwork;
        }

        if (activeArtwork && artworks.includes(activeArtwork)) {
            return activeArtwork;
        }

        return artworks.length > 0 ? artworks[artworks.length - 1] : null;
    }

    function placeNewArtworkNearReference(newArtwork, referenceArtwork) {
        if (!newArtwork || !referenceArtwork) {
            return false;
        }

        var wallData = getArtworkWallDataFromRotation(referenceArtwork);
        var wallMesh = getWallMeshForArtwork(referenceArtwork);
        var candidateRotation = new BABYLON.Vector3(
            0,
            referenceArtwork.rotation ? referenceArtwork.rotation.y : 0,
            0
        );

        var horizontalAxis = wallData.horizontalAxis || "x";
        var wallAxis = wallData.wallAxis || "z";
        var wallValue = wallData.wallValue !== undefined
            ? wallData.wallValue
            : referenceArtwork.position[wallAxis];

        var referenceHalf = getArtworkHalfSizeOnAxisForRotation(
            referenceArtwork,
            horizontalAxis,
            referenceArtwork.rotation
        );

        var newHalf = getArtworkHalfSizeOnAxisForRotation(
            newArtwork,
            horizontalAxis,
            candidateRotation
        );

        var step = referenceHalf + newHalf + 0.18;
        var offsets = [step, -step, step * 2, -step * 2, step * 3, -step * 3, 0];

        for (var i = 0; i < offsets.length; i++) {
            var candidatePosition = referenceArtwork.position.clone();

            candidatePosition[horizontalAxis] += offsets[i];
            candidatePosition[wallAxis] = wallValue;

            if (wallMesh) {
                candidatePosition[horizontalAxis] = clampArtworkHorizontalByTargetSegment(
                    newArtwork,
                    candidatePosition[horizontalAxis],
                    wallMesh,
                    horizontalAxis,
                    candidateRotation,
                    wallAxis,
                    wallValue
                );

                candidatePosition.y = clampArtworkYByWallBounds(
                    newArtwork,
                    candidatePosition.y,
                    wallMesh
                );
            }

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
                newArtwork.rotation = candidateRotation.clone();

                setArtworkWallMetadata(
                    newArtwork,
                    wallMesh,
                    wallAxis,
                    wallValue,
                    horizontalAxis
                );

                newArtwork.computeWorldMatrix(true);
                updateArtworkLight(newArtwork);
                return true;
            }
        }

        return false;
    }

    function addNewArtworkToScene() {
        var referenceArtwork = getDefaultNewArtworkReference();
        var index = getNextArtworkCreateIndex();

        var startPosition = referenceArtwork
            ? referenceArtwork.position.clone()
            : new BABYLON.Vector3(0, -2.5, -4.8);

        var startRotation = referenceArtwork
            ? new BABYLON.Vector3(0, referenceArtwork.rotation.y, 0)
            : new BABYLON.Vector3(0, 0, 0);

        var artwork = createArtworkDisplay({
            index: index,
            name: "Artwork_" + index,
            position: startPosition,
            rotation: startRotation,
            isDefaultArtwork: false
        });

        if (referenceArtwork) {
            placeNewArtworkNearReference(artwork, referenceArtwork);
        } else {
            setArtworkWallMetadata(
                artwork,
                null,
                "z",
                artwork.position.z,
                "x"
            );
        }

        selectArtwork(artwork, false);
        updateEditHelpStatus();
        updateLocalLightsUi();

        return artwork;
    }

    function disposeArtworkMeshOnly(artwork) {
        if (!artwork) {
            return false;
        }

        removeArtworkImageFromMesh(artwork, true);
        hideArtworkSelectionGlow(artwork);

        if (
            artwork.metadata &&
            artwork.metadata.selectionGlowPlane &&
            !artwork.metadata.selectionGlowPlane.isDisposed()
        ) {
            artwork.metadata.selectionGlowPlane.dispose();
            artwork.metadata.selectionGlowPlane = null;
        }

        if (
            artwork.metadata &&
            artwork.metadata.spotLight
        ) {
            var localItem = getLocalLightItemByLight(artwork.metadata.spotLight);

            if (localItem) {
                disposeLocalLightItem(localItem);
            } else {
                if (artwork.metadata.spotLight.dispose) {
                    artwork.metadata.spotLight.dispose();
                }

                if (
                    artwork.metadata.lampMesh &&
                    artwork.metadata.lampMesh.dispose
                ) {
                    artwork.metadata.lampMesh.dispose();
                }
            }
        }

        artworks = artworks.filter(function (candidate) {
            return candidate !== artwork;
        });

        selectedArtworks = selectedArtworks.filter(function (candidate) {
            return candidate !== artwork;
        });

        if (primaryArtwork === artwork) {
            primaryArtwork = selectedArtworks.length > 0
                ? selectedArtworks[selectedArtworks.length - 1]
                : null;
        }

        if (referenceArtwork === artwork) {
            referenceArtwork = selectedArtworks.length > 0
                ? selectedArtworks[0]
                : null;
        }

        if (activeArtwork === artwork) {
            activeArtwork = primaryArtwork;
        }

        if (selectedArtwork === artwork) {
            selectedArtwork = null;
            isDraggingArtwork = false;
        }

        try {
            artwork.dispose();
        } catch (error) {
            console.warn("Artwork dispose warning:", error);
        }

        refreshArtworkOutlines();
        refreshArtworkLightExclusions();
        refreshAllCommonLocalLightTargets();
        updateLocalLightsUi();
        updateEditHelpStatus();

        return true;
    }

    async function deleteArtworkWithStorageDelete(artwork) {
        if (!artwork) {
            return false;
        }

        var imageState = getArtworkImageState(artwork);

        if (imageState) {
            var removedImage = await deleteArtworkImageFromSupabase(imageState);

            if (!removedImage) {
                return false;
            }
        }

        return disposeArtworkMeshOnly(artwork);
    }

    async function deleteSelectedArtworksWithStorageDelete() {
        if (!selectedArtworks.length) {
            notifyGalleryStatus("Select an artwork to delete.");
            return false;
        }

        var artworksToDelete = selectedArtworks.slice();
        notifyGalleryStatus("Deleting selected artwork...");

        var deletedCount = 0;

        for (var i = 0; i < artworksToDelete.length; i++) {
            var deleted = await deleteArtworkWithStorageDelete(artworksToDelete[i]);

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
                    artworks.includes(pickResult.pickedMesh)
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

            // TRYB EDYCJI = wybrany kolor naklada sie na caly model sciany.
            if (
                editMode &&
                selectedWallMaterial &&
                !activeArtwork &&
                pickResult.hit &&
                wallMeshes.includes(pickResult.pickedMesh)
            ) {
                wallMeshes.forEach(function (wallMesh) {
                    wallMesh.material = selectedWallMaterial;
                    configureMeshMaterialForMainShadows(wallMesh);
                });

                refreshCommonLightingMaterialSupport();
                updateEditHelpStatus();

                return;
            }

            // TRYB EDYCJI = klik w obraz zaznacza go.
            // Klik + przeciagniecie obrazu przesuwa go po scianie jak w pierwotnej wersji.
            // Dwuklik w ten sam obraz podjezdza kamera do obrazu.
            if (
                editMode &&
                pickResult.hit &&
                artworks.includes(pickResult.pickedMesh)
            ) {
                var clickedArtwork = pickResult.pickedMesh;
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
                artSpheres.includes(pickResult.pickedMesh)
            ) {
                selectedSphere = pickResult.pickedMesh;
                isDraggingSphere = true;
                dragMoved = false;

                camera.detachControl(canvas);

                return;
            }

            // TRYB OGLADANIA = klik w obraz podjezdza kamera frontem do obrazu.
            if (
                !editMode &&
                pickResult.hit &&
                artworks.includes(pickResult.pickedMesh)
            ) {
                focusCameraOnObject(pickResult.pickedMesh);
                return;
            }

            // TRYB OGLADANIA = klik w postument podjezdza kamera do postumentu.
            if (
                !editMode &&
                pickResult.hit &&
                artSpheres.includes(pickResult.pickedMesh)
            ) {
                focusCameraOnObject(pickResult.pickedMesh);
                return;
            }

            // TRYB EDYCJI = klik w podloge nie wykonuje akcji.
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

            // Klik bez przeciagania w trybie edycji = podejscie do postumentu.
            if (!dragMoved && selectedSphere) {
                focusCameraOnObject(selectedSphere);
            }

            isDraggingSphere = false;
            selectedSphere = null;
            dragMoved = false;

            requestAllLocalSpotShadowRefresh(true);

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
        if (!material || !material.name) {
            return null;
        }

        if (material.name.indexOf("WallColor_") === 0) {
            return material.name.replace("WallColor_", "");
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


    function ensureArtworkExistsForState(artworkState) {
        if (!artworkState || !artworkState.name) {
            return null;
        }

        var artwork = getArtworkByName(artworkState.name);

        if (artwork) {
            updateArtworkCreateCounterFromName(artwork.name);
            return artwork;
        }

        var restoredIndex = artworkState.index !== undefined
            ? Number(artworkState.index)
            : NaN;

        if (!isFinite(restoredIndex)) {
            var nameMatch = String(artworkState.name).match(/^Artwork_(\d+)$/);
            restoredIndex = nameMatch ? Number(nameMatch[1]) : getNextArtworkCreateIndex();
        }

        var restoredPosition = artworkState.position
            ? vectorFromState(artworkState.position, new BABYLON.Vector3(0, -2.5, -4.8))
            : new BABYLON.Vector3(0, -2.5, -4.8);

        var restoredRotation = artworkState.rotation
            ? vectorFromState(artworkState.rotation, new BABYLON.Vector3(0, 0, 0))
            : new BABYLON.Vector3(0, 0, 0);

        artwork = createArtworkDisplay({
            index: restoredIndex,
            name: artworkState.name,
            position: restoredPosition,
            rotation: restoredRotation,
            isDefaultArtwork: !artworkState.isDynamicArtwork,
            createdAt: artworkState.createdAt || null
        });

        updateArtworkCreateCounterFromName(artwork.name);

        return artwork;
    }

    function syncArtworkListToEditorState(editorState) {
        if (!editorState || !Array.isArray(editorState.artworks)) {
            return;
        }

        var expectedNames = editorState.artworks
            .filter(function (artworkState) {
                return !!(artworkState && artworkState.name);
            })
            .map(function (artworkState) {
                return artworkState.name;
            });

        artworks.slice().forEach(function (artwork) {
            if (expectedNames.indexOf(artwork.name) === -1) {
                disposeArtworkMeshOnly(artwork);
            }
        });

        editorState.artworks.forEach(function (artworkState) {
            ensureArtworkExistsForState(artworkState);
        });
    }

    function serializeEditorState() {
        return {
            version: "Gallery_V0_10_editor",
            selectedWallMaterialName: getWallColorNameFromMaterial(selectedWallMaterial),
            walls: wallMeshes.map(function (wallMesh) {
                return {
                    name: wallMesh.name,
                    materialName: wallMesh.material ? wallMesh.material.name : null,
                    colorName: getWallColorNameFromMaterial(wallMesh.material)
                };
            }),
            artworks: artworks.map(function (artwork, index) {
                var wallData = getArtworkWallDataFromRotation(artwork);
                var wallMesh = getWallMeshForArtwork(artwork);

                return {
                    name: artwork.name,
                    index: index,
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
                    artworkTransform: getArtworkTransformState(artwork)
                };
            }),
            spheres: artSpheres.map(function (sphere, index) {
                return {
                    name: sphere.name,
                    index: index,
                    position: vectorToState(sphere.position),
                    rotation: vectorToState(sphere.rotation),
                    scaling: vectorToState(sphere.scaling),
                    material: getMaterialState(sphere.material)
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
                var colorName = wallState.colorName || (
                    wallState.materialName && wallState.materialName.indexOf("WallColor_") === 0
                        ? wallState.materialName.replace("WallColor_", "")
                        : null
                );

                if (wallMesh && colorName && wallColorMaterials[colorName]) {
                    wallMesh.material = wallColorMaterials[colorName];
                    configureMeshMaterialForMainShadows(wallMesh);
                }
            });
        }

        if (Array.isArray(editorState.artworks)) {
            syncArtworkListToEditorState(editorState);

            editorState.artworks.forEach(function (artworkState) {
                if (!artworkState) {
                    return;
                }

                var artwork = getArtworkByName(artworkState.name);

                if (!artwork && artworkState.index !== undefined) {
                    artwork = artworks[Number(artworkState.index)] || null;
                }

                if (!artwork) {
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

                if (artworkState.artworkTransform) {
                    setArtworkTransformState(artwork, artworkState.artworkTransform);
                } else if (
                    artworkState.image &&
                    artworkState.image.transform
                ) {
                    setArtworkTransformState(artwork, artworkState.image.transform);
                }

                if (artworkState.image || artworkState.artworkImage || artworkState.imageUrl || artworkState.imagePath) {
                    applyArtworkImageState(
                        artwork,
                        artworkState.image || artworkState.artworkImage || {
                            imageUrl: artworkState.imageUrl || "",
                            imagePath: artworkState.imagePath || "",
                            fitMode: artworkState.fitMode || galleryArtworkDefaultFitMode
                        }
                    );
                } else {
                    removeArtworkImageFromMesh(artwork, true);
                }

                artwork.computeWorldMatrix(true);
                updateArtworkLight(artwork);
            });
        }

        if (Array.isArray(editorState.spheres)) {
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
                sphere.computeWorldMatrix(true);
                updatePedestalLight(sphere);
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
            version: "Gallery_V0_10_WEB",
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

        refreshCommonLightingMaterialSupport();
        refreshArtworkLightExclusions();
        refreshPedestalLightIncludedMeshes();
        refreshAllCommonLocalLightTargets();
        refreshAllLocalSpotShadows();
        updateLocalLightsUi();
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
            applyGalleryState(row.state);
            notifyGalleryStatus("Wczytano zapisany stan galerii. Lampy: " + getStateLightCount(row.state) + ".");
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
        globalThis.FollowyesGalleryLatestState = state;

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

    globalThis.FollowyesGalleryWebState = {
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
        removeArtworkImage: function (artworkNameOrIndex) {
            var artwork = typeof artworkNameOrIndex === "number"
                ? artworks[artworkNameOrIndex]
                : getArtworkByName(artworkNameOrIndex);

            return removeArtworkImageWithStorageDelete(artwork);
        },
        addArtwork: function () {
            return addNewArtworkToScene();
        },
        deleteArtwork: function (artworkNameOrIndex) {
            var artwork = typeof artworkNameOrIndex === "number"
                ? artworks[artworkNameOrIndex]
                : getArtworkByName(artworkNameOrIndex);

            return deleteArtworkWithStorageDelete(artwork);
        },
        deleteSelectedArtworks: deleteSelectedArtworksWithStorageDelete,
        getArtworkImageState: function (artworkNameOrIndex) {
            var artwork = typeof artworkNameOrIndex === "number"
                ? artworks[artworkNameOrIndex]
                : getArtworkByName(artworkNameOrIndex);

            return getArtworkImageState(artwork);
        },
        getArtworkStorageSettings: function () {
            return {
                uploadEnabled: galleryArtworkUploadEnabled,
                bucket: galleryArtworkStorageBucket,
                prefix: galleryArtworkStoragePrefix,
                defaultFitMode: galleryArtworkDefaultFitMode
            };
        }
    };

    setEditorAuthenticated(editorAuthenticated);
    window.dispatchEvent(new CustomEvent("gallery-ready"));


    return scene;
};