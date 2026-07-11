import { useTranslation } from "react-i18next";
import { PlaceholderScreen } from "../src/ui";

/** Notifications — later-phase feature; stubbed for navigation. */
export default function NotificationsScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t("menu.notifications")} icon="bell" />;
}
