/** A persisted object's storage key and its publicly reachable URL. */
export interface StoredObject {
  key: string;
  url: string;
}

/**
 * Pluggable binary storage. The local adapter writes to disk for development;
 * a future S3 adapter implements the same contract so callers never change.
 */
export interface StorageAdapter {
  save(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
}

/** DI token for the selected {@link StorageAdapter}. */
export const STORAGE_ADAPTER = "STORAGE_ADAPTER";
