import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import * as AppleAuthentication from "expo-apple-authentication";
import { useAppleSignIn } from "../../api/hooks";
import { resolveErrorMessage } from "../../lib/error-message";

/** Apple's error code when the user dismisses the sign-in sheet. */
const APPLE_CANCELED = "ERR_REQUEST_CANCELED";

/**
 * Present the native "Sign in with Apple" sheet and return the identity token to
 * exchange with the backend. Returns `null` when the user cancels; throws on any
 * other failure (no token returned, missing entitlement, device not signed in).
 */
export async function requestAppleIdentityToken(): Promise<string | null> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) {
      throw new Error("Apple sign-in returned no identity token");
    }
    return credential.identityToken;
  } catch (error) {
    if ((error as { code?: string }).code === APPLE_CANCELED) return null;
    throw error;
  }
}

/**
 * Screen-facing Apple sign-in. Drives the native sheet, exchanges the identity
 * token via `useAppleSignIn` (which persists the session on success, triggering
 * the auth redirect), and exposes a single localized `error` string covering
 * both native failures and backend error codes. A user cancel is a silent no-op.
 */
export function useAppleAuth() {
  const { t } = useTranslation();
  const mutation = useAppleSignIn();
  const [nativeError, setNativeError] = useState<string | null>(null);

  const signIn = useCallback(async () => {
    setNativeError(null);
    try {
      const idToken = await requestAppleIdentityToken();
      if (idToken) mutation.mutate(idToken);
    } catch {
      setNativeError(t("auth.appleSignInFailed"));
    }
  }, [mutation, t]);

  return {
    signIn,
    isPending: mutation.isPending,
    error: nativeError ?? resolveErrorMessage(mutation.error, t),
  };
}
