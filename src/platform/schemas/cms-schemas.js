export const HOMEPAGE_SCHEMA = "berryboy-homepage.v1";
export const EXHIBITION_CARD_SCHEMA = "berryboy-exhibition-card.v1";
export const SITE_SETTINGS_SCHEMA = "berryboy-site-settings.v1";

const SECTION_TYPES = Object.freeze(["hero", "exhibition_collection", "about", "partners", "contact", "footer"]);

export function slugify(value) {
  return String(value || "")
    .replace(/[Łł]/g, (char) => char === "Ł" ? "L" : "l")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function isValidSlug(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || ""));
}

export function createDefaultHomepage() {
  return {
    schema: HOMEPAGE_SCHEMA,
    schemaVersion: 1,
    sections: [
      {
        id: "hero",
        type: "hero",
        enabled: true,
        displayOrder: 10,
        content: {
          eyebrow: "Berryboy Art Gallery",
          title: "Exhibitions in a shared 3D platform.",
          description: "Choose a published exhibition and enter its dedicated virtual venue.",
          primaryLabel: "View exhibitions"
        }
      },
      {
        id: "exhibitions",
        type: "exhibition_collection",
        enabled: true,
        displayOrder: 20,
        content: {
          title: "Current exhibitions",
          description: "Published exhibitions are loaded dynamically from Supabase.",
          mode: "automatic",
          exhibitionIds: [],
          layout: "carousel",
          visibleCards: 3
        }
      },
      {
        id: "about",
        type: "about",
        enabled: true,
        displayOrder: 30,
        content: {
          title: "About the platform",
          description: "One Babylon.js engine can load multiple venues and independent exhibitions."
        }
      },
      {
        id: "footer",
        type: "footer",
        enabled: true,
        displayOrder: 90,
        content: {
          copyright: "Berryboy Art Gallery",
          links: []
        }
      }
    ]
  };
}

export function normalizeHomepage(value) {
  const source = value && typeof value === "object" ? value : createDefaultHomepage();
  const sections = Array.isArray(source.sections) ? source.sections : [];
  return {
    schema: HOMEPAGE_SCHEMA,
    schemaVersion: 1,
    sections: sections
      .filter((section) => section && SECTION_TYPES.includes(String(section.type)))
      .map((section, index) => ({
        id: String(section.id || `${section.type}-${index + 1}`),
        type: String(section.type),
        enabled: section.enabled !== false,
        displayOrder: Number.isFinite(Number(section.displayOrder)) ? Number(section.displayOrder) : (index + 1) * 10,
        content: section.content && typeof section.content === "object" ? structuredCloneSafe(section.content) : {}
      }))
      .sort((a, b) => a.displayOrder - b.displayOrder)
  };
}

export function validateHomepage(value) {
  const normalized = normalizeHomepage(value);
  const errors = [];
  const ids = new Set();
  for (const section of normalized.sections) {
    if (ids.has(section.id)) errors.push(`Duplicate homepage section id: ${section.id}`);
    ids.add(section.id);
    if (!SECTION_TYPES.includes(section.type)) errors.push(`Unsupported homepage section: ${section.type}`);
    if (section.type === "hero" && !String(section.content.title || "").trim()) errors.push("Hero title is required");
    if (section.type === "exhibition_collection") {
      const mode = String(section.content.mode || "automatic");
      if (!['automatic', 'manual'].includes(mode)) errors.push("Exhibition collection mode must be automatic or manual");
      if (mode === "manual" && !Array.isArray(section.content.exhibitionIds)) errors.push("Manual collection requires exhibitionIds");
    }
  }
  if (!normalized.sections.some((section) => section.type === "hero" && section.enabled)) errors.push("An enabled hero section is required");
  if (!normalized.sections.some((section) => section.type === "exhibition_collection" && section.enabled)) errors.push("An enabled exhibition collection is required");
  return { valid: errors.length === 0, errors, value: normalized };
}

export function normalizeExhibitionCard(value, exhibition) {
  const source = value && typeof value === "object" ? value : {};
  const record = exhibition && typeof exhibition === "object" ? exhibition : {};
  return {
    schema: EXHIBITION_CARD_SCHEMA,
    schemaVersion: 1,
    title: String(source.title ?? record.title ?? "").trim(),
    subtitle: String(source.subtitle ?? record.subtitle ?? "").trim(),
    shortDescription: String(source.shortDescription ?? source.short_description ?? record.short_description ?? "").trim(),
    buttonLabel: String(source.buttonLabel ?? source.button_label ?? record.button_label ?? "Enter gallery").trim(),
    curator: String(source.curator ?? record.curator ?? "").trim(),
    coverMediaId: source.coverMediaId ?? source.cover_media_id ?? record.cover_media_id ?? null,
    mobileCoverMediaId: source.mobileCoverMediaId ?? source.mobile_cover_media_id ?? record.mobile_cover_media_id ?? null,
    logoMediaId: source.logoMediaId ?? source.logo_media_id ?? record.logo_media_id ?? null,
    theme: source.theme && typeof source.theme === "object" ? structuredCloneSafe(source.theme) : (record.theme || {}),
    statusLabel: String(source.statusLabel || "").trim()
  };
}

export function validateExhibitionCard(value, options = {}) {
  const card = normalizeExhibitionCard(value, options.exhibition);
  const errors = [];
  const warnings = [];
  if (!card.title) errors.push("Card title is required");
  if (!card.buttonLabel) errors.push("Button label is required");
  if (!card.shortDescription) warnings.push("Short description is empty");
  if (!card.coverMediaId && options.requireCover !== false) errors.push("Cover media is required before publication");
  return { valid: errors.length === 0, errors, warnings, value: card };
}

export function createDefaultSiteSettings() {
  return {
    schema: SITE_SETTINGS_SCHEMA,
    schemaVersion: 1,
    siteName: "Berryboy Art Gallery",
    defaultLocale: "en",
    contactEmail: "",
    socialLinks: [],
    footerNote: ""
  };
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
