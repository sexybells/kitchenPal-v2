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
import { expiryInfo } from "../../src/features/pantry/stock";
import {
  useCurrentMealPlan,
  useSuggestionsFromPantry,
} from "../../src/features/recipes/hooks";
import { mealTypeLabel, todayOfWeek } from "../../src/features/recipes/labels";
import { lunarDayLabel } from "../../src/features/recipes/lunar-label";
import { rescueChipText } from "../../src/features/recipes/rescue-label";

interface MenuAction {
  icon: IconName;
  href: Href;
  label: string;
}

/** How many pantry-ranked suggestions the home screen shows. */
const SUGGESTION_COUNT = 3;

/**
 * Home dashboard — pantry stats, today's planned meals, and recipe suggestions
 * ranked against the pantry. The stat row stays the entry point to the pantry
 * (including its expiring/running-low detail); home answers "what do I cook
 * today?" rather than restating those lists.
 */
export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const me = useMe();
  const items = usePantryItems();
  const refill = useRefillSuggestions();
  const plan = useCurrentMealPlan();
  const suggestions = useSuggestionsFromPantry(SUGGESTION_COUNT);

  const menuActions: MenuAction[] = [
    { icon: "spending", href: "/spending", label: t("menu.spending") },
    { icon: "household", href: "/household", label: t("menu.household") },
    { icon: "bell", href: "/notifications", label: t("menu.notifications") },
    { icon: "settings", href: "/settings", label: t("menu.settings") },
  ];

  const greetingName = me.data?.displayName ?? "";
  const allItems = useMemo(() => items.data ?? [], [items.data]);

  const expiringCount = useMemo(
    () =>
      allItems.filter((item) => {
        const info = expiryInfo(item.expiryDate);
        return info !== null && info.level !== "ok";
      }).length,
    [allItems],
  );
  const lowCount = refill.data?.suggestions.length ?? 0;

  // A plan holds every day of the week; home shows only today's slots.
  const todaySlots = useMemo(() => {
    const today = todayOfWeek();
    return (plan.data?.slots ?? []).filter((slot) => slot.dayOfWeek === today);
  }, [plan.data]);
  const suggested = suggestions.data?.suggestions ?? [];
  const day = suggestions.data?.day;

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
        <Stat value={lowCount} label={t("home.statLow")} tone="danger" />
      </Pressable>

      <Section title={t("home.todaysMeals")}>
        {plan.isLoading ? (
          <Card elevated={false} background="surface-alt">
            <LoadingState />
          </Card>
        ) : todaySlots.length === 0 ? (
          // No plan for this week (the query 404s) or none of its slots fall on
          // today — either way the fix is the same: go make a plan.
          <Card elevated={false} background="surface-alt">
            <EmptyState
              title={plan.data ? t("home.todayEmpty") : t("meals.noPlanTitle")}
              body={t("meals.noPlanBody")}
              icon="meals"
              testID="home-today-empty"
            />
          </Card>
        ) : (
          <Card>
            {todaySlots.map((slot) => (
              <Pressable
                key={slot.id}
                accessibilityRole="button"
                accessibilityLabel={slot.recipeName ?? t("meals.addToSlot")}
                onPress={() =>
                  router.push(
                    slot.recipeId ? `/recipe?id=${slot.recipeId}` : "/meals",
                  )
                }
                style={styles.row}
                testID={`home-today-${slot.mealType}`}
              >
                <Text variant="label-s" color="text-muted" style={styles.rowLabel}>
                  {mealTypeLabel(t, slot.mealType)}
                </Text>
                <Text
                  variant="title"
                  color={slot.recipeName ? "text" : "text-subtle"}
                  numberOfLines={1}
                  style={styles.rowValue}
                >
                  {slot.recipeName ?? t("meals.addToSlot")}
                </Text>
                <Icon name="chevron-right" size={18} color="text-subtle" />
              </Pressable>
            ))}
          </Card>
        )}
      </Section>

      <Section title={t("home.suggestions")}>
        {day?.vegetarianPriority ? (
          <Text variant="label-s" color="text-muted" testID="home-veg-day">
            {t("home.vegDayPriority", { lunar: lunarDayLabel(t, day.lunar) })}
          </Text>
        ) : null}
        {suggestions.isLoading ? (
          <Card elevated={false} background="surface-alt">
            <LoadingState />
          </Card>
        ) : suggested.length === 0 ? (
          <Card elevated={false} background="surface-alt">
            <EmptyState
              title={t("home.suggestionsEmpty")}
              icon="meals"
              testID="home-suggestions-empty"
            />
          </Card>
        ) : (
          <Card>
            {suggested.map((suggestion) => (
              <Pressable
                key={suggestion.recipeId}
                accessibilityRole="button"
                accessibilityLabel={suggestion.name}
                onPress={() => router.push(`/recipe?id=${suggestion.recipeId}`)}
                style={styles.row}
                testID={`home-suggestion-${suggestion.recipeId}`}
              >
                <View style={styles.rowValue}>
                  <Text variant="title" color="text" numberOfLines={1}>
                    {suggestion.name}
                  </Text>
                  <Text variant="caption" color="text-muted">
                    {t("home.suggestionMatch", {
                      available: suggestion.availableCount,
                      needed: suggestion.neededCount,
                    })}
                  </Text>
                  {suggestion.isVegetarian || suggestion.rescues.length > 0 ? (
                    <View style={styles.chips}>
                      {suggestion.isVegetarian ? (
                        <Badge
                          label={t("home.vegetarian")}
                          tone="success"
                          uppercase={false}
                          testID={`home-suggestion-veg-${suggestion.recipeId}`}
                        />
                      ) : null}
                      {suggestion.rescues.length > 0 ? (
                        <Badge
                          label={rescueChipText(
                            t,
                            suggestion.rescues.map((r) => r.name),
                          )}
                          tone="warning"
                          uppercase={false}
                          testID={`home-suggestion-rescue-${suggestion.recipeId}`}
                        />
                      ) : null}
                    </View>
                  ) : null}
                </View>
                <Icon name="chevron-right" size={18} color="text-subtle" />
              </Pressable>
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[12],
  },
  // Fixed width so the meal labels line up into a column.
  rowLabel: { width: 56 },
  rowValue: { flex: 1, gap: theme.spacing[4] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[8] },
});
