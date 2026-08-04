import { el, button, statusBadge, field, textInput, selectInput, formValues, jsonTextarea, parseJsonTextarea, formatDate } from "../core/dom.js";
import { pageHead, panel, empty, errorBlock, actionButton } from "./shared.js";
import { slugify } from "../../src/platform/schemas/cms-schemas.js";

const ROLES = ["building", "walls", "floor", "ceiling", "props", "collision", "navigation", "decorations"];

function venueCreateForm(ctx) {
  const form = el("form", { class: "formGrid" });
  const name = textInput("name", "", { required: true });
  const slug = textInput("slug", "", { required: true });
  name.addEventListener("input", () => { if (!slug.dataset.manual) slug.value = slugify(name.value); });
  slug.addEventListener("input", () => { slug.dataset.manual = "1"; });
  form.append(
    field("Nazwa Venue", name),
    field("Slug", slug),
    field("Opis", textInput("description", "", { multiline: true, class: "full" })),
    el("div", { class: "actions full" }, [button("Utwórz Venue", { class: "primary", type: "submit" })])
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formValues(form);
    try {
      const created = await ctx.repos.venues.create(data);
      ctx.shell.toast("Venue zostało utworzone.", "success");
      ctx.router.navigate("venues", created.id || created.venue_id);
    } catch (error) { ctx.shell.toast(error.message, "error"); }
  });
  return form;
}

function createVersionForm(ctx, venue) {
  const form = el("form", { class: "formGrid" });
  const version = textInput("versionNumber", "v1", { required: true });
  form.append(field("Numer wersji", version), el("div", { class: "actions" }, [button("Utwórz wersję", { class: "primary", type: "submit" })]));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await ctx.repos.venues.createVersion(venue.id, version.value);
      ctx.shell.toast("Wersja Venue została utworzona.", "success");
      await renderVenueDetail(ctx, venue.id, result.id || result.venue_version_id);
    } catch (error) { ctx.shell.toast(error.message, "error"); }
  });
  return form;
}

function assetUploadForm(ctx, venue, version, onDone) {
  const form = el("form", { class: "formGrid" });
  const assetId = textInput("assetId", "", { required: true, placeholder: "main-building" });
  const role = selectInput("role", ROLES);
  const file = el("input", { type: "file", name: "file", required: true, attrs: { accept: ".glb,.gltf,application/octet-stream,model/gltf-binary" } });
  form.append(field("Asset ID", assetId), field("Rola", role), field("Plik GLB/GLTF", file), el("div", { class: "actions" }, [button("Wgraj asset", { class: "primary", type: "submit" })]));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await ctx.repos.venues.uploadAsset({ venue, version, assetId: assetId.value, role: role.value, file: file.files[0] });
      ctx.shell.toast("Asset został wgrany i zarejestrowany.", "success");
      form.reset();
      await onDone();
    } catch (error) { ctx.shell.toast(error.message, "error"); }
  });
  return form;
}

