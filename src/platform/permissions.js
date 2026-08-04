export const CAPABILITIES = Object.freeze([
  "platform.manage",
  "users.manage",
  "site.read",
  "site.edit",
  "site.publish",
  "venue.read",
  "venue.create",
  "venue.edit",
  "venue.publish",
  "venue.archive",
  "exhibition.read",
  "exhibition.create",
  "exhibition.edit",
  "exhibition.publish",
  "exhibition.archive",
  "media.read",
  "media.attach",
  "media.upload",
  "media.delete",
  "authors.read",
  "authors.edit",
  "audit.read"
]);

const ROLE_CAPABILITIES = Object.freeze({
  platform_admin: CAPABILITIES,
  venue_admin: [
    "site.read",
    "venue.read",
    "venue.edit",
    "venue.publish",
    "venue.archive",
    "exhibition.read",
    "exhibition.create",
    "exhibition.edit",
    "exhibition.publish",
    "exhibition.archive",
    "media.read",
    "media.attach",
    "media.upload",
    "media.delete",
    "authors.read",
    "authors.edit",
    "audit.read"
  ],
  curator: [
    "site.read",
    "venue.read",
    "exhibition.read",
    "exhibition.edit",
    "media.read",
    "media.attach",
    "media.upload",
    "authors.read",
    "authors.edit",
    "audit.read"
  ],
  viewer: ["site.read", "venue.read", "exhibition.read", "media.read", "authors.read"]
});

function strings(value) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export function normalizeAdminContext(value) {
  const source = value && typeof value === "object" ? value : {};
  const platformRole = String(source.platformRole || source.platform_role || "viewer");
  return Object.freeze({
    userId: String(source.userId || source.user_id || ""),
    email: String(source.email || ""),
    displayName: String(source.displayName || source.display_name || source.email || ""),
    active: source.active !== false,
    platformRole,
    venueAdminIds: strings(source.venueAdminIds || source.venue_admin_ids),
    exhibitionCuratorIds: strings(source.exhibitionCuratorIds || source.exhibition_curator_ids),
    capabilities: strings(source.capabilities).length
      ? strings(source.capabilities)
      : [...(ROLE_CAPABILITIES[platformRole] || ROLE_CAPABILITIES.viewer)]
  });
}

export function createPermissionService(rawContext) {
  const context = normalizeAdminContext(rawContext);
  const capabilities = new Set(context.active ? context.capabilities : []);
  const venueScopes = new Set(context.venueAdminIds);
  const exhibitionScopes = new Set(context.exhibitionCuratorIds);
  const isPlatformAdmin = context.platformRole === "platform_admin";

  function has(capability) {
    return capabilities.has(capability);
  }

  function canVenue(capability, venueId) {
    if (!has(capability)) return false;
    if (isPlatformAdmin) return true;
    if (capability === "venue.read" && exhibitionScopes.size > 0 && !venueId) return true;
    return !!venueId && venueScopes.has(String(venueId));
  }

  function canExhibition(capability, exhibition) {
    if (!has(capability)) return false;
    if (isPlatformAdmin) return true;
    const record = exhibition && typeof exhibition === "object" ? exhibition : { id: exhibition };
    const exhibitionId = String(record.id || record.exhibitionId || "");
    const venueId = String(record.venue_id || record.venueId || "");
    if (venueId && venueScopes.has(venueId)) return true;
    return !!exhibitionId && exhibitionScopes.has(exhibitionId);
  }

  function require(capability, scope) {
    let allowed = has(capability);
    if (scope && scope.type === "venue") allowed = canVenue(capability, scope.id);
    if (scope && scope.type === "exhibition") allowed = canExhibition(capability, scope.record || scope.id);
    if (!allowed) {
      const error = new Error(`Missing capability: ${capability}`);
      error.code = "CMS_PERMISSION_DENIED";
      throw error;
    }
    return true;
  }

  return Object.freeze({ context, has, canVenue, canExhibition, require, isPlatformAdmin });
}
