import { el, button, field, textInput, selectInput, formValues, statusBadge } from "../core/dom.js";
import { pageHead, panel, empty, errorBlock, actionButton } from "./shared.js";
import { slugify } from "../../src/platform/schemas/cms-schemas.js";

function authorForm(ctx, media, author = null, onDone) {
  const form = el("form", { class: "formGrid" });
  const name = textInput("name", author?.name || "", { required: true });
  const slug = textInput("slug", author?.slug || "");
  name.addEventListener("input", () => { if (!slug.dataset.manual && !author) slug.value = slugify(name.value); });
  slug.addEventListener("input", () => { slug.dataset.manual = "1"; });
  const photoOptions = [{ value: "", label: "— Brak zdjęcia —" }, ...media.filter((item) => ["image", "asset"].includes(item.media_type)).map((item) => ({
    value: item.id,
    label: `${item.metadata?.title || item.media_type} · ${String(item.id).slice(0, 8)}`
  }))];
  form.append(
    field("Nazwa autora", name),
    field("Slug", slug),
    field("Biografia", textInput("biography", author?.biography || "", { multiline: true, class: "full" })),
    field("Zdjęcie z Media Library", selectInput("photoMediaId", photoOptions, author?.photo_media_id || "")),
    el("div", { class: "actions full" }, [button(author ? "Zapisz" : "Dodaj autora", { class: "primary", type: "submit" })])
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const values = formValues(form);
      await ctx.repos.media.saveAuthor({ id: author?.id, ...values, photoMediaId: values.photoMediaId || null });
      ctx.shell.toast("Autor zapisany.", "success");
      if (onDone) await onDone();
    } catch (error) { ctx.shell.toast(error.message, "error"); }
  });
  return form;
}

export async function renderAuthors(ctx) {
  ctx.shell.setHeader("authors", "Authors");
  ctx.shell.loading();
  try {
    const [authors, media] = await Promise.all([ctx.repos.media.listAuthors(true), ctx.repos.media.list()]);
    const canEdit = ctx.permissions.has("authors.edit");
    const add = canEdit ? button("Dodaj autora", { class: "primary", onClick: () => ctx.shell.openDialog("Nowy autor", authorForm(ctx, media, null, () => renderAuthors(ctx))) }) : null;
    const cards = authors.length ? el("div", { class: "cardList" }, authors.map((author) =>
      el("article", { class: "entityCard" }, [
        el("div", { class: "metaRow" }, [statusBadge(author.archived_at ? "archived" : "active"), `${author.exhibition_count || 0} wystaw`]),
        el("h3", { text: author.name }),
        el("p", { text: author.biography || author.slug || "" }),
        el("div", { class: "actions" }, [
          canEdit ? button("Edytuj", { class: "small", onClick: () => ctx.shell.openDialog("Edytuj autora", authorForm(ctx, media, author, () => renderAuthors(ctx))) }) : null,
          canEdit && !author.archived_at ? actionButton("Archiwizuj", async () => { await ctx.repos.media.archiveAuthor(author.id); await renderAuthors(ctx); }, { class: "small danger" }) : null,
          canEdit && author.archived_at ? actionButton("Przywróć", async () => { await ctx.repos.media.restoreAuthor(author.id); await renderAuthors(ctx); }, { class: "small" }) : null
        ])
      ])
    )) : empty("Brak autorów.");
    ctx.shell.view.replaceChildren(pageHead("Authors", "Platformowe profile autorów oraz ich użycia w wystawach.", [add]), cards);
  } catch (error) {
    ctx.shell.view.replaceChildren(pageHead("Authors", "Autorzy platformy."), errorBlock(error));
  }
}
