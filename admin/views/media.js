import { el, button, field, textInput, selectInput, statusBadge, formatDate } from "../core/dom.js";
import { pageHead, panel, empty, errorBlock, actionButton } from "./shared.js";

function uploadForm(ctx, onDone) {
  const form = el("form", { class: "formGrid" });
  const file = el("input", { type: "file", name: "file", required: true });
  const type = selectInput("mediaType", ["image", "video", "document", "model", "logo", "cover", "asset"]);
  form.append(field("Plik", file), field("Typ", type), el("div", { class: "actions full" }, [button("Wgraj do Media Library", { class: "primary", type: "submit" })]));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await ctx.repos.media.uploadSharedLibraryFile(file.files[0], type.value);
      ctx.shell.toast("Medium zostało dodane.", "success");
      form.reset();
      await onDone();
    } catch (error) { ctx.shell.toast(error.message, "error"); }
  });
  return form;
}

export async function renderMedia(ctx) {
  ctx.shell.setHeader("media", "Media Library");
  ctx.shell.loading();
  try {
    const media = await ctx.repos.media.list();
    const canUpload = ctx.permissions.has("media.upload");
    const rows = media.length ? el("div", { class: "tableWrap" }, [
      el("table", {}, [
        el("thead", {}, el("tr", {}, ["Typ", "Właściciel", "Ścieżka", "Użycia", "Status", "Dodano", "Akcje"].map((value) => el("th", { text: value })))),
        el("tbody", {}, media.map((item) => el("tr", {}, [
          el("td", { text: item.media_type }),
          el("td", { text: `${item.owner_type}${item.owner_id ? ` / ${item.owner_id}` : ""}` }),
          el("td", { text: item.preview_avif_path || item.original_path || "—" }),
          el("td", { text: item.usage_count || 0 }),
          el("td", {}, statusBadge(item.deleted_at ? "archived" : item.processing_status || "ready")),
          el("td", { text: formatDate(item.created_at) }),
          el("td", {}, item.deleted_at
            ? actionButton("Przywróć", async () => { await ctx.repos.media.restore(item.id); ctx.shell.toast("Medium przywrócone.", "success"); await renderMedia(ctx); }, { class: "small" })
            : actionButton("Archiwizuj", async () => { await ctx.repos.media.archive(item.id); ctx.shell.toast("Medium zarchiwizowane.", "success"); await renderMedia(ctx); }, { class: "small danger", disabled: !ctx.permissions.has("media.delete") }))
        ])))
      ])
    ]) : empty("Media Library jest pusta.");
    const sections = [pageHead("Media Library", "Współdzielone media, warianty, użycia i bezpieczny lifecycle.")];
    if (canUpload) sections.push(panel("Dodaj medium", uploadForm(ctx, () => renderMedia(ctx))));
    sections.push(panel("Biblioteka", rows));
    ctx.shell.view.replaceChildren(...sections);
  } catch (error) {
    ctx.shell.view.replaceChildren(pageHead("Media Library", "Media platformy."), errorBlock(error));
  }
}
