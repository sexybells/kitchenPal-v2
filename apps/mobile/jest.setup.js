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

// socket.io-client is never opened in tests; the chat-socket module is mocked
// per-test. Stub `io` so importing the wrapper never pulls the real ESM client.
jest.mock("socket.io-client", () => ({
  io: jest.fn(() => ({
    connected: false,
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    removeAllListeners: jest.fn(),
    io: { on: jest.fn() },
  })),
}));

// Push notifications are unavailable in tests; stub the Expo modules so the
// notifications feature renders and registration no-ops deterministically.
// `__esModule` so `import * as Device` returns this exact object — tests mutate
// `isDevice` via `jest.requireMock` and the change must be visible to the SUT.
jest.mock("expo-device", () => ({ __esModule: true, isDevice: false }));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} }, easConfig: {} },
}));

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(() =>
    Promise.resolve({ granted: false, canAskAgain: true }),
  ),
  requestPermissionsAsync: jest.fn(() =>
    Promise.resolve({ granted: false, canAskAgain: true }),
  ),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ data: "" })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(() => Promise.resolve()),
}));