async function renderVenueDetail(ctx, venueId, preferredVersionId = null) {
  ctx.shell.setHeader("venues", "Venue", "Site Admin / Venues");
  ctx.shell.loading();
  try {
    const detail = await ctx.repos.venues.get(venueId);
    const venue = detail.venue || detail;
    const versions = Array.isArray(detail.versions) ? detail.versions : [];
    const version = versions.find((item) => item.id === preferredVersionId) || versions.find((item) => item.id === venue.draft_version_id) || versions[0] || null;
    const canEdit = ctx.permissions.canVenue("venue.edit", venue.id);
    const canPublish = ctx.permissions.canVenue("venue.publish", venue.id);

    const topActions = [button("← Lista", { onClick: () => ctx.router.navigate("venues") })];
    if (canEdit) topActions.push(actionButton("Archiwizuj", async () => {
      if (!await ctx.shell.confirmAction("Venue zostanie ukryte i przeniesione do archiwum.", "Archiwizuj")) return;
      await ctx.repos.venues.archive(venue.id);
      ctx.shell.toast("Venue zarchiwizowane.", "success");
      ctx.router.navigate("venues");
    }, { class: "danger" }));

    const infoForm = el("form", { class: "formGrid" });
    infoForm.append(
      field("Nazwa", textInput("name", venue.name, { required: true })),
      field("Slug", textInput("slug", venue.slug, { required: true })),
      field("Opis", textInput("description", venue.description || "", { multiline: true, class: "full" })),
      el("div", { class: "actions full" }, [button("Zapisz dane Venue", { class: "primary", type: "submit", disabled: !canEdit })])
    );
    infoForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await ctx.repos.venues.update(venue.id, formValues(infoForm));
        ctx.shell.toast("Dane Venue zapisane.", "success");
        await renderVenueDetail(ctx, venue.id, version && version.id);
      } catch (error) { ctx.shell.toast(error.message, "error"); }
    });

    const versionCards = versions.length ? el("div", { class: "cardList" }, versions.map((item) =>
      el("article", { class: "entityCard" }, [
        el("div", { class: "metaRow" }, [statusBadge(item.status), formatDate(item.created_at)]),
        el("h3", { text: item.version_number }),
        el("p", { text: `${item.asset_count || 0} assetów` }),
        button("Otwórz wersję", { class: item.id === (version && version.id) ? "primary" : "", onClick: () => renderVenueDetail(ctx, venue.id, item.id) })
      ])
    )) : empty("To Venue nie ma jeszcze wersji.");

    let versionPanel = empty("Utwórz pierwszą wersję Venue.");
    if (version) {
      const manifestArea = jsonTextarea("manifest", version.manifest || {});
      const validation = version.validation_report || {};
      const manifestActions = [
        actionButton("Zapisz manifest", async () => {
          await ctx.repos.venues.saveManifest(version.id, parseJsonTextarea(manifestArea, "Venue Manifest"));
          ctx.shell.toast("Manifest zapisany.", "success");
          await renderVenueDetail(ctx, venue.id, version.id);
        }, { disabled: !canEdit || version.status === "published" }),
        actionButton("Waliduj", async () => {
          const result = await ctx.repos.venues.validateVersion(version.id);
          ctx.shell.toast(result.valid ? "Manifest jest poprawny." : "Manifest wymaga poprawek.", result.valid ? "success" : "error");
          await renderVenueDetail(ctx, venue.id, version.id);
        }, { disabled: !canEdit }),
        actionButton("Test Venue", async () => {
          const url = new URL("../gallery/", location.href);
          url.searchParams.set("venueTestVersionId", version.id);
          url.searchParams.set("returnUrl", `${location.pathname}${location.hash || `#venues/${venue.id}?version=${version.id}`}`);
          window.open(url.href, "_blank", "noopener");
        }),
        actionButton("Opublikuj wersję", async () => {
          await ctx.repos.venues.publishVersion(version.id);
          ctx.shell.toast("Wersja Venue opublikowana.", "success");
          await renderVenueDetail(ctx, venue.id, version.id);
        }, { class: "primary", disabled: !canPublish || version.status === "published" })
      ];
      const assets = Array.isArray(version.assets) ? version.assets : [];
      versionPanel = el("div", { class: "grid" }, [
        panel(`Manifest ${version.version_number}`, el("div", { class: "grid" }, [
          manifestArea,
          validation.errors && validation.errors.length ? el("ul", { class: "validationList error" }, validation.errors.map((message) => el("li", { text: message }))) : null,
          validation.warnings && validation.warnings.length ? el("ul", { class: "validationList warning" }, validation.warnings.map((message) => el("li", { text: message }))) : null
        ]), manifestActions),
        panel("Assety wersji", assets.length ? el("div", { class: "tableWrap" }, [
          el("table", {}, [
            el("thead", {}, el("tr", {}, ["Asset ID", "Rola", "Plik", "Rozmiar"].map((value) => el("th", { text: value })))),
            el("tbody", {}, assets.map((asset) => el("tr", {}, [
              el("td", { text: asset.asset_id }), el("td", {}, statusBadge(asset.role)), el("td", { text: asset.storage_path || asset.public_url || "—" }), el("td", { text: asset.file_size || "—" })
            ])))
          ])
        ]) : empty("Brak assetów.")),
        canEdit && version.status !== "published" ? panel("Wgraj asset", assetUploadForm(ctx, venue, version, () => renderVenueDetail(ctx, venue.id, version.id))) : null
      ]);
    }

    ctx.shell.view.replaceChildren(
      pageHead(venue.name, `${venue.slug} · ${venue.status}`, topActions),
      el("div", { class: "grid twoColumn" }, [
        el("div", { class: "grid" }, [panel("Dane Venue", infoForm), panel("Wersje", versionCards)]),
        panel("Nowa wersja", createVersionForm(ctx, venue))
      ]),
      versionPanel
    );
  } catch (error) {
    ctx.shell.view.replaceChildren(pageHead("Venue", "Szczegóły Venue."), errorBlock(error));
  }
}

export async function renderVenues(ctx, route) {
  if (route.id) return renderVenueDetail(ctx, route.id, route.params.get("version"));
  ctx.shell.setHeader("venues", "Venues");
  ctx.shell.loading();
  try {
    const venues = await ctx.repos.venues.list();
    const canCreate = ctx.permissions.has("venue.create");
    const createAction = canCreate ? button("Dodaj Venue", { class: "primary", onClick: () => ctx.shell.openDialog("Nowe Venue", venueCreateForm(ctx)) }) : null;
    const cards = venues.length ? el("div", { class: "cardList" }, venues.map((venue) =>
      el("article", { class: "entityCard" }, [
        el("div", { class: "metaRow" }, [statusBadge(venue.status), `${venue.version_count || 0} wersji`, `${venue.exhibition_count || 0} wystaw`]),
        el("h3", { text: venue.name }),
        el("p", { text: venue.description || venue.slug }),
        button("Zarządzaj", { onClick: () => ctx.router.navigate("venues", venue.id) })
      ])
    )) : empty("Brak dostępnych Venue.");
    ctx.shell.view.replaceChildren(pageHead("Venues", "Budynki, wersje modeli, manifesty i techniczne ustawienia.", [createAction]), cards);
  } catch (error) {
    ctx.shell.view.replaceChildren(pageHead("Venues", "Budynki platformy."), errorBlock(error));
  }
}
