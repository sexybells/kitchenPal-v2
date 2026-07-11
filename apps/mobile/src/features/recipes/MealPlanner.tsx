import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { MealPlanSlot } from "@kitchenpal/api-contract";
import {
  Text,
  Button,
  Chip,
  Card,
  LoadingState,
  EmptyState,
  ErrorState,
} from "../../ui";
import { theme } from "../../theme";
import { ApiClientError } from "../../api/errors";
import { resolveErrorMessage } from "../../lib/error-message";
import {
  useAutoFill,
  useCreateMealPlan,
  useCurrentMealPlan,
  useUpdateSlot,
} from "./hooks";
import { MealSlotCard } from "./MealSlotCard";
import { RecipePicker } from "./RecipePicker";
import { DAYS_OF_WEEK, dayLabel, startOfWeekUtc } from "./labels";

export interface MealPlannerProps {
  onOpenRecipe: (id: string) => void;
}

/** The current week's plan is missing until created — a 404 is expected, not an error. */
const isNotFound = (error: unknown): boolean =>
  error instanceof ApiClientError && error.status === 404;

/**
 * Weekly meal planner: day selector, per-meal slot cards, AI auto-fill, and
 * versioned slot edits. A stale slot edit (409) refetches the plan and tells the
 * user to retry instead of silently losing the change.
 */
export function MealPlanner({ onOpenRecipe }: MealPlannerProps) {
  const { t } = useTranslation();
  const plan = useCurrentMealPlan();
  const createPlan = useCreateMealPlan();
  const updateSlot = useUpdateSlot();
  const autoFill = useAutoFill();

  const [selectedDay, setSelectedDay] = useState(0);
  const [assigningSlotId, setAssigningSlotId] = useState<string | null>(null);
  // Transient banners: a slot conflict and the auto-fill outcome.
  const [conflict, setConflict] = useState(false);
  const [autoFillNote, setAutoFillNote] = useState<string | null>(null);

  const daySlots = useMemo<MealPlanSlot[]>(
    () => (plan.data?.slots ?? []).filter((slot) => slot.dayOfWeek === selectedDay),
    [plan.data, selectedDay],
  );

  const busy = updateSlot.isPending;

  const editSlot = (slotId: string, recipeId: string | null) => {
    if (!plan.data) return;
    setConflict(false);
    updateSlot.mutate(
      {
        id: plan.data.id,
        slotId,
        input: { recipeId, expectedVersion: plan.data.version },
      },
      {
        onError: (error) => {
          // A concurrent edit already bumped the version: refetch + inform.
          if (error instanceof ApiClientError && error.status === 409) {
            setConflict(true);
            void plan.refetch();
          }
        },
      },
    );
  };

  const onAutoFill = () => {
    if (!plan.data) return;
    setAutoFillNote(null);
    autoFill.mutate(
      { id: plan.data.id, input: { overwrite: false } },
      {
        onSuccess: (result) => {
          if (result.needsManual) {
            setAutoFillNote(t("meals.autoFillManual"));
          } else if (result.degraded) {
            setAutoFillNote(t("meals.autoFillDegraded"));
          }
        },
      },
    );
  };

  if (plan.isLoading) return <LoadingState label={t("common.loading")} />;

  if (plan.isError && !isNotFound(plan.error)) {
    return (
      <ErrorState
        title={t("states.errorTitle")}
        body={resolveErrorMessage(plan.error, t) ?? t("states.errorBody")}
        retryLabel={t("common.retry")}
        onRetry={() => plan.refetch()}
        testID="planner-error"
      />
    );
  }

  // No plan for the current week yet — offer to create one.
  if (!plan.data) {
    return (
      <View style={styles.emptyWrap} testID="planner-empty">
        <EmptyState
          title={t("meals.noPlanTitle")}
          body={t("meals.noPlanBody")}
          icon="meals"
        />
        <Button
          label={t("meals.createPlan")}
          icon="plus"
          loading={createPlan.isPending}
          onPress={() =>
            createPlan.mutate({
              weekStart: startOfWeekUtc(new Date()),
              mealTypes: ["breakfast", "lunch", "dinner"],
            })
          }
          testID="planner-create"
        />
        {createPlan.error ? (
          <Text variant="body-m" color="danger" center>
            {resolveErrorMessage(createPlan.error, t)}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container} testID="meal-planner">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.days}
        style={styles.daysScroll}
      >
        {DAYS_OF_WEEK.map((day) => (
          <Chip
            key={day}
            label={dayLabel(t, day)}
            selected={selectedDay === day}
            onPress={() => setSelectedDay(day)}
            testID={`planner-day-${day}`}
          />
        ))}
      </ScrollView>

      <Button
        label={t("meals.autoFillWeek")}
        icon="sparkles"
        loading={autoFill.isPending}
        onPress={onAutoFill}
        testID="planner-autofill"
      />
      {autoFillNote ? (
        <Card background="accent-soft" elevated={false} testID="planner-autofill-note">
          <Text variant="body-m" color="text">
            {autoFillNote}
          </Text>
        </Card>
      ) : null}
      {conflict ? (
        <Text variant="body-m" color="danger" testID="planner-conflict">
          {t("meals.slotConflict")}
        </Text>
      ) : null}

      <View style={styles.slots}>
        {daySlots.map((slot) => (
          <MealSlotCard
            key={slot.id}
            slot={slot}
            busy={busy}
            onOpen={() => slot.recipeId && onOpenRecipe(slot.recipeId)}
            onAssign={() => setAssigningSlotId(slot.id)}
            onClear={() => editSlot(slot.id, null)}
            testID={`planner-slot-${slot.id}`}
          />
        ))}
      </View>

      <RecipePicker
        visible={assigningSlotId !== null}
        onClose={() => setAssigningSlotId(null)}
        onSelect={(recipeId) => {
          if (assigningSlotId) editSlot(assigningSlotId, recipeId);
          setAssigningSlotId(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing[12], flex: 1 },
  emptyWrap: { gap: theme.spacing[16], flex: 1, minHeight: 320 },
  daysScroll: { flexGrow: 0 },
  days: { gap: theme.spacing[8], paddingRight: theme.spacing[8] },
  slots: { gap: theme.spacing[16], marginTop: theme.spacing[4] },
});
