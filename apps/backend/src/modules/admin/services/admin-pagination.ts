/**
 * Offset-cursor helpers shared by the admin listings. Cursors are opaque
 * base64url-encoded skip offsets, matching the pattern used across the feature
 * modules so every paginated response behaves identically.
 */
export function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }
  const decoded = Number.parseInt(
    Buffer.from(cursor, "base64url").toString("utf8"),
    10,
  );
  return Number.isFinite(decoded) && decoded >= 0 ? decoded : 0;
}

/** Escapes user input before embedding it in a Mongo `$regex` search. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
