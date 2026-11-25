import type { AppLogger } from "../../common/logging/app-logger.service";
import type { UserRepository } from "../auth/repositories/user.repository";
import type { HouseholdMemberRepository } from "../household/repositories/household-member.repository";
import type { NotificationService } from "../household/services/notification.service";
import { DayContextService } from "../recipes/services/day-context.service";
import type { RecipeSelectionService } from "../recipes/services/recipe-selection.service";
import type { UserSettingsRepository } from "../users/repositories/user-settings.repository";
import type { ReminderDeliveryRepository } from "./repositories/reminder-delivery.repository";
import { instantAtLocalHour, ReminderTickService } from "./reminder-tick.service";

// 16:00 in Asia/Ho_Chi_Minh, 10:00 in Europe/Berlin. Neither 2026-12-04 nor
// 12-05 is a lunar 1st/15th.
const AT = new Date("2026-12-04T09:00:00Z");
// 16:00 HCM on 2026-12-08; tomorrow (12-09) is lunar 1/11.
const EVE_OF_VEG_DAY = new Date("2026-12-08T09:00:00Z");
// 16:00 HCM on 2026-12-09, itself lunar 1/11.
const VEG_DAY = new Date("2026-12-09T09:00:00Z");

interface SettingsFixture {
  _id: string;
  createdBy: string;
  locale: "vi" | "en";
  timeZone: string;
  observesVegetarianDays: boolean;
  notifications: { push: boolean; mealReminders: boolean };
  pushTokens: { token: string; platform: "ios" }[];
}

function settingsFor(
  userId: string,
  overrides: Partial<SettingsFixture> = {},
): SettingsFixture {
  return {
    _id: `s-${userId}`,
    createdBy: userId,
    locale: "vi",
    timeZone: "Asia/Ho_Chi_Minh",
    observesVegetarianDays: false,
    notifications: { push: true, mealReminders: true },
    pushTokens: [{ token: `tok-${userId}`, platform: "ios" }],
    ...overrides,
  };
}

interface Ranked {
  doc: { id: string; name: string };
  rescues: { name: string }[];
  isVegetarian: boolean;
}

const meatRescue: Ranked = {
  doc: { id: "r-meat", name: "Thịt kho" },
  rescues: [{ name: "thịt ba chỉ" }, { name: "trứng" }],
  isVegetarian: false,
};
const vegNoRescue: Ranked = {
  doc: { id: "r-veg", name: "Đậu sốt cà" },
  rescues: [],
  isVegetarian: true,
};

function build(
  store: SettingsFixture[],
  options: {
    ranked?: Ranked[];
    suspended?: string[];
    households?: Record<string, string>;
  } = {},
) {
  const settings = {
    pageReminderCandidates: jest.fn(async (afterId: string | null, limit: number) =>
      store.filter((doc) => afterId === null || doc._id > afterId).slice(0, limit),
    ),
    findOne: jest.fn(async (filter: { userId: string }) =>
      store.find((doc) => doc.createdBy === filter.userId) ?? null,
    ),
  };
  const users = {
    findById: jest.fn(async (id: string) => ({
      id,
      suspendedAt: options.suspended?.includes(id) ? new Date() : null,
    })),
  };
  const members = {
    latestActiveForUser: jest.fn(async (userId: string) => {
      const householdId = options.households?.[userId];
      return householdId ? { householdId: { toString: () => householdId } } : null;
    }),
  };
  const select = jest.fn(async () => ({ ranked: options.ranked ?? [meatRescue] }));
  const notify = jest.fn(async () => undefined);
  const claimed = new Set<string>();
  const deliveries = {
    claim: jest.fn(async (row: { userId: string; localDate: string }) => {
      const key = `${row.userId}|${row.localDate}`;
      if (claimed.has(key)) {
        return false;
      }
      claimed.add(key);
      return true;
    }),
  };
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const dayContext = new DayContextService(
    settings as unknown as UserSettingsRepository,
    logger as unknown as AppLogger,
  );
  const service = new ReminderTickService(
    settings as unknown as UserSettingsRepository,
    users as unknown as UserRepository,
    members as unknown as HouseholdMemberRepository,
    dayContext,
    { select } as unknown as RecipeSelectionService,
    { notify } as unknown as NotificationService,
    deliveries as unknown as ReminderDeliveryRepository,
    logger as unknown as AppLogger,
  );
  return { service, select, notify, deliveries, logger };
}

