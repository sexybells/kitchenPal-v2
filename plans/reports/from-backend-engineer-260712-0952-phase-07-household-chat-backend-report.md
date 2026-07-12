# Phase 07 — Household, Chat & Notifications (Backend) — Implementation Report

Date: 2026-07-12 · Scope: `apps/backend/**` + `packages/api-contract/**` (mobile deferred to a later delegation)

## Summary

Delivered multi-user households, membership-verified household-scope resolution, a
JWT-authenticated Socket.IO chat gateway (cards + vote polls + read receipts), and
the notification system (in-app + push + email fan-out). Wired the Phase-6 spending
seam to post expense/budget chat cards. The PRIMARY household-scope security
foundation is done and tested; the broader feature-scope stretch (pantry/shopping/
spending reading/writing in household scope) is deliberately deferred — see below.

## Entities (all soft-delete + version via `baseSchemaPlugin`)

- `Household` (name, ownerUserId, membersCount) — `households`
- `HouseholdMember` (householdId, userId, role owner|admin|member, status active|invited|removed); unique `(householdId,userId)` — `household_members`
- `HouseholdInvite` (householdId, code, status pending|accepted|revoked, expiresAt, invitedBy, acceptedBy); unique `code` — `household_invites`
- `HouseholdMessage` (householdId, senderId, type text|image|vote|expense|budget_alert, text?, imageUrl?, expenseId?, vote{question,options[],ballots[]}, readByUserIds[]) — `household_messages`
- `Notification` (userId, type, payload, readAt) — `notifications`

## REST endpoints (enveloped, validated, membership/role guarded)

Verified present in `/docs` at boot:
- Households: `POST/GET /households`, `GET/PATCH/DELETE /households/:householdId`
- Members: `GET /…/members`, `PATCH/DELETE /…/members/:memberId` (role change owner/admin only; self-leave allowed; owner protected)
- Invites: `POST/GET /…/invites`, `DELETE /…/invites/:inviteId`, `POST /invites/:code/accept`
- Chat: `GET/POST /…/messages`, `POST /…/messages/vote`, `POST /…/messages/image`, `POST /…/messages/read`
- Notifications: `GET /notifications`, `PATCH /notifications/:id/read`

Identity is always `CurrentUser` (JWT); membership/role is enforced in `MembershipService` against the path `:householdId`. Non-members get 404 (existence not revealed); insufficient role gets 403.

## Socket.IO gateway — auth, CORS, membership

- `ChatGateway` (`src/modules/household/chat.gateway.ts`), scoped to chat + notifications only (pantry/shopping live-sync deferred).
- **Auth from handshake**: JWT read from `handshake.auth.token` or `Authorization` header, verified via the shared `TokenService`; identity taken only from `payload.sub`. Missing/invalid token → emit `unauthorized` + `disconnect(true)`. A client-sent userId is never trusted.
- **CORS allowlist** (`AuthenticatedIoAdapter`, `src/common/socket/authenticated-io.adapter.ts`): origins from `SOCKET_CORS_ORIGINS` (comma-separated, NO wildcard). Fail-closed — unlisted browser origins rejected and logged. Requests with no `Origin` (native mobile) are allowed and still gated by the JWT handshake.
- **Redis adapter**: enabled only in production when `REDIS_URL` is set (cross-instance fan-out); dev/test use the default in-memory adapter, so the gateway runs with no Redis.
- **Events**: `joinHousehold` (verifies ACTIVE membership; on failure emits `joinRejected` and does NOT join the room), `leaveHousehold`, `sendMessage`, `castVote`, `markRead`. Server-emitted: `message`, `voteUpdated`, `messagesRead`, `notification`, `joinRejected`, `unauthorized`.
- Rooms: `household:<id>` (only active members joined) and `user:<id>` (every socket, for notifications). A non-member socket never receives a household's messages.
- Decoupling: services emit through `RealtimeEmitter` (the gateway binds its `Server` at `afterInit`), avoiding a gateway↔service DI cycle. REST and socket share the same `ChatService`, so membership enforcement has one path.

Global HTTP guards/interceptor were made WS-safe: `JwtAuthGuard`, `ScopeGuard`, and `ResponseInterceptor` early-return for non-`http` contexts.

## Notifications — fan-out + provider degrade

