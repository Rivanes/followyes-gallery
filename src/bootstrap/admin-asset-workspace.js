/* Exhibition Platform — V13.6 Left Workspace Asset Manager + production closure.
   Asset catalog remains in the left workspace; scene placement/binding is delegated to the live Gallery runtime. */

import { createSharedAssetApi } from "../data/shared-asset-api.js?v=v13_6_production_closure";
import { getDefaultSharedAssetRuntimeMetadata } from "../validation/shared-asset-validation.js?v=v13_6_production_closure";

export const ADMIN_ASSET_WORKSPACE_STAGE = "V13.6";

const MAX_THUMBNAIL_SOURCE_BYTES = 12 * 1024 * 1024;
const THUMBNAIL_MAX_SIDE = 640;
const THUMBNAIL_QUALITY = 0.82;

function text(value) { return String(value == null ? "" : value).trim(); }
function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function titleCase(value) {
  return text(value).replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
function statusLabel(value) {
  const v = text(value).toLowerCase();
  if (v === "archived") return "Archived";
  if (v === "active") return "Active";
  return titleCase(v || "active");
}
function safeNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function assetMetadata(row) { return row && row.metadata && typeof row.metadata === "object" ? row.metadata : {}; }
function versionStatusClass(status) {
  const value = text(status).toLowerCase();
  if (value === "published") return "published";
  if (value === "draft") return "draft";
  if (value === "previous") return "previous";
  return "";
}
function assetTypeGlyph(type) { return text(type).toLowerCase() === "frame" ? "▣" : "◆"; }

async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file); } catch (_error) {}
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not decode thumbnail image.")); };
    image.src = url;
  });
}

