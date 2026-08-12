import { el, button, statusBadge, formatDate } from "../core/dom.js";
import { pageHead, panel, empty, errorBlock, actionButton } from "./shared.js";

export async function renderArchive(ctx) {
  ctx.shell.setHeader("archive", "Archive");
  ctx.shell.loading();
  try {
    const items = await ctx.repos.admin.archive();
    const table = items.length ? el("div", { class: "tableWrap" }, [el("table", {}, [
      el("thead", {}, el("tr", {}, ["Typ", "Nazwa", "Slug", "Zarchiwizowano", "Zależności", "Akcje"].map((value) => el("th", { text: value })))),
      el("tbody", {}, items.map((item) => el("tr", {}, [
        el("td", {}, statusBadge(item.entity_type)),
        el("td", { text: item.name || item.title || item.id }),
        el("td", { text: item.slug || "—" }),
        el("td", { text: formatDate(item.archived_at) }),
        el("td", { text: item.reference_count || 0 }),
        el("td", {}, el("div", { class: "actions" }, [
          actionButton("Przywróć", async () => {
            await ctx.repos.admin.restore(item.entity_type, item.id);
            ctx.shell.toast("Element przywrócony.", "success");
            await renderArchive(ctx);
          }, { class: "small" }),
          actionButton("Permanent delete", async () => {
            if (!await ctx.shell.confirmAction("Operacja jest nieodwracalna i zostanie zablokowana, jeśli istnieją referencje.", "Usuń permanentnie")) return;
            const job = await ctx.repos.admin.requestPermanentDelete(item.entity_type, item.id);
            await ctx.repos.admin.runJob(job.id);
            ctx.shell.toast("Element został permanentnie usunięty.", "success");
            await renderArchive(ctx);
          }, { class: "small danger", disabled: Number(item.reference_count || 0) > 0 })
        ]))
      ])))
    ])]) : empty("Archiwum jest puste.");
    ctx.shell.view.replaceChildren(pageHead("Archive", "Soft delete, przywracanie i kontrolowane permanent delete."), panel("Zarchiwizowane encje", table));
  } catch (error) {
    ctx.shell.view.replaceChildren(pageHead("Archive", "Archiwum platformy."), errorBlock(error));
  }
}
