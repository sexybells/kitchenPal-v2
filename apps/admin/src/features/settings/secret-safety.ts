/**
 * Client-side secret hygiene for the settings UI. The backend already strips
 * secret-looking keys before persistence, but the console re-checks defensively
 * so a value under a secret-looking key is NEVER rendered even if one leaked in.
 */

/** Matches key names that conventionally hold secrets. Mirrors the backend. */
const SECRET_KEY_PATTERN =
  /(secret|password|token|api[-_]?key|credential|private[-_]?key)/i;

/** True when a config key name looks like it would hold a secret. */
export function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}

/** Render a non-secret config value compactly; objects are summarized. */
export function previewConfigValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return `${value.length} item(s)`;
  return "{…}";
}
