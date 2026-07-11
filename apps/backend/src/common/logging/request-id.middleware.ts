import { randomUUID } from "node:crypto";
import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { requestContext } from "./request-context";

const REQUEST_ID_HEADER = "x-request-id";
// Bound inbound ids to a safe charset/length to prevent log injection and
// unbounded correlation strings; anything else is replaced with a fresh id.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Assigns a correlation id to every request: reuses a well-formed inbound
 * `x-request-id` header when present, otherwise generates one. The id is echoed
 * back on the response and stored in the async request context for the logger
 * and the response envelope's `meta.requestId`.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const inbound = req.headers[REQUEST_ID_HEADER];
    const requestId =
      typeof inbound === "string" && SAFE_REQUEST_ID.test(inbound)
        ? inbound
        : randomUUID();

    req.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    requestContext.run(requestId, () => next());
  }
}
