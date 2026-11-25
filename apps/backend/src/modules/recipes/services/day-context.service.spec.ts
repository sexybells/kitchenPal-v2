import type { AppLogger } from "../../../common/logging/app-logger.service";
import type { UserSettingsRepository } from "../../users/repositories/user-settings.repository";
import { DayContextService, toSelectionContext } from "./day-context.service";

// 2026-03-03 10:00 in Asia/Ho_Chi_Minh = lunar 15/1/2026 (a vegetarian day).
const VEGETARIAN_INSTANT = new Date("2026-03-03T03:00:00Z");

function build(stored: object | null) {
  const findOne = jest.fn().mockResolvedValue(stored);
  const warn = jest.fn();
  const service = new DayContextService(
    { findOne } as unknown as UserSettingsRepository,
    { warn } as unknown as AppLogger,
  );
  return { service, findOne, warn };
}

describe("DayContextService", () => {
  it("falls back to Asia/Ho_Chi_Minh and warns on an invalid stored zone", async () => {
    const { service, warn } = build({ timeZone: "Mars/Base" });
    const day = await service.forUser("u1", VEGETARIAN_INSTANT);
    expect(day.timeZone).toBe("Asia/Ho_Chi_Minh");
    expect(day.date).toBe("2026-03-03");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("reads settings in personal scope", async () => {
    const { service, findOne } = build(null);
    await service.forUser("u1", VEGETARIAN_INSTANT);
    expect(findOne).toHaveBeenCalledWith({
      scope: "personal",
      userId: "u1",
      householdId: null,
    });
  });

  it("applies priority on a vegetarian day when opted in", async () => {
    const { service } = build({
      timeZone: "Asia/Ho_Chi_Minh",
      observesVegetarianDays: true,
    });
    const day = await service.forUser("u1", VEGETARIAN_INSTANT);
    expect(day.vegetarianDay).toBe(true);
    expect(day.vegetarianPriority).toBe(true);
    expect(toSelectionContext(day, VEGETARIAN_INSTANT)).toEqual({
      now: VEGETARIAN_INSTANT,
      vegetarianDay: true,
    });
  });

  it("flags the day but not the priority when not opted in", async () => {
    const { service } = build({
      timeZone: "Asia/Ho_Chi_Minh",
      observesVegetarianDays: false,
    });
    const day = await service.forUser("u1", VEGETARIAN_INSTANT);
    expect(day.vegetarianDay).toBe(true);
    expect(day.vegetarianPriority).toBe(false);
  });

  it("uses the stored zone for the local date", async () => {
    const { service } = build({ timeZone: "America/Los_Angeles" });
    const day = await service.forUser("u1", VEGETARIAN_INSTANT);
    expect(day.date).toBe("2026-03-02");
    expect(day.timeZone).toBe("America/Los_Angeles");
  });
});
