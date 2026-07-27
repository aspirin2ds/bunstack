# CLAUDE.md

Bun + Hono + PostgreSQL (Drizzle ORM) application template.

## Documentation for AI agents

Every dependency in this stack publishes machine-readable docs. **Read these before
guessing at an API** — all four move fast and model training data lags behind them.

### Check the local cache first

These docs are already on disk in **`.online-docs/`** (git-ignored, ~6 MB). **Grep there
before reaching for `WebFetch`** — it is faster, offline, and avoids re-downloading the
same file every session.

```bash
./scripts/fetch-docs.sh           # populate/refresh (only fetches what's missing)
grep -n "idleTimeout" .online-docs/bun/runtime-sql.md
```

Grep rather than reading whole bundles: `drizzle/llms-full.txt` is ~3.5 MB.
`.online-docs/README.md` maps every cached file to its source URL. Fetch from the network
only for something not in the manifest — and if it's plain text, add it to
`scripts/fetch-docs.sh` so the next session gets it for free.

### Bun — `llms.txt` + per-page markdown

| Resource | URL |
| --- | --- |
| Index of all docs | https://bun.com/llms.txt |
| Everything in one file (~2 MB) | https://bun.com/llms-full.txt |

Bun's docs live on **`bun.com`** (not `bun.sh`) and **every page has a `.md` twin** —
append `.md` to any docs URL to get raw markdown. Paths were reorganized recently;
resolve them from `llms.txt` rather than from memory (e.g. `docs/api/sql` is now
`docs/runtime/sql`).

- SQL / Postgres client — https://bun.com/docs/runtime/sql.md
- Environment variables — https://bun.com/docs/runtime/environment-variables.md
- `bun test` — https://bun.com/docs/test/index.md
- Test mocks — https://bun.com/docs/test/mocks.md
- Docker — https://bun.com/docs/guides/ecosystem/docker.md
- `bunfig.toml` — https://bun.com/docs/runtime/bunfig.md
- Workspaces — https://bun.com/docs/pm/workspaces.md

### Hono — `llms.txt`

| Resource | URL |
| --- | --- |
| Index | https://hono.dev/llms.txt |
| Full docs, no examples | https://hono.dev/llms-full.txt |
| Core only (smallest) | https://hono.dev/llms-small.txt |

Hono pages do **not** support a `.md` suffix — use the `llms*.txt` files or the HTML pages.

- Bun adapter — https://hono.dev/docs/getting-started/bun
- Validation — https://hono.dev/docs/guides/validation
- Testing helper — https://hono.dev/docs/helpers/testing
- Best practices (RPC-safe routing) — https://hono.dev/docs/guides/best-practices
- Middleware — https://hono.dev/docs/guides/middleware

### Drizzle ORM — `llms.txt`

| Resource | URL |
| --- | --- |
| Index | https://orm.drizzle.team/llms.txt |
| Full docs (~340k tokens — fetch selectively) | https://orm.drizzle.team/llms-full.txt |

- Drizzle + `bun:sql` — https://orm.drizzle.team/docs/get-started/bun-sql-new
- Postgres column types — https://orm.drizzle.team/docs/column-types/pg
- Drizzle Kit migrations — https://orm.drizzle.team/docs/kit-overview

### Zod — `llms.txt`

- https://zod.dev/llms.txt — note this project uses **Zod 4**, whose API differs from Zod 3.

### PostgreSQL

PostgreSQL publishes **no `llms.txt`** (`postgresql.org/llms.txt` returns 404). Use the
official manual, which is stable and well-structured:

- Current manual — https://www.postgresql.org/docs/current/
- SQL command reference — https://www.postgresql.org/docs/current/sql-commands.html
- Data types — https://www.postgresql.org/docs/current/datatype.html

### Fetching these

`WebFetch` works on all of the above. Prefer the narrow page over `llms-full.txt` when you
know what you need — Drizzle's full file alone is ~340k tokens.

## Stack

