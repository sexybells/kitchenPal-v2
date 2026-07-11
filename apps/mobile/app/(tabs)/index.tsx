import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  Screen,
  Text,
  Card,
  Avatar,
  Badge,
  EmptyState,
  LoadingState,
  Icon,
} from "../../src/ui";
import type { IconName } from "../../src/ui";
import { theme } from "../../src/theme";
import { useMe } from "../../src/api/hooks";
import {
  usePantryItems,
  useRefillSuggestions,
} from "../../src/features/pantry/hooks";
import { PantryItemRow } from "../../src/features/pantry/PantryItemRow";
import { StockPill } from "../../src/features/pantry/StockPill";
import { expiryInfo } from "../../src/features/pantry/stock";

interface MenuAction {
  icon: IconName;
  href: Href;
  label: string;
}

/** Home dashboard — pantry stats, expiring-soon, and running-low widgets. */
export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const me = useMe();
  const items = usePantryItems();
  const refill = useRefillSuggestions();

  const menuActions: MenuAction[] = [
    { icon: "spending", href: "/spending", label: t("menu.spending") },
    { icon: "household", href: "/household", label: t("menu.household") },
    { icon: "bell", href: "/notifications", label: t("menu.notifications") },
    { icon: "settings", href: "/settings", label: t("menu.settings") },
  ];

  const greetingName = me.data?.displayName ?? "";
  const allItems = useMemo(() => items.data ?? [], [items.data]);

  // The list arrives sorted by expiry (soonest first, no-expiry last), so the
  // first few dated items are exactly the "expiring soon" widget.
  const expiringSoon = useMemo(
    () => allItems.filter((item) => item.expiryDate).slice(0, 3),
    [allItems],
  );
  const expiringCount = useMemo(
    () =>
      allItems.filter((item) => {
        const info = expiryInfo(item.expiryDate);
        return info !== null && info.level !== "ok";
      }).length,
    [allItems],
  );
  const suggestions = refill.data?.suggestions ?? [];

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

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/pantry")}
        style={styles.statsRow}
        testID="home-stats"
      >
        <Stat value={allItems.length} label={t("home.statItems")} />
        <Stat value={expiringCount} label={t("home.statExpiring")} tone="warning" />
        <Stat value={suggestions.length} label={t("home.statLow")} tone="danger" />
      </Pressable>

      <Section title={t("home.expiringSoon")}>
        {items.isLoading ? (
          <Card elevated={false} background="surface-alt">
            <LoadingState />
          </Card>
        ) : expiringSoon.length === 0 ? (
          <Card elevated={false} background="surface-alt">
            <EmptyState title={t("states.emptyTitle")} icon="leaf" />
          </Card>
        ) : (
          <Card>
            {expiringSoon.map((item) => (
              <PantryItemRow
                key={item.id}
                item={item}
                onPress={() => router.push(`/pantry-item?id=${item.id}`)}
                testID={`home-expiring-${item.id}`}
              />
            ))}
          </Card>
        )}
      </Section>

      <Section title={t("home.runningLow")}>
        {suggestions.length === 0 ? (
          <Card elevated={false} background="surface-alt">
            <EmptyState title={t("cook.refillEmpty")} icon="shopping" />
          </Card>
        ) : (
          <Card>
            {suggestions.slice(0, 4).map((suggestion) => (
              <View key={suggestion.pantryItemId} style={styles.lowRow}>
                <Text variant="title" color="text" numberOfLines={1} style={styles.lowName}>
                  {suggestion.name}
                </Text>
                <StockPill state={suggestion.stockState} />
              </View>
            ))}
          </Card>
        )}
      </Section>
    </Screen>
  );
}

function Stat({
  value,
  label,
  tone = "text",
}: {
  value: number;
  label: string;
  tone?: "text" | "warning" | "danger";
}) {
  return (
    <View style={styles.stat}>
      <Text variant="display-m" color={tone === "text" ? "text" : tone}>
        {value}
      </Text>
      <Text variant="caption" color="text-muted" center numberOfLines={2}>
        {label}
      </Text>
    </View>
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
  statsRow: {
    flexDirection: "row",
    gap: theme.spacing[12],
    marginTop: theme.spacing[24],
    padding: theme.spacing[16],
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  stat: { flex: 1, alignItems: "center", gap: theme.spacing[4] },
  section: { marginTop: theme.spacing[28], gap: theme.spacing[12] },
  lowRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[12],
  },
  lowName: { flex: 1 },
});
