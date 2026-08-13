import { Image, Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { RecipeResponse } from "@kitchenpal/api-contract";
import { Text, Icon } from "../../ui";
import { theme } from "../../theme";
import { dishPlaceholder } from "./dish-placeholder";

export interface RecipeCardProps {
  recipe: RecipeResponse;
  favorited: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
  testID?: string;
}

/**
 * Grid card for a recipe: image (or a dish placeholder when none), name,
 * cook-time + rating meta, and an optimistic favorite heart. Sized to sit two
 * per row inside a wrapping flex container.
 */
export function RecipeCard({
  recipe,
  favorited,
  onPress,
  onToggleFavorite,
  testID,
}: RecipeCardProps) {
  const { t } = useTranslation();
  const placeholder = dishPlaceholder(recipe.name, recipe.mealType);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={recipe.name}
      style={styles.card}
      testID={testID}
    >
      <View
        style={[
          styles.thumb,
          recipe.imageUrl
            ? null
            : { backgroundColor: theme.colors[placeholder.background] },
        ]}
      >
        {recipe.imageUrl ? (
          <Image
            source={{ uri: recipe.imageUrl }}
            style={styles.image}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Text variant="display-l" center>
            {placeholder.emoji}
          </Text>
        )}
        <Pressable
          onPress={onToggleFavorite}
          accessibilityRole="button"
          accessibilityLabel={t("meals.favorite")}
          accessibilityState={{ selected: favorited }}
          hitSlop={8}
          style={styles.heart}
          testID={testID ? `${testID}-fav` : undefined}
        >
          <Icon
            name={favorited ? "heart-filled" : "heart"}
            size={18}
            color={favorited ? "primary" : "text-muted"}
          />
        </Pressable>
      </View>

      <Text variant="title" color="text" numberOfLines={2} style={styles.name}>
        {recipe.name}
      </Text>
      <View style={styles.meta}>
        {recipe.cookTimeMinutes != null ? (
          <View style={styles.metaItem}>
            <Icon name="clock" size={14} color="text-muted" />
            <Text variant="label-s" color="text-muted">
              {t("meals.minutes", { count: recipe.cookTimeMinutes })}
            </Text>
          </View>
        ) : null}
        {recipe.reviewCount > 0 ? (
          <View style={styles.metaItem}>
            <Icon name="star-filled" size={14} color="accent" />
            <Text variant="label-s" color="text-muted">
              {recipe.averageRating.toFixed(1)}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "48%",
    gap: theme.spacing[8],
    marginBottom: theme.spacing[16],
  },
  thumb: {
    aspectRatio: 1,
    borderRadius: theme.radius.thumb,
    backgroundColor: theme.colors["surface-alt"],
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%" },
  heart: {
    position: "absolute",
    top: theme.spacing[8],
    right: theme.spacing[8],
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { minHeight: 48 },
  meta: { flexDirection: "row", gap: theme.spacing[12] },
  metaItem: { flexDirection: "row", alignItems: "center", gap: theme.spacing[4] },
});
