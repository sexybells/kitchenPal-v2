import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { AppLogger } from "../../common/logging/app-logger.service";
import { MEAL_REMINDERS_QUEUE } from "./reminder-scheduler.service";
import { ReminderTickService } from "./reminder-tick.service";

const HOUR_MS = 60 * 60 * 1000;

/** A tick picked up later than this is dropped: "go shopping this afternoon" would arrive in the evening. */
const MAX_TICK_LATENESS_MS = 2 * HOUR_MS;

/**
 * The hour the job was scheduled for. The BullMQ job scheduler stores the
 * enqueue time in `timestamp` and the wait until the cron instant in
 * `opts.delay`; flooring to the hour absorbs a clamped (zero) delay.
 */
function scheduledHour(job: Job): Date {
  const scheduled = job.timestamp + (job.opts.delay ?? 0);
  return new Date(Math.floor(scheduled / HOUR_MS) * HOUR_MS);
}

/** BullMQ worker for the hourly reminder tick; the logic lives in {@link ReminderTickService}. */
@Processor(MEAL_REMINDERS_QUEUE)
export class ReminderTickProcessor extends WorkerHost {
  private warnedWorkerError = false;

  constructor(
    private readonly tick: ReminderTickService,
    private readonly logger: AppLogger,
  ) {
    super();
  }

  async process(job: Job): Promise<{ considered: number; sent: number }> {
    const at = scheduledHour(job);
    if (Date.now() - at.getTime() > MAX_TICK_LATENESS_MS) {
      this.logger.warn(
        `Skipping stale meal reminder tick scheduled for ${at.toISOString()}`,
        ReminderTickProcessor.name,
      );
      return { considered: 0, sent: 0 };
    }
    return this.tick.run(at);
  }

  /** A failed tick otherwise leaves no trace in the logs. */
  @OnWorkerEvent("failed")
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(
      `Meal reminder tick ${job?.id ?? "(unknown job)"} failed: ${error.message}`,
      error.stack,
      ReminderTickProcessor.name,
    );
  }

  /** Listening keeps a Redis outage from crashing the process; warn once. */
  @OnWorkerEvent("error")
  onError(error: Error): void {
    if (!this.warnedWorkerError) {
      this.warnedWorkerError = true;
      this.logger.warn(
        `Meal reminder worker error: ${error.message}`,
        ReminderTickProcessor.name,
      );
    }
  }
}
