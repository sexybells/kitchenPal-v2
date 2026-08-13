# KitchenPal backend — production image.
#
# Multi-stage, pnpm/Turborepo-aware build. `turbo prune` computes the minimal
# subset of the monorepo the backend actually depends on (currently just
# @kitchenpal/api-contract; @kitchenpal/config is a dev-only tool dependency
# and is pruned out of the production install), so the final image installs
# only what @kitchenpal/backend needs at runtime — not every app/package in
# the workspace.
#
# Build context MUST be the repo root (not apps/backend): the build needs
# pnpm-workspace.yaml, pnpm-lock.yaml, and the internal packages this app
# depends on.
#
#   docker build -f apps/backend/Dockerfile -t kitchenpal-backend .
#   docker run --rm -p 3001:3001 --env-file apps/backend/.env kitchenpal-backend

# Node 22, not 20: undici@8 (used to pin the recipe-import fetch to a validated
# IP) calls `markAsUncloneable`, which only exists from Node 22.10 — on node:20
# the image builds fine and then dies at startup inside recipe-http-client.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# ---- Prune: compute the minimal workspace subset needed to BUILD the backend
# (includes devDependencies — tsc/@nestjs/cli — needed to compile it).
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@^2.3.3 prune @kitchenpal/backend --docker

# ---- Install the build-time workspace and compile ----
FROM base AS builder
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm exec turbo run build --filter=@kitchenpal/backend

# ---- Prune again, production-only, for a lean runtime install ----
FROM base AS prod-pruner
COPY . .
RUN pnpm dlx turbo@^2.3.3 prune @kitchenpal/backend --docker --production

# ---- Runtime: production dependencies only + the compiled dist output ----
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 kitchenpal
COPY --from=prod-pruner /app/out/json/ .
# --ignore-scripts: the pruned root package.json still carries the workspace
# `prepare` (husky) script, which is dev-only tooling not present in this
# production-only install; skipping lifecycle scripts avoids that failure and
# no production dependency here requires a postinstall/build step.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts
COPY --from=builder --chown=kitchenpal:nodejs /app/apps/backend/dist ./apps/backend/dist
# The production install only links the workspace packages' package.json files
# (`turbo prune --docker` puts sources in out/full, manifests in out/json), so
# the internal packages' compiled output has to come from the builder stage.
# Without this the app starts and immediately dies on
# `Cannot find module '@kitchenpal/api-contract/dist/index.cjs'`.
COPY --from=builder --chown=kitchenpal:nodejs /app/packages/api-contract/dist ./packages/api-contract/dist

USER kitchenpal
WORKDIR /app/apps/backend
EXPOSE 3001
CMD ["node", "dist/main.js"]
