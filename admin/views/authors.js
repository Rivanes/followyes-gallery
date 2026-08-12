import { el, button, field, textInput, selectInput, formValues, statusBadge } from "../core/dom.js";
import { pageHead, panel, empty, errorBlock, actionButton } from "./shared.js";
import { slugify } from "../../src/platform/schemas/cms-schemas.js";

function authorForm(ctx, media, author = null, onDone) {
  const form = el("form", { class: "formGrid" });
  const name = textInput("name", author?.name || "", { required: true });
  const slug = textInput("slug", author?.slug || "");
  const photoFile = el("input", {
    name: "photoFile",
    type: "file",
    accept: "image/jpeg,image/png,image/webp,image/avif,image/gif,image/bmp"
  });
  name.addEventListener("input", () => { if (!slug.dataset.manual && !author) slug.value = slugify(name.value); });
  slug.addEventListener("input", () => { slug.dataset.manual = "1"; });
  const photoOptions = [{ value: "", label: "— Brak zdjęcia —" }, ...media.filter((item) => ["image", "asset", "author-photo"].includes(item.media_type)).map((item) => ({
    value: item.id,
    label: `${item.metadata?.title || item.media_type} · ${String(item.id).slice(0, 8)}`
  }))];
  if (author?.photo_media_id && !photoOptions.some((item) => String(item.value) === String(author.photo_media_id))) {
    photoOptions.push({ value: author.photo_media_id, label: `Obecne zdjęcie autora · ${String(author.photo_media_id).slice(0, 8)}` });
  }
  form.append(
    field("Nazwa autora", name),
    field("Slug", slug),
    field("Biografia", textInput("biography", author?.biography || "", { multiline: true, class: "full" })),
    field("Zdjęcie z Media Library", selectInput("photoMediaId", photoOptions, author?.photo_media_id || "")),
    field("Prześlij nowe zdjęcie autora", photoFile),
    el("p", { class: "help full", text: "Nowe zdjęcie przechodzi przez wspólny pipeline: oryginał + Desktop/Mobile/Preview AVIF. Plik zostanie zapisany w globalnej Media Library, ponieważ profil autora może być używany w wielu wystawach." }),
    el("div", { class: "actions full" }, [button(author ? "Zapisz" : "Dodaj autora", { class: "primary", type: "submit" })])
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    let uploaded = null;
    let authorSaved = false;
    let finalizeWarning = "";
    try {
      submit.disabled = true;
      const values = formValues(form);
      const selectedFile = photoFile.files && photoFile.files[0];
      if (selectedFile) {
        uploaded = await ctx.repos.media.uploadAuthorPhoto(selectedFile, {
          authorId: author?.id || null,
          previousMediaId: author?.photo_media_id || null,
          title: `${values.name || author?.name || "Author"} — photo`
        });
      }
      await ctx.repos.media.saveAuthor({
        id: author?.id,
        ...values,
        photoMediaId: uploaded?.mediaId || values.photoMediaId || null
      });
      authorSaved = true;
      if (uploaded) {
        try { await ctx.repos.media.finalizeUpload(uploaded); }
        catch (finalizeError) {
          finalizeWarning = " Autor został zapisany, ale operacja medium oczekuje na automatyczne domknięcie.";
          console.warn("Author photo finalize deferred:", finalizeError);
        }
      }
      ctx.shell.toast(`Autor zapisany.${finalizeWarning}`, "success");
      if (onDone) await onDone();
    } catch (error) {
      if (uploaded && !authorSaved) {
        try { await ctx.repos.media.discardUpload(uploaded, "author-save-failed"); }
        catch (discardError) { console.warn("Author photo rollback failed:", discardError); }
      }
      ctx.shell.toast(error.message, "error");
    } finally {
      submit.disabled = false;
    }
  });
  return form;
}

export async function renderAuthors(ctx) {
  ctx.shell.setHeader("authors", "Authors");
  ctx.shell.loading();
  try {
    const [authors, media] = await Promise.all([
      ctx.repos.media.listAuthors(true),
      ctx.repos.media.list({ ownerType: "platform" })
    ]);
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
