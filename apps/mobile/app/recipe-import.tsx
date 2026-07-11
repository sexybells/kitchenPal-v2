import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen, Text, Input, Button, Card } from "../src/ui";
import { theme } from "../src/theme";
import { Segmented } from "../src/features/pantry/Segmented";
import {
  useImportFromUrl,
  useConfirmImport,
  useCreateRecipe,
} from "../src/features/recipes/hooks";
import {
  RecipeDraftForm,
  emptyDraftState,
  draftToState,
  stateToDraft,
  type DraftFormState,
} from "../src/features/recipes/RecipeDraftForm";
import { resolveErrorMessage } from "../src/lib/error-message";

type Mode = "url" | "manual";

/**
 * Recipe import: paste a URL → review the parsed draft → confirm to create, or
 * enter a recipe manually. Nothing is created until confirm; a failed/degraded
 * scrape falls back to the editable form rather than fabricating a recipe.
 */
export default function RecipeImportScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [draftState, setDraftState] = useState<DraftFormState | null>(null);

  const importFromUrl = useImportFromUrl();
  const confirmImport = useConfirmImport();
  const createRecipe = useCreateRecipe();

  const [warnings, setWarnings] = useState<string[]>([]);
  const [degraded, setDegraded] = useState(false);

  const onImport = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setWarnings([]);
    setDegraded(false);
    importFromUrl.mutate(
      { url: trimmed },
      {
        onSuccess: (result) => {
          setWarnings(result.warnings);
          setDegraded(result.degraded || result.draft === null);
          setDraftState(
            result.draft ? draftToState(result.draft) : emptyDraftState(),
          );
        },
      },
    );
  };

  const openManual = () => {
    setMode("manual");
    setDraftState(emptyDraftState());
  };

  const onConfirm = () => {
    if (!draftState) return;
    const draft = stateToDraft(draftState);
    if (draft.name.length === 0) return;
    const goToRecipe = { onSuccess: (recipe: { id: string }) => router.replace(`/recipe?id=${recipe.id}`) };
    if (mode === "url" && !degraded) {
      confirmImport.mutate({ draft }, goToRecipe);
    } else {
      // Manual entry (or a degraded scrape edited by hand) → create directly.
      createRecipe.mutate(
        {
          name: draft.name,
          mealType: draft.mealType,
          tags: draft.tags,
          cookTimeMinutes: draft.cookTimeMinutes,
          servings: draft.servings,
          ingredients: draft.ingredients,
          steps: draft.steps,
          imageUrl: draft.imageUrl,
        },
        goToRecipe,
      );
    }
  };

  const submitError = resolveErrorMessage(
    confirmImport.error ?? createRecipe.error,
    t,
  );
  const submitting = confirmImport.isPending || createRecipe.isPending;

  return (
    <Screen
      testID="recipe-import"
      footer={
        draftState ? (
          <View style={styles.footer}>
            {submitError ? (
              <Text variant="body-m" color="danger" center>
                {submitError}
              </Text>
            ) : null}
            <Button
              label={t("meals.confirmRecipe")}
              icon="check"
              loading={submitting}
              onPress={onConfirm}
              testID="import-confirm"
            />
          </View>
        ) : undefined
      }
    >
      <Text variant="heading-l" color="text" style={styles.title}>
        {t("meals.importTitle")}
      </Text>

      <Segmented
        options={[
          { value: "url", label: t("meals.fromUrl") },
          { value: "manual", label: t("meals.manualEntry") },
        ]}
        value={mode}
        onChange={(next) => {
          setMode(next);
          if (next === "manual") openManual();
          else setDraftState(null);
        }}
        testID="import-mode"
      />

      {mode === "url" ? (
        <View style={styles.urlBlock}>
          <Input
            label={t("meals.recipeUrl")}
            placeholder="https://…"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            keyboardType="url"
            leftIcon="link"
            testID="import-url"
          />
          <Button
            label={t("meals.fetchRecipe")}
            loading={importFromUrl.isPending}
            disabled={url.trim().length === 0}
            onPress={onImport}
            testID="import-fetch"
          />
          {importFromUrl.error ? (
            <Text variant="body-m" color="danger">
              {resolveErrorMessage(importFromUrl.error, t)}
            </Text>
          ) : null}
        </View>
      ) : null}

      {degraded && draftState ? (
        <Card background="warning-soft" elevated={false} testID="import-degraded">
          <Text variant="body-m" color="text">
            {t("meals.importDegraded")}
          </Text>
        </Card>
      ) : null}

      {warnings.length > 0 ? (
        <View style={styles.warnings} testID="import-warnings">
          {warnings.map((warning, index) => (
            <Text key={index} variant="caption" color="text-muted">
              • {warning}
            </Text>
          ))}
        </View>
      ) : null}

      {draftState ? (
        <View style={styles.formBlock}>
          <RecipeDraftForm value={draftState} onChange={setDraftState} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { paddingTop: theme.spacing[8], marginBottom: theme.spacing[16] },
  urlBlock: { gap: theme.spacing[12], marginTop: theme.spacing[16] },
  warnings: { gap: theme.spacing[4], marginTop: theme.spacing[12] },
  formBlock: { marginTop: theme.spacing[20] },
  footer: { gap: theme.spacing[8] },
});