| Piece | Choice | Why |
| --- | --- | --- |
| Runtime | Bun 1.3 | Native TS, built-in test runner, native Postgres driver |
| HTTP | Hono 4 | Web-standard `Request`/`Response`, tiny, first-class Bun support |
| Database | PostgreSQL 18 | — |
| ORM | Drizzle over `drizzle-orm/bun-sql` | Typed schema, SQL-shaped queries, no extra pg client |
| Validation | Zod 4 + `@hono/zod-validator` | One schema drives both runtime validation and types |

The `bun-sql` driver uses Bun's **built-in** Postgres client, so there is deliberately no
`pg` or `postgres` dependency. Do not add one.

## Commands

```bash
bun install
bun run dev           # watch mode, port 3000
bun run start         # production
bun run typecheck     # tsc --noEmit

bun run test              # unit, then integration
bun run test:unit         # src/ — service layer mocked, no database needed
bun run test:integration  # tests/ — real Postgres; skips itself if none is up

bun run db:generate   # schema.ts -> SQL migration in drizzle/
bun run db:migrate    # apply pending migrations
bun run db:studio     # Drizzle Studio

docker compose up -d postgres   # just the database, for local dev
docker compose up --build       # full stack: app + database
```

## Layout

```
src/
  index.ts        entry point — reads env, calls Bun.serve
  app.ts          Hono instance: middleware, routes, error handler
  env.ts          Zod-validated environment, fails fast at boot
  routes/         HTTP layer — parse, validate, delegate, serialize
  services/       business logic — no Hono types cross this boundary
  db/
    index.ts      drizzle client singleton
    schema.ts     table definitions (source of truth for migrations)
    migrate.ts    programmatic migrator, run on container start
  lib/errors.ts   AppError + typed error responses
tests/
  integration/    service layer against real Postgres
  helpers/        test database creation, migration, truncation
drizzle/          generated migrations — commit these, never hand-edit
```

## Testing

Two suites, run as **separate processes on purpose**:

- `test:unit` (`src/`) mocks the service layer with `mock.module`, so routes, validation
  and error rendering are tested with no database.
- `test:integration` (`tests/`) drives the real service layer against real Postgres.

`mock.module` replaces a module for the **entire process**, so running both in one
`bun test` invocation silently feeds the integration tests the mock — they pass while
testing nothing. Keep integration tests outside `src/`, and don't collapse the scripts
back into a bare `bun test`.

Integration tests skip themselves when no database is reachable, so CI asserts they were
not skipped — otherwise an unreachable database would look green.

