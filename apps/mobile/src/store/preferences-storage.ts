import * as SecureStore from "expo-secure-store";
import { localeSchema, type Locale } from "@kitchenpal/api-contract";

/**
 * Device-side UI preferences that must survive a cold start: the chosen locale
 * and whether first-run onboarding is done. Stored via expo-secure-store (the
 * one storage module already wired for the app; these values are non-secret but
 * small and infrequently written).
 */
const LOCALE_KEY = "kp.locale";
const ONBOARDED_KEY = "kp.onboarded";

export interface StoredPreferences {
  locale: Locale | null;
  hasCompletedOnboarding: boolean;
}

export const readPreferences = async (): Promise<StoredPreferences> => {
  const [rawLocale, rawOnboarded] = await Promise.all([
    SecureStore.getItemAsync(LOCALE_KEY),
    SecureStore.getItemAsync(ONBOARDED_KEY),
  ]);
  const parsedLocale = localeSchema.safeParse(rawLocale);
  return {
    locale: parsedLocale.success ? parsedLocale.data : null,
    hasCompletedOnboarding: rawOnboarded === "true",
  };
};

export const persistLocale = (locale: Locale): Promise<void> =>
  SecureStore.setItemAsync(LOCALE_KEY, locale);

export const persistOnboardingComplete = (): Promise<void> =>
  SecureStore.setItemAsync(ONBOARDED_KEY, "true");
