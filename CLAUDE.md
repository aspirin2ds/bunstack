# CLAUDE.md

Bun monorepo template: a Hono + PostgreSQL (Drizzle ORM) API and a TanStack Start +
shadcn/ui web app, joined by a typed client generated from the API's own routes.

> **[RULES.md](./RULES.md) is the canonical rule set** — numbered, citable in review, and
> marked by whether a tool enforces each one. This file is the day-to-day operational
> subset. If the two ever disagree, RULES.md wins and this file is the one to fix.
> Read RULES.md before a non-trivial change, and cite ids (`DB-04`, `LOG-02`) in review.

## Documentation for AI agents

Nearly every dependency in this stack publishes machine-readable docs. **Read these
before guessing at an API** — they all move fast and model training data lags behind them.

### Check the local cache first

These docs are already on disk in **`.online-docs/`** (git-ignored, ~8 MB). **Grep there
before reaching for `WebFetch`** — it is faster, offline, and avoids re-downloading the
same file every session.

```bash
./scripts/fetch-docs.sh           # populate/refresh (only fetches what's missing)
grep -n "idleTimeout" .online-docs/bun/runtime-sql.md
grep -n "createServerFn" .online-docs/tanstack/start-guide.md
```

Grep rather than reading whole bundles: `drizzle/llms-full.txt` is ~3.5 MB and
`tanstack/start-guide.md` is ~400 KB. `.online-docs/README.md` maps every cached file to
its source URL. Fetch from the network only for something not in the manifest — and if
it's plain text, add it to `scripts/fetch-docs.sh` so the next session gets it for free.

