# bun + hono + postgres template

A small, opinionated starting point: [Bun](https://bun.com) runtime,
[Hono](https://hono.dev) HTTP, [PostgreSQL](https://www.postgresql.org) via
[Drizzle ORM](https://orm.drizzle.team) on Bun's native `bun:sql` driver, and
[Zod 4](https://zod.dev) validation.

No `pg` or `postgres` package — Bun's built-in Postgres client does the work.

## Starting a new app from this template

Use Bun's own scaffolding CLI — one command, no extra tooling:

```bash
bun create <owner>/<this-repo> orders-api
cd orders-api
```

`bun create` downloads the repo, installs dependencies, initialises a fresh git
repo, and then this template's `bun-create` postinstall hook runs
`scripts/init.ts`, which renames every template identifier — package name,
OpenAPI title, and database — to match your destination directory.

The renames land as **uncommitted changes** on top of `bun create`'s initial
commit, so `git diff` shows you exactly what the bootstrap touched before you
keep it.

<details>
<summary>Other ways to get a copy</summary>

```bash
bunx degit <owner>/<this-repo> orders-api   # no history, no hook
git clone --depth 1 … && rm -rf .git        # manual
```

These skip the postinstall hook, so run the bootstrap yourself:

```bash
git init && git add -A && git commit -m init
bun run init orders-api
```
</details>

### Starting from an empty schema

`bun create` keeps the users example as a working reference. To strip it:

```bash
bun run init orders-api --bare
```

That removes the users routes, service, tests and migrations, leaving an empty
schema and a starter integration test. Run `bun run db:generate` afterwards for
your first migration.

`bun run init` refuses to run on a dirty tree, so `git diff` always shows exactly
what it changed.

**It also rejects a database name that would trip [LAND-01](./RULES.md)** — naming
your database after a directory that exists at `/` (`srv`, `tmp`, `app`, …) makes
`bun:sql` read the connection URL's path as a Unix-socket directory and fail with
a bare `FailedToOpenSocket`. The default derived name (`my_api_db`) is always safe.

Then:

```bash
cp .env.example .env
bun install
./scripts/fetch-docs.sh        # local copies of the upstream docs
bun run db:generate            # --bare only: first migration from your schema
docker compose up --build      # postgres -> migrate -> app
bun run check                  # lint, rule checks, typecheck, tests
```

Read [RULES.md](./RULES.md) before your first real change — `bun run check:rules`
enforces the mechanical parts, and the rest is what code review is for.

## Quick start

```bash
cp .env.example .env
bun install

docker compose up -d postgres   # local database
bun run db:migrate              # apply migrations
bun run dev                     # http://localhost:3000
```

Or run the whole stack in containers:

```bash
docker compose up --build
```

That builds the app image, waits for Postgres to pass its health check, runs
migrations to completion in a one-shot `migrate` service, and only then starts
the app.

## Endpoints

| Method | Path | |
| --- | --- | --- |
| `GET` | `/docs` | interactive API reference |
| `GET` | `/openapi.json` | OpenAPI 3.0 spec, generated from the route schemas |
| `GET` | `/health` | process liveness, no database touched |
| `GET` | `/health/db` | 200 if the database is reachable, else 503 |
| `GET` | `/api/users` | `?limit=1..100&offset=0` |
| `POST` | `/api/users` | `{ email, name }` |
| `GET` | `/api/users/:id` | |
| `PATCH` | `/api/users/:id` | `{ email?, name? }` |
| `DELETE` | `/api/users/:id` | 204 |

Every error shares one envelope:

```json
{
  "error": {
    "code": "bad_request",
    "message": "Invalid request json",
    "details": [{ "path": "email", "message": "Invalid email address" }],
    "requestId": "95ba86c2-9c71-40e1-a6b7-1422b858d598"
  }
}
```

## Logging

Structured JSON to stdout via pino, one object per line, with a per-request child logger
bound to the request id:

```json
{"level":"warn","time":"2026-07-27T08:49:16.471Z","pid":1,"hostname":"...",
 "requestId":"3f92ce1b-…","req":{"method":"GET","path":"/nope"},
 "res":{"status":404},"durationMs":0.289,"msg":"GET /nope 404"}
```

`bun run dev` pipes through the `pino-pretty` CLI for readable local output;
`bun run dev:raw` gives the raw JSON. Deliberately **no pino transport** — that would run
a worker thread for no benefit when the destination is stdout. Set verbosity with
`LOG_LEVEL`; successful health checks are logged at `debug` so probes don't drown traffic.

Use `c.get('logger')` inside a request and `logger` from `src/lib/logger.ts` elsewhere.
Don't `console.log`.

## Scripts

```bash
bun run dev         bun run start      bun run typecheck
bun run db:generate bun run db:migrate bun run db:push  bun run db:studio

bun run test              # unit, then integration
bun run test:unit         # src/ — service layer mocked, no database needed
bun run test:integration  # tests/ — real Postgres; skips itself if none is up
```

The two suites run as **separate processes on purpose**: `mock.module` in the route
tests replaces the service layer for the whole process, so running them together would
silently feed the integration tests the mock instead of real SQL.

## Layout

```
src/
  index.ts        Bun.serve + graceful shutdown
  app.ts          Hono instance, middleware, onError/notFound
  env.ts          Zod-validated env, fails fast at boot
  routes/         HTTP layer (validate, delegate, serialize)
  services/       business logic, no Hono types
  db/             drizzle client, schema, migrator
  lib/            AppError, validate() wrapper
tests/
  integration/    service layer against real Postgres
  helpers/        test database setup + truncation
drizzle/          generated migrations (commit these)
```

Dependencies point one way — `routes → services → db`. Services never import
`hono`, which is why the route tests can mock the service layer and run with no
database at all.

## API documentation

Routes are declared with `createRoute()` from `@hono/zod-openapi`, so the same Zod
schema validates the request **and** describes it in the spec — the docs cannot drift
from the implementation. Browse them at `/docs`, or point a code generator at
`/openapi.json`.

Adding a route means adding a `createRoute({...})` block with its response codes, then
`.openapi(route, handler)`. `src/routes/openapi.test.ts` asserts the document stays
well-formed.

## Adding a table

1. Add it to `src/db/schema.ts`
2. `bun run db:generate` — writes SQL into `drizzle/`
3. Review the SQL, commit it
4. `bun run db:migrate`

Avoid `db:push` on anything you care about; it skips the migration history.

## Conventions

[RULES.md](./RULES.md) is the canonical rule set for this stack — numbered so review
comments can cite an id, and marked by whether a tool enforces each rule or only a human
will catch it. It ends with a review checklist.

[CLAUDE.md](./CLAUDE.md) is the operational subset for AI agents, plus the `llms.txt`
endpoints for every dependency here.