async function optimizeThumbnail(file) {
  if (!file || !/^image\//i.test(file.type || "")) throw new Error("Choose an image file for the thumbnail.");
  if (Number(file.size || 0) > MAX_THUMBNAIL_SOURCE_BYTES) throw new Error("Thumbnail source is too large. Maximum input size is 12 MB.");
  const source = await decodeImage(file);
  const width = Number(source.width || source.naturalWidth) || 1;
  const height = Number(source.height || source.naturalHeight) || 1;
  const scale = Math.min(1, THUMBNAIL_MAX_SIDE / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!context) throw new Error("Could not create thumbnail optimizer canvas.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#111412";
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(source, 0, 0, targetWidth, targetHeight);
  if (source && typeof source.close === "function") source.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", THUMBNAIL_QUALITY));
  canvas.width = 1;
  canvas.height = 1;
  if (!blob) throw new Error("Could not encode optimized thumbnail.");
  return { blob, width: targetWidth, height: targetHeight, mimeType: "image/webp", fileSize: Number(blob.size) || 0 };
}

function ensureStyles() {
  if (document.getElementById("v13AssetWorkspaceStyles")) return;
  const style = document.createElement("style");
  style.id = "v13AssetWorkspaceStyles";
  style.textContent = `
    .assetManagementSection.hidden{display:none!important}
    .assetWorkspaceBody{display:grid;gap:10px}
    .assetWorkspaceHostNote{padding:9px 10px;border:1px solid rgba(255,255,255,.10);border-radius:10px;background:rgba(255,255,255,.025);font-size:10px;line-height:1.45;color:rgba(255,255,255,.62)}
    .assetWorkspaceHostNote strong{color:rgba(255,255,255,.92)}
    .assetToolbar{display:grid;gap:8px}
    .assetSearchRow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px}
    .assetFilterRow{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
    .assetFilterButton{height:32px;border:1px solid rgba(255,255,255,.10);border-radius:9px;background:rgba(255,255,255,.025);color:rgba(255,255,255,.62);font-size:9px;font-weight:800;letter-spacing:.08em;cursor:pointer}
    .assetFilterButton.active{background:rgba(125,160,127,.16);border-color:rgba(154,180,155,.38);color:rgba(255,255,255,.92)}
    .assetCategoryRow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:center}
    .assetSelect{height:38px;width:100%;border:1px solid rgba(255,255,255,.18);border-radius:10px;background:#202321;color:rgba(255,255,255,.92);padding:0 10px;font:inherit;outline:none}
    .assetToggle{display:flex;align-items:center;gap:6px;font-size:9px;color:rgba(255,255,255,.62);white-space:nowrap}
    .assetCatalog{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;max-height:420px;overflow:auto;padding-right:2px}
    .assetTile{min-width:0;display:grid;grid-template-rows:92px auto;gap:7px;padding:7px;border:1px solid transparent;border-radius:12px;background:rgba(255,255,255,.02);color:rgba(255,255,255,.92);text-align:left;cursor:pointer}
    .assetTile:hover{background:rgba(255,255,255,.045)}
    .assetTile.active{border-color:rgba(154,180,155,.42);background:rgba(125,160,127,.13)}
    .assetTile.is-placeable,.assetTile.is-bindable{cursor:grab}.assetTile.is-placeable:active,.assetTile.is-bindable:active{cursor:grabbing}.assetTile.is-placeable .assetThumb,.assetTile.is-bindable .assetThumb{box-shadow:inset 0 0 0 1px rgba(154,180,155,.18)}
    .assetTile.is-placement-active,.assetTile.is-binding-target{border-color:rgba(180,205,181,.72);background:rgba(125,160,127,.20)}
    .assetPlaceHint{position:absolute;right:6px;top:6px;padding:3px 5px;border-radius:6px;background:rgba(83,111,85,.90);font-size:8px;font-weight:800;letter-spacing:.07em;color:#edf4ee}
    .assetPlacementPanel{display:grid;gap:7px;padding:10px;border:1px solid rgba(154,180,155,.28);border-radius:10px;background:rgba(125,160,127,.075)}
    .assetPlacementPanel strong{font-size:10px}.assetPlacementPanel .assetMuted{margin:0}
    .assetThumb{position:relative;display:grid;place-items:center;width:100%;height:92px;overflow:hidden;border:1px solid rgba(255,255,255,.10);border-radius:9px;background:linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.015))}
    .assetThumb img{width:100%;height:100%;object-fit:cover;display:block}
    .assetThumbGlyph{font-size:24px;opacity:.72}.assetThumbType{position:absolute;left:6px;bottom:6px;padding:3px 5px;border-radius:6px;background:rgba(5,7,6,.78);font-size:8px;font-weight:800;letter-spacing:.08em}
    .assetTileMeta{min-width:0}.assetTileMeta strong{display:block;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.assetTileMeta span{display:block;margin-top:3px;font-size:9px;line-height:1.35;color:rgba(255,255,255,.58);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .assetEmpty{grid-column:1/-1;padding:14px 10px;border:1px dashed rgba(255,255,255,.12);border-radius:10px;color:rgba(255,255,255,.58);font-size:10px;line-height:1.5;text-align:center}
    .assetCreatePanel,.assetDetailPanel{display:grid;gap:10px}
    .assetCreateGrid,.assetDetailGrid{display:grid;gap:9px}
    .assetTwoCols{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .assetTypeLock{padding:9px 10px;border:1px solid rgba(255,255,255,.10);border-radius:10px;background:rgba(255,255,255,.025);font-size:10px;color:rgba(255,255,255,.62)}
    .assetTypeLock strong{color:rgba(255,255,255,.92)}
    .assetDetailHead{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.assetDetailHead h3{margin:0;font-size:12px}.assetDetailHead p{margin:4px 0 0;font-size:9px;color:rgba(255,255,255,.58);line-height:1.4}
    .assetBadgeRow{display:flex;flex-wrap:wrap;gap:5px}.assetBadge{padding:4px 6px;border:1px solid rgba(255,255,255,.10);border-radius:999px;background:rgba(255,255,255,.025);font-size:8px;font-weight:800;letter-spacing:.06em;color:rgba(255,255,255,.68)}
    .assetBadge.published{border-color:rgba(127,169,130,.35);color:#bcd7be}.assetBadge.draft{border-color:rgba(199,176,105,.35);color:#e3d3a3}.assetBadge.archived{border-color:rgba(209,139,139,.35);color:#e0b2b2}
    .assetThumbnailCard{display:grid;grid-template-columns:94px minmax(0,1fr);gap:10px}.assetThumbnailPreview{width:94px;height:94px;border:1px solid rgba(255,255,255,.10);border-radius:10px;overflow:hidden;background:rgba(255,255,255,.025);display:grid;place-items:center}.assetThumbnailPreview img{width:100%;height:100%;object-fit:cover}.assetThumbnailActions{display:grid;align-content:start;gap:7px}
    .assetHiddenInput{display:none}
    .assetProgress{display:none;height:5px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}.assetProgress.active{display:block}.assetProgress>span{display:block;height:100%;width:0;background:rgba(154,180,155,.72);transition:width .08s linear}
    .assetRuntimeFields{display:grid;gap:8px;padding:9px;border:1px solid rgba(255,255,255,.10);border-radius:10px;background:rgba(255,255,255,.018)}
    .assetRuntimeFields h4{margin:0;font-size:9px;letter-spacing:.08em;text-transform:uppercase}.assetRuntimeGrid{display:grid;grid-template-columns:1fr 1fr;gap:7px}
    .assetVersionList,.assetUsageList{display:grid;gap:6px}.assetVersionRow,.assetUsageRow{display:grid;gap:5px;padding:8px 9px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:rgba(255,255,255,.018);font-size:9px}.assetVersionLine,.assetUsageLine{display:flex;align-items:center;justify-content:space-between;gap:8px}.assetVersionLine strong,.assetUsageLine strong{font-size:9px}.assetVersionRow span,.assetUsageRow span{color:rgba(255,255,255,.58);line-height:1.4}
    .assetActionRow{display:flex;flex-wrap:wrap;gap:7px}.assetDangerNote{font-size:9px;color:#d8a7a7;line-height:1.45}.assetMuted{font-size:9px;color:rgba(255,255,255,.58);line-height:1.45}
    .assetManagementSection .adminButton.small{min-height:31px;padding:0 9px;font-size:9px}
    @media(max-width:520px){.assetCatalog{grid-template-columns:1fr}.assetTwoCols,.assetRuntimeGrid{grid-template-columns:1fr}.assetThumbnailCard{grid-template-columns:74px minmax(0,1fr)}.assetThumbnailPreview{width:74px;height:74px}}
  `;
  document.head.appendChild(style);
}

export function createAdminAssetWorkspace({
  supabase,
  sidebar,
  showToast = () => {},
  loadVenueOptions = async () => [],
  onUiStateChange = () => {},
  getPlacementContext = () => null,
  onBeginPropPlacement = async () => false,
  onCancelPropPlacement = () => {},
  getFrameBindingContext = () => null,
  onBeginFrameDrag = async () => false,
  onCancelFrameDrag = () => {},
  onBindFrame = async () => false,
  onFrameBindingComplete = () => {}
} = {}) {
  if (!supabase) throw new Error("Supabase client is required for the Asset Workspace.");
  if (!sidebar) throw new Error("Canonical Admin sidebar is required for the Asset Workspace.");
  ensureStyles();
  const api = createSharedAssetApi({ supabase });

  const state = {
    visible: false,
    hostSection: "exhibitions",
    returnSection: "exhibitions",
    catalog: [],
    venues: [],
    selectedAssetId: "",
    selectedDetail: null,
    usages: [],
    filter: "all",
    category: "all",
    search: "",
    includeArchived: false,
    busy: false,
    requestId: 0,
    placementDescriptor: null,
    frameDragDescriptor: null,
    frameBindingTarget: null
  };

  const catalogSection = document.createElement("section");
  catalogSection.className = "workspaceSection assetManagementSection hidden";
  catalogSection.innerHTML = `
    <div class="sectionHead"><div><h2>Asset Library</h2><p>Reusable Props and artwork-only Frames. Models are versioned and shared without duplicating GLBs.</p></div><button id="refreshSharedAssetsButton" class="adminButton" type="button">↻</button></div>
    <div class="sectionBody assetWorkspaceBody">
      <div id="assetWorkspaceHostNote" class="assetWorkspaceHostNote"></div>
      <div class="assetToolbar">
        <div class="assetSearchRow"><input id="sharedAssetSearch" class="adminInput" maxlength="120" placeholder="Search assets…" autocomplete="off"><button id="addSharedAssetButton" class="adminButton primary" type="button">+ ADD</button></div>
        <div id="sharedAssetFilterRow" class="assetFilterRow"><button class="assetFilterButton active" type="button" data-asset-filter="all">ALL</button><button class="assetFilterButton" type="button" data-asset-filter="prop">PROPS</button><button class="assetFilterButton" type="button" data-asset-filter="frame">FRAMES</button></div>
        <div class="assetCategoryRow"><select id="sharedAssetCategory" class="assetSelect"><option value="all">All categories</option></select><label class="assetToggle"><input id="sharedAssetIncludeArchived" type="checkbox"> Archived</label></div>
      </div>
      <div id="sharedAssetCatalog" class="assetCatalog"><div class="assetEmpty">Loading Asset Library…</div></div>
    </div>`;

  const detailSection = document.createElement("section");
  detailSection.className = "workspaceSection assetManagementSection hidden";
  detailSection.innerHTML = `<div class="sectionHead"><div><h2>Asset details</h2><p>Catalog metadata, immutable model versions and reference status.</p></div></div><div id="sharedAssetDetailBody" class="sectionBody"><div class="assetMuted">Select an asset.</div></div>`;

  sidebar.append(catalogSection, detailSection);

  const $ = (id) => document.getElementById(id);
  const catalogEl = () => $("sharedAssetCatalog");
  const detailEl = () => $("sharedAssetDetailBody");

  function emitUiState() {
    onUiStateChange({
      hostSection: state.hostSection,
      returnSection: state.returnSection,
      selectedAssetId: state.selectedAssetId || null,
      filter: state.filter === "all" ? null : state.filter
    });
  }

  function setBusy(busy) {
    state.busy = !!busy;
    [catalogSection, detailSection].forEach((root) => root.querySelectorAll("button,input,select,textarea").forEach((node) => {
      if (busy) {
        if (!Object.prototype.hasOwnProperty.call(node.dataset, "assetBusyDisabled")) node.dataset.assetBusyDisabled = node.disabled ? "1" : "0";
        node.disabled = true;
      } else if (Object.prototype.hasOwnProperty.call(node.dataset, "assetBusyDisabled")) {
        node.disabled = node.dataset.assetBusyDisabled === "1";
        delete node.dataset.assetBusyDisabled;
      }
    }));
  }

  async function withBusy(operation) {
    if (state.busy) return null;
    setBusy(true);
    try { return await operation(); }
    finally { setBusy(false); }
  }

  function currentThumbnailUrl(row) {
    const metadata = assetMetadata(row && row.asset ? row.asset : row);
    const bucket = text(metadata.thumbnailStorageBucket || metadata.thumbnail_storage_bucket || "shared-assets") || "shared-assets";
    const path = text(metadata.thumbnailStoragePath || metadata.thumbnail_storage_path);
    if (!path) return "";
    const response = supabase.storage.from(bucket).getPublicUrl(path);
    return response && response.data ? text(response.data.publicUrl) : "";
  }

  function filteredCatalog() {
    const query = state.search.toLowerCase();
    return state.catalog.filter((row) => {
      const type = text(row.asset_type).toLowerCase();
      const category = text(row.category);
      if (state.filter !== "all" && type !== state.filter) return false;
      if (state.category !== "all" && category !== state.category) return false;
      if (query && !`${row.name || ""} ${row.slug || ""} ${row.category || ""}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }

  function readPlacementContext() {
    const context = getPlacementContext ? getPlacementContext() : null;
    return context && typeof context === "object" ? context : null;
  }

  function getPublishedVersion(source) {
    const asset = source && source.asset ? source.asset : source;
    const versions = Array.isArray(source && source.versions) ? source.versions : [];
    if (!asset) return null;
    const detailed = versions.find((version) => version.id === asset.published_version_id) || versions.find((version) => version.status === "published") || null;
    if (detailed) return detailed;
    if (!asset.published_version_id || !asset.published_storage_path) return null;
    return {
      id: asset.published_version_id,
      version_number: asset.published_version_number,
      status: "published",
      storage_bucket: asset.published_storage_bucket || api.bucket || "shared-assets",
      storage_path: asset.published_storage_path,
      file_hash: asset.published_file_hash || null,
      runtime_metadata: asset.published_runtime_metadata && typeof asset.published_runtime_metadata === "object"
        ? asset.published_runtime_metadata
        : null
    };
  }

  function buildPropPlacementDescriptor(source) {
    const asset = source && source.asset ? source.asset : source;
    const version = getPublishedVersion(source);
    if (!asset || text(asset.asset_type).toLowerCase() !== "prop" || !version || !version.id || !version.storage_path) return null;
    const runtimeMetadata = version.runtime_metadata && typeof version.runtime_metadata === "object" ? version.runtime_metadata : getDefaultSharedAssetRuntimeMetadata("prop");
    return {
      schema: "exhibition-platform-prop-placement.v1",
      assetId: asset.id,
      assetVersionId: version.id,
      assetVersionNumber: Number(version.version_number) || null,
      assetType: "prop",
      assetName: asset.name || asset.slug || "Prop",
      category: asset.category || "",
      scopeType: asset.scope_type || "platform",
      scopeVenueId: asset.scope_venue_id || null,
      storageBucket: version.storage_bucket || api.bucket || "shared-assets",
      storagePath: version.storage_path,
      publicUrl: api.getPublicVersionUrl(version),
      fileHash: version.file_hash || null,
      runtimeMetadata
    };
  }

  function buildFrameBindingDescriptor(source) {
    const asset = source && source.asset ? source.asset : source;
    const version = getPublishedVersion(source);
    if (!asset || text(asset.asset_type).toLowerCase() !== "frame" || !version || !version.id || !version.storage_path) return null;
    const runtimeMetadata = version.runtime_metadata && typeof version.runtime_metadata === "object" ? version.runtime_metadata : getDefaultSharedAssetRuntimeMetadata("frame");
    if (text(runtimeMetadata.placementMode || runtimeMetadata.placement_mode).toLowerCase() !== "artwork-only") return null;
    return {
      schema: "exhibition-platform-frame-binding.v1",
      assetId: asset.id,
      assetVersionId: version.id,
      assetVersionNumber: Number(version.version_number) || null,
      assetType: "frame",
      assetName: asset.name || asset.slug || "Frame",
      label: asset.name || asset.slug || "Frame",
      category: asset.category || "",
      scopeType: asset.scope_type || "platform",
      scopeVenueId: asset.scope_venue_id || null,
      storageBucket: version.storage_bucket || api.bucket || "shared-assets",
      storagePath: version.storage_path,
      publicUrl: api.getPublicVersionUrl(version),
      fileHash: version.file_hash || null,
      runtimeMetadata
    };
  }

  function getFrameDragCapability(source) {
    const descriptor = buildFrameBindingDescriptor(source);
    const asset = source && source.asset ? source.asset : source;
    if (asset && text(asset.status).toLowerCase() === "archived") return { allowed: false, reason: "Restore this Frame before assigning it.", descriptor, context: readPlacementContext() };
    if (state.hostSection !== "exhibitions") return { allowed: false, reason: "Open Assets from an Exhibition to assign Frames.", descriptor, context: null };
    const context = readPlacementContext();
    if (!context || !context.exhibitionId) return { allowed: false, reason: "No active Exhibition Frame context.", descriptor, context };
    if (!descriptor) return { allowed: false, reason: "Publish a validated Frame version before assignment.", descriptor: null, context };
    if (descriptor.scopeType === "venue" && (!context.venueId || String(descriptor.scopeVenueId) !== String(context.venueId))) {
      return { allowed: false, reason: "This Frame is scoped to another Gallery.", descriptor, context };
    }
    return { allowed: true, reason: "Drag onto an artwork, or use FRAME → CHANGE and click this Frame.", descriptor, context };
  }

  async function bindFrameToTarget(source) {
    const target = state.frameBindingTarget;
    if (!target) throw new Error("No artwork is waiting for a Frame selection.");
    const capability = getFrameDragCapability(source);
    if (!capability.allowed || !capability.descriptor) throw new Error(capability.reason);
    const liveTarget = getFrameBindingContext ? getFrameBindingContext() : null;
    if (!liveTarget || String(liveTarget.artworkId || "") !== String(target.artworkId || "")) throw new Error("Artwork selection changed. Use FRAME → CHANGE again.");
    if (target.exhibitionId && String(liveTarget.exhibitionId || "") !== String(target.exhibitionId)) throw new Error("Exhibition changed. Use FRAME → CHANGE again.");
    if (target.venueVersionId && String(liveTarget.venueVersionId || "") !== String(target.venueVersionId)) throw new Error("Gallery Version changed. Use FRAME → CHANGE again.");
    const ok = await onBindFrame(capability.descriptor, { target: liveTarget, context: capability.context || null, source: "browser-click" });
    if (ok === false) return false;
    state.frameBindingTarget = null;
    renderHostNote();
    renderCatalog();
    showToast(`Frame assigned: ${capability.descriptor.assetName}.`);
    onFrameBindingComplete({ target: liveTarget, descriptor: capability.descriptor });
    return true;
  }

  function getPropPlacementCapability(detail) {
    const descriptor = buildPropPlacementDescriptor(detail);
    const asset = detail && detail.asset ? detail.asset : detail;
    if (asset && text(asset.status).toLowerCase() === "archived") return { allowed: false, reason: "Restore this Asset before placing new instances.", descriptor, context: readPlacementContext() };
    if (state.hostSection !== "exhibitions") return { allowed: false, reason: "Open Assets from an Exhibition to place Props.", descriptor, context: null };
    const context = readPlacementContext();
    if (!context || !context.exhibitionId) return { allowed: false, reason: "No active Exhibition placement context.", descriptor, context };
    if (!descriptor) return { allowed: false, reason: "Publish a validated Prop version before placement.", descriptor: null, context };
    if (descriptor.scopeType === "venue" && (!context.venueId || String(descriptor.scopeVenueId) !== String(context.venueId))) {
      return { allowed: false, reason: "This Prop is scoped to another Gallery.", descriptor, context };
    }
    return { allowed: true, reason: "Drag to the floor on desktop, or use PLACE PROP for tap placement.", descriptor, context };
  }

  async function beginPropPlacement(detail) {
    const capability = getPropPlacementCapability(detail);
    if (!capability.allowed || !capability.descriptor) throw new Error(capability.reason);
    state.placementDescriptor = capability.descriptor;
    renderCatalog();
    const ok = await onBeginPropPlacement(capability.descriptor, { context: capability.context || null, drag: false });
    if (ok === false) { state.placementDescriptor = null; renderCatalog(); return false; }
    showToast("Prop placement active. Choose a point on the Gallery floor.");
    return true;
  }

  function renderHostNote() {
    const note = $("assetWorkspaceHostNote");
    if (!note) return;
    if (state.hostSection === "galleries") {
      note.innerHTML = `<strong>Gallery preview preserved.</strong> Library management is available. Exhibition Prop placement and Frame binding stay disabled in Gallery context.`;
    } else if (state.frameBindingTarget) {
      const label = escapeHtml(state.frameBindingTarget.artworkLabel || state.frameBindingTarget.artworkId || "selected artwork");
      note.innerHTML = `<strong>Choose a Frame for ${label}.</strong> Click a Published Frame to bind it. The artwork selection and unsaved Exhibition Draft stay active.`;
    } else {
      note.innerHTML = `<strong>Exhibition preview preserved.</strong> Props drag to the floor; Frames drag only onto artworks. FRAME → CHANGE opens this library in Frame binding mode without reloading the Scene.`;
    }
  }

  function rebuildCategoryOptions() {
    const select = $("sharedAssetCategory");
    if (!select) return;
    const values = [...new Set(state.catalog.map((row) => text(row.category)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const selected = values.includes(state.category) ? state.category : "all";
    select.replaceChildren(new Option("All categories", "all"), ...values.map((value) => new Option(value, value)));
    select.value = selected;
    state.category = selected;
  }

  function renderCatalog() {
    rebuildCategoryOptions();
    const root = catalogEl();
    if (!root) return;
    root.replaceChildren();
    const rows = filteredCatalog();
    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "assetEmpty";
      empty.textContent = state.catalog.length ? "No Assets match the current filters." : "No Shared Assets found. Use + ADD to create the first catalog item.";
      root.appendChild(empty);
      return;
    }
    rows.forEach((row) => {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "assetTile" + (row.id === state.selectedAssetId ? " active" : "");
      tile.dataset.assetId = row.id;
      const rowType = text(row.asset_type).toLowerCase();
      const rowPlacementCandidate = state.hostSection === "exhibitions" && rowType === "prop" && !!row.published_version_number && row.status !== "archived";
      const rowFrameCandidate = state.hostSection === "exhibitions" && rowType === "frame" && !!row.published_version_number && row.status !== "archived";
      if (rowPlacementCandidate) tile.classList.add("is-placeable");
      if (rowFrameCandidate) tile.classList.add("is-bindable");
      if (state.placementDescriptor && state.placementDescriptor.assetId === row.id) tile.classList.add("is-placement-active");
      if (state.frameBindingTarget && rowFrameCandidate) tile.classList.add("is-binding-target");
      const thumb = document.createElement("div");
      thumb.className = "assetThumb";
      const url = currentThumbnailUrl(row);
      if (url) {
        const image = document.createElement("img");
        image.loading = "lazy";
        image.decoding = "async";
        image.alt = "";
        image.src = url;
        thumb.appendChild(image);
      } else {
        const glyph = document.createElement("div"); glyph.className = "assetThumbGlyph"; glyph.textContent = assetTypeGlyph(row.asset_type); thumb.appendChild(glyph);
      }
      const type = document.createElement("span"); type.className = "assetThumbType"; type.textContent = text(row.asset_type).toUpperCase(); thumb.appendChild(type);
      if (rowPlacementCandidate || rowFrameCandidate) { const hint = document.createElement("span"); hint.className = "assetPlaceHint"; hint.textContent = rowFrameCandidate ? "DRAG TO ART" : "DRAG"; thumb.appendChild(hint); }
      const meta = document.createElement("div"); meta.className = "assetTileMeta";
      const name = document.createElement("strong"); name.textContent = row.name || row.slug || "Untitled Asset";
      const line = document.createElement("span");
      line.textContent = `${row.category || "Uncategorized"} · ${row.scope_type === "venue" ? "Gallery" : "Shared"}${row.status === "archived" ? " · Archived" : row.published_version_number ? ` · v${row.published_version_number}` : " · No published version"}`;
      meta.append(name, line); tile.append(thumb, meta);
      tile.addEventListener("click", () => {
        if (state.frameBindingTarget && rowFrameCandidate) void bindFrameToTarget(row).catch((error) => showToast(error.message || String(error)));
        else void selectAsset(row.id);
      });
      if (rowPlacementCandidate) {
        tile.draggable = true;
        tile.addEventListener("dragstart", (event) => {
          try {
            // DataTransfer must be populated synchronously inside dragstart. V13.3 therefore
            // carries the Published version runtime descriptor directly in the catalog RPC.
            const capability = getPropPlacementCapability(row);
            if (!capability.allowed || !capability.descriptor) { event.preventDefault(); showToast(capability.reason); return; }
            state.placementDescriptor = capability.descriptor;
            if (event.dataTransfer) {
              event.dataTransfer.effectAllowed = "copy";
              const payload = JSON.stringify(capability.descriptor);
              event.dataTransfer.setData("application/x-exhibition-shared-asset", payload);
              event.dataTransfer.setData("text/plain", payload);
            }
            const beginResult = onBeginPropPlacement(capability.descriptor, { drag: true, context: capability.context || null });
            if (beginResult && typeof beginResult.catch === "function") {
              beginResult.catch((error) => {
                state.placementDescriptor = null;
                onCancelPropPlacement({ reason: "drag-begin-failed" });
                renderCatalog();
                showToast(error && error.message ? error.message : String(error));
              });
            }
            renderCatalog();
          } catch (error) { event.preventDefault(); showToast(error.message || String(error)); }
        });
        tile.addEventListener("dragend", () => {
          state.placementDescriptor = null;
          onCancelPropPlacement({ reason: "drag-end" });
          renderCatalog();
        });
      }
      if (rowFrameCandidate) {
        tile.draggable = true;
        tile.addEventListener("dragstart", (event) => {
          try {
            const capability = getFrameDragCapability(row);
            if (!capability.allowed || !capability.descriptor) { event.preventDefault(); showToast(capability.reason); return; }
            state.frameDragDescriptor = capability.descriptor;
            if (event.dataTransfer) {
              event.dataTransfer.effectAllowed = "copy";
              const payload = JSON.stringify(capability.descriptor);
              event.dataTransfer.setData("application/x-exhibition-shared-frame", payload);
              event.dataTransfer.setData("text/plain", payload);
            }
            const beginResult = onBeginFrameDrag(capability.descriptor, { context: capability.context || null });
            if (beginResult && typeof beginResult.catch === "function") beginResult.catch((error) => {
              state.frameDragDescriptor = null;
              onCancelFrameDrag({ reason: "drag-begin-failed" });
              showToast(error && error.message ? error.message : String(error));
            });
          } catch (error) { event.preventDefault(); showToast(error.message || String(error)); }
        });
        tile.addEventListener("dragend", () => {
          state.frameDragDescriptor = null;
          onCancelFrameDrag({ reason: "drag-end" });
        });
      }
      root.appendChild(tile);
    });
  }

  function runtimeFieldsMarkup(assetType, defaults) {
    if (assetType === "frame") {
      return `<div class="assetRuntimeFields"><h4>Frame fit defaults</h4><div class="assetRuntimeGrid">
        <label class="fieldLabel">Inner width ratio<input id="assetRuntimeInnerWidth" class="adminInput" type="number" min="0.01" max="0.99" step="0.01" value="${defaults.innerWidthRatio}"></label>
        <label class="fieldLabel">Inner height ratio<input id="assetRuntimeInnerHeight" class="adminInput" type="number" min="0.01" max="0.99" step="0.01" value="${defaults.innerHeightRatio}"></label>
        <label class="fieldLabel">Depth overlap<input id="assetRuntimeDepthOverlap" class="adminInput" type="number" min="0.01" step="0.01" value="${defaults.depthOverlapRatio}"></label>
        <label class="fieldLabel">Z rotation<input id="assetRuntimeZRotation" class="adminInput" type="number" step="1" value="${defaults.zRotationDegrees}"></label>
        <label class="fieldLabel">Y facing<input id="assetRuntimeYFacing" class="adminInput" type="number" step="1" value="${defaults.yFacingDegrees}"></label>
      </div><div class="assetMuted">Frame remains artwork-only. These values describe the opening/facing contract used later by V13.4.</div></div>`;
    }
    return `<div class="assetRuntimeFields"><h4>Prop defaults</h4><div class="assetRuntimeGrid"><label class="fieldLabel">Default scale<input id="assetRuntimeDefaultScale" class="adminInput" type="number" min="0.001" step="0.01" value="${defaults.defaultScale}"></label><label class="fieldLabel">Placement<input class="adminInput" value="Floor" readonly></label></div><div class="assetMuted">Published Props are placed per Exhibition. Default scale is applied to every new instance.</div></div>`;
  }

  function readRuntimeMetadata(assetType) {
    const defaults = getDefaultSharedAssetRuntimeMetadata(assetType);
    if (assetType === "frame") {
      return {
        ...defaults,
        innerWidthRatio: safeNumber($("assetRuntimeInnerWidth") && $("assetRuntimeInnerWidth").value, defaults.innerWidthRatio),
        innerHeightRatio: safeNumber($("assetRuntimeInnerHeight") && $("assetRuntimeInnerHeight").value, defaults.innerHeightRatio),
        depthOverlapRatio: safeNumber($("assetRuntimeDepthOverlap") && $("assetRuntimeDepthOverlap").value, defaults.depthOverlapRatio),
        zRotationDegrees: safeNumber($("assetRuntimeZRotation") && $("assetRuntimeZRotation").value, defaults.zRotationDegrees),
        yFacingDegrees: safeNumber($("assetRuntimeYFacing") && $("assetRuntimeYFacing").value, defaults.yFacingDegrees)
      };
    }
    return { ...defaults, defaultScale: safeNumber($("assetRuntimeDefaultScale") && $("assetRuntimeDefaultScale").value, defaults.defaultScale) };
  }

  function versionRowsMarkup(detail) {
    const versions = Array.isArray(detail && detail.versions) ? detail.versions : [];
    if (!versions.length) return `<div class="assetMuted">No model versions yet.</div>`;
    return `<div class="assetVersionList">${versions.map((version) => {
      const validation = version.validation_report && typeof version.validation_report === "object" ? version.validation_report : {};
      const server = validation.serverValidation && typeof validation.serverValidation === "object" ? validation.serverValidation : {};
      const valid = validation.valid === true && (server.valid !== false);
      const bytes = Number(version.file_size) || 0;
      const size = bytes ? `${(bytes / (1024 * 1024)).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB` : "binary pending";
      return `<div class="assetVersionRow"><div class="assetVersionLine"><strong>v${version.version_number}</strong><span class="assetBadge ${versionStatusClass(version.status)}">${escapeHtml(text(version.status).toUpperCase())}</span></div><span>${escapeHtml(size)} · ${valid ? "validated" : version.status === "draft" ? "validation pending" : "legacy/grandfathered"}</span>${version.status === "draft" ? `<div class="assetActionRow"><button class="adminButton small primary" type="button" data-asset-publish-version="${version.id}">PUBLISH VERSION</button><button class="adminButton small danger" type="button" data-asset-discard-version="${version.id}">DISCARD DRAFT</button></div>` : ""}</div>`;
    }).join("")}</div>`;
  }

  function usageRowsMarkup() {
    if (!state.usages.length) return `<div class="assetMuted">No indexed Draft/Published/Previous Exhibition references.</div>`;
    return `<div class="assetUsageList">${state.usages.map((usage) => `<div class="assetUsageRow"><div class="assetUsageLine"><strong>${escapeHtml(usage.exhibition_title || usage.exhibition_slug || "Exhibition")}</strong><span>${escapeHtml(text(usage.channel).toUpperCase())}</span></div><span>v${escapeHtml(usage.version_number)} · ${escapeHtml(usage.usage_type)} · ${escapeHtml(usage.usage_key)}</span></div>`).join("")}</div>`;
  }

  function bindDetailActions(detail) {
    const asset = detail.asset;
    const placeProp = $("sharedAssetPlacePropButton");
    if (placeProp) placeProp.addEventListener("click", () => { void beginPropPlacement(detail).catch((error) => showToast(error.message || String(error))); });
    const cancelPlacement = $("sharedAssetCancelPlacementButton");
    if (cancelPlacement) cancelPlacement.addEventListener("click", () => { state.placementDescriptor = null; onCancelPropPlacement({ reason: "ui-cancel" }); renderCatalog(); renderDetail(); });
    const metadataForm = $("sharedAssetMetadataForm");
    if (metadataForm) metadataForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void withBusy(async () => {
        const updated = await api.update(asset.id, {
          name: text($("sharedAssetDetailName").value),
          category: text($("sharedAssetDetailCategory").value),
          metadata: { ...assetMetadata(asset), description: text($("sharedAssetDetailDescription").value) }
        });
        showToast("Asset details saved.");
        await refreshCatalog({ preserveSelection: true, forceDetail: true, localAsset: updated });
      }).catch((error) => showToast(error.message || String(error)));
    });

    const thumbnailInput = $("sharedAssetThumbnailInput");
    const chooseThumbnail = $("sharedAssetChooseThumbnail");
    if (chooseThumbnail && thumbnailInput) chooseThumbnail.addEventListener("click", () => thumbnailInput.click());
    if (thumbnailInput) thumbnailInput.addEventListener("change", () => {
      const file = thumbnailInput.files && thumbnailInput.files[0]; thumbnailInput.value = "";
      if (!file) return;
      void withBusy(async () => {
        const optimized = await optimizeThumbnail(file);
        await api.uploadThumbnail(asset.id, optimized.blob, { mimeType: optimized.mimeType, width: optimized.width, height: optimized.height });
        showToast("Asset thumbnail updated.");
        await refreshCatalog({ preserveSelection: true, forceDetail: true });
      }).catch((error) => showToast(error.message || String(error)));
    });
    const removeThumbnail = $("sharedAssetRemoveThumbnail");
    if (removeThumbnail) removeThumbnail.addEventListener("click", () => {
      void withBusy(async () => {
        await api.removeThumbnail(asset.id);
        showToast("Asset thumbnail removed.");
        await refreshCatalog({ preserveSelection: true, forceDetail: true });
      }).catch((error) => showToast(error.message || String(error)));
    });

    const versionInput = $("sharedAssetVersionInput");
    const chooseVersion = $("sharedAssetChooseVersion");
    if (chooseVersion && versionInput) chooseVersion.addEventListener("click", () => versionInput.click());
    if (versionInput) versionInput.addEventListener("change", () => {
      const file = versionInput.files && versionInput.files[0]; versionInput.value = "";
      if (!file) return;
      void withBusy(async () => {
        const progress = $("sharedAssetUploadProgress");
        const bar = progress && progress.querySelector("span");
        if (progress) progress.classList.add("active");
        if (bar) bar.style.width = "4%";
        try {
          await api.uploadNewVersion(asset.id, file, {
            runtimeMetadata: readRuntimeMetadata(asset.asset_type),
            onProgress: ({ loaded, total }) => {
              if (!bar) return;
              const percent = total ? Math.max(4, Math.min(92, Math.round((loaded / total) * 92))) : 32;
              bar.style.width = `${percent}%`;
            }
          });
          if (bar) bar.style.width = "100%";
          showToast("GLB uploaded and validated. Publish the Draft version when ready.");
          await refreshCatalog({ preserveSelection: true, forceDetail: true });
        } finally {
          if (progress) setTimeout(() => progress.classList.remove("active"), 250);
        }
      }).catch((error) => showToast(error.message || String(error)));
    });

    detailEl().querySelectorAll("[data-asset-publish-version]").forEach((button) => button.addEventListener("click", () => {
      const versionId = button.dataset.assetPublishVersion;
      void withBusy(async () => {
        await api.publishVersion(versionId);
        showToast("Asset version published.");
        await refreshCatalog({ preserveSelection: true, forceDetail: true });
      }).catch((error) => showToast(error.message || String(error)));
    }));
    detailEl().querySelectorAll("[data-asset-discard-version]").forEach((button) => button.addEventListener("click", () => {
      const version = (detail.versions || []).find((item) => item.id === button.dataset.assetDiscardVersion);
      if (!version || !window.confirm(`Discard Draft Asset version v${version.version_number}?`)) return;
      void withBusy(async () => {
        await api.discardVersion(version);
        showToast("Draft Asset version discarded.");
        await refreshCatalog({ preserveSelection: true, forceDetail: true });
      }).catch((error) => showToast(error.message || String(error)));
    }));

    const archive = $("sharedAssetArchiveButton");
    if (archive) archive.addEventListener("click", () => {
      const referenceCount = state.usages.length || Number(detail.usageCount) || 0;
      const message = referenceCount > 0
        ? `Archive this Shared Asset? ${referenceCount} indexed Exhibition reference${referenceCount === 1 ? "" : "s"} will remain readable, but new Prop placement / Frame assignment will be blocked until Restore.`
        : "Archive this Shared Asset? Existing Published versions remain immutable; new placement/assignment will be blocked until Restore.";
      if (!window.confirm(message)) return;
      void withBusy(async () => { await api.archive(asset.id); showToast("Asset archived. Existing references were preserved."); await refreshCatalog({ preserveSelection: true, forceDetail: true }); }).catch((error) => showToast(error.message || String(error)));
    });
    const restore = $("sharedAssetRestoreButton");
    if (restore) restore.addEventListener("click", () => {
      void withBusy(async () => { await api.restore(asset.id); showToast("Asset restored."); await refreshCatalog({ preserveSelection: true, forceDetail: true }); }).catch((error) => showToast(error.message || String(error)));
    });
  }

  function renderDetail() {
    const root = detailEl();
    if (!root) return;
    if (!state.selectedDetail || !state.selectedDetail.asset) {
      root.innerHTML = `<div class="assetMuted">Select an asset.</div>`;
      return;
    }
    const detail = state.selectedDetail;
    const asset = detail.asset;
    const versions = Array.isArray(detail.versions) ? detail.versions : [];
    const draft = versions.find((version) => version.status === "draft") || null;
    const published = versions.find((version) => version.id === asset.published_version_id) || versions.find((version) => version.status === "published") || null;
    const defaults = getDefaultSharedAssetRuntimeMetadata(asset.asset_type);
    const thumbUrl = currentThumbnailUrl(asset);
    const scope = asset.scope_type === "venue" ? `Gallery scoped · ${state.venues.find((v) => v.id === asset.scope_venue_id)?.name || asset.scope_venue_id || "Gallery"}` : "Shared across Galleries";
    const description = text(assetMetadata(asset).description);
    const placement = getPropPlacementCapability(detail);
    const placementMarkup = text(asset.asset_type).toLowerCase() === "prop" ? `<div class="assetPlacementPanel"><strong>Exhibition placement</strong><p class="assetMuted">${escapeHtml(placement.reason)}</p><div class="assetActionRow"><button id="sharedAssetPlacePropButton" class="adminButton primary" type="button" ${placement.allowed ? "" : "disabled"}>PLACE PROP</button>${state.placementDescriptor && state.placementDescriptor.assetId === asset.id ? `<button id="sharedAssetCancelPlacementButton" class="adminButton" type="button">CANCEL PLACE</button>` : ""}</div></div>` : "";
    root.innerHTML = `<div class="assetDetailPanel">
      <div class="assetDetailHead"><div><h3>${escapeHtml(asset.name || asset.slug || "Asset")}</h3><p>${escapeHtml(scope)}</p></div><div class="assetBadgeRow"><span class="assetBadge">${escapeHtml(text(asset.asset_type).toUpperCase())}</span><span class="assetBadge ${asset.status === "archived" ? "archived" : ""}">${escapeHtml(statusLabel(asset.status).toUpperCase())}</span>${published ? `<span class="assetBadge published">PUBLISHED v${published.version_number}</span>` : ""}${draft ? `<span class="assetBadge draft">DRAFT v${draft.version_number}</span>` : ""}</div></div>
      ${placementMarkup}
      <form id="sharedAssetMetadataForm" class="assetDetailGrid"><label class="fieldLabel">Name<input id="sharedAssetDetailName" class="adminInput" maxlength="120" value="${escapeHtml(asset.name || "")}"></label><div class="assetTwoCols"><label class="fieldLabel">Category<input id="sharedAssetDetailCategory" class="adminInput" maxlength="80" value="${escapeHtml(asset.category || "")}"></label><div class="assetTypeLock">Type / scope<br><strong>${escapeHtml(text(asset.asset_type).toUpperCase())} · ${escapeHtml(asset.scope_type === "venue" ? "GALLERY" : "SHARED")}</strong></div></div><label class="fieldLabel">Description<textarea id="sharedAssetDetailDescription" class="adminTextarea" maxlength="1000" placeholder="Internal catalog note">${escapeHtml(description)}</textarea></label><button class="adminButton" type="submit">SAVE ASSET DETAILS</button></form>
      <div><div class="fieldLabel" style="margin-bottom:7px">Thumbnail</div><div class="assetThumbnailCard"><div class="assetThumbnailPreview">${thumbUrl ? `<img src="${escapeHtml(thumbUrl)}" alt="">` : `<span class="assetThumbGlyph">${assetTypeGlyph(asset.asset_type)}</span>`}</div><div class="assetThumbnailActions"><button id="sharedAssetChooseThumbnail" class="adminButton small" type="button">UPLOAD THUMBNAIL</button><button id="sharedAssetRemoveThumbnail" class="adminButton small danger" type="button" ${thumbUrl ? "" : "disabled"}>REMOVE</button><input id="sharedAssetThumbnailInput" class="assetHiddenInput" type="file" accept="image/jpeg,image/png,image/webp,image/avif"><div class="assetMuted">Images are optimized locally to WebP; the catalog never downloads GLBs just to draw tiles.</div></div></div></div>
      <div><div class="fieldLabel" style="margin-bottom:7px">Model version</div>${runtimeFieldsMarkup(asset.asset_type, defaults)}<div style="height:8px"></div><button id="sharedAssetChooseVersion" class="adminButton primary" type="button" ${draft ? "disabled" : ""}>UPLOAD NEW GLB VERSION</button><input id="sharedAssetVersionInput" class="assetHiddenInput" type="file" accept=".glb,model/gltf-binary"><div id="sharedAssetUploadProgress" class="assetProgress"><span></span></div>${draft ? `<div class="assetMuted">Publish or discard the current Draft version before uploading another one.</div>` : ""}</div>
      <div><div class="fieldLabel" style="margin-bottom:7px">Version history</div>${versionRowsMarkup(detail)}</div>
      <div><div class="fieldLabel" style="margin-bottom:7px">References · ${Number(detail.usageCount) || state.usages.length || 0}</div>${usageRowsMarkup()}</div>
      <div class="assetActionRow">${asset.status === "archived" ? `<button id="sharedAssetRestoreButton" class="adminButton" type="button">RESTORE ASSET</button>` : `<button id="sharedAssetArchiveButton" class="adminButton danger" type="button">ARCHIVE ASSET</button>`}</div>
      <div class="assetMuted">Archive never rewrites existing Exhibition references. Published model versions stay immutable.</div>
    </div>`;
    bindDetailActions(detail);
  }

  async function selectAsset(assetId, { emit = true } = {}) {
    const id = text(assetId);
    if (!id) { state.selectedAssetId = ""; state.selectedDetail = null; state.usages = []; renderCatalog(); renderDetail(); if (emit) emitUiState(); return; }
    const request = ++state.requestId;
    state.selectedAssetId = id;
    renderCatalog();
    const [detail, usages] = await Promise.all([api.get(id), api.listUsages(id)]);
    if (request !== state.requestId) return;
    state.selectedDetail = detail;
    state.usages = usages;
    renderDetail();
    if (emit) emitUiState();
  }

  async function refreshCatalog({ preserveSelection = true, forceDetail = false, localAsset = null } = {}) {
    const rows = await api.list({ includeArchived: state.includeArchived });
    state.catalog = rows;
    if (localAsset && localAsset.id) {
      const index = state.catalog.findIndex((item) => item.id === localAsset.id);
      if (index >= 0) state.catalog[index] = { ...state.catalog[index], ...localAsset };
    }
    renderCatalog();
    const wanted = preserveSelection ? state.selectedAssetId : "";
    if (wanted && (forceDetail || !state.selectedDetail || state.selectedDetail.asset.id !== wanted)) {
      if (state.catalog.some((item) => item.id === wanted) || state.includeArchived) await selectAsset(wanted, { emit: false });
      else await selectAsset("", { emit: false });
    } else if (wanted && !state.catalog.some((item) => item.id === wanted) && !state.includeArchived) {
      await selectAsset("", { emit: false });
    }
  }

  async function loadVenues() {
    const rows = await loadVenueOptions();
    state.venues = (Array.isArray(rows) ? rows : []).map((row) => ({ id: row.id, name: row.name || row.slug || row.id, status: row.status || "active" }));
    return state.venues;
  }

  async function showCreateForm() {
    await loadVenues();
    const root = detailEl();
    if (!root) return;
    root.innerHTML = `<form id="sharedAssetCreateForm" class="assetCreatePanel"><div class="assetDetailHead"><div><h3>New Shared Asset</h3><p>Create catalog identity first, then upload a validated immutable GLB version.</p></div></div><div class="assetCreateGrid"><label class="fieldLabel">Name<input id="newSharedAssetName" class="adminInput" maxlength="120" required placeholder="Wooden Bench"></label><div class="assetTwoCols"><label class="fieldLabel">Type<select id="newSharedAssetType" class="assetSelect"><option value="prop">PROP</option><option value="frame">FRAME</option></select></label><label class="fieldLabel">Category<input id="newSharedAssetCategory" class="adminInput" maxlength="80" placeholder="Furniture"></label></div><label class="fieldLabel">Scope<select id="newSharedAssetScope" class="assetSelect"><option value="platform">SHARED — all Galleries</option><option value="venue">GALLERY — one Gallery</option></select></label><label id="newSharedAssetVenueLabel" class="fieldLabel hidden">Gallery<select id="newSharedAssetVenue" class="assetSelect"><option value="">Choose Gallery…</option>${state.venues.filter((v) => v.status !== "archived").map((v) => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.name)}</option>`).join("")}</select></label><label class="fieldLabel">Description<textarea id="newSharedAssetDescription" class="adminTextarea" maxlength="1000" placeholder="Internal catalog note (optional)"></textarea></label><button class="adminButton primary" type="submit">CREATE ASSET</button><button id="cancelSharedAssetCreate" class="adminButton" type="button">CANCEL</button></div><div class="assetMuted">Type and scope are identity-level choices. Model binaries are uploaded as versioned GLBs after creation.</div></form>`;
    const scope = $("newSharedAssetScope");
    const venueLabel = $("newSharedAssetVenueLabel");
    scope.addEventListener("change", () => venueLabel.classList.toggle("hidden", scope.value !== "venue"));
    $("cancelSharedAssetCreate").addEventListener("click", () => renderDetail());
    $("sharedAssetCreateForm").addEventListener("submit", (event) => {
      event.preventDefault();
      void withBusy(async () => {
        const scopeType = scope.value;
        const scopeVenueId = scopeType === "venue" ? text($("newSharedAssetVenue").value) : null;
        if (scopeType === "venue" && !scopeVenueId) throw new Error("Choose the Gallery scope for this Asset.");
        const created = await api.create({
          name: text($("newSharedAssetName").value),
          assetType: $("newSharedAssetType").value,
          category: text($("newSharedAssetCategory").value),
          scopeType,
          scopeVenueId,
          metadata: { description: text($("newSharedAssetDescription").value) }
        });
        state.selectedAssetId = created.id;
        showToast("Asset created. Upload its first GLB version.");
        await refreshCatalog({ preserveSelection: true, forceDetail: true });
        emitUiState();
      }).catch((error) => showToast(error.message || String(error)));
    });
  }

  $("refreshSharedAssetsButton").addEventListener("click", () => { void withBusy(() => refreshCatalog({ preserveSelection: true, forceDetail: true })).catch((error) => showToast(error.message || String(error))); });
  $("addSharedAssetButton").addEventListener("click", () => { void showCreateForm().catch((error) => showToast(error.message || String(error))); });
  $("sharedAssetSearch").addEventListener("input", (event) => { state.search = text(event.target.value); renderCatalog(); });
  $("sharedAssetCategory").addEventListener("change", (event) => { state.category = event.target.value || "all"; renderCatalog(); });
  $("sharedAssetIncludeArchived").addEventListener("change", (event) => { state.includeArchived = !!event.target.checked; void withBusy(() => refreshCatalog({ preserveSelection: true, forceDetail: true })).catch((error) => showToast(error.message || String(error))); });
  $("sharedAssetFilterRow").querySelectorAll("[data-asset-filter]").forEach((button) => button.addEventListener("click", () => {
    state.filter = button.dataset.assetFilter || "all";
    $("sharedAssetFilterRow").querySelectorAll("[data-asset-filter]").forEach((node) => node.classList.toggle("active", node === button));
    renderCatalog(); emitUiState();
  }));

  return Object.freeze({
    stage: ADMIN_ASSET_WORKSPACE_STAGE,
    getState() { return { ...state, catalog: undefined, selectedDetail: undefined, usages: undefined, venues: undefined, placementDescriptor: state.placementDescriptor ? { ...state.placementDescriptor } : null, frameDragDescriptor: state.frameDragDescriptor ? { ...state.frameDragDescriptor } : null, frameBindingTarget: state.frameBindingTarget ? { ...state.frameBindingTarget } : null }; },
    async show({ hostSection = "exhibitions", returnSection = hostSection, selectedAssetId = null, filter = null } = {}) {
      state.visible = true;
      state.hostSection = hostSection === "galleries" ? "galleries" : "exhibitions";
      state.returnSection = returnSection === "galleries" ? "galleries" : "exhibitions";
      if (filter === "prop" || filter === "frame") state.filter = filter; else if (filter === "all") state.filter = "all";
      $("sharedAssetFilterRow").querySelectorAll("[data-asset-filter]").forEach((node) => node.classList.toggle("active", node.dataset.assetFilter === state.filter));
      catalogSection.classList.remove("hidden"); detailSection.classList.remove("hidden");
      renderHostNote();
      await Promise.all([loadVenues(), refreshCatalog({ preserveSelection: true })]);
      const wanted = text(selectedAssetId || state.selectedAssetId);
      if (wanted) await selectAsset(wanted, { emit: false }); else renderDetail();
      emitUiState();
      return true;
    },
    hide() { state.visible = false; state.placementDescriptor = null; state.frameDragDescriptor = null; state.frameBindingTarget = null; onCancelPropPlacement({ reason: "workspace-hidden" }); onCancelFrameDrag({ reason: "workspace-hidden" }); catalogSection.classList.add("hidden"); detailSection.classList.add("hidden"); return true; },
    async refresh() { return refreshCatalog({ preserveSelection: true, forceDetail: true }); },
    async select(assetId) { return selectAsset(assetId); },
    beginFrameBinding(target) {
      if (!target || !text(target.artworkId)) throw new Error("Frame binding requires a selected artwork.");
      state.frameBindingTarget = { ...target };
      state.filter = "frame";
      state.category = "all";
      $("sharedAssetFilterRow").querySelectorAll("[data-asset-filter]").forEach((node) => node.classList.toggle("active", node.dataset.assetFilter === "frame"));
      renderHostNote(); renderCatalog(); emitUiState();
      return true;
    },
    cancelFrameBinding() { state.frameBindingTarget = null; renderHostNote(); renderCatalog(); return true; },
    setFilter(filter) {
      const value = filter === "prop" || filter === "frame" ? filter : "all";
      state.filter = value;
      $("sharedAssetFilterRow").querySelectorAll("[data-asset-filter]").forEach((node) => node.classList.toggle("active", node.dataset.assetFilter === value));
      renderCatalog(); emitUiState();
    }
  });
}
