import { useTranslation } from "react-i18next";
import { PlaceholderScreen } from "../src/ui";

/** Household & Chat — later-phase feature; stubbed for navigation. */
export default function HouseholdScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t("menu.household")} icon="household" />;
}
