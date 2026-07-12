import {
  addOptimistic,
  applyRead,
  applyServerMessage,
  fromHistory,
  isSeenByOthers,
  makeOptimisticText,
  markFailed,
} from "../message-model";
import { makeMessage } from "./chat-fixtures";

describe("chat message model", () => {
  it("orders history chronologically (oldest first)", () => {
    const ordered = fromHistory([
      makeMessage({ id: "b", createdAt: "2026-07-12T09:05:00.000Z" }),
      makeMessage({ id: "a", createdAt: "2026-07-12T09:00:00.000Z" }),
    ]);
    expect(ordered.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("reconciles a pending message against the server echo", () => {
    const pending = makeOptimisticText("h1", "me", "Dinner soon", "local:1");
    const list = addOptimistic([], pending);
    expect(list[0]?.status).toBe("pending");

    const confirmed = makeMessage({
      id: "server-1",
      senderId: "me",
      text: "Dinner soon",
      readByUserIds: ["me"],
    });
    const reconciled = applyServerMessage(list, confirmed);

    expect(reconciled).toHaveLength(1);
    expect(reconciled[0]?.id).toBe("server-1");
    expect(reconciled[0]?.status).toBeUndefined();
  });

  it("is idempotent when the same server id is delivered twice", () => {
    const first = applyServerMessage([], makeMessage({ id: "m1" }));
    const second = applyServerMessage(first, makeMessage({ id: "m1", text: "edited" }));
    expect(second).toHaveLength(1);
    expect(second[0]?.text).toBe("edited");
  });

  it("marks an optimistic message failed by client id", () => {
    const pending = makeOptimisticText("h1", "me", "Hi", "local:9");
    const list = markFailed(addOptimistic([], pending), "local:9");
    expect(list[0]?.status).toBe("failed");
  });

  it("applies read receipts and detects reads by others", () => {
    const own = makeMessage({ id: "m1", senderId: "me", readByUserIds: ["me"] });
    const list = applyRead([own], "friend", ["m1"]);
    expect(list[0]?.readByUserIds).toContain("friend");
    expect(isSeenByOthers(list[0]!, "me")).toBe(true);
  });
});
