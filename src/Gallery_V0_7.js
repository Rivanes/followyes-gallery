export const createScene = function (engine, canvas) {

    var scene = new BABYLON.Scene(engine);

    // Czysci elementy UI po przeladowaniu sceny.
    [
        "customLoadingScreen",
        "customLoaderStyle",
        "editModeButton",
        "wallColorPalette",
        "editHelpPanel",
        "artworkAlignPanel"
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

    camera.attachControl(canvas, true);
    camera.speed = 0.3;
    camera.setTarget(new BABYLON.Vector3(0, 1, 0));

    var light = new BABYLON.HemisphericLight(
        "light",
        new BABYLON.Vector3(0, 1, 0),
        scene
    );

    light.intensity = 0.5;

    canvas.addEventListener("contextmenu", (e) => {
        e.preventDefault();
    });

    var floorMeshes = [];
    var wallMeshes = [];
    var artSpheres = [];
    var artworks = [];
    var artworkLights = [];

    var lampCeilingY = -0.55;
    var lampCubeY = -1.2;
    var lampDistanceFromWall = 2.0;

    var artworkWidth = 1.3;
    var artworkHeight = 0.9;
    var artworkDepth = 0.04;
    var artworkWallOffset = 0.04;

    var artworkBoundsSafeMargin = 0.0;
    var artworkCollisionPadding = 0.0;
    var artworkCollisionTouchTolerance = 0.001;
    var artworkSameWallTolerance = 0.35;

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

function assetLoaded() {
    assetsLoaded++;

    if (assetsLoaded >= assetsToLoad) {

        // Ustawia kierunek patrzenia kamery.
        camera.rotation = new BABYLON.Vector3(0,Math.PI/50, 0);

        setTimeout(function () {
            loadingScreen.style.display = "none";
        }, 300);
    }
}

    // TRYB EDYCJI / OGLADANIA
    var oldButton = document.getElementById("editModeButton");

    if (oldButton) {
        oldButton.remove();
    }

    var editMode = false;

    var editButton = document.createElement("button");
    editButton.id = "editModeButton";
    editButton.innerText = "TRYB: OGLADANIE";

    editButton.style.position = "absolute";
    editButton.style.right = "50px";
    editButton.style.bottom = "50px";
    editButton.style.zIndex = "999";
    editButton.style.padding = "10px 15px";
    editButton.style.background = "#111";
    editButton.style.color = "white";
    editButton.style.border = "1px solid white";
    editButton.style.cursor = "pointer";
    editButton.style.fontFamily = "Arial, sans-serif";

    document.body.appendChild(editButton);

    // PALETA KOLOROW SCIAN
    var oldWallPalette = document.getElementById("wallColorPalette");

    if (oldWallPalette) {
        oldWallPalette.remove();
    }

    var wallPalette = document.createElement("div");
    wallPalette.id = "wallColorPalette";

    wallPalette.style.position = "absolute";
    wallPalette.style.right = "50px";
    wallPalette.style.bottom = "105px";
    wallPalette.style.zIndex = "999";
    wallPalette.style.display = "none";
    wallPalette.style.gridTemplateColumns = "repeat(4, 34px)";
    wallPalette.style.gap = "8px";
    wallPalette.style.padding = "10px";
    wallPalette.style.background = "rgba(0, 0, 0, 0.75)";
    wallPalette.style.border = "1px solid white";
    wallPalette.style.width = "fit-content";

    var wallPaletteTitle = document.createElement("div");
    wallPaletteTitle.innerText = "PALETA KOLOROW SCIAN";
    wallPaletteTitle.style.gridColumn = "1 / -1";
    wallPaletteTitle.style.color = "white";
    wallPaletteTitle.style.fontFamily = "Arial, sans-serif";
    wallPaletteTitle.style.fontSize = "12px";
    wallPaletteTitle.style.fontWeight = "bold";
    wallPaletteTitle.style.letterSpacing = "0.5px";
    wallPaletteTitle.style.marginBottom = "2px";

    wallPalette.appendChild(wallPaletteTitle);

    document.body.appendChild(wallPalette);

    // LEGENDA SKROTOW W TRYBIE EDYCJI
    var oldEditHelp = document.getElementById("editHelpPanel");

    if (oldEditHelp) {
        oldEditHelp.remove();
    }

    var editHelpPanel = document.createElement("div");
    editHelpPanel.id = "editHelpPanel";

    editHelpPanel.style.position = "absolute";
    editHelpPanel.style.right = "50px";
    editHelpPanel.style.bottom = "245px";
    editHelpPanel.style.zIndex = "999";
    editHelpPanel.style.display = "none";
    editHelpPanel.style.fontFamily = "Arial, sans-serif";
    editHelpPanel.style.color = "white";
    editHelpPanel.style.width = "260px";

    var editHelpToggle = document.createElement("button");
    editHelpToggle.innerText = "SKROTY v";

    editHelpToggle.style.width = "100%";
    editHelpToggle.style.padding = "10px 12px";
    editHelpToggle.style.background = "#111";
    editHelpToggle.style.color = "white";
    editHelpToggle.style.border = "1px solid white";
    editHelpToggle.style.cursor = "pointer";
    editHelpToggle.style.textAlign = "left";

    var editHelpContent = document.createElement("div");
    editHelpContent.style.display = "none";
    editHelpContent.style.padding = "12px";
    editHelpContent.style.background = "rgba(0, 0, 0, 0.78)";
    editHelpContent.style.borderLeft = "1px solid white";
    editHelpContent.style.borderRight = "1px solid white";
    editHelpContent.style.borderBottom = "1px solid white";
    editHelpContent.style.fontSize = "13px";
    editHelpContent.style.lineHeight = "1.55";

    editHelpContent.innerHTML = `
        <div><strong>TRYB EDYCJI</strong></div>
        <div>Klik obraz - zaznacz obraz</div>
        <div>Klik + przeciagnij obraz - przesun obraz po scianie</div>
        <div>Klik inny obraz - zmien zaznaczenie</div>
        <div>Shift + klik obraz - dodaj / usun z zaznaczenia</div>
        <div>Klik sciana - ustaw / przesuwaj zaznaczony obraz</div>
        <div>Panel Wyrownaj - wyrownuje zaznaczone obrazy</div>
        <div>Lewo/Prawo - kamera wybiera, krawedz liczy sciana</div>
        <div>Gora/Dol - do skrajnego albo dosun po drodze</div>
        <div>Srodek H/V - do ostatnio zaznaczonego</div>
        <div>Klik kolor - wybierz kolor sciany</div>
        <div>Kolor zostaje aktywny do Esc</div>
        <div>W / A / S / D - chodzenie w trybie edycji</div>
        <div>Esc - odznacz obraz i kolor</div>
        <div>Dwuklik obraz - podejdz do obrazu</div>
        <hr style="border:0;border-top:1px solid rgba(255,255,255,0.35);margin:8px 0;">
        <div id="editHelpStatus">Aktywny obraz: brak<br>Kolor sciany: brak</div>
    `;

    editHelpToggle.onclick = function () {
        if (editHelpContent.style.display === "none") {
            editHelpContent.style.display = "block";
            editHelpToggle.innerText = "SKROTY ^";
        } else {
            editHelpContent.style.display = "none";
            editHelpToggle.innerText = "SKROTY v";
        }
    };

    editHelpPanel.appendChild(editHelpToggle);
    editHelpPanel.appendChild(editHelpContent);

    document.body.appendChild(editHelpPanel);


    // PANEL WYROWNANIA OBRAZOW
    var oldArtworkAlignPanel = document.getElementById("artworkAlignPanel");

    if (oldArtworkAlignPanel) {
        oldArtworkAlignPanel.remove();
    }

    var artworkAlignPanel = document.createElement("div");
    artworkAlignPanel.id = "artworkAlignPanel";

    artworkAlignPanel.style.position = "absolute";
    artworkAlignPanel.style.display = "none";
    artworkAlignPanel.style.zIndex = "1000";
    artworkAlignPanel.style.padding = "10px";
    artworkAlignPanel.style.background = "rgba(0, 0, 0, 0.82)";
    artworkAlignPanel.style.border = "1px solid white";
    artworkAlignPanel.style.color = "white";
    artworkAlignPanel.style.fontFamily = "Arial, sans-serif";
    artworkAlignPanel.style.fontSize = "12px";
    artworkAlignPanel.style.width = "170px";
    artworkAlignPanel.style.pointerEvents = "auto";

    artworkAlignPanel.innerHTML = `
        <div style="font-weight:bold;margin-bottom:8px;">WYROWNAJ</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
            <button data-align="left">Lewo</button>
            <button data-align="right">Prawo</button>
            <button data-align="centerH">Srodek H</button>
            <button data-align="centerWallH">Srodek sciany H</button>
            <button data-align="top">Gora</button>
            <button data-align="bottom">Dol</button>
            <button data-align="centerV">Srodek V</button>
            <button data-align="centerWallV">Srodek sciany V</button>
        </div>
        <div id="alignPanelInfo" style="margin-top:8px;opacity:0.8;">Lewo/Prawo kamera wybor, snap po scianie</div>
    `;

    Array.from(artworkAlignPanel.querySelectorAll("button")).forEach(function (button) {
        button.style.padding = "6px";
        button.style.background = "#111";
        button.style.color = "white";
        button.style.border = "1px solid rgba(255,255,255,0.75)";
        button.style.cursor = "pointer";

        button.onpointerdown = function (event) {
            event.preventDefault();
            event.stopPropagation();

            alignSelectedArtworks(
                button.getAttribute("data-align")
            );
        };
    });

    document.body.appendChild(artworkAlignPanel);


    var wallColors = [
        {
            name: "blue",
            url: "https://raw.githubusercontent.com/Rivanes/babylon-assets/main/ColorTexture/Substance_graph_basecolor_b.png"
        },
        {
            name: "black",
            url: "https://raw.githubusercontent.com/Rivanes/babylon-assets/main/ColorTexture/Substance_graph_basecolor_black.png"
        },
        {
            name: "green",
            url: "https://raw.githubusercontent.com/Rivanes/babylon-assets/main/ColorTexture/Substance_graph_basecolor_g.png"
        },
        {
            name: "red",
            url: "https://raw.githubusercontent.com/Rivanes/babylon-assets/main/ColorTexture/Substance_graph_basecolor_r.png"
        },
        {
            name: "steel",
            url: "https://raw.githubusercontent.com/Rivanes/babylon-assets/main/ColorTexture/Substance_graph_basecolor_steel_b.png"
        },
        {
            name: "white",
            url: "https://raw.githubusercontent.com/Rivanes/babylon-assets/main/ColorTexture/Substance_graph_basecolor_w.png"
        },
        {
            name: "yellowish",
            url: "https://raw.githubusercontent.com/Rivanes/babylon-assets/main/ColorTexture/Substance_graph_basecolor_yellowish.png"
        }
    ];

    wallColors.forEach(function (colorData) {

        var material = new BABYLON.PBRMaterial("WallColor_" + colorData.name, scene);
        material.albedoTexture = new BABYLON.Texture(colorData.url, scene);
        material.roughness = 0.85;
        material.metallic = 0;

        wallColorMaterials[colorData.name] = material;

        var swatch = document.createElement("button");
        swatch.title = colorData.name;

        swatch.style.width = "34px";
        swatch.style.height = "34px";
        swatch.style.border = "1px solid rgba(255,255,255,0.7)";
        swatch.style.cursor = "pointer";
        swatch.style.backgroundImage = "url('" + colorData.url + "')";
        swatch.style.backgroundSize = "cover";
        swatch.style.backgroundPosition = "center";

        swatch.onpointerdown = function (event) {
            event.preventDefault();
            event.stopPropagation();

            deselectArtwork();

            selectedWallMaterial = material;

            Array.from(wallPalette.querySelectorAll("button")).forEach(function (item) {
                item.style.outline = "none";
            });

            swatch.style.outline = "3px solid white";

            updateEditHelpStatus();
        };

        wallPalette.appendChild(swatch);
    });

    editButton.onclick = function () {
        editMode = !editMode;

        if (editMode) {
            editButton.innerText = "TRYB: EDYCJA";
            editButton.style.background = "#163b16";
            wallPalette.style.display = "grid";
            editHelpPanel.style.display = "block";
            updateEditHelpStatus();
        } else {
            editButton.innerText = "TRYB: OGLADANIE";
            editButton.style.background = "#111";
            wallPalette.style.display = "none";
            editHelpPanel.style.display = "none";
            artworkAlignPanel.style.display = "none";
            clearEditSelection();
        }
    };

    function updateEditHelpStatus() {

        var status = document.getElementById("editHelpStatus");

        if (!status) {
            return;
        }

        var artworkName = activeArtwork ? activeArtwork.name : "brak";
        var referenceName = primaryArtwork ? primaryArtwork.name : "brak";
        var colorName = selectedWallMaterial ? selectedWallMaterial.name.replace("WallColor_", "") : "brak";

        status.innerHTML =
            "Aktywny obraz: " + artworkName +
            "<br>Ostatni zaznaczony: " + referenceName +
            "<br>Zaznaczone obrazy: " + selectedArtworks.length +
            "<br>Kolor sciany: " + colorName;
    }

    function refreshArtworkOutlines() {

        artworks.forEach(function (artwork) {
            if (artwork.disableEdgesRendering) {
                artwork.disableEdgesRendering();
            }
        });

        selectedArtworks.forEach(function (artwork) {
            artwork.enableEdgesRendering();
            artwork.edgesColor = new BABYLON.Color4(1, 1, 1, 1);

            if (artwork === referenceArtwork) {
                artwork.edgesWidth = 6;
            } else if (artwork === primaryArtwork) {
                artwork.edgesWidth = 5;
            } else {
                artwork.edgesWidth = 4;
            }
        });
    }

    function selectArtwork(artwork, addToSelection) {

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

        camera.attachControl(canvas, true);
        updateEditHelpStatus();
    }

    function clearWallColorSelection() {

        selectedWallMaterial = null;

        Array.from(wallPalette.querySelectorAll("button")).forEach(function (item) {
            item.style.outline = "none";
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

        camera.attachControl(canvas, true);
        updateEditHelpStatus();
    }

    window.addEventListener("keydown", function (event) {

        if (event.key === "Escape") {
            clearEditSelection();
            return;
        }

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

        if (!editMode || selectedArtworks.length < 2 || !primaryArtwork || !referenceArtwork) {
            artworkAlignPanel.style.display = "none";
            return;
        }

        var engine = scene.getEngine();
        var projected = BABYLON.Vector3.Project(
            primaryArtwork.position,
            BABYLON.Matrix.Identity(),
            scene.getTransformMatrix(),
            camera.viewport.toGlobal(
                engine.getRenderWidth(),
                engine.getRenderHeight()
            )
        );

        artworkAlignPanel.style.left = (projected.x + 24) + "px";
        artworkAlignPanel.style.top = (projected.y - 72) + "px";
        artworkAlignPanel.style.display = "block";

        var info = document.getElementById("alignPanelInfo");

        if (info) {
            info.innerText =
                "Zaznaczone: " + selectedArtworks.length +
                " | Ostatni: " + primaryArtwork.name;
        }
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
                0
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
                0
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

        if (!artwork.metadata || !artwork.metadata.lampMesh || !artwork.metadata.spotLight) {
            return;
        }

        let frontDirection = BABYLON.Vector3.TransformNormal(
            new BABYLON.Vector3(0, 0, 1),
            artwork.getWorldMatrix()
        ).normalize();

        let lampPosition = artwork.position.add(
            frontDirection.scale(lampDistanceFromWall)
        );

        lampPosition.y = lampCeilingY;

        let lampCubePosition = lampPosition.clone();
        lampCubePosition.y = lampCubeY;

        // Ustawia widoczna kostke lampy pod sufitem.
        artwork.metadata.lampMesh.position.copyFrom(lampCubePosition);

        let absX = Math.abs(frontDirection.x);
        let absZ = Math.abs(frontDirection.z);

        if (absX > absZ) {
            artwork.metadata.lampMesh.rotation = new BABYLON.Vector3(
                0,
                frontDirection.x > 0 ? Math.PI / 2 : -Math.PI / 2,
                0
            );
        } else {
            artwork.metadata.lampMesh.rotation = new BABYLON.Vector3(
                0,
                frontDirection.z > 0 ? 0 : Math.PI,
                0
            );
        }

        // Ustawia start stozka swiatla blizej sufitu.
        artwork.metadata.spotLight.position.copyFrom(lampPosition);

        // Kieruje swiatlo zawsze w aktualna pozycje obrazu.
        let directionToArtwork = artwork.position
            .subtract(lampPosition)
            .normalize();

        artwork.metadata.spotLight.direction.copyFrom(directionToArtwork);
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
        lampMesh.isPickable = false;

        let spotLight = new BABYLON.SpotLight(
            "ArtworkSpotLight_" + index,
            new BABYLON.Vector3(0, lampCeilingY, 0),
            new BABYLON.Vector3(0, -1, 0),
            Math.PI / 1.7,
            1.2,
            scene
        );

        spotLight.intensity = 30;
        spotLight.diffuse = new BABYLON.Color3(1, 0.94, 0.82);
        spotLight.specular = new BABYLON.Color3(0.25, 0.2, 0.12);

        artwork.metadata = artwork.metadata || {};
        artwork.metadata.lampMesh = lampMesh;
        artwork.metadata.spotLight = spotLight;

        artworkLights.push({
            artwork: artwork,
            lampMesh: lampMesh,
            spotLight: spotLight
        });

        updateArtworkLight(artwork);
    }

    function focusCameraOnObject(targetMesh) {

        let objectPosition = targetMesh.position.clone();
        let viewDirection;

        // Jesli klikniety obiekt jest obrazem, kamera podjezdza frontem do obrazu.
        if (artworks.includes(targetMesh)) {
            viewDirection = BABYLON.Vector3.TransformNormal(
                new BABYLON.Vector3(0, 0, 1),
                targetMesh.getWorldMatrix()
            ).normalize();
        }
        // Jesli to sfera, kamera podjezdza od aktualnego kierunku patrzenia.
        else {
            let cameraToObject = objectPosition.subtract(camera.position).normalize();
            viewDirection = cameraToObject.scale(-1);
        }

        let targetCameraPosition = objectPosition.add(
            viewDirection.scale(3)
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
            });

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
            });

            console.log("Wall loaded", wallMeshes);

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
            });

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
            });

            assetLoaded();
        }
    );

    var spherePositions = [
        new BABYLON.Vector3(-3, -3, -2),
        new BABYLON.Vector3(2, -3, 1),
        new BABYLON.Vector3(4, -3, -4)
    ];

    spherePositions.forEach((pos, index) => {

        var sphere = BABYLON.MeshBuilder.CreateSphere(
            "ArtSphere_" + index,
            {
                diameter: 1,
                segments: 32
            },
            scene
        );

        sphere.position = pos;
        sphere.isPickable = true;

        artSpheres.push(sphere);
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

        artworks.push(artwork);

        createArtworkLight(artwork, index);
    });

    scene.onPointerDown = function (evt, pickResult) {

        if (evt.button === 0) {

            evt.preventDefault();

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
                });

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

                    camera.attachControl(canvas, true);

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

            // TRYB EDYCJI = klik w sfere zaczyna przeciaganie po podlodze.
            // Jesli tylko klikniesz bez przeciagania, kamera podjedzie do sfery.
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

            // TRYB OGLADANIA = klik w sfere podjezdza kamera do sfery.
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

    scene.onPointerMove = function () {

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

        // PRZESUWANIE SFERY PO PODLODZE W TRYBIE EDYCJI
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

                // wysokosc sfery zostaje taka sama jak byla
                // jesli chcesz inna wysokosc, zmien wartosc Y tutaj.
                selectedSphere.position.y = selectedSphere.position.y;
            }
        }
    };

    scene.onPointerUp = function () {

        if (editMode && isDraggingArtwork) {

            isDraggingArtwork = false;
            selectedArtwork = null;
            dragMoved = false;

            camera.attachControl(canvas, true);
            updateAlignmentPanel();
        }

        if (editMode && isDraggingSphere) {

            // Klik bez przeciagania w trybie edycji = podejscie do sfery.
            if (!dragMoved && selectedSphere) {
                focusCameraOnObject(selectedSphere);
            }

            isDraggingSphere = false;
            selectedSphere = null;
            dragMoved = false;

            camera.attachControl(canvas, true);
        }
    };

    return scene;
};