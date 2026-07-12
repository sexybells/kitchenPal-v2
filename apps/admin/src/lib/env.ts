/**
 * Runtime environment facts, read once from Vite's compile-time env. Kept in a
 * dedicated module so tests can mock it (e.g. to prove dev tools hide in prod)
 * without stubbing `import.meta`.
 */
export const env = {
  /** REST base URL; overridable per deploy via `VITE_API_URL`. */
  apiBaseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:3001",
  /** True in a production build — gates destructive dev-only tooling. */
  isProduction: import.meta.env.PROD,
};

/** Dev tools (seed/reset) are only ever exposed outside production builds. */
export function isDevToolsEnabled(): boolean {
  return !env.isProduction;
}
