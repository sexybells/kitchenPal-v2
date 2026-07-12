import { describe, it, expect } from "vitest";
import {
  createHouseholdSchema,
  createInviteSchema,
  updateMemberSchema,
} from "../household.js";
import {
  castVoteSchema,
  markReadSchema,
  messageQuerySchema,
  sendVoteMessageSchema,
} from "../chat.js";
import { notificationQuerySchema } from "../notification.js";

describe("household contract", () => {
  it("requires a non-empty household name", () => {
    expect(() => createHouseholdSchema.parse({ name: "" })).toThrow();
    expect(createHouseholdSchema.parse({ name: "Home" }).name).toBe("Home");
  });

  it("defaults an invite ttl and rejects owner as an assignable role", () => {
    expect(createInviteSchema.parse({}).ttlHours).toBe(72);
    expect(() => updateMemberSchema.parse({ role: "owner" })).toThrow();
    expect(updateMemberSchema.parse({ role: "admin" }).role).toBe("admin");
  });
});

describe("chat contract", () => {
  it("requires at least two vote options", () => {
    expect(() =>
      sendVoteMessageSchema.parse({ question: "Dinner?", options: ["Pho"] }),
    ).toThrow();
    const parsed = sendVoteMessageSchema.parse({
      question: "Dinner?",
      options: ["Pho", "Bun"],
    });
    expect(parsed.options).toHaveLength(2);
  });

  it("validates read ids and cast-vote payloads", () => {
    expect(() => markReadSchema.parse({ messageIds: [] })).toThrow();
    expect(() => markReadSchema.parse({ messageIds: ["nope"] })).toThrow();
    expect(castVoteSchema.parse({ optionId: "a" }).optionId).toBe("a");
  });

  it("defaults the message page size", () => {
    expect(messageQuerySchema.parse({}).limit).toBe(30);
  });
});

describe("notification contract", () => {
  it("coerces the unreadOnly flag from a string", () => {
    expect(notificationQuerySchema.parse({}).unreadOnly).toBe(false);
    expect(
      notificationQuerySchema.parse({ unreadOnly: "true" }).unreadOnly,
    ).toBe(true);
  });
});
