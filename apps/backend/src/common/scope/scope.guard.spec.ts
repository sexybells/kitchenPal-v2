import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { DataScope } from "@kitchenpal/api-contract";
import type { AuthUser } from "./auth-user";
import { MembershipVerifier } from "./membership";
import type { ScopeContext } from "./scope-context";
import { ScopeGuard } from "./scope.guard";
import {
  HOUSEHOLD_PREFERRED_METADATA_KEY,
  SCOPE_METADATA_KEY,
} from "./scope.decorator";

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

/** A reflector that dispatches by metadata key, mirroring how routes declare it. */
function reflectorFor(metadata: {
  scope?: DataScope;
  householdPreferred?: boolean;
}): Reflector {
  return {
    getAllAndOverride: (key: string) => {
      if (key === HOUSEHOLD_PREFERRED_METADATA_KEY) {
        return metadata.householdPreferred;
      }
      if (key === SCOPE_METADATA_KEY) {
        return metadata.scope;
      }
      return undefined;
    },
  } as unknown as Reflector;
}

function reflectorReturning(scope: DataScope | undefined): Reflector {
  return reflectorFor({ scope });
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

describe("ScopeGuard household-preferred resolution", () => {
  it("resolves household scope for a verified active member", async () => {
    const guard = new ScopeGuard(
      reflectorFor({ householdPreferred: true }),
      verifier(true),
    );
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

  it("falls back to personal scope when the caller has no active household", async () => {
    const guard = new ScopeGuard(
      reflectorFor({ householdPreferred: true }),
      verifier(true),
    );
    const request: FakeRequest = {
      user: { id: "u1", roles: ["user"], activeHouseholdId: null },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.scopeContext).toEqual({
      scope: "personal",
      userId: "u1",
      householdId: null,
    });
  });

  it("falls back to personal scope (not 403) when membership was revoked", async () => {
    // A stale token still carries activeHouseholdId, but the user is no longer an
    // active member — they act on their own data rather than being denied.
    const guard = new ScopeGuard(
      reflectorFor({ householdPreferred: true }),
      verifier(false),
    );
    const request: FakeRequest = {
      user: { id: "u1", roles: ["user"], activeHouseholdId: "h1" },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.scopeContext?.scope).toBe("personal");
  });

  it("rejects an unauthenticated caller", async () => {
    const guard = new ScopeGuard(
      reflectorFor({ householdPreferred: true }),
      verifier(true),
    );
    const request: FakeRequest = {};

    await expect(
      guard.canActivate(contextFor(request)),
    ).rejects.toBeInstanceOf(Error);
    expect(request.scopeContext).toBeUndefined();
  });
});
