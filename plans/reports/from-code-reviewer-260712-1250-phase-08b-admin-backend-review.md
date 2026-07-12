# Phase 8b — Admin/Subscriptions Backend Review

Reviewer pass over the working-tree changes (admin, subscriptions, global RolesGuard, settings, dev-tools, token TTL, suspend, M1 join). Focus per task priority order.

## Verdict
Authorization surface is sound. The global RolesGuard promotion is correct and does not over- or under-restrict. One real security-control defect in settings secret-stripping (nested keys bypass the strip). Remaining items are audit-completeness and minor robustness notes.

Severity counts: Critical 0 · High 1 · Medium 2 · Low 3

---

## Priority 1 — Global RolesGuard blast radius: PASS

`app.module.ts:53-60` orders `JwtAuthGuard` → `RolesGuard` → `ScopeGuard` as `APP_GUARD`s.

- `roles.guard.ts:28-30` returns `true` when no `@Roles` metadata is present. Routes without `@Roles` are unaffected — regular authenticated users are **not** locked out. Verified no `@Scope("system")` routes exist and no non-admin route carries `@Roles`.
- Roles are read only from `request.user.roles` (`roles.guard.ts:32,40`), which `JwtAuthGuard` populates exclusively from the **verified** JWT claims (`jwt-auth.guard.ts:50-55`). Identity/roles are never taken from the body. Algorithm is pinned on verify (`token.service.ts:110-119`), blocking alg-confusion.
- `@Public` routes: `JwtAuthGuard` short-circuits (`jwt-auth.guard.ts:37`); `RolesGuard` then returns `true` (no `@Roles`). Public routes stay public.
- All 7 admin controllers carry class-level `@Roles("admin")` (grep confirmed: content, dev, logs, reports, settings, subscriptions, users). `getAllAndOverride([handler, class])` applies the class role to every method, so every `admin/*` route is gated. Non-admin → 403.

No over-restriction and no unreachable-gate found.

## Priority 2 — Admin authorization / IDOR / escalation: PASS

- `actorId` on every mutation comes from `@CurrentUser()` (verified `request.user`), never the body (e.g. `admin-users.controller.ts:47,58`, `admin-settings.controller.ts:36`).
- Role-change input is constrained to `z.enum(["user","admin"])` (`auth.ts:8`, `admin.ts:42`); an attacker cannot inject an unknown/privileged role string. A normal user cannot reach `PATCH /admin/users/:id/roles` (admin-gated), so no self-escalation path.
- Cross-tenant reads use the unscoped `AdminReadRepository` but still apply `notDeletedFilter` and are always paginated with a hard `limit ≤ 100` (`pagination.ts`, `admin-read.repository.ts:30-42`). No unbounded scans. Reads are intended cross-tenant per spec.
- All admin *mutation* routes are on `@Roles("admin")` controllers; none is missing the gate.

## Priority 3 — Audit logging completeness: MOSTLY PASS (see M1)

Audited mutations (all `await audit.record` after the write): user roles/suspend (`admin-users.service.ts:68,95`), recipe create/update/publish/delete (`admin-content.service.ts:127,152,173,184`), plan create/update (`admin-subscriptions.service.ts:34,49`), subscription assign/cancel (`:69,83`), setting update (`admin-settings.service.ts:71`). `before/after` carry field names / non-secret values only.

Gap — see **M1** below: `admin/dev/{seed-plans,seed-recipes,reset}` mutations write **no** audit row.

## Priority 4 — Settings secret-safety: FAIL (High)

See **H1** below. Top-level strip works; nested objects bypass it and are stored + echoed.

## Priority 5 — Dev-tools prod guard: PASS

`DevToolsService` reads `NODE_ENV` once at construction (`dev-tools.service.ts:57`) and every action calls `assertNonProduction()` → `ForbiddenException` (`:61,74,107,122-128`). The flag is not re-derived from mutable request state, so it cannot be flipped per-request. `resetDevData` deletes only plans, user_subscriptions, system-scoped recipes, and settings — never accounts. Prod env validation additionally requires real secrets (`env.schema.ts:105-134`). No data-wipe reachable in production.

## Priority 6 — Subscriptions + suspend + M1: PASS

- Self-activate is genuinely inert: `selfActivate` validates the plan exists then returns `{activated:false,status:"contact_required"}` with **no** subscription write (`subscriptions.service.ts:66-81`). No entitlement is granted without admin.
- Admin `assignToUser` sets `source:"admin"`, cancels any prior active row first (single active invariant), `status:"active"` (`:142-170`). Correct.
- Self-`cancel` is a real opt-out/downgrade only (`:84-95`) — no purchase path.
- Suspension: `setSuspended` sets `suspendedAt` and calls `revokeAllForUser` (`admin-users.service.ts:91-93`), so all refresh families die immediately. Login rejects suspended accounts (`auth.service.ts:114-119`). A suspended user's live access token stays valid only until expiry: admin 10 min, regular 15 min (`auth.constants.ts:6,15`; `token.service.ts:92-96`). Per-request enforcement is deferred by design; the short admin window is reasonable.
- M1 join: `create` and `acceptInvite` set `activeHouseholdId` and return a fresh token pair minted from the reloaded user (`household.service.ts:374-387`), so the new access token already carries `activeHouseholdId`. Returning the pair to the caller who owns it is the same contract as login — no token leakage to third parties.

