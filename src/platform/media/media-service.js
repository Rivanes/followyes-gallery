/**
 * Berryboy Platform Media Service
 * One upload/replace/import/attach lifecycle shared by Site Admin and the 3D Editor.
 * The service is intentionally UI agnostic. Domain adapters decide when a committed
 * medium becomes part of a draft document/state and when the previous usage is detached.
 */

export const MEDIA_OPERATION_SCHEMA = "berryboy-media-operation.v1";
export const MEDIA_VARIANT_SCHEMA = "berryboy-media-variants.v1";
export const DEFAULT_RASTER_VARIANTS = Object.freeze({
  desktop: Object.freeze({ maxSide: 3072, quality: 82, speed: 6, subsample: 1 }),
  mobile: Object.freeze({ maxSide: 2048, quality: 82, speed: 6, subsample: 1 }),
  preview: Object.freeze({ maxSide: 768, quality: 72, speed: 7, subsample: 1 })
});

export const DEFAULT_UPLOAD_LIMITS = Object.freeze({
  artwork: Object.freeze({ maxBytes: 24 * 1024 * 1024, maxSide: 10000, maxPixels: 40000000, label: "artwork image" }),
  author: Object.freeze({ maxBytes: 12 * 1024 * 1024, maxSide: 8000, maxPixels: 24000000, label: "author image" }),
  branding: Object.freeze({ maxBytes: 24 * 1024 * 1024, maxSide: 10000, maxPixels: 40000000, label: "branding image" }),
  site: Object.freeze({ maxBytes: 32 * 1024 * 1024, maxSide: 12000, maxPixels: 50000000, label: "site image" }),
  default: Object.freeze({ maxBytes: 32 * 1024 * 1024, maxSide: 12000, maxPixels: 50000000, label: "image" })
});

