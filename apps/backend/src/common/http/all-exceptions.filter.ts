import { randomUUID } from "node:crypto";
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { APP_CONFIG, AppConfig } from "../../config/env.schema";
import { AppLogger } from "../logging/app-logger.service";
import { defaultCodeForStatus, ErrorCode } from "./error-codes";

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: { requestId: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Translates every thrown error into the canonical error envelope
 * `{ error: { code, message, details? }, meta: { requestId } }`.
 *
 * Handler-supplied codes are preserved (e.g. `VALIDATION_ERROR`,
 * `OPTIMISTIC_LOCK_CONFLICT`); otherwise a stable code is derived from the HTTP
 * status. Unexpected errors are logged and hide their message in production.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly logger: AppLogger,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.requestId ?? randomUUID();

    // Keep the response header consistent with `meta.requestId`, including the
    // edge case of a failure before the request-id middleware ran.
    if (!response.getHeader("x-request-id")) {
      response.setHeader("x-request-id", requestId);
    }

    const envelope = this.buildEnvelope(exception, requestId);
    const status = this.statusFor(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const trace = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        `Unhandled ${status} on ${request.method} ${request.url}`,
        trace,
        "ExceptionFilter",
      );
    }

    response.status(status).json(envelope);
  }

  private statusFor(exception: unknown): number {
    return exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private buildEnvelope(exception: unknown, requestId: string): ErrorEnvelope {
    if (exception instanceof HttpException) {
      return {
        error: this.fromHttpException(exception),
        meta: { requestId },
      };
    }

    return {
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message:
          this.config.NODE_ENV === "production"
            ? "Internal server error"
            : exception instanceof Error
              ? exception.message
              : "Internal server error",
      },
      meta: { requestId },
    };
  }

  private fromHttpException(exception: HttpException): ErrorEnvelope["error"] {
    const status = exception.getStatus();
    const payload = exception.getResponse();

    // Server-fault (5xx) HttpExceptions may carry internal detail (DSNs,
    // upstream URLs, driver text). Redact it in production; keep a stable code.
    // The full exception is logged server-side by `catch`.
    if (
      status >= HttpStatus.INTERNAL_SERVER_ERROR &&
      this.config.NODE_ENV === "production"
    ) {
      const code = isRecord(payload) && typeof payload.code === "string"
        ? payload.code
        : defaultCodeForStatus(status);
      return { code, message: "Internal server error" };
    }

    if (typeof payload === "string") {
      return { code: defaultCodeForStatus(status), message: payload };
    }

    if (isRecord(payload)) {
      const code =
        typeof payload.code === "string"
          ? payload.code
          : defaultCodeForStatus(status);

      // class-validator surfaces `message` as a string[]; fold it into details.
      const rawMessage = payload.message;
      const message = Array.isArray(rawMessage)
        ? "Validation failed"
        : typeof rawMessage === "string"
          ? rawMessage
          : exception.message;

      let details: Record<string, unknown> | undefined;
      if (Array.isArray(rawMessage)) {
        details = { messages: rawMessage };
      } else if (isRecord(payload.details)) {
        details = payload.details;
      }

      return details ? { code, message, details } : { code, message };
    }

    return { code: defaultCodeForStatus(status), message: exception.message };
  }
}
