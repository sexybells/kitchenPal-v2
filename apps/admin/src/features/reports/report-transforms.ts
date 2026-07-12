import type {
  AiCostReport,
  AiTrendReport,
  GrowthReport,
  UsageReport,
} from "@kitchenpal/api-contract";

/** A single point on the growth chart. */
export interface GrowthPoint {
  date: string;
  newUsers: number;
  newHouseholds: number;
}

/** Map a growth report to chart points (pure; safe on empty buckets). */
export function growthToSeries(report: GrowthReport): GrowthPoint[] {
  return report.buckets.map((bucket) => ({
    date: bucket.date,
    newUsers: bucket.newUsers,
    newHouseholds: bucket.newHouseholds,
  }));
}

/** A single point on the AI-trend chart, with a derived success rate (%). */
export interface AiTrendPoint {
  date: string;
  calls: number;
  failures: number;
  /** Successful calls as a whole-number percentage; 0 when there were no calls. */
  successRate: number;
}

/** Map an AI-trend report to chart points, deriving the success rate. */
export function aiTrendToSeries(report: AiTrendReport): AiTrendPoint[] {
  return report.buckets.map((bucket) => {
    const successRate =
      bucket.calls > 0
        ? Math.round(((bucket.calls - bucket.failures) / bucket.calls) * 100)
        : 0;
    return {
      date: bucket.date,
      calls: bucket.calls,
      failures: bucket.failures,
      successRate,
    };
  });
}

/** A per-provider cost bar. */
export interface AiCostBar {
  provider: string;
  calls: number;
  costUsd: number;
}

/** Map an AI-cost report to per-provider bars for charting. */
export function aiCostsToProviderSeries(report: AiCostReport): AiCostBar[] {
  return report.byProvider.map((entry) => ({
    provider: entry.provider,
    calls: entry.calls,
    costUsd: entry.costUsd,
  }));
}

/** A labeled metric for the usage snapshot cards. */
export interface UsageMetric {
  key: keyof UsageReport;
  label: string;
  value: number;
}

/** Flatten the usage snapshot into ordered, labeled metric cards. */
export function usageToMetrics(report: UsageReport): UsageMetric[] {
  return [
    { key: "users", label: "Users", value: report.users },
    { key: "households", label: "Households", value: report.households },
    { key: "recipes", label: "Recipes", value: report.recipes },
    { key: "scans", label: "Pantry scans", value: report.scans },
    { key: "aiCalls", label: "AI calls", value: report.aiCalls },
    {
      key: "activeSubscriptions",
      label: "Active subscriptions",
      value: report.activeSubscriptions,
    },
  ];
}
