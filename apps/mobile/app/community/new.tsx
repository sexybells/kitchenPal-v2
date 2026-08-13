import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen, Text, Icon } from "../../src/ui";
import { theme } from "../../src/theme";
import { PostComposer } from "../../src/features/community/PostComposer";

/** Modal route: compose and publish a new community post. */
export default function NewPostScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Screen testID="new-post-screen">
      <View style={styles.header}>
        <Text variant="heading-s" color="text">
          {t("community.composerTitle")}
        </Text>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          hitSlop={8}
        >
          <Icon name="close" size={22} color="text-muted" />
        </Pressable>
      </View>
      <PostComposer onPosted={() => router.back()} testID="post-composer" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing[16],
  },
});
