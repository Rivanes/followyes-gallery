import { el, button, statusBadge, field, textInput, selectInput, formValues, jsonTextarea, parseJsonTextarea, formatDate } from "../core/dom.js";
import { pageHead, panel, empty, errorBlock, actionButton } from "./shared.js";
import { slugify, normalizeExhibitionCard, validateExhibitionCard } from "../../src/platform/schemas/cms-schemas.js";
import { buildEditorUrl } from "../../src/platform/editor-bridge.js";

function createExhibitionForm(ctx, venues) {
  const form = el("form", { class: "formGrid" });
  const title = textInput("title", "", { required: true });
  const slug = textInput("slug", "", { required: true });
  const venue = selectInput("venueId", venues.map((item) => ({ value: item.id, label: item.name })));
  const version = selectInput("venueVersionId", []);
  const updateVersions = () => {
    version.replaceChildren();
    const selected = venues.find((item) => item.id === venue.value);
    const versions = selected && Array.isArray(selected.versions) ? selected.versions : [];
    for (const item of versions) version.append(el("option", { value: item.id, text: `${item.version_number} · ${item.status}` }));
  };
  venue.addEventListener("change", updateVersions);
  title.addEventListener("input", () => { if (!slug.dataset.manual) slug.value = slugify(title.value); });
  slug.addEventListener("input", () => { slug.dataset.manual = "1"; });
  form.append(
    field("Tytuł", title),
    field("Slug", slug),
    field("Venue", venue),
    field("Wersja Venue", version),
    el("div", { class: "actions full" }, [button("Utwórz wystawę", { class: "primary", type: "submit" })])
  );
  updateVersions();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = formValues(form);
      const created = await ctx.repos.exhibitions.create(data);
      ctx.shell.toast("Wystawa została utworzona.", "success");
      ctx.router.navigate("exhibitions", created.id || created.exhibition_id);
    } catch (error) { ctx.shell.toast(error.message, "error"); }
  });
  return form;
}

function duplicateForm(ctx, exhibition) {
  const form = el("form", { class: "formGrid" });
  const title = textInput("title", `${exhibition.title} — copy`, { required: true });
  const slug = textInput("slug", `${exhibition.slug}-copy`, { required: true });
  title.addEventListener("input", () => { if (!slug.dataset.manual) slug.value = slugify(title.value); });
  slug.addEventListener("input", () => { slug.dataset.manual = "1"; });
  form.append(
    field("Nowy tytuł", title),
    field("Nowy slug", slug),
    field("Media", selectInput("mediaMode", [
      { value: "references", label: "Użyj tych samych mediów jako referencji" },
      { value: "independent", label: "Utwórz niezależne kopie plików" }
    ])),
    field("Zakres", selectInput("scope", [
      { value: "all", label: "Treści, branding, oświetlenie i stan 3D" },
      { value: "content", label: "Treści i branding bez rozmieszczenia 3D" }
    ])),
    el("div", { class: "actions full" }, [button("Duplikuj", { class: "primary", type: "submit" })])
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = formValues(form);
      const result = await ctx.repos.exhibitions.duplicate(exhibition.id, {
        ...data,
        copyArtworkData: true,
        copySculptures: data.scope === "all",
        copyLighting: data.scope === "all",
        copyWallSettings: data.scope === "all",
        copyTourOrder: data.scope === "all",
        copyBranding: true,
        copyDescriptions: true,
        copyCustomFocus: data.scope === "all"
      });
      if (result.jobId) await ctx.repos.admin.runJob(result.jobId);
      ctx.shell.toast(data.mediaMode === "independent" ? "Wystawa i niezależne kopie mediów zostały utworzone." : "Wystawa została zduplikowana.", "success");
      ctx.shell.openDialog("Duplikowanie", el("p", { text: result.message || "Operacja została zakończona." }));
    } catch (error) { ctx.shell.toast(error.message, "error"); }
  });
  return form;
}

