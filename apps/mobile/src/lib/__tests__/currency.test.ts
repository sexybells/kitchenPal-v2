import { formatVnd, formatVndDigits, parseVndInput } from "../currency";

describe("formatVnd", () => {
  it("groups thousands with dots and appends the đồng mark", () => {
    expect(formatVnd(12000)).toBe("12.000 ₫");
    expect(formatVnd(3000000)).toBe("3.000.000 ₫");
    expect(formatVnd(500)).toBe("500 ₫");
    expect(formatVnd(0)).toBe("0 ₫");
  });

  it("keeps the sign for an overspent (negative) amount", () => {
    expect(formatVnd(-5000)).toBe("-5.000 ₫");
  });

  it("rounds a fractional amount to whole đồng (money is never a float)", () => {
    expect(formatVnd(12000.4)).toBe("12.000 ₫");
    expect(formatVnd(12000.6)).toBe("12.001 ₫");
  });
});

describe("formatVndDigits", () => {
  it("groups without the currency mark for input fields", () => {
    expect(formatVndDigits(1500000)).toBe("1.500.000");
  });
});

describe("parseVndInput", () => {
  it("strips grouping and non-digits into an integer đồng value", () => {
    expect(parseVndInput("12.000")).toBe(12000);
    expect(parseVndInput("3.000.000 ₫")).toBe(3000000);
    expect(parseVndInput("")).toBe(0);
    expect(parseVndInput("abc")).toBe(0);
  });
});
