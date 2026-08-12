export const HOMEPAGE_SCHEMA = "berryboy-homepage.v2";
export const EXHIBITION_CARD_SCHEMA = "berryboy-exhibition-document.v2";
export const SITE_SETTINGS_SCHEMA = "berryboy-site-settings.v2";

const SECTION_TYPES = Object.freeze(["hero", "exhibition_collection", "about", "partners", "contact", "footer"]);
const LAYOUTS = Object.freeze(["carousel", "grid", "list"]);
const ALIGNMENTS = Object.freeze(["left", "center", "right"]);

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
function string(value, fallback = "") { return String(value ?? fallback).trim(); }
function number(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function nullable(value) { const clean = string(value); return clean || null; }
function array(value) { return Array.isArray(value) ? clone(value) : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? clone(value) : {}; }
function normalizeLink(item = {}) {
  return { label: string(item.label || item.name), url: string(item.url || item.href), altText: string(item.altText || item.alt_text), displayOrder: number(item.displayOrder ?? item.display_order, 0) };
}
function normalizeSocial(item = {}) {
  return { platform: string(item.platform || item.label), label: string(item.label || item.platform), url: string(item.url || item.href), icon: string(item.icon) };
}

export function slugify(value) {
  return String(value || "").replace(/[Łł]/g, (char) => char === "Ł" ? "L" : "l").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
export function isValidSlug(value) { return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || "")); }

export function createDefaultHomepage() {
  return {
    schema: HOMEPAGE_SCHEMA,
    schemaVersion: 2,
    sections: [
      { id: "hero", type: "hero", enabled: true, displayOrder: 10, content: {
        eyebrow: "Berryboy Art Gallery", title: "Exhibitions in a shared 3D platform.", subtitle: "", description: "Choose a published exhibition and enter its dedicated virtual venue.",
        logoMediaId: null, desktopMediaId: null, mobileMediaId: null, videoMediaId: null,
        primaryLabel: "View exhibitions", primaryUrl: "#exhibitions", secondaryLabel: "", secondaryUrl: "", alignment: "left", theme: {}
      }},
      { id: "exhibitions", type: "exhibition_collection", enabled: true, displayOrder: 20, content: {
        title: "Current exhibitions", description: "Published exhibitions are loaded dynamically from Supabase.", mode: "automatic", exhibitionIds: [], layout: "carousel", visibleCards: 3, mobileLayout: "carousel", statusFilter: []
      }},
      { id: "about", type: "about", enabled: true, displayOrder: 30, content: {
        title: "About the platform", description: "One Babylon.js engine can load multiple venues and independent exhibitions.", imageMediaIds: [], ctaLabel: "", ctaUrl: ""
      }},
      { id: "partners", type: "partners", enabled: false, displayOrder: 40, content: { title: "Partners", description: "", items: [] }},
      { id: "contact", type: "contact", enabled: false, displayOrder: 50, content: { title: "Contact", description: "", address: "", email: "", phone: "", hours: "", mapUrl: "", socialLinks: [] }},
      { id: "footer", type: "footer", enabled: true, displayOrder: 90, content: { logoMediaId: null, text: "", copyright: "Berryboy Art Gallery", links: [], socialLinks: [], columns: [] }}
    ]
  };
}

