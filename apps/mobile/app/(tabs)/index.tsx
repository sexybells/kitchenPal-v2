import { Pressable, StyleSheet, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen, Text, Card, Avatar, Badge, EmptyState, Icon } from "../../src/ui";
import type { IconName } from "../../src/ui";
import { theme } from "../../src/theme";
import { useMe } from "../../src/api/hooks";

interface MenuAction {
  icon: IconName;
  href: Href;
  label: string;
}

/** Home dashboard. Header menu routes out to the later-phase feature screens. */
export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const me = useMe();

  const menuActions: MenuAction[] = [
    { icon: "spending", href: "/spending", label: t("menu.spending") },
    { icon: "household", href: "/household", label: t("menu.household") },
    { icon: "bell", href: "/notifications", label: t("menu.notifications") },
    { icon: "settings", href: "/settings", label: t("menu.settings") },
  ];

  const greetingName = me.data?.displayName ?? "";

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.greeting}>
          <Text variant="body-m" color="text-muted">
            {t("home.greeting")}
          </Text>
          <Text variant="heading-l" color="text" numberOfLines={1}>
            {greetingName || t("common.appName")}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("menu.settings")}
          onPress={() => router.push("/settings")}
        >
          <Avatar name={greetingName || "KitchenPal"} uri={me.data?.avatarUrl} />
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/paywall")}
        style={styles.proBanner}
      >
        <View style={styles.proText}>
          <Badge label="Pro" tone="primary" />
          <Text variant="label-m" color="text">
            {t("menu.paywall")}
          </Text>
        </View>
        <Icon name="chevron-right" size={20} color="text-subtle" />
      </Pressable>

      <View style={styles.menuRow}>
        {menuActions.map((action) => (
          <Pressable
            key={action.icon}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={() => router.push(action.href)}
            style={styles.menuItem}
            testID={`home-menu-${action.icon}`}
          >
            <View style={styles.menuIcon}>
              <Icon name={action.icon} size={22} color="primary" />
            </View>
            <Text variant="label-s" color="text-muted" center numberOfLines={1}>
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Section title={t("home.expiringSoon")}>
        <Card elevated={false} background="surface-alt">
          <EmptyState
            title={t("states.emptyTitle")}
            body={t("states.emptyBody")}
            icon="leaf"
          />
        </Card>
      </Section>

      <Section title={t("home.todaysMeals")}>
        <Card elevated={false} background="surface-alt">
          <EmptyState title={t("states.emptyTitle")} icon="meals" />
        </Card>
      </Section>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="heading-s" color="text">
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: theme.spacing[8],
  },
  greeting: { flex: 1, gap: theme.spacing[4] },
  proBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors["accent-soft"],
    borderRadius: theme.radius.lg,
    padding: theme.spacing[16],
    marginTop: theme.spacing[20],
  },
  proText: { flexDirection: "row", alignItems: "center", gap: theme.spacing[8] },
  menuRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: theme.spacing[20],
  },
  menuItem: { flex: 1, alignItems: "center", gap: theme.spacing[8] },
  menuIcon: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors["primary-soft"],
    alignItems: "center",
    justifyContent: "center",
  },
  section: { marginTop: theme.spacing[28], gap: theme.spacing[12] },
});
