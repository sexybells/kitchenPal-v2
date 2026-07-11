import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen, Text, Button, Icon, type IconName } from "../../src/ui";
import { theme } from "../../src/theme";
import { useUiStore } from "../../src/store/ui";

interface Slide {
  icon: IconName;
  titleKey: "onboarding.slide1Title" | "onboarding.slide2Title";
  bodyKey: "onboarding.slide1Body" | "onboarding.slide2Body";
}

const SLIDES: readonly Slide[] = [
  { icon: "pantry", titleKey: "onboarding.slide1Title", bodyKey: "onboarding.slide1Body" },
  { icon: "meals", titleKey: "onboarding.slide2Title", bodyKey: "onboarding.slide2Body" },
];

/** Two-slide onboarding pager, then hand off to Sign Up. */
export default function OnboardingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const completeOnboarding = useUiStore((state) => state.completeOnboarding);
  const [index, setIndex] = useState(0);

  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  const goToAuth = () => {
    completeOnboarding();
    router.replace("/(auth)/sign-up");
  };

  const advance = () => {
    if (isLast) goToAuth();
    else setIndex((current) => current + 1);
  };

  if (!slide) return null;

  return (
    <Screen scroll={false}>
      <View style={styles.top}>
        <Button
          label={t("common.skip")}
          variant="ghost"
          fullWidth={false}
          onPress={goToAuth}
        />
      </View>

      <View style={styles.body}>
        <View style={styles.illustration}>
          <Icon name={slide.icon} size={72} color="primary" strokeWidth={1.6} />
        </View>
        <Text variant="display-m" color="text" center>
          {t(slide.titleKey)}
        </Text>
        <Text variant="body-l" color="text-muted" center>
          {t(slide.bodyKey)}
        </Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((item, i) => (
            <View
              key={item.titleKey}
              style={[styles.dot, i === index ? styles.dotActive : null]}
            />
          ))}
        </View>
        <Button
          label={isLast ? t("onboarding.getStarted") : t("common.next")}
          onPress={advance}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: "flex-end", paddingTop: theme.spacing[8] },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[16],
  },
  illustration: {
    width: 160,
    height: 160,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors["primary-soft"],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing[16],
  },
  footer: { gap: theme.spacing[20], paddingBottom: theme.spacing[16] },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: theme.spacing[8],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors["border-strong"],
  },
  dotActive: {
    width: 24,
    backgroundColor: theme.colors.primary,
  },
});
