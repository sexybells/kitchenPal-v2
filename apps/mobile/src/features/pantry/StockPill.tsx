import { useTranslation } from "react-i18next";
import type { StockState } from "@kitchenpal/api-contract";
import { Badge } from "../../ui";
import { STOCK_TONE } from "./stock";

export interface StockPillProps {
  state: StockState;
  testID?: string;
}

/** Stock-state pill: the design token color mapping + localized label. */
export function StockPill({ state, testID }: StockPillProps) {
  const { t } = useTranslation();
  return (
    <Badge label={t(`pantry.stock.${state}`)} tone={STOCK_TONE[state]} testID={testID} />
  );
}