**Verify a new plain-text source by its first bytes, not its status code.** Several docs
sites are SPAs that answer every unknown path with HTTP 200 and their HTML shell, so a
guessed `llms.txt` URL can "succeed" and cache 200 KB of markup. TanStack does exactly
this — see the note under [TanStack](#tanstack-start--router--no-llmstxt).

### Bun — `llms.txt` + per-page markdown

| Resource                       | URL                           |
| ------------------------------ | ----------------------------- |
| Index of all docs              | https://bun.com/llms.txt      |
| Everything in one file (~2 MB) | https://bun.com/llms-full.txt |

Bun's docs live on **`bun.com`** (not `bun.sh`) and **every page has a `.md` twin** —
append `.md` to any docs URL to get raw markdown. Paths were reorganized recently;
resolve them from `llms.txt` rather than from memory (e.g. `docs/api/sql` is now
`docs/runtime/sql`).

- SQL / Postgres client — https://bun.com/docs/runtime/sql.md
- Environment variables — https://bun.com/docs/runtime/environment-variables.md
- `bun test` — https://bun.com/docs/test.md
- Test mocks — https://bun.com/docs/test/mocks.md
- Docker — https://bun.com/docs/guides/ecosystem/docker.md
- `bunfig.toml` — https://bun.com/docs/runtime/bunfig.md

Monorepo — cached under `.online-docs/bun/pm-*.md`, and summarized in
[Bun workspaces](#bun-workspaces):

- Workspaces — https://bun.com/docs/pm/workspaces.md
- `--filter` — https://bun.com/docs/pm/filter.md
- Catalogs — https://bun.com/docs/pm/catalogs.md
- Isolated installs — https://bun.com/docs/pm/isolated-installs.md
- `bun install` flags — https://bun.com/docs/pm/cli/install.md

### Hono — `llms.txt`

| Resource               | URL                             |
| ---------------------- | ------------------------------- |
| Index                  | https://hono.dev/llms.txt       |
| Full docs, no examples | https://hono.dev/llms-full.txt  |
| Core only (smallest)   | https://hono.dev/llms-small.txt |

Hono pages do **not** support a `.md` suffix — use the `llms*.txt` files or the HTML pages.

- Bun adapter — https://hono.dev/docs/getting-started/bun
- Validation — https://hono.dev/docs/guides/validation
- Testing helper — https://hono.dev/docs/helpers/testing
- Best practices (RPC-safe routing) — https://hono.dev/docs/guides/best-practices
- Middleware — https://hono.dev/docs/guides/middleware

### Drizzle ORM — `llms.txt`

| Resource                                     | URL                                    |
| -------------------------------------------- | -------------------------------------- |
| Index                                        | https://orm.drizzle.team/llms.txt      |
| Full docs (~340k tokens — fetch selectively) | https://orm.drizzle.team/llms-full.txt |

- Drizzle + `bun:sql` — https://orm.drizzle.team/docs/get-started/bun-sql-new
- Postgres column types — https://orm.drizzle.team/docs/column-types/pg
- Drizzle Kit migrations — https://orm.drizzle.team/docs/kit-overview

### Zod — `llms.txt`

- https://zod.dev/llms.txt — note this project uses **Zod 4**, whose API differs from Zod 3.

### TanStack Start + Router — no `llms.txt`

**TanStack publishes no `llms.txt`, and asking for one looks like it worked.**
`tanstack.com` server-renders its docs, so a guessed path like
`tanstack.com/start/latest/docs/framework/react/llms.txt` returns HTTP **200** with 200 KB
of SPA shell. Do not cache or read that.

The real source is markdown in the `TanStack/router` repo, which
`scripts/fetch-docs.sh` concatenates per directory into greppable bundles:

| Cached bundle                | Upstream directory                 |
| ---------------------------- | ---------------------------------- |
| `tanstack/start.md`          | `docs/start/framework/react`       |
| `tanstack/start-guide.md`    | `docs/start/framework/react/guide` |
| `tanstack/router-guide.md`   | `docs/router/guide`                |
| `tanstack/router-routing.md` | `docs/router/routing`              |

Each page is preceded by `<!-- ===== <dir>/<file>.md ===== -->`, so grep for that marker to
see which page a hit came from. The bundles track `main` and can be ahead of the installed
package — check a surprising API against `node_modules`.

The rendered HTML pages are fine for `WebFetch` when you want one page, but note the URL
shape: guides live under **`/guide/`** (`.../docs/framework/react/guide/hosting`), and a
wrong path returns `{"isNotFound":true}` rather than a 404.

### shadcn/ui — `llms.txt` + per-page markdown

Like `bun.com`, **every `ui.shadcn.com` docs page has a `.md` twin**.

- Index — https://ui.shadcn.com/llms.txt
- TanStack Start install — https://ui.shadcn.com/docs/installation/tanstack.md
- Monorepo usage — https://ui.shadcn.com/docs/monorepo.md
- `components.json` — https://ui.shadcn.com/docs/components-json.md
- CLI — https://ui.shadcn.com/docs/cli.md
- Theming — https://ui.shadcn.com/docs/theming.md

Components are **copied into the repo**, not imported from a dependency: `shadcn add` writes
source files you then own and edit. Treat them as first-party code.

### Vite — `llms.txt`

Start builds with Vite. **This template does not use Nitro**; see
[the web app's build](#the-web-apps-build-deliberately-has-no-nitro).

- Vite — https://vite.dev/llms.txt, https://vite.dev/llms-full.txt

### Tailwind CSS — no plain text

`tailwindcss.com` publishes **no `llms.txt`** and no `.md` twins; both return the Next.js
error shell with a 200. Only two files are cached, taken from the docs repo:

- `tailwind/theme.mdx` — Tailwind 4's CSS-first `@theme` configuration
- `tailwind/upgrade-guide.mdx` — v3 → v4, including `@tailwindcss/vite`

For anything else, use the HTML docs at https://tailwindcss.com/docs. **This project is on
Tailwind 4**, which is configured in CSS, not in a `tailwind.config.js`.

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

| Piece         | Choice                             | Why                                                              |
| ------------- | ---------------------------------- | ---------------------------------------------------------------- |
| Runtime       | Bun 1.4                            | Native TS, built-in test runner, native Postgres driver          |
| HTTP          | Hono 4                             | Web-standard `Request`/`Response`, tiny, first-class Bun support |
| Database      | PostgreSQL 18                      | —                                                                |
| ORM           | Drizzle over `drizzle-orm/bun-sql` | Typed schema, SQL-shaped queries, no extra pg client             |
| Validation    | Zod 4 via `@hono/zod-validator`    | Runtime request checks with inferred TypeScript inputs           |
| Lint/format   | Biome 2                            | Single fast tool; config matches the existing style              |
| Logging       | pino 10                            | Structured JSON to stdout; no built-in equivalent in Bun         |
| Web framework | TanStack Start 1 + Router          | SSR with type-safe routing and server functions                  |
| Web build     | Vite 8                             | `resolve.tsconfigPaths` is built in — no `vite-tsconfig-paths`   |
| UI            | shadcn/ui (radix) + Tailwind 4     | Components are copied in, so they are ours to edit               |
| Web→API       | `hc` from `hono/client`            | The API's `AppType` types every call; no schema duplication      |

The `bun-sql` driver uses Bun's **built-in** Postgres client, so there is deliberately no
`pg` or `postgres` dependency. Do not add one.

## This is a Bun app — do not reach for Node APIs

Bun's Node compatibility layer means the Node version usually _works_, which is precisely
why this is a rule (RULES.md **BUN-01**/**BUN-02**) and not a preference. `bun run
check:rules` fails the build on the left-hand column:

| Don't                         | Do                                                              |
| ----------------------------- | --------------------------------------------------------------- |
| `node:fs`, `node:fs/promises` | `Bun.file()`, `Bun.write()`, `Bun.Glob`                         |
| `node:http`, `node:https`     | `Bun.serve()`, `fetch()`                                        |
| `node:child_process`          | `Bun.spawn()`, `Bun.$`                                          |
| `node:crypto`                 | the `crypto` global, `Bun.hash`, `Bun.password`                 |
| `node:net`, `node:tls`        | `Bun.connect()`, `Bun.listen()`                                 |
| `node:zlib`                   | `Bun.gzipSync()`, `Bun.inflateSync()`                           |
| `node:test`, `node:assert`    | `bun:test`, `expect()`                                          |
| `process.env`                 | **`Bun.env`** — Biome's `noProcessEnv` has no exemptions at all |
| `pg`, `postgres`              | `bun:sql`                                                       |
| `bunx <cli>`                  | **`bunx --bun <cli>`** in any package.json script               |

There are no Node.js API exceptions in application code. If Bun has no direct
replacement, use a Web API or a small local implementation. In particular, do not use
compatibility globals such as `process`, `Buffer`, or the `NodeJS` namespace.

### `bunx --bun` is how a Node CLI becomes a Bun one

`bunx` honours the CLI's shebang, so `bunx drizzle-kit generate` runs a **Node** binary — and
`drizzle.config.ts` then fails with a bare `Bun is not defined`, which reads like a broken
config rather than the wrong runtime. `bunx --bun drizzle-kit generate` runs it under Bun and
`Bun.env` works. Both directions verified on drizzle-kit 0.31.10.

That is why this repo needs **no** `process.env` anywhere, and `check:rules` (BUN-04) fails a
package.json script that calls `bunx` without `--bun`. If you hit `Bun is not defined` from
inside a tool you did not write, `--bun` is the first thing to try.

**`--bun` is not a cure-all.** `drizzle-kit push` and `drizzle-kit studio` fail regardless,
because they need a Node Postgres driver (_"please install either of 'pg', 'postgres',
…"_) and DEP-01 forbids adding one. Those scripts have been **removed** rather than left
broken — use `db:generate` + `db:migrate`, which go through Bun's own client. See BUN-05.

When a Bun-native API is not available, check whether a **web standard** does the job.
`apps/web/server.ts` resolves static asset paths with `new URL(path, dirUrl)` and gets
`..`-collapsing (and therefore the path-traversal guard) from URL semantics.

## Bun workspaces

The layout is `apps/api`, `apps/web` and `packages/api-client`; the matching `WS-*` rules in
RULES.md carry the citable version of everything below.

Verified against `.online-docs/bun/pm-*.md` — grep there rather than guessing, and prefer
these over habits carried in from npm, Yarn or Turborepo.

### Declaring the workspace

Workspaces are a plain `package.json` field; Bun needs no extra config file and no
`pnpm-workspace.yaml`.

```json
{
  "workspaces": {
    "packages": ["apps/*", "packages/*"],
    "catalog": { "typescript": "^7.0.2", "zod": "^4.6.7" }
  }
}
```

- **Depend on a sibling with `workspace:*`**, never a relative path or a file: URL. Bun
  then links the local directory instead of downloading from npm.
- **Pin shared versions once, in a `catalog:`.** Anything two packages both use — Biome,
  TypeScript, Zod, React — belongs in the root catalog, referenced as `"typescript":
  "catalog:"`. Duplicating a version in two `package.json` files is how the API and the web
  app silently end up on different Zod majors. Catalogs only work inside a workspace.
- **The root `package.json` holds no runtime dependencies.** It is the workspace manifest
  and the script entry point; every runtime dependency belongs to the app that imports it.

### Running things

```bash
bun install                              # every workspace at once
bun install --filter './apps/api'        # one workspace's deps

bun --filter '*' dev                     # run `dev` everywhere, in parallel
bun run --filter '@repo/web' build       # by package name, from any directory
bun run --parallel --filter '*' lint     # prefixed output: "@repo/web:lint | ..."
bun run --sequential --workspaces test   # one at a time, in dependency order
```

- **`--filter` matches package names, or paths when the pattern starts with `./`.**
  `--filter '!pkg-c'` excludes; `--filter '!./'` excludes the root.
- **Bun already respects dependency order.** If `web` depends on `api-client`, then
  `bun --filter '*' build` will not start `web`'s build until `api-client` finishes — so a
  task orchestrator (Turbo, Nx) buys ordering we already have. Don't add one for that
  reason alone.
- **`--if-present`** with `--workspaces` skips packages lacking the script instead of
  failing — needed when only some workspaces have, say, `db:migrate`.
- Prefer `bun run --filter <name> <script>` over `cd`-ing into a directory; it works from
  anywhere in the repo, which matters for scripts and CI steps.

### The isolated linker changes what `node_modules` is

**New workspaces default to the `isolated` linker** (pnpm-style), not `hoisted`. Two
consequences worth internalizing:

1. **Phantom dependencies stop resolving.** A package can only import what its own
   `package.json` declares. This is a feature — it is what makes the workspace boundary
   real rather than aspirational — but it means an import that worked in a single-package
   repo can fail here until you declare the dependency in the right `package.json`.
2. **`node_modules` is a tree of symlinks** into `node_modules/.bun/<pkg>@<version>/`, and
   **workspace packages are symlinked to their source directories**. So a Dockerfile that
   copies `node_modules` out of a deps stage must also copy the workspace sources those
   symlinks point at, at the same relative paths, or the links dangle at runtime with a
   module-not-found error that says nothing about symlinks. Copy `node_modules` and
   `apps/*/package.json` as a unit, and smoke-test the built image — this is exactly the
   class of bug that only shows up in a container.

If a tool breaks on the symlink layout, `bun install --linker hoisted` is the escape hatch,
but treat it as a finding worth a comment, not a default.

### Lockfile and installs

One `bun.lock` at the root covers every workspace — committed, and CI installs with
`--frozen-lockfile` (DEP-04). `--production` skips `devDependencies`, so anything a release
image needs at runtime must be a real dependency of that app, not a root devDependency.

## Commands

Every command below runs from the **repository root**. Scripts there fan out with
`--filter`, so there is no need to `cd` into a workspace.

```bash
bun install           # one install for every workspace

bun run dev           # api (:3000) and web (:3001) together, in parallel
bun run dev:api       # just one of them
bun run dev:web
bun run build         # vite build for the web app; the API needs no build step

bun run typecheck     # all three workspaces
bun run test              # unit, then integration
bun run test:unit         # api routes (service mocked) + api-client; no database
bun run test:integration  # api services against real Postgres; skips if none is up

bun run lint          # biome check (lint + format, read-only)
bun run lint:fix      # biome check --write
bun run check         # lint + rules + typecheck + all tests — run before committing

bun run db:generate   # schema.ts -> SQL migration in apps/api/drizzle/
bun run db:migrate    # apply pending migrations
                      # no db:push / db:studio — they need a Node pg driver (BUN-05)

docker compose up -d postgres   # just the database, for local dev
docker compose up --build       # postgres -> migrate -> api -> web
```

Ports: **API 3000**, **web 3001**. The web app reads `API_URL` and calls the API
server-side, so the API must be reachable for a page to render.

Each app owns its `.env`: `apps/api/.env` and `apps/web/.env`, each with its own
`.env.example`. There is deliberately no root `.env` — the web app having no
`DATABASE_URL` is something you should be able to see (WS-05).

## Layout

```
apps/
  api/                    Hono + Postgres. Owns the database; nothing else touches it.
    src/
      index.ts            entry point — reads env, calls Bun.serve
      app.ts              Hono instance: middleware, routes, error handler
      env.ts              Zod-validated environment, fails fast at boot
      types.ts            the ONLY cross-workspace entry point — types, nothing else
      routes/             HTTP layer — parse, validate, delegate, serialize
      services/           business logic — no Hono types cross this boundary
      db/                 drizzle client, schema (source of truth), migrator
      lib/errors.ts       AppError + typed error responses
    tests/                integration tests + database helpers
    drizzle/              generated migrations — commit these, never hand-edit
  web/                    TanStack Start + shadcn/ui. No database access at all.
    server.ts             production Bun server for the built output
    vite.config.ts        tanstackStart() + tailwindcss() + viteReact()
    src/
      router.tsx          getRouter() factory — one router per request
      routeTree.gen.ts    generated by the Vite plugin, but COMMITTED
      routes/             file-based routes (__root.tsx, index.tsx, users.tsx)
      components/ui/      shadcn/ui components — copied in, so first-party code
      env.server.ts       server-only env; the .server suffix is enforced
      lib/api.server.ts   the app's single connection to the API
packages/
  api-client/             hc<AppType> + unwrap()/ApiError. Type-imports @repo/api.
tsconfig.base.json        shared compiler options; each package extends it
```

**The dependency arrow is `web → api-client → api`, and only at the type level.**
`packages/api-client` imports `@repo/api/types`, which re-exports nothing but types, so no
Hono instance or database pool can cross into the web process (WS-05).

`apps/web/src/routeTree.gen.ts` is generated but committed, so `typecheck` works without a
build first. CI regenerates it and fails if it is stale.

## Testing

Two suites, run as **separate processes on purpose**:

- `test:unit` mocks the API's service layer with `mock.module`, so routes, validation and
  error rendering are tested with no database. It also runs `packages/api-client`'s tests,
  which pin the `{ data }` / error-envelope contract between the two apps.
- `test:integration` (`apps/api/tests/`) drives the real service layer against real Postgres.

`mock.module` replaces a module for the **entire process**, so running both in one
`bun test` invocation silently feeds the integration tests the mock — they pass while
testing nothing. Keep integration tests outside `apps/api/src/`, and don't collapse the
scripts back into a bare `bun test`. Fanning out with `--filter` gives each package its own
process, which preserves this for free.

Integration tests skip themselves when no database is reachable, so CI asserts they were
not skipped — otherwise an unreachable database would look green.

New business logic belongs in a service, with an integration test. Route tests should
not be the only coverage a code path has: the unique-violation bug in
[the landmines section](#2-the-sqlstate-is-on-errno-and-drizzle-wraps-the-error) lived in
a service and was invisible to the mocked route tests.

**The web app has no test suite of its own yet.** What covers it instead is the container
smoke test in CI, which asserts a user created through the API appears in server-rendered
HTML — that is the check that would catch the typed client breaking, the JSX transform
regressing, or a workspace symlink not surviving into the release image. If you add
component tests, note that `bun test` does not ship a DOM; TanStack's own examples use
Vitest + jsdom for this.

## Conventions

Paths below are relative to the app they belong to.

- **Layering is one-directional**: `routes → services → db` inside `apps/api`. Services must
  not import from `hono`, and routes must not import from `db/`. This keeps services
  testable without an HTTP context.
- **The workspace boundary is one-directional too**: `web → api-client → api`, types only.
  Biome rejects a runtime import of `@repo/api`, or any `drizzle-orm` import, from
  `apps/web/src/**`.
- **Chain routes for RPC type inference.** Hono's `hc` client only infers types from
  chained route methods, not from separately-declared handlers. This is load-bearing
  here, not stylistic: break the chain and `packages/api-client` silently degrades to
  `unknown` and the web app loses every type it has. See
  [best practices](https://hono.dev/docs/guides/best-practices).
- **Validate route inputs with `zValidator()`** and keep each method in the inferred Hono
  chain. The schema supplies both runtime validation and the TypeScript client input type.
- **Validation errors use `validationHook`** from `apps/api/src/lib/validation.ts`, which
  throws `AppError`. Don't add per-route error handling; it would fork the error envelope.
- **Responses are serialized explicitly** (`toResponse` in `apps/api/src/routes/users.ts`):
  the service layer deals in `Date`, the wire format is ISO strings, and Hono infers that
  return shape for the TypeScript client.
- **Throw `AppError`**, don't return error responses ad hoc — `app.onError` renders the
  single JSON error shape. On the web side, `unwrap()` turns that envelope back into an
  `ApiError`, so a component never inspects `response.ok`.
- **Schema changes go through migrations.** Edit `apps/api/src/db/schema.ts`, then
  `bun run db:generate`. There is no `db:push` — see BUN-05 for why it cannot work here.
- **Env access goes through the app's env module** — `apps/api/src/env.ts` or
  `apps/web/src/env.server.ts` — reading `Bun.env` once at boot, never scattered lookups.
- **Server-only web code ends in `.server.ts`.** Start's import protection denies those
  files in the client bundle, which is what keeps `API_URL` and the API client out of the
  browser. It fails the build, but only _warns_ in dev — so trust the build, not dev.
- **The web app calls the API from server functions and loaders**, never from the browser.

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
- **There is no in-app shutdown hook** (OPS-06). Bun still has no native signal listener,
  only Node's `process.on`, so SIGTERM is left to the runtime. `closeDatabase()` exists for
  explicit lifecycle points — migrations and tests. Since Bun 1.4, `server.stop()` itself
  waits for in-flight requests, so a future native hook only needs to call it.
- `Bun.serve`'s `idleTimeout` **defaults to 10s**, shorter than the 30s request timeout;
  `apps/api/src/index.ts` derives it from `REQUEST_TIMEOUT_MS` so the socket isn't cut out
  from under a slow-but-valid request.

**Drizzle** ([migrations](https://orm.drizzle.team/docs/migrations))

- Codebase-first with **generated, committed** SQL (their "Option 3"), applied at
  deploy time by the one-shot `migrate` service ("Option 4", which they recommend for
  monoliths and zero-downtime deploys). Their `db:push` prototyping flow is unavailable
  here, and deliberately not faked — see BUN-05.
- For hot paths, `.prepare()` + `sql.placeholder()` avoids re-parsing on every call
  ([perf](https://orm.drizzle.team/docs/perf-queries)). Not used yet — add it when a
  query is measurably hot, not preemptively.

**TanStack Start** ([hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting))

- `getRouter()` is a **factory**, not a shared instance — a module-level router would leak
  one request's loader data into the next.
- Server-only modules use the `.server.ts` suffix, which Start's import protection denies in
  the client bundle by default. No configuration needed.
- Routes are file-based and `routeTree.gen.ts` is **committed**, matching TanStack's own
  examples, so `typecheck` needs no build first. CI regenerates it and fails if it is stale.

### The web app's build deliberately has no Nitro

Most Start hosting guides install `nitro` and pick a deployment preset, including a `bun`
one. This template does neither, following TanStack's own
[`start-bun` example](https://github.com/TanStack/router/tree/main/examples/react/start-bun):
plain `vite build`, then a small Bun server (`apps/web/server.ts`) that serves `dist/client`
and forwards everything else to the handler in `dist/server/server.js`.

Two reasons. `nitro@3` is still a **release candidate** and this is a template others will build on. And
the whole repo already runs on Bun, so adding Nitro's server layer would mean two server
abstractions to reason about instead of one.

The upstream reference server is ~550 lines of asset preloading and compression knobs; ours
is the simplification their docs explicitly invite, kept in line with this repo's rules
(env through `env.server.ts`, pino not `console.log`). If you outgrow it,
adopt the Nitro preset — and revisit `NODE_ENV` in the Dockerfile, which the current setup
depends on.

### Two deliberate deviations

**Env at boot, not per request.** Hono recommends `c.env` over `process.env`, and Start
recommends reading env per request, both for portability to Workers-style runtimes where the
environment does not exist at module-evaluation time. This template is Bun-only and reads
`Bun.env` **once at boot** in each app's env module, so misconfiguration fails immediately
instead of on the first request that needs a variable. **If you ever target Cloudflare
Workers, both env modules have to become per-request reads.**

One wrinkle worth knowing: Vite code-splits `env.server.ts` into a lazily-loaded server
chunk, so the bundled copy validates on first use rather than at startup. The boot-time
guarantee comes from `apps/web/server.ts` importing the same module directly, which runs
before `Bun.serve`.

## Logging

Bun ships no structured logger, and `console.log` is unstructured — so **never
`console.log` in this app**. In the API, import `logger` from `apps/api/src/lib/logger.ts`,
or inside a request use `c.get('logger')`, which is already bound to that request's
`requestId`. The web app has the same logger at `apps/web/src/lib/logger.server.ts`,
configured identically apart from a `service: 'web'` binding so one pipeline can parse both.

The shape of the setup, and why:

- **JSON to stdout, one object per line.** Containers and orchestrators collect stdout;
  no files, no rotation, no log shipper in-process.
- **No pino `transport`.** Transports run a worker thread (`thread-stream`) that buys
  nothing when the destination is already stdout, and worker threads are the historical
  friction point for pino on Bun. Verified working on Bun 1.3.14 either way — this is a
  "don't add a moving part you don't need" call, not a compatibility workaround.
- **Pretty output in dev comes from the `pino-pretty` CLI**, piped in the `dev` script, so
  no worker thread ever exists in the app process. `bun run dev:raw` gives raw JSON.
- **String level labels and ISO timestamps**, overriding pino's numeric level and epoch
  milliseconds, because that is what log aggregators index.
- **Secrets are redacted** (`authorization`, `cookie`, `password`, `token`, `secret`,
  `DATABASE_URL`) as defence in depth — nothing logs headers or bodies today.
- **Successful health checks log at `debug`.** A probe every few seconds would otherwise
  drown real traffic. Failing ones still log at `warn`/`error`.
- `LOG_LEVEL=silent` in `apps/api/.env.test` keeps suites readable.

`apps/api/src/middleware/logging.ts` replaces `hono/logger` and emits one record per completed
request. Its test pins a subtlety: Hono routes a thrown handler error through `onError`
before `next()` settles, so the completion record is still emitted for 5xx. That is
internal Hono behaviour, so the test exists to catch it changing.

## Two `bun:sql` landmines

Both were hit and root-caused while building this template, and both are silent —
verify against a live database before assuming either has been fixed.

### 1. A database name that collides with a real directory breaks TCP connections

Bun's SQL client appears to treat the connection URL's path component as a Unix-socket
directory when that path exists on disk. It then fails with a bare
`FailedToOpenSocket failed to connect to postgresql`, even though the TCP port is open
and reachable (`Bun.connect` to the same host:port succeeds).

Reproduced on Bun 1.3.14, Linux arm64:

| Database name | `/<name>` exists     | Result               |
| ------------- | -------------------- | -------------------- |
| `app`         | no                   | connects             |
| `app`         | yes (`WORKDIR /app`) | `FailedToOpenSocket` |
| `foo`         | yes (`mkdir /foo`)   | `FailedToOpenSocket` |
| `postgres`    | no                   | connects             |

This is why both Dockerfiles use **`WORKDIR /usr/src/app`, not `/app`**, and the database
is named **`appdb`, not `app`**. Either change alone fixes it; both are kept so renaming
one later can't silently resurrect it. Do not "tidy" these back.

### 2. The SQLSTATE is on `errno`, and Drizzle wraps the error

A Bun `PostgresError` carries the generic string `ERR_POSTGRES_SERVER_ERROR` on `code`
and the actual SQLSTATE (e.g. `23505`) on **`errno`**. Drizzle then wraps it in a
`DrizzleQueryError`, so the real error sits on **`.cause`**.

Checking `error.code === '23505'` therefore never matches and the failure surfaces as a
500. `isUniqueViolation` in `apps/api/src/db/index.ts` walks the cause chain and checks
`errno`; `apps/api/src/db/unique-violation.test.ts` pins the shape. Reuse that helper rather than
hand-rolling SQLSTATE checks.
