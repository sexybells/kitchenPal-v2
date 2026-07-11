import { Pressable, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen, Text, Button, Icon } from "../src/ui";
import { theme } from "../src/theme";
import {
  usePantryItems,
  useCreateItem,
  useUpdateItem,
  useDeleteItem,
} from "../src/features/pantry/hooks";
import {
  ItemForm,
  buildItemPayload,
  initialFormValues,
  type ItemFormValues,
} from "../src/features/pantry/ItemForm";
import { resolveErrorMessage } from "../src/lib/error-message";

/**
 * Add/edit item sheet (modal). Editing loads the item from the warm pantry-list
 * cache; create/update/delete run through optimistic TanStack mutations.
 */
export default function PantryItemScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const items = usePantryItems();
  const existing = id ? items.data?.find((item) => item.id === id) : undefined;
  const isEdit = Boolean(id);

  const create = useCreateItem();
  const update = useUpdateItem();
  const remove = useDeleteItem();

  const submitting = create.isPending || update.isPending;
  const error = resolveErrorMessage(create.error ?? update.error ?? remove.error, t);

  const onSubmit = (values: ItemFormValues) => {
    const payload = buildItemPayload(values);
    if (isEdit && id) {
      update.mutate({ id, input: payload }, { onSuccess: () => router.back() });
    } else {
      create.mutate(payload, { onSuccess: () => router.back() });
    }
  };

  const onDelete = () => {
    if (!id) return;
    remove.mutate(id, { onSuccess: () => router.back() });
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="heading-m" color="text">
          {isEdit ? t("pantry.editItem") : t("pantry.addItem")}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          onPress={() => router.back()}
          hitSlop={8}
          testID="item-close"
        >
          <Icon name="close" size={24} color="text-muted" />
        </Pressable>
      </View>

      <ItemForm
        initial={initialFormValues(existing)}
        submitting={submitting}
        submitLabel={t("pantry.saveItem")}
        onSubmit={onSubmit}
      />

      {error ? (
        <Text variant="body-m" color="danger" style={styles.error} testID="item-error">
          {error}
        </Text>
      ) : null}

      {isEdit ? (
        <View style={styles.deleteBlock}>
          <Button
            label={t("pantry.deleteItem")}
            variant="ghost"
            loading={remove.isPending}
            onPress={onDelete}
            testID="item-delete"
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: theme.spacing[8],
    marginBottom: theme.spacing[24],
  },
  error: { marginTop: theme.spacing[16] },
  deleteBlock: { marginTop: theme.spacing[16] },
});
