import { el, button, field, textInput, selectInput, jsonTextarea, parseJsonTextarea } from "../core/dom.js";
import { pageHead, panel, errorBlock, actionButton } from "./shared.js";
import {
  createDefaultHomepage,
  createDefaultSiteSettings,
  normalizeHomepage,
  validateHomepage
} from "../../src/platform/schemas/cms-schemas.js";

const SECTION_LABELS = Object.freeze({
  hero: "Hero",
  exhibition_collection: "Lista / karuzela wystaw",
  about: "O galerii",
  partners: "Partnerzy",
  contact: "Kontakt",
  footer: "Stopka"
});

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function setContent(section, key, value) {
  section.content = section.content && typeof section.content === "object" ? section.content : {};
  section.content[key] = value;
}

function inputRow(label, value, onInput, options = {}) {
  const input = textInput(options.name || "field", value ?? "", { multiline: options.multiline, type: options.type || "text", class: options.full ? "full" : "" });
  input.addEventListener("input", () => onInput(options.type === "number" ? Number(input.value || 0) : input.value));
  return field(label, input);
}

function sectionFields(section, refresh, media = []) {
  const content = section.content || {};
  const fields = [];
  if (section.type === "hero") {
    fields.push(
      inputRow("Nadtytuł", content.eyebrow, (value) => setContent(section, "eyebrow", value)),
      inputRow("Tytuł", content.title, (value) => setContent(section, "title", value)),
      inputRow("Opis", content.description, (value) => setContent(section, "description", value), { multiline: true, full: true }),
      inputRow("Tekst przycisku", content.primaryLabel, (value) => setContent(section, "primaryLabel", value)),
      (() => {
        const choices = [{ value: "", label: "Bez tła" }, ...media.map((item) => ({ value: item.id, label: `${item.metadata?.title || item.original_path || item.id} · ${item.media_type}` }))];
        const select = selectInput("backgroundMediaId", choices, content.backgroundMediaId || "");
        select.addEventListener("change", () => setContent(section, "backgroundMediaId", select.value || null));
        return field("Obraz / film tła z Media Library", select);
      })()
    );
  } else if (section.type === "exhibition_collection") {
    const mode = selectInput("collectionMode", [
      { value: "automatic", label: "Automatycznie: wszystkie opublikowane" },
      { value: "manual", label: "Ręcznie: wybrane exhibitionIds" }
    ], content.mode || "automatic");
    mode.addEventListener("change", () => { setContent(section, "mode", mode.value); refresh(); });
    const layout = selectInput("collectionLayout", [
      { value: "carousel", label: "Karuzela" },
      { value: "grid", label: "Siatka" },
      { value: "list", label: "Lista" }
    ], content.layout || "carousel");
    layout.addEventListener("change", () => setContent(section, "layout", layout.value));
    fields.push(
      inputRow("Nagłówek", content.title, (value) => setContent(section, "title", value)),
      inputRow("Opis sekcji", content.description, (value) => setContent(section, "description", value), { multiline: true, full: true }),
      field("Sposób wyboru", mode),
      field("Układ", layout),
      inputRow("Widoczne karty", content.visibleCards || 3, (value) => setContent(section, "visibleCards", Math.max(1, Math.min(6, value))), { type: "number" })
    );
    if ((content.mode || "automatic") === "manual") {
      fields.push(inputRow("Exhibition IDs, po jednym w wierszu", (content.exhibitionIds || []).join("\n"), (value) => {
        setContent(section, "exhibitionIds", String(value).split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean));
      }, { multiline: true, full: true }));
    }
  } else if (section.type === "partners") {
    fields.push(
      inputRow("Tytuł", content.title, (value) => setContent(section, "title", value)),
      inputRow("Opis", content.description, (value) => setContent(section, "description", value), { multiline: true, full: true }),
      inputRow("Partnerzy JSON", JSON.stringify(content.items || [], null, 2), (value) => {
        try { setContent(section, "items", JSON.parse(value || "[]")); } catch (_) {}
      }, { multiline: true, full: true })
    );
  } else if (section.type === "contact") {
    fields.push(
      inputRow("Tytuł", content.title, (value) => setContent(section, "title", value)),
      inputRow("Opis", content.description, (value) => setContent(section, "description", value), { multiline: true, full: true }),
      inputRow("E-mail", content.email, (value) => setContent(section, "email", value), { type: "email" }),
      inputRow("Telefon", content.phone, (value) => setContent(section, "phone", value))
    );
  } else if (section.type === "footer") {
    fields.push(
      inputRow("Copyright", content.copyright, (value) => setContent(section, "copyright", value)),
      inputRow("Opis stopki", content.description || content.footerNote, (value) => setContent(section, "description", value), { multiline: true, full: true }),
      inputRow("Linki JSON", JSON.stringify(content.links || [], null, 2), (value) => {
        try { setContent(section, "links", JSON.parse(value || "[]")); } catch (_) {}
      }, { multiline: true, full: true })
    );
  } else {
    fields.push(
      inputRow("Tytuł", content.title, (value) => setContent(section, "title", value)),
      inputRow("Opis", content.description, (value) => setContent(section, "description", value), { multiline: true, full: true })
    );
  }
  return fields;
}

