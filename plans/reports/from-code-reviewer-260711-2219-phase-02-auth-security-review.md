# Phase 2 Identity & Auth — Security Review

Scope: `apps/backend/src/modules/{auth,users,uploads}/**`, `src/common/scope/*`, `src/config/env.schema.ts`, `packages/api-contract/src/{auth,users}.ts`. Reviewed against builder report + phase spec. No code modified. Findings ranked by real exploitability.

Overall: architecture is sound (opaque hashed refresh tokens, reuse-detection design, prod fail-close for social/email/OTP, bcrypt-12, guard order correct, identity only from verified token). But two of the mandate's top-priority mechanisms are actually broken in practice, plus one confirmed takeover vector the builder self-flagged.

---

## CRITICAL

### C1. Refresh rotation has a TOCTOU race → one token refreshes twice, defeating reuse-detection
`token.service.ts:109-140` + `refresh-token.repository.ts:42-49`.

`rotate()` does read-check-then-write with no atomicity:
1. `findByHash` reads record (rotatedAt=null, revokedAt=null)
2. checks `if (record.revokedAt || record.rotatedAt)` → passes
3. `mintPair` → `issue()` new token, then `markRotated()` (an **unconditional** `updateOne({ tokenHash }, …)` that never checks `modifiedCount`).

Two requests presenting the **same** valid refresh token concurrently both pass step 2, both mint a fresh successor, both mark rotated. Result: one presented token yields **two live successor chains in the same family**, and neither is flagged as reuse. This is trivially triggerable — any holder of a refresh token (legit client double-submitting, or an attacker who stole a token racing the victim) just fires two requests at once. It permanently splits the family into two branches that never trip `revokeFamily`, directly violating the phase's #1 guarantee ("no race letting one token refresh twice; a replayed/rotated-out token revokes the whole family").

Fix: make consumption an atomic compare-and-swap and claim **before** minting. `markRotated` → conditional `updateOne({ tokenHash, rotatedAt: null, revokedAt: null }, { $set: {...} })` (or `findOneAndUpdate`, both already used in `base.repository.ts:82,117`) and check `modifiedCount === 1`. If the claim returns 0, another request already consumed it → treat as reuse: `revokeFamily` + throw. Order: claim token → then mint successor.

---

## HIGH

### H1. Login user-enumeration timing oracle — the "constant-time" dummy hash is inert
`auth.service.ts:105-108`, `password.service.ts:18-20`.

The dummy hash `"$2a$12$0000…0000"` is **malformed** (52 chars after the `$2a$12$` prefix; a valid bcrypt hash is 53). `bcryptjs.compare` rejects the bad format and returns `false` immediately without running the KDF. Measured locally: dummy compare = **0.04 ms**, real bcrypt-12 compare = **~190 ms** — a ~4000× difference. So the branch meant to equalize timing does the opposite: a non-existent email (or a passwordless social/phone account, which also hits the dummy branch via `!user.passwordHash`) returns in microseconds; a real password account takes ~190 ms. This is a clean enumeration oracle and defeats the stated priority-#4 protection.

Fix: use a **precomputed valid** bcrypt hash constant (e.g. `bcrypt.hashSync("unused", 12)` captured once as a module constant), so the compare always executes the full KDF. Verify empirically that the missing-user and wrong-password paths land within noise of each other.

### H2. Social account linking ignores `emailVerified` → account takeover (builder-flagged)
`auth.service.ts:314-332`. Comment says "Link to an existing account by verified email" but the code links whenever `identity.email` matches an existing account — `identity.emailVerified` is never checked. A social identity whose provider returns an email the caller does not own with `email_verified=false` gets merged into the victim's existing password account (`authProviders` appended), granting full sign-in as the victim. `SocialIdentity.emailVerified` is already computed for both Google (`:82`) and Apple (`:103`) but only consumed when *creating* a new user (`:339`), not when *linking*.

Fix: link an existing account only when `identity.emailVerified === true`. If email present but unverified and an account exists, do not auto-link — require an explicit, authenticated linking flow (or reject). Keep the create-path behavior (unverified → `emailVerifiedAt: null`).

---

## MEDIUM

### M1. Avatar upload buffers unbounded input into memory before the size check
`uploads.controller.ts:25` uses `FileInterceptor("file")` with **no** multer `limits`. Multer buffers the entire request body into memory first; the 5 MB check in `uploads.service.ts:61` runs only *after* the full buffer exists. An authenticated user can POST a multi-GB body and exhaust process memory (DoS). Fix: pass `FileInterceptor("file", { limits: { fileSize: MAX_AVATAR_BYTES, files: 1 } })` so multer aborts at the boundary; keep the service-level check as defense-in-depth.

