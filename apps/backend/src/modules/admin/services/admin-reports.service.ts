import { Injectable } from "@nestjs/common";
import type {
  AiCostReport,
  AiTrendReport,
  GrowthReport,
  ReportBucket,
  ReportRangeQuery,
  UsageReport,
} from "@kitchenpal/api-contract";
import { SubscriptionsService } from "../../subscriptions/services/subscriptions.service";
import {
  AdminAiLogReadRepository,
  AdminHouseholdReadRepository,
  AdminRecipeRepository,
  AdminScanReadRepository,
  AdminUserReadRepository,
} from "../repositories/admin-read.repository";

/** `$dateToString` format per bucket. Week uses ISO year-week (`%G-W%V`). */
const BUCKET_FORMAT: Record<ReportBucket, string> = {
  day: "%Y-%m-%d",
  week: "%G-W%V",
  month: "%Y-%m",
};

/** Default lookback window (days) per bucket when the caller omits `from`. */
const DEFAULT_LOOKBACK_DAYS: Record<ReportBucket, number> = {
  day: 30,
  week: 90,
  month: 365,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Aggregation-backed admin reports. All pipelines are bounded to a time window
 * (defaulted per bucket) and grouped in UTC so buckets are deterministic.
 */
@Injectable()
export class AdminReportsService {
  constructor(
    private readonly users: AdminUserReadRepository,
    private readonly households: AdminHouseholdReadRepository,
    private readonly recipes: AdminRecipeRepository,
    private readonly scans: AdminScanReadRepository,
    private readonly aiLogs: AdminAiLogReadRepository,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async usage(): Promise<UsageReport> {
    const [users, households, recipes, scans, aiCalls, activeSubscriptions] =
      await Promise.all([
        this.users.count(),
        this.households.count(),
        this.recipes.count(),
        this.scans.count(),
        this.aiLogs.count(),
        this.subscriptions.countActiveSubscriptions(),
      ]);
    return { users, households, recipes, scans, aiCalls, activeSubscriptions };
  }

  async growth(query: ReportRangeQuery): Promise<GrowthReport> {
    const { from, to, format } = this.resolveWindow(query);
    const [userBuckets, householdBuckets] = await Promise.all([
      this.users.countCreatedByBucket(from, to, format),
      this.households.countCreatedByBucket(from, to, format),
    ]);
    const byDate = new Map<string, { newUsers: number; newHouseholds: number }>();
    for (const { date, count } of userBuckets) {
      byDate.set(date, { newUsers: count, newHouseholds: 0 });
    }
    for (const { date, count } of householdBuckets) {
      const row = byDate.get(date) ?? { newUsers: 0, newHouseholds: 0 };
      row.newHouseholds = count;
      byDate.set(date, row);
    }
    const buckets = Array.from(byDate.entries())
      .map(([date, row]) => ({ date, ...row }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return { bucket: query.bucket, buckets };
  }

  async aiTrend(query: ReportRangeQuery): Promise<AiTrendReport> {
    const { from, to, format } = this.resolveWindow(query);
    const buckets = await this.aiLogs.aggregateTrend(from, to, format);
    return { bucket: query.bucket, buckets };
  }

  async aiCosts(query: ReportRangeQuery): Promise<AiCostReport> {
    const { from, to } = this.resolveWindow(query);
    const byProvider = await this.aiLogs.aggregateCostByProvider(from, to);
    return {
      totalCalls: sum(byProvider, (p) => p.calls),
      totalPromptTokens: sum(byProvider, (p) => p.promptTokens),
      totalCompletionTokens: sum(byProvider, (p) => p.completionTokens),
      totalCostUsd: sum(byProvider, (p) => p.costUsd),
      byProvider,
    };
  }

  private resolveWindow(query: ReportRangeQuery): {
    from: Date;
    to: Date;
    format: string;
  } {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - DEFAULT_LOOKBACK_DAYS[query.bucket] * DAY_MS);
    return { from, to, format: BUCKET_FORMAT[query.bucket] };
  }
}

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((acc, item) => acc + pick(item), 0);
}
