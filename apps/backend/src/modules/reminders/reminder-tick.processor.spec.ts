import type { Job } from "bullmq";
import type { AppLogger } from "../../common/logging/app-logger.service";
import { ReminderTickProcessor } from "./reminder-tick.processor";
import type { ReminderTickService } from "./reminder-tick.service";

const SCHEDULED = new Date("2026-12-04T09:00:00Z");

// Mirrors how the BullMQ job scheduler enqueues the next tick: created when the
// previous tick ran (`timestamp`), delayed until the scheduled instant.
function scheduledJob(createdAt: Date, scheduledFor: Date): Job {
  return {
    id: "repeat:meal-reminders-tick:1",
    timestamp: createdAt.getTime(),
    opts: { delay: scheduledFor.getTime() - createdAt.getTime() },
  } as unknown as Job;
}

function build() {
  const run = jest.fn(async () => ({ considered: 0, sent: 0 }));
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const processor = new ReminderTickProcessor(
    { run } as unknown as ReminderTickService,
    logger as unknown as AppLogger,
  );
  return { processor, run, logger };
}

describe("ReminderTickProcessor", () => {
  afterEach(() => jest.useRealTimers());

  it("runs the tick for the job's scheduled hour, not the pickup time", async () => {
    jest.useFakeTimers({ now: new Date("2026-12-04T10:30:00Z") });
    const { processor, run } = build();
    const job = scheduledJob(new Date("2026-12-04T08:00:00.120Z"), SCHEDULED);

    await processor.process(job);

    expect(run).toHaveBeenCalledWith(SCHEDULED);
  });

  it("skips and logs a tick picked up more than 2 hours late", async () => {
    jest.useFakeTimers({ now: new Date("2026-12-04T11:00:01Z") });
    const { processor, run, logger } = build();
    const job = scheduledJob(new Date("2026-12-04T08:00:00Z"), SCHEDULED);

    await expect(processor.process(job)).resolves.toEqual({ considered: 0, sent: 0 });

    expect(run).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("2026-12-04T09:00:00.000Z"),
      ReminderTickProcessor.name,
    );
  });

  it("logs a failed tick with the job id and error", () => {
    const { processor, logger } = build();
    const error = new Error("mongo down");

    processor.onFailed(scheduledJob(SCHEDULED, SCHEDULED), error);
    processor.onFailed(undefined, error);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringMatching(/repeat:meal-reminders-tick:1.*mongo down/),
      error.stack,
      ReminderTickProcessor.name,
    );
    expect(logger.error).toHaveBeenCalledTimes(2);
  });
});
