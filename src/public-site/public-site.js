import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../platform/supabase-config.js";
import { createDefaultHomepage, normalizeHomepage } from "../platform/schemas/cms-schemas.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const root = document.getElementById("publicSite");
const template = document.getElementById("exhibitionCardTemplate");

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

function absoluteMediaUrl(path) {
  const value = String(path || "");
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return new URL(value, SUPABASE_URL).href;
}

function formatRange(start, end) {
  if (!start && !end) return "";
  const formatter = new Intl.DateTimeFormat(document.documentElement.lang || "pl", { dateStyle: "medium" });
  const a = start ? formatter.format(new Date(start)) : "";
  const b = end ? formatter.format(new Date(end)) : "";
  return a && b ? `${a} — ${b}` : a || b;
}

function createCard(record) {
  const fragment = template.content.cloneNode(true);
  const article = fragment.querySelector("article");
  const image = fragment.querySelector("img");
  const title = fragment.querySelector("h3");
  const venue = fragment.querySelector(".cardVenue");
  const description = fragment.querySelector(".cardDescription");
  const meta = fragment.querySelector(".cardMeta");
  const link = fragment.querySelector(".cardButton");
  title.textContent = record.title || record.slug;
  venue.textContent = record.venue_name || "Virtual venue";
  description.textContent = record.short_description || "";
  meta.textContent = [record.curator, formatRange(record.start_date, record.end_date)].filter(Boolean).join(" · ");
  link.textContent = record.button_label || "Enter gallery";
  link.href = `./gallery/?exhibition=${encodeURIComponent(record.slug)}`;
  const imageUrl = absoluteMediaUrl(record.mobile_cover_url || record.cover_url);
  if (imageUrl) { image.src = imageUrl; image.alt = record.title || "Exhibition cover"; image.classList.add("hasImage"); }
  article.style.setProperty("--card-accent", record.theme && record.theme.accent || "");
  return fragment;
}

function renderHero(section, mediaMap = {}) {
  const content = section.content || {};
  const wrapper = el("section", "publicSection heroSection");
  const media = content.backgroundMediaId ? mediaMap[String(content.backgroundMediaId)] : null;
  if (media && media.url) {
    const url = absoluteMediaUrl(media.mobileUrl || media.url);
    if (String(media.mediaType || "").toLowerCase() === "video") {
      const video = el("video", "heroMedia");
      video.src = url; video.autoplay = true; video.muted = true; video.loop = true; video.playsInline = true;
      wrapper.append(video);
    } else {
      const image = el("img", "heroMedia"); image.src = url; image.alt = ""; wrapper.append(image);
    }
    wrapper.classList.add("hasHeroMedia");
  }
  const contentLayer = el("div", "heroContent");
  contentLayer.append(el("p", "eyebrow", content.eyebrow || "Berryboy Art Gallery"), el("h1", "", content.title || "Virtual exhibitions."), el("p", "", content.description || ""));
  const link = el("a", "primaryLink", content.primaryLabel || "View exhibitions");
  link.href = "#exhibitions";
  contentLayer.append(link);
  wrapper.append(contentLayer);
  return wrapper;
}

function renderCollection(section, cards) {
  const content = section.content || {};
  const wrapper = el("section", "publicSection");
  wrapper.id = "exhibitions";
  const head = el("div", "sectionHead");
  head.append(el("p", "eyebrow", "Exhibitions"), el("h2", "", content.title || "Current exhibitions"), el("p", "", content.description || ""));
  const layout = ["carousel", "grid", "list"].includes(content.layout) ? content.layout : "carousel";
  const grid = el("div", `exhibitionGrid ${layout}`);
  grid.style.setProperty("--visible-cards", String(Math.max(1, Math.min(6, Number(content.visibleCards || 3)))));
  const allowed = content.mode === "manual" && Array.isArray(content.exhibitionIds) ? new Set(content.exhibitionIds.map(String)) : null;
  const visible = allowed ? cards.filter((card) => allowed.has(String(card.id))) : cards;
  for (const card of visible) grid.append(createCard(card));
  if (!visible.length) grid.append(el("p", "", "No published exhibitions are available."));
  wrapper.append(head);
  if (layout === "carousel" && visible.length > 1) {
    const controls = el("div", "carouselControls");
    const previous = el("button", "carouselButton", "←");
    const next = el("button", "carouselButton", "→");
    previous.type = next.type = "button";
    previous.setAttribute("aria-label", "Previous exhibitions");
    next.setAttribute("aria-label", "Next exhibitions");
    previous.addEventListener("click", () => grid.scrollBy({ left: -Math.max(280, grid.clientWidth * .75), behavior: "smooth" }));
    next.addEventListener("click", () => grid.scrollBy({ left: Math.max(280, grid.clientWidth * .75), behavior: "smooth" }));
    controls.append(previous, next);
    wrapper.append(controls);
  }
  wrapper.append(grid);
  return wrapper;
}

function renderContent(section) {
  const content = section.content || {};
  const wrapper = el("section", `publicSection ${section.type === "footer" ? "publicFooter" : ""}`);
  wrapper.id = section.type === "about" ? "about" : section.id;
  const panel = el("div", "contentPanel");
  panel.append(el("h2", "", content.title || content.copyright || section.type), el("p", "", content.description || content.footerNote || ""));
  wrapper.append(panel);
  return wrapper;
}

async function loadPublicData() {
  const [siteResponse, cardsResponse] = await Promise.all([
    supabase.rpc("get_public_site_content"),
    supabase.rpc("list_public_exhibition_cards")
  ]);
  if (siteResponse.error) throw siteResponse.error;
  if (cardsResponse.error) throw cardsResponse.error;
  return { site: siteResponse.data || {}, cards: cardsResponse.data || [] };
}

async function start() {
  try {
    const { site, cards } = await loadPublicData();
    const homepage = normalizeHomepage(site.homepage || createDefaultHomepage());
    const mediaMap = site.media || {};
    const settings = site.settings || {};
    document.getElementById("siteName").textContent = settings.siteName || "Berryboy Art Gallery";
    document.title = settings.siteName || "Berryboy Art Gallery";
    root.replaceChildren();
    for (const section of homepage.sections.filter((item) => item.enabled)) {
      if (section.type === "hero") root.append(renderHero(section, mediaMap));
      else if (section.type === "exhibition_collection") root.append(renderCollection(section, cards));
      else root.append(renderContent(section));
    }
  } catch (error) {
    console.error(error);
    const fallback = createDefaultHomepage();
    root.replaceChildren(renderHero(fallback.sections[0], {}), renderCollection(fallback.sections[1], [{ slug: "berryboy-main", title: "Berryboy Art Gallery", short_description: "Open the main exhibition.", button_label: "Enter gallery", venue_name: "Berryboy Main" }]));
    root.prepend(el("div", "publicError", `Public CMS is not available yet: ${error.message}`));
  }
}
start();
