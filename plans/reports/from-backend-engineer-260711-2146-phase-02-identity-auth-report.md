# Phase 2 — Identity & Auth — Backend Engineer Report

Scope delivered: full Phase 2 auth/identity on the Phase 1 platform. Placeholder auth replaced by a real global JWT guard. All acceptance gates green.

## Entities (schemas)
- `User` (global collection, `baseSchemaPlugin`): email/phone/passwordHash nullable, roles[`user|admin`], locale code, email/phoneVerifiedAt, activeHouseholdId, authProviders[]. Partial-unique indexes on email & phone (null-tolerant).
- `RefreshToken` (global): userId, familyId, tokenHash(SHA-256, unique), expiresAt, rotatedAt, replacedByHash, revokedAt.
- `PasswordResetToken`, `EmailVerificationToken` (global): userId, tokenHash, expiresAt, consumedAt (email token also pins `email`).
- `OtpToken` (global): channel, destination, codeHash, expiresAt, attempts, consumedAt.
- `UserSettings`, `TipsState` (personal-scoped via `scopedSchemaPlugin`, owned by `createdBy`, one per user, lazy-created). Settings holds locale/measurement/theme/notifications/biometricLockEnabled/pushTokens[].

Repos: `BaseRepository` for user/token collections; `ScopedRepository` for settings/tips.

## Endpoints
Auth (public): `register, login, refresh, logout, forgot-password, reset-password, verify-email, google, apple, request-phone-otp, verify-phone-otp, login-phone-otp, bootstrap-admin`. Protected: `GET auth/me`.
Users (JWT + `@Scope('personal')`): `GET/PATCH users/settings`, `PATCH users/settings/biometric`, `POST users/push-token`, `GET/PATCH users/tips`, `GET users/admin/overview` (`@Roles('admin')`). Uploads: `POST uploads/avatar`.

