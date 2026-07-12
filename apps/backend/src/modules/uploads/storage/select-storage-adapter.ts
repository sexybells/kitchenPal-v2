import type { AppConfig } from "../../../config/env.schema";
import { LocalStorageAdapter } from "./local-storage.adapter";
import { S3StorageAdapter } from "./s3-storage.adapter";
import type { StorageAdapter } from "./storage-adapter";

/**
 * Chooses the storage transport from `STORAGE_PROVIDER`. Fails closed rather
 * than silently falling back: `s3` without a bucket/region is a misconfigured
 * deployment, not a condition to paper over with local disk (which does not
 * survive a redeploy and is never shared across instances).
 *
 * The env schema already rejects this combination in production via its
 * `superRefine` guardrail; this check covers any path that constructs a config
 * object directly (tests, scripts) without going through `loadConfig`.
 */
export function selectStorageAdapter(config: AppConfig): StorageAdapter {
  if (config.STORAGE_PROVIDER === "s3") {
    if (!config.S3_BUCKET || !config.S3_REGION) {
      throw new Error(
        "STORAGE_PROVIDER=s3 requires S3_BUCKET and S3_REGION to be set.",
      );
    }
    return new S3StorageAdapter({
      bucket: config.S3_BUCKET,
      region: config.S3_REGION,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
      endpoint: config.S3_ENDPOINT,
      publicBaseUrl: config.UPLOAD_PUBLIC_BASE_URL,
    });
  }
  return new LocalStorageAdapter(config.UPLOAD_DIR, config.UPLOAD_PUBLIC_BASE_URL);
}
