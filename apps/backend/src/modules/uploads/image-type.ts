/** Image formats this platform accepts for storage. */
export type ImageExtension = "jpg" | "png" | "webp";

/**
 * Identifies an image from its leading magic bytes, not a client-supplied
 * content type (which is attacker-controlled). Returns the canonical extension,
 * or null when the bytes are not a supported image — so a mislabeled or
 * non-image payload cannot be stored under an image key.
 */
export function detectImageExtension(buffer: Buffer): ImageExtension | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "jpg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

/** MIME type for a detected extension. */
export function contentTypeFor(extension: ImageExtension): string {
  return extension === "jpg" ? "image/jpeg" : `image/${extension}`;
}