function detailsForm(ctx, detail) {
  const exhibition = detail.exhibition || detail;
  const form = el("form", { class: "formGrid" });
  form.append(
    field("Tytuł", textInput("title", exhibition.title, { required: true })),
    field("Slug", textInput("slug", exhibition.slug, { required: true })),
    field("Podtytuł", textInput("subtitle", exhibition.subtitle || "")),
    field("Kurator", textInput("curator", exhibition.curator || "")),
    field("Krótki opis", textInput("short_description", exhibition.short_description || "", { multiline: true, class: "full" })),
    field("Pełny opis", textInput("long_description", exhibition.long_description || "", { multiline: true, class: "full" })),
    field("Tekst przycisku", textInput("button_label", exhibition.button_label || "Enter gallery")),
    field("Kolejność", textInput("display_order", exhibition.display_order || 0, { type: "number" })),
    field("Data rozpoczęcia", textInput("start_date", exhibition.start_date ? new Date(exhibition.start_date).toISOString().slice(0,16) : "", { type: "datetime-local" })),
    field("Data zakończenia", textInput("end_date", exhibition.end_date ? new Date(exhibition.end_date).toISOString().slice(0,16) : "", { type: "datetime-local" })),
    el("div", { class: "actions full" }, [button("Zapisz szczegóły", { class: "primary", type: "submit" })])
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formValues(form);
    data.display_order = Number(data.display_order || 0);
    data.start_date = data.start_date ? new Date(data.start_date).toISOString() : null;
    data.end_date = data.end_date ? new Date(data.end_date).toISOString() : null;
    try {
      await ctx.repos.exhibitions.update(exhibition.id, data);
      ctx.shell.toast("Szczegóły wystawy zapisane.", "success");
      await renderExhibitionDetail(ctx, exhibition.id);
    } catch (error) { ctx.shell.toast(error.message, "error"); }
  });
  return form;
}

function mediaOptions(media, current = null) {
  return [{ value: "", label: "— Brak —" }, ...(media || []).map((item) => ({
    value: item.id,
    label: `${item.metadata?.title || item.media_type || "media"} · ${String(item.id).slice(0, 8)}`
  }))];
}

function cardEditor(ctx, detail, media) {
  const exhibition = detail.exhibition || detail;
  const cardRow = detail.card || {};
  const card = normalizeExhibitionCard(cardRow.draft_value || {}, exhibition);
  const form = el("form", { class: "formGrid" });
  form.append(
    field("Tytuł karty", textInput("title", card.title, { required: true })),
    field("Podtytuł", textInput("subtitle", card.subtitle)),
    field("Opis karty", textInput("shortDescription", card.shortDescription, { multiline: true, class: "full" })),
    field("Przycisk", textInput("buttonLabel", card.buttonLabel, { required: true })),
    field("Kurator", textInput("curator", card.curator)),
    field("Cover", selectInput("coverMediaId", mediaOptions(media), card.coverMediaId || "")),
    field("Mobile cover", selectInput("mobileCoverMediaId", mediaOptions(media), card.mobileCoverMediaId || "")),
    field("Logo", selectInput("logoMediaId", mediaOptions(media), card.logoMediaId || "")),
    field("Motyw JSON", jsonTextarea("theme", card.theme || {})),
    el("div", { class: "actions full" }, [button("Zapisz draft karty", { class: "primary", type: "submit" })])
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = formValues(form);
      data.theme = parseJsonTextarea(form.elements.theme, "Theme");
      for (const key of ["coverMediaId", "mobileCoverMediaId", "logoMediaId"]) data[key] = data[key] || null;
      const validation = validateExhibitionCard(data, { exhibition, requireCover: false });
      if (!validation.valid) throw new Error(validation.errors.join("; "));
      await ctx.repos.exhibitions.saveCard(exhibition.id, validation.value, cardRow.draft_revision, cardRow.lock_version);
      ctx.shell.toast("Draft karty zapisany.", "success");
      await renderExhibitionDetail(ctx, exhibition.id);
    } catch (error) { ctx.shell.toast(error.message, "error"); }
  });
  return form;
}

function authorAssignment(ctx, detail, authors) {
  const exhibition = detail.exhibition || detail;
  const current = new Map((detail.authors || []).map((item) => [item.author_id || item.id, item]));
  const form = el("form", { class: "grid" });
  const list = authors.length ? el("div", { class: "grid" }, authors.map((author) => {
    const assigned = current.get(author.id);
    const checkbox = el("input", { type: "checkbox", checked: !!assigned, dataset: { authorId: author.id } });
    const role = textInput(`role-${author.id}`, assigned?.role_label || assigned?.roleLabel || "", { placeholder: "np. Artysta / Kurator" });
    const order = textInput(`order-${author.id}`, assigned?.display_order ?? assigned?.displayOrder ?? 0, { type: "number" });
    return el("article", { class: "entityCard authorAssignment", dataset: { authorId: author.id } }, [
      el("label", { class: "checkRow" }, [checkbox, el("strong", { text: author.name })]),
      el("div", { class: "formGrid" }, [field("Rola", role), field("Kolejność", order)])
    ]);
  })) : empty("Najpierw dodaj autora w sekcji Authors.");
  form.append(list);
  if (authors.length) form.append(el("div", { class: "actions" }, [button("Zapisz autorów", { class: "primary", type: "submit" })]));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const assignments = [...form.querySelectorAll(".authorAssignment")].flatMap((row) => {
        const checked = row.querySelector('input[type="checkbox"]');
        if (!checked.checked) return [];
        const authorId = row.dataset.authorId;
        return [{
          authorId,
          roleLabel: form.elements[`role-${authorId}`].value.trim(),
          displayOrder: Number(form.elements[`order-${authorId}`].value || 0)
        }];
      });
      await ctx.repos.exhibitions.setAuthors(exhibition.id, assignments);
      ctx.shell.toast("Autorzy wystawy zapisani.", "success");
      await renderExhibitionDetail(ctx, exhibition.id);
    } catch (error) { ctx.shell.toast(error.message, "error"); }
  });
  return form;
}