- `NotificationService` always persists an in-app record and emits it live to the user's socket room, then fans out per a type→channel policy AND the user's own `notifications.push/email` prefs.
- Policy: chat messages push-only; budget/expiry alerts, mentions, invites also email; invite-accepted push-only.
- **Push** (`PushSender` abstraction): `ExpoPushSender` (real Expo HTTP, optional access token) when `EXPO_PUSH_ENABLED=true`, else `LogPushSender` (logs; warns in prod). Push is best-effort — transport errors are logged, never thrown, so the in-app record stays the durable source of truth.
- **Email**: reuses the existing `EMAIL_ADAPTER` (Resend in prod, logging dev adapter otherwise — which already fails closed in prod). Best-effort, same swallow-and-log posture.

## Phase-6 → chat wiring

`ChatSpendingEvents extends SpendingEvents` (the previously no-op seam). On an expense logged in **household** scope it posts an `expense` card and, when over budget, a `budget_alert` card + a `budget_alert` notification fan-out to all active members. Personal-scope expenses are ignored. `ShoppingModule` now imports `HouseholdModule` and rebinds `{ provide: SpendingEvents, useExisting: ChatSpendingEvents }`; runs post-commit and never throws back into the spending flow. Verified end-to-end via the household e2e (drives the exact bound provider → expense + budget_alert card and member notifications appear).

## Household-scope activation

- **PRIMARY (done + tested):** `ScopeGuard` is now async and resolves `household` scope ONLY when `MembershipVerifier.isActiveMember` confirms the caller is a current active member of `activeHouseholdId`; otherwise fail-closed 403. `MembershipService` implements `MembershipVerifier` (bound in `HouseholdModule`, exported to the root injector) so the guard and every household route share one membership definition. Unit-tested in `scope.guard.spec.ts`.
- **STRETCH (deferred):** switching pantry/recipes/shopping/spending to operate in household scope was NOT done — it is a broader cross-module change than one safe pass. Feature routes remain `@Scope("personal")`. Consequence: the expense→chat-card path is fully implemented and tested through the seam, but will only fire from the live expense HTTP path once feature-scope activation lands.
  - **To activate later:** introduce a household-preferred scope resolution (household when the caller has a verified active household, else personal), apply it to the feature controllers, ensure `activeHouseholdId` is present in issued tokens (it is set on create/accept), and add shared-data e2e coverage. No schema change needed — scoped entities already carry `scope`/`householdId`.

## New contracts (`packages/api-contract/src`)

`household.ts`, `chat.ts`, `notification.ts` (exported from `index.ts`); reuse `objectIdSchema`, `dataScopeSchema`, pagination. Tests in `__tests__/household-chat-contract.test.ts`. Dual package rebuilt.

## Verification (actual)

- `pnpm --filter @kitchenpal/api-contract build` → success; `… test` → **6 files, 38 tests passed**.
- `pnpm --filter @kitchenpal/backend build | lint | typecheck` → all pass (lint clean, no `any`).
- `pnpm --filter @kitchenpal/backend test` → **25 suites, 160 tests passed** (incl. `household.e2e-spec.ts`, `chat-socket.e2e-spec.ts` two-client, `scope.guard.spec.ts`).
- Root: `pnpm build && pnpm lint && pnpm typecheck && pnpm test` → **6/6 turbo tasks pass** across backend + mobile + api-contract; mobile untouched.
- Boot on ephemeral (standalone) Mongo: all household/chat/notification/invite routes present in `/docs`; gateway + `RealtimeEmitter` resolve. (Socket e2e boots the full app with the gateway + Redis-less adapter.)

Tests cover: non-member `joinHousehold` rejected; member receives a sent message, non-member does not (two clients); vote tally live update; invite-accept adds a member and a bogus/unaccepted code cannot join; read receipts; notification fan-out records; role guard (member cannot change roles); unauthenticated socket disconnected; expense/budget cards + notifications. Push/email are exercised through the log adapters (no keys); Mongo is ephemeral, Redis absent.

## Deviations (all within allowed paths)

- Added backend deps: `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`, `@socket.io/redis-adapter`; dev: `socket.io-client`.
- `env.schema.ts` + `.env.example`: added `SOCKET_CORS_ORIGINS`, `EXPO_PUSH_ENABLED`, `EXPO_ACCESS_TOKEN`.
- Shared `ZodValidationPipe` generic loosened to accept transforming/coercing schemas (validates against OUTPUT type) — needed for the `unreadOnly` query flag; existing usage unaffected.
- Exported `EMAIL_ADAPTER` from `AuthModule` and `UserSettingsRepository` from `UsersModule` for the fan-out.
- `ShoppingModule` now imports `HouseholdModule` and rebinds `SpendingEvents`; dropped its `SpendingEvents` export (no external consumer).
- `MembershipService.requireActiveMember` returns 404 (not 403) for non-members to avoid leaking household existence.

