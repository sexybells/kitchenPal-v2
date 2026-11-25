import { i18n, initI18n } from "../../../i18n";
import { lunarDayLabel } from "../lunar-label";
import { rescueChipText } from "../rescue-label";

describe("lunarDayLabel / rescueChipText (vi)", () => {
  const vi = () => {
    initI18n("vi");
    return i18n.getFixedT("vi");
  };

  it("names the full-moon day", () => {
    expect(
      lunarDayLabel(vi(), { day: 15, month: 10, isLeapMonth: false }),
    ).toBe("rằm tháng 10");
  });

  it("uses traditional names for months 1 and 12", () => {
    expect(lunarDayLabel(vi(), { day: 1, month: 1, isLeapMonth: false })).toBe(
      "mùng 1 tháng Giêng",
    );
    expect(lunarDayLabel(vi(), { day: 15, month: 12, isLeapMonth: false })).toBe(
      "rằm tháng Chạp",
    );
  });

  it("marks a leap month", () => {
    expect(lunarDayLabel(vi(), { day: 1, month: 6, isLeapMonth: true })).toBe(
      "mùng 1 tháng 6 nhuận",
    );
  });

  it("truncates rescued names to two plus a remainder", () => {
    expect(rescueChipText(vi(), ["cà chua", "đậu bắp", "hành"])).toBe(
      "Dùng hết: cà chua, đậu bắp +1",
    );
    expect(rescueChipText(vi(), ["cà chua", "đậu bắp"])).toBe(
      "Dùng hết: cà chua, đậu bắp",
    );
  });
});
