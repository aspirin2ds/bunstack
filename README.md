# bunstack

A small, opinionated starting point for a two-service app in one repository:

| Workspace | What it is |
| --- | --- |
| **`apps/api`** | [Hono](https://hono.dev) on [Bun](https://bun.com), [PostgreSQL](https://www.postgresql.org) via [Drizzle ORM](https://orm.drizzle.team) on Bun's native `bun:sql`, [Zod 4](https://zod.dev) request validation |
| **`apps/web`** | [TanStack Start](https://tanstack.com/start) SSR with [shadcn/ui](https://ui.shadcn.com) and Tailwind 4 |
| **`packages/api-client`** | A typed client **inferred from the API's own routes** — no schema duplication, no codegen step |

The interesting part is the seam: `apps/web` calls the API over HTTP through
`hc<AppType>`, so renaming a field in a route makes the web app fail to compile.
It holds no database credentials and never imports the API's runtime code.

No `pg` or `postgres` package — Bun's built-in Postgres client does the work. And
no Nitro: the web app builds with plain `vite build` and is served by a small Bun
server, so the whole repo runs on one runtime.

## Starting a new app from this template

Use Bun's own scaffolding CLI — one command, no extra tooling:

```bash
bun create aspirin2ds/bunstack orders-app
cd orders-app
```

`bun create` downloads the repo, installs dependencies, initialises a fresh git
repo, and then this template's `bun-create` postinstall hook runs
`scripts/init.ts`, which renames every template identifier — package name and
database — to match your destination directory.

The renames land as **uncommitted changes** on top of `bun create`'s initial
commit, so `git diff` shows you exactly what the bootstrap touched before you
keep it.

<details>
<summary>Other ways to get a copy</summary>

```bash
bunx degit aspirin2ds/bunstack orders-app   # no history, no hook
git clone --depth 1 … && rm -rf .git                # manual
```

These skip the postinstall hook, so run the bootstrap yourself:

```bash
git init && git add -A && git commit -m init
bun run init orders-app
```
</details>

### Starting from an empty schema

`bun create` keeps the users example as a working reference — an API resource and
the page that consumes it. To strip both:

```bash
bun run init orders-app --bare
```

That removes the users routes, service, tests, migrations **and** the web page
that reads them, leaving an empty schema, a starter integration test and a
placeholder home route. Run `bun run db:generate` afterwards for your first
migration.

`bun run init` refuses to run on a dirty tree, so `git diff` always shows exactly
what it changed.

**It also rejects a database name that would trip [LAND-01](./RULES.md)** — naming
your database after a directory that exists at `/` (`srv`, `tmp`, `app`, …) makes
`bun:sql` read the connection URL's path as a Unix-socket directory and fail with
a bare `FailedToOpenSocket`. The default derived name (`orders_app_db`) is always safe.

Then:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
bun install                    # one install covers every workspace
./scripts/fetch-docs.sh        # local copies of the upstream docs
bun run db:generate            # --bare only: first migration from your schema
docker compose up --build      # postgres -> migrate -> api -> web
bun run check                  # lint, rule checks, typecheck, tests
```

Read [RULES.md](./RULES.md) before your first real change — `bun run check:rules`
enforces the mechanical parts, and the rest is what code review is for.

## Quick start

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
bun install

bun run dev:up                  # database + migrations + api :3000 + web :3001
```

`dev:up` creates either `.env` file from its example when missing, waits for
PostgreSQL to become healthy, applies migrations, and starts both apps. PostgreSQL
stays running after `Ctrl-C`; stop it with `docker compose down`.

Or run the whole stack in containers:

```bash
docker compose up --build
```

That builds both images, waits for Postgres to pass its health check, runs
migrations to completion in a one-shot `migrate` service, starts the API, waits
for it to report healthy, and only then starts the web app.

| | |
| --- | --- |
| http://localhost:3001 | the web app |
| http://localhost:3000/health | API liveness |

Each app owns its own `.env`. There is deliberately no root one — the web app
having no `DATABASE_URL` should be visible at a glance.

## How the two apps are joined

```
apps/web  ──HTTP──▶  apps/api  ──▶  postgres
    │                    ▲
    └── @repo/api-client ─┘  (types only, erased at runtime)
```

`apps/api/src/types.ts` is the only cross-workspace entry point, and it re-exports
nothing but types. `packages/api-client` turns that into `hc<AppType>` plus
`unwrap()`, which either returns the payload out of the `{ data }` envelope or
throws an `ApiError` carrying the API's error `code` and `requestId`.

The web app calls it from loaders and server functions only — `api.server.ts` is
denied in the client bundle by Start's import protection, so `API_URL` (an internal
hostname in compose) can never reach the browser. CI asserts that.

This inference depends on the API chaining its Hono route methods into one
expression. Break the chain and `AppType` degrades to `unknown` — silently, with
no error. That is why it is a rule, not a style preference.

## Endpoints

| Method | Path | |
| --- | --- | --- |
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

Both apps use the same configuration, the web app adding a `service: "web"` binding
so one pipeline can parse both. `bun run dev` pipes through the `pino-pretty` CLI
for readable local output. Deliberately **no pino transport** — that would run a
worker thread for no benefit when the destination is stdout. Set verbosity with
`LOG_LEVEL`; successful health checks are logged at `debug` so probes don't drown
traffic.

Use `c.get('logger')` inside a request and the exported `logger` elsewhere.
Don't `console.log` — Biome fails the build on it.

## Scripts

Everything runs from the repository root and fans out with `bun --filter`; there is
no need to `cd` into a workspace, and no task orchestrator.

```bash
bun run dev:up       # postgres + migrations + api + web
bun run dev          # api + web in parallel      bun run dev:api / dev:web
bun run build        # vite build for the web app
bun run typecheck    # all three workspaces
bun run lint         # bun run lint:fix
bun run check        # lint + rules + typecheck + tests — before committing
bun run update       # refresh upstream docs + compatible dependency updates + check

bun run db:generate  bun run db:migrate     # no db:push / db:studio — see RULES.md BUN-05

bun run test              # unit, then integration
bun run test:unit         # API routes (service mocked) + api-client; no database
bun run test:integration  # API services against real Postgres; skips if none is up
```

The two suites run as **separate processes on purpose**: `mock.module` in the route
tests replaces the service layer for the whole process, so running them together would
silently feed the integration tests the mock instead of real SQL.

## Layout

```
apps/
  api/                  Hono + Postgres. Owns the database.
    src/
      index.ts          Bun.serve + graceful shutdown
      app.ts            Hono instance, middleware, onError/notFound
      env.ts            Zod-validated env, fails fast at boot
      types.ts          the only cross-workspace export — types only
      routes/           HTTP layer (validate, delegate, serialize)
      services/         business logic, no Hono types
      db/               drizzle client, schema, migrator
    tests/              integration tests + database helpers
    drizzle/            generated migrations (commit these)
  web/                  TanStack Start + shadcn/ui. No database access.
    server.ts           production Bun server for the built output
    src/
      routes/           file-based routes
      components/ui/    shadcn/ui components (copied in, yours to edit)
      env.server.ts     server-only env
      lib/api.server.ts the single connection to the API
packages/
  api-client/           hc<AppType> + unwrap()/ApiError
```

Dependencies point one way at every level: `routes → services → db` inside the API,
and `web → api-client → api` across workspaces. Biome and `bun run check:rules`
enforce both.

## Type-safe API contract

Routes chain Hono methods and `zValidator()` middleware in one expression. Zod validates
requests at runtime, while Hono infers request and response types directly for
`hc<AppType>`—there is no generated schema or codegen step.

Adding a route means chaining its method, validator, and inline handler in
`apps/api/src/routes/`. Keep the chain intact: separately registered handlers still serve
traffic, but disappear from the TypeScript client contract.

## Adding a table

1. Add it to `apps/api/src/db/schema.ts`
2. `bun run db:generate` — writes SQL into `apps/api/drizzle/`
3. Review the SQL, commit it
4. `bun run db:migrate`

There is no `db:push` or `db:studio` script. Both need a Node Postgres driver (`pg` or
`postgres`), and this template deliberately has neither — Bun's built-in client does the
work at runtime. Adding `pg` as a devDependency is the only way to get Drizzle Studio here.

## Adding a UI component

```bash
bunx --bun shadcn@latest add card -c apps/web
```

Components are copied into `apps/web/src/components/ui/`, so they are first-party
code you can edit — not a dependency to work around.

The `shadcn` package is **not installed**, which is why the command above pins
`@latest` rather than running a local binary. It is a CLI with 34 transitive
dependencies — the MCP SDK, Babel, ts-morph, dotenvx, a second copy of Zod — and it
was 221 of the lockfile's 637 packages when it was a devDependency. Its only build
input was one `@import` in `styles.css`, whose `@custom-variant` blocks are now
copied in there directly.

So after adding a component, run `bun run check`. **DEP-07** fails if the new file
uses a `data-*` variant `styles.css` does not define — Tailwind compiles an
undefined `data-open:` to `[data-open]`, which matches nothing on a Radix element,
and the animation silently never plays. The fix is to copy that `@custom-variant`
block across from [`shadcn/tailwind.css`](https://ui.shadcn.com/docs/theming).

## Conventions

[RULES.md](./RULES.md) is the canonical rule set for this stack — numbered so review
comments can cite an id, and marked by whether a tool enforces each rule or only a human
will catch it. It ends with a review checklist. `WS-*` covers the workspace boundaries,
`BUN-*` covers using Bun's APIs rather than Node's.

[CLAUDE.md](./CLAUDE.md) is the operational subset for AI agents, plus the `llms.txt`
endpoints for every dependency here — and the ones that publish none.

## License

MIT — see [LICENSE](./LICENSE).
