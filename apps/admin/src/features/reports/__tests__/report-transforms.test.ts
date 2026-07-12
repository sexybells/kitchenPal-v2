import { describe, expect, it } from "vitest";
import type {
  AiCostReport,
  AiTrendReport,
  GrowthReport,
} from "@kitchenpal/api-contract";
import {
  aiCostsToProviderSeries,
  aiTrendToSeries,
  growthToSeries,
} from "../report-transforms";

describe("aiTrendToSeries", () => {
  it("derives the success rate from calls and failures", () => {
    const report: AiTrendReport = {
      bucket: "day",
      buckets: [
        { date: "2026-07-01", calls: 10, failures: 2 },
        { date: "2026-07-02", calls: 4, failures: 1 },
      ],
    };

    const series = aiTrendToSeries(report);

    expect(series[0]).toEqual({
      date: "2026-07-01",
      calls: 10,
      failures: 2,
      successRate: 80,
    });
    expect(series[1]?.successRate).toBe(75);
  });

  it("reports a 0 success rate when there were no calls (no divide by zero)", () => {
    const report: AiTrendReport = {
      bucket: "day",
      buckets: [{ date: "2026-07-03", calls: 0, failures: 0 }],
    };

    expect(aiTrendToSeries(report)[0]?.successRate).toBe(0);
  });
});

describe("growthToSeries", () => {
  it("maps growth buckets to chart points", () => {
    const report: GrowthReport = {
      bucket: "week",
      buckets: [{ date: "2026-W27", newUsers: 5, newHouseholds: 3 }],
    };

    expect(growthToSeries(report)).toEqual([
      { date: "2026-W27", newUsers: 5, newHouseholds: 3 },
    ]);
  });
});

describe("aiCostsToProviderSeries", () => {
  it("projects per-provider cost bars", () => {
    const report: AiCostReport = {
      totalCalls: 3,
      totalPromptTokens: 100,
      totalCompletionTokens: 50,
      totalCostUsd: 0.42,
      byProvider: [
        {
          provider: "openai",
          calls: 3,
          promptTokens: 100,
          completionTokens: 50,
          costUsd: 0.42,
        },
      ],
    };

    expect(aiCostsToProviderSeries(report)).toEqual([
      { provider: "openai", calls: 3, costUsd: 0.42 },
    ]);
  });
});
