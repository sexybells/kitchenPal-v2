# KitchenPal

Family kitchen manager — clean rebuild. Warm & cozy design, Vietnamese-first.

Monorepo: **pnpm workspaces + Turborepo**. Backend (NestJS 11 + MongoDB),
mobile (Expo), admin (Vite + React + shadcn/ui), sharing design tokens and API
contracts.

## Layout

```
apps/
  backend/   NestJS 11 · Mongo/Mongoose · Socket.IO · Redis · BullMQ   (Phase 1+)
  mobile/    Expo · Expo Router · TanStack Query · Zustand             (Phase 3+)
  admin/     Vite · React · shadcn/ui · TanStack Query                 (Phase 8)
packages/
  design-tokens/   colors/type/spacing → TS + Tailwind preset + RN theme
  api-contract/    shared zod schemas + inferred types (envelope, auth, …)
  config/          shared eslint (BLOCKING), prettier, tsconfig presets
```

## Prerequisites

- Node >= 20 (developed on 25)
- pnpm 10.17.0 (`corepack enable` or install globally)

## Scripts

```bash
pnpm install       # install workspace
pnpm build         # turbo build all packages/apps
pnpm lint          # eslint — BLOCKING
pnpm typecheck     # tsc --noEmit — BLOCKING
pnpm test          # vitest — BLOCKING
pnpm format        # prettier --write
```

## Conventions

- Commits: Conventional Commits (enforced by commitlint on `commit-msg`).
- Lint + typecheck + tests are **blocking** locally (husky pre-commit) and in CI.
- Design tokens are the single source of truth for color/type/spacing — never
  hard-code hex values in apps; import from `@kitchenpal/design-tokens`.
- All API responses use the shared envelope from `@kitchenpal/api-contract`.

## Decisions & plan

See the rebuild plan and handoff:
`~/plans/260711-1918-kitchenpal-rebuild/` (HANDOFF.md, plan.md, phase-\*.md).
