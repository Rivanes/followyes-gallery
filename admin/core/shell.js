import { el, clear, button } from "./dom.js";

const NAV = [
  ["dashboard", "⌂", "Dashboard", "site.read"],
  ["venues", "◇", "Venues", "venue.read"],
  ["exhibitions", "▣", "Exhibitions", "exhibition.read"],
  ["homepage", "⌘", "Homepage", "site.edit"],
  ["media", "◫", "Media Library", "media.read"],
  ["authors", "◎", "Authors", "authors.read"],
  ["users", "♙", "Users", "users.manage"],
  ["archive", "⌫", "Archive", "exhibition.archive"],
  ["settings", "⚙", "Site Settings", "site.edit"]
];

export function createShell({ permissionService, onNavigate, onLogout }) {
  const sidebar = document.getElementById("adminSidebar");
  const header = document.getElementById("adminHeader");
  const view = document.getElementById("adminView");
  const toastRegion = document.getElementById("adminToastRegion");
  const dialog = document.getElementById("adminDialog");
  const dialogContent = document.getElementById("adminDialogContent");
  const context = permissionService.context;

  clear(sidebar);
  sidebar.append(el("div", { class: "sidebarBrand" }, [
    el("div", { class: "brandMark", text: "BB" }),
    el("div", {}, [el("strong", { text: "Site Admin" }), el("span", { text: "Platform CMS" })])
  ]));
  const nav = el("nav", { class: "navList" });
  for (const [name, icon, label, capability] of NAV) {
    if (!permissionService.has(capability)) continue;
    const link = el("a", {
      class: "navLink",
      href: `#/${name}`,
      dataset: { route: name },
      on: { click: () => document.body.classList.remove("adminNavOpen") }
    }, [el("span", { class: "navIcon", text: icon }), label]);
    nav.append(link);
  }
  sidebar.append(nav);

  function setHeader(route, title, breadcrumb = "Site Admin") {
    clear(header);
    header.append(
      el("div", { class: "headerTitle" }, [
        el("div", { class: "breadcrumbs", text: breadcrumb }),
        el("h1", { text: title })
      ]),
      el("div", { class: "headerUser" }, [
        button("☰", { class: "ghost mobileNavButton", onClick: () => document.body.classList.toggle("adminNavOpen"), attrs: { "aria-label": "Otwórz menu" } }),
        el("div", { class: "userText" }, [
          el("strong", { text: context.displayName || context.email }),
          el("span", { text: context.platformRole })
        ]),
        button("Wyloguj", { class: "ghost small", onClick: onLogout })
      ])
    );
    sidebar.querySelectorAll("[data-route]").forEach((item) => item.classList.toggle("active", item.dataset.route === route));
  }

  function toast(message, type = "info") {
    const item = el("div", { class: `toast ${type}`, text: message });
    toastRegion.append(item);
    window.setTimeout(() => item.remove(), 5000);
  }

  function openDialog(title, content, options = {}) {
    clear(dialogContent);
    const close = button("Zamknij", { class: "ghost small", onClick: () => dialog.close() });
    dialogContent.append(el("div", { class: "adminDialogBody" }, [
      el("div", { class: "adminDialogHead" }, [el("h2", { text: title }), close]),
      content
    ]));
    if (options.className) dialog.className = `adminDialog ${options.className}`;
    dialog.showModal();
  }

  function confirmAction(message, actionLabel = "Potwierdź") {
    return new Promise((resolve) => {
      const body = el("div", { class: "grid" }, [
        el("p", { text: message }),
        el("div", { class: "actions" })
      ]);
      const actions = body.lastElementChild;
      actions.append(
        button("Anuluj", { class: "ghost", onClick: () => { dialog.close(); resolve(false); } }),
        button(actionLabel, { class: "danger", onClick: () => { dialog.close(); resolve(true); } })
      );
      openDialog("Potwierdzenie", body);
    });
  }

  function loading(message = "Ładowanie…") {
    clear(view).append(el("div", { class: "emptyState", text: message }));
  }

  return Object.freeze({ sidebar, header, view, setHeader, toast, openDialog, confirmAction, loading, onNavigate });
}
