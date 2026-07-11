import base from "@kitchenpal/config/eslint/base";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactNative from "eslint-plugin-react-native";
import globals from "globals";

/**
 * Mobile ESLint config. Extends the shared base and layers React,
 * React Hooks, and React Native rules on top. Lint is BLOCKING.
 */
export default [
  {
    ignores: [
      "dist/**",
      ".expo/**",
      "expo-env.d.ts",
      "babel.config.js",
      "metro.config.js",
      "jest.config.js",
      "jest.setup.js",
    ],
  },
  ...base,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-native": reactNative,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        __DEV__: "readonly",
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat["jsx-runtime"].rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-native/no-unused-styles": "error",
      "react-native/no-single-element-style-arrays": "error",
      "react/prop-types": "off",
    },
  },
  {
    files: ["**/*.test.{ts,tsx}", "jest.setup.js"],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
];
