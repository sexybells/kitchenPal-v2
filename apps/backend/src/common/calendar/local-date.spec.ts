import {
  addDays,
  formatSolarDate,
  isValidTimeZone,
  localDateIn,
  localHourIn,
} from "./local-date";

describe("local date utils", () => {
  it("resolves the local date across the UTC boundary", () => {
    expect(localDateIn("Asia/Ho_Chi_Minh", new Date("2026-12-03T17:30:00Z"))).toEqual({
      year: 2026,
      month: 12,
      day: 4,
    });
  });

  it("resolves the local hour", () => {
    expect(localHourIn("Asia/Ho_Chi_Minh", new Date("2026-12-04T09:00:00Z"))).toBe(16);
  });

  it("reports midnight as hour 0, not 24", () => {
    expect(localHourIn("Asia/Ho_Chi_Minh", new Date("2026-12-04T17:00:00Z"))).toBe(0);
  });

  it("validates time zones", () => {
    expect(isValidTimeZone("Asia/Ho_Chi_Minh")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({
      year: 2027,
      month: 1,
      day: 1,
    });
    expect(addDays({ year: 2027, month: 3, day: 1 }, -1)).toEqual({
      year: 2027,
      month: 2,
      day: 28,
    });
  });

  it("formats as YYYY-MM-DD", () => {
    expect(formatSolarDate({ year: 2026, month: 2, day: 7 })).toBe("2026-02-07");
  });
});
