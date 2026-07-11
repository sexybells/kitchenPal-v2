import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { StorageAdapter, StoredObject } from "./storage-adapter";

/**
 * Development storage that writes objects under a base directory and returns a
 * URL built from a configured public prefix. Implements the same contract as a
 * future S3 adapter, so swapping transports needs no controller/service change.
 */
export class LocalStorageAdapter implements StorageAdapter {
  constructor(
    private readonly baseDir: string,
    private readonly publicBaseUrl: string,
  ) {}

  async save(key: string, body: Buffer): Promise<StoredObject> {
    const fullPath = join(this.baseDir, key);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, body);
    const base = this.publicBaseUrl.replace(/\/+$/, "");
    return { key, url: `${base}/${key}` };
  }
}
