import {
  act,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type {
  HouseholdMemberResponse,
  HouseholdResponse,
} from "@kitchenpal/api-contract";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { householdApi } from "../../../api/household";
import { HouseholdSetup } from "../HouseholdSetup";
import { MemberRow } from "../MemberRow";
import { canChangeRole } from "../roles";

// Mock expo-router so importing the UI barrel (which pulls in expo-router/ui)
// does not load its native ESM navigation dependency under Jest.
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock("../../../api/household", () => ({
  householdApi: {
    create: jest.fn(),
    acceptInvite: jest.fn(),
  },
}));

const makeMember = (
  overrides: Partial<HouseholdMemberResponse> = {},
): HouseholdMemberResponse => ({
  id: "member-1",
  householdId: "h1",
  userId: "user-1",
  role: "member",
  status: "active",
  displayName: "Mai",
  avatarUrl: null,
  createdAt: "2026-07-12T09:00:00.000Z",
  updatedAt: "2026-07-12T09:00:00.000Z",
  ...overrides,
});

const mockedAccept = householdApi.acceptInvite as jest.MockedFunction<
  typeof householdApi.acceptInvite
>;

describe("Household setup — invite accept", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls the accept endpoint with the entered code", async () => {
    mockedAccept.mockResolvedValue({ id: "h1" } as HouseholdResponse);

    await renderWithProviders(<HouseholdSetup />);

    await act(async () => {
      fireEvent.changeText(screen.getByTestId("household-code"), "JOIN42");
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("household-join"));
    });

    await waitFor(() =>
      expect(mockedAccept).toHaveBeenCalledWith("JOIN42"),
    );
  });
});

describe("MemberRow — role management gating", () => {
  const noop = () => undefined;

  it("hides management controls from a plain member", async () => {
    await renderWithProviders(
      <MemberRow
        member={makeMember()}
        actorRole="member"
        isSelf={false}
        onChangeRole={noop}
        onRemove={noop}
        testID="member-row"
      />,
    );

    expect(screen.queryByTestId("member-row-role")).toBeNull();
    expect(screen.queryByTestId("member-row-remove")).toBeNull();
  });

  it("lets an owner promote another member", async () => {
    const onChangeRole = jest.fn();
    await renderWithProviders(
      <MemberRow
        member={makeMember({ role: "member" })}
        actorRole="owner"
        isSelf={false}
        onChangeRole={onChangeRole}
        onRemove={noop}
        testID="member-row"
      />,
    );

    fireEvent.press(screen.getByTestId("member-row-role"));
    expect(onChangeRole).toHaveBeenCalledWith(
      expect.objectContaining({ id: "member-1" }),
      "admin",
    );
  });

  it("never lets anyone reassign the owner's role", () => {
    expect(canChangeRole("owner", "owner")).toBe(false);
    expect(canChangeRole("admin", "owner")).toBe(false);
    expect(canChangeRole("member", "member")).toBe(false);
    expect(canChangeRole("owner", "member")).toBe(true);
  });
});
