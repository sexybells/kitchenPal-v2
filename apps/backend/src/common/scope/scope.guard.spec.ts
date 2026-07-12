import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { DataScope } from "@kitchenpal/api-contract";
import type { AuthUser } from "./auth-user";
import { MembershipVerifier } from "./membership";
import type { ScopeContext } from "./scope-context";
import { ScopeGuard } from "./scope.guard";

interface FakeRequest {
  user?: AuthUser;
  scopeContext?: ScopeContext;
}

function contextFor(request: FakeRequest): ExecutionContext {
  return {
    getType: () => "http",
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function reflectorReturning(scope: DataScope | undefined): Reflector {
  return {
    getAllAndOverride: () => scope,
  } as unknown as Reflector;
}

function verifier(isMember: boolean): MembershipVerifier {
  return {
    isActiveMember: () => Promise.resolve(isMember),
  };
}

describe("ScopeGuard household resolution", () => {
  it("resolves household scope only for a verified active member", async () => {
    const guard = new ScopeGuard(reflectorReturning("household"), verifier(true));
    const request: FakeRequest = {
      user: { id: "u1", roles: ["user"], activeHouseholdId: "h1" },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.scopeContext).toEqual({
      scope: "household",
      userId: "u1",
      householdId: "h1",
    });
  });

  it("rejects household scope when the user is not an active member", async () => {
    const guard = new ScopeGuard(
      reflectorReturning("household"),
      verifier(false),
    );
    const request: FakeRequest = {
      user: { id: "u1", roles: ["user"], activeHouseholdId: "h1" },
    };

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(request.scopeContext).toBeUndefined();
  });

  it("rejects household scope when no active household is selected", async () => {
    const guard = new ScopeGuard(reflectorReturning("household"), verifier(true));
    const request: FakeRequest = {
      user: { id: "u1", roles: ["user"], activeHouseholdId: null },
    };

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("resolves personal scope without consulting membership", async () => {
    const guard = new ScopeGuard(reflectorReturning("personal"), verifier(false));
    const request: FakeRequest = {
      user: { id: "u1", roles: ["user"], activeHouseholdId: "h1" },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.scopeContext?.scope).toBe("personal");
  });

  it("bypasses non-HTTP (socket) execution contexts", async () => {
    const guard = new ScopeGuard(reflectorReturning("household"), verifier(false));
    const wsContext = {
      getType: () => "ws",
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(wsContext)).resolves.toBe(true);
  });
});