function venueAssignment(ctx, detail) {
  const exhibition = detail.exhibition || detail;
  const venues = Array.isArray(detail.availableVenues) ? detail.availableVenues : [];
  const form = el("form", { class: "formGrid" });
  const venue = selectInput("venueId", venues.map((item) => ({ value: item.id, label: item.name })), exhibition.venue_id);
  const version = selectInput("venueVersionId", []);
  const refresh = () => {
    version.replaceChildren();
    const selected = venues.find((item) => item.id === venue.value);
    for (const item of selected && selected.versions || []) {
      version.append(el("option", { value: item.id, text: `${item.version_number} · ${item.status}`, selected: item.id === detail.state?.draft_venue_version_id }));
    }
  };
  venue.addEventListener("change", refresh);
  refresh();
  form.append(
    field("Venue", venue),
    field("Wersja dla draftu", version),
    el("p", { class: "help full", text: "Zmiana Venue zachowuje treści, ale usuwa rozmieszczenie, Local Lights, Custom Focus i Tour Order. Obiekty otrzymają status wymagający przypisania do anchorów." }),
    el("div", { class: "actions full" }, [button("Zmień Venue", { class: "danger", type: "submit" })])
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!await ctx.shell.confirmAction("Zmiana Venue wyczyści dane przestrzenne draftu. Treści i autorzy zostaną zachowane.", "Zmień Venue")) return;
    try {
      await ctx.repos.exhibitions.assignVenue(exhibition.id, venue.value, version.value);
      ctx.shell.toast("Venue wystawy zostało zmienione.", "success");
      await renderExhibitionDetail(ctx, exhibition.id);
    } catch (error) { ctx.shell.toast(error.message, "error"); }
  });
  return form;
}