function normalizeSection(section, index) {
  const type = string(section?.type);
  const content = object(section?.content);
  if (type === "hero") return { id: string(section.id, "hero"), type, enabled: section.enabled !== false, displayOrder: number(section.displayOrder, (index + 1) * 10), content: {
    eyebrow: string(content.eyebrow), title: string(content.title), subtitle: string(content.subtitle), description: string(content.description),
    logoMediaId: nullable(content.logoMediaId), desktopMediaId: nullable(content.desktopMediaId || content.backgroundMediaId), mobileMediaId: nullable(content.mobileMediaId), videoMediaId: nullable(content.videoMediaId),
    primaryLabel: string(content.primaryLabel), primaryUrl: string(content.primaryUrl, "#exhibitions"), secondaryLabel: string(content.secondaryLabel), secondaryUrl: string(content.secondaryUrl),
    alignment: ALIGNMENTS.includes(content.alignment) ? content.alignment : "left", theme: object(content.theme)
  }};
  if (type === "exhibition_collection") return { id: string(section.id, "exhibitions"), type, enabled: section.enabled !== false, displayOrder: number(section.displayOrder, (index + 1) * 10), content: {
    title: string(content.title), description: string(content.description), mode: content.mode === "manual" ? "manual" : "automatic", exhibitionIds: array(content.exhibitionIds).map(String),
    layout: LAYOUTS.includes(content.layout) ? content.layout : "carousel", mobileLayout: LAYOUTS.includes(content.mobileLayout) ? content.mobileLayout : "carousel", visibleCards: Math.max(1, Math.min(8, number(content.visibleCards, 3))), statusFilter: array(content.statusFilter).map(String)
  }};
  if (type === "about") return { id: string(section.id, `about-${index}`), type, enabled: section.enabled !== false, displayOrder: number(section.displayOrder, (index + 1) * 10), content: {
    title: string(content.title), description: string(content.description), imageMediaIds: array(content.imageMediaIds).map(String), ctaLabel: string(content.ctaLabel), ctaUrl: string(content.ctaUrl)
  }};
  if (type === "partners") return { id: string(section.id, `partners-${index}`), type, enabled: section.enabled !== false, displayOrder: number(section.displayOrder, (index + 1) * 10), content: {
    title: string(content.title), description: string(content.description), items: array(content.items).map((item, itemIndex) => ({ id: string(item.id, `partner-${itemIndex}`), name: string(item.name), logoMediaId: nullable(item.logoMediaId), url: string(item.url), altText: string(item.altText), displayOrder: number(item.displayOrder, itemIndex * 10) })).sort((a,b)=>a.displayOrder-b.displayOrder)
  }};
  if (type === "contact") return { id: string(section.id, `contact-${index}`), type, enabled: section.enabled !== false, displayOrder: number(section.displayOrder, (index + 1) * 10), content: {
    title: string(content.title), description: string(content.description), address: string(content.address), email: string(content.email), phone: string(content.phone), hours: string(content.hours), mapUrl: string(content.mapUrl), socialLinks: array(content.socialLinks).map(normalizeSocial)
  }};
  if (type === "footer") return { id: string(section.id, `footer-${index}`), type, enabled: section.enabled !== false, displayOrder: number(section.displayOrder, (index + 1) * 10), content: {
    logoMediaId: nullable(content.logoMediaId), text: string(content.text || content.description || content.footerNote), copyright: string(content.copyright), links: array(content.links).map(normalizeLink), socialLinks: array(content.socialLinks).map(normalizeSocial),
    columns: array(content.columns).map((column, columnIndex) => ({ id: string(column.id, `column-${columnIndex}`), title: string(column.title), links: array(column.links).map(normalizeLink) }))
  }};
  return null;
}

export function normalizeHomepage(value) {
  const source = value && typeof value === "object" ? value : createDefaultHomepage();
  const normalized = (Array.isArray(source.sections) ? source.sections : []).map(normalizeSection).filter(Boolean).sort((a,b)=>a.displayOrder-b.displayOrder);
  return { schema: HOMEPAGE_SCHEMA, schemaVersion: 2, sections: normalized.length ? normalized : createDefaultHomepage().sections };
}

export function validateHomepage(value) {
  const normalized = normalizeHomepage(value); const errors = []; const ids = new Set();
  for (const section of normalized.sections) {
    if (ids.has(section.id)) errors.push(`Duplicate homepage section id: ${section.id}`); ids.add(section.id);
    if (!SECTION_TYPES.includes(section.type)) errors.push(`Unsupported homepage section: ${section.type}`);
    if (section.type === "hero" && !section.content.title) errors.push("Hero title is required");
    if (section.type === "exhibition_collection" && section.content.mode === "manual" && !Array.isArray(section.content.exhibitionIds)) errors.push("Manual collection requires exhibitionIds");
    if (section.type === "partners") for (const partner of section.content.items) if (!partner.name) errors.push("Each partner requires a name");
  }
  if (!normalized.sections.some((section) => section.type === "hero" && section.enabled)) errors.push("An enabled hero section is required");
  if (!normalized.sections.some((section) => section.type === "exhibition_collection" && section.enabled)) errors.push("An enabled exhibition collection is required");
  return { valid: errors.length === 0, errors, value: normalized };
}