function sectionEditor(state, section, index, refresh, media) {
  const enabled = el("input", { type: "checkbox", checked: section.enabled !== false });
  enabled.addEventListener("change", () => { section.enabled = enabled.checked; });
  const order = textInput("displayOrder", section.displayOrder || (index + 1) * 10, { type: "number" });
  order.addEventListener("input", () => { section.displayOrder = Number(order.value || 0); });
  const actions = [
    button("↑", { class: "small", disabled: index === 0, onClick: () => { [state.sections[index - 1], state.sections[index]] = [state.sections[index], state.sections[index - 1]]; refresh(); } }),
    button("↓", { class: "small", disabled: index === state.sections.length - 1, onClick: () => { [state.sections[index + 1], state.sections[index]] = [state.sections[index], state.sections[index + 1]]; refresh(); } })
  ];
  if (!["hero", "exhibition_collection"].includes(section.type)) {
    actions.push(button("Usuń", { class: "small danger", onClick: () => { state.sections.splice(index, 1); refresh(); } }));
  }
  return el("article", { class: "entityCard sectionEditor" }, [
    el("div", { class: "panelHeader" }, [
      el("div", {}, [el("strong", { text: SECTION_LABELS[section.type] || section.type }), el("div", { class: "help", text: section.id })]),
      el("div", { class: "actions" }, actions)
    ]),
    el("div", { class: "formGrid" }, [
      field("Widoczna", el("label", { class: "toggleField" }, [enabled, " Włączona"])),
      field("Kolejność", order),
      ...sectionFields(section, refresh, media)
    ])
  ]);
}

function defaultSection(type, index) {
  const defaults = {
    about: { title: "O galerii", description: "" },
    partners: { title: "Partnerzy", description: "", items: [] },
    contact: { title: "Kontakt", description: "", email: "", phone: "" },
    footer: { copyright: "Berryboy Art Gallery", description: "", links: [] }
  };
  return { id: `${type}-${Date.now()}`, type, enabled: true, displayOrder: (index + 1) * 10, content: defaults[type] || {} };
}

function homepageEditor(value, media = []) {
  const state = clone(normalizeHomepage(value));
  const root = el("div", { class: "grid" });
  const list = el("div", { class: "grid" });
  const refresh = () => {
    list.replaceChildren(...state.sections.map((section, index) => sectionEditor(state, section, index, refresh, media)));
  };
  const addType = selectInput("sectionType", ["about", "partners", "contact", "footer"].map((type) => ({ value: type, label: SECTION_LABELS[type] })));
  const add = button("Dodaj sekcję", { onClick: () => { state.sections.push(defaultSection(addType.value, state.sections.length)); refresh(); } });
  const advanced = el("details", { class: "advancedEditor" }, [
    el("summary", { text: "Zaawansowany JSON / import" }),
    el("p", { class: "help", text: "To jest awaryjna ścieżka importu. Główna edycja odbywa się przez kontrolowane pola powyżej." }),
    (() => {
      const area = jsonTextarea("advancedHomepage", state);
      const apply = button("Zastosuj JSON", { onClick: () => {
        const parsed = normalizeHomepage(parseJsonTextarea(area, "Homepage JSON"));
        state.sections.splice(0, state.sections.length, ...parsed.sections);
        refresh();
      }});
      const sync = button("Odśwież JSON z formularza", { onClick: () => { area.value = JSON.stringify(normalizeHomepage(state), null, 2); } });
      return el("div", { class: "grid" }, [area, el("div", { class: "actions" }, [apply, sync])]);
    })()
  ]);
  root.append(list, el("div", { class: "actions" }, [addType, add]), advanced);
  refresh();
  return { node: root, getValue: () => normalizeHomepage(state) };
}

function settingsEditor(value) {
  const state = Object.assign(createDefaultSiteSettings(), clone(value || {}));
  const form = el("div", { class: "formGrid" });
  const bind = (label, key, options = {}) => {
    form.append(inputRow(label, state[key], (input) => { state[key] = input; }, options));
  };
  bind("Nazwa strony", "siteName");
  const locale = selectInput("defaultLocale", ["pl", "en"], state.defaultLocale || "pl");
  locale.addEventListener("change", () => { state.defaultLocale = locale.value; });
  form.append(field("Domyślny język", locale));
  bind("E-mail kontaktowy", "contactEmail", { type: "email" });
  bind("Notatka w stopce", "footerNote", { multiline: true, full: true });
  bind("Social media JSON", "socialLinks", { multiline: true, full: true });
  const originalHandler = form.lastElementChild.querySelector("textarea");
  originalHandler.value = JSON.stringify(state.socialLinks || [], null, 2);
  originalHandler.replaceWith((() => {
    const area = textInput("socialLinks", JSON.stringify(state.socialLinks || [], null, 2), { multiline: true, class: "full" });
    area.addEventListener("input", () => { try { state.socialLinks = JSON.parse(area.value || "[]"); } catch (_) {} });
    return area;
  })());
  return { node: form, getValue: () => ({ ...state, schema: "berryboy-site-settings.v1", schemaVersion: 1 }) };
}

