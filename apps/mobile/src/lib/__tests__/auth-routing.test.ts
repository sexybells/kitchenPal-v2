import {
  resolveAuthRedirect,
  LANGUAGE_GATE_ENTRY,
  RETURNING_GUEST_ENTRY,
  APP_ENTRY,
} from "../auth-routing";

describe("resolveAuthRedirect", () => {
  it("stays put while the session is still loading", () => {
    expect(resolveAuthRedirect("loading", false, false)).toBeNull();
    expect(resolveAuthRedirect("loading", true, true)).toBeNull();
  });

  it("sends a first-run guest to the language gate", () => {
    expect(resolveAuthRedirect("guest", false, false)).toBe(LANGUAGE_GATE_ENTRY);
  });

  it("sends a returning (onboarded) guest straight to login", () => {
    expect(resolveAuthRedirect("guest", false, true)).toBe(RETURNING_GUEST_ENTRY);
  });

  it("leaves a guest already in the auth stack alone", () => {
    expect(resolveAuthRedirect("guest", true, false)).toBeNull();
    expect(resolveAuthRedirect("guest", true, true)).toBeNull();
  });

  it("routes an authenticated user in the auth stack into the tabs", () => {
    expect(resolveAuthRedirect("authed", true, true)).toBe(APP_ENTRY);
  });

  it("leaves an authenticated user already in the app alone", () => {
    expect(resolveAuthRedirect("authed", false, true)).toBeNull();
  });
});
