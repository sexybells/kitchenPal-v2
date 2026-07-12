import { useState, type ReactElement, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  reportBucketSchema,
  type ReportBucket,
} from "@kitchenpal/api-contract";
import { colors } from "@kitchenpal/design-tokens";
import { adminApi } from "@/api/admin";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUsd } from "@/lib/format";
import {
  aiCostsToProviderSeries,
  aiTrendToSeries,
  growthToSeries,
} from "./report-transforms";

const CHART_HEIGHT = 260;

function ChartCard({
  title,
  isLoading,
  isEmpty,
  children,
}: {
  title: string;
  isLoading: boolean;
  isEmpty: boolean;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : isEmpty ? (
          <p className="py-16 text-center text-sm text-text-muted">
            No data for this range.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            {children as ReactElement}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function ReportsPage() {
  const [bucket, setBucket] = useState<ReportBucket>("day");
  const range = { bucket };

  const growth = useQuery({
    queryKey: ["reports", "growth", bucket],
    queryFn: () => adminApi.getGrowth(range),
  });
  const aiTrend = useQuery({
    queryKey: ["reports", "ai-trend", bucket],
    queryFn: () => adminApi.getAiTrend(range),
  });
  const aiCosts = useQuery({
    queryKey: ["reports", "ai-costs", bucket],
    queryFn: () => adminApi.getAiCosts(range),
  });

  const growthSeries = growth.data ? growthToSeries(growth.data) : [];
  const aiTrendSeries = aiTrend.data ? aiTrendToSeries(aiTrend.data) : [];
  const aiCostSeries = aiCosts.data ? aiCostsToProviderSeries(aiCosts.data) : [];

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Growth, AI usage, and cost trends across the platform."
        actions={
          <div className="flex items-center gap-2">
            <Label htmlFor="bucket" className="text-text-muted">
              Bucket
            </Label>
            <Select
              id="bucket"
              value={bucket}
              onChange={(event) => setBucket(event.target.value as ReportBucket)}
              className="w-32"
            >
              {reportBucketSchema.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard
          title="Growth — new users & households"
          isLoading={growth.isLoading}
          isEmpty={growthSeries.length === 0}
        >
          <LineChart data={growthSeries}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
            <XAxis dataKey="date" fontSize={12} />
            <YAxis fontSize={12} allowDecimals={false} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="newUsers"
              name="New users"
              stroke={colors.primary}
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="newHouseholds"
              name="New households"
              stroke={colors.secondary}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartCard>

        <ChartCard
          title="AI calls & failures"
          isLoading={aiTrend.isLoading}
          isEmpty={aiTrendSeries.length === 0}
        >
          <LineChart data={aiTrendSeries}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
            <XAxis dataKey="date" fontSize={12} />
            <YAxis fontSize={12} allowDecimals={false} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="calls"
              name="Calls"
              stroke={colors.info}
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="failures"
              name="Failures"
              stroke={colors.danger}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartCard>

        <ChartCard
          title="AI cost by provider (USD)"
          isLoading={aiCosts.isLoading}
          isEmpty={aiCostSeries.length === 0}
        >
          <BarChart data={aiCostSeries}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
            <XAxis dataKey="provider" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Bar dataKey="costUsd" name="Cost (USD)" fill={colors.accent} />
          </BarChart>
        </ChartCard>

        <Card>
          <CardHeader>
            <CardTitle>AI cost summary</CardTitle>
          </CardHeader>
          <CardContent>
            {aiCosts.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : aiCosts.data ? (
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-text-muted">Total calls</dt>
                  <dd className="text-lg font-semibold text-text">
                    {aiCosts.data.totalCalls.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">Total cost</dt>
                  <dd className="text-lg font-semibold text-text">
                    {formatUsd(aiCosts.data.totalCostUsd)}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">Prompt tokens</dt>
                  <dd className="text-lg font-semibold text-text">
                    {aiCosts.data.totalPromptTokens.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">Completion tokens</dt>
                  <dd className="text-lg font-semibold text-text">
                    {aiCosts.data.totalCompletionTokens.toLocaleString()}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-text-muted">No cost data.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