export function normalizeExhibitionCard(value, exhibition = {}) {
  const source = object(value); const record = object(exhibition); const theme = object(source.theme || record.theme);
  return {
    schema: EXHIBITION_CARD_SCHEMA, schemaVersion: 2,
    slug: string(source.slug ?? record.slug), title: string(source.title ?? record.title), subtitle: string(source.subtitle ?? record.subtitle),
    shortDescription: string(source.shortDescription ?? source.short_description ?? record.short_description), longDescription: string(source.longDescription ?? source.long_description ?? record.long_description),
    buttonLabel: string(source.buttonLabel ?? source.button_label ?? record.button_label, "Enter gallery"), statusLabel: string(source.statusLabel ?? source.status_label), curator: string(source.curator ?? record.curator),
    venueName: string(source.venueName ?? source.venue_name ?? record.venue_name), location: string(source.location ?? record.location),
    startDate: nullable(source.startDate ?? source.start_date ?? record.start_date), endDate: nullable(source.endDate ?? source.end_date ?? record.end_date), displayOrder: number(source.displayOrder ?? source.display_order ?? record.display_order, 0),
    coverMediaId: source.coverMediaId ?? source.cover_media_id ?? record.cover_media_id ?? null, mobileCoverMediaId: source.mobileCoverMediaId ?? source.mobile_cover_media_id ?? record.mobile_cover_media_id ?? null, logoMediaId: source.logoMediaId ?? source.logo_media_id ?? record.logo_media_id ?? null,
    coverAltText: string(source.coverAltText ?? source.cover_alt_text, string(source.title ?? record.title, "Exhibition cover")), coverFocalPoint: { x: Math.max(0, Math.min(100, number(source.coverFocalPoint?.x ?? source.cover_focal_x, 50))), y: Math.max(0, Math.min(100, number(source.coverFocalPoint?.y ?? source.cover_focal_y, 50))) },
    theme: { accent: string(theme.accent), background: string(theme.background), text: string(theme.text), cardStyle: string(theme.cardStyle || theme.card_style) },
    status: string(source.status ?? record.status, "draft")
  };
}

export function validateExhibitionCard(value, options = {}) {
  const card = normalizeExhibitionCard(value, options.exhibition); const errors = []; const warnings = [];
  if (!card.title) errors.push("Card title is required"); if (!card.slug || !isValidSlug(card.slug)) errors.push("A valid slug is required"); if (!card.buttonLabel) errors.push("Button label is required");
  if (!card.shortDescription) warnings.push("Short description is empty"); if (!card.coverMediaId && options.requireCover !== false) errors.push("Cover media is required before publication");
  if (card.startDate && card.endDate && new Date(card.endDate) < new Date(card.startDate)) errors.push("End date cannot be earlier than start date");
  return { valid: errors.length === 0, errors, warnings, value: card };
}

export function createDefaultSiteSettings() {
  return { schema: SITE_SETTINGS_SCHEMA, schemaVersion: 2, siteName: "Berryboy Art Gallery", defaultLocale: "pl", contactEmail: "", contactPhone: "", address: "", socialLinks: [], footerNote: "", legalLinks: [] };
}
export function normalizeSiteSettings(value) {
  const source = object(value); const defaults = createDefaultSiteSettings();
  return { ...defaults, ...source, schema: SITE_SETTINGS_SCHEMA, schemaVersion: 2, siteName: string(source.siteName, defaults.siteName), defaultLocale: ["pl","en"].includes(source.defaultLocale) ? source.defaultLocale : "pl", contactEmail: string(source.contactEmail), contactPhone: string(source.contactPhone), address: string(source.address), footerNote: string(source.footerNote), socialLinks: array(source.socialLinks).map(normalizeSocial), legalLinks: array(source.legalLinks).map(normalizeLink) };
}
