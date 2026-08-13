import { resolveErrorMessage } from "../error-message";
import { ApiClientError } from "../../api/errors";
import { initI18n, i18n } from "../../i18n";

const err = (code: string, message = "raw server text", status = 400) =>
  new ApiClientError({ code, message, status });

describe("resolveErrorMessage", () => {
  beforeAll(() => {
    initI18n("en");
  });

  it("returns null when there is no error", () => {
    expect(resolveErrorMessage(null, i18n.t)).toBeNull();
    expect(resolveErrorMessage(undefined, i18n.t)).toBeNull();
  });

  it("maps EMAIL_ALREADY_EXISTS to the email-taken message", () => {
    expect(resolveErrorMessage(err("EMAIL_ALREADY_EXISTS", "x", 409), i18n.t)).toBe(
      i18n.t("errors.emailTaken"),
    );
  });

  it("maps a plain CONFLICT to the generic conflict message, not email-taken", () => {
    const message = resolveErrorMessage(err("CONFLICT", "x", 409), i18n.t);
    expect(message).toBe(i18n.t("errors.conflict"));
    expect(message).not.toBe(i18n.t("errors.emailTaken"));
  });

  it("maps OPTIMISTIC_LOCK_CONFLICT to the stale-write message", () => {
    expect(resolveErrorMessage(err("OPTIMISTIC_LOCK_CONFLICT", "x", 409), i18n.t)).toBe(
      i18n.t("errors.staleWrite"),
    );
  });

  it("never leaks the raw server string for an unmapped code", () => {
    const raw = "An active budget already covers this period.";
    const message = resolveErrorMessage(err("SOME_NEW_UNMAPPED_CODE", raw, 500), i18n.t);
    expect(message).not.toBe(raw);
    expect(message).toBe(i18n.t("errors.server"));
  });

  it("localizes previously-unmapped backend codes instead of raw English", () => {
    expect(resolveErrorMessage(err("FORBIDDEN", "Forbidden", 403), i18n.t)).toBe(
      i18n.t("errors.forbidden"),
    );
    expect(resolveErrorMessage(err("SERVICE_UNAVAILABLE", "down", 503), i18n.t)).toBe(
      i18n.t("errors.unavailable"),
    );
    expect(
      resolveErrorMessage(err("INTERNAL_SERVER_ERROR", "boom", 500), i18n.t),
    ).toBe(i18n.t("errors.server"));
  });

  it("maps INVALID_CREDENTIALS to the wrong-credentials message, not session-expired", () => {
    const message = resolveErrorMessage(err("INVALID_CREDENTIALS", "x", 401), i18n.t);
    expect(message).toBe(i18n.t("errors.invalidCredentials"));
    expect(message).not.toBe(i18n.t("errors.sessionExpired"));
  });

  it("maps ACCOUNT_SUSPENDED to the suspended message", () => {
    expect(resolveErrorMessage(err("ACCOUNT_SUSPENDED", "x", 401), i18n.t)).toBe(
      i18n.t("errors.accountSuspended"),
    );
  });

  it("falls back to a localized message for a non-ApiClientError", () => {
    expect(resolveErrorMessage(new Error("boom"), i18n.t)).toBe(
      i18n.t("errors.server"),
    );
  });
});
