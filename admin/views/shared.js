import { el, button } from "../core/dom.js";

export function pageHead(title, description, actions = []) {
  return el("div", { class: "pageHead" }, [
    el("div", {}, [el("h2", { text: title }), el("p", { text: description })]),
    el("div", { class: "actions" }, actions)
  ]);
}

export function panel(title, content, actions = []) {
  return el("section", { class: "panel" }, [
    el("div", { class: "panelHeader" }, [el("h3", { text: title }), el("div", { class: "actions" }, actions)]),
    content
  ]);
}

export function empty(message) {
  return el("div", { class: "emptyState", text: message });
}

export function errorBlock(error) {
  return el("div", { class: "panel" }, [
    el("h3", { text: "Nie udało się pobrać danych" }),
    el("p", { class: "formError", text: error && error.message || String(error) })
  ]);
}

export function actionButton(label, handler, options = {}) {
  return button(label, { class: options.class || "", disabled: options.disabled, onClick: async (event) => {
    const target = event.currentTarget;
    target.disabled = true;
    try { await handler(event); }
    finally { target.disabled = false; }
  }});
}
