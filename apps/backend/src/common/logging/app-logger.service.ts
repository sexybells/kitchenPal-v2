import { Inject, Injectable, LoggerService } from "@nestjs/common";
import pino, { Logger } from "pino";
import { APP_CONFIG, AppConfig } from "../../config/env.schema";
import { requestContext } from "./request-context";

/**
 * Structured JSON logger backed by pino, adapted to Nest's `LoggerService`.
 * Automatically attaches the current `requestId` so logs correlate with the
 * response envelope. Silent in the test environment to keep suites quiet.
 */
@Injectable()
export class AppLogger implements LoggerService {
  private readonly logger: Logger;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.logger = pino({
      level: config.NODE_ENV === "test" ? "silent" : config.LOG_LEVEL,
      base: { service: "kitchenpal-backend" },
    });
  }

  private withContext(): Logger {
    const requestId = requestContext.getRequestId();
    return requestId ? this.logger.child({ requestId }) : this.logger;
  }

  private static asMessage(message: unknown): string {
    return typeof message === "string" ? message : JSON.stringify(message);
  }

  log(message: unknown, context?: unknown): void {
    this.withContext().info({ context }, AppLogger.asMessage(message));
  }

  error(message: unknown, trace?: unknown, context?: unknown): void {
    this.withContext().error({ context, trace }, AppLogger.asMessage(message));
  }

  warn(message: unknown, context?: unknown): void {
    this.withContext().warn({ context }, AppLogger.asMessage(message));
  }

  debug(message: unknown, context?: unknown): void {
    this.withContext().debug({ context }, AppLogger.asMessage(message));
  }

  verbose(message: unknown, context?: unknown): void {
    this.withContext().trace({ context }, AppLogger.asMessage(message));
  }
}
