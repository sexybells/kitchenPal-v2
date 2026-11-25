/**
 * Solar -> Vietnamese lunar calendar conversion.
 *
 * Algorithm: Hồ Ngọc Đức, "Tính lịch âm" (https://www.informatik.uni-leipzig.de/~duc/amlich/),
 * itself based on Jean Meeus, "Astronomical Algorithms". Ported to TypeScript as pure
 * functions. The Vietnamese calendar differs from the Chinese one because new moons and
 * solar terms are computed at UTC+7, not UTC+8 (e.g. Tết 1985 was 21 Jan, not 20 Feb).
 */
import type { SolarDate } from "./local-date";

export type { SolarDate } from "./local-date";

export interface LunarDate {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-30 */
  day: number;
  isLeapMonth: boolean;
}

/** Vietnam's offset from UTC in hours. */
const TIME_ZONE = 7;
const SYNODIC_MONTH = 29.530588853;
/** Julian day number of the epoch used by the new-moon index `k`. */
const NEW_MOON_EPOCH = 2415021.076998695;
const DEG_TO_RAD = Math.PI / 180;

/** Julian day number of a Gregorian calendar date. */
function jdFromDate(day: number, month: number, year: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

/** Julian date (fractional) of the k-th new moon since 1900-01-01. */
function newMoon(k: number): number {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const dr = DEG_TO_RAD;
  let jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let c1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
  c1 -= 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
  c1 -= 0.0004 * Math.sin(dr * 3 * Mpr);
  c1 += 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
  c1 += -0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
  c1 -= 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
  c1 += 0.001 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
  const deltaT =
    T < -11
      ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3
      : -0.000278 + 0.000265 * T + 0.000262 * T2;
  return jd1 + c1 - deltaT;
}

/** Julian day number (local) on which the k-th new moon falls. */
function getNewMoonDay(k: number): number {
  return Math.floor(newMoon(k) + 0.5 + TIME_ZONE / 24);
}

/** Sun's ecliptic longitude in radians [0, 2π) at Julian date `jdn`. */
function sunLongitude(jdn: number): number {
  const T = (jdn - 2451545.0) / 36525;
  const T2 = T * T;
  const dr = DEG_TO_RAD;
  const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let dl = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  dl += (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.00029 * Math.sin(dr * 3 * M);
  const L = (L0 + dl) * dr;
  return L - Math.PI * 2 * Math.floor(L / (Math.PI * 2));
}

/** Which of the 12 solar terms (0-11, 30 degrees each) the sun is in at local day `dayNumber`. */
function getSunLongitude(dayNumber: number): number {
  return Math.floor((sunLongitude(dayNumber - 0.5 - TIME_ZONE / 24) / Math.PI) * 6);
}

/** Julian day number of the start of lunar month 11 (the one containing the winter solstice). */
function getLunarMonth11(year: number): number {
  const off = jdFromDate(31, 12, year) - 2415021;
  const k = Math.floor(off / SYNODIC_MONTH);
  let nm = getNewMoonDay(k);
  if (getSunLongitude(nm) >= 9) nm = getNewMoonDay(k - 1);
  return nm;
}

/** Offset (in months after month 11) of the leap month in a 13-month lunar year. */
function getLeapMonthOffset(a11: number): number {
  const k = Math.floor((a11 - NEW_MOON_EPOCH) / SYNODIC_MONTH + 0.5);
  let i = 1;
  let arc = getSunLongitude(getNewMoonDay(k + i));
  let last: number;
  do {
    last = arc;
    i++;
    arc = getSunLongitude(getNewMoonDay(k + i));
  } while (arc !== last && i < 14);
  return i - 1;
}

/** Convert a Gregorian date to the Vietnamese lunar calendar (UTC+7). */
export function toLunarDate(date: SolarDate): LunarDate {
  const { day, month, year } = date;
  const dayNumber = jdFromDate(day, month, year);
  const k = Math.floor((dayNumber - NEW_MOON_EPOCH) / SYNODIC_MONTH);
  let monthStart = getNewMoonDay(k + 1);
  if (monthStart > dayNumber) monthStart = getNewMoonDay(k);

  let a11 = getLunarMonth11(year);
  let b11 = a11;
  let lunarYear: number;
  if (a11 >= monthStart) {
    lunarYear = year;
    a11 = getLunarMonth11(year - 1);
  } else {
    lunarYear = year + 1;
    b11 = getLunarMonth11(year + 1);
  }

  const lunarDay = dayNumber - monthStart + 1;
  const diff = Math.floor((monthStart - a11) / 29);
  let isLeapMonth = false;
  let lunarMonth = diff + 11;
  if (b11 - a11 > 365) {
    const leapMonthDiff = getLeapMonthOffset(a11);
    if (diff >= leapMonthDiff) {
      lunarMonth = diff + 10;
      if (diff === leapMonthDiff) isLeapMonth = true;
    }
  }
  if (lunarMonth > 12) lunarMonth -= 12;
  if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;

  return { year: lunarYear, month: lunarMonth, day: lunarDay, isLeapMonth };
}

/** Vegetarian days (ăn chay) fall on the 1st and 15th of every lunar month, leap months included. */
export function isVegetarianLunarDay(lunar: LunarDate): boolean {
  return lunar.day === 1 || lunar.day === 15;
}
