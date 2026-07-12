# Admin self-lockout guards + disambiguated email conflict code

Two backend fixes from the final consolidated review. Scope: `apps/backend/**` only (no contract change needed — error codes are not enumerated in `packages/api-contract`).

## 1. Admin self-lockout (High) — FIXED
`apps/backend/src/modules/admin/services/admin-users.service.ts`

- **Self-suspend blocked**: `setSuspended` rejects `input.suspended && actorId === id` → **400 BAD_REQUEST** "You cannot suspend your own account". (Reinstating oneself is still allowed — it is a harmless no-op.)
- **Self-demotion blocked**: `updateRoles` treats stripping `admin` from a current admin as a demotion; if `actorId === id` → **400 BAD_REQUEST** "You cannot remove your own admin role".
- **Last-admin protection (defense-in-depth)**: for a non-self demotion, `countActiveAdmins()` (`{ roles: "admin", suspendedAt: null }`, soft-delete excluded) is checked; if the change would drop usable admins below 1 → **409 CONFLICT** "Cannot remove the last remaining admin". (With the self-guard the acting admin is normally a remaining admin, so the reachable trigger is a single-admin self-demotion; the count guard also covers the case where the acting admin is itself already suspended.)
- Adding roles / unchanged roles are unaffected; audit logging on successful changes is unchanged.

e2e (`test/admin.e2e-spec.ts`, new `admin self-lockout guards` block):
- self-suspend → 400, account stays active
- last-admin self-demotion → 4xx, still admin
- promote a user to admin then demote them (non-last) → 200, admin removed
- admin suspends ANOTHER user → 200, suspended

## 2. Overloaded CONFLICT disambiguated (High, unblocks mobile) — FIXED
New error code (the value the mobile fix should map):

> **`EMAIL_ALREADY_EXISTS`** (string value `"EMAIL_ALREADY_EXISTS"`, HTTP 409)

- Added to `apps/backend/src/common/http/error-codes.ts` with a doc note.
- Used in the two email-taken paths in `auth.service.ts`: `register` (email already registered) and social sign-in (email already has an account, unverified provider — no auto-link).
- **Left untouched** on the generic code: pantry-scan-confirm conflicts and budget-overlap keep `CONFLICT`; optimistic-lock keeps `OPTIMISTIC_LOCK_CONFLICT`. Net: a bare `CONFLICT` no longer implies "email in use".
- `defaultCodeForStatus(409)` still returns `CONFLICT` (explicit throws override it), so other 409s are unaffected.
- No `packages/api-contract` change: error codes are not enumerated there (grep confirmed); clients map on the raw string.

e2e (`test/auth.e2e-spec.ts`): the duplicate-registration test now also asserts `error.code === "EMAIL_ALREADY_EXISTS"`.

## Test-infra note
`admin.e2e-spec.ts` `makeAdmin()` now memoizes the admin session (single register/bootstrap/login). The four added tests each needed an admin token, and the dedicated login rate-limiter tripped (429) on repeated logins; the admin's own roles never change in these tests, so caching is safe and keeps the suite hermetic.

## Verification (actual)
- `pnpm --filter @kitchenpal/api-contract build` → success.
- `pnpm --filter @kitchenpal/backend build|lint|typecheck` → clean; `test` → **31 suites, 202 passed** (was 198; +4 self-lockout e2e; email-code assertion added to an existing test).
- Root `pnpm build && lint && typecheck && test` → **all tasks green** (build 5/5, lint 7/7, typecheck 7/7, test 7/7; backend 202 + contract 48; mobile untouched).

## Unresolved questions
- None blocking. The non-self "last remaining admin" demotion is effectively unreachable via the API today (the actor is always an admin, so ≥2 admins exist); the count guard is retained as defense-in-depth and to cover a suspended-acting-admin edge.

Status: DONE
Summary: Admin self-lockout closed (no self-suspend, no self/last-admin demotion) and the email-taken conflict now returns a distinct `EMAIL_ALREADY_EXISTS` (409) code so mobile no longer mislabels scan-confirm/budget 409s. All gates green (202 backend + 48 contract tests).
Concerns/Blockers: none. Mobile should map error code string `EMAIL_ALREADY_EXISTS` to the "email already in use" message; a plain `CONFLICT` should map to a generic conflict message.