---

## Findings

### H1 (High) — Nested/renamed config keys bypass the settings secret strip
`admin-settings.service.ts:82-97` — `sanitizeConfig` only tests **top-level** key names against `SECRET_KEY_PATTERN`. `updateSettingSchema.config` is `z.record(z.string(), z.unknown())` (`admin.ts:211`), which accepts arbitrary nested objects. A payload such as:

```json
{ "enabled": true, "config": { "ai": { "apiKey": "sk-live-..." } } }
```

has a top-level key `ai` that does not match the pattern, so the whole object — including the nested `apiKey` — is persisted verbatim and returned by `GET /admin/settings/integrations` (`toSettingResponse` echoes `config` as stored). This defeats the stated invariant that "secrets never enter the database and can never be echoed back."

Blast radius is admin-only (only an admin can submit and only admins can read), so this is a defense-in-depth / secret-hygiene control failure rather than a privilege-escalation path — hence High, not Critical. Fix: recurse `sanitizeConfig` into nested objects/arrays (strip matching keys at any depth). Note the control fundamentally inspects key *names* only; a secret placed in a non-secret-named string value still slips through — document that limitation or validate values.

### M1 (Medium) — Dev-tool mutations write no audit row and reset has no actor
`dev-tools.service.ts` — `seedPlans`, `seedRecipes`, and especially `resetDevData` mutate/destroy data but never call `AdminAuditService.record`; `resetDevData` takes no `actorId` at all (`admin-dev.controller.ts` `reset()` passes nothing). `reset` hard-deletes plans, user_subscriptions, system recipes, and settings with zero audit trail. Confined to non-prod (guard blocks prod), so severity is bounded, but it contradicts the "every admin mutation is audited" guarantee. Recommend recording an audit row (with actor) for at least `reset`.

### M2 (Medium) — Audit write is not atomic with the mutation
Every admin service performs the persistence write first, then `await audit.record(...)`. If the audit insert throws, the mutation has already committed and the admin gets a 500 — leaving a state change with no audit row and a misleading error. Non-transactional Mongo design makes full atomicity hard, but consider: (a) wrapping the audit failure so it logs loudly without masking a successful mutation, or (b) a transaction/session where the deployment supports it. Not a security defect; flagged for audit-integrity.

### L1 (Low) — Redundant per-route guard now that RolesGuard is global
`users/users.controller.ts:101-102` still has `@Roles("admin") @UseGuards(RolesGuard)` on `GET users/admin/overview`. With the global `APP_GUARD` RolesGuard, the local `@UseGuards(RolesGuard)` runs the guard twice (harmless/idempotent) and the import is now dead weight. Remove for clarity; route remains correctly admin-gated either way.

### L2 (Low) — RolesGuard lacks the non-HTTP short-circuit its siblings have
`JwtAuthGuard` and `ScopeGuard` early-return on `context.getType() !== "http"` (WebSocket handshake handles its own auth); `RolesGuard` does not. It is currently safe only because no WS handler carries `@Roles` (so it returns `true` before touching `request`). If a future gateway message handler adds `@Roles`, `context.switchToHttp().getRequest()` would misbehave. Add the same non-HTTP guard for consistency/future-proofing.

### L3 (Low) — Suspended regular user keeps a valid access token up to 15 min
Accepted per task constraints (per-request enforcement deferred). Noted only so it is a conscious product decision: suspension bites at login + refresh-revocation, but an already-issued access token remains usable for its TTL (regular 15 min, admin 10 min). If instant lockout is ever required for a compromised/abusive account, a `suspendedAt` check in the guard would be needed.

---

## Not defects (verified, per task deferrals)
- Self-activate inert (no payments) — intended.
- ai-costs summing 0 until AI writers populate token fields — schema + `$ifNull` aggregation ready (`admin-read.repository.ts:179-224`).
- Per-request suspension enforcement deferred — see L3.
- Cross-tenant admin reads via unscoped repo — intended, soft-delete still excluded.

## Unresolved questions
- H1: confirm whether the settings API is ever expected to hold structured (nested) config; if yes, the recursive strip is required, if no, reject non-primitive config values outright at the schema.
- M1: is an audit trail wanted for dev-tool resets, or is non-prod-only acceptable to leave unlogged?
