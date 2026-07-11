import { create } from "zustand";
import type { Locale } from "@kitchenpal/api-contract";
import { DEFAULT_LOCALE } from "../i18n";
import {
  persistLocale,
  persistOnboardingComplete,
  readPreferences,
} from "./preferences-storage";

/**
 * Device-side UI preferences (locale + first-run onboarding). Both are persisted
 * so they survive a cold start; `hydrate` rehydrates them on boot before the
 * app routes or initialises i18n.
 */
interface UiState {
  locale: Locale;
  hasCompletedOnboarding: boolean;
  hydrated: boolean;
  /** Load persisted preferences; returns the stored locale (or null) for i18n. */
  hydrate: () => Promise<Locale | null>;
  setLocale: (locale: Locale) => void;
  completeOnboarding: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  locale: DEFAULT_LOCALE,
  hasCompletedOnboarding: false,
  hydrated: false,

  hydrate: async () => {
    const prefs = await readPreferences();
    set({
      locale: prefs.locale ?? DEFAULT_LOCALE,
      hasCompletedOnboarding: prefs.hasCompletedOnboarding,
      hydrated: true,
    });
    return prefs.locale;
  },

  setLocale: (locale) => {
    set({ locale });
    void persistLocale(locale);
  },

  completeOnboarding: () => {
    set({ hasCompletedOnboarding: true });
    void persistOnboardingComplete();
  },
}));
