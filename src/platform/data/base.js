export class RepositoryError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "RepositoryError";
    this.code = options.code || "CMS_REPOSITORY_ERROR";
    this.cause = options.cause || null;
    this.details = options.details || null;
  }
}

export function payload(response) {
  if (!response) return null;
  if (response.error) {
    throw new RepositoryError(response.error.message || "Supabase request failed", {
      code: response.error.code || "SUPABASE_ERROR",
      cause: response.error,
      details: response.error.details || response.error.hint || null
    });
  }
  const data = response.data;
  if (Array.isArray(data) && data.length === 1) return data[0];
  return data;
}

export function rows(response) {
  const value = payload(response);
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

export function requireClient(client) {
  if (!client) throw new RepositoryError("Supabase client is required", { code: "NO_SUPABASE_CLIENT" });
  return client;
}

export function jsonClone(value) {
  if (value == null) return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function cleanObject(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(Object.entries(source).filter(([, item]) => item !== undefined));
}
