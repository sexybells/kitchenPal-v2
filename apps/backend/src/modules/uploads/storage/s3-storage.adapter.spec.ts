import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { S3StorageAdapter } from "./s3-storage.adapter";

// The adapter only writes (PutObjectCommand): reads happen through the public
// bucket/CDN URL it returns, exactly like the local adapter's static mount —
// there is no separate "get" call in this contract to mock.

jest.mock("@aws-sdk/client-s3", () => {
  const actual = jest.requireActual("@aws-sdk/client-s3");
  return {
    ...actual,
    S3Client: jest.fn(),
  };
});

describe("S3StorageAdapter", () => {
  const send = jest.fn();

  beforeEach(() => {
    send.mockReset();
    (S3Client as unknown as jest.Mock).mockImplementation(() => ({ send }));
  });

  it("saves an object via PutObjectCommand and returns its public URL", async () => {
    send.mockResolvedValueOnce({ ETag: '"mock-etag"' });
    const adapter = new S3StorageAdapter({
      bucket: "kitchenpal-uploads",
      region: "ap-southeast-1",
      publicBaseUrl: "https://cdn.kitchenpal.example",
    });

    const result = await adapter.save(
      "avatars/user-1.jpg",
      Buffer.from("fake-bytes"),
      "image/jpeg",
    );

    expect(result).toEqual({
      key: "avatars/user-1.jpg",
      url: "https://cdn.kitchenpal.example/avatars/user-1.jpg",
    });
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: "kitchenpal-uploads",
      Key: "avatars/user-1.jpg",
      ContentType: "image/jpeg",
    });
  });

  it("propagates a failed S3 call instead of swallowing it", async () => {
    send.mockRejectedValueOnce(new Error("access denied"));
    const adapter = new S3StorageAdapter({
      bucket: "kitchenpal-uploads",
      region: "ap-southeast-1",
      publicBaseUrl: "https://cdn.kitchenpal.example",
    });

    await expect(
      adapter.save("avatars/user-2.jpg", Buffer.from("x"), "image/jpeg"),
    ).rejects.toThrow("access denied");
  });

  it("configures path-style addressing when a custom endpoint is set", () => {
    new S3StorageAdapter({
      bucket: "kitchenpal-uploads",
      region: "auto",
      endpoint: "https://minio.internal:9000",
      publicBaseUrl: "https://cdn.kitchenpal.example",
    });

    expect(S3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://minio.internal:9000",
        forcePathStyle: true,
      }),
    );
  });

  it("round-trips the object it just wrote: the returned URL resolves under the object key", async () => {
    send.mockResolvedValueOnce({ ETag: '"mock-etag"' });
    const adapter = new S3StorageAdapter({
      bucket: "kitchenpal-uploads",
      region: "ap-southeast-1",
      publicBaseUrl: "https://cdn.kitchenpal.example/",
    });

    const key = "scans/household-1/scan-1.jpg";
    const stored = await adapter.save(key, Buffer.from("fake-bytes"), "image/jpeg");

    expect(stored.key).toBe(key);
    expect(stored.url).toBe(`https://cdn.kitchenpal.example/${key}`);
  });
});
