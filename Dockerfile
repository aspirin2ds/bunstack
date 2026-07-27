# syntax=docker/dockerfile:1
FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# Dependencies are installed in their own stages so a source-only change does
# not invalidate the install cache.
FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

FROM base AS prod-deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

FROM base AS test
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .
# Unit tests only: no database exists during an image build. Integration tests
# run in CI, where a Postgres service is available.
RUN bun run typecheck && bun run test:unit

FROM base AS release
ENV NODE_ENV=production
COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY drizzle ./drizzle
COPY src ./src

USER bun
EXPOSE 3000/tcp
CMD ["bun", "src/index.ts"]
