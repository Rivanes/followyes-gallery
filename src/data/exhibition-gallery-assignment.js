/*
  Exhibition Platform — C6C8C24 Exhibition ↔ Gallery Assignment
  Pure client helpers for displaying channel bindings and migration impact.
  The authoritative state mutation remains the guarded SQL transaction.
*/

export const EXHIBITION_GALLERY_MIGRATION_SCHEMA = "exhibition-platform-venue-migration.v1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function array(value) { return Array.isArray(value) ? value : []; }
function text(value) { return String(value == null ? "" : value).trim(); }

export function unwrapExhibitionEnvelopeContent(state) {
  const root = object(state) || {};
  return object(root.content) || root;
}

export function getExhibitionGalleryMigration(stateOrDetail) {
  const direct = object(stateOrDetail && stateOrDetail.migration);
  if (direct) return direct;
  const state = stateOrDetail && stateOrDetail.state && stateOrDetail.state.draft_state
    ? stateOrDetail.state.draft_state
    : stateOrDetail;
  return object(unwrapExhibitionEnvelopeContent(state).venueMigration);
}

export function isExhibitionGalleryMigrationPending(stateOrDetail) {
  const marker = getExhibitionGalleryMigration(stateOrDetail);
  if (!marker) return false;
  const status = text(marker.status);
  return !!status && status !== "resolved";
}

export function summarizeGalleryMigrationImpact(state) {
  const content = unwrapExhibitionEnvelopeContent(state);
  const editor = object(content.editor) || {};
  return Object.freeze({
    artworks: array(editor.artworks).length,
    sculptures: array(editor.spheres).length,
    wallStates: array(editor.walls).length,
    localLights: array(content.localLights).length,
    hasTourOrder: array(content.tourOrder).length > 0,
    hasNavigationPath: !!(content.navigationPath || content.pathData)
  });
}

export function normalizeGalleryBinding(value) {
  const item = object(value);
  if (!item || !item.versionId) return null;
  return Object.freeze({
    venueId: text(item.venueId),
    venueName: text(item.venueName || item.venueSlug || item.venueId),
    venueSlug: text(item.venueSlug),
    versionId: text(item.versionId),
    versionNumber: text(item.versionNumber),
    versionStatus: text(item.versionStatus)
  });
}

export function galleryBindingLabel(value) {
  const item = normalizeGalleryBinding(value);
  if (!item) return "—";
  return `${item.venueName} · ${item.versionNumber || item.versionId}`;
}

// Executable fixture/reference for C24 QA. It mirrors the documented spatial reset
// without replacing the canonical SQL mutation used in production.
export function referenceRebindSpatialState(state, target = {}) {
  const root = structuredClone(object(state) || {});
  const content = structuredClone(unwrapExhibitionEnvelopeContent(root));
  const editor = object(content.editor) ? structuredClone(content.editor) : {};
  delete content.localLights;
  delete content.customFocus;
  delete content.tourOrder;
  delete content.navigationPath;
  delete content.pathData;
  editor.walls = [];

  editor.artworks = array(editor.artworks).map((item) => {
    const next = { ...item, placementStatus: "needs-placement" };
    for (const key of ["position","rotation","scale","scaling","transform","surfaceId","wallId","anchorId","wall","focusCamera"]) delete next[key];
    return next;
  });
  editor.spheres = array(editor.spheres).map((item) => {
    const next = { ...item, placementStatus: "needs-placement" };
    for (const key of ["position","rotation","scale","scaling","transform","surfaceId","anchorId","sculptureTransform","focusCamera"]) delete next[key];
    return next;
  });
  content.editor = editor;
  content.venueMigration = {
    schema: EXHIBITION_GALLERY_MIGRATION_SCHEMA,
    status: "needs-layout-confirmation",
    sourceVenueId: text(root.venueId) || undefined,
    sourceVenueVersionId: text(root.venueVersionId) || undefined,
    targetVenueId: text(target.venueSlug || target.venueId) || undefined,
    targetVenueVersionId: text(target.versionNumber || target.versionId) || undefined
  };

  const result = object(root.content) ? { ...root, content } : content;
  if (object(root.content)) {
    if (target.venueSlug || target.venueId) result.venueId = text(target.venueSlug || target.venueId);
    if (target.versionNumber || target.versionId) result.venueVersionId = text(target.versionNumber || target.versionId);
    result.channel = "draft";
  }
  return result;
}
