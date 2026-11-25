import type { Model } from "mongoose";
import {
  ReminderDeliveryRepository,
  type ReminderDeliveryEntity,
} from "./reminder-delivery.repository";

function build(create: jest.Mock) {
  return new ReminderDeliveryRepository({
    create,
  } as unknown as Model<ReminderDeliveryEntity>);
}

const ROW = { userId: "507f1f77bcf86cd799439011", localDate: "2026-12-04", kind: "expiry_alert" as const };

describe("ReminderDeliveryRepository.claim", () => {
  it("returns true when the row is inserted", async () => {
    await expect(build(jest.fn().mockResolvedValue({})).claim(ROW)).resolves.toBe(true);
  });

  it("returns false on a duplicate (userId, localDate)", async () => {
    const create = jest.fn().mockRejectedValue({ code: 11000 });
    await expect(build(create).claim(ROW)).resolves.toBe(false);
  });

  it("rethrows other errors", async () => {
    const create = jest.fn().mockRejectedValue(new Error("down"));
    await expect(build(create).claim(ROW)).rejects.toThrow("down");
  });
});
