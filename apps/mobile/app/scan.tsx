import { useTranslation } from "react-i18next";
import { PlaceholderScreen } from "../src/ui";

/** Scan / Add modal — camera + review flow arrives in a later phase. */
export default function ScanScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t("tabs.add")} icon="scan" testID="scan-screen" />;
}
