import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, PLATFORM_MEDIA_BUCKET } from "../platform/supabase-config.js";
import { createDefaultHomepage, normalizeHomepage, normalizeSiteSettings } from "../platform/schemas/cms-schemas.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const root = document.getElementById("publicSite");
const template = document.getElementById("exhibitionCardTemplate");
const signedUrlCache = new Map();

function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = String(text); return node; }
function value(...items) { return items.find((item) => item != null && String(item).trim() !== "") ?? ""; }
function safeUrl(url, fallback = "") { const text = String(url || "").trim(); if (!text) return fallback; if (/^(https?:|mailto:|tel:|#|\.\/|\/)/i.test(text)) return text; return fallback; }
function mediaRecord(map, id) { return id ? map[String(id)] || null : null; }

async function resolveMediaUrl(input, preferred = "desktop") {
  if (!input) return "";
  if (typeof input === "string") {
    if (/^https?:\/\//i.test(input)) return input;
    input = { path: input };
  }
  const direct = value(input[`${preferred}Url`], input.url, input.publicUrl, input.signedUrl);
  if (direct) return direct;
  const path = value(input[`${preferred}Path`], input.path, input.originalPath, input.original_path);
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const bucket = value(input.bucket, input.storageBucket, input.storage_bucket, PLATFORM_MEDIA_BUCKET);
  const cacheKey = `${bucket}:${path}`;
  if (signedUrlCache.has(cacheKey)) return signedUrlCache.get(cacheKey);
  const response = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (response.error) throw response.error;
  const url = response.data?.signedUrl || "";
  signedUrlCache.set(cacheKey, url);
  return url;
}

function formatRange(start, end) {
  if (!start && !end) return "";
  const formatter = new Intl.DateTimeFormat(document.documentElement.lang || "pl", { dateStyle: "medium" });
  const a = start ? formatter.format(new Date(start)) : ""; const b = end ? formatter.format(new Date(end)) : "";
  return a && b ? `${a} — ${b}` : a || b;
}
function linkButton(label, url, className = "primaryLink") { const link = el("a", className, label); link.href = safeUrl(url, "#"); return link; }

async function createCard(record) {
  const fragment = template.content.cloneNode(true);
  const article = fragment.querySelector("article");
  const picture = fragment.querySelector("picture");
  const source = fragment.querySelector("source");
  const image = fragment.querySelector("img");
  const logo = fragment.querySelector(".cardLogo");
  const status = fragment.querySelector(".cardStatus");
  const title = fragment.querySelector("h3");
  const subtitle = fragment.querySelector(".cardSubtitle");
  const venue = fragment.querySelector(".cardVenue");
  const description = fragment.querySelector(".cardDescription");
  const meta = fragment.querySelector(".cardMeta");
  const link = fragment.querySelector(".cardButton");
  title.textContent = record.title || record.slug;
  subtitle.textContent = record.subtitle || ""; subtitle.hidden = !record.subtitle;
  venue.textContent = [record.venue_name || record.venueName, record.location].filter(Boolean).join(" · ") || "Virtual venue";
  description.textContent = record.short_description || record.shortDescription || "";
  meta.textContent = [record.curator, formatRange(record.start_date || record.startDate, record.end_date || record.endDate)].filter(Boolean).join(" · ");
  status.textContent = record.status_label || record.statusLabel || record.status || "Published";
  link.textContent = record.button_label || record.buttonLabel || "Enter gallery";
  link.href = `./gallery/?exhibition=${encodeURIComponent(record.slug)}`;
  image.alt = record.cover_alt_text || record.coverAltText || record.title || "Exhibition cover";
  const desktopInput = record.cover_media || record.coverMedia || record.cover_url || record.cover_path;
  const mobileInput = record.mobile_cover_media || record.mobileCoverMedia || record.mobile_cover_url || record.mobile_cover_path || desktopInput;
  const logoInput = record.logo_media || record.logoMedia || record.logo_url || record.logo_path;
  const [desktopUrl, mobileUrl, logoUrl] = await Promise.all([resolveMediaUrl(desktopInput, "desktop"), resolveMediaUrl(mobileInput, "mobile"), resolveMediaUrl(logoInput, "original")]);
  if (desktopUrl) { image.src = desktopUrl; image.classList.add("hasImage"); picture.hidden = false; }
  if (mobileUrl) source.srcset = mobileUrl;
  const focalX = Number(record.cover_focal_x ?? record.coverFocalPoint?.x ?? 50); const focalY = Number(record.cover_focal_y ?? record.coverFocalPoint?.y ?? 50);
  image.style.objectPosition = `${Math.max(0, Math.min(100, focalX))}% ${Math.max(0, Math.min(100, focalY))}%`;
  if (logoUrl) { logo.src = logoUrl; logo.alt = `${record.title || "Exhibition"} logo`; logo.hidden = false; }
  const theme = record.theme || {};
  if (theme.accent) article.style.setProperty("--card-accent", theme.accent);
  if (theme.background) article.style.setProperty("--card-background", theme.background);
  if (theme.text) article.style.setProperty("--card-text", theme.text);
  if (theme.cardStyle) article.dataset.style = theme.cardStyle;
  return fragment;
}

async function renderHero(section, mediaMap) {
  const content = section.content || {}; const wrapper = el("section", `publicSection heroSection align-${content.alignment || "left"}`);
  const desktop = mediaRecord(mediaMap, content.desktopMediaId); const mobile = mediaRecord(mediaMap, content.mobileMediaId) || desktop; const videoMedia = mediaRecord(mediaMap, content.videoMediaId);
  const [desktopUrl, mobileUrl, videoUrl, logoUrl] = await Promise.all([
    resolveMediaUrl(desktop, "desktop"), resolveMediaUrl(mobile, "mobile"), resolveMediaUrl(videoMedia, "original"), resolveMediaUrl(mediaRecord(mediaMap, content.logoMediaId), "original")
  ]);
  if (videoUrl) { const video = el("video", "heroMedia"); Object.assign(video, { src: videoUrl, autoplay: true, muted: true, loop: true, playsInline: true }); wrapper.append(video); wrapper.classList.add("hasHeroMedia"); }
  else if (desktopUrl) { const picture = el("picture", "heroPicture"); const source = el("source"); source.media = "(max-width: 700px)"; source.srcset = mobileUrl || desktopUrl; const image = el("img", "heroMedia"); image.src = desktopUrl; image.alt = ""; picture.append(source, image); wrapper.append(picture); wrapper.classList.add("hasHeroMedia"); }
  const layer = el("div", "heroContent");
  if (logoUrl) { const logo = el("img", "heroLogo"); logo.src = logoUrl; logo.alt = content.eyebrow || "Logo"; layer.append(logo); }
  layer.append(el("p", "eyebrow", content.eyebrow), el("h1", "", content.title), el("p", "heroSubtitle", content.subtitle), el("p", "heroDescription", content.description));
  const actions = el("div", "heroActions");
  if (content.primaryLabel) actions.append(linkButton(content.primaryLabel, content.primaryUrl || "#exhibitions"));
  if (content.secondaryLabel) actions.append(linkButton(content.secondaryLabel, content.secondaryUrl, "secondaryLink"));
  if (actions.childElementCount) layer.append(actions);
  wrapper.append(layer);
  const theme = content.theme || {}; if (theme.accent) wrapper.style.setProperty("--accent", theme.accent); if (theme.background) wrapper.style.backgroundColor = theme.background;
  return wrapper;
}

async function renderCollection(section, cards) {
  const content = section.content || {}; const wrapper = el("section", "publicSection"); wrapper.id = "exhibitions";
  const head = el("div", "sectionHead"); head.append(el("p", "eyebrow", "Exhibitions"), el("h2", "", content.title || "Current exhibitions"), el("p", "", content.description || ""));
  const layout = ["carousel","grid","list"].includes(content.layout) ? content.layout : "carousel"; const grid = el("div", `exhibitionGrid ${layout}`); grid.dataset.mobileLayout = content.mobileLayout || "carousel";
  grid.style.setProperty("--visible-cards", String(Math.max(1, Math.min(8, Number(content.visibleCards || 3)))));
  const allowed = content.mode === "manual" && Array.isArray(content.exhibitionIds) ? new Set(content.exhibitionIds.map(String)) : null;
  const statusFilter = Array.isArray(content.statusFilter) && content.statusFilter.length ? new Set(content.statusFilter.map(String)) : null;
  const visible = cards.filter((card) => (!allowed || allowed.has(String(card.id))) && (!statusFilter || statusFilter.has(String(card.status))));
  const fragments = await Promise.all(visible.map(createCard)); fragments.forEach((fragment) => grid.append(fragment));
  if (!visible.length) grid.append(el("p", "emptyPublic", "No published exhibitions are available."));
  wrapper.append(head);
  if (layout === "carousel" && visible.length > 1) { const controls = el("div", "carouselControls"); const previous = el("button", "carouselButton", "←"); const next = el("button", "carouselButton", "→"); previous.type = next.type = "button"; previous.ariaLabel = "Previous exhibitions"; next.ariaLabel = "Next exhibitions"; previous.onclick = () => grid.scrollBy({ left: -Math.max(280, grid.clientWidth * .75), behavior: "smooth" }); next.onclick = () => grid.scrollBy({ left: Math.max(280, grid.clientWidth * .75), behavior: "smooth" }); controls.append(previous,next); wrapper.append(controls); }
  wrapper.append(grid); return wrapper;
}

async function renderAbout(section, mediaMap) {
  const content = section.content || {}; const wrapper = el("section", "publicSection aboutSection"); wrapper.id = "about"; const panel = el("div", "contentPanel aboutPanel"); const copy = el("div", "aboutCopy"); copy.append(el("h2", "", content.title), el("p", "", content.description)); if (content.ctaLabel) copy.append(linkButton(content.ctaLabel, content.ctaUrl, "secondaryLink")); panel.append(copy);
  const urls = await Promise.all((content.imageMediaIds || []).map((id) => resolveMediaUrl(mediaRecord(mediaMap,id), "desktop"))); const gallery = el("div", "aboutGallery"); urls.filter(Boolean).forEach((url,index)=>{ const image=el("img"); image.src=url; image.alt=`${content.title || "About"} ${index+1}`; gallery.append(image); }); if (gallery.childElementCount) panel.append(gallery); wrapper.append(panel); return wrapper;
}
async function renderPartners(section, mediaMap) {
  const content = section.content || {}; const wrapper = el("section", "publicSection partnersSection"); const head=el("div","sectionHead"); head.append(el("h2","",content.title),el("p","",content.description)); const grid=el("div","partnersGrid");
  for (const item of content.items || []) { const link=el(item.url?"a":"article","partnerCard"); if(item.url) link.href=safeUrl(item.url,"#"); const url=await resolveMediaUrl(mediaRecord(mediaMap,item.logoMediaId),"original"); if(url){const img=el("img");img.src=url;img.alt=item.altText||item.name;link.append(img);} link.append(el("span","",item.name));grid.append(link); }
  wrapper.append(head,grid); return wrapper;
}
function renderContact(section) { const c=section.content||{}; const wrapper=el("section","publicSection contactSection"); wrapper.id="contact"; const panel=el("div","contentPanel contactPanel"); panel.append(el("h2","",c.title),el("p","",c.description)); const list=el("div","contactList"); if(c.address)list.append(el("address","",c.address)); if(c.email)list.append(linkButton(c.email,`mailto:${c.email}`,"contactLink")); if(c.phone)list.append(linkButton(c.phone,`tel:${c.phone.replace(/\s+/g,"")}`,"contactLink")); if(c.hours)list.append(el("p","",c.hours)); if(c.mapUrl)list.append(linkButton("Mapa",c.mapUrl,"secondaryLink")); const socials=el("div","socialLinks"); (c.socialLinks||[]).forEach(item=>socials.append(linkButton(item.label||item.platform,item.url,"socialLink"))); panel.append(list,socials); wrapper.append(panel); return wrapper; }
async function renderFooter(section, mediaMap, settings) { const c=section.content||{}; const footer=el("footer","publicSection publicFooter"); const logoUrl=await resolveMediaUrl(mediaRecord(mediaMap,c.logoMediaId),"original"); const top=el("div","footerTop"); if(logoUrl){const img=el("img","footerLogo");img.src=logoUrl;img.alt=settings.siteName||"Logo";top.append(img);} top.append(el("p","",c.text||settings.footerNote||"")); footer.append(top); const columns=el("div","footerColumns"); (c.columns||[]).forEach(column=>{const block=el("div","footerColumn");block.append(el("strong","",column.title));(column.links||[]).forEach(item=>block.append(linkButton(item.label,item.url,"footerLink")));columns.append(block);}); if(columns.childElementCount)footer.append(columns); const links=el("div","footerLinks"); [...(c.links||[]),...(settings.legalLinks||[])].forEach(item=>links.append(linkButton(item.label,item.url,"footerLink"))); [...(c.socialLinks||[]),...(settings.socialLinks||[])].forEach(item=>links.append(linkButton(item.label||item.platform,item.url,"footerLink"))); footer.append(links,el("small","",c.copyright||`© ${new Date().getFullYear()} ${settings.siteName}`)); return footer; }

async function loadPublicData() { const [siteResponse,cardsResponse]=await Promise.all([supabase.rpc("get_public_site_content"),supabase.rpc("list_public_exhibition_cards")]); if(siteResponse.error)throw siteResponse.error;if(cardsResponse.error)throw cardsResponse.error;return{site:siteResponse.data||{},cards:cardsResponse.data||[]}; }
async function start() {
  try {
    const {site,cards}=await loadPublicData(); const homepage=normalizeHomepage(site.homepage||createDefaultHomepage()); const mediaMap=site.media||{}; const settings=normalizeSiteSettings(site.settings||{});
    document.documentElement.lang=settings.defaultLocale||"pl"; document.getElementById("siteName").textContent=settings.siteName; document.title=settings.siteName; root.replaceChildren();
    for(const section of homepage.sections.filter(item=>item.enabled)){ if(section.type==="hero")root.append(await renderHero(section,mediaMap)); else if(section.type==="exhibition_collection")root.append(await renderCollection(section,cards)); else if(section.type==="about")root.append(await renderAbout(section,mediaMap)); else if(section.type==="partners")root.append(await renderPartners(section,mediaMap)); else if(section.type==="contact")root.append(renderContact(section)); else if(section.type==="footer")root.append(await renderFooter(section,mediaMap,settings)); }
  } catch(error) { console.error(error); root.replaceChildren(el("section","publicError",`Nie udało się pobrać opublikowanej strony. ${error.message}`)); }
}
start();