const RASTER_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "image/bmp"]);
const MODEL_MIME = new Set(["model/gltf-binary", "model/gltf+json", "application/octet-stream"]);
const DOCUMENT_MIME = new Set(["application/pdf", "text/plain", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function safeSegment(value, fallback = "item") {
  const normalized = text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function uuid() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function") globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function classifyMedia(input, declaredType = "") {
  const mime = text(input && input.type).toLowerCase();
  const name = text(input && input.name).toLowerCase();
  const declared = text(declaredType).toLowerCase();
  if (mime === "image/svg+xml" || name.endsWith(".svg") || declared === "svg") return { kind: "svg", mediaType: declared || "svg", rasterVariants: false };
  if (RASTER_MIME.has(mime) || /^image\//.test(mime) || /\.(jpe?g|png|webp|avif|gif|bmp)$/i.test(name)) return { kind: "raster", mediaType: declared || "image", rasterVariants: true };
  if (declared === "manifest" || name.endsWith("manifest.json")) return { kind: "manifest", mediaType: "manifest", rasterVariants: false };
  if (mime === "model/gltf-binary" || name.endsWith(".glb") || declared === "model" || declared === "venue-asset" || declared === "sculpture-model") return { kind: "model", mediaType: declared || "model", rasterVariants: false };
  if (mime === "application/pdf" || name.endsWith(".pdf") || declared === "document") return { kind: "document", mediaType: declared || "document", rasterVariants: false };
  if (/^video\//.test(mime) || declared === "video") return { kind: "video", mediaType: declared || "video", rasterVariants: false };
  if (DOCUMENT_MIME.has(mime)) return { kind: "document", mediaType: declared || "document", rasterVariants: false };
  if (MODEL_MIME.has(mime) && /\.(glb|gltf)$/i.test(name)) return { kind: "model", mediaType: declared || "model", rasterVariants: false };
  return { kind: "binary", mediaType: declared || "asset", rasterVariants: false };
}

export function createVariantSetId(mediaId = "media") {
  return `${safeSegment(mediaId, "media")}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function isAvifBuffer(buffer) {
  const bytes = new Uint8Array(buffer || new ArrayBuffer(0));
  if (bytes.length < 16) return false;
  if (String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]) !== "ftyp") return false;
  let brands = "";
  for (let index = 8; index < Math.min(bytes.length, 80); index += 1) brands += String.fromCharCode(bytes[index]);
  return brands.includes("avif") || brands.includes("avis");
}

async function sha256(blob) {
  if (!globalThis.crypto || !globalThis.crypto.subtle) return "";
  const buffer = await blob.arrayBuffer();
  const hash = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, "0")).join("");
}

function readUint24LittleEndian(bytes, offset) {
  return (bytes[offset] || 0) | ((bytes[offset + 1] || 0) << 8) | ((bytes[offset + 2] || 0) << 16);
}

export function parseRasterDimensionsFromHeader(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer || new ArrayBuffer(0));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { width: view.getUint32(16, false), height: view.getUint32(20, false), format: "png" };
  if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return { width: view.getUint16(6, true), height: view.getUint16(8, true), format: "gif" };
  if (bytes.length >= 30 && String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === "RIFF" && String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === "WEBP") {
    const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (chunk === "VP8X") return { width: 1 + readUint24LittleEndian(bytes, 24), height: 1 + readUint24LittleEndian(bytes, 27), format: "webp" };
    if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) return { width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8), height: 1 + ((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10)), format: "webp" };
    if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff, format: "webp" };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    const sof = new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset++];
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 1 >= bytes.length) break;
      const length = view.getUint16(offset, false);
      if (sof.has(marker) && length >= 7 && offset + 7 < bytes.length) return { width: view.getUint16(offset + 5, false), height: view.getUint16(offset + 3, false), format: "jpeg" };
      if (length < 2) break;
      offset += length;
    }
  }
  return null;
}

async function readRasterDimensions(file) {
  const headerSize = Math.min(Number(file && file.size) || 0, 512 * 1024);
  if (file && file.slice && headerSize > 0) {
    const header = parseRasterDimensionsFromHeader(await file.slice(0, headerSize).arrayBuffer());
    if (header && header.width > 0 && header.height > 0) return header;
  }
  const decoded = await decodeImage(file);
  try { return { width: decoded.width, height: decoded.height, format: "browser-decoded" }; }
  finally { decoded.close(); }
}

async function validateRaster(file, context = {}) {
  const profile = text(context.validationProfile || context.profile || (context.mediaType === "author-photo" ? "author" : context.entityType === "artwork" ? "artwork" : context.entityType === "branding" ? "branding" : context.ownerType === "site" ? "site" : "default"));
  const limits = { ...(DEFAULT_UPLOAD_LIMITS[profile] || DEFAULT_UPLOAD_LIMITS.default), ...(context.uploadLimits || {}) };
  if ((Number(file.size) || 0) > limits.maxBytes) throw new Error(`File is too large. The ${limits.label} limit is ${Math.round(limits.maxBytes / 1024 / 1024)} MB.`);
  const dimensions = await readRasterDimensions(file);
  const width = Number(dimensions && dimensions.width) || 0;
  const height = Number(dimensions && dimensions.height) || 0;
  const pixels = width * height;
  if (!width || !height) throw new Error("The selected image has invalid dimensions.");
  if (width > limits.maxSide || height > limits.maxSide || pixels > limits.maxPixels) throw new Error(`Image resolution is too large. Maximum ${limits.maxSide}px per side and ${Math.round(limits.maxPixels / 1000000)} MP.`);
  return { width, height, pixels, format: dimensions.format || "unknown", validationProfile: profile };
}

async function validateSvg(blob) {
  const source = await blob.text();
  const lowered = source.toLowerCase();
  const forbidden = ["<script", "onload=", "onerror=", "javascript:", "<foreignobject", "data:text/html", "<?php"];
  const hit = forbidden.find((token) => lowered.includes(token));
  if (hit) throw new Error(`SVG validation rejected unsafe content: ${hit}`);
  if (!/<svg[\s>]/i.test(source)) throw new Error("The selected file is not a valid SVG document.");
  return { sanitized: source, width: null, height: null };
}

async function validateGlb(blob) {
  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (header.length < 12 || String.fromCharCode(...header.slice(0, 4)) !== "glTF") throw new Error("The selected model is not a valid binary GLB file.");
  const version = new DataView(header.buffer).getUint32(4, true);
  if (version !== 2) throw new Error(`Unsupported GLB version: ${version}. Expected GLB 2.`);
  return { glbVersion: version };
}

async function validateManifest(blob) {
  let document;
  try { document = JSON.parse(await blob.text()); }
  catch (_) { throw new Error("The selected Venue Manifest is not valid JSON."); }
  if (!isObject(document)) throw new Error("Venue Manifest must be a JSON object.");
  if (!text(document.venueId) || !text(document.versionId)) throw new Error("Venue Manifest requires venueId and versionId.");
  if (!Array.isArray(document.assets)) throw new Error("Venue Manifest requires an assets array.");
  return { manifestSchemaVersion: Number(document.schemaVersion || 1), venueId: text(document.venueId), versionId: text(document.versionId) };
}

async function validatePdf(blob) {
  const header = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  if (String.fromCharCode(...header) !== "%PDF-") throw new Error("The selected document is not a valid PDF file.");
  return {};
}

async function decodeImage(blob) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close && bitmap.close() };
  }
  if (typeof document === "undefined") throw new Error("Raster encoding requires a browser image decoder.");
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise((resolve, reject) => {
      const node = new Image();
      node.onload = () => resolve(node);
      node.onerror = () => reject(new Error("Cannot decode the selected image."));
      node.src = url;
    });
    return { source: image, width: image.naturalWidth || image.width, height: image.naturalHeight || image.height, close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

class AvifWorkerEncoder {
  constructor(options = {}) {
    this.workerUrl = options.workerUrl || new URL("../../workers/gallery-avif-encoder-worker.js", import.meta.url).href;
    this.moduleUrl = options.moduleUrl || new URL("../../vendor/gallery-avif-encoder.mjs", import.meta.url).href;
    this.worker = null;
    this.counter = 0;
    this.pending = new Map();
  }

  getWorker() {
    if (this.worker) return this.worker;
    if (typeof Worker !== "function") throw new Error("This browser does not support the AVIF worker.");
    const worker = new Worker(this.workerUrl, { type: "module", name: "berryboy-platform-media-avif" });
    worker.addEventListener("message", (event) => {
      const message = event.data || {};
      const pending = this.pending.get(String(message.id));
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(String(message.id));
      if (!message.ok) pending.reject(new Error(message.error || "AVIF encoding failed."));
      else pending.resolve(message.buffer);
    });
    worker.addEventListener("error", (event) => {
      const error = new Error(event.message || "AVIF worker crashed.");
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
      this.pending.clear();
      try { worker.terminate(); } catch (_) {}
      this.worker = null;
    });
    this.worker = worker;
    return worker;
  }

  encode(imageData, options) {
    return new Promise((resolve, reject) => {
      const id = String(++this.counter);
      const worker = this.getWorker();
      const copy = imageData.data.buffer.slice(0);
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("AVIF encoding timed out after 180 seconds."));
      }, 180000);
      this.pending.set(id, { resolve, reject, timer });
      worker.postMessage({ type: "encode", id, moduleUrl: this.moduleUrl, width: imageData.width, height: imageData.height, pixelBuffer: copy, options }, [copy]);
    });
  }
}

async function encodeRasterVariants(blob, profiles, encoder) {
  if (typeof document === "undefined") throw new Error("Raster variants can only be generated in a browser context.");
  const decoded = await decodeImage(blob);
  const variants = {};
  try {
    for (const [name, settings] of Object.entries(profiles)) {
      const maxSide = Math.max(1, Number(settings.maxSide || 1024));
      const scale = Math.min(1, maxSide / Math.max(decoded.width, decoded.height));
      const width = Math.max(1, Math.round(decoded.width * scale));
      const height = Math.max(1, Math.round(decoded.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: true, desynchronized: true, willReadFrequently: false });
      if (!context) throw new Error("Cannot create the raster conversion canvas.");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(decoded.source, 0, 0, width, height);
      const imageData = context.getImageData(0, 0, width, height);
      const encoded = await encoder.encode(imageData, settings);
      if (!isAvifBuffer(encoded)) throw new Error(`The ${name} encoder result is not a valid AVIF file.`);
      variants[name] = { blob: new Blob([encoded], { type: "image/avif" }), width, height, mimeType: "image/avif" };
    }
  } finally {
    decoded.close();
  }
  return { sourceWidth: decoded.width, sourceHeight: decoded.height, variants };
}

function safePath(value, fallback = "assets") {
  const parts = text(value).split("/").map((part) => safeSegment(part, "")).filter(Boolean);
  return parts.length ? parts.join("/") : safeSegment(fallback, "assets");
}

function ownerRoot(context, mediaId) {
  const ownerType = text(context.ownerType);
  const ownerId = safeSegment(context.ownerId, "unscoped");
  const entityType = safeSegment(context.entityType, "assets");
  const entityId = safeSegment(context.entityId, mediaId);
  const role = safeSegment(context.usageRole, "asset");
  if (ownerType === "exhibition") {
    const category = safePath(context.category || (entityType === "artwork" ? "artworks" : entityType === "sculpture" ? "sculptures" : entityType === "author" ? "authors" : entityType === "branding" ? "branding" : entityType === "document" ? "documents" : "assets"));
    if (category === "branding" || category.startsWith("branding/")) return `exhibitions/${ownerId}/${category}/${mediaId}`;
    return `exhibitions/${ownerId}/${category}/${entityId}/${mediaId}`;
  }
  if (ownerType === "venue") {
    const versionId = safeSegment(context.venueVersionId, "draft");
    const category = safePath(context.category || (entityType === "manifest" ? "manifest" : entityType === "navigation" ? "navigation" : entityType === "texture" ? "textures" : entityType === "preview" ? "preview" : "models"));
    return `venues/${ownerId}/versions/${versionId}/${category}/${mediaId}`;
  }
  if (ownerType === "site") return `site/${safePath(context.category || entityType, "homepage")}/${mediaId}`;
  if (ownerType === "platform") return `media-library/${mediaId}`;
  return `unscoped/${ownerId}/${entityType}/${entityId}/${role}/${mediaId}`;
}

function originalFileName(file) {
  return safeSegment(file && file.name, "asset.bin");
}

function normalizeRpcData(response) {
  if (!response) return null;
  if (response.error) throw response.error;
  const data = response.data;
  if (Array.isArray(data)) return data[0] || null;
  return data;
}

export class MediaService {
  constructor(options = {}) {
    if (!options.client) throw new Error("MediaService requires a Supabase client.");
    this.client = options.client;
    this.platformBucket = options.platformBucket || "platform-media";
    this.venueBucket = options.venueBucket || "venue-runtime";
    this.profiles = options.rasterVariants || DEFAULT_RASTER_VARIANTS;
    this.encoder = options.encoder || new AvifWorkerEncoder(options.encoderOptions || {});
    this.activeByOwner = new Map();
    this.pendingCommitted = new Map();
  }


  async validate(file, context = {}) {
    if (!file) throw new Error("A file is required.");
    const classification = classifyMedia(file, context.mediaType);
    let metadata = {};
    if (classification.kind === "raster") metadata = await validateRaster(file, context);
    else if (classification.kind === "svg") metadata = await validateSvg(file);
    else if (classification.kind === "manifest") metadata = await validateManifest(file);
    else if (classification.kind === "model") metadata = await validateGlb(file);
    else if (classification.kind === "document" && (file.type === "application/pdf" || /\.pdf$/i.test(file.name || ""))) metadata = await validatePdf(file);
    return { ok: true, classification, metadata };
  }

  async createSignedUrls(bucket, paths, expiresIn = 3600) {
    const entries = Object.entries(paths || {}).filter(([, path]) => !!path);
    const resolved = {};
    await Promise.all(entries.map(async ([key, path]) => {
      const response = await this.client.storage.from(bucket).createSignedUrl(path, expiresIn);
      if (response.error) throw response.error;
      resolved[key] = response.data && response.data.signedUrl || "";
    }));
    return resolved;
  }

  createOperationContext(context = {}) {
    const mediaId = text(context.mediaId) || uuid();
    const operationToken = uuid();
    const ownerKey = [context.ownerType, context.ownerId, context.entityType, context.entityId, context.usageRole].map((value) => text(value)).join(":");
    const localGeneration = Number((this.activeByOwner.get(ownerKey) || {}).generation || 0) + 1;
    const operation = {
      schema: MEDIA_OPERATION_SCHEMA,
      id: null,
      mediaId,
      ownerKey,
      ownerType: text(context.ownerType),
      ownerId: text(context.ownerId),
      exhibitionId: text(context.exhibitionId || (context.ownerType === "exhibition" ? context.ownerId : "")) || null,
      venueId: text(context.venueId || (context.ownerType === "venue" ? context.ownerId : "")) || null,
      venueVersionId: text(context.venueVersionId) || null,
      entityType: text(context.entityType) || "asset",
      entityId: text(context.entityId) || mediaId,
      usageRole: text(context.usageRole) || "asset",
      mediaType: text(context.mediaType) || "asset",
      variantSetId: null,
      generation: localGeneration,
      operationToken,
      createdPaths: [],
      previousPaths: Array.isArray(context.previousPaths) ? [...context.previousPaths] : [],
      previousMediaId: text(context.previousMediaId) || null,
      category: text(context.category) || null,
      status: "created",
      createdAt: new Date().toISOString()
    };
    this.activeByOwner.set(ownerKey, operation);
    return operation;
  }

  isCurrent(operation) {
    return !!operation && this.activeByOwner.get(operation.ownerKey) === operation;
  }

  async begin(operation, metadata = {}) {
    const data = normalizeRpcData(await this.client.rpc("media_begin_operation", {
      p_media_id: operation.mediaId,
      p_owner_type: operation.ownerType,
      p_owner_id: operation.ownerId || null,
      p_entity_type: operation.entityType,
      p_entity_id: operation.entityId,
      p_usage_role: operation.usageRole,
      p_media_type: operation.mediaType,
      p_previous_media_id: operation.previousMediaId,
      p_operation_token: operation.operationToken,
      p_metadata: metadata
    }));
    operation.id = data && (data.id || data.operation_id) || operation.operationToken;
    operation.generation = Number(data && data.generation || operation.generation);
    operation.status = "uploading";
    return operation;
  }

  async upload(file, context = {}) {
    if (!file) throw new Error("A file is required.");
    const validated = await this.validate(file, context);
    const classification = validated.classification;
    const operation = this.createOperationContext({ ...context, mediaType: classification.mediaType });
    await this.begin(operation, { ...(context.metadata || {}), originalName: file.name || "", declaredMimeType: file.type || "", mediaKind: classification.kind, exhibitionId: operation.exhibitionId, venueId: operation.venueId, venueVersionId: operation.venueVersionId, category: operation.category });
    const bucket = (classification.kind === "model" || classification.kind === "manifest") && operation.ownerType === "venue" ? this.venueBucket : this.platformBucket;
    const root = ownerRoot({ ...context, ownerType: operation.ownerType, ownerId: operation.ownerId, entityType: operation.entityType, entityId: operation.entityId, usageRole: operation.usageRole }, operation.mediaId);
    const originalPath = classification.kind === "manifest" && operation.ownerType === "venue"
      ? `venues/${safeSegment(operation.ownerId)}/versions/${safeSegment(context.venueVersionId, "draft")}/manifest.json`
      : `${root}/original/${originalFileName(file)}`;
    let metadata = { ...(context.metadata || {}), ...(validated.metadata || {}) };
    try {
      const fileHash = await sha256(file);
      const originalUpload = await this.client.storage.from(bucket).upload(originalPath, file, { cacheControl: "31536000", contentType: file.type || "application/octet-stream", upsert: false });
      if (originalUpload.error) throw originalUpload.error;
      operation.createdPaths.push(originalPath);
      const originalVerification = await this.client.storage.from(bucket).download(originalPath);
      if (originalVerification.error) throw originalVerification.error;
      if (Number(originalVerification.data.size || 0) !== Number(file.size || 0)) throw new Error("Uploaded original verification failed.");
      let variantSetId = null;
      const variantPaths = {};
      const variantMetadata = {};
      if (classification.rasterVariants) {
        variantSetId = createVariantSetId(operation.mediaId);
        operation.variantSetId = variantSetId;
        const built = await encodeRasterVariants(file, context.rasterVariants || this.profiles, this.encoder);
        metadata.sourceWidth = built.sourceWidth;
        metadata.sourceHeight = built.sourceHeight;
        for (const [variantName, variant] of Object.entries(built.variants)) {
          const variantPath = `${root}/variants/${variantSetId}/${variantName}.avif`;
          const response = await this.client.storage.from(bucket).upload(variantPath, variant.blob, { cacheControl: "31536000", contentType: "image/avif", upsert: false });
          if (response.error) throw response.error;
          operation.createdPaths.push(variantPath);
          const verification = await this.client.storage.from(bucket).download(variantPath);
          if (verification.error) throw verification.error;
          const verifiedBuffer = await verification.data.arrayBuffer();
          if (!isAvifBuffer(verifiedBuffer) || verifiedBuffer.byteLength !== variant.blob.size) throw new Error(`Uploaded ${variantName} AVIF verification failed.`);
          variantPaths[variantName] = variantPath;
          variantMetadata[variantName] = { width: variant.width, height: variant.height, size: variant.blob.size };
        }
      }
      if (!this.isCurrent(operation)) throw Object.assign(new Error("A newer media operation replaced this upload."), { code: "STALE_MEDIA_OPERATION" });
      const committed = normalizeRpcData(await this.client.rpc("media_commit_operation", {
        p_operation_id: operation.id,
        p_operation_token: operation.operationToken,
        p_storage_bucket: bucket,
        p_original_path: originalPath,
        p_desktop_path: variantPaths.desktop || null,
        p_mobile_path: variantPaths.mobile || null,
        p_preview_path: variantPaths.preview || null,
        p_mime_type: file.type || "application/octet-stream",
        p_file_size: Number(file.size || 0),
        p_file_hash: fileHash || null,
        p_variant_set_id: variantSetId,
        p_metadata: { ...metadata, variants: variantMetadata, originalName: file.name || "", mediaKind: classification.kind }
      }));
      operation.status = "committed";
      operation.finishedAt = new Date().toISOString();
      const scopeKey = `${operation.ownerType}:${operation.ownerId || "global"}`;
      const pending = this.pendingCommitted.get(scopeKey) || [];
      pending.push(operation);
      this.pendingCommitted.set(scopeKey, pending);
      let urls = {};
      try { urls = await this.createSignedUrls(bucket, { original: originalPath, desktop: variantPaths.desktop || null, mobile: variantPaths.mobile || null, preview: variantPaths.preview || null }); }
      catch (urlError) { console.warn("Media committed, but signed URL creation failed:", urlError); }
      return {
        ok: true,
        operation,
        media: committed && (committed.media || committed) || { id: operation.mediaId },
        mediaId: operation.mediaId,
        mediaType: operation.mediaType,
        mediaKind: classification.kind,
        bucket,
        originalPath,
        desktopPath: variantPaths.desktop || null,
        mobilePath: variantPaths.mobile || null,
        previewPath: variantPaths.preview || null,
        variantSetId,
        generation: operation.generation,
        operationToken: operation.operationToken,
        urls,
        metadata: { ...metadata, variants: variantMetadata, fileHash, size: Number(file.size || 0), mimeType: file.type || "application/octet-stream" }
      };
    } catch (error) {
      operation.status = error && error.code === "STALE_MEDIA_OPERATION" ? "stale" : "failed";
      operation.error = error && error.message ? error.message : String(error);
      try {
        await this.client.rpc("media_fail_operation", {
          p_operation_id: operation.id,
          p_operation_token: operation.operationToken,
          p_created_paths: operation.createdPaths,
          p_error_message: operation.error
        });
      } catch (_) {}
      throw error;
    } finally {
      if (this.activeByOwner.get(operation.ownerKey) === operation) this.activeByOwner.delete(operation.ownerKey);
    }
  }

  async importUrl(url, context = {}) {
    const response = await fetch(text(url), { mode: "cors", cache: "no-store" });
    if (!response.ok) throw new Error(`Remote file returned HTTP ${response.status}.`);
    const blob = await response.blob();
    const pathname = (() => { try { return new URL(url).pathname; } catch (_) { return ""; } })();
    const name = safeSegment(pathname.split("/").pop(), `imported-${Date.now()}`);
    const file = typeof File === "function" ? new File([blob], name, { type: blob.type || "application/octet-stream" }) : Object.assign(blob, { name });
    return this.upload(file, { ...context, metadata: { ...(context.metadata || {}), importedFromUrl: text(url) } });
  }

  async attachExisting(mediaId, context = {}) {
    return normalizeRpcData(await this.client.rpc("media_attach_existing", {
      p_media_id: mediaId,
      p_owner_type: context.ownerType,
      p_owner_id: context.ownerId || null,
      p_entity_type: context.entityType || "asset",
      p_entity_id: context.entityId || mediaId,
      p_usage_role: context.usageRole || "asset"
    }));
  }

  async listAvailable(filters = {}) {
    const data = normalizeRpcData(await this.client.rpc("admin_list_media", {
      p_owner_type: filters.ownerType || null,
      p_owner_id: filters.ownerId || null,
      p_media_type: filters.mediaType || null,
      p_include_archived: false
    }));
    return Array.isArray(data) ? data : [];
  }

  async attachExistingResolved(mediaId, context = {}) {
    const media = await this.attachExisting(mediaId, context);
    const bucket = media.storage_bucket || this.platformBucket;
    const urls = await this.createSignedUrls(bucket, {
      original: media.original_path,
      desktop: media.desktop_avif_path,
      mobile: media.mobile_avif_path,
      preview: media.preview_avif_path
    });
    return { media, bucket, urls };
  }

  forgetPendingOperation(operationId) {
    for (const [key, values] of this.pendingCommitted) {
      const filtered = values.filter((item) => item.id !== operationId);
      if (filtered.length) this.pendingCommitted.set(key, filtered);
      else this.pendingCommitted.delete(key);
    }
  }

  async finalize(operationId, operationToken) {
    const result = normalizeRpcData(await this.client.rpc("media_finalize_operation", {
      p_operation_id: operationId,
      p_operation_token: operationToken
    }));
    this.forgetPendingOperation(operationId);
    return result;
  }

  async discard(operationId, operationToken, reason = "owner-save-failed") {
    const result = normalizeRpcData(await this.client.rpc("media_discard_operation", { p_operation_id: operationId, p_operation_token: operationToken, p_reason: reason }));
    this.forgetPendingOperation(operationId);
    return result;
  }

  async finalizePending(context = {}) {
    const key = `${text(context.ownerType)}:${text(context.ownerId) || "global"}`;
    const operations = [...(this.pendingCommitted.get(key) || [])];
    const results = [];
    for (const operation of operations) results.push(await this.finalize(operation.id, operation.operationToken));
    this.pendingCommitted.delete(key);
    return results;
  }

  async discardPending(context = {}, reason = "draft-abandoned") {
    const key = `${text(context.ownerType)}:${text(context.ownerId) || "global"}`;
    const operations = [...(this.pendingCommitted.get(key) || [])];
    const results = [];
    for (const operation of operations) results.push(await this.discard(operation.id, operation.operationToken, reason));
    this.pendingCommitted.delete(key);
    return results;
  }

  async repairVariants(mediaId, context = {}) {
    const media = normalizeRpcData(await this.client.rpc("media_get_for_repair", { p_media_id: mediaId }));
    if (!media || !media.storage_bucket || !media.original_path) throw new Error("The original medium is unavailable for repair.");
    const download = await this.client.storage.from(media.storage_bucket).download(media.original_path);
    if (download.error) throw download.error;
    const file = typeof File === "function" ? new File([download.data], media.metadata?.originalName || "repaired-image", { type: media.mime_type || download.data.type }) : Object.assign(download.data, { name: media.metadata?.originalName || "repaired-image" });
    return this.upload(file, {
      ...context,
      mediaId: context.mediaId && context.mediaId !== mediaId ? context.mediaId : undefined,
      previousMediaId: mediaId,
      mediaType: media.media_type,
      metadata: { ...(media.metadata || {}), repairedFromMediaId: mediaId }
    });
  }
}

export function createMediaService(options) {
  return new MediaService(options);
}
