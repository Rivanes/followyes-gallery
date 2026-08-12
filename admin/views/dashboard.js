import { el, formatDate, statusBadge, button } from "../core/dom.js";
import { pageHead, panel, errorBlock } from "./shared.js";

function jobsPanel(ctx, jobs) {
  if (!jobs.length) return null;
  const rows = jobs.slice(0, 20).map((job) => {
    const run = ["queued", "failed"].includes(job.status)
      ? button(job.status === "failed" ? "Ponów" : "Uruchom", {
          class: "small",
          onClick: async () => {
            try {
              await ctx.repos.admin.runJob(job.id);
              ctx.shell.toast("Zadanie wykonane.", "success");
              await renderDashboard(ctx);
            } catch (error) { ctx.shell.toast(error.message, "error"); }
          }
        })
      : "—";
    return el("tr", {}, [
      el("td", { text: job.job_type }),
      el("td", { text: `${job.entity_type || "—"}${job.entity_id ? ` / ${String(job.entity_id).slice(0, 8)}` : ""}` }),
      el("td", {}, statusBadge(job.status)),
      el("td", { text: formatDate(job.created_at) }),
      el("td", { text: job.error_message || "—" }),
      el("td", {}, run)
    ]);
  });
  return panel("CMS Jobs", el("div", { class: "tableWrap" }, [
    el("table", {}, [
      el("thead", {}, el("tr", {}, ["Typ", "Encja", "Status", "Utworzono", "Błąd", "Akcja"].map((value) => el("th", { text: value })))),
      el("tbody", {}, rows)
    ])
  ]));
}

export async function renderDashboard(ctx) {
  ctx.shell.setHeader("dashboard", "Dashboard");
  ctx.shell.loading();
  try {
    const [data, jobs] = await Promise.all([
      ctx.repos.admin.dashboard(),
      ctx.permissions.has("platform.manage") ? ctx.repos.admin.jobs() : Promise.resolve([])
    ]);
    const counts = data.counts || {};
    const metrics = [
      ["Venue", counts.venues || 0],
      ["Wersje Venue", counts.venueVersions || 0],
      ["Wystawy opublikowane", counts.publishedExhibitions || 0],
      ["Wystawy robocze", counts.draftExhibitions || 0],
      ["Media", counts.media || 0],
      ["Zadania wymagające uwagi", counts.attention || 0]
    ];
    const metricsGrid = el("div", { class: "grid metricsGrid" }, metrics.map(([label, value]) =>
      el("article", { class: "metric" }, [el("span", { text: label }), el("strong", { text: value })])
    ));

    const attention = Array.isArray(data.attention) ? data.attention : [];
    const activity = Array.isArray(data.recentActivity) ? data.recentActivity : [];
    ctx.shell.view.replaceChildren(
      pageHead("Dashboard", "Stan platformy, publikacji i zasobów wymagających uwagi."),
      metricsGrid,
      el("div", { class: "grid twoColumn", style: "margin-top:16px" }, [
        panel("Wymaga uwagi", attention.length ? el("div", { class: "grid" }, attention.map((item) =>
          el("div", { class: "entityCard" }, [
            el("strong", { text: item.title || item.type || "Problem" }),
            el("p", { text: item.message || "" })
          ])
        )) : el("div", { class: "emptyState", text: "Brak wykrytych problemów." })),
        panel("Ostatnia aktywność", activity.length ? el("div", { class: "grid" }, activity.map((item) =>
          el("div", { class: "entityCard" }, [
            el("strong", { text: item.action || "Zmiana" }),
            el("p", { text: `${item.entityType || "platform"}${item.entityName ? ` — ${item.entityName}` : ""}` }),
            el("span", { class: "help", text: formatDate(item.createdAt || item.created_at) })
          ])
        )) : el("div", { class: "emptyState", text: "Brak wpisów audytu." }))
      ]),
      jobsPanel(ctx, jobs)
    );
  } catch (error) {
    ctx.shell.view.replaceChildren(pageHead("Dashboard", "Stan platformy."), errorBlock(error));
  }
}
