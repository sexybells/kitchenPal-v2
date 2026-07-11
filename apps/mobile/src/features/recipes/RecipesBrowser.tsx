import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { MealType, RecipeResponse } from "@kitchenpal/api-contract";
import {
  Text,
  Input,
  Chip,
  Button,
  Icon,
  LoadingState,
  EmptyState,
  ErrorState,
} from "../../ui";
import { theme } from "../../theme";
import { resolveErrorMessage } from "../../lib/error-message";
import {
  useRecipeList,
  useToggleFavorite,
  type RecipeCollection,
} from "./hooks";
import { RecipeCard } from "./RecipeCard";
import { MEAL_TYPES, mealTypeLabel } from "./labels";

export interface RecipesBrowserProps {
  onOpenRecipe: (id: string) => void;
  onImport: () => void;
}

const COLLECTIONS: readonly RecipeCollection[] = [
  "mine",
  "community",
  "favorites",
];

/**
 * The "Công thức" recipe browser: switch between own / community / favorites,
 * filter by search + meal type, and open a card. The favorite heart toggles
 * optimistically via a local overlay merged onto each card's default state
 * (favorites collection ⇒ favorited by definition).
 */
export function RecipesBrowser({ onOpenRecipe, onImport }: RecipesBrowserProps) {
  const { t } = useTranslation();
  const [collection, setCollection] = useState<RecipeCollection>("mine");
  const [search, setSearch] = useState("");
  const [mealType, setMealType] = useState<MealType | null>(null);
  // Optimistic per-recipe favorite overrides keyed by id (undefined = default).
  const [favOverride, setFavOverride] = useState<Record<string, boolean>>({});

  const query = useMemo(
    () => ({ mealType: mealType ?? undefined }),
    [mealType],
  );
  const recipes = useRecipeList(collection, query);
  const toggleFavorite = useToggleFavorite();

  const isFavorited = (recipe: RecipeResponse): boolean =>
    favOverride[recipe.id] ?? collection === "favorites";

  const onToggleFavorite = (recipe: RecipeResponse) => {
    const next = !isFavorited(recipe);
    setFavOverride((prev) => ({ ...prev, [recipe.id]: next }));
    toggleFavorite.mutate(
      { id: recipe.id, favorite: next },
      // Roll back the local overlay if the server rejects the toggle.
      { onError: () => setFavOverride((prev) => ({ ...prev, [recipe.id]: !next })) },
    );
  };

  const all = useMemo(() => recipes.data ?? [], [recipes.data]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return all;
    return all.filter((recipe) => recipe.name.toLowerCase().includes(term));
  }, [all, search]);

  // Featured: the highest-rated recipe in the community feed, shown above the grid.
  const featured =
    collection === "community" && filtered.length > 0 ? filtered[0] : null;
  const grid = featured ? filtered.slice(1) : filtered;

  return (
    <View style={styles.container} testID="recipes-browser">
      <View style={styles.collectionRow}>
        {COLLECTIONS.map((value) => (
          <Chip
            key={value}
            label={t(`meals.collection.${value}`)}
            selected={collection === value}
            onPress={() => setCollection(value)}
            testID={`recipes-collection-${value}`}
          />
        ))}
      </View>

      <Input
        placeholder={t("meals.searchRecipes")}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        testID="recipes-search"
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={styles.chipsScroll}
      >
        <Chip
          label={t("meals.allMealTypes")}
          selected={mealType === null}
          onPress={() => setMealType(null)}
        />
        {MEAL_TYPES.map((value) => (
          <Chip
            key={value}
            label={mealTypeLabel(t, value)}
            selected={mealType === value}
            onPress={() => setMealType(value)}
          />
        ))}
      </ScrollView>

      {renderBody()}

      <Button
        label={t("meals.importRecipe")}
        variant="secondary"
        icon="plus"
        onPress={onImport}
        testID="recipes-import"
      />
    </View>
  );

  function renderBody() {
    if (recipes.isLoading) return <LoadingState label={t("common.loading")} />;
    if (recipes.isError) {
      return (
        <ErrorState
          title={t("states.errorTitle")}
          body={resolveErrorMessage(recipes.error, t) ?? t("states.errorBody")}
          retryLabel={t("common.retry")}
          onRetry={() => recipes.refetch()}
          testID="recipes-error"
        />
      );
    }
    if (filtered.length === 0) {
      return (
        <EmptyState
          title={t("meals.recipesEmptyTitle")}
          body={t("meals.recipesEmptyBody")}
          icon="meals"
          testID="recipes-empty"
        />
      );
    }
    return (
      <View testID="recipes-list">
        {featured ? (
          <FeaturedRecipe
            recipe={featured}
            onPress={() => onOpenRecipe(featured.id)}
          />
        ) : null}
        <View style={styles.grid}>
          {grid.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              favorited={isFavorited(recipe)}
              onPress={() => onOpenRecipe(recipe.id)}
              onToggleFavorite={() => onToggleFavorite(recipe)}
              testID={`recipe-card-${recipe.id}`}
            />
          ))}
        </View>
      </View>
    );
  }
}

/** Wide highlight card for the top-rated community recipe. */
function FeaturedRecipe({
  recipe,
  onPress,
}: {
  recipe: RecipeResponse;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.featured} testID="recipes-featured">
      <View style={styles.featuredHead}>
        <Icon name="sparkles" size={16} color="primary" />
        <Text variant="label-s" color="primary">
          {t("meals.featured")}
        </Text>
      </View>
      <Text
        variant="heading-s"
        color="text"
        numberOfLines={2}
        onPress={onPress}
        testID="recipes-featured-title"
      >
        {recipe.name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing[12], flex: 1 },
  collectionRow: { flexDirection: "row", gap: theme.spacing[8] },
  chipsScroll: { flexGrow: 0 },
  chips: { gap: theme.spacing[8], paddingRight: theme.spacing[8] },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  featured: {
    gap: theme.spacing[8],
    padding: theme.spacing[16],
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors["primary-soft"],
    marginBottom: theme.spacing[16],
  },
  featuredHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[4],
  },
});
