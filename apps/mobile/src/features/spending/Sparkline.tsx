import Svg, { Path } from "react-native-svg";
import type { PriceHistoryPoint } from "@kitchenpal/api-contract";
import { theme, type ColorToken } from "../../theme";
import { buildSparkline } from "./analytics";

export interface SparklineProps {
  points: readonly PriceHistoryPoint[];
  width?: number;
  height?: number;
  color?: ColorToken;
  testID?: string;
}

/**
 * A fixed-size unit-price sparkline for a price-history row. Reverses the
 * newest-first points to read left-to-right in time (handled by
 * `buildSparkline`) and draws a single stroked path.
 */
export function Sparkline({
  points,
  width = 72,
  height = 28,
  color = "secondary",
  testID,
}: SparklineProps) {
  const chart = buildSparkline(points, { width, height, padding: 4 });
  return (
    <Svg width={width} height={height} testID={testID}>
      {chart.path ? (
        <Path
          d={chart.path}
          stroke={theme.colors[color]}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="none"
        />
      ) : null}
    </Svg>
  );
}
