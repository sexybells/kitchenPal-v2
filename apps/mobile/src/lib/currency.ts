/**
 * VND money helpers. All money in the product is stored and exchanged as an
 * INTEGER number of đồng (no minor unit, no decimals) — see `spending.ts` in the
 * api-contract. These helpers are the single place money becomes display text or
 * is parsed back from user input, so nothing else ever touches raw formatting.
 */

/**
 * Format an integer đồng amount for display, e.g. `12000` -> `"12.000 ₫"`.
 * Uses the Vietnamese convention: `.` as the thousands separator and a trailing
 * `₫`. Negative amounts (an overspent budget's remaining) keep their sign. Any
 * fractional input is rounded to whole đồng first — money is never a float here.
 */
export function formatVnd(amount: number): string {
  const rounded = Math.round(amount);
  const negative = rounded < 0;
  const digits = Math.abs(rounded).toString();

  let grouped = "";
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) grouped += ".";
    grouped += digits[i];
  }

  return `${negative ? "-" : ""}${grouped} ₫`;
}

/** Group an integer đồng amount without the currency mark, for input fields. */
export function formatVndDigits(amount: number): string {
  return formatVnd(amount).replace(" ₫", "");
}

/**
 * Parse free-form user input (which may contain grouping dots, spaces, or a `₫`)
 * into a non-negative integer number of đồng. Empty or non-numeric input is `0`.
 */
export function parseVndInput(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  if (digits === "") return 0;
  return Number(digits);
}
