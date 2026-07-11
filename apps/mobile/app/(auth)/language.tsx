import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { Locale } from "@kitchenpal/api-contract";
import { Screen, Text, Button, Card, Icon } from "../../src/ui";
import { theme } from "../../src/theme";
import { useUiStore } from "../../src/store/ui";
import { SUPPORTED_LOCALES, changeLocale } from "../../src/i18n";

const LOCALE_LABEL_KEY: Record<Locale, "language.vietnamese" | "language.english"> = {
  vi: "language.vietnamese",
  en: "language.english",
};

/** Language Gate — first launch locale selection (locale codes, vi default). */
export default function LanguageScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const locale = useUiStore((state) => state.locale);
  const setLocale = useUiStore((state) => state.setLocale);

  const select = async (next: Locale) => {
    setLocale(next);
    await changeLocale(next);
  };

  return (
    <Screen scroll={false}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Icon name="globe" size={32} color="primary" />
        </View>
        <Text variant="display-m" color="text">
          {t("language.title")}
        </Text>
        <Text variant="body-l" color="text-muted">
          {t("language.subtitle")}
        </Text>
      </View>

      <View style={styles.options}>
        {SUPPORTED_LOCALES.map((code) => {
          const selected = locale === code;
          return (
            <Card
              key={code}
              onPress={() => select(code)}
              accessibilityLabel={t(LOCALE_LABEL_KEY[code])}
              style={selected ? styles.selectedCard : undefined}
            >
              <View style={styles.optionRow}>
                <Text variant="title" color="text">
                  {t(LOCALE_LABEL_KEY[code])}
                </Text>
                {selected ? <Icon name="check" size={22} color="primary" /> : null}
              </View>
            </Card>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Button
          label={t("common.continue")}
          onPress={() => router.push("/(auth)/onboarding")}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: theme.spacing[8], paddingTop: theme.spacing[32] },
  badge: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors["primary-soft"],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing[8],
  },
  options: { gap: theme.spacing[12], marginTop: theme.spacing[32] },
  selectedCard: { borderColor: theme.colors.primary, borderWidth: 1.5 },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footer: { flex: 1, justifyContent: "flex-end", paddingBottom: theme.spacing[16] },
});
