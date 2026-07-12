# Phase 07 — Household, Chat & Notifications: Security Review

Date: 2026-07-12 · Reviewer: code-reviewer · Scope: working-tree `apps/backend/src/modules/household/**`, `common/scope/*`, `common/socket/*`, spending wiring, contracts. No code modified.

## Verdict

Tenant isolation is well constructed and mostly fail-closed. JWT handshake auth, membership-verified ScopeGuard, per-entry-point re-verification in `ChatService`, atomic single-use invites, and server-side fanout targeting are all sound. One real authorization-after-revocation leak on the socket path (the exact scenario the brief flagged) is the single item worth fixing before this is trusted in production. Everything else is Low/informational.

## Findings

### HIGH-1 — Removed member keeps receiving household room broadcasts on a still-open socket
`apps/backend/src/modules/household/services/household.service.ts:187` (`removeMember`), `:118` (`remove`), and role-downgrade in `updateMemberRole:155`; `realtime/realtime-emitter.ts:30`; `chat.gateway.ts:104`.

Membership revocation only mutates the DB (`status: "removed"`, `clearActiveHousehold`). Nothing forces the removed user's live socket out of the `household:<id>` room. Socket.IO room membership is in-memory on the socket and is only ever left via the client-initiated `leaveHousehold` (`chat.gateway.ts:104`) — there is no `socketsLeave` / `disconnectSockets` / server-side leave anywhere (grep-confirmed: the only `.leave(` is client-driven).

Concrete scenario: user B is an active member with an open socket joined to `household:H`. An owner removes B (or B is downgraded/household deleted). B's REST access is correctly cut (ScopeGuard + `requireActiveMember` re-check on every request). But B's socket stays in the room, so every subsequent `emitToHousehold(H, ...)` — new `message`, `voteUpdated`, `messagesRead`, and the `expense`/`budget_alert` cards — continues streaming to B until B happens to disconnect/reconnect. That is one household's live data reaching a now-unauthorized principal, i.e. exactly the "removed user can't keep receiving via a still-open socket" case the brief calls out.

Note the blast radius is bounded and worth stating precisely: notification fanout is NOT affected — `publish` (`chat.service.ts:227`) and the budget path compute recipients from `activeMemberIds` (DB), which excludes removed users, so `user:<id>` notification emits are correct. Only the household *room* broadcasts leak, and only to a former member with a live socket, until that socket drops.

Fix: on removal/downgrade/household-deletion, evict the user from the room server-side — e.g. `server.in(userRoom(userId)).socketsLeave(householdRoom(householdId))` via a `RealtimeEmitter` method — or force-disconnect the user's sockets. Call it from `removeMember`, `remove`, and (for role changes that should drop room access, if any) `updateMemberRole`. Because Redis adapter is used in prod, use the adapter-aware `socketsLeave`/`disconnectSockets` (they propagate cross-instance) rather than iterating local sockets.

### LOW-1 — `SOCKET_CORS_ORIGINS` not required in production
`apps/backend/src/config/env.schema.ts:83` (`SOCKET_CORS_ORIGINS: z.string().optional()`); `common/socket/authenticated-io.adapter.ts:30`.

`REDIS_URL` is prod-required via superRefine, but `SOCKET_CORS_ORIGINS` is not. If unset in prod the allowlist is empty, which is fail-closed (all browser origins rejected; native no-Origin clients still gated by JWT) — so this is not a vulnerability, but a silent misconfig would break all web socket clients with only a warn log. Consider requiring it in prod alongside `REDIS_URL`, or at least logging at boot when prod has an empty socket allowlist. No wildcard path exists; `credentials: true` is paired with an explicit-origin callback, not reflection — good.

### LOW-2 — `acceptInvite` consumes the code before the already-member short-circuit
`apps/backend/src/modules/household/services/household.service.ts:281`.

`invites.claim` atomically marks the code `accepted` first; only afterward does the "already an active member → don't double-count" branch run (`:293`). An existing active member who redeems a still-pending code burns it without adding a seat. Not a security issue (no double membership; unique index `(householdId,userId)` at `household-member.schema.ts:43` also backstops the race), just wasted invites / mild surprise. Optional.