## Unresolved questions / follow-ups

1. Feature-scope activation (the deferred stretch) — needed for members to actually share pantry/shopping/spending and for the expense card to fire from the live HTTP path. Recommend a focused follow-up.
2. Chat image flow: `POST …/messages/image` accepts an already-uploaded `imageUrl` (client uploads via the existing storage adapter first). Confirm whether a dedicated multipart chat-image upload endpoint is wanted instead.
3. Push in production is best-effort (logs a warning when unconfigured). Confirm whether prod should hard-require Expo/FCM config (email already fails closed in prod).
4. `chat_mention` type + parsing is defined in the contract/notification policy but no mention-detection is wired yet (no `@mention` parser) — add when the mobile compose UI defines mention syntax.

## Review fixes applied (security review 260712-1023)

- **H1 (fixed) — removed member kept receiving room broadcasts on a still-open socket.** Added `RealtimeEmitter.evictUserFromHousehold(userId, householdId)` using the adapter-aware `server.in(userRoom(userId)).socketsLeave(householdRoom(householdId))` (propagates cross-instance via the Redis adapter in prod; leaves only the household room, so the user's other households and their notification `user:<id>` room are untouched). Called from `HouseholdService.removeMember` (self-leave and manager-removal) and `remove` (household delete, evicts all members). Role changes (`updateMemberRole`) keep the target a member, so no eviction there. New two-client e2e in `chat-socket.e2e-spec.ts`: after the owner removes member B, an owner broadcast is NOT received by B's still-open socket, and B's socket stays connected.
- **L1 (fixed) — `SOCKET_CORS_ORIGINS` now required in production** via the env `superRefine` (alongside `REDIS_URL`/`JWT_ACCESS_SECRET`); empty/missing in prod fails startup instead of silently rejecting all web clients. Dev/test keep the optional default. Updated `env.schema.spec.ts` (rejects prod without it; accepts with it).
- **L2 (fixed) — `acceptInvite` no longer burns a fresh code for an already-active member.** Reordered: peek the invite by code, check membership first, and short-circuit an already-active member BEFORE the atomic `claim`. The join path still claims atomically (single-use, race-safe). New e2e: an existing member redeeming a fresh code does not consume it — a genuine newcomer can still use it. While adding that test I also fixed an off-by-one in the accept response (`membersCount` was read before the `+1` increment); it is now re-read after, so the response reflects the new seat.
- **L3 (verified, no change) — `deletedAt` consistency in membership queries.** `findMembership`/`findActiveMembership`/`isActiveMember` go through `BaseRepository.findOne`/`count`, which already apply `notDeletedFilter` (`deletedAt: null`); they exclude soft-deleted rows exactly like the raw `find` list queries do. Behavior is already consistent, so adding an explicit `deletedAt: null` would be redundant filtering (KISS). Documented rather than changed.

### Re-verification (actual)

- `pnpm --filter @kitchenpal/api-contract build` → success (dual package rebuilt).
- `pnpm --filter @kitchenpal/backend build | lint | typecheck` → all pass (lint clean, no `any`).
- `pnpm --filter @kitchenpal/backend test` → **25 suites, 163 tests passed** (160 prior + H1 eviction + L2 invite-reuse + L1 env-guard).
- Root `pnpm build && pnpm lint && pnpm typecheck && pnpm test` → **all turbo tasks pass** (backend + mobile + api-contract; mobile untouched).

Status: DONE
Summary: Households, membership-verified scope resolution, JWT/CORS/membership-secured Socket.IO chat, notifications (in-app+push+email), and the Phase-6 chat-card wiring are implemented; the security review's H1 socket-eviction leak and L1/L2 items are fixed (L3 verified already-safe). Green workspace-wide (163 backend tests incl. the removed-member eviction two-client test).
Concerns/Blockers: The broader feature-scope stretch (pantry/shopping/spending in household scope) remains intentionally deferred — the expense→chat-card path is complete and tested via the seam but won't fire from the live expense HTTP route until that activation lands. Not a blocker for this phase's deliverables.
