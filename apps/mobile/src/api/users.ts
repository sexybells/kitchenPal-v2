import {
  userSettingsResponseSchema,
  type PushTokenInput,
  type UpdateSettingsInput,
  type UserSettingsResponse,
} from "@kitchenpal/api-contract";
import { api } from "./api";

/**
 * User account endpoints not tied to a feature module: device push-token
 * registration and the per-user settings.
 */
export const usersApi = {
  /** Register (or refresh) this device's Expo push token for the current user. */
  registerPushToken: (input: PushTokenInput): Promise<void> =>
    api
      .request("users/push-token", { body: input, auth: true })
      .then(() => undefined),

  getSettings: (): Promise<UserSettingsResponse> =>
    api.request("users/settings", {
      method: "GET",
      auth: true,
      schema: userSettingsResponseSchema,
    }),

  updateSettings: (input: UpdateSettingsInput): Promise<UserSettingsResponse> =>
    api.request("users/settings", {
      method: "PATCH",
      body: input,
      auth: true,
      schema: userSettingsResponseSchema,
    }),
};