function previewHomepage(value) {
  const homepage = normalizeHomepage(value);
  return el("div", { class: "grid" }, homepage.sections.filter((section) => section.enabled).map((section) =>
    el("article", { class: "entityCard" }, [
      el("div", { class: "metaRow", text: `${section.displayOrder} · ${SECTION_LABELS[section.type] || section.type}` }),
      el("h3", { text: section.content.title || section.content.copyright || section.id }),
      el("p", { text: section.content.description || "" })
    ])
  ));
}

export async function renderHomepage(ctx, route, key = "homepage") {
  ctx.shell.setHeader(key === "homepage" ? "homepage" : "settings", key === "homepage" ? "Homepage" : "Site Settings");
  ctx.shell.loading();
  try {
    const [recordValue, media] = await Promise.all([
      ctx.repos.site.getEditor(key),
      key === "homepage" ? ctx.repos.media.list({ ownerType: "platform" }) : Promise.resolve([])
    ]);
    const record = recordValue || {};
    const fallback = key === "homepage" ? createDefaultHomepage() : createDefaultSiteSettings();
    const value = record.draft_value || record.published_value || fallback;
    const editor = key === "homepage" ? homepageEditor(value, media) : settingsEditor(value);
    const validationRoot = el("div");

    const validate = () => {
      try {
        const current = editor.getValue();
        const validation = key === "homepage" ? validateHomepage(current) : { valid: true, errors: [], value: current };
        validationRoot.replaceChildren(validation.valid
          ? el("p", { class: "help", text: "Draft jest poprawny." })
          : el("ul", { class: "validationList error" }, validation.errors.map((item) => el("li", { text: item }))));
        return validation;
      } catch (error) {
        validationRoot.replaceChildren(el("p", { class: "formError", text: error.message }));
        return { valid: false, errors: [error.message] };
      }
    };
    validate();

    const actions = [
      actionButton("Podgląd draftu", async () => {
        const validation = validate();
        if (validation.valid) ctx.shell.openDialog("Podgląd", previewHomepage(validation.value));
      }),
      actionButton("Zapisz draft", async () => {
        const validation = validate();
        if (!validation.valid) throw new Error(validation.errors.join("; "));
        await ctx.repos.site.saveDraft(key, validation.value, record.draft_revision, record.lock_version);
        ctx.shell.toast("Draft zapisany.", "success");
        await renderHomepage(ctx, route, key);
      }, { class: "primary", disabled: !ctx.permissions.has("site.edit") }),
      actionButton("Opublikuj", async () => {
        const validation = validate();
        if (!validation.valid) throw new Error(validation.errors.join("; "));
        await ctx.repos.site.publish(key, record.draft_revision, record.lock_version);
        ctx.shell.toast("Treść została opublikowana atomowo.", "success");
        await renderHomepage(ctx, route, key);
      }, { disabled: !ctx.permissions.has("site.publish") }),
      actionButton("Rollback", async () => {
        await ctx.repos.site.rollback(key);
        ctx.shell.toast("Przywrócono poprzednią publikację.", "success");
        await renderHomepage(ctx, route, key);
      }, { disabled: !ctx.permissions.has("site.publish") || !record.previous_value })
    ];

    ctx.shell.view.replaceChildren(
      pageHead(key === "homepage" ? "Homepage" : "Site Settings", key === "homepage" ? "Kontrolowane sekcje strony, dynamiczna kolekcja wystaw i publikacja." : "Globalne ustawienia platformy."),
      panel(key === "homepage" ? "Sekcje strony" : "Ustawienia", el("div", { class: "grid" }, [editor.node, validationRoot]), actions),
      panel("Stan wersji", el("div", { class: "metaRow" }, [
        `Draft r${record.draft_revision || 0}`,
        `Published r${record.published_revision || 0}`,
        `Previous r${record.previous_revision || 0}`,
        `Lock ${record.lock_version || 0}`
      ]))
    );
  } catch (error) {
    ctx.shell.view.replaceChildren(pageHead("Homepage", "Treść strony publicznej."), errorBlock(error));
  }
}

export function renderSettings(ctx, route) {
  return renderHomepage(ctx, route, "site-settings");
}
