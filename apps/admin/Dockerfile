# KitchenPal admin console — static site image (nginx serving the Vite build).
#
# Vite bakes `VITE_*` env vars into the JS bundle at BUILD time, not runtime —
# unlike the backend, there is no env var to set on the running container that
# changes the API base URL. Pass the deploy-target API URL as a build arg:
#
#   docker build -f apps/admin/Dockerfile \
#     --build-arg VITE_API_URL=https://api.kitchenpal.example \
#     -t kitchenpal-admin .
#   docker run --rm -p 8080:80 kitchenpal-admin
#
# Build context MUST be the repo root (pnpm workspace + internal packages).
# If instead deploying to Vercel/Netlify, skip this Dockerfile entirely: point
# the static host at `apps/admin`, build command
# `cd ../.. && pnpm --filter @kitchenpal/admin build`, output directory `dist`,
# and set VITE_API_URL as that platform's build-time env var — see
# docs/deployment.md.

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@^2.3.3 prune @kitchenpal/admin --docker

FROM base AS builder
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm exec turbo run build --filter=@kitchenpal/admin

FROM nginx:1.27-alpine AS runner
COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/admin/dist /usr/share/nginx/html
EXPOSE 80
