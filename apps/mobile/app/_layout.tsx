import { useEffect, useMemo, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { createQueryClient } from "../src/api/query-client";
import { changeLocale, i18n, initI18n } from "../src/i18n";
import { useSessionStore } from "../src/store/session";
import { useUiStore } from "../src/store/ui";
import { resolveAuthRedirect } from "../src/lib/auth-routing";
import {
  registerPushToken,
  routeForPushResponse,
} from "../src/features/notifications/push";
import { useTimeZoneSync } from "../src/features/settings/hooks";
import { theme } from "../src/theme";

void SplashScreen.preventAutoHideAsync();

// Foreground presentation for incoming push notifications.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Initialise i18n once at module load with the device locale; a persisted
// locale (if any) is applied during boot hydration below.
initI18n();

/**
 * Redirects the user between the auth stack and the app depending on session
 * status and onboarding history. Runs after hydration so a returning user never
 * flashes the wrong stack.
 */
function useAuthRedirect() {
  const status = useSessionStore((state) => state.status);
  const hasCompletedOnboarding = useUiStore((state) => state.hasCompletedOnboarding);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const inAuthGroup = segments[0] === "(auth)";
    const target = resolveAuthRedirect(status, inAuthGroup, hasCompletedOnboarding);
    if (target) router.replace(target);
  }, [status, hasCompletedOnboarding, segments, router]);
}

/**
 * Registers the device push token once authenticated and routes notification
 * taps into the matching screen (chat/pantry/spending/household). Guarded so it
 * no-ops for guests and when push is unavailable.
 */
function usePushNotifications() {
  const status = useSessionStore((state) => state.status);
  const router = useRouter();

  useEffect(() => {
    if (status !== "authed") return;
    void registerPushToken();
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const href = routeForPushResponse(response);
        if (href) router.push(href);
      },
    );
    return () => subscription.remove();
  }, [status, router]);
}

function RootNavigator() {
  useAuthRedirect();
  usePushNotifications();
  useTimeZoneSync();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="scan" options={{ presentation: "modal" }} />
      <Stack.Screen name="scan-review" options={{ presentation: "card" }} />
      <Stack.Screen name="pantry-item" options={{ presentation: "modal" }} />
      <Stack.Screen name="cook" options={{ presentation: "modal" }} />
      <Stack.Screen name="recipe" options={{ presentation: "card" }} />
      <Stack.Screen name="recipe-import" options={{ presentation: "modal" }} />
      <Stack.Screen name="community/new" options={{ presentation: "modal" }} />
      <Stack.Screen name="community/[id]" options={{ presentation: "card" }} />
      <Stack.Screen name="community/user/[id]" options={{ presentation: "card" }} />
      <Stack.Screen name="spending" options={{ presentation: "card" }} />
      <Stack.Screen name="expense-log" options={{ presentation: "modal" }} />
      <Stack.Screen name="budget" options={{ presentation: "card" }} />
      <Stack.Screen name="spending-analytics" options={{ presentation: "card" }} />
      <Stack.Screen name="price-history" options={{ presentation: "card" }} />
      <Stack.Screen name="household" />
      <Stack.Screen name="chat" options={{ presentation: "card" }} />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="paywall" options={{ presentation: "modal" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const queryClient = useMemo(() => createQueryClient(), []);
  const hydrateSession = useSessionStore((state) => state.hydrate);
  const hydratePreferences = useUiStore((state) => state.hydrate);
  const status = useSessionStore((state) => state.status);
  const preferencesHydrated = useUiStore((state) => state.hydrated);
  const hydrated = useRef(false);

  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    void (async () => {
      // Rehydrate session + preferences before routing; apply the persisted
      // locale so the app doesn't fall back to the device language each launch.
      const [, storedLocale] = await Promise.all([
        hydrateSession(),
        hydratePreferences(),
      ]);
      if (storedLocale) await changeLocale(storedLocale);
    })();
  }, [hydrateSession, hydratePreferences]);

  const ready =
    (fontsLoaded || fontError !== null) &&
    status !== "loading" &&
    preferencesHydrated;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <I18nextProvider i18n={i18n}>
          <QueryClientProvider client={queryClient}>
            <RootNavigator />
          </QueryClientProvider>
        </I18nextProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
