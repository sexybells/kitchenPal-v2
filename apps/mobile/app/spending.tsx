import { useTranslation } from "react-i18next";
import { PlaceholderScreen } from "../src/ui";

/** Spending — later-phase feature; stubbed so Home-menu navigation works. */
export default function SpendingScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t("menu.spending")} icon="spending" />;
}
