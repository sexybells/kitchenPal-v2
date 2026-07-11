import {
  assertPublicUrl,
  BlockedAddressError,
  FetchRecipeHttpClient,
  isBlockedAddress,
} from "./recipe-http-client";

describe("SSRF guard", () => {
  it("blocks loopback, private, link-local, and reserved addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "0.0.0.0",
      "10.0.0.1",
      "172.16.5.4",
      "192.168.1.1",
      "169.254.169.254", // cloud instance metadata
      "100.64.0.1", // CGNAT
      "224.0.0.1", // multicast
      "::1",
      "fc00::1",
      "fe80::1",
      "::ffff:169.254.169.254", // IPv4-mapped metadata
    ]) {
      expect(isBlockedAddress(ip)).toBe(true);
    }
  });

  it("allows public addresses", () => {
    for (const ip of ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"]) {
      expect(isBlockedAddress(ip)).toBe(false);
    }
  });

  it("rejects a non-HTTP(S) scheme", async () => {
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toBeInstanceOf(
      BlockedAddressError,
    );
    await expect(assertPublicUrl("ftp://example.com")).rejects.toBeInstanceOf(
      BlockedAddressError,
    );
  });

  it("rejects a loopback/metadata literal URL before any fetch", async () => {
    const client = new FetchRecipeHttpClient();
    await expect(
      client.getText("http://169.254.169.254/latest/meta-data/"),
    ).rejects.toBeInstanceOf(BlockedAddressError);
    await expect(client.getText("http://127.0.0.1:9000/")).rejects.toBeInstanceOf(
      BlockedAddressError,
    );
    await expect(client.getText("http://[::1]/")).rejects.toBeInstanceOf(
      BlockedAddressError,
    );
  });
});
