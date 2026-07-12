import { envSchema } from "../../../config/env.schema";
import { LocalStorageAdapter } from "./local-storage.adapter";
import { S3StorageAdapter } from "./s3-storage.adapter";
import { selectStorageAdapter } from "./select-storage-adapter";

describe("selectStorageAdapter", () => {
  it("returns a LocalStorageAdapter when STORAGE_PROVIDER is local (or unset)", () => {
    const config = envSchema.parse({ NODE_ENV: "development" });
    const adapter = selectStorageAdapter(config);
    expect(adapter).toBeInstanceOf(LocalStorageAdapter);
  });

  it("returns an S3StorageAdapter when STORAGE_PROVIDER=s3 with a bucket/region", () => {
    const config = envSchema.parse({
      NODE_ENV: "development",
      STORAGE_PROVIDER: "s3",
      S3_BUCKET: "kitchenpal-dev-uploads",
      S3_REGION: "ap-southeast-1",
    });
    const adapter = selectStorageAdapter(config);
    expect(adapter).toBeInstanceOf(S3StorageAdapter);
  });

  it("fails closed when STORAGE_PROVIDER=s3 but the bucket/region is missing", () => {
    const config = envSchema.parse({
      NODE_ENV: "development",
      STORAGE_PROVIDER: "s3",
    });
    expect(() => selectStorageAdapter(config)).toThrow(
      /S3_BUCKET and S3_REGION/,
    );
  });
});
