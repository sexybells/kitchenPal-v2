import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { theme } from "../theme";
import { Screen } from "./Screen";
import { Text } from "./Text";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { Icon, type IconName } from "./icons/Icon";

export interface PlaceholderScreenProps {
  title: string;
  icon: IconName;
  /** Show a back button (feature screens opened from the Home menu). */
  showBack?: boolean;
  testID?: string;
}

/**
 * Clearly-labelled placeholder for feature screens delivered in later phases.
 * Keeps navigation wired end-to-end without pretending the feature exists.
 */
export function PlaceholderScreen({
  title,
  icon,
  showBack = true,
  testID,
}: PlaceholderScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Screen scroll={false} testID={testID}>
      <View style={styles.header}>
        <Text variant="heading-l" color="text">
          {title}
        </Text>
        <Badge label={t("placeholder.comingSoon")} tone="primary" />
      </View>
      <View style={styles.body}>
        <View style={styles.iconCircle}>
          <Icon name={icon} size={40} color="primary" />
        </View>
        <Text variant="heading-s" color="text" center>
          {t("placeholder.comingSoon")}
        </Text>
        <Text variant="body-m" color="text-muted" center>
          {t("placeholder.body")}
        </Text>
        {showBack ? (
          <View style={styles.action}>
            <Button
              label={t("common.back")}
              variant="secondary"
              onPress={() => router.back()}
            />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: theme.spacing[8],
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[12],
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors["primary-soft"],
    marginBottom: theme.spacing[8],
  },
  action: { alignSelf: "stretch", marginTop: theme.spacing[16] },
});
