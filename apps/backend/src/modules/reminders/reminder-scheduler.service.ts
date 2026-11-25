import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import type { Queue } from "bullmq";
import { AppLogger } from "../../common/logging/app-logger.service";

export const MEAL_REMINDERS_QUEUE = "meal-reminders";
export const MEAL_REMINDERS_SCHEDULER_ID = "meal-reminders-tick";
/** Every hour on the hour; the tick itself picks users whose local hour is 16. */
export const MEAL_REMINDERS_PATTERN = "0 * * * *";

/**
 * Registers the hourly reminder tick with BullMQ. `upsertJobScheduler` is
 * idempotent, so every instance can call it at boot and there is still one
 * schedule. Registration is fire-and-forget: without Redis (e.g. local dev) it
 * logs a warning and HTTP keeps serving; boot never waits on Redis.
 */
@Injectable()
export class ReminderSchedulerService implements OnApplicationBootstrap {
  private warnedQueueError = false;

  constructor(
    @InjectQueue(MEAL_REMINDERS_QUEUE) private readonly queue: Queue,
    private readonly logger: AppLogger,
  ) {}

  onApplicationBootstrap(): void {
    // Without a listener a connection error event would crash the process.
    this.queue.on("error", (error) => {
      if (!this.warnedQueueError) {
        this.warnedQueueError = true;
        this.logger.warn(
          `Meal reminder queue error: ${error.message}`,
          ReminderSchedulerService.name,
        );
      }
    });
    this.queue
      .upsertJobScheduler(
        MEAL_REMINDERS_SCHEDULER_ID,
        { pattern: MEAL_REMINDERS_PATTERN },
        // Keep Redis from accumulating one finished job per hour forever.
        { name: "tick", opts: { removeOnComplete: 100, removeOnFail: 500 } },
      )
      .then(
        () =>
          this.logger.log(
            `Meal reminder scheduler registered (${MEAL_REMINDERS_PATTERN})`,
            ReminderSchedulerService.name,
          ),
        (error: Error) =>
          this.logger.warn(
            `Meal reminder scheduler not registered: ${error.message}`,
            ReminderSchedulerService.name,
          ),
      );
  }
}
