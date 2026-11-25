import { addDays } from "./local-date";
import { isVegetarianLunarDay, toLunarDate } from "./vietnamese-lunar";

describe("vietnamese lunar calendar", () => {
  it("converts Tết Bính Ngọ", () => {
    expect(toLunarDate({ year: 2026, month: 2, day: 17 })).toEqual({
      year: 2026,
      month: 1,
      day: 1,
      isLeapMonth: false,
    });
  });

  it("converts the 15th of the first month of 2026", () => {
    expect(toLunarDate({ year: 2026, month: 3, day: 3 })).toEqual({
      year: 2026,
      month: 1,
      day: 15,
      isLeapMonth: false,
    });
  });

  it("converts Tết Đinh Mùi 2027", () => {
    expect(toLunarDate({ year: 2027, month: 2, day: 6 })).toEqual({
      year: 2027,
      month: 1,
      day: 1,
      isLeapMonth: false,
    });
  });

  it("uses UTC+7 not UTC+8 (Tết 1985)", () => {
    const lunar = toLunarDate({ year: 1985, month: 1, day: 21 });
    expect(lunar.day).toBe(1);
    expect(lunar.month).toBe(1);
    expect(lunar.year).toBe(1985);
  });

  it("flags leap month 6 of 2025", () => {
    expect(toLunarDate({ year: 2025, month: 7, day: 25 })).toEqual({
      year: 2025,
      month: 6,
      day: 1,
      isLeapMonth: true,
    });
    expect(toLunarDate({ year: 2025, month: 8, day: 1 }).isLeapMonth).toBe(true);
    expect(toLunarDate({ year: 2025, month: 7, day: 24 }).isLeapMonth).toBe(false);
  });

  it("tomorrow of 2027-02-05 is lunar 1/1", () => {
    const tomorrow = addDays({ year: 2027, month: 2, day: 5 }, 1);
    expect(isVegetarianLunarDay(toLunarDate(tomorrow))).toBe(true);
    expect(toLunarDate(tomorrow)).toMatchObject({ month: 1, day: 1 });
  });

  it("2027-02-05 is the last day of lunar month 12", () => {
    const lunar = toLunarDate({ year: 2027, month: 2, day: 5 });
    expect(lunar.month).toBe(12);
    expect(lunar.year).toBe(2026);
    expect([29, 30]).toContain(lunar.day);
  });

  it("1 and 15 are vegetarian, 14 and 16 are not", () => {
    // 2026-03-03 is lunar 15/1, so lunar 14/1 is 03-02 and 16/1 is 03-04.
    const solar = (day: number) => ({ year: 2026, month: 3, day });
    expect(isVegetarianLunarDay(toLunarDate(solar(3)))).toBe(true);
    expect(isVegetarianLunarDay(toLunarDate(solar(2)))).toBe(false);
    expect(isVegetarianLunarDay(toLunarDate(solar(4)))).toBe(false);
    expect(isVegetarianLunarDay({ year: 2026, month: 5, day: 1, isLeapMonth: false })).toBe(true);
    expect(isVegetarianLunarDay({ year: 2026, month: 5, day: 15, isLeapMonth: true })).toBe(true);
    expect(isVegetarianLunarDay({ year: 2026, month: 5, day: 14, isLeapMonth: false })).toBe(false);
    expect(isVegetarianLunarDay({ year: 2026, month: 5, day: 16, isLeapMonth: false })).toBe(false);
  });
});
