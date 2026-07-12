import type { PushTokenInput } from "@kitchenpal/api-contract";
import { api } from "./api";

/**
 * User account endpoints not tied to a feature module. Currently just the device
 * push-token registration used by the notifications feature.
 */
export const usersApi = {
  /** Register (or refresh) this device's Expo push token for the current user. */
  registerPushToken: (input: PushTokenInput): Promise<void> =>
    api
      .request("users/push-token", { body: input, auth: true })
      .then(() => undefined),
};