### INFO
- `findMembership` / `findActiveMembership` / `isActiveMember` (`household-member.repository.ts:22-41`) gate on `status: "active"` but not `deletedAt: null`. No code path soft-deletes a member while leaving `status:"active"`, so not currently exploitable — worth aligning for consistency with the list queries that do filter `deletedAt`.
- Invite codes are stored/returned in plaintext (`household-invite.repository.ts`, `toInviteResponse`). This is correct by design — the code is a shareable capability the inviter must be able to display — noting only so it isn't mistaken for the refresh-token hashing pattern.

## Verified secure (risk calibration)

- **Handshake auth** (`chat.gateway.ts:65-80`, `token.service.ts`): JWT read from `handshake.auth.token` or `Authorization: Bearer`, verified via the shared `TokenService` with algorithm pinned to `HS256` (`auth.constants.ts:10`) — no `alg:none`/confusion. Identity comes only from `payload.sub`; a client-sent userId is never read. Missing/invalid/expired → `unauthorized` + `disconnect(true)`. Same secret/verifier as REST.
- **Defense in depth on handlers**: every `@SubscribeMessage` re-reads `client.data.userId` and fails if unset, so even the brief window before an unauthenticated socket is disconnected cannot perform an action.
- **join is authorized** (`joinHousehold:82`): validates `householdId`, then `membership.isActiveMember` before `client.join`; failure emits `joinRejected` and does NOT join.
- **No trust in prior join**: `sendMessage`/`castVote`/`markRead` all route through `ChatService`, which calls `requireActiveMember` on every entry point (`chat.service.ts:60,80,99,118,146,181`). REST and socket share this one path.
- **No broadcast bypass**: all server emits go through `emitToHousehold` (room-scoped) or `emitToUser` (per-user room). No global/namespace broadcast. `castVote`/`markRead`/`postCard` all target the household room only.
- **ScopeGuard fail-closed** (`scope.guard.ts:57-76`): `household` scope requires a live `isActiveMember` check against `activeHouseholdId`; the token claim alone never grants access, so a stale `activeHouseholdId` after removal cannot read household data. `remove`/`removeMember` also clear the stale `activeHouseholdId`.
- **Invites** (`secret-token.ts`, `household-invite.repository.ts:38`): 256-bit `randomBytes(32)` base64url codes; `claim` is a single atomic `findOneAndUpdate` filtering `status:"pending"` + `expiresAt > now`, flipping to `accepted` — revoked/expired/already-used cannot be claimed, replay/double-join impossible. Creating an invite requires `requireManager`, so you cannot mint one into a household you don't manage.
- **Role guards** (`household.service.ts`, `membership.service.ts`): role/removal changes require owner/admin via `requireManager` + strict `outranks`; owner role is unchangeable and unremovable; only owner deletes the household. Non-members get 404 (existence not revealed) from `requireActiveMember`. All `:householdId` routes enforce membership in the service, identity from `CurrentUser`.
- **Notifications**: per-user, IDOR-safe (`notification.repository.ts:22,50` scope by `userId`); `markRead` verifies ownership. Fanout is best-effort — push/email wrapped in try/catch that logs and never throws (`notification.service.ts:137-181`), degrades to in-app when keys absent. Cross-household fanout not possible (targets from `activeMemberIds`).
- **Spending seam** (`chat-spending-events.ts`): ignores personal scope, runs post-commit, whole body try/caught so a chat/notification failure never rolls back the expense.
- Global `JwtAuthGuard`/`ScopeGuard`/`ResponseInterceptor` correctly early-return for non-`http` contexts; all REST controllers are auth-gated (no stray `@Public`).

## Unresolved questions
- Confirm whether role downgrade (`updateMemberRole`) should also evict from any elevated room — currently only the `household:<id>` room exists (no admin-only room), so downgrade has no room impact today; only removal/deletion do. Fix for HIGH-1 should cover removal + household delete at minimum.

```
Status: DONE_WITH_CONCERNS
Summary: 1 High, 2 Low, 2 Info. Core socket/authz/tenant isolation is sound; one real leak — a removed member's still-open socket keeps receiving household room broadcasts (no server-side room eviction on revocation).
Concerns/Blockers: HIGH-1 (revocation does not evict the removed user's socket from the household room) should be fixed before production; it is the exact tenant-isolation gap the brief flagged. All other items are non-blocking.
```
