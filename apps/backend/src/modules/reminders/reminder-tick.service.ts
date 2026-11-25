import { Injectable } from "@nestjs/common";
import type { HydratedDocument } from "mongoose";
import {
  addDays,
  localHourIn,
  type SolarDate,
} from "../../common/calendar/local-date";
import {
  isVegetarianLunarDay,
  toLunarDate,
} from "../../common/calendar/vietnamese-lunar";
import { AppLogger } from "../../common/logging/app-logger.service";
import {
  toPersonalScope,
  type ScopeContext,
} from "../../common/scope/scope-context";
import { UserRepository } from "../auth/repositories/user.repository";
import { HouseholdMemberRepository } from "../household/repositories/household-member.repository";
import { NotificationService } from "../household/services/notification.service";
import {
  DayContextService,
  resolveTimeZone,
  toSelectionContext,
} from "../recipes/services/day-context.service";
import { RecipeSelectionService } from "../recipes/services/recipe-selection.service";
import {
  UserSettingsRepository,
  type UserSettingsEntity,
} from "../users/repositories/user-settings.repository";
import { composeReminder, type ReminderInput } from "./reminder-composer";
import { ReminderDeliveryRepository } from "./repositories/reminder-delivery.repository";

/** Local wall-clock hour at which the daily reminder goes out. */
export const REMINDER_HOUR = 16;

/** Local hour of tomorrow's lunch, the moment the vegetarian dish is picked for. */
const VEGETARIAN_PICK_HOUR = 11;

const PAGE_SIZE = 200;

type SettingsDoc = HydratedDocument<UserSettingsEntity>;

type Outcome = "skipped" | "considered" | "sent";

/**
 * One hourly pass of the daily meal reminder. For every user whose local hour
 * is {@link REMINDER_HOUR}, picks at most one push — tomorrow's lunar
 * vegetarian day (opt-in) or a dish that uses up expiring pantry items — claims
 * the `(user, local date)` slot, then notifies with push content only (never
 * email). Never calls the AI ranker. One user's failure never stops the tick.
 *
 * Scale note: users are walked sequentially in `_id` pages. If a tick starts to
 * take more than a few minutes, split the pages into parallel jobs.
 */
@Injectable()
export class ReminderTickService {
  constructor(
    private readonly settings: UserSettingsRepository,
    private readonly users: UserRepository,
    private readonly members: HouseholdMemberRepository,
    private readonly dayContext: DayContextService,
    private readonly selection: RecipeSelectionService,
    private readonly notifications: NotificationService,
    private readonly deliveries: ReminderDeliveryRepository,
    private readonly logger: AppLogger,
  ) {}

  async run(at: Date): Promise<{ considered: number; sent: number }> {
    let considered = 0;
    let sent = 0;
    let afterId: string | null = null;
    for (;;) {
      const page: SettingsDoc[] = await this.settings.pageReminderCandidates(
        afterId,
        PAGE_SIZE,
      );
      for (const doc of page) {
        const outcome = await this.processSafely(doc, at);
        if (outcome !== "skipped") {
          considered += 1;
        }
        if (outcome === "sent") {
          sent += 1;
        }
      }
      const last = page.at(-1);
      if (!last || page.length < PAGE_SIZE) {
        break;
      }
      afterId = String(last._id);
    }
    this.logger.log(
      `Meal reminder tick at ${at.toISOString()}: considered=${considered} sent=${sent}`,
      ReminderTickService.name,
    );
    return { considered, sent };
  }

  private async processSafely(doc: SettingsDoc, at: Date): Promise<Outcome> {
    const userId = String(doc.createdBy);
    try {
      return await this.process(userId, doc, at);
    } catch (error) {
      this.logger.error(
        `Meal reminder failed for user ${userId}: ${(error as Error).message}`,
        (error as Error).stack,
        ReminderTickService.name,
      );
      // The cheap eligibility checks run before anything that can throw, so a
      // failing user was already due and counts as considered.
      return "considered";
    }
  }