## Key security decisions
- **Access = JWT 15m; refresh = opaque 90d, stored only as SHA-256 hash.** Chose opaque refresh (not JWT) so rotation/reuse-detection is authoritative in the DB and a DB leak isn't replayable. `JWT_REFRESH_SECRET` is reserved/unused as a result (documented in env).
- **Rotation + reuse detection (`TokenService`):** every sign-in starts a `familyId`; refresh consumes the presented token (`rotatedAt`) and issues a successor (`replacedByHash`). Presenting a rotated-out or revoked token → whole family revoked (`revokeFamily`), logging out attacker + victim. Logout and password-reset revoke families (reset revokes ALL user families). Roles/household re-read from DB on each refresh.
- **Guard order:** `JwtAuthGuard` registered as global guard BEFORE the global `ScopeGuard` so `request.user` (from the verified token only) exists when scope is resolved. Everything authenticated by default; `@Public()` opts out (health + all sign-in routes). `RolesGuard` is a per-route method guard (runs after global auth).
- **Password hashing:** `bcryptjs`, cost 12; login verifies against a dummy hash when the user is missing to keep timing uniform (no account enumeration). forgot-password always 200.
- **Social dev fallback guards:** real verification via `google-auth-library`/`apple-signin-auth` when `GOOGLE_CLIENT_IDS`/`APPLE_CLIENT_IDS` set; otherwise a JSON dev token is accepted but **fail-closed in production** (rejected when `NODE_ENV=production`), every dev use logged.
- **Email dev fallback:** `EmailAdapter` interface; `ResendEmailAdapter` (via fetch to Resend API) when `RESEND_API_KEY` set, else `LogEmailAdapter` which logs the token AND throws in production (dev path impossible in prod). Dev token surfaced in the response only when not really delivered.
- **Phone OTP:** codes hashed, 5-min TTL, 5-attempt cap. No SMS transport wired yet → dev path returns the code; production fail-closes (request rejected). SMS provider deferred.
- **Admin bootstrap:** `POST auth/bootstrap-admin` elevates an account only if email ∈ `ADMIN_EMAILS` AND secret == `ADMIN_BOOTSTRAP_SECRET`; a fresh login then mints an admin-claim token.
- **Env:** production now requires `JWT_ACCESS_SECRET` (dev uses a logged insecure fallback). Added `ADMIN_*`, `GOOGLE/APPLE_CLIENT_IDS`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_WEB_URL`, `UPLOAD_*` to schema + `.env.example`.
- **Locale drift fix:** `registerSchema.locale` made optional; server resolves the code from `Accept-Language` when omitted (`resolveLocale`), stored on User and synced to UserSettings on change.
- **Uploads:** `StorageAdapter` interface + `LocalStorageAdapter` (S3-ready); avatar type/size validated; local dir served via `useStaticAssets`.

## New api-contract DTOs
`auth.ts`: roleSchema, phoneSchema, forgot/reset/verify-email, logout, requestPhoneOtp/verifyPhoneOtp/loginPhoneOtp, socialSignIn, adminBootstrap, userResponse, authResult. Register locale now optional. `users.ts` (new): measurementSystem/theme/notification schemas, userSettingsResponse, updateSettings, biometricSetting, pushToken, tipsStateResponse, updateTips, avatarUploadResponse. Exported from index; dual-format rebuilt.

## Verification (actual)
- `pnpm --filter @kitchenpal/api-contract build` → success (ESM+CJS+DTS). `test` → 5 passed.
- Backend `build` (nest) ✓, `lint` (eslint, no warnings) ✓, `typecheck` (tsc) ✓, `test` → **10 suites, 57 tests passed** (incl. e2e: register→login→me→refresh-rotates→logout; refresh reuse revokes family; role guard 403 non-admin / 200 admin after bootstrap; locale code persisted (explicit + Accept-Language + fallback); forgot/reset dev-path + session invalidation; verify-email dev-path; social dev-path + malformed reject; phone OTP request→verify→login + wrong-code reject; settings/tips defaults + updates + locale sync. Units: token rotation/family-revoke, password hashing, settings/tips defaults, social prod fail-closed).
- Root workspace: `pnpm build` (3 tasks), `pnpm lint` (4), `pnpm typecheck` (4), `pnpm test` (4) — all successful.
- App boots on ephemeral Mongo (e2e). OpenAPI `/docs` document lists all routes — verified via a throwaway swagger doc check (then removed): `/auth/register /auth/login /auth/me /users/settings ...` present.
- Phase 1 preserved: original suites still pass (added one env test for the new prod JWT requirement → 26 platform-side tests).

## Deviations / notes
- A linter/companion process rewrote several files into canonical form during authoring (notably a stronger `auth.service.ts` with contract input types + constant-time login) and created 3 orphan duplicate helpers (`services/locale.ts`, `services/token-hash.ts`, `adapters/social-identity.ts`) which I deleted (unused). Final code is coherent and passes all gates.
- `verify-phone-otp` = confirm number ownership (consumes a fresh code, marks an existing account verified); `login-phone-otp` = passwordless login/provisioning. Each code is single-use, so the e2e requests a fresh code per step.
- Social prod fail-closed asserted via `SocialAuthService` unit (booting a real production app is impractical — prod env validation also requires Redis/non-local Mongo/JWT secret).
- Refresh tokens intentionally opaque (see above); `JWT_REFRESH_SECRET` kept in schema but unused.
- No root/config or other-app files changed except `apps/backend/**`, `packages/api-contract/**`, and `apps/backend/.env.example` (env keys) as permitted. No git commit performed.

## Unresolved questions
1. SMS provider for phone OTP (Twilio/Vonage/other)? Currently dev-only; prod fail-closes. Needed before phone auth ships.
2. Social account linking: I link a social identity to an existing account by matching email regardless of the provider's `email_verified` flag. Confirm whether linking should require a provider-verified email to avoid account-takeover via unverified-email providers.
3. Avatar static serving is local-disk `useStaticAssets`; confirm the production S3 adapter + public URL strategy (Phase 8 storage cutover).

## Security fixes applied (post-review)
Addressed all findings from the security review (`from-code-reviewer-260711-2219-phase-02-auth-security-review.md`). Core design was verified sound; these fix the mechanisms that were broken in practice.

- **C1 (CRITICAL) — refresh rotation TOCTOU race:** replaced the read→check→mint→mark sequence with an atomic CLAIM before minting. `RefreshTokenRepository.markRotated` → `claim(tokenHash, replacedByHash)`: `findOneAndUpdate({tokenHash, rotatedAt:null, revokedAt:null}, {$set:{rotatedAt, replacedByHash}})` returning whether it won. `TokenService.rotate` pre-generates the successor, claims the presented token, and only mints on a win; a lost claim (concurrent double-submit or replay of a consumed/revoked token) → `revokeFamily` + reject. Guarantees exactly one successor per token; the family can never split. Test added (`token.service.spec.ts`): two concurrent rotations of one token → exactly one fulfilled, one rejected, ≤1 live token remains.
- **H1 (HIGH) — login timing enumeration:** the malformed 52-char dummy hash made `bcrypt.compare` short-circuit. Now `PasswordService.timingEqualizerHash` is a precomputed VALID bcrypt-12 hash (`hashSync` at module load); login compares against it on the missing-user / passwordless path so the KDF always runs. Test added: equalizer is a valid `$2?$12$…` 60-char hash and verifying against it executes to `false`.
- **H2 (HIGH) — social linking ignored emailVerified:** `resolveSocialUser` now auto-links to an existing account ONLY when `identity.emailVerified === true`; an unverified provider email that matches an existing account is rejected (409, "sign in and link from settings") instead of merged. Dev social tokens now carry an explicit `emailVerified` (defaults false) so this is realistic/testable. Tests added (e2e): unverified provider email does NOT take over an existing account and the victim still logs in; verified email links to the same account.
- **M1 (MED) — avatar memory DoS:** `FileInterceptor("file", { limits: { fileSize: MAX_AVATAR_BYTES, files: 1 } })` aborts oversize uploads at the multer boundary (no full-body buffering); the service size check remains as defense-in-depth.
- **M2 (MED) — auth rate limiting:** per-route `@Throttle` on `login` & OTP verify/login (10/min) and `forgot-password` & `request-phone-otp` (5/min), far below the general 100/min. Test added (isolated `auth-throttle.e2e-spec.ts`): repeated logins trip 429 before the general limit.
- **L1 — avatar magic-byte check:** stored extension/content-type now derived from verified magic bytes (JPEG/PNG/WebP), not the client content type; non-image payloads rejected (400). Test added (e2e): valid PNG stored; disguised non-image rejected.
- **L2 — JWT alg pinned:** sign+verify pinned to `HS256` (`algorithms: ["HS256"]`) to reject algorithm-confusion / `alg:none`.
- **L3 — single-use token races:** reset & email-verification `consume` are now atomic CAS (`findOneAndUpdate({…, consumedAt:null})` returning a bool); services consume-then-act so a token is single-use under concurrency.
- **L4 — verify-email email reconcile:** `verifyEmail` rejects a token whose pinned email no longer equals the account's current email.
- **L5 — OTP attempt-cap race:** DEFERRED (dev-only; prod fail-closes OTP). To be fixed atomically alongside the real SMS transport.

Verification (actual): backend `build` ✓, `lint` ✓ (no `any`), `typecheck` ✓, `test` → **11 suites, 64 tests passed** (was 57; +7: C1 concurrent, H1 equalizer, H2 no-link + link, M2 throttle, avatar valid + reject). Root `pnpm build` (3) / `lint` (4) / `typecheck` (4) / `test` (4) all successful — backend 64, api-contract 5, design-tokens 4. Existing tests preserved.

Note: an oversize upload is bounded at the multer boundary (memory safe); mapping the multer `LIMIT_FILE_SIZE` error to a clean 413 is a minor cosmetic follow-up (currently surfaces as a generic error, not 200).

Status: DONE
Summary: Full Phase 2 identity/auth plus all security-review fixes (C1 atomic refresh-claim/reuse-detection, H1 valid timing-equalizer hash, H2 verified-only social linking, M1 multer limit, M2 per-route throttling, L1–L4). Workspace-wide build/lint/typecheck/test green (64 backend + 5 contract + 4 design-tokens); Phase 1 preserved.
Concerns/Blockers: L5 OTP attempt-cap race deferred (dev-only, prod fail-closed) to land with the real SMS transport; H2 policy set to verified-email-only auto-link (unverified → explicit-link flow) — confirm this matches product intent.