New business logic belongs in a service, with an integration test. Route tests should
not be the only coverage a code path has: the unique-violation bug in
[the landmines section](#2-the-sqlstate-is-on-errno-and-drizzle-wraps-the-error) lived in
a service and was invisible to the mocked route tests.

## Conventions

- **Layering is one-directional**: `routes → services → db`. Services must not import
  from `hono`, and routes must not import from `db/`. This keeps services testable
  without an HTTP context.
- **Chain routes for RPC type inference.** Hono's `hc` client only infers types from
  chained `.get().post()` calls, not from separately-declared handlers. See
  [best practices](https://hono.dev/docs/guides/best-practices).
- **Validate at the edge** with `zValidator`; services take already-typed input.
- **Throw `AppError`**, don't return error responses ad hoc — `app.onError` renders the
  single JSON error shape.
- **Schema changes go through migrations.** Edit `src/db/schema.ts`, then
  `bun run db:generate`. Never `db:push` against a database you care about.
- **Env access goes through `src/env.ts`**, never `process.env` directly, so a missing
  variable fails at boot rather than at first request.

## Upstream best practices this template follows

Checked against the official docs (cached in `.online-docs/`), so don't "improve" these
back:

**Hono** ([best practices](https://hono.dev/docs/guides/best-practices))
- Handlers are written inline after the path, not extracted into RoR-style controllers —
  extracting them loses path-param type inference. If you must split, use
  `factory.createHandlers()` from `hono/factory`.
- Routes are **chained** (`.get().post()...`) so `hc` RPC types infer.
- Larger apps are split into sub-apps mounted with `app.route()`.
- `notFound` returns `c.json(...)`, not `c.notFound()`, which would break RPC inference.
- Never define `app.head()` — Hono derives HEAD from GET, so such a route never runs.
- Recommended middleware are all mounted: `secureHeaders()`, `bodyLimit()`, `timeout()`,
  and `cors()` (only when `CORS_ORIGINS` is set — an API shouldn't advertise
  cross-origin access it doesn't need).

**Bun** ([SQL](https://bun.com/docs/runtime/sql.md), [server](https://bun.com/docs/runtime/http/server.md))
- The pool is configured explicitly (`max`, `idleTimeout`, `connectionTimeout`,
  `maxLifetime`) rather than relying on `max: 10`. Keep `DB_POOL_MAX × replicas` below
  Postgres `max_connections` (default 100).
- Shutdown awaits `server.stop()` then `db.$client.close({ timeout })`, so in-flight
  requests finish and pooled connections are released.
- `Bun.serve`'s `idleTimeout` **defaults to 10s**, shorter than the 30s request timeout;
  `src/index.ts` derives it from `REQUEST_TIMEOUT_MS` so the socket isn't cut out from
  under a slow-but-valid request.

**Drizzle** ([migrations](https://orm.drizzle.team/docs/migrations))
- Codebase-first with **generated, committed** SQL (their "Option 3"), applied at
  deploy time by the one-shot `migrate` service ("Option 4", which they recommend for
  monoliths and zero-downtime deploys). `db:push` stays a local-prototyping tool.
- For hot paths, `.prepare()` + `sql.placeholder()` avoids re-parsing on every call
  ([perf](https://orm.drizzle.team/docs/perf-queries)). Not used yet — add it when a
  query is measurably hot, not preemptively.

### One deliberate deviation

Hono recommends `c.env` over `process.env` for portability across Workers/Deno/Node.
This template is Bun-only and reads `process.env` **once at boot** in `src/env.ts` so
misconfiguration fails immediately instead of on the first request that needs a variable.
If you ever target Cloudflare Workers, that decision has to be revisited.

## Two `bun:sql` landmines

Both were hit and root-caused while building this template, and both are silent —
verify against a live database before assuming either has been fixed.

### 1. A database name that collides with a real directory breaks TCP connections

Bun's SQL client appears to treat the connection URL's path component as a Unix-socket
directory when that path exists on disk. It then fails with a bare
`FailedToOpenSocket failed to connect to postgresql`, even though the TCP port is open
and reachable (`Bun.connect` to the same host:port succeeds).

Reproduced on Bun 1.3.14, Linux arm64:

| Database name | `/<name>` exists | Result |
| --- | --- | --- |
| `app` | no | connects |
| `app` | yes (`WORKDIR /app`) | `FailedToOpenSocket` |
| `foo` | yes (`mkdir /foo`) | `FailedToOpenSocket` |
| `postgres` | no | connects |

This is why the Dockerfile uses **`WORKDIR /usr/src/app`, not `/app`**, and the database
is named **`appdb`, not `app`**. Either change alone fixes it; both are kept so renaming
one later can't silently resurrect it. Do not "tidy" these back.

### 2. The SQLSTATE is on `errno`, and Drizzle wraps the error

A Bun `PostgresError` carries the generic string `ERR_POSTGRES_SERVER_ERROR` on `code`
and the actual SQLSTATE (e.g. `23505`) on **`errno`**. Drizzle then wraps it in a
`DrizzleQueryError`, so the real error sits on **`.cause`**.

Checking `error.code === '23505'` therefore never matches and the failure surfaces as a
500. `isUniqueViolation` in `src/db/index.ts` walks the cause chain and checks `errno`;
`src/db/unique-violation.test.ts` pins the shape. Reuse that helper rather than
hand-rolling SQLSTATE checks.
