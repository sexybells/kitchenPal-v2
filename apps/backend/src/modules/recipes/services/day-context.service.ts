import { Injectable } from "@nestjs/common";
import type { SuggestionDay } from "@kitchenpal/api-contract";
import {
  formatSolarDate,
  isValidTimeZone,
  localDateIn,
  type SolarDate,
} from "../../../common/calendar/local-date";
import {
  isVegetarianLunarDay,
  toLunarDate,
} from "../../../common/calendar/vietnamese-lunar";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { UserSettingsRepository } from "../../users/repositories/user-settings.repository";
import type { SelectionContext } from "./recipe-selection.service";

export const DEFAULT_TIME_ZONE = "Asia/Ho_Chi_Minh";

/** The user's local day: contract block plus the zone and solar date it came from. */
export type DayContext = SuggestionDay & {
  timeZone: string;
  solar: SolarDate;
};

/**
 * Resolves "what day is it for this user": their local solar date, its
 * Vietnamese lunar date, and whether vegetarian priority applies (lunar day 1 or
 * 15 AND the user opted in). Shared by suggestions, meal auto-fill and the
 * reminder job.
 */
@Injectable()
export class DayContextService {
  constructor(
    private readonly settings: UserSettingsRepository,
    private readonly logger: AppLogger,
  ) {}

  async forUser(userId: string, at: Date): Promise<DayContext> {
    const stored = await this.storedSettings(userId);
    const timeZone = this.resolveZone(userId, stored?.timeZone);
    const solar = localDateIn(timeZone, at);
    const lunar = toLunarDate(solar);
    const vegetarianDay = isVegetarianLunarDay(lunar);
    return {
      date: formatSolarDate(solar),
      lunar: {
        day: lunar.day,
        month: lunar.month,
        year: lunar.year,
        isLeapMonth: lunar.isLeapMonth,
      },
      vegetarianDay,
      vegetarianPriority: vegetarianDay && stored?.observesVegetarianDays === true,
      timeZone,
      solar,
    };
  }

  /** Whether the user opted in to vegetarian days, for dates other than today. */
  async observesVegetarianDays(userId: string): Promise<boolean> {
    return (await this.storedSettings(userId))?.observesVegetarianDays === true;
  }

  private storedSettings(userId: string) {
    return this.settings.findOne({
      scope: "personal",
      userId,
      householdId: null,
    });
  }

  private resolveZone(userId: string, stored: string | undefined): string {
    if (stored && isValidTimeZone(stored)) {
      return stored;
    }
    if (stored) {
      this.logger.warn(
        `Invalid stored time zone "${stored}" for user ${userId}; using ${DEFAULT_TIME_ZONE}`,
        DayContextService.name,
      );
    }
    return DEFAULT_TIME_ZONE;
  }
}

/** Ranking input derived from a day context. */
export function toSelectionContext(day: DayContext, now: Date): SelectionContext {
  return { now, vegetarianDay: day.vegetarianPriority };
}
