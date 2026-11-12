# syntax=docker/dockerfile:1
#
# Built from the *repository root* as context. The web app depends on
# @repo/api-client, which type-imports @repo/api, so the build needs the whole
# workspace present — not just apps/web.
# Pinned to the 1.4 line, matching `engines.bun` and CI's BUN_VERSION: bun.lock is
# lockfileVersion 2, which an older Bun cannot read with --frozen-lockfile.
FROM oven/bun:1.4 AS base
WORKDIR /usr/src/app

FROM base AS manifests
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/api-client/package.json packages/api-client/

FROM manifests AS deps
RUN bun install --frozen-lockfile

FROM manifests AS prod-deps
RUN bun install --frozen-lockfile --production --filter './apps/web'

FROM base AS build
# Load-bearing at *build* time, not just runtime: without it Vite emits the
# development JSX transform, and the release stage — which does set
# NODE_ENV=production — then renders nothing but
# "TypeError: jsxDEV is not a function" from React's production runtime.
ENV NODE_ENV=production

# All four trees, including the API's. That one is not obvious and not optional:
# @repo/api-client type-imports @repo/api/types, which re-exports a type from
# apps/api/src/app.ts, which imports Hono, Zod and Drizzle. `tsc` follows that
# chain into apps/api and resolves those from apps/api/node_modules. Omit it and
# nothing errors — `AppType` quietly degrades to `unknown`, every typed call
# becomes untyped, and the failure surfaces as an unrelated-looking
# "Type may not be serializable" on the server functions.
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=deps /usr/src/app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /usr/src/app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /usr/src/app/packages/api-client/node_modules ./packages/api-client/node_modules
COPY . .

# Typecheck here rather than only in CI: the client bundle is where an accidental
# server-only import would land, and Start's import protection fails the *build*
# (it only warns in dev), so this stage is what actually catches it.
RUN bun run --filter '@repo/web' typecheck && bun run --filter '@repo/web' build

FROM base AS release
ENV NODE_ENV=production

# RULES.md WS-08: these three node_modules trees are symlink webs pointing at each
# other and at the workspace sources by *relative* path, so they must be restored
# at the paths they were created at. `packages/api-client` is copied for the same
# reason — apps/web/node_modules/@repo/api-client is a symlink to that directory,
# and a dangling link is a startup failure waiting for the first import.
COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY --from=prod-deps /usr/src/app/apps/web/node_modules ./apps/web/node_modules
COPY --from=prod-deps /usr/src/app/packages/api-client/node_modules ./packages/api-client/node_modules

COPY package.json bun.lock tsconfig.base.json ./
COPY packages/api-client ./packages/api-client
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json apps/web/tsconfig.json apps/web/server.ts ./apps/web/

# `server.ts` imports env.server.ts and logger.server.ts as source, so src/ ships
# even though `vite build` already inlined its own copy into dist/server.
COPY apps/web/src ./apps/web/src
COPY --from=build /usr/src/app/apps/web/dist ./apps/web/dist

USER bun
WORKDIR /usr/src/app/apps/web
EXPOSE 3001/tcp
CMD ["bun", "server.ts"]
