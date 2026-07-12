import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { Locale } from "@kitchenpal/api-contract";
import { Screen, Text, Button, Card, ListRow, Badge, Icon } from "../src/ui";
import { theme } from "../src/theme";
import { useUiStore } from "../src/store/ui";
import { useSessionStore } from "../src/store/session";
import { SUPPORTED_LOCALES, changeLocale } from "../src/i18n";
import { useMySubscription } from "../src/features/subscription/hooks";

const LOCALE_LABEL_KEY: Record<Locale, "language.vietnamese" | "language.english"> = {
  vi: "language.vietnamese",
  en: "language.english",
};

/** Settings — real for the foundation: locale switch + sign out. */
export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const locale = useUiStore((state) => state.locale);
  const setLocale = useUiStore((state) => state.setLocale);
  const signOut = useSessionStore((state) => state.signOut);
  const mine = useMySubscription();
  const isPro = mine.data?.tier === "pro";

  const selectLocale = async (next: Locale) => {
    setLocale(next);
    await changeLocale(next);
  };

  return (
    <Screen>
      <View style={styles.top}>
        <Button
          label={t("common.back")}
          variant="ghost"
          fullWidth={false}
          icon="chevron-left"
          onPress={() => router.back()}
        />
      </View>

      <Text variant="heading-l" color="text" style={styles.title}>
        {t("menu.settings")}
      </Text>

      <Text variant="label-m" color="text-muted" style={styles.sectionLabel}>
        {t("paywall.settingsRow")}
      </Text>
      <Card padded={false} style={styles.card}>
        <ListRow
          title={t("menu.paywall")}
          leadingIcon="sparkles"
          onPress={() => router.push("/paywall")}
          trailing={
            <Badge
              label={isPro ? t("paywall.planPro") : t("paywall.planFree")}
              tone={isPro ? "primary" : "neutral"}
              testID="settings-plan-badge"
            />
          }
          testID="settings-subscription"
        />
      </Card>

      <Text variant="label-m" color="text-muted" style={styles.sectionLabel}>
        {t("language.title")}
      </Text>
      <Card padded={false} style={styles.card}>
        {SUPPORTED_LOCALES.map((code) => (
          <ListRow
            key={code}
            title={t(LOCALE_LABEL_KEY[code])}
            leadingIcon="globe"
            onPress={() => selectLocale(code)}
            trailing={
              locale === code ? <Icon name="check" size={22} color="primary" /> : undefined
            }
          />
        ))}
      </Card>

      <View style={styles.footer}>
        <Button
          label={t("common.signOut")}
          variant="secondary"
          onPress={() => signOut()}
          testID="settings-sign-out"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: "flex-start", paddingTop: theme.spacing[8] },
  title: { marginTop: theme.spacing[8] },
  sectionLabel: { marginTop: theme.spacing[24], marginBottom: theme.spacing[8] },
  card: { paddingHorizontal: theme.spacing[16] },
  footer: { marginTop: theme.spacing[32] },
});
