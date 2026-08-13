import { useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { POST_CAPTION_MAX, POST_IMAGES_MAX } from "@kitchenpal/api-contract";
import { Text, Input, Button, Chip, Icon } from "../../ui";
import { theme } from "../../theme";
import { resolveErrorMessage } from "../../lib/error-message";
import { RecipePicker } from "../recipes/RecipePicker";
import {
  captureFromCamera,
  pickFromLibrary,
  type ImageRequest,
} from "../pantry/image-source";
import { useCreatePost, useUploadCommunityImage } from "./hooks";
import { ActionSheet, type SheetAction } from "./ActionSheet";

export interface PostComposerProps {
  /** Called after the post is created (e.g. to close the modal). */
  onPosted: () => void;
  testID?: string;
}

/**
 * Compose a community post: caption, up to `POST_IMAGES_MAX` photos (uploaded on
 * pick so the URL is ready at submit time), and an optional attached recipe via
 * the shared `RecipePicker`. A post needs a caption or at least one image.
 */
export function PostComposer({ onPosted, testID }: PostComposerProps) {
  const { t } = useTranslation();
  const upload = useUploadCommunityImage();
  const create = useCreatePost();
  const [caption, setCaption] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const atLimit = images.length >= POST_IMAGES_MAX;
  const canPost =
    (caption.trim().length > 0 || images.length > 0) &&
    !upload.isPending &&
    !create.isPending;

  const addImage = async (pick: () => Promise<ImageRequest>) => {
    setSourceOpen(false);
    setPermissionDenied(false);
    const request = await pick();
    if (request.status === "denied") {
      setPermissionDenied(true);
      return;
    }
    if (request.status !== "picked") return;
    const url = await upload.mutateAsync(request.source);
    setImages((prev) => [...prev, url]);
  };

  const removeImage = (url: string) =>
    setImages((prev) => prev.filter((item) => item !== url));

  const submit = () => {
    if (!canPost) return;
    create.mutate(
      {
        caption: caption.trim(),
        images,
        recipeId: recipeId ?? undefined,
      },
      { onSuccess: onPosted },
    );
  };

  const sourceActions: SheetAction[] = [
    {
      key: "camera",
      label: t("community.takePhoto"),
      icon: "camera",
      onPress: () => void addImage(captureFromCamera),
    },
    {
      key: "library",
      label: t("community.chooseLibrary"),
      icon: "meals",
      onPress: () => void addImage(pickFromLibrary),
    },
  ];

  const error = create.error ?? upload.error;

  return (
    <View style={styles.container} testID={testID}>
      <Input
        placeholder={t("community.captionPlaceholder")}
        value={caption}
        onChangeText={setCaption}
        maxLength={POST_CAPTION_MAX}
        multiline
        testID="composer-caption"
      />

      <View style={styles.images}>
        {images.map((url) => (
          <View key={url} style={styles.thumb}>
            <Image
              source={{ uri: url }}
              style={styles.thumbImage}
              accessibilityIgnoresInvertColors
            />
            <Pressable
              style={styles.remove}
              onPress={() => removeImage(url)}
              accessibilityRole="button"
              accessibilityLabel={t("common.delete")}
              hitSlop={6}
            >
              <Icon name="close" size={14} color="text-inverse" />
            </Pressable>
          </View>
        ))}
        {!atLimit ? (
          <Pressable
            style={styles.addTile}
            onPress={() => setSourceOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t("community.addPhotos")}
            disabled={upload.isPending}
            testID="composer-add-photo"
          >
            {upload.isPending ? (
              <Icon name="clock" size={22} color="text-muted" />
            ) : (
              <Icon name="camera" size={22} color="text-muted" />
            )}
          </Pressable>
        ) : null}
      </View>
      <Text variant="caption" color="text-muted">
        {t("community.photosCount", { count: images.length, max: POST_IMAGES_MAX })}
      </Text>

      {recipeId ? (
        <View style={styles.recipeRow}>
          <Chip
            label={t("community.attachedRecipe")}
            icon="meals"
            selected
          />
          <Pressable
            onPress={() => setRecipeId(null)}
            accessibilityRole="button"
            accessibilityLabel={t("community.removeRecipe")}
            hitSlop={8}
          >
            <Icon name="close" size={18} color="text-muted" />
          </Pressable>
        </View>
      ) : (
        <Button
          label={t("community.attachRecipe")}
          variant="secondary"
          icon="meals"
          onPress={() => setPickerOpen(true)}
          testID="composer-attach-recipe"
        />
      )}

      {permissionDenied ? (
        <Text variant="body-m" color="danger">
          {t("community.permissionBody")}
        </Text>
      ) : null}
      {error ? (
        <Text variant="body-m" color="danger">
          {resolveErrorMessage(error, t)}
        </Text>
      ) : null}

      <Button
        label={t("community.post")}
        loading={create.isPending || upload.isPending}
        disabled={!canPost}
        onPress={submit}
        testID="composer-submit"
      />

      <ActionSheet
        visible={sourceOpen}
        onClose={() => setSourceOpen(false)}
        actions={sourceActions}
      />
      <RecipePicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(id) => {
          setRecipeId(id);
          setPickerOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing[16] },
  images: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[8] },
  thumb: { width: 80, height: 80 },
  thumbImage: {
    width: 80,
    height: 80,
    borderRadius: theme.radius.thumb,
    backgroundColor: theme.colors["surface-alt"],
  },
  remove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.text,
    alignItems: "center",
    justifyContent: "center",
  },
  addTile: {
    width: 80,
    height: 80,
    borderRadius: theme.radius.thumb,
    borderWidth: 1.5,
    borderColor: theme.colors["border-strong"],
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
  },
  recipeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[8],
  },
});
