import * as SecureStore from "expo-secure-store";
import type { TokenPair } from "@kitchenpal/api-contract";

/**
 * Persistence for the auth token pair using the OS keychain/keystore via
 * `expo-secure-store`. Tokens are the only secret we persist; never log them.
 */
const ACCESS_TOKEN_KEY = "kp.accessToken";
const REFRESH_TOKEN_KEY = "kp.refreshToken";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

/** Persist the (possibly rotated) token pair. */
export const persistTokens = async (tokens: TokenPair): Promise<void> => {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
  ]);
};

/** Read the stored token pair, or null when the user is signed out. */
export const readStoredTokens = async (): Promise<StoredTokens | null> => {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  ]);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
};

/** Wipe persisted tokens (sign-out / refresh failure). */
export const clearStoredTokens = async (): Promise<void> => {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
};