async function renderExhibitionDetail(ctx, id) {
  ctx.shell.setHeader("exhibitions", "Exhibition", "Site Admin / Exhibitions");
  ctx.shell.loading();
  try {
    const [detail, media, authors] = await Promise.all([
      ctx.repos.exhibitions.get(id),
      ctx.repos.media.list(),
      ctx.repos.media.listAuthors(false)
    ]);
    const exhibition = detail.exhibition || detail;
    const state = detail.state || {};
    const card = detail.card || {};
    const canEdit = ctx.permissions.canExhibition("exhibition.edit", exhibition);
    const canPublish = ctx.permissions.canExhibition("exhibition.publish", exhibition);
    const validation = detail.validation || await ctx.repos.exhibitions.validate(id);
    const blockers = validation.blockers || [];
    const warnings = validation.warnings || [];

    const editorUrl = buildEditorUrl(exhibition, { locationHref: location.href, returnUrl: `../admin/#/exhibitions/${id}` });
    const actions = [
      button("← Lista", { onClick: () => ctx.router.navigate("exhibitions") }),
      button("Otwórz Edytor 3D", { class: "primary", onClick: () => { location.href = editorUrl; } }),
      canEdit ? button("Duplikuj", { onClick: () => ctx.shell.openDialog("Duplikuj wystawę", duplicateForm(ctx, exhibition)) }) : null,
      canEdit ? actionButton("Archiwizuj", async () => {
        if (!await ctx.shell.confirmAction("Wystawa przestanie być publiczna i trafi do archiwum.", "Archiwizuj")) return;
        await ctx.repos.exhibitions.archive(id);
        ctx.shell.toast("Wystawa zarchiwizowana.", "success");
        ctx.router.navigate("exhibitions");
      }, { class: "danger" }) : null
    ];

    const publishingActions = [
      actionButton("Waliduj ponownie", async () => {
        const result = await ctx.repos.exhibitions.validate(id);
        ctx.shell.toast(result.valid ? "Wystawa gotowa do publikacji." : "Walidacja wykryła blokery.", result.valid ? "success" : "error");
        await renderExhibitionDetail(ctx, id);
      }),
      actionButton("Opublikuj kartę i stan 3D", async () => {
        await ctx.repos.exhibitions.publish(id, {
          draftRevision: state.draft_revision,
          cardRevision: card.draft_revision,
          stateLockVersion: state.lock_version,
          cardLockVersion: card.lock_version
        });
        ctx.shell.toast("Wystawa została opublikowana atomowo.", "success");
        await renderExhibitionDetail(ctx, id);
      }, { class: "primary", disabled: !canPublish || blockers.length > 0 }),
      actionButton("Rollback publikacji", async () => {
        if (!await ctx.shell.confirmAction("Aktualna publikacja zostanie zamieniona z poprzednią.", "Rollback")) return;
        await ctx.repos.exhibitions.rollback(id);
        ctx.shell.toast("Rollback zakończony.", "success");
        await renderExhibitionDetail(ctx, id);
      }, { disabled: !canPublish || !state.previous_state })
    ];

    const scheduleForm = el("form", { class: "formGrid" }, [
      field("Data publikacji", textInput("scheduledAt", exhibition.scheduled_at ? new Date(exhibition.scheduled_at).toISOString().slice(0,16) : "", { type: "datetime-local", required: true })),
      el("div", { class: "actions" }, [button("Zaplanuj", { type: "submit" })])
    ]);
    scheduleForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const date = new Date(scheduleForm.elements.scheduledAt.value);
        await ctx.repos.exhibitions.schedule(id, date.toISOString());
        ctx.shell.toast("Publikacja została zaplanowana.", "success");
        await renderExhibitionDetail(ctx, id);
      } catch (error) { ctx.shell.toast(error.message, "error"); }
    });

    const history = Array.isArray(detail.history) ? detail.history : [];
    ctx.shell.view.replaceChildren(
      pageHead(exhibition.title, `${exhibition.slug} · ${exhibition.status}`, actions),
      el("div", { class: "grid twoColumn" }, [
        el("div", { class: "grid" }, [
          panel("Details", detailsForm(ctx, detail)),
          panel("Card & Branding", cardEditor(ctx, detail, media)),
          panel("Authors", authorAssignment(ctx, detail, authors)),
          panel("Venue Assignment", venueAssignment(ctx, detail))
        ]),
        el("div", { class: "grid" }, [
          panel("Publishing", el("div", { class: "grid" }, [
            el("div", { class: "metaRow" }, [statusBadge(exhibition.status), `Draft state r${state.draft_revision || 0}`, `Card r${card.draft_revision || 0}`]),
            blockers.length ? el("ul", { class: "validationList error" }, blockers.map((item) => el("li", { text: item.message || item }))) : el("p", { class: "help", text: "Brak blockerów publikacji." }),
            warnings.length ? el("ul", { class: "validationList warning" }, warnings.map((item) => el("li", { text: item.message || item }))) : null,
            el("div", { class: "actions" }, publishingActions),
            scheduleForm
          ])),
          panel("3D Editor", el("div", { class: "grid" }, [
            el("p", { class: "help", text: "Edytor otrzyma exhibitionId, Venue Version, kanał draft oraz adres powrotu do CMS." }),
            el("a", { class: "button primary", href: editorUrl, text: "OPEN 3D EDITOR" })
          ])),
          panel("History", history.length ? el("div", { class: "grid" }, history.map((item) => el("article", { class: "entityCard" }, [
            el("strong", { text: item.action }),
            el("p", { text: item.details && item.details.message || "" }),
            el("span", { class: "help", text: formatDate(item.created_at) })
          ]))) : empty("Brak historii."))
        ])
      ])
    );
  } catch (error) {
    ctx.shell.view.replaceChildren(pageHead("Exhibition", "Szczegóły wystawy."), errorBlock(error));
  }
}

export async function renderExhibitions(ctx, route) {
  if (route.id) return renderExhibitionDetail(ctx, route.id);
  ctx.shell.setHeader("exhibitions", "Exhibitions");
  ctx.shell.loading();
  try {
    const [exhibitions, venues] = await Promise.all([
      ctx.repos.exhibitions.list(),
      ctx.repos.venues.list()
    ]);
    const canCreate = ctx.permissions.has("exhibition.create");
    const create = canCreate ? button("Dodaj wystawę", { class: "primary", onClick: () => ctx.shell.openDialog("Nowa wystawa", createExhibitionForm(ctx, venues)) }) : null;
    const cards = exhibitions.length ? el("div", { class: "cardList" }, exhibitions.map((item) =>
      el("article", { class: "entityCard" }, [
        el("div", { class: "metaRow" }, [statusBadge(item.status), item.venue_name || "Brak Venue", `r${item.draft_revision || 0}`]),
        el("h3", { text: item.title }),
        el("p", { text: item.short_description || item.slug }),
        button("Zarządzaj", { onClick: () => ctx.router.navigate("exhibitions", item.id) })
      ])
    )) : empty("Brak dostępnych wystaw.");
    ctx.shell.view.replaceChildren(pageHead("Exhibitions", "Karty, Venue Assignment, Edytor 3D, publikowanie i historia.", [create]), cards);
  } catch (error) {
    ctx.shell.view.replaceChildren(pageHead("Exhibitions", "Wystawy platformy."), errorBlock(error));
  }
}
