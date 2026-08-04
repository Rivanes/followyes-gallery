export const EDITOR_BRIDGE_SCHEMA = "berryboy-editor-bridge.v1";

function value(input) {
  return String(input == null ? "" : input).trim();
}

export function buildEditorUrl(exhibition, options = {}) {
  const record = exhibition && typeof exhibition === "object" ? exhibition : {};
  const id = value(record.id || record.exhibitionId);
  const slug = value(record.slug || record.exhibitionSlug);
  if (!id && !slug) throw new Error("Editor bridge requires an exhibition id or slug");
  const base = new URL(options.baseUrl || "../gallery/", options.locationHref || (typeof location !== "undefined" ? location.href : "https://example.invalid/admin/"));
  if (id) base.searchParams.set("exhibitionId", id);
  else base.searchParams.set("exhibition", slug);
  base.searchParams.set("channel", "draft");
  base.searchParams.set("editor", "1");
  const returnUrl = value(options.returnUrl || "../admin/#/exhibitions");
  if (returnUrl) base.searchParams.set("returnUrl", returnUrl);
  return base.href;
}

export function readEditorBridge(locationLike) {
  const source = locationLike || (typeof location !== "undefined" ? location : { search: "" });
  const params = new URLSearchParams(source.search || "");
  return Object.freeze({
    schema: EDITOR_BRIDGE_SCHEMA,
    isEditorRequest: params.get("editor") === "1" || params.get("channel") === "draft",
    returnUrl: value(params.get("returnUrl")) || null
  });
}

export function installEditorDirtyGuard(options = {}) {
  const getDirty = typeof options.getDirty === "function" ? options.getDirty : () => false;
  const message = value(options.message) || "You have unsaved changes.";
  const listener = (event) => {
    if (!getDirty()) return;
    event.preventDefault();
    event.returnValue = message;
    return message;
  };
  if (typeof window !== "undefined") window.addEventListener("beforeunload", listener);
  return () => {
    if (typeof window !== "undefined") window.removeEventListener("beforeunload", listener);
  };
}
