export function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(options || {})) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value == null ? "" : String(value);
    else if (key === "html") node.innerHTML = value == null ? "" : String(value);
    else if (key === "dataset") Object.assign(node.dataset, value || {});
    else if (key === "on") for (const [event, listener] of Object.entries(value || {})) node.addEventListener(event, listener);
    else if (key === "attrs") for (const [name, item] of Object.entries(value || {})) {
      if (item !== false && item != null) node.setAttribute(name, item === true ? "" : String(item));
    }
    else if (key in node && key !== "style") node[key] = value;
    else if (value != null) node.setAttribute(key, String(value));
  }
  const list = Array.isArray(children) ? children : [children];
  for (const child of list.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function button(label, options = {}) {
  return el("button", {
    class: `button ${options.class || ""}`.trim(),
    text: label,
    type: options.type || "button",
    disabled: !!options.disabled,
    on: options.onClick ? { click: options.onClick } : undefined,
    attrs: options.attrs || {}
  });
}

export function statusBadge(status) {
  const value = String(status || "unknown").toLowerCase();
  return el("span", { class: `status ${value}`, text: value });
}

export function field(labelText, input) {
  return el("label", { class: input.classList.contains("full") ? "full" : "" }, [labelText, input]);
}

export function textInput(name, value = "", options = {}) {
  return el(options.multiline ? "textarea" : "input", {
    name,
    value,
    class: options.class || "",
    placeholder: options.placeholder || "",
    required: !!options.required,
    type: options.type || "text",
    attrs: options.attrs || {}
  });
}

export function selectInput(name, values, current = "") {
  const select = el("select", { name });
  for (const item of values) {
    const record = typeof item === "string" ? { value: item, label: item } : item;
    select.append(el("option", { value: record.value, text: record.label, selected: String(record.value) === String(current) }));
  }
  return select;
}

export function formValues(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function jsonTextarea(name, value) {
  return el("textarea", { name, class: "code full", value: JSON.stringify(value ?? {}, null, 2), spellcheck: false });
}

export function parseJsonTextarea(input, label = "JSON") {
  try { return JSON.parse(input.value || "{}"); }
  catch (error) { throw new Error(`${label}: ${error.message}`); }
}
