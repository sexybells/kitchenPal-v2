import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";
import { localeSchema, type Locale } from "@kitchenpal/api-contract";
import { vi } from "./locales/vi";
import { en } from "./locales/en";

/**
 * Locale codes are the single source of truth (avoids the legacy locale drift).
 * `vi` is the default/fallback — the product is Vietnamese-first. New locales
 * (ja/zh/ko) are added by dropping a bundle into `resources` and the enum in
 * the api-contract; nothing else here changes.
 */
export const SUPPORTED_LOCALES: readonly Locale[] = ["vi", "en"];
export const DEFAULT_LOCALE: Locale = "vi";

const resources = {
  vi: { translation: vi },
  en: { translation: en },
} as const;

/** Resolve the device's preferred locale to a supported code, else default. */
export const resolveDeviceLocale = (): Locale => {
  const preferred = getLocales();
  for (const entry of preferred) {
    const parsed = localeSchema.safeParse(entry.languageCode);
    if (parsed.success) return parsed.data;
  }
  return DEFAULT_LOCALE;
};

/** Initialise i18next once, with the given (already-resolved) locale. */
export const initI18n = (locale: Locale = resolveDeviceLocale()): typeof i18n => {
  if (!i18n.isInitialized) {
    void i18n.use(initReactI18next).init({
      resources,
      lng: locale,
      fallbackLng: DEFAULT_LOCALE,
      supportedLngs: SUPPORTED_LOCALES,
      interpolation: { escapeValue: false },
      returnNull: false,
    });
  }
  return i18n;
};

/** Imperatively switch the active locale (persisted via the UI store). */
export const changeLocale = async (locale: Locale): Promise<void> => {
  await i18n.changeLanguage(locale);
};

export { i18n };
