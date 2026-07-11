import "i18next";
import type { TranslationBundle } from "./locales/vi";

// Give `t()` full key autocompletion + type-safety against the vi bundle shape.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: {
      translation: TranslationBundle;
    };
  }
}
