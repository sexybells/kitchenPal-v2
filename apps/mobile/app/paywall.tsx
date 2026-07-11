import { useTranslation } from "react-i18next";
import { PlaceholderScreen } from "../src/ui";

/** Paywall (Pro) — monetization is deferred; stubbed for navigation. */
export default function PaywallScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t("menu.paywall")} icon="alert" />;
}
