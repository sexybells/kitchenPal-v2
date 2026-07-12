# Phase 07 — Household, Chat & Notifications (Mobile) — Implementation Report

Date: 2026-07-12 · Scope: `apps/mobile/**` only (backend/packages/root untouched)

## Summary

Built the mobile half of Phase 7 on the Phase 3–6 foundation: the Household hub
(card, invite share/copy, members + role management, leave/delete, personal-mode
create/join), realtime Household Chat (in/out bubbles, vote polls with live
tally + cast-vote, expense/budget system cards, read receipts, optimistic send
with server reconcile, image attach), and Notifications (grouped new/earlier,
typed badges, unread, mark-all-read, Expo push registration, deep links). All
gated on the existing envelope+zod client, session/refresh, i18n (vi+en), and
`rnTheme`. Green workspace-wide.

## Screens & components

- Routes: `app/household.tsx` (was a placeholder), `app/notifications.tsx` (was a
  placeholder), `app/chat.tsx` (new; registered in `app/_layout.tsx` Stack). Home
  menu already linked `/household` + `/notifications`.
- Household: `features/household/{roles,hooks,MemberRow,InviteCard,HouseholdSetup}`.
- Chat: `features/chat/{message-model,hooks,labels,MessageBubble,VoteCard,SystemCard,ChatInputBar,PollComposer,TypingIndicator}`.
- Notifications: `features/notifications/{grouping,labels,push,hooks,NotificationRow}`.
- API: `api/{household,chat,notifications,users}.ts`; realtime `api/socket.ts` +
  app singleton `api/chat-socket.ts`. i18n keys added to `i18n/locales/{vi,en}.ts`.

## Socket client design (`api/socket.ts` + `api/chat-socket.ts`)

- `ChatSocket` wraps a socket.io client behind an injectable `factory(url, token)`
  so all logic is unit-testable against a mock (no real connection in tests).
- **Auth**: the handshake sends the current ACCESS token (`auth: { token }`),
  read from the session at (re)connect time. Identity is server-derived; the
  client never sends a userId.
- **Rejoin**: `joinHousehold(id)` records the active room and emits it on every
  `connect` (and socket.io `reconnect`), so a dropped connection transparently
  restores the subscription.
- **Refresh**: on the gateway's `unauthorized`, it runs the REST client's
  single-flight `api.refresh()` (new public method), rebuilds the socket with the
  rotated token, and reconnects. A failed refresh resolves to `null` → socket
  stays closed and the REST client's own sign-out takes over. Never logs tokens.
- **Teardown**: `disconnect()` removes all listeners, disconnects, and clears
  room + subscriber state. Typed `on(event, handler)` returns an unsubscribe fn;
  the chat hook tears every subscription down on unmount.
- Emitters (`sendMessage`/`castVote`) resolve/reject from the gateway ack, so the
  UI can reconcile or mark-failed.

## Chat card types & vote UX

- `MessageBubble` (text/image, in/out, time + status: sending/failed/seen/sent,
  sender name on incoming), `SystemCard` (expense/budget_alert, centered, typed
  badge), `VoteCard` (question + per-option tally bar & count, caller's choice
  highlighted; tapping an option emits `castVote`; live `voteUpdated` re-tally).
- Optimistic send: `message-model.ts` is a pure, tested reducer — an optimistic
  message reconciles against the server echo by (sender+text) match or by id, and
  is idempotent on re-delivery; read receipts merge from `messagesRead`.

## Push registration & deep links

- `registerPushToken()` guards on `Device.isDevice`, permission grant, and an EAS
  project id — no-ops (returns null, no POST) on simulators / unconfigured, else
  POSTs the Expo token to the existing `users/push-token` endpoint. Wired in
  `_layout.tsx` once authenticated.
- Deep links: `notificationRoute()` maps types → `kitchenpal://` routes
  (chat_message→`/chat?householdId`, invites→`/household`, expiry→`/pantry`,
  budget→`/spending`). Root registers `addNotificationResponseReceivedListener`
  to route push taps; in-app rows route on tap and mark read.

## Verification (actual)

- `pnpm --filter @kitchenpal/mobile lint` → clean (no `any`).
- `pnpm --filter @kitchenpal/mobile typecheck` → clean.
- `pnpm --filter @kitchenpal/mobile test` → **26 suites, 78 tests passed** (incl.
  socket wrapper auth/rejoin/joinRejected/teardown/refresh; chat bubbles+vote
  tally, castVote emit, optimistic reconcile; message-model reducer; household
  invite-accept + role-change gating; notifications grouping/unread/mark-read +
  push-token post).
- `pnpm --filter @kitchenpal/mobile build` (expo export web) → **Exported: dist**
  (all routes incl. `/chat`, `/household`, `/notifications`).
- Root `pnpm build && pnpm lint && pnpm typecheck && pnpm test` → **6/6 turbo
  tasks pass**; backend **25 suites / 163 tests**, mobile **26 suites / 78 tests**
  (backend/api-contract untouched, cached).

## Deviations (all within `apps/mobile/**`)

- Added deps: `socket.io-client@4.8.3`, `expo-notifications@~57.0.3`,
  `expo-device@~57.0.0`, `expo-clipboard@~8.0.8`.
- Added a public `ApiClient.refresh()` (reuses the private single-flight rotation)
  so the socket can force a token refresh on `unauthorized`. Existing flows
  unchanged.
- `jest.setup.js`: added hermetic mocks for `socket.io-client`, `expo-notifications`,
  `expo-device` (`__esModule` so the namespace mutation reaches the SUT),
  `expo-constants`, `expo-clipboard`.
- **Shared toggles OMITTED.** The backend deferred feature-scope activation
  (pantry/shopping/spending in household scope) and exposes no shared-data toggle
  contract, so wiring toggles would be fake state. Omitted rather than fabricated;
  add when feature-scope lands.
- **Chat image upload** uses `POST …/messages/image` with the picked asset URI
  as-is; there is no dedicated multipart chat-image upload endpoint (backend Q2),
  so cross-device delivery needs a hosted URL. UI + contract call are wired.

## Unresolved questions

1. Chat image: confirm the intended upload path (dedicated multipart endpoint vs.
   reuse a storage-adapter upload that returns a public URL). Until then the
   attach button sends the local URI.
2. Typing indicator: the gateway defines no `typing` broadcast. The client emits
   and listens for `typing` and renders the indicator only from real events (no
   timers/fakes) — it stays dormant until the gateway rebroadcasts. Confirm if a
   `typing` relay should be added.
3. `chat_mention` deep-links like `chat_message`; no `@mention` compose syntax is
   defined yet (matches backend Q4).
4. Shared toggles + shared pantry/shopping/spending depend on the deferred
   backend feature-scope activation.

Status: DONE
Summary: Household hub, realtime chat (vote polls, cards, read receipts,
optimistic reconcile), and notifications (grouped, push registration, deep links)
are implemented on the existing foundation with a hermetic, mock-driven socket
client; lint/typecheck/test/build and the full workspace are green.
Concerns/Blockers: Shared toggles + shared feature data and a real chat-image
upload/typing relay depend on deferred backend work (documented above); not
blockers for this phase's deliverables.
