import { useMemo, useRef, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { CookMealInput } from "@kitchenpal/api-contract";
import {
  Screen,
  ScreenHeader,
  Text,
  Button,
  Icon,
  Badge,
  Card,
  Input,
  LoadingState,
  ErrorState,
} from "../src/ui";
import { theme } from "../src/theme";
import {
  useRecipe,
  useRecipeComments,
  usePantryMatch,
  useAddComment,
  usePublishRecipe,
} from "../src/features/recipes/hooks";
import {
  IngredientChecklist,
  IngredientList,
} from "../src/features/recipes/IngredientChecklist";
import { RatingStars } from "../src/features/recipes/RatingStars";
import { dishPlaceholder } from "../src/features/recipes/dish-placeholder";
import { mealTypeLabel } from "../src/features/recipes/labels";
import { neededItemsFromMatch } from "../src/features/recipes/add-missing-to-shopping";
import { useAddNeededItems } from "../src/features/shopping/hooks";
import { useCook } from "../src/features/pantry/hooks";
import { generateIdempotencyKey } from "../src/features/pantry/stock";
import { resolveErrorMessage } from "../src/lib/error-message";

/**
 * Recipe detail: hero, meta, pantry-matched ingredient checklist (có sẵn / cần
 * mua), add-missing hand-off to shopping (stub until Phase 6), cook-this-meal via
 * the Phase 4 cook loop, steps, ratings/comments, and a publish action for the
 * owner's personal recipe.
 */
export default function RecipeDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const recipeId = id ?? null;

  const recipe = useRecipe(recipeId);
  const match = usePantryMatch(recipeId);
  const comments = useRecipeComments(recipeId);
  const addComment = useAddComment();
  const publish = usePublishRecipe();
  const addMissing = useAddNeededItems();
  const cook = useCook();

  const idempotencyKey = useRef(generateIdempotencyKey());
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [cartNote, setCartNote] = useState<string | null>(null);

  const cookIngredients = useMemo<CookMealInput["ingredients"]>(() => {
    const available = match.data?.available ?? [];
    return available
      .filter((item) => item.pantryItemId)
      .map((item) => ({
        pantryItemId: item.pantryItemId ?? undefined,
        name: item.name,
        quantity: item.quantity != null && item.quantity > 0 ? item.quantity : undefined,
        unit: item.unit ?? undefined,
      }));
  }, [match.data]);

  if (recipe.isLoading) {
    return (
      <Screen>
        <ScreenHeader title={t("meals.unknownRecipe")} onBack={() => router.back()} />
        <LoadingState label={t("common.loading")} />
      </Screen>
    );
  }

  if (recipe.isError || !recipe.data) {
    return (
      <Screen>
        <ScreenHeader title={t("meals.unknownRecipe")} onBack={() => router.back()} />
        <ErrorState
          title={t("states.errorTitle")}
          body={resolveErrorMessage(recipe.error, t) ?? t("states.errorBody")}
          retryLabel={t("common.retry")}
          onRetry={() => recipe.refetch()}
          testID="recipe-detail-error"
        />
      </Screen>
    );
  }

  const data = recipe.data;
  const canPublish = data.isOwner && data.scope === "personal";

  const onCook = () => {
    if (cookIngredients.length === 0) return;
    cook.mutate({
      ingredients: cookIngredients,
      idempotencyKey: idempotencyKey.current,
    });
  };

  const onAddMissing = () => {
    const needed = match.data?.needed ?? [];
    if (needed.length === 0) return;
    // Real hand-off to the shopping list via POST /shopping/needed-items.
    addMissing.mutate(
      { items: neededItemsFromMatch(needed, recipeId) },
      { onSuccess: () => setCartNote(t("meals.addMissingDone", { count: needed.length })) },
    );
  };

  const onSubmitReview = () => {
    if (!recipeId || rating === 0) return;
    addComment.mutate(
      { id: recipeId, input: { rating, text: reviewText.trim() || undefined } },
      { onSuccess: () => setReviewText("") },
    );
  };

  return (
    <Screen testID="recipe-detail">
      <ScreenHeader title={data.name} onBack={() => router.back()} />

      <View
        style={[
          styles.hero,
          data.imageUrl
            ? null
            : {
                backgroundColor:
                  theme.colors[dishPlaceholder(data.name, data.mealType).background],
              },
        ]}
      >
        {data.imageUrl ? (
          <Image
            source={{ uri: data.imageUrl }}
            style={styles.heroImage}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Text variant="display-l" center>
            {dishPlaceholder(data.name, data.mealType).emoji}
          </Text>
        )}
      </View>

      <View style={styles.metaRow}>
        <Badge label={mealTypeLabel(t, data.mealType)} tone="primary" />
        {data.cookTimeMinutes != null ? (
          <MetaItem icon="clock" label={t("meals.minutes", { count: data.cookTimeMinutes })} />
        ) : null}
        {data.servings != null ? (
          <MetaItem icon="users" label={t("meals.servingsCount", { count: data.servings })} />
        ) : null}
      </View>

      {data.reviewCount > 0 ? (
        <View style={styles.ratingRow}>
          <RatingStars value={data.averageRating} />
          <Text variant="body-m" color="text-muted">
            {data.averageRating.toFixed(1)} · {t("meals.reviews", { count: data.reviewCount })}
          </Text>
        </View>
      ) : null}

      <Section title={t("meals.ingredients")}>
        {match.isLoading ? (
          <IngredientList ingredients={data.ingredients} />
        ) : match.data ? (
          <>
            <MatchScore score={match.data.matchScore} />
            <IngredientChecklist
              available={match.data.available}
              needed={match.data.needed}
              testID="recipe-pantry-match"
            />
          </>
        ) : (
          <IngredientList ingredients={data.ingredients} />
        )}
      </Section>

      <View style={styles.actions}>
        <Button
          label={t("meals.addMissingToCart")}
          variant="secondary"
          icon="shopping"
          disabled={(match.data?.needed.length ?? 0) === 0}
          loading={addMissing.isPending}
          onPress={onAddMissing}
          testID="recipe-add-missing"
        />
        {cartNote ? (
          <Text variant="body-m" color="success" testID="recipe-cart-note">
            {cartNote}
          </Text>
        ) : null}
        {addMissing.error ? (
          <Text variant="body-m" color="danger">
            {resolveErrorMessage(addMissing.error, t)}
          </Text>
        ) : null}
        <Button
          label={t("meals.cookThisMeal")}
          icon="meals"
          loading={cook.isPending}
          disabled={cookIngredients.length === 0}
          onPress={onCook}
          testID="recipe-cook"
        />
        {cook.isSuccess ? (
          <Text variant="body-m" color="success" testID="recipe-cook-done">
            {t("meals.cookedNote", { count: cook.data.consumed.length })}
          </Text>
        ) : null}
        {cook.error ? (
          <Text variant="body-m" color="danger">
            {resolveErrorMessage(cook.error, t)}
          </Text>
        ) : null}
      </View>

      <Section title={t("meals.steps")}>
        {data.steps.length === 0 ? (
          <Text variant="body-m" color="text-muted">
            {t("meals.noSteps")}
          </Text>
        ) : (
          data.steps.map((step, index) => (
            <View key={index} style={styles.step}>
              <View style={styles.stepNumber}>
                <Text variant="label-s" color="text-inverse">
                  {index + 1}
                </Text>
              </View>
              <Text variant="body-l" color="text" style={styles.stepText}>
                {step}
              </Text>
            </View>
          ))
        )}
      </Section>

      <Section title={t("meals.rateThis")}>
        <RatingStars value={rating} onChange={setRating} size={28} testID="recipe-rating-input" />
        <Input
          placeholder={t("meals.reviewPlaceholder")}
          value={reviewText}
          onChangeText={setReviewText}
          multiline
          testID="recipe-review-input"
        />
        <Button
          label={t("meals.submitReview")}
          variant="secondary"
          disabled={rating === 0}
          loading={addComment.isPending}
          onPress={onSubmitReview}
          testID="recipe-submit-review"
        />
        {addComment.error ? (
          <Text variant="body-m" color="danger">
            {resolveErrorMessage(addComment.error, t)}
          </Text>
        ) : null}
        {(comments.data ?? []).map((comment) => (
          <Card key={comment.id} elevated={false} background="surface-alt">
            <View style={styles.commentHead}>
              <Text variant="label-m" color="text">
                {comment.authorName}
              </Text>
              <RatingStars value={comment.rating} size={14} />
            </View>
            {comment.text ? (
              <Text variant="body-m" color="text-muted">
                {comment.text}
              </Text>
            ) : null}
          </Card>
        ))}
      </Section>

      {canPublish ? (
        <Button
          label={data.published ? t("meals.unpublish") : t("meals.publish")}
          variant="ghost"
          icon="globe"
          loading={publish.isPending}
          onPress={() =>
            recipeId &&
            publish.mutate({ id: recipeId, input: { published: !data.published } })
          }
          testID="recipe-publish"
        />
      ) : null}
    </Screen>
  );
}

function MetaItem({ icon, label }: { icon: "clock" | "users"; label: string }) {
  return (
    <View style={styles.metaItem}>
      <Icon name={icon} size={16} color="text-muted" />
      <Text variant="body-m" color="text-muted">
        {label}
      </Text>
    </View>
  );
}

function MatchScore({ score }: { score: number }) {
  const { t } = useTranslation();
  return (
    <Text variant="label-m" color="text-muted" testID="recipe-match-score">
      {t("meals.matchScore", { percent: Math.round(score * 100) })}
    </Text>
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
  hero: {
    aspectRatio: 16 / 10,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors["surface-alt"],
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginTop: theme.spacing[8],
  },
  heroImage: { width: "100%", height: "100%" },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[12],
    marginTop: theme.spacing[8],
  },
  metaItem: { flexDirection: "row", alignItems: "center", gap: theme.spacing[4] },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[8],
    marginTop: theme.spacing[8],
  },
  section: { marginTop: theme.spacing[24], gap: theme.spacing[12] },
  actions: { marginTop: theme.spacing[24], gap: theme.spacing[12] },
  step: { flexDirection: "row", gap: theme.spacing[12] },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { flex: 1 },
  commentHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing[4],
  },
});
