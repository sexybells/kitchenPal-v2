import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
} from "@nestjs/common";
import type { AppConfig } from "../../config/env.schema";
import type { AppLogger } from "../logging/app-logger.service";
import { AllExceptionsFilter } from "./all-exceptions.filter";

interface CapturedResponse {
  statusCode: number;
  body: { error: { code: string; message: string; details?: unknown }; meta: unknown };
  headers: Record<string, string>;
}

function runFilter(
  exception: unknown,
  nodeEnv: AppConfig["NODE_ENV"],
): CapturedResponse {
  const captured: CapturedResponse = {
    statusCode: 0,
    body: { error: { code: "", message: "" }, meta: {} },
    headers: {},
  };

  const response = {
    getHeader: (name: string) => captured.headers[name],
    setHeader: (name: string, value: string) => {
      captured.headers[name] = value;
    },
    status(code: number) {
      captured.statusCode = code;
      return this;
    },
    json(payload: CapturedResponse["body"]) {
      captured.body = payload;
      return this;
    },
  };

  const request = { requestId: "req-1", method: "GET", url: "/x" };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  const logger = { error: () => undefined, log: () => undefined } as unknown as AppLogger;
  const config = { NODE_ENV: nodeEnv } as AppConfig;

  new AllExceptionsFilter(logger, config).catch(exception, host);
  return captured;
}

describe("AllExceptionsFilter", () => {
  it("redacts a 5xx message in production but keeps a stable code", () => {
    const captured = runFilter(
      new InternalServerErrorException("mongodb://secret:pw@host/db unreachable"),
      "production",
    );

    expect(captured.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(captured.body.error.message).toBe("Internal server error");
    expect(captured.body.error.message).not.toContain("secret");
    expect(captured.body.error.details).toBeUndefined();
  });

  it("keeps the 5xx message outside production", () => {
    const captured = runFilter(
      new InternalServerErrorException("boom detail"),
      "development",
    );
    expect(captured.body.error.message).toBe("boom detail");
  });

  it("preserves 4xx client messages in production", () => {
    const captured = runFilter(
      new BadRequestException({ code: "VALIDATION_ERROR", message: "bad field" }),
      "production",
    );
    expect(captured.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(captured.body.error.code).toBe("VALIDATION_ERROR");
    expect(captured.body.error.message).toBe("bad field");
  });

  it("redacts an unknown (non-HttpException) error in production", () => {
    const captured = runFilter(new Error("raw driver text"), "production");
    expect(captured.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(captured.body.error.message).toBe("Internal server error");
  });

  it("sets the request-id header to match meta.requestId", () => {
    const captured = runFilter(new HttpException("nope", 418), "development");
    expect(captured.headers["x-request-id"]).toBe("req-1");
  });
});
