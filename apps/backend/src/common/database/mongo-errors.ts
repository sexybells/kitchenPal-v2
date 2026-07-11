/**
 * True when a write failed a unique index (MongoDB error code 11000). Callers
 * use this to make a check-then-insert idempotent under concurrency: on a
 * duplicate, re-read and return the winning row instead of surfacing a 500.
 */
export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}
