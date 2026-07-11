import { localeSchema, type Locale } from "@kitchenpal/api-contract";

const DEFAULT_LOCALE: Locale = "vi";

/**
 * Resolves the locale CODE for a request without hardcoding it at the call site:
 * an explicit choice wins, otherwise the first supported language in the
 * `Accept-Language` header is used, falling back to the launch default. Storing
 * a single code (not a display string) keeps locale drift out of the system.
 */
export function resolveLocale(
  explicit: Locale | undefined,
  acceptLanguage: string | undefined,
): Locale {
  if (explicit) {
    return explicit;
  }
  if (acceptLanguage) {
    for (const part of acceptLanguage.split(",")) {
      const tag = part.split(";")[0]?.trim().slice(0, 2).toLowerCase();
      const candidate = localeSchema.safeParse(tag);
      if (candidate.success) {
        return candidate.data;
      }
    }
  }
  return DEFAULT_LOCALE;
}
