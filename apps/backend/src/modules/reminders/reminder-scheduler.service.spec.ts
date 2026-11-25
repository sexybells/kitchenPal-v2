import type { Queue } from "bullmq";
import type { AppLogger } from "../../common/logging/app-logger.service";
import {
  MEAL_REMINDERS_PATTERN,
  MEAL_REMINDERS_SCHEDULER_ID,
  ReminderSchedulerService,
} from "./reminder-scheduler.service";

describe("ReminderSchedulerService", () => {
  it("registers the hourly tick with bounded job retention", () => {
    const upsertJobScheduler = jest.fn(async () => ({}));
    const queue = { on: jest.fn(), upsertJobScheduler };
    const logger = { log: jest.fn(), warn: jest.fn() };
    const service = new ReminderSchedulerService(
      queue as unknown as Queue,
      logger as unknown as AppLogger,
    );

    service.onApplicationBootstrap();

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      MEAL_REMINDERS_SCHEDULER_ID,
      { pattern: MEAL_REMINDERS_PATTERN },
      { name: "tick", opts: { removeOnComplete: 100, removeOnFail: 500 } },
    );
  });
});
