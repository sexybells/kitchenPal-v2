import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/api/admin";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usageToMetrics } from "@/features/reports/report-transforms";

/** Landing screen: a live usage snapshot as metric cards. */
export function DashboardPage() {
  const usage = useQuery({
    queryKey: ["reports", "usage"],
    queryFn: () => adminApi.getUsage(),
  });

  const metrics = usage.data ? usageToMetrics(usage.data) : [];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="A snapshot of platform usage across all tenants."
      />
      {usage.isError ? (
        <p className="text-sm text-danger">Failed to load usage metrics.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {usage.isLoading
            ? Array.from({ length: 6 }).map((_, index) => (
                <Card key={index}>
                  <CardContent className="p-6">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="mt-3 h-8 w-16" />
                  </CardContent>
                </Card>
              ))
            : metrics.map((metric) => (
                <Card key={metric.key}>
                  <CardContent className="p-6">
                    <p className="text-sm text-text-muted">{metric.label}</p>
                    <p className="mt-2 text-3xl font-bold text-text">
                      {metric.value.toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              ))}
        </div>
      )}

      <Card className="mt-6 border-accent">
        <CardContent className="p-6">
          <p className="text-sm font-semibold text-text">
            Monetization is admin-only in v1
          </p>
          <p className="mt-1 text-sm text-text-muted">
            Subscriptions are assigned by administrators. There is no self-serve
            purchase flow yet — users can only be moved to Pro from the
            Subscriptions screen.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