const notifiedUsers = (notify: jest.Mock) =>
  notify.mock.calls.map((call: unknown[]) => call[0]);

describe("instantAtLocalHour", () => {
  it("handles fixed, half-hour and DST-switch-day offsets", () => {
    const at11 = (zone: string, year: number, month: number, day: number) =>
      instantAtLocalHour(zone, { year, month, day }, 11).toISOString();
    expect(at11("Asia/Ho_Chi_Minh", 2026, 12, 9)).toBe("2026-12-09T04:00:00.000Z");
    expect(at11("Asia/Kolkata", 2026, 12, 9)).toBe("2026-12-09T05:30:00.000Z");
    // Clocks went forward earlier that morning.
    expect(at11("Europe/Berlin", 2027, 3, 28)).toBe("2027-03-28T09:00:00.000Z");
    expect(at11("America/New_York", 2027, 3, 14)).toBe("2027-03-14T15:00:00.000Z");
  });
});

describe("ReminderTickService.run", () => {
  it("considers only users whose local hour is 16", async () => {
    const { service, notify } = build([
      settingsFor("u-hcm"),
      settingsFor("u-berlin", { timeZone: "Europe/Berlin" }),
    ]);
    await expect(service.run(AT)).resolves.toEqual({ considered: 1, sent: 1 });
    expect(notifiedUsers(notify)).toEqual(["u-hcm"]);
  });

  it("skips meal reminders off, no push tokens, push off and suspended users", async () => {
    const { service, notify } = build(
      [
        settingsFor("u-ok"),
        settingsFor("u-off", { notifications: { push: true, mealReminders: false } }),
        settingsFor("u-nopush", { notifications: { push: false, mealReminders: true } }),
        settingsFor("u-notoken", { pushTokens: [] }),
        settingsFor("u-suspended"),
      ],
      { suspended: ["u-suspended"] },
    );
    await expect(service.run(AT)).resolves.toEqual({ considered: 1, sent: 1 });
    expect(notifiedUsers(notify)).toEqual(["u-ok"]);
  });

  it("sends at most once per user per local date", async () => {
    const { service, notify } = build([settingsFor("u1")]);
    await service.run(AT);
    await expect(service.run(AT)).resolves.toEqual({ considered: 1, sent: 0 });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("sends to each opted-in member of the same household", async () => {
    const { service, notify, select } = build(
      [settingsFor("u1"), settingsFor("u2")],
      { households: { u1: "h1", u2: "h1" } },
    );
    await expect(service.run(AT)).resolves.toEqual({ considered: 2, sent: 2 });
    expect(notifiedUsers(notify)).toEqual(["u1", "u2"]);
    expect(select).toHaveBeenCalledWith(
      { scope: "household", userId: "u1", householdId: "h1" },
      expect.anything(),
    );
  });

  it("uses the personal scope without an active household", async () => {
    const { service, select } = build([settingsFor("u1")]);
    await service.run(AT);
    expect(select).toHaveBeenCalledWith(
      { scope: "personal", userId: "u1", householdId: null },
      expect.objectContaining({ useAi: false, userId: "u1" }),
    );
  });

  it("keeps going when one user's notify throws", async () => {
    const { service, notify, logger } = build([settingsFor("u1"), settingsFor("u2")]);
    notify.mockRejectedValueOnce(new Error("boom"));
    await expect(service.run(AT)).resolves.toEqual({ considered: 2, sent: 1 });
    expect(notifiedUsers(notify)).toEqual(["u1", "u2"]);
    expect(logger.error).toHaveBeenCalled();
  });

  it("treats an invalid stored zone as Asia/Ho_Chi_Minh", async () => {
    const { service, notify } = build([settingsFor("u1", { timeZone: "Mars/Base" })]);
    await expect(service.run(AT)).resolves.toEqual({ considered: 1, sent: 1 });
    expect(notifiedUsers(notify)).toEqual(["u1"]);
  });

  it("passes push content only, never email", async () => {
    const { service, notify, deliveries } = build([settingsFor("u1")]);
    await service.run(AT);
    expect(notify).toHaveBeenCalledWith("u1", {
      type: "expiry_alert",
      payload: {
        recipeId: "r-meat",
        recipeName: "Thịt kho",
        items: ["thịt ba chỉ", "trứng"],
      },
      delivery: {
        push: {
          title: "Tối nay nấu Thịt kho?",
          body: "Dùng hết thịt ba chỉ, trứng trước khi hỏng.",
        },
      },
    });
    expect(deliveries.claim).toHaveBeenCalledWith({
      userId: "u1",
      localDate: "2026-12-04",
      kind: "expiry_alert",
    });
  });

  it("claims before notifying", async () => {
    const { service, notify, deliveries } = build([settingsFor("u1")]);
    await service.run(AT);
    const [claimedAt] = deliveries.claim.mock.invocationCallOrder;
    const [notifiedAt] = notify.mock.invocationCallOrder;
    expect(claimedAt).toBeDefined();
    expect(claimedAt!).toBeLessThan(notifiedAt!);
  });

  it("sends nothing when no recipe rescues anything", async () => {
    const { service, notify, deliveries } = build([settingsFor("u1")], {
      ranked: [vegNoRescue],
    });
    await expect(service.run(AT)).resolves.toEqual({ considered: 1, sent: 0 });
    expect(notify).not.toHaveBeenCalled();
    expect(deliveries.claim).not.toHaveBeenCalled();
  });

  it("on a vegetarian day only vegetarian recipes may be rescues", async () => {
    const { service, notify, select } = build(
      [settingsFor("u1", { observesVegetarianDays: true })],
      { ranked: [meatRescue, vegNoRescue] },
    );
    await expect(service.run(VEG_DAY)).resolves.toEqual({ considered: 1, sent: 0 });
    expect(notify).not.toHaveBeenCalled();
    expect(select).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ context: { now: VEG_DAY, vegetarianDay: true } }),
    );
  });

  it("reminds about tomorrow's vegetarian day with the top vegetarian dish at 11:00 tomorrow", async () => {
    const { service, notify, select } = build(
      [settingsFor("u1", { observesVegetarianDays: true })],
      { ranked: [meatRescue, vegNoRescue] },
    );
    await expect(service.run(EVE_OF_VEG_DAY)).resolves.toEqual({
      considered: 1,
      sent: 1,
    });
    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        useAi: false,
        context: { now: new Date("2026-12-09T04:00:00Z"), vegetarianDay: true },
      }),
    );
    expect(notify).toHaveBeenCalledWith("u1", {
      type: "vegetarian_day",
      payload: { lunarDay: 1, lunarMonth: 11, isLeapMonth: false, recipeName: "Đậu sốt cà" },
      delivery: {
        push: {
          title: "Mai là mùng 1 tháng 11",
          body: "Gợi ý: Đậu sốt cà. Đi chợ chiều nay nhé.",
        },
      },
    });
  });

  it("does not remind about vegetarian days when not opted in", async () => {
    const { service, notify } = build([settingsFor("u1")]);
    await service.run(EVE_OF_VEG_DAY);
    expect(notify).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ type: "expiry_alert" }),
    );
  });

  it("pages through every candidate", async () => {
    const store = Array.from({ length: 205 }, (_, index) =>
      settingsFor(`u${String(index).padStart(3, "0")}`),
    );
    const { service } = build(store);
    await expect(service.run(AT)).resolves.toEqual({ considered: 205, sent: 205 });
  });
});
