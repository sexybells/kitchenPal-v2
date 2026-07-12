import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import type {
  MySubscriptionResponse,
  SubscriptionPlanResponse,
} from "@kitchenpal/api-contract";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { subscriptionsApi } from "../../../api/subscriptions";
import PaywallScreen from "../../../../app/paywall";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("../../../api/subscriptions", () => ({
  subscriptionsApi: {
    listPlans: jest.fn(),
    mine: jest.fn(),
    activate: jest.fn(),
    cancel: jest.fn(),
  },
}));

const makePlan = (
  overrides: Partial<SubscriptionPlanResponse> = {},
): SubscriptionPlanResponse => ({
  id: "plan-free",
  name: "Free",
  tier: "free",
  priceVnd: 0,
  features: ["Track your pantry"],
  active: true,
  version: 1,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  ...overrides,
});

const FREE_PLAN = makePlan();
const PRO_PLAN = makePlan({
  id: "plan-pro",
  name: "Pro",
  tier: "pro",
  priceVnd: 49000,
  features: ["Unlimited AI scans", "Household chat"],
});

const mockedPlans = subscriptionsApi.listPlans as jest.MockedFunction<
  typeof subscriptionsApi.listPlans
>;
const mockedMine = subscriptionsApi.mine as jest.MockedFunction<
  typeof subscriptionsApi.mine
>;
const mockedActivate = subscriptionsApi.activate as jest.MockedFunction<
  typeof subscriptionsApi.activate
>;
const mockedCancel = subscriptionsApi.cancel as jest.MockedFunction<
  typeof subscriptionsApi.cancel
>;

const freeSubscription: MySubscriptionResponse = { tier: "free", subscription: null };
const proSubscription: MySubscriptionResponse = {
  tier: "pro",
  subscription: {
    id: "sub-1",
    userId: "u1",
    planId: "plan-pro",
    plan: PRO_PLAN,
    status: "active",
    source: "admin",
    startAt: "2026-07-01T00:00:00.000Z",
    endAt: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  },
};

describe("Paywall screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPlans.mockResolvedValue([FREE_PLAN, PRO_PLAN]);
  });

  it("renders both tiers with VND prices and flags the current (Free) plan", async () => {
    mockedMine.mockResolvedValue(freeSubscription);

    await renderWithProviders(<PaywallScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("paywall-plan-pro")).toBeTruthy(),
    );

    // Pro price is the VND-formatted amount; Free shows the "free" label.
    expect(screen.getByTestId("paywall-plan-pro-price")).toHaveTextContent("49.000 ₫");
    expect(screen.getByTestId("paywall-plan-free-price")).toHaveTextContent("Free");
    // Feature lists render.
    expect(screen.getByText("Unlimited AI scans")).toBeTruthy();
    // Current-plan indicator reflects the Free caller; Free card is tagged current.
    expect(screen.getByTestId("paywall-current")).toHaveTextContent("Current plan: Free");
    expect(screen.getByTestId("paywall-plan-free-current")).toBeTruthy();
    // Pro is highlighted as the recommended upgrade.
    expect(screen.getByTestId("paywall-plan-pro-recommended")).toBeTruthy();
  });

  it("upgrade CTA is inert: it requests activation and shows a contact sheet, never a purchase", async () => {
    mockedMine.mockResolvedValue(freeSubscription);
    mockedActivate.mockResolvedValue({
      activated: false,
      status: "contact_required",
      message: "server copy is ignored in favour of localized text",
    });

    await renderWithProviders(<PaywallScreen />);

    const upgrade = await screen.findByTestId("paywall-upgrade");
    // The CTA never implies a real transaction (no buy/purchase/pay wording).
    expect(upgrade).toHaveTextContent("Contact us to upgrade");
    expect(screen.queryByText(/buy now|purchase|checkout|pay now/i)).toBeNull();

    fireEvent.press(upgrade);

    await waitFor(() => expect(mockedActivate).toHaveBeenCalledWith("plan-pro"));
    // The informational sheet explains upgrades are manual with no payment taken.
    await waitFor(() =>
      expect(screen.getByTestId("paywall-contact-sheet")).toBeTruthy(),
    );
    expect(
      screen.getByText(
        "Upgrading to Pro is handled manually for now. Reach out to the KitchenPal team to be granted Pro — no payment is taken in the app.",
      ),
    ).toBeTruthy();
  });

  it("offers a real cancel (downgrade) when the caller is on Pro", async () => {
    mockedMine.mockResolvedValue(proSubscription);
    mockedCancel.mockResolvedValue(freeSubscription);

    await renderWithProviders(<PaywallScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("paywall-current")).toHaveTextContent("You're on Pro"),
    );
    // No upgrade CTA for a Pro user; a cancel action is offered instead.
    expect(screen.queryByTestId("paywall-upgrade")).toBeNull();

    fireEvent.press(screen.getByTestId("paywall-cancel"));

    await waitFor(() => expect(mockedCancel).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("paywall-canceled")).toHaveTextContent(
        "Switched back to Free.",
      ),
    );
  });
});
