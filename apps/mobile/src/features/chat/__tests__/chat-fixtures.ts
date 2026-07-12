import type { MessageResponse } from "@kitchenpal/api-contract";

/** Build a chat message, overriding only the fields a test cares about. */
export const makeMessage = (
  overrides: Partial<MessageResponse> = {},
): MessageResponse => ({
  id: "m1",
  householdId: "h1",
  senderId: "other-user",
  type: "text",
  text: "Hello household",
  imageUrl: null,
  expenseId: null,
  vote: null,
  readByUserIds: ["other-user"],
  createdAt: "2026-07-12T09:00:00.000Z",
  ...overrides,
});

/** A vote poll message with a live tally. */
export const makeVoteMessage = (): MessageResponse =>
  makeMessage({
    id: "vote1",
    senderId: "other-user",
    type: "vote",
    text: null,
    createdAt: "2026-07-12T09:05:00.000Z",
    vote: {
      question: "What should we cook?",
      options: [
        { id: "opt-pho", label: "Phở" },
        { id: "opt-bun", label: "Bún" },
      ],
      tally: [
        { optionId: "opt-pho", count: 2, voterIds: ["a", "b"] },
        { optionId: "opt-bun", count: 1, voterIds: ["c"] },
      ],
    },
  });
