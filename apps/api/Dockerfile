# syntax=docker/dockerfile:1
#
# Built from the *repository root* as context, not from apps/api — the lockfile
# and the workspace catalog live there, and `bun install --frozen-lockfile` needs
# both. See docker-compose.yml for the `context: .` / `dockerfile:` pairing.
#
# RULES.md OPS-01: WORKDIR is /usr/src/app, never /app. A directory at /app makes
# `bun:sql` read the connection URL's path as a Unix socket (LAND-01).
FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# Manifests only, so a source-only change does not invalidate the install cache.
# Every workspace manifest has to be present even though only the API is
# installed: --frozen-lockfile validates the lockfile as a whole, and a missing
# package.json makes it disagree with bun.lock and fail.
FROM base AS manifests
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/api-client/package.json packages/api-client/

FROM manifests AS deps
RUN bun install --frozen-lockfile --filter './apps/api'

FROM manifests AS prod-deps
RUN bun install --frozen-lockfile --production --filter './apps/api'

FROM base AS test
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=deps /usr/src/app/apps/api/node_modules ./apps/api/node_modules
COPY . .
# Unit tests only: no database exists during an image build. Integration tests
# run in CI, where a Postgres service is available (RULES.md OPS-03).
RUN bun run --filter '@repo/api' typecheck && bun run --filter '@repo/api' test:unit

FROM base AS release
ENV NODE_ENV=production

# RULES.md WS-08: node_modules is a tree of symlinks into node_modules/.bun, and
# apps/api/node_modules links *relatively* up to it. Both have to land at the same
# relative paths they were created at, or every import fails at startup with a
# module-not-found error that says nothing about symlinks.
COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY --from=prod-deps /usr/src/app/apps/api/node_modules ./apps/api/node_modules

COPY package.json bun.lock ./
COPY tsconfig.base.json ./
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY apps/api/drizzle ./apps/api/drizzle
COPY apps/api/src ./apps/api/src

USER bun
WORKDIR /usr/src/app/apps/api
EXPOSE 3000/tcp
CMD ["bun", "src/index.ts"]
