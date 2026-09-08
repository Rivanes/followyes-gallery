/*
  Exhibition Platform — C6C8C21 Multi-Space Foundation
  Converts a canonical Venue Version manifest into the small Space contract used by Gallery_V0_11.
  The Babylon engine never needs to know Supabase table names, bucket names or fixed GLB paths.
*/

export const VENUE_MANIFEST_SCHEMA = "exhibition-platform-venue-manifest.v1";
export const LEGACY_VENUE_MANIFEST_SCHEMA = "berryboy-venue-manifest.v1";
export const REQUIRED_SPACE_ASSET_ROLES = Object.freeze(["floor", "walls", "ceiling", "props"]);

function text(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeRole(value) {
  return text(value).toLowerCase();
}

function splitPublicUrl(publicUrl) {
  const url = text(publicUrl);
  if (!url) return null;
  const clean = url.split("#")[0];
  const queryIndex = clean.indexOf("?");
  const pathPart = queryIndex >= 0 ? clean.slice(0, queryIndex) : clean;
  const queryPart = queryIndex >= 0 ? clean.slice(queryIndex) : "";
  const slash = pathPart.lastIndexOf("/");
  if (slash < 0) return null;
  return {
    rootUrl: pathPart.slice(0, slash + 1),
    fileName: pathPart.slice(slash + 1) + queryPart
  };
}

function getPublicUrl(supabase, bucket, path) {
  if (!supabase || !supabase.storage || !bucket || !path) return "";
  try {
    const result = supabase.storage.from(bucket).getPublicUrl(path);
    return result && result.data && result.data.publicUrl ? String(result.data.publicUrl) : "";
  } catch (_error) {
    return "";
  }
}

function normalizeManifestAsset(raw) {
  raw = raw && typeof raw === "object" ? raw : {};
  return {
    id: text(raw.id || raw.assetId || raw.asset_id),
    role: normalizeRole(raw.role),
    storageBucket: text(raw.storageBucket || raw.storage_bucket || raw.bucket),
    storagePath: text(raw.storagePath || raw.storage_path || raw.path),
    publicUrl: text(raw.publicUrl || raw.public_url || raw.url),
    version: text(raw.version || raw.assetVersion || raw.asset_version || "1") || "1",
    required: raw.required !== false,
    metadata: raw.metadata && typeof raw.metadata === "object" ? raw.metadata : {}
  };
}

function chooseEntry(manifest) {
  const points = Array.isArray(manifest && manifest.spawnPoints) ? manifest.spawnPoints : [];
  const point = points.find((item) => item && item.visitor === true && item.safe !== false)
    || points.find((item) => item && item.safe !== false)
    || points[0]
    || null;
  if (!point) return null;
  const position = point.position && typeof point.position === "object" ? point.position : null;
  const target = point.target && typeof point.target === "object" ? point.target : null;
  if (!position || !target) return null;
  const numbers = [position.x, position.y, position.z, target.x, target.y, target.z].map(Number);
  if (!numbers.every(Number.isFinite)) return null;
  return {
    id: text(point.id || "visitor-entry") || "visitor-entry",
    position: { x: numbers[0], y: numbers[1], z: numbers[2] },
    target: { x: numbers[3], y: numbers[4], z: numbers[5] }
  };
}

export function validateVenueManifest(manifest, options = {}) {
  const problems = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return { valid: false, problems: ["Manifest must be an object."], assetRoles: [] };
  }

  const schema = text(manifest.schema);
  const allowLegacySchema = options.allowLegacySchema === true;
  if (schema !== VENUE_MANIFEST_SCHEMA && !(allowLegacySchema && schema === LEGACY_VENUE_MANIFEST_SCHEMA)) {
    problems.push(`Unsupported Venue manifest schema: ${schema || "(missing)"}.`);
  }

  const coordinateSystem = manifest.coordinateSystem || {};
  if (text(coordinateSystem.upAxis).toUpperCase() !== "Y") problems.push("Venue coordinateSystem.upAxis must be Y.");
  if (text(coordinateSystem.units).toLowerCase() !== "meters") problems.push("Venue coordinateSystem.units must be meters.");

  const assets = Array.isArray(manifest.assets) ? manifest.assets.map(normalizeManifestAsset) : [];
  const roles = assets.map((item) => item.role).filter(Boolean);
  REQUIRED_SPACE_ASSET_ROLES.forEach((role) => {
    const matches = assets.filter((item) => item.role === role);
    if (matches.length !== 1) problems.push(`Venue manifest requires exactly one ${role} asset.`);
    const asset = matches[0];
    if (asset && !asset.publicUrl && !(asset.storageBucket && asset.storagePath)) {
      problems.push(`${role} asset needs publicUrl or storageBucket + storagePath.`);
    }
  });

  if (!chooseEntry(manifest)) problems.push("Venue manifest needs a safe visitor spawn point with position and target.");

  return { valid: problems.length === 0, problems, assetRoles: roles, assets };
}

export function buildSpaceDefinition({ supabase, venue, venueVersion, manifest, allowLegacySchema = false }) {
  venue = venue && typeof venue === "object" ? venue : {};
  venueVersion = venueVersion && typeof venueVersion === "object" ? venueVersion : {};
  manifest = manifest && typeof manifest === "object" ? manifest : (venueVersion.manifest || {});

  const validation = validateVenueManifest(manifest, { allowLegacySchema });
  if (!validation.valid) {
    throw new Error("Venue manifest validation failed: " + validation.problems.join(" "));
  }

  const venueSlug = text(venue.slug || manifest.venueId);
  const versionNumber = text(venueVersion.version_number || venueVersion.versionNumber || manifest.versionId || "v1") || "v1";
  if (!venueSlug) throw new Error("Venue slug is missing.");
  if (text(manifest.venueId) && text(manifest.venueId) !== venueSlug) {
    throw new Error(`Venue manifest venueId mismatch: expected ${venueSlug}, got ${text(manifest.venueId)}.`);
  }
  if (text(manifest.versionId) && text(manifest.versionId) !== versionNumber) {
    throw new Error(`Venue manifest versionId mismatch: expected ${versionNumber}, got ${text(manifest.versionId)}.`);
  }

  const byRole = {};
  validation.assets.forEach((asset) => { if (asset.role && !byRole[asset.role]) byRole[asset.role] = asset; });
  const assets = {};
  REQUIRED_SPACE_ASSET_ROLES.forEach((role) => {
    const source = byRole[role];
    const publicUrl = source.publicUrl || getPublicUrl(supabase, source.storageBucket, source.storagePath);
    const parts = splitPublicUrl(publicUrl);
    if (!parts || !parts.rootUrl || !parts.fileName) {
      throw new Error(`Could not resolve public delivery URL for Venue ${venueSlug} asset ${role}.`);
    }
    assets[role] = Object.freeze({
      id: source.id || role,
      role,
      rootUrl: parts.rootUrl,
      fileName: parts.fileName,
      version: source.version || "1",
      required: source.required !== false,
      storageBucket: source.storageBucket || null,
      storagePath: source.storagePath || null
    });
  });

  return Object.freeze({
    schema: "exhibition-platform-space-definition.v1",
    id: venueSlug,
    venueId: text(venue.id),
    name: text(venue.name || venueSlug),
    version: versionNumber,
    venueVersionId: text(venueVersion.id),
    manifestSchema: text(manifest.schema),
    entry: chooseEntry(manifest),
    assets: Object.freeze(assets)
  });
}
