import { useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import type { SpendingStats } from "@kitchenpal/api-contract";
import { theme } from "../../theme";
import { buildTrendChart } from "./analytics";

export interface TrendChartProps {
  series: SpendingStats["series"];
  height?: number;
  testID?: string;
}

/**
 * A spending-trend line chart drawn with react-native-svg. The line geometry is
 * computed by `buildTrendChart` (pure, tested); this component only measures the
 * available width and renders the resulting path + point markers, token-styled.
 */
export function TrendChart({ series, height = 140, testID }: TrendChartProps) {
  const [width, setWidth] = useState(0);

  const onLayout = (event: LayoutChangeEvent) =>
    setWidth(event.nativeEvent.layout.width);

  const chart =
    width > 0 ? buildTrendChart(series, { width, height }) : null;

  return (
    <View style={styles.wrap} onLayout={onLayout} testID={testID}>
      {chart ? (
        <Svg width={width} height={height}>
          {chart.path ? (
            <Path
              d={chart.path}
              stroke={theme.colors.primary}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="none"
            />
          ) : null}
          {chart.points.map((point) => (
            <Circle
              key={point.label}
              cx={point.x}
              cy={point.y}
              r={3}
              fill={theme.colors.primary}
            />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
});
