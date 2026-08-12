const DEFAULT_ROUTE = "dashboard";

function parseHash(hash) {
  const source = String(hash || "").replace(/^#\/?/, "");
  const [pathPart, queryPart = ""] = source.split("?");
  const segments = pathPart.split("/").filter(Boolean);
  return Object.freeze({
    name: segments[0] || DEFAULT_ROUTE,
    id: segments[1] || null,
    params: new URLSearchParams(queryPart)
  });
}

export function createRouter(onRoute) {
  let current = parseHash(location.hash);
  const listener = () => {
    current = parseHash(location.hash);
    onRoute(current);
  };
  window.addEventListener("hashchange", listener);
  return Object.freeze({
    start() {
      if (!location.hash) location.replace(`#/${DEFAULT_ROUTE}`);
      else listener();
    },
    navigate(name, id = null, params = null) {
      const query = params instanceof URLSearchParams ? params.toString() : "";
      location.hash = `#/${name}${id ? `/${id}` : ""}${query ? `?${query}` : ""}`;
    },
    get current() { return current; },
    destroy() { window.removeEventListener("hashchange", listener); }
  });
}
