/** A calendar date in the Gregorian (solar) calendar, with no time or zone. */
export interface SolarDate {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
}

/** Whether `value` is an IANA time zone name the runtime understands. */
export function isValidTimeZone(value: string): boolean {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date at instant `at` as seen on a wall clock in `timeZone`. */
export function localDateIn(timeZone: string, at: Date): SolarDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(at);
  const pick = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: pick("year"), month: pick("month"), day: pick("day") };
}

/** The wall-clock hour (0-23) at instant `at` in `timeZone`. */
export function localHourIn(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(at);
  return Number(parts.find((part) => part.type === "hour")?.value) % 24;
}

/** `date` shifted by `days` (may be negative). Pure calendar arithmetic. */
export function addDays(date: SolarDate, days: number): SolarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** `"YYYY-MM-DD"`. */
export function formatSolarDate(date: SolarDate): string {
  const pad = (value: number, width: number): string => String(value).padStart(width, "0");
  return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`;
}
