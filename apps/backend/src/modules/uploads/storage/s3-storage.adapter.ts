import {
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import type { StorageAdapter, StoredObject } from "./storage-adapter";

/** Configuration required to talk to the S3-compatible bucket. */
export interface S3StorageConfig {
  bucket: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  /** Override for S3-compatible providers (e.g. R2, MinIO). Optional for AWS. */
  endpoint?: string;
  /** Public base URL objects are served under (CDN or bucket website endpoint). */
  publicBaseUrl: string;
}

/**
 * Production storage that writes objects to an S3 (or S3-compatible) bucket.
 * Implements the same {@link StorageAdapter} contract as the local dev adapter,
 * so upload callers never change when the transport swaps.
 */
export class S3StorageAdapter implements StorageAdapter {
  private readonly client: S3Client;

  constructor(private readonly config: S3StorageConfig) {
    const clientConfig: S3ClientConfig = { region: config.region };
    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint;
      // S3-compatible providers behind a custom endpoint generally need
      // path-style addressing rather than AWS's virtual-hosted-style buckets.
      clientConfig.forcePathStyle = true;
    }
    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      };
    }
    this.client = new S3Client(clientConfig);
  }

  async save(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    const base = this.config.publicBaseUrl.replace(/\/+$/, "");
    return { key, url: `${base}/${key}` };
  }
}
