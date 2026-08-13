// Force the device language to English (non-default) to prove that first-run
// initialisation follows the app's Vietnamese-first default, NOT the device
// locale. Regression guard for the "chose Vietnamese but app shows English" bug:
// i18n used to init from the device locale while the UI store defaulted to `vi`,
// so the two diverged and a first-run en-device user got an English app.
jest.mock("expo-localization", () => ({
  getLocales: () => [{ languageCode: "en", languageTag: "en-VN" }],
}));

import { initI18n, i18n, DEFAULT_LOCALE } from "../index";

describe("i18n first-run locale", () => {
  it("initialises to the vi-first default even when the device is English", () => {
    initI18n();

    expect(DEFAULT_LOCALE).toBe("vi");
    expect(i18n.language).toBe("vi");
    // Sanity: the vi bundle is actually active (not just the language tag).
    expect(i18n.t("common.continue")).not.toBe("common.continue");
  });
});
