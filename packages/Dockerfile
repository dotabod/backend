FROM node:24-slim AS base

# git: pnpm --legacy deploy re-resolves git-hosted deps (steam-resources) via
# `git ls-remote`, which isn't in node:24-slim. ca-certificates is needed for
# HTTPS clones to succeed.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.2.2 --activate

# BUILD_CONTEXT like "packages/twitch-chat" or "packages/twitch-events"
ARG BUILD_CONTEXT
WORKDIR /app

# Workspace manifests + tooling config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.json vite.config.ts ./

# All workspace package.json files (needed so pnpm install hydrates the graph
# even if only one service is being built)
COPY packages/dota/package.json packages/dota/
COPY packages/steam/package.json packages/steam/
COPY packages/twitch-chat/package.json packages/twitch-chat/
COPY packages/twitch-events/package.json packages/twitch-events/
COPY packages/shared-utils/package.json packages/shared-utils/
COPY packages/profanity-filter/package.json packages/profanity-filter/

RUN pnpm install --frozen-lockfile

#------------------------ builder

FROM base AS builder

COPY packages/profanity-filter/index.ts packages/profanity-filter/
COPY packages/profanity-filter/src packages/profanity-filter/src/
COPY packages/shared-utils/src packages/shared-utils/src/
COPY $BUILD_CONTEXT/src $BUILD_CONTEXT/src/
COPY $BUILD_CONTEXT/locales $BUILD_CONTEXT/locales/

# Build internal workspace deps first, then the target service
RUN pnpm --filter @dotabod/profanity-filter --filter @dotabod/shared-utils run build
RUN pnpm --filter ./$BUILD_CONTEXT run build

# pnpm deploy emits a flat, production-ready tree (no symlinks, no devDeps)
# suitable for direct copy into the final stage. --legacy is required because
# this workspace doesn't use injected workspace dependencies.
RUN pnpm --filter ./$BUILD_CONTEXT --prod --legacy deploy /deploy

#------------------------ prod

FROM node:24-slim AS prod

ARG BUILD_CONTEXT
ARG DOTABOD_ENV
ARG COMMIT_HASH

LABEL org.opencontainers.image.source="https://github.com/dotabod/backend" \
    org.opencontainers.image.description="Dotabod container: ${BUILD_CONTEXT}" \
    org.opencontainers.image.licenses="AGPL-3.0"

WORKDIR /app
COPY --from=builder /deploy/ ./

ENV DOTABOD_ENV=$DOTABOD_ENV
ENV COMMIT_HASH=$COMMIT_HASH
CMD ["sh", "-c", "exec node ${CPU_PROF:+--cpu-prof --cpu-prof-dir=/tmp/profiles} dist/index.js"]
