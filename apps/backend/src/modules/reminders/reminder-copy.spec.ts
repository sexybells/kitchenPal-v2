import type { LunarDate } from "../../common/calendar/vietnamese-lunar";
import {
  expiryAlertCopy,
  lunarDayLabel,
  lunarMonthLabel,
  vegetarianDayCopy,
} from "./reminder-copy";

const lunar = (day: number, month: number, isLeapMonth = false): LunarDate => ({
  day,
  month,
  year: 2027,
  isLeapMonth,
});

describe("reminder copy", () => {
  describe("lunar labels (vi)", () => {
    it("names month 1 Giêng and month 12 Chạp", () => {
      expect(lunarMonthLabel(lunar(15, 1), "vi")).toBe("tháng Giêng");
      expect(lunarMonthLabel(lunar(15, 12), "vi")).toBe("tháng Chạp");
      expect(lunarMonthLabel(lunar(15, 7), "vi")).toBe("tháng 7");
    });

    it("suffixes a leap month with ' nhuận'", () => {
      expect(lunarMonthLabel(lunar(1, 4, true), "vi")).toBe("tháng 4 nhuận");
    });

    it("calls day 15 rằm and day 1 mùng 1", () => {
      expect(lunarDayLabel(lunar(15, 1), "vi")).toBe("rằm tháng Giêng");
      expect(lunarDayLabel(lunar(1, 12), "vi")).toBe("mùng 1 tháng Chạp");
    });
  });

  describe("vegetarian day", () => {
    it("vi with a dish", () => {
      const copy = vegetarianDayCopy("vi", lunar(15, 1), "Canh chua chay");
      expect(copy.title).toBe("Mai là rằm tháng Giêng");
      expect(copy.body).toBe("Gợi ý: Canh chua chay. Đi chợ chiều nay nhé.");
    });

    it("vi on lunar day 1", () => {
      expect(vegetarianDayCopy("vi", lunar(1, 3), null).title).toBe(
        "Mai là mùng 1 tháng 3",
      );
    });

    it("vi without a dish", () => {
      expect(vegetarianDayCopy("vi", lunar(15, 1), null).body).toBe(
        "Nhớ chuẩn bị đồ chay, đi chợ chiều nay nhé.",
      );
    });

    it("en variants", () => {
      expect(vegetarianDayCopy("en", lunar(15, 1), "Tofu curry")).toEqual({
        title: "Tomorrow is the 15th of lunar month 1",
        body: "Try: Tofu curry. Shop for it this afternoon.",
      });
      expect(vegetarianDayCopy("en", lunar(1, 4, true), null)).toEqual({
        title: "Tomorrow is the 1st of lunar month 4 (leap)",
        body: "Remember to get vegetarian food in this afternoon.",
      });
    });
  });

  describe("expiry alert", () => {
    it("vi", () => {
      expect(expiryAlertCopy("vi", "Canh chua", ["cà chua", "đậu hũ"])).toEqual({
        title: "Tối nay nấu Canh chua?",
        body: "Dùng hết cà chua, đậu hũ trước khi hỏng.",
      });
    });

    it("en", () => {
      expect(expiryAlertCopy("en", "Sour soup", ["tomato", "tofu"])).toEqual({
        title: "Cook Sour soup tonight?",
        body: "Use up tomato, tofu before they spoil.",
      });
    });
  });
});
