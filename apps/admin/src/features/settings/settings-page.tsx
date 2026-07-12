import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SystemSettingResponse } from "@kitchenpal/api-contract";
import { adminApi } from "@/api/admin";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { formatDateTime } from "@/lib/format";
import { isSecretKey, previewConfigValue } from "./secret-safety";

/**
 * Integration settings. The backend never persists or returns secrets, and the
 * UI adds defense in depth: any config entry whose KEY looks secret is masked
 * and never rendered. Toggling an integration re-sends the existing non-secret
 * config so no data is lost.
 */
export function SettingsPage() {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["integration-settings"],
    queryFn: adminApi.getIntegrations,
  });

  const toggleMutation = useMutation({
    mutationFn: ({
      setting,
      enabled,
    }: {
      setting: SystemSettingResponse;
      enabled: boolean;
    }) => adminApi.updateIntegration(setting.key, { enabled, config: setting.config }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["integration-settings"] }),
  });

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Integration toggles and non-secret configuration. Secrets live in environment variables and are never shown here."
      />

      {settings.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-40 w-full" />
          ))}
        </div>
      ) : settings.isError ? (
        <p role="alert" className="text-sm text-danger">
          Failed to load integration settings.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {settings.data?.settings.map((setting) => (
            <Card key={setting.key}>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle className="capitalize">
                    {setting.key.replace(/_/g, " ")}
                  </CardTitle>
                  <p className="text-xs text-text-muted">
                    Updated {formatDateTime(setting.updatedAt)}
                  </p>
                </div>
                <Switch
                  checked={setting.enabled}
                  disabled={toggleMutation.isPending}
                  onCheckedChange={(enabled) =>
                    toggleMutation.mutate({ setting, enabled })
                  }
                  aria-label={`Toggle ${setting.key}`}
                />
              </CardHeader>
              <CardContent>
                <ConfigList config={setting.config} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/** Render config entries; secret-looking keys are masked, never their value. */
function ConfigList({ config }: { config: Record<string, unknown> }) {
  const entries = Object.entries(config);
  if (entries.length === 0) {
    return <p className="text-sm text-text-muted">No configuration.</p>;
  }
  return (
    <dl className="flex flex-col gap-2 text-sm">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-center justify-between gap-4">
          <dt className="text-text-muted">{key}</dt>
          <dd className="truncate font-medium text-text">
            {isSecretKey(key) ? (
              <Badge variant="warning">managed in env</Badge>
            ) : (
              previewConfigValue(value)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
