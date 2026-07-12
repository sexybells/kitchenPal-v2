import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Request } from "express";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { PageResult } from "./page-result";

interface SuccessEnvelope {
  data: unknown;
  meta: Record<string, unknown>;
}

/**
 * Wraps every successful handler result in the canonical success envelope
 * `{ data, meta: { requestId } }`. Paginated handlers return a {@link PageResult}
 * which becomes `{ data: items, meta: { requestId, page } }`.
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<SuccessEnvelope> {
    // Only HTTP responses are enveloped; the chat WebSocket gateway shapes its own
    // acknowledgements and emitted events, so leave non-HTTP results untouched.
    if (context.getType() !== "http") {
      return next.handle() as Observable<SuccessEnvelope>;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const requestId = request.requestId ?? "";

    return next.handle().pipe(
      map((value: unknown): SuccessEnvelope => {
        if (value instanceof PageResult) {
          return {
            data: value.items,
            meta: { requestId, page: value.page },
          };
        }
        return { data: value ?? null, meta: { requestId } };
      }),
    );
  }
}
