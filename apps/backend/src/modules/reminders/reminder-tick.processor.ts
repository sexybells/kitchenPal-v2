import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { AppLogger } from "../../common/logging/app-logger.service";
import { MEAL_REMINDERS_QUEUE } from "./reminder-scheduler.service";
import { ReminderTickService } from "./reminder-tick.service";

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

  process(): Promise<{ considered: number; sent: number }> {
    return this.tick.run(new Date());
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
