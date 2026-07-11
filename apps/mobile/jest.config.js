/**
 * Jest config for the Expo app. `jest-expo` provides the RN preset and
 * transforms; `transformIgnorePatterns` whitelists the RN/Expo/workspace
 * ES modules that must be transpiled.
 */
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  // pnpm nests packages under `.pnpm/<flat-name>/node_modules/...`; the optional
  // `.pnpm/` prefix lets the whitelist still match the ESM RN/Expo/workspace
  // packages that must be transpiled for Jest.
  transformIgnorePatterns: [
    "node_modules/(?!(?:.*\\.pnpm/)?((jest-)?react-native|@react-native/.*|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|expo-.*|@expo-google-fonts/.*|react-native-.*|@react-navigation/.*|@kitchenpal/.*|zustand|@tanstack/.*|i18next|react-i18next))",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["**/*.test.{ts,tsx}"],
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
};
