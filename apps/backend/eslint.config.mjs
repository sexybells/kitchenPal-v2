import base from "@kitchenpal/config/eslint/base";
import globals from "globals";

/**
 * Backend ESLint config. Extends the shared base but disables
 * `consistent-type-imports`: NestJS relies on runtime class references for
 * dependency-injection metadata, and converting injected imports to
 * `import type` erases that metadata and breaks DI resolution.
 */
export default [
  ...base,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
  {
    files: ["**/*.spec.ts", "**/*.e2e-spec.ts", "test/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
  },
];
