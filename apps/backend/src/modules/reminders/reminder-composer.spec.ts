import type { LunarDate } from "../../common/calendar/vietnamese-lunar";
import { composeReminder } from "./reminder-composer";

const RAM_GIENG: LunarDate = { day: 15, month: 1, year: 2027, isLeapMonth: false };
const RESCUE = { recipeId: "r1", name: "Canh chua", items: ["cà chua", "đậu hũ"] };

describe("composeReminder", () => {
  it("prefers the vegetarian-day reminder over a rescue", () => {
    const result = composeReminder({
      locale: "vi",
      tomorrowLunar: RAM_GIENG,
      vegetarianPick: { name: "Đậu sốt cà" },
      rescuePick: RESCUE,
    });
    expect(result).toEqual({
      type: "vegetarian_day",
      payload: {
        lunarDay: 15,
        lunarMonth: 1,
        isLeapMonth: false,
        recipeName: "Đậu sốt cà",
      },
      push: {
        title: "Mai là rằm tháng Giêng",
        body: "Gợi ý: Đậu sốt cà. Đi chợ chiều nay nhé.",
      },
    });
  });

  it("still reminds on a vegetarian day with no dish", () => {
    const result = composeReminder({
      locale: "vi",
      tomorrowLunar: RAM_GIENG,
      vegetarianPick: null,
      rescuePick: null,
    });
    expect(result?.type).toBe("vegetarian_day");
    expect(result?.payload).not.toHaveProperty("recipeName");
    expect(result?.push.body).toBe("Nhớ chuẩn bị đồ chay, đi chợ chiều nay nhé.");
  });

  it("sends an expiry alert when only a rescue exists", () => {
    const result = composeReminder({
      locale: "en",
      tomorrowLunar: null,
      vegetarianPick: null,
      rescuePick: RESCUE,
    });
    expect(result).toEqual({
      type: "expiry_alert",
      payload: { recipeId: "r1", recipeName: "Canh chua", items: ["cà chua", "đậu hũ"] },
      push: {
        title: "Cook Canh chua tonight?",
        body: "Use up cà chua, đậu hũ before they spoil.",
      },
    });
  });

  it("returns null when there is nothing to say", () => {
    expect(
      composeReminder({
        locale: "vi",
        tomorrowLunar: null,
        vegetarianPick: null,
        rescuePick: null,
      }),
    ).toBeNull();
  });
});
