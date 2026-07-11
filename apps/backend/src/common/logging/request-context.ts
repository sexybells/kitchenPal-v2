import { AsyncLocalStorage } from "node:async_hooks";

interface RequestStore {
  requestId: string;
}

/**
 * Per-request storage keyed by the request-id middleware. Lets the logger and
 * any deep-call-stack code read the current `requestId` without threading it
 * through every function signature.
 */
class RequestContext {
  private readonly storage = new AsyncLocalStorage<RequestStore>();

  run(requestId: string, callback: () => void): void {
    this.storage.run({ requestId }, callback);
  }

  getRequestId(): string | undefined {
    return this.storage.getStore()?.requestId;
  }
}

export const requestContext = new RequestContext();
