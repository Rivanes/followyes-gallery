/*
  Exhibition Platform — V14.1.10.1 Public Gallery Entry / Fresh-Visit Policy
  The instructional popup is a visit/entry gate, not a once-per-Space hint. Every explicit
  visitor entry from Home/listing shows it, even when returning to the same Venue Version.
  In-place Exhibition switches inside an already-open same Space keep the previous behavior.
*/

import { getRuntimeVenueVersionKey } from "./scene-lifecycle-controller.js?v=v14_1_10_1_public_reentry_20260911";

export function shouldShowPublicSpaceIntro(previousRuntime, nextRuntime, options = {}) {
  if (!nextRuntime || nextRuntime.mode === "admin" || nextRuntime.context === "gallery-authoring") return false;
  const nextVenueVersionId = getRuntimeVenueVersionKey(nextRuntime);
  if (!nextVenueVersionId) return false;
  if (options.initial === true || options.entry === true || options.publicEntry === true || !previousRuntime) return true;
  const previousVenueVersionId = getRuntimeVenueVersionKey(previousRuntime);
  if (!previousVenueVersionId) return true;
  return previousVenueVersionId !== nextVenueVersionId;
}