  private async process(userId: string, doc: SettingsDoc, at: Date): Promise<Outcome> {
    // The query already filters these; re-check on the hydrated document.
    if (
      doc.notifications?.push === false ||
      doc.notifications?.mealReminders === false ||
      (doc.pushTokens ?? []).length === 0
    ) {
      return "skipped";
    }
    // Cheap pre-filter without DB or logging; DayContextService below resolves
    // the zone again (and warns once) only for users who are due now.
    if (localHourIn(resolveTimeZone(doc.timeZone), at) !== REMINDER_HOUR) {
      return "skipped";
    }
    const user = await this.users.findById(userId);
    if (!user || user.suspendedAt) {
      return "skipped";
    }

    const day = await this.dayContext.forUser(userId, at);
    const scope = await this.scopeFor(userId);
    const tomorrowLunar = toLunarDate(addDays(day.solar, 1));
    const remindVegetarianDay =
      doc.observesVegetarianDays === true && isVegetarianLunarDay(tomorrowLunar);

    const input: ReminderInput = {
      locale: doc.locale === "en" ? "en" : "vi",
      tomorrowLunar: remindVegetarianDay ? tomorrowLunar : null,
      vegetarianPick: null,
      rescuePick: null,
    };
    if (remindVegetarianDay) {
      const lunch = instantAtLocalHour(
        day.timeZone,
        addDays(day.solar, 1),
        VEGETARIAN_PICK_HOUR,
      );
      const ranked = await this.rank(scope, userId, { now: lunch, vegetarianDay: true });
      const pick = ranked.find((entry) => entry.isVegetarian);
      input.vegetarianPick = pick ? { name: pick.doc.name } : null;
    } else {
      const ranked = await this.rank(scope, userId, toSelectionContext(day, at));
      const pick = ranked.find(
        (entry) =>
          entry.rescues.length >= 1 && (!day.vegetarianPriority || entry.isVegetarian),
      );
      input.rescuePick = pick
        ? {
            recipeId: pick.doc.id,
            name: pick.doc.name,
            items: pick.rescues.map((rescue) => rescue.name),
          }
        : null;
    }

    const reminder = composeReminder(input);
    if (!reminder) {
      return "considered";
    }
    const claimed = await this.deliveries.claim({
      userId,
      localDate: day.date,
      kind: reminder.type,
    });
    if (!claimed) {
      return "considered";
    }
    // Claimed first: a failed send is not retried (best-effort, like notify).
    await this.notifications.notify(userId, {
      type: reminder.type,
      payload: reminder.payload,
      delivery: { push: reminder.push },
    });
    return "sent";
  }

  /** Same scope as the home screen: the user's household when active, else personal. */
  private async scopeFor(userId: string): Promise<ScopeContext> {
    const membership = await this.members.latestActiveForUser(userId);
    return membership
      ? { scope: "household", userId, householdId: membership.householdId.toString() }
      : toPersonalScope(userId);
  }

  private async rank(
    scope: ScopeContext,
    userId: string,
    context: { now: Date; vegetarianDay: boolean },
  ) {
    const { ranked } = await this.selection.select(scope, {
      operation: "reminder.daily",
      goal: "A dish for the daily meal reminder",
      userId,
      context,
      useAi: false,
    });
    return ranked;
  }
}

/**
 * The instant at which the wall clock in `timeZone` reads `hour`:00 on `date`.
 * Starts from that wall time read as UTC, subtracts the zone's offset there,
 * then repeats once with the offset at the first estimate so a DST change
 * between the two is corrected.
 */
export function instantAtLocalHour(timeZone: string, date: SolarDate, hour: number): Date {
  const wall = Date.UTC(date.year, date.month - 1, date.day, hour);
  const offsetAt = (instant: number): number => wallClockAsUtc(timeZone, instant) - instant;
  const estimate = wall - offsetAt(wall);
  return new Date(wall - offsetAt(estimate));
}

/** The wall-clock reading in `timeZone` at `instant`, encoded as a UTC timestamp. */
function wallClockAsUtc(timeZone: string, instant: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const pick = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(
    pick("year"),
    pick("month") - 1,
    pick("day"),
    pick("hour") % 24,
    pick("minute"),
    pick("second"),
  );
}
