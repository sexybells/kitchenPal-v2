import { useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  Screen,
  ScreenHeader,
  Text,
  Input,
  Chip,
  Button,
  Icon,
  LoadingState,
  EmptyState,
  ErrorState,
} from "../../src/ui";
import { theme } from "../../src/theme";
import { usePantryItems } from "../../src/features/pantry/hooks";
import { PantryItemRow } from "../../src/features/pantry/PantryItemRow";
import { categoryLabel, groupByCategory } from "../../src/features/pantry/stock";
import { resolveErrorMessage } from "../../src/lib/error-message";

/** Pantry tab — grouped items with stock pills, search, and category filters. */
export default function PantryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const items = usePantryItems();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const allItems = useMemo(() => items.data ?? [], [items.data]);

  // Category filters are derived from the data so only present ones show.
  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const item of allItems) {
      if (!seen.includes(item.category)) seen.push(item.category);
    }
    return seen;
  }, [allItems]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allItems.filter((item) => {
      if (category && item.category !== category) return false;
      if (term && !item.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [allItems, category, search]);

  const groups = useMemo(() => groupByCategory(filtered), [filtered]);
  const hasItems = allItems.length > 0;

  const renderBody = () => {
    if (items.isLoading) return <LoadingState label={t("common.loading")} />;
    if (items.isError) {
      return (
        <ErrorState
          title={t("states.errorTitle")}
          body={resolveErrorMessage(items.error, t) ?? t("states.errorBody")}
          retryLabel={t("common.retry")}
          onRetry={() => items.refetch()}
          testID="pantry-error"
        />
      );
    }
    if (!hasItems) {
      return (
        <EmptyState
          title={t("pantry.emptyTitle")}
          body={t("pantry.emptyBody")}
          icon="pantry"
          testID="pantry-empty"
        />
      );
    }
    if (groups.length === 0) {
      return (
        <EmptyState
          title={t("pantry.noResultsTitle")}
          body={t("pantry.noResultsBody")}
          icon="pantry"
          testID="pantry-no-results"
        />
      );
    }
    return (
      <View style={styles.groups} testID="pantry-list">
        {groups.map((group) => (
          <View key={group.category} style={styles.group}>
            <Text variant="label-m" color="text-muted">
              {categoryLabel(t, group.category)}
            </Text>
            <View style={styles.groupItems}>
              {group.items.map((item) => (
                <PantryItemRow
                  key={item.id}
                  item={item}
                  onPress={() => router.push(`/pantry-item?id=${item.id}`)}
                  testID={`pantry-item-${item.id}`}
                />
              ))}
            </View>
          </View>
        ))}
      </View>
    );
  };

  return (
    <Screen scroll={false}>
      <ScreenHeader
        title={t("pantry.title")}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("pantry.addItem")}
            onPress={() => router.push("/pantry-item")}
            style={styles.addButton}
            testID="pantry-add"
          >
            <Icon name="plus" size={22} color="text-inverse" />
          </Pressable>
        }
      />

      <Input
        placeholder={t("pantry.searchPlaceholder")}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        testID="pantry-search"
      />

      {hasItems ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
          style={styles.filtersScroll}
        >
          <Chip
            label={t("pantry.allCategories")}
            selected={category === null}
            onPress={() => setCategory(null)}
          />
          {categories.map((value) => (
            <Chip
              key={value}
              label={categoryLabel(t, value)}
              selected={category === value}
              onPress={() => setCategory(value)}
            />
          ))}
        </ScrollView>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={items.isRefetching}
            onRefresh={() => items.refetch()}
            tintColor={theme.colors.primary}
          />
        }
      >
        {renderBody()}
        {hasItems ? (
          <Button
            label={t("pantry.cookFromPantry")}
            variant="secondary"
            icon="meals"
            onPress={() => router.push("/cook")}
            testID="pantry-cook"
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  addButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  filtersScroll: { marginTop: theme.spacing[12], flexGrow: 0 },
  filters: { gap: theme.spacing[8], paddingRight: theme.spacing[8] },
  body: {
    paddingTop: theme.spacing[16],
    paddingBottom: theme.spacing[32],
    gap: theme.spacing[20],
    flexGrow: 1,
  },
  groups: { gap: theme.spacing[24], flex: 1, minHeight: 240 },
  group: { gap: theme.spacing[8] },
  groupItems: { gap: theme.spacing[4] },
});
