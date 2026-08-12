import { el, button, field, textInput, selectInput, formValues, statusBadge } from "../core/dom.js";
import { pageHead, panel, empty, errorBlock } from "./shared.js";

function assignmentPicker(name, items, selectedIds, roleValue, labelPrefix) {
  const selected = new Set(selectedIds || []);
  return el("div", { class: "grid permissionPicker", dataset: { picker: name } }, items.map((item) => {
    const checked = selected.has(item.id);
    return el("label", { class: "checkRow entityCard" }, [
      el("input", { type: "checkbox", value: item.id, checked }),
      el("span", {}, [
        el("strong", { text: item.name || item.title }),
        el("small", { class: "help", text: `${labelPrefix}: ${roleValue}` })
      ])
    ]);
  }));
}

function collectPicker(form, name, role) {
  return [...form.querySelectorAll(`[data-picker="${name}"] input:checked`)].map((input) => ({
    [`${name === "venues" ? "venue" : "exhibition"}Id`]: input.value,
    role
  }));
}

function inviteForm(ctx, venues, exhibitions, onDone) {
  const form = el("form", { class: "formGrid" });
  form.append(
    field("E-mail", textInput("email", "", { type: "email", required: true })),
    field("Nazwa", textInput("displayName", "")),
    field("Rola platformowa", selectInput("platformRole", [
      { value: "viewer", label: "Viewer" },
      { value: "platform_admin", label: "Platform Admin" }
    ])),
    el("div", { class: "full grid" }, [
      el("h4", { text: "Venue Admin" }),
      venues.length ? assignmentPicker("venues", venues, [], "venue_admin", "Rola") : empty("Brak Venue."),
      el("h4", { text: "Curator" }),
      exhibitions.length ? assignmentPicker("exhibitions", exhibitions, [], "curator", "Rola") : empty("Brak wystaw.")
    ]),
    el("p", { class: "help full", text: "Zaproszenie wysyła Edge Function admin-users. Klucz service-role pozostaje wyłącznie po stronie Supabase." }),
    el("div", { class: "actions full" }, [button("Wyślij zaproszenie", { class: "primary", type: "submit" })])
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = formValues(form);
      await ctx.repos.users.invite({
        ...data,
        venueRoles: collectPicker(form, "venues", "venue_admin"),
        exhibitionRoles: collectPicker(form, "exhibitions", "curator")
      });
      ctx.shell.toast("Zaproszenie wysłane.", "success");
      if (onDone) await onDone();
    } catch (error) { ctx.shell.toast(error.message, "error"); }
  });
  return form;
}

function accessForm(ctx, user, venues, exhibitions, onDone) {
  const form = el("form", { class: "formGrid" });
  const venueIds = (user.venue_roles || []).filter((item) => item.role === "venue_admin").map((item) => item.venueId || item.venue_id);
  const exhibitionIds = (user.exhibition_roles || []).filter((item) => item.role === "curator").map((item) => item.exhibitionId || item.exhibition_id);
  form.append(
    field("Aktywność", selectInput("active", [{ value: "true", label: "Aktywny" }, { value: "false", label: "Dezaktywowany" }], String(user.active !== false))),
    field("Rola platformowa", selectInput("platformRole", [
      { value: "viewer", label: "Viewer" },
      { value: "platform_admin", label: "Platform Admin" }
    ], user.platform_role || "viewer")),
    el("div", { class: "full grid" }, [
      el("h4", { text: "Przypisane Venue Admin" }),
      venues.length ? assignmentPicker("venues", venues, venueIds, "venue_admin", "Rola") : empty("Brak Venue."),
      el("h4", { text: "Przypisane wystawy Curator" }),
      exhibitions.length ? assignmentPicker("exhibitions", exhibitions, exhibitionIds, "curator", "Rola") : empty("Brak wystaw.")
    ]),
    el("div", { class: "actions full" }, [button("Zapisz dostęp", { class: "primary", type: "submit" })])
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = formValues(form);
      await ctx.repos.users.setAccess({
        userId: user.user_id,
        active: data.active === "true",
        platformRole: data.platformRole,
        venueRoles: collectPicker(form, "venues", "venue_admin"),
        exhibitionRoles: collectPicker(form, "exhibitions", "curator")
      });
      ctx.shell.toast("Dostęp użytkownika zapisany.", "success");
      if (onDone) await onDone();
    } catch (error) { ctx.shell.toast(error.message, "error"); }
  });
  return form;
}

export async function renderUsers(ctx) {
  ctx.shell.setHeader("users", "Users");
  ctx.shell.loading();
  try {
    const [users, venues, exhibitions] = await Promise.all([
      ctx.repos.users.list(),
      ctx.repos.venues.list(),
      ctx.repos.exhibitions.list()
    ]);
    const invite = button("Zaproś użytkownika", {
      class: "primary",
      onClick: () => ctx.shell.openDialog("Zaproszenie", inviteForm(ctx, venues, exhibitions, () => renderUsers(ctx)))
    });
    const table = users.length ? el("div", { class: "tableWrap" }, [el("table", {}, [
      el("thead", {}, el("tr", {}, ["Użytkownik", "Rola", "Venue", "Wystawy", "Status", "Akcje"].map((value) => el("th", { text: value })))),
      el("tbody", {}, users.map((user) => el("tr", {}, [
        el("td", {}, [el("strong", { text: user.display_name || user.email }), el("div", { class: "help", text: user.email })]),
        el("td", { text: user.platform_role || "viewer" }),
        el("td", { text: (user.venue_roles || []).filter((item) => item.role === "venue_admin").length }),
        el("td", { text: (user.exhibition_roles || []).filter((item) => item.role === "curator").length }),
        el("td", {}, statusBadge(user.active === false ? "archived" : "active")),
        el("td", {}, button("Uprawnienia", {
          class: "small",
          onClick: () => ctx.shell.openDialog("Uprawnienia użytkownika", accessForm(ctx, user, venues, exhibitions, () => renderUsers(ctx)))
        }))
      ])))
    ])]) : empty("Brak użytkowników.");
    ctx.shell.view.replaceChildren(pageHead("Users", "Role platformowe, Venue Admin, Curator i dezaktywacja dostępu.", [invite]), panel("Użytkownicy", table));
  } catch (error) {
    ctx.shell.view.replaceChildren(pageHead("Users", "Użytkownicy platformy."), errorBlock(error));
  }
}
