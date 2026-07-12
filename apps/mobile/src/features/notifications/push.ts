import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { notificationResponseSchema } from "@kitchenpal/api-contract";
import { usersApi } from "../../api/users";
import { notificationRoute } from "./labels";
import type { Href } from "expo-router";

/** Map the RN platform to the contract's push-token platform enum. */
const currentPlatform = (): "ios" | "android" | "web" => {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "web";
};

/** The EAS project id needed to mint an Expo push token, when configured. */
const projectId = (): string | undefined =>
  Constants.expoConfig?.extra?.eas?.projectId ??
  Constants.easConfig?.projectId ??
  undefined;

/**
 * Register this device's Expo push token with the backend. No-ops (returns null)
 * when push is unavailable — simulators/emulators, denied permission, or a
 * missing EAS project id — so it is always safe to call at startup. Best-effort:
 * failures never throw into the caller.
 */
export const registerPushToken = async (): Promise<string | null> => {
  try {
    // Push tokens only exist on physical devices; skip silently otherwise.
    if (!Device.isDevice) return null;

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      const requested = await Notifications.requestPermissionsAsync();
      granted = requested.granted;
    }
    if (!granted) return null;

    const id = projectId();
    if (!id) return null;

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: id,
    });
    await usersApi.registerPushToken({ token, platform: currentPlatform() });
    return token;
  } catch {
    // Push is a best-effort enhancement; the in-app list is the durable source.
    return null;
  }
};

/**
 * Resolve the deep-link destination for a tapped push notification, validating
 * the OS-delivered `data` against the notification contract first. Returns null
 * when the payload is not a recognised notification.
 */
export const routeForPushResponse = (
  response: Notifications.NotificationResponse,
): Href | null => {
  const data = response.notification.request.content.data;
  const parsed = notificationResponseSchema.safeParse(data);
  return parsed.success ? notificationRoute(parsed.data) : null;
};
