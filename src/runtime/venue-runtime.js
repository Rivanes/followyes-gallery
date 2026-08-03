const MANIFEST_SCHEMA = "berryboy-venue-manifest.v1";

export const GALLERY_VENUE_MANIFEST_SCHEMA = MANIFEST_SCHEMA;

export const GALLERY_VENUE_ASSET_ROLES = Object.freeze([
  "walls",
  "floor",
  "ceiling",
  "props",
  "building",
  "collision",
  "navigation",
  "decorations"
]);

const ROLE_ALIASES = Object.freeze({
  wall: "walls",
  walls: "walls",
  floor: "floor",
  floors: "floor",
  ceiling: "ceiling",
  roof: "ceiling",
  props: "props",
  prop: "props",
  building: "building",
  collision: "collision",
  collisions: "collision",
  navigation: "navigation",
  nav: "navigation",
  decoration: "decorations",
  decorations: "decorations",
  decor: "decorations",
  artworkanchor: "artworkAnchor",
  artwork_anchor: "artworkAnchor",
  sculptureanchor: "sculptureAnchor",
  sculpture_anchor: "sculptureAnchor",
  walkable: "walkable"
});

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function asNonEmptyString(value) {
  const normalized = String(value == null ? "" : value).trim();
  return normalized || "";
}

function asFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function uniqueStrings(values) {
  const seen = new Set();
  return (values || []).map(asNonEmptyString).filter(function (value) {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export function normalizeVenueAssetRole(value) {
  const key = asNonEmptyString(value).replace(/[\s-]+/g, "_").toLowerCase();
  return ROLE_ALIASES[key] || key;
}

export function validateVenueManifest(input) {
  const errors = [];
  const warnings = [];
  const manifest = isObject(input) ? input : {};

  if (manifest.schema !== MANIFEST_SCHEMA) {
    errors.push(`Unsupported manifest schema: ${asNonEmptyString(manifest.schema) || "missing"}`);
  }
  if (!asNonEmptyString(manifest.venueId)) errors.push("venueId is required");
  if (!asNonEmptyString(manifest.versionId)) errors.push("versionId is required");
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
    errors.push("assets must contain at least one enabled asset");
  }

  const assetIds = new Set();
  (Array.isArray(manifest.assets) ? manifest.assets : []).forEach(function (asset, index) {
    if (!isObject(asset)) {
      errors.push(`assets[${index}] must be an object`);
      return;
    }
    const assetId = asNonEmptyString(asset.assetId);
    const role = normalizeVenueAssetRole(asset.role);
    if (!assetId) errors.push(`assets[${index}].assetId is required`);
    else if (assetIds.has(assetId)) errors.push(`Duplicate assetId: ${assetId}`);
    else assetIds.add(assetId);

    if (!GALLERY_VENUE_ASSET_ROLES.includes(role)) {
      errors.push(`assets[${index}].role is not allowed: ${role || "missing"}`);
    }
    if (asset.enabled !== false && !asNonEmptyString(asset.publicUrl) && !asNonEmptyString(asset.path)) {
      errors.push(`assets[${index}] requires publicUrl or path`);
    }
  });

  const idsByCollection = [
    ["spawnPoints", manifest.spawnPoints],
    ["zones", manifest.zones],
    ["artworkAnchors", manifest.artworkAnchors],
    ["sculptureAnchors", manifest.sculptureAnchors],
    ["collisionSets", manifest.collisionSets]
  ];
  idsByCollection.forEach(function (entry) {
    const name = entry[0];
    const values = Array.isArray(entry[1]) ? entry[1] : [];
    const ids = new Set();
    values.forEach(function (value, index) {
      const id = asNonEmptyString(value && value.id);
      if (!id) errors.push(`${name}[${index}].id is required`);
      else if (ids.has(id)) errors.push(`Duplicate ${name} id: ${id}`);
      else ids.add(id);
    });
  });

  const enabledAssets = (Array.isArray(manifest.assets) ? manifest.assets : []).filter(function (asset) {
    return asset && asset.enabled !== false;
  });
  if (enabledAssets.length && !enabledAssets.some(function (asset) { return asset.critical !== false; })) {
    warnings.push("Manifest has no critical assets; viewer gate will not protect venue geometry");
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function resolveVenueAssetUrl(asset, manifestUrl) {
  if (!asset) return "";
  const explicit = asNonEmptyString(asset.publicUrl);
  if (explicit) return explicit;
  const path = asNonEmptyString(asset.path);
  if (!path) return "";
  try {
    return new URL(path, manifestUrl || (typeof document !== "undefined" ? document.baseURI : "http://localhost/")).href;
  } catch (_error) {
    return path;
  }
}

function normalizeVector3(value, fallback) {
  const source = isObject(value) ? value : {};
  const base = isObject(fallback) ? fallback : { x: 0, y: 0, z: 0 };
  return {
    x: asFiniteNumber(source.x, asFiniteNumber(base.x, 0)),
    y: asFiniteNumber(source.y, asFiniteNumber(base.y, 0)),
    z: asFiniteNumber(source.z, asFiniteNumber(base.z, 0))
  };
}

function normalizeAsset(asset, index, manifestUrl) {
  const role = normalizeVenueAssetRole(asset.role);
  const url = resolveVenueAssetUrl(asset, manifestUrl);
  return {
    assetId: asNonEmptyString(asset.assetId),
    role,
    publicUrl: url,
    sourcePath: asNonEmptyString(asset.path),
    critical: asset.critical !== false,
    enabled: asset.enabled !== false,
    loadOrder: asFiniteNumber(asset.loadOrder, index),
    deferUntilInteractionGate: !!(
      asset.deferUntilInteractionGate ||
      (asset.streamingPolicy && asset.streamingPolicy.deferUntilInteractionGate)
    ),
    meshRules: isObject(asset.meshRules) ? cloneJson(asset.meshRules) : {},
    shadowPolicy: isObject(asset.shadowPolicy) ? cloneJson(asset.shadowPolicy) : {},
    collisionPolicy: isObject(asset.collisionPolicy) ? cloneJson(asset.collisionPolicy) : {},
    streamingPolicy: isObject(asset.streamingPolicy) ? cloneJson(asset.streamingPolicy) : {},
    materialPolicy: isObject(asset.materialPolicy) ? cloneJson(asset.materialPolicy) : {},
    metadata: isObject(asset.metadata) ? cloneJson(asset.metadata) : {}
  };
}

export function normalizeVenueManifest(input, options) {
  const validation = validateVenueManifest(input);
  if (!validation.valid) {
    const error = new Error(`Invalid Venue Manifest: ${validation.errors.join("; ")}`);
    error.code = "VENUE_MANIFEST_INVALID";
    error.validation = validation;
    throw error;
  }

  const manifestUrl = asNonEmptyString(options && options.manifestUrl);
  const manifest = cloneJson(input);
  const normalized = {
    schema: MANIFEST_SCHEMA,
    venueId: asNonEmptyString(manifest.venueId),
    versionId: asNonEmptyString(manifest.versionId),
    manifestUrl,
    coordinateSystem: Object.assign({ upAxis: "Y", units: "meters" }, manifest.coordinateSystem || {}),
    assets: manifest.assets.map(function (asset, index) { return normalizeAsset(asset, index, manifestUrl); })
      .filter(function (asset) { return asset.enabled; })
      .sort(function (a, b) { return a.loadOrder - b.loadOrder || a.assetId.localeCompare(b.assetId); }),
    spawnPoints: (manifest.spawnPoints || []).map(function (spawn, index) {
      return {
        id: asNonEmptyString(spawn.id),
        position: normalizeVector3(spawn.position),
        target: normalizeVector3(spawn.target, { x: 0, y: 1, z: 0 }),
        safe: spawn.safe === true,
        visitor: spawn.visitor !== false,
        loadOrder: asFiniteNumber(spawn.loadOrder, index),
        metadata: isObject(spawn.metadata) ? cloneJson(spawn.metadata) : {}
      };
    }),
    zones: cloneJson(Array.isArray(manifest.zones) ? manifest.zones : []),
    zoneAdjacency: cloneJson(Array.isArray(manifest.zoneAdjacency) ? manifest.zoneAdjacency : []),
    collisionSets: cloneJson(Array.isArray(manifest.collisionSets) ? manifest.collisionSets : []),
    walkableAreas: cloneJson(Array.isArray(manifest.walkableAreas) ? manifest.walkableAreas : []),
    artworkAnchors: cloneJson(Array.isArray(manifest.artworkAnchors) ? manifest.artworkAnchors : []),
    sculptureAnchors: cloneJson(Array.isArray(manifest.sculptureAnchors) ? manifest.sculptureAnchors : []),
    navigationGraph: cloneJson(isObject(manifest.navigationGraph) ? manifest.navigationGraph : { nodes: [], edges: [] }),
    editableMaterials: cloneJson(Array.isArray(manifest.editableMaterials) ? manifest.editableMaterials : []),
    lockedMaterials: cloneJson(Array.isArray(manifest.lockedMaterials) ? manifest.lockedMaterials : []),
    lightingDefaults: cloneJson(isObject(manifest.lightingDefaults) ? manifest.lightingDefaults : {}),
    mobileBudgets: cloneJson(isObject(manifest.mobileBudgets) ? manifest.mobileBudgets : {}),
    technicalFlags: cloneJson(isObject(manifest.technicalFlags) ? manifest.technicalFlags : {}),
    meshRules: cloneJson(isObject(manifest.meshRules) ? manifest.meshRules : {}),
    validationWarnings: validation.warnings.slice()
  };

  if (!normalized.spawnPoints.length) {
    throw new Error("Invalid Venue Manifest: at least one spawn point is required");
  }
  return normalized;
}

export async function loadVenueManifest(manifestUrl, fetchImplementation) {
  const fetchFn = fetchImplementation || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
  if (!fetchFn) throw new Error("Venue Manifest loader requires fetch");
  const response = await fetchFn(manifestUrl, { cache: "no-store", credentials: "same-origin" });
  if (!response || !response.ok) {
    throw new Error(`Venue Manifest request failed (${response ? response.status : "no response"}): ${manifestUrl}`);
  }
  const raw = await response.json();
  return normalizeVenueManifest(raw, { manifestUrl: response.url || manifestUrl });
}

export function createGalleryRuntimeContext(input, manifest) {
  const source = isObject(input) ? input : {};
  const venue = isObject(source.venue) ? source.venue : {};
  const platform = isObject(source.platform) ? source.platform : {};
  const exhibition = isObject(source.exhibition) ? source.exhibition : {};
  const services = isObject(source.services) ? source.services : {};
  if (!manifest) throw new Error("GalleryRuntimeContext requires a normalized Venue Manifest");
  if (venue.venueId && venue.venueId !== manifest.venueId) {
    throw new Error(`Runtime venueId mismatch: ${venue.venueId} !== ${manifest.venueId}`);
  }
  if (venue.versionId && venue.versionId !== manifest.versionId) {
    throw new Error(`Runtime versionId mismatch: ${venue.versionId} !== ${manifest.versionId}`);
  }

  const exhibitionId = asNonEmptyString(exhibition.exhibitionId || platform.exhibitionId);
  const exhibitionSlug = asNonEmptyString(exhibition.exhibitionSlug || platform.exhibitionSlug);
  const stateChannel = ["draft", "previous"].includes(asNonEmptyString(exhibition.stateChannel))
    ? asNonEmptyString(exhibition.stateChannel)
    : "published";
  const stateRecordId = asNonEmptyString(exhibition.stateRecordId) || exhibitionId;
  const storageScope = asNonEmptyString(exhibition.storageScope) || (exhibitionId ? `exhibitions/${exhibitionId}` : "");
  if (!exhibitionId) throw new Error("GalleryRuntimeContext exhibition.exhibitionId is required");
  if (!stateRecordId) throw new Error("GalleryRuntimeContext exhibition.stateRecordId is required");
  if (!storageScope) throw new Error("GalleryRuntimeContext exhibition.storageScope is required");

  return Object.freeze({
    schema: "berryboy-gallery-runtime-context.v2",
    stage: "12D2",
    platform: Object.freeze({
      platformId: asNonEmptyString(platform.platformId) || "berryboy-art-gallery",
      locale: asNonEmptyString(platform.locale) || "en",
      mode: asNonEmptyString(platform.mode) || "viewer",
      authenticated: platform.authenticated === true,
      exhibitionId,
      exhibitionSlug: exhibitionSlug || null
    }),
    venue: Object.freeze({
      venueId: manifest.venueId,
      versionId: manifest.versionId,
      manifestUrl: manifest.manifestUrl,
      manifest
    }),
    exhibition: Object.freeze({
      exhibitionId,
      exhibitionSlug: exhibitionSlug || null,
      title: asNonEmptyString(exhibition.title) || exhibitionSlug || exhibitionId,
      status: asNonEmptyString(exhibition.status) || "published",
      stateChannel,
      stateRecordId,
      previousStateRecordId: asNonEmptyString(exhibition.previousStateRecordId) || `${stateRecordId}:previous`,
      storageScope,
      stateRevision: Math.max(0, asFiniteNumber(exhibition.stateRevision, 0)),
      lockVersion: Math.max(0, asFiniteNumber(exhibition.lockVersion, 0)),
      legacyStateRecordId: asNonEmptyString(exhibition.legacyStateRecordId) || null,
      legacyPreviousStateRecordId: asNonEmptyString(exhibition.legacyPreviousStateRecordId) || null,
      databaseVenueId: asNonEmptyString(exhibition.databaseVenueId) || null,
      databaseVenueVersionId: asNonEmptyString(exhibition.databaseVenueVersionId) || null,
      dataSource: asNonEmptyString(exhibition.dataSource) || "d2"
    }),
    services: Object.freeze({
      exhibitionStateRepository: services.exhibitionStateRepository || null,
      mediaRepository: services.mediaRepository || null
    })
  });
}

function extractMetadataObject(mesh) {
  const result = {};
  const candidates = [];
  if (mesh && isObject(mesh.metadata)) candidates.push(mesh.metadata);
  if (mesh && isObject(mesh.metadata && mesh.metadata.gltf)) candidates.push(mesh.metadata.gltf);
  if (mesh && isObject(mesh.metadata && mesh.metadata.gltf && mesh.metadata.gltf.extras)) candidates.push(mesh.metadata.gltf.extras);
  if (mesh && isObject(mesh._internalMetadata)) candidates.push(mesh._internalMetadata);
  if (mesh && isObject(mesh.extras)) candidates.push(mesh.extras);
  candidates.forEach(function (candidate) { Object.assign(result, candidate); });
  return result;
}

function matchesRule(meshName, rule) {
  if (!rule) return false;
  if (typeof rule === "string") return meshName === rule;
  if (!isObject(rule)) return false;
  if (rule.name && meshName !== String(rule.name)) return false;
  if (rule.prefix && !meshName.startsWith(String(rule.prefix))) return false;
  if (rule.suffix && !meshName.endsWith(String(rule.suffix))) return false;
  if (rule.includes && !meshName.includes(String(rule.includes))) return false;
  if (rule.regex) {
    try { if (!(new RegExp(rule.regex)).test(meshName)) return false; }
    catch (_error) { return false; }
  }
  return true;
}

function roleFromExplicitRules(mesh, asset, manifest) {
  const rules = [];
  if (asset && asset.meshRules && Array.isArray(asset.meshRules.assignments)) rules.push(...asset.meshRules.assignments);
  if (manifest && manifest.meshRules && Array.isArray(manifest.meshRules.assignments)) rules.push(...manifest.meshRules.assignments);
  const name = asNonEmptyString(mesh && (mesh.name || mesh.id));
  for (const rule of rules) {
    if (!matchesRule(name, rule)) continue;
    const role = normalizeVenueAssetRole(rule.role || rule.berryboyType);
    if (role) return { role, source: "manifest-rule", rule: cloneJson(rule) };
  }
  return null;
}

function roleFromMetadata(mesh) {
  const metadata = extractMetadataObject(mesh);
  const rawRole = metadata.berryboyType || metadata.galleryType || metadata.venueRole || metadata.role;
  const role = normalizeVenueAssetRole(rawRole);
  return role ? { role, source: "metadata", metadata } : null;
}

function roleFromLegacyFallback(mesh, manifest, context) {
  const fallback = manifest && manifest.meshRules && manifest.meshRules.legacyFallback;
  if (!fallback || fallback.enabled !== true) return null;
  const scope = `${context && context.venue ? context.venue.venueId : ""}/${context && context.venue ? context.venue.versionId : ""}`;
  if (fallback.venueOnly && String(fallback.venueOnly) !== scope) return null;
  const name = asNonEmptyString(mesh && (mesh.name || mesh.id));
  const tests = [
    ["walls", fallback.wallPrefix],
    ["floor", fallback.floorPrefix],
    ["ceiling", fallback.ceilingPrefix],
    ["props", fallback.propPrefix]
  ];
  for (const test of tests) {
    if (test[1] && name.startsWith(String(test[1]))) return { role: test[0], source: "legacy-fallback" };
  }
  return null;
}

export function resolveVenueMeshDescriptor(mesh, asset, manifest, context) {
  const explicit = roleFromExplicitRules(mesh, asset, manifest);
  const metadata = roleFromMetadata(mesh);
  const fallback = roleFromLegacyFallback(mesh, manifest, context);
  const metadataFirst = !(manifest && manifest.meshRules && manifest.meshRules.metadataFirst === false);
  let resolved = metadataFirst ? (metadata || explicit || fallback) : (explicit || metadata || fallback);
  if (!resolved && asset && ["walls", "floor", "ceiling", "props", "collision", "decorations"].includes(asset.role)) {
    resolved = { role: asset.role, source: "asset-default" };
  }
  if (!resolved && asset && asset.role === "building") {
    resolved = { role: "decorations", source: "building-unclassified" };
  }
  const normalizedMetadata = extractMetadataObject(mesh);
  const stableId = asNonEmptyString(
    normalizedMetadata.berryboyNodeId ||
    normalizedMetadata.nodeId ||
    normalizedMetadata.surfaceId ||
    normalizedMetadata.anchorId ||
    `${asset ? asset.assetId : "asset"}:${mesh && (mesh.id || mesh.name) ? (mesh.id || mesh.name) : "mesh"}`
  );
  return {
    role: resolved ? resolved.role : null,
    source: resolved ? resolved.source : "unresolved",
    stableId,
    surfaceId: asNonEmptyString(normalizedMetadata.surfaceId || normalizedMetadata.berryboySurfaceId) || null,
    anchorId: asNonEmptyString(normalizedMetadata.anchorId || normalizedMetadata.berryboyAnchorId) || null,
    zoneId: asNonEmptyString(normalizedMetadata.berryboyZone || normalizedMetadata.zoneId) || null,
    metadata: normalizedMetadata,
    rule: resolved && resolved.rule ? resolved.rule : null
  };
}

export function createVenueRuntimeRegistry(manifest) {
  return {
    schema: "berryboy-venue-runtime-registry.v1",
    venueId: manifest.venueId,
    versionId: manifest.versionId,
    manifest,
    assetsById: new Map(),
    meshEntries: [],
    meshEntryByMesh: typeof WeakMap !== "undefined" ? new WeakMap() : new Map(),
    stableNodesById: new Map(),
    surfacesById: new Map(),
    anchorsById: new Map(),
    legacyNames: new Map(),
    unresolved: [],
    conflicts: [],
    visual: { walls: [], floors: [], ceilings: [], props: [], decorations: [] },
    collision: { walkBlocking: [], inspectBlocking: [], raycastOnly: [] },
    walkable: { surfaces: [] },
    surfaces: {
      artworkMount: [],
      wallPaint: [],
      lightTargets: { wall: [], floor: [], ceiling: [], props: [] }
    },
    anchors: {
      artworks: cloneJson(manifest.artworkAnchors || []),
      sculptures: cloneJson(manifest.sculptureAnchors || [])
    },
    zones: cloneJson(manifest.zones || []),
    zoneAdjacency: cloneJson(manifest.zoneAdjacency || []),
    navigation: cloneJson(manifest.navigationGraph || { nodes: [], edges: [] }),
    collisionSets: cloneJson(manifest.collisionSets || []),
    audit: { registeredMeshes: 0, unresolvedMeshes: 0, duplicateStableIds: 0, roleCounts: {} }
  };
}

function pushUnique(array, value) {
  if (value && array.indexOf(value) === -1) array.push(value);
}

export function registerVenueMesh(registry, mesh, descriptor, asset) {
  if (!registry || !mesh || !descriptor) return null;
  const entry = { mesh, assetId: asset.assetId, assetRole: asset.role, descriptor };
  registry.meshEntries.push(entry);
  registry.meshEntryByMesh.set(mesh, entry);
  if (mesh.name) registry.legacyNames.set(mesh.name, mesh);
  if (mesh.id) registry.legacyNames.set(mesh.id, mesh);

  const existingStable = registry.stableNodesById.get(descriptor.stableId);
  if (existingStable && existingStable !== mesh) {
    registry.conflicts.push({ type: "stableId", id: descriptor.stableId, assetId: asset.assetId, meshName: mesh.name || null });
    registry.audit.duplicateStableIds += 1;
  } else {
    registry.stableNodesById.set(descriptor.stableId, mesh);
  }
  if (descriptor.surfaceId) registry.surfacesById.set(descriptor.surfaceId, mesh);
  if (descriptor.anchorId) registry.anchorsById.set(descriptor.anchorId, mesh);

  const role = descriptor.role;
  registry.audit.registeredMeshes += 1;
  registry.audit.roleCounts[role || "unresolved"] = (registry.audit.roleCounts[role || "unresolved"] || 0) + 1;
  if (!role) {
    registry.unresolved.push(entry);
    registry.audit.unresolvedMeshes += 1;
    return entry;
  }

  if (role === "walls") {
    pushUnique(registry.visual.walls, mesh);
    pushUnique(registry.collision.walkBlocking, mesh);
    pushUnique(registry.collision.inspectBlocking, mesh);
    pushUnique(registry.surfaces.artworkMount, mesh);
    pushUnique(registry.surfaces.wallPaint, mesh);
    pushUnique(registry.surfaces.lightTargets.wall, mesh);
  } else if (role === "floor" || role === "walkable") {
    pushUnique(registry.visual.floors, mesh);
    pushUnique(registry.walkable.surfaces, mesh);
    pushUnique(registry.surfaces.lightTargets.floor, mesh);
  } else if (role === "ceiling") {
    pushUnique(registry.visual.ceilings, mesh);
    pushUnique(registry.surfaces.lightTargets.ceiling, mesh);
  } else if (role === "props") {
    pushUnique(registry.visual.props, mesh);
    if (asset.collisionPolicy.walkBlocking !== false) pushUnique(registry.collision.walkBlocking, mesh);
    if (asset.collisionPolicy.inspectBlocking !== false) pushUnique(registry.collision.inspectBlocking, mesh);
    pushUnique(registry.surfaces.lightTargets.props, mesh);
  } else if (role === "collision") {
    if (asset.collisionPolicy.walkBlocking !== false) pushUnique(registry.collision.walkBlocking, mesh);
    if (asset.collisionPolicy.inspectBlocking !== false) pushUnique(registry.collision.inspectBlocking, mesh);
    if (asset.collisionPolicy.raycastOnly === true) pushUnique(registry.collision.raycastOnly, mesh);
  } else if (role === "artworkAnchor") {
    pushUnique(registry.anchors.artworks, { id: descriptor.anchorId || descriptor.stableId, nodeId: descriptor.stableId, mesh });
  } else if (role === "sculptureAnchor") {
    pushUnique(registry.anchors.sculptures, { id: descriptor.anchorId || descriptor.stableId, nodeId: descriptor.stableId, mesh });
  } else {
    pushUnique(registry.visual.decorations, mesh);
  }
  return entry;
}

export function registerVenueAssetResult(registry, asset, meshes, context) {
  if (!registry || !asset) return null;
  if (registry.assetsById.has(asset.assetId)) {
    const error = new Error(`Venue asset already registered: ${asset.assetId}`);
    error.code = "VENUE_ASSET_ALREADY_REGISTERED";
    throw error;
  }
  const assetRecord = {
    asset,
    meshes: [],
    registeredAt: Date.now(),
    status: "loaded",
    roleCounts: {},
    unresolved: []
  };
  (meshes || []).forEach(function (mesh) {
    if (!mesh || mesh.name === "__root__") return;
    const descriptor = resolveVenueMeshDescriptor(mesh, asset, registry.manifest, context);
    const entry = registerVenueMesh(registry, mesh, descriptor, asset);
    assetRecord.meshes.push(mesh);
    assetRecord.roleCounts[descriptor.role || "unresolved"] = (assetRecord.roleCounts[descriptor.role || "unresolved"] || 0) + 1;
    if (!descriptor.role) assetRecord.unresolved.push(entry);
  });
  registry.assetsById.set(asset.assetId, assetRecord);
  return assetRecord;
}

export function getVenueRegistryMeshByStableId(registry, stableId) {
  return registry && stableId ? registry.stableNodesById.get(stableId) || registry.surfacesById.get(stableId) || registry.anchorsById.get(stableId) || null : null;
}

export function getVenueRegistryMeshStableId(registry, mesh) {
  if (!registry || !mesh) return null;
  const entry = registry.meshEntryByMesh.get(mesh);
  return entry && entry.descriptor ? entry.descriptor.surfaceId || entry.descriptor.stableId || null : null;
}

export function createVenueRegistryAudit(registry) {
  if (!registry) return null;
  return {
    schema: registry.schema,
    venueId: registry.venueId,
    versionId: registry.versionId,
    assets: Array.from(registry.assetsById.values()).map(function (record) {
      return {
        assetId: record.asset.assetId,
        role: record.asset.role,
        critical: record.asset.critical,
        meshCount: record.meshes.length,
        roleCounts: Object.assign({}, record.roleCounts),
        unresolved: record.unresolved.length
      };
    }),
    visual: {
      walls: registry.visual.walls.length,
      floors: registry.visual.floors.length,
      ceilings: registry.visual.ceilings.length,
      props: registry.visual.props.length,
      decorations: registry.visual.decorations.length
    },
    collision: {
      walkBlocking: registry.collision.walkBlocking.length,
      inspectBlocking: registry.collision.inspectBlocking.length,
      raycastOnly: registry.collision.raycastOnly.length
    },
    walkable: registry.walkable.surfaces.length,
    stableNodes: registry.stableNodesById.size,
    surfaces: registry.surfacesById.size,
    unresolved: registry.unresolved.map(function (entry) {
      return { assetId: entry.assetId, meshName: entry.mesh && entry.mesh.name || null };
    }),
    conflicts: cloneJson(registry.conflicts),
    audit: cloneJson(registry.audit)
  };
}

export function pickVenueSpawnPoint(manifest, options) {
  const values = (manifest && Array.isArray(manifest.spawnPoints) ? manifest.spawnPoints : []).slice();
  const requestedId = asNonEmptyString(options && options.id);
  if (requestedId) {
    const requested = values.find(function (spawn) { return spawn.id === requestedId; });
    if (requested) return requested;
  }
  return values.find(function (spawn) { return spawn.safe && spawn.visitor; }) ||
    values.find(function (spawn) { return spawn.visitor; }) ||
    values[0] || null;
}

export function getVenueMeshMetadata(mesh) {
  return extractMetadataObject(mesh);
}

export function getVenueManifestAssetIdsByRole(manifest, role) {
  const normalizedRole = normalizeVenueAssetRole(role);
  return (manifest && manifest.assets || []).filter(function (asset) { return asset.role === normalizedRole; }).map(function (asset) { return asset.assetId; });
}

export function getVenueManifestAssetById(manifest, assetId) {
  return (manifest && manifest.assets || []).find(function (asset) { return asset.assetId === assetId; }) || null;
}

export function getVenueManifestSummary(manifest) {
  return {
    venueId: manifest.venueId,
    versionId: manifest.versionId,
    assetCount: manifest.assets.length,
    criticalAssetIds: uniqueStrings(manifest.assets.filter(function (asset) { return asset.critical; }).map(function (asset) { return asset.assetId; })),
    optionalAssetIds: uniqueStrings(manifest.assets.filter(function (asset) { return !asset.critical; }).map(function (asset) { return asset.assetId; })),
    spawnPointIds: uniqueStrings(manifest.spawnPoints.map(function (spawn) { return spawn.id; })),
    zoneIds: uniqueStrings((manifest.zones || []).map(function (zone) { return zone && zone.id; }))
  };
}

export function getVenueRegistryAnchor(registry, anchorId) {
  if (!registry || !anchorId) return null;
  const normalizedId = asNonEmptyString(anchorId);
  const manifestAnchor = (registry.anchors.artworks || []).concat(registry.anchors.sculptures || []).find(function (anchor) {
    return anchor && asNonEmptyString(anchor.id) === normalizedId;
  }) || null;
  const mesh = registry.anchorsById.get(normalizedId) ||
    (manifestAnchor && manifestAnchor.nodeId ? registry.stableNodesById.get(asNonEmptyString(manifestAnchor.nodeId)) : null) ||
    null;
  return manifestAnchor || mesh ? { id: normalizedId, definition: manifestAnchor, mesh } : null;
}

export function getVenueRegistryAnchors(registry, kind) {
  if (!registry) return [];
  const normalizedKind = asNonEmptyString(kind).toLowerCase();
  const source = normalizedKind === "sculpture" || normalizedKind === "sculptures"
    ? registry.anchors.sculptures
    : normalizedKind === "artwork" || normalizedKind === "artworks"
      ? registry.anchors.artworks
      : (registry.anchors.artworks || []).concat(registry.anchors.sculptures || []);
  return (source || []).map(function (anchor) {
    const id = asNonEmptyString(anchor && anchor.id);
    return {
      id,
      definition: anchor,
      mesh: id ? registry.anchorsById.get(id) || (anchor && anchor.nodeId ? registry.stableNodesById.get(asNonEmptyString(anchor.nodeId)) : null) || null : null
    };
  });
}
