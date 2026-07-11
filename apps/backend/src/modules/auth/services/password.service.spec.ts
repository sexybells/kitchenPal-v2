import { PasswordService } from "./password.service";

describe("PasswordService", () => {
  const service = new PasswordService();

  it("hashes a password to a non-reversible bcrypt digest", async () => {
    const hash = await service.hash("correct horse battery staple");
    expect(hash).not.toContain("correct horse");
    expect(hash.startsWith("$2")).toBe(true);
  });

  it("produces a distinct hash each time (per-hash salt)", async () => {
    const a = await service.hash("same-password");
    const b = await service.hash("same-password");
    expect(a).not.toBe(b);
  });

  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await service.hash("s3cret-password");
    expect(await service.verify("s3cret-password", hash)).toBe(true);
    expect(await service.verify("wrong-password", hash)).toBe(false);
  });

  it("exposes a VALID equalizer hash so the missing-user path runs the KDF", async () => {
    // A malformed hash would make bcrypt short-circuit and leak, via timing,
    // whether an account exists. Assert the equalizer is a real bcrypt hash and
    // that verifying against it actually executes to a definite false.
    expect(service.timingEqualizerHash).toMatch(/^\$2[aby]\$12\$.{53}$/);
    expect(await service.verify("any-password", service.timingEqualizerHash)).toBe(
      false,
    );
  });
});
