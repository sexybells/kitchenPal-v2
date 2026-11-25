import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCalendars } from "expo-localization";
import type { UpdateSettingsInput } from "@kitchenpal/api-contract";
import { usersApi } from "../../api/users";
import { useSessionStore } from "../../store/session";

/** Settings query keys. */
export const settingsKeys = {
  all: ["settings"] as const,
};

/** The caller's settings. Only fetches while authenticated. */
export const useSettings = () => {
  const status = useSessionStore((state) => state.status);
  return useQuery({
    queryKey: settingsKeys.all,
    queryFn: () => usersApi.getSettings(),
    enabled: status === "authed",
  });
};

/** PATCH settings and store the server's full response as the cached settings. */
export const useUpdateSettings = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSettingsInput) => usersApi.updateSettings(input),
    onSuccess: (settings) => client.setQueryData(settingsKeys.all, settings),
  });
};

/**
 * Keep the server's time zone in step with the device's so reminders fire on
 * the user's local date. PATCHes only when authenticated and the zones differ.
 */
export const useTimeZoneSync = (): void => {
  const settings = useSettings();
  const { mutate } = useUpdateSettings();
  const serverZone = settings.data?.timeZone;

  useEffect(() => {
    if (!serverZone) return;
    const deviceZone = getCalendars()[0]?.timeZone;
    if (deviceZone && deviceZone !== serverZone) {
      mutate({ timeZone: deviceZone });
    }
  }, [serverZone, mutate]);
};
