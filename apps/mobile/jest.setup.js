/* eslint-env jest */
// Global test setup: silence the native animation layer and stub the Expo
// native modules the data/auth layers touch so component + hook tests run
// without a device.

// Reanimated 4's native worklets layer can't initialise under Jest, and its
// bundled mock still imports it. Provide a minimal hand-rolled mock covering
// the primitives the UI uses (shared values, animated styles, timing/spring).
jest.mock("react-native-reanimated", () => {
  const { View } = require("react-native");
  const createAnimatedComponent = (Component) => Component;
  return {
    __esModule: true,
    default: { createAnimatedComponent, View },
    createAnimatedComponent,
    useSharedValue: (initial) => ({ value: initial }),
    useAnimatedStyle: (factory) => (typeof factory === "function" ? factory() : {}),
    withTiming: (toValue) => toValue,
    withSpring: (toValue) => toValue,
    withDelay: (_delay, animation) => animation,
  };
});

// In-memory secure store so token persistence can be asserted in tests.
jest.mock("expo-secure-store", () => {
  const store = new Map();
  return {
    setItemAsync: jest.fn((key, value) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    getItemAsync: jest.fn((key) => Promise.resolve(store.get(key) ?? null)),
    deleteItemAsync: jest.fn((key) => {
      store.delete(key);
      return Promise.resolve();
    }),
  };
});

jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(() => Promise.resolve(false)),
  isEnrolledAsync: jest.fn(() => Promise.resolve(false)),
  authenticateAsync: jest.fn(() => Promise.resolve({ success: false })),
  supportedAuthenticationTypesAsync: jest.fn(() => Promise.resolve([])),
}));

jest.mock("expo-localization", () => ({
  getLocales: () => [{ languageCode: "vi", languageTag: "vi-VN" }],
}));
