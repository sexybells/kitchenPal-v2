import type {
  ExpenseCategory,
  PriceHistoryPoint,
  SpendingStats,
} from "@kitchenpal/api-contract";

/** One category slice of a breakdown, with its share of the total (0..1). */
export interface CategorySlice {
  category: ExpenseCategory;
  total: number;
  /** Fraction of the grand total, 0 when the total is 0. */
  ratio: number;
}

/**
 * Turn raw category totals into breakdown slices sorted high-to-low, each with
 * its share of the grand total. Zero-total categories are dropped so the chart
 * only shows real spend. Pure — the bar view just maps `ratio` to a width.
 */
export function buildCategoryBreakdown(
  byCategory: readonly { category: ExpenseCategory; total: number }[],
): CategorySlice[] {
  const grandTotal = byCategory.reduce((sum, entry) => sum + entry.total, 0);
  return byCategory
    .filter((entry) => entry.total > 0)
    .map((entry) => ({
      category: entry.category,
      total: entry.total,
      ratio: grandTotal > 0 ? entry.total / grandTotal : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

/** A plotted point plus the raw datum, in a fixed pixel box. */
export interface ChartPoint {
  x: number;
  y: number;
  value: number;
  label: string;
}

export interface TrendChart {
  points: ChartPoint[];
  /** SVG polyline path ("" when there is nothing to draw). */
  path: string;
  /** Largest value in the series, used for the axis label. */
  max: number;
}

/**
 * Project a time-bucketed spending series into a fixed-size SVG line chart. The
 * y-axis is scaled to the series max (a flat series sits on the baseline); a
 * single point is centered. Padding keeps the stroke inside the box. Pure so the
 * scaling is unit-testable without a renderer.
 */
export function buildTrendChart(
  series: SpendingStats["series"],
  size: { width: number; height: number; padding?: number },
): TrendChart {
  const padding = size.padding ?? 8;
  const innerW = Math.max(1, size.width - padding * 2);
  const innerH = Math.max(1, size.height - padding * 2);
  const max = series.reduce((peak, point) => Math.max(peak, point.total), 0);

  const points: ChartPoint[] = series.map((point, index) => {
    const x =
      series.length <= 1
        ? padding + innerW / 2
        : padding + (innerW * index) / (series.length - 1);
    // A single point (or an all-zero series) has no range to plot, so it sits on
    // the baseline rather than jumping to the top of the box.
    const y =
      series.length <= 1 || max <= 0
        ? padding + innerH
        : padding + innerH - (innerH * point.total) / max;
    return { x, y, value: point.total, label: point.period };
  });

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${round(point.x)} ${round(point.y)}`)
    .join(" ");

  return { points, path, max };
}

/**
 * Build a mini sparkline path for a price-history item. The contract returns
 * points newest-first; a price trend reads left-to-right oldest-to-newest, so we
 * reverse before plotting. Uses `unitPrice` for the y-axis.
 */
export function buildSparkline(
  points: readonly PriceHistoryPoint[],
  size: { width: number; height: number; padding?: number },
): TrendChart {
  const chronological = [...points].reverse();
  const series = chronological.map((point) => ({
    period: point.date,
    total: point.unitPrice,
  }));
  return buildTrendChart(series, size);
}

const round = (value: number): number => Math.round(value * 100) / 100;
