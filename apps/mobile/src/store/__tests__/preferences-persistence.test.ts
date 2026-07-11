import { useUiStore } from "../ui";

// expo-secure-store is mocked (in-memory) in jest.setup — this test asserts the
// locale + onboarding preferences round-trip across a simulated cold start.
describe("UI preferences persistence", () => {
  beforeEach(() => {
    useUiStore.setState({
      locale: "vi",
      hasCompletedOnboarding: false,
      hydrated: false,
    });
  });

  it("persists the chosen locale and onboarding, then rehydrates them", async () => {
    useUiStore.getState().setLocale("en");
    useUiStore.getState().completeOnboarding();

    // Simulate a cold start: wipe in-memory state, then rehydrate from storage.
    useUiStore.setState({
      locale: "vi",
      hasCompletedOnboarding: false,
      hydrated: false,
    });

    const restoredLocale = await useUiStore.getState().hydrate();

    expect(restoredLocale).toBe("en");
    const state = useUiStore.getState();
    expect(state.locale).toBe("en");
    expect(state.hasCompletedOnboarding).toBe(true);
    expect(state.hydrated).toBe(true);
  });
});