### M2. No login/forgot-password-specific rate limiting
Only the global throttler applies (`THROTTLE_LIMIT` default 100 / 60 s per IP, `env.schema.ts:25`). 100 login attempts/min/IP is weak against credential stuffing, and forgot-password has no dedicated cap. Consider a tighter per-route `@Throttle` on `login`, `forgot-password`, and the OTP verify routes. (OTP request/verify fail-close in prod, so lower urgency there.)

---

## LOW

### L1. Avatar content type is trusted from client, no magic-byte check
`uploads.service.ts:54` maps `file.mimetype` (multipart Content-Type, attacker-controlled) to an extension; content bytes are never validated. A non-image payload can be stored under a `.png`/`.webp` key. Served via static assets the XSS risk is low (extension-driven Content-Type), but validate magic bytes before the S3 cutover, especially if any path ever serves user uploads inline.

### L2. Access-token verification does not pin algorithms
`token.service.ts:93` `jwt.verify` with no `algorithms` option. Not currently exploitable (symmetric secret only, so no RS/HS confusion; `alg:none` is rejected when a secret is supplied). Pin `{ algorithms: ["HS256"] }` as hardening/regression-proofing.

### L3. Single-use token consumption is non-atomic (reset / verify-email)
`auth.service.ts:148-171` and `176-200`: `findByHash` → check `consumedAt` → later `consume()` (unconditional `updateOne`). Two concurrent requests with the same token both pass the check. Impact is low (idempotent outcome — same password/verification), but tighten to a conditional consume returning `modifiedCount` for correctness.

### L4. verify-email does not reconcile the pinned email with the user's current email
`auth.service.ts:176-200`. The token pins `email` (schema) but `verifyEmail` sets `emailVerifiedAt` without confirming the pinned email still equals `user.email`. If email changed after issuance, an old-address token verifies the new address. Edge case; low.

### L5. OTP: attempt cap and active-code selection are racy / multi-code
`otp.service.ts:74-87` reads `attempts` then increments non-atomically, and `findActive` (`otp-token.repository.ts:32`) returns only the newest unconsumed code while old ones stay active — requesting N codes yields N attempt buckets. Prod fail-closes OTP entirely (`otp.service.ts:37`), so this is dev-only today; fix before wiring a real SMS transport (atomic `$inc`-and-check, invalidate prior codes on new request).

---

## Verified GOOD (priority items that hold up)
- Refresh tokens stored only as SHA-256 (`secret-token.ts`, schema `:27-29`); raw never persisted or logged. Family revoke on sequential reuse works (`token.service.ts:118-125`); logout + password-reset revoke correctly (`:143-153`, `auth.service.ts:173`); 90 d expiry enforced (`:127`).
- Guard order correct: `JwtAuthGuard` global before `ScopeGuard` (`app.module.ts:43-44`); throttler registered ahead of auth. `request.user` populated only from verified claims (`jwt-auth.guard.ts:44-49`); body identity never trusted. Protected routes (`me`, users/*, uploads) carry no `@Public`; admin route double-gated (`users.controller.ts:100-102`).
- Prod fail-close verified for social dev path (`social-auth.service.ts:113`), email log adapter, and OTP request (`otp.service.ts:37`). JWT_ACCESS_SECRET required in prod (`env.schema.ts:81`).
- Admin bootstrap requires `ADMIN_BOOTSTRAP_SECRET` AND email in `ADMIN_EMAILS` allowlist (`auth.service.ts:263-267`); cannot self-elevate arbitrary accounts.
- forgot-password always returns success envelope (`auth.service.ts:129-132`) — no enumeration *there* (but see H1 for login).
- No secrets logged in prod paths; reuse-detection log carries only userId.

## Unresolved questions
1. SMS transport for OTP (deferred per constraints) — L5 fixes should land with it.
2. Confirm the H2 linking policy is "verified-email-only auto-link" vs an explicit linking flow — product decision, but current code is a takeover vector either way.

```
Status: DONE_WITH_CONCERNS
Summary: 1 Critical (refresh rotation TOCTOU lets one token refresh twice), 2 High (login timing enumeration oracle from an inert dummy hash; social linking ignores emailVerified → takeover), 2 Medium, 5 Low. Core design is sound but two top-priority mechanisms are effectively broken.
Concerns/Blockers: C1, H1, H2 should be fixed before this ships as production auth — each defeats a stated Phase-2 security guarantee and all three are trivially triggerable.
```
