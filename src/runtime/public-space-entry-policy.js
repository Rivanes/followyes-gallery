/*
  Exhibition Platform — V12 Public Space Entry Policy (C26 contract)
  The public instructional popup belongs to physical Space entry boundaries.
  Exact immutable Venue Version identity is authoritative; Exhibition identity is not.
*/

import { getRuntimeVenueVersionKey } from "./scene-lifecycle-controller.js?v=c6c8c25_2_admin_gallery_preview";

export function shouldShowPublicSpaceIntro(previousRuntime, nextRuntime, options = {}) {
  if (!nextRuntime || nextRuntime.mode === "admin" || nextRuntime.context === "gallery-authoring") return false;
  const nextVenueVersionId = getRuntimeVenueVersionKey(nextRuntime);
  if (!nextVenueVersionId) return false;
  if (options.initial === true || !previousRuntime) return true;
  const previousVenueVersionId = getRuntimeVenueVersionKey(previousRuntime);
  if (!previousVenueVersionId) return true;
  return previousVenueVersionId !== nextVenueVersionId;
}
