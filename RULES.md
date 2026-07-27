# Engineering rules

Canonical rules for this stack — Bun, Hono, PostgreSQL/Drizzle, Zod, pino. Written to be
**cited in review**: every rule has a stable id, so a comment can say "DB-04" instead of
re-arguing the point.

`CLAUDE.md` carries the day-to-day operational subset for agents. **This file is the
source of truth**; if the two disagree, this one wins and `CLAUDE.md` should be corrected.

## How to read a rule

| Mark | Meaning |
| --- | --- |
| 🤖 | A tool fails on it — Biome, `tsc`, `bun run check:rules`, or CI. You will not merge a violation by accident. |
| 🤖/👁 | Partly automated; the rest is on review. The note says which part. |
| 👁 | Nobody checks it but a human. These are the ones worth reviewing for. |
| 🔭 | Not implemented in this template yet; the rule applies when you add the feature. |

Every 🤖 rule here has been **mutation-tested** — a violation was introduced and the tool
confirmed to fail on it. A check that cannot fail is worse than no check, because it makes
a rule look enforced when it is not.

Rules are **defaults, not laws**. Breaking one is fine when the reason is better than the
rule — say so in a comment at the site, and cite the id. Silent violations are the problem.

---

## ARCH — Layering

**ARCH-01** 🤖 Dependencies point one way: `routes → services → db`. A service must never
import from `hono`, and a route must never import from `src/db/`.
*Why:* it is what lets the service layer be tested against a real database with no HTTP
context, and routes be tested with no database. Break it and both test suites lose meaning.
*Enforced by* Biome `noRestrictedImports`, per-directory.

**ARCH-02** 👁 Business logic lives in a service, not a route handler. A handler should
parse, delegate, and serialize — nothing else.
*Why:* logic in handlers is only reachable through HTTP, so it tends to get tested through
mocks that assert nothing about the logic.

**ARCH-03** 🤖/👁 Services take and return plain data, and throw `AppError`. No `Context`,
no `Response`, no status codes.
*The import ban makes the HTTP types unreachable; "returns plain data and throws
`AppError`" is still on review.*

**ARCH-04** 👁 Serialize at the route boundary. The database deals in `Date`; the wire
format is ISO strings. `toResponse()` in `src/routes/users.ts` is the pattern, and the
OpenAPI response schema type-checks that it happened.

**ARCH-05** 👁 Shared types that middleware needs (`AppEnv`) live in `src/lib/context.ts`,
not `app.ts`, so middleware can type its context without an import cycle.

---

## API — Routes and HTTP

**API-01** 🤖 Declare routes with `createRoute()` + `.openapi()`, not `app.get()`.
*Why:* a plain `app.get` still serves traffic but is invisible to `/openapi.json`, so the
published contract silently goes stale. Health and docs endpoints are the deliberate
exceptions — they are infrastructure, not API surface.
*Enforced by* `bun run check:rules`.

**API-02** 👁 Chain route registrations in one expression. Hono's `hc` RPC client infers
types only from a chained builder, not from separately-declared handlers.
([best practices](https://hono.dev/docs/guides/best-practices))
*No tool catches this* — unchained routes still serve traffic, they just quietly stop
producing client types.

**API-03** 👁 Write handlers inline after the path. Do not extract "controllers" — it
loses path-parameter type inference. If you must split, use `factory.createHandlers()`.

**API-04** 👁 Never define `app.head()` or `app.on('HEAD', …)`. Hono derives HEAD from GET;
such a route never runs.

**API-05** 👁 Return `c.json(...)` from `notFound`, not `c.notFound()`, which breaks RPC
type inference.

**API-06** 👁 Every route documents the status codes it can actually return, including
error codes. `src/routes/openapi.test.ts` pins these; update it deliberately.

**API-07** 👁 Mount new sub-apps with `app.route()`. One `OpenAPIHono` per resource.

**API-08** 👁 Responses use the `{ data }` envelope on success and the shared `Error`
envelope on failure. No bare arrays or scalars at the top level — it leaves no room to add
pagination metadata later without a breaking change.

---

## VAL — Validation

**VAL-01** 👁 Validate at the edge with a Zod schema on the route. Services trust their
input because the boundary already checked it.

**VAL-02** 👁 Validation failures flow through `defaultHook` in `src/app.ts`. Do not add
per-route validation error handling — it forks the error envelope.

**VAL-03** 🤖 Never use `z.unknown()` or `z.any()` in a **response** schema. It emits
`nullable` with no `type`, which is invalid OpenAPI 3.0 (caught by `redocly lint`). Give
the field a real shape.
*Enforced by* `redocly lint` in CI.

**VAL-04** 👁 Bound every user-supplied collection and string: `limit` has a max, strings
have `.max()`. Unbounded pagination is a denial-of-service vector against your own
database.

**VAL-05** 👁 Derive related schemas rather than restating them — `CreateUserBody.partial()`
for updates. Two hand-written schemas drift.

**VAL-06** 👁 This project is on **Zod 4**. Prefer `z.email()`, `z.uuid()`, `z.url()` over
the deprecated Zod 3 `z.string().email()` chain style.

---

## DB — Database and Drizzle

**DB-01** 🤖 `src/db/schema.ts` is the source of truth. Change it, then
`bun run db:generate`, review the SQL, and commit the migration. CI fails if schema and
migrations disagree.

**DB-02** 🤖 Never hand-edit a file in `drizzle/`. Generate a new migration instead —
editing one that has already been applied desynchronises every environment.
*Enforced by* `bun run check:rules`.

**DB-03** 👁 `db:push` is a local prototyping tool. Never run it against an environment you
care about; it skips migration history.

**DB-04** 👁 All values reach SQL through Drizzle's query builder or `sql` tagged-template
interpolation, which parameterises. **Never** interpolate user input into `sql.raw()` or
`.unsafe()` — those bypass escaping entirely
([docs](https://orm.drizzle.team/docs/sql)).
*Exception:* identifiers (table/database names) cannot be parameterised. The two uses in
`tests/helpers/database.ts` are the sanctioned pattern — values come from the Postgres
catalog or are quote-escaped, never from a request.

**DB-05** 👁 Multi-statement writes that must not partially apply go in `db.transaction()`.

**DB-06** 👁 Index what you filter, join, or sort on. A `unique()` column is already
indexed; a plain foreign key is **not**. Add `index()` in the schema so it ships as a
migration.

**DB-07** 👁 Never query inside a loop. Use `inArray()`, a join, or Drizzle's relational
`with:` — the N+1 is invisible at ten rows and fatal at ten thousand.

**DB-08** 👁 Map database constraint violations to domain errors. Use `isUniqueViolation()`
from `src/db/index.ts`; do not hand-roll SQLSTATE checks (see LAND-02).

**DB-09** 👁 Size the pool deliberately. `DB_POOL_MAX × replicas` must stay below Postgres
`max_connections` (default 100), or deploys fail at connection time under load.

**DB-10** 👁 Only `src/db/` imports the Drizzle client. Services import functions from
`src/db/`, never construct queries against raw SQL elsewhere.

**DB-11** 👁 Timestamps are `timestamp(..., { withTimezone: true })`. Naive timestamps are
a bug waiting for a deployment in another region.

---

## ERR — Errors

**ERR-01** 👁 Throw `AppError`; never build an error response by hand in a handler.
`app.onError` renders the single envelope.

**ERR-02** 👁 Every error carries a stable machine-readable `code`. Clients branch on
`code`, never on `message` — messages are for humans and may be reworded.

**ERR-03** 👁 A new error kind means a new `ErrorCode` and its status in `STATUS_BY_CODE`,
plus the matching entry in `CODE_BY_STATUS` if middleware can raise it. Both maps are in
one place precisely so they cannot drift.

**ERR-04** 👁 Never leak internal error text in production. `app.onError` returns a generic
message when `NODE_ENV=production`; keep it that way.

**ERR-05** 👁 Do not swallow errors. `catch` either handles it, or re-throws after adding
context. An empty catch needs a comment explaining why the failure is genuinely fine —
`checkDatabase()` is the sanctioned example.

---

## LOG — Logging

**LOG-01** 🤖 Never `console.*` **in `src/`** — including one-off scripts like
`src/db/migrate.ts`, whose output lands in the same log stream as the app's. Use
`c.get('logger')` inside a request, `logger` from `src/lib/logger.ts` elsewhere.
*Why:* console output is unstructured and drops the `requestId`, so it cannot be
correlated or queried.
*Scope:* test harness notices under `tests/` may use `console` — that output is for a
human watching a test run, not for a log aggregator.
*Enforced by* Biome `noConsole` (off under `tests/`).

**LOG-02** 👁 Do not add a pino `transport`. It spawns a worker thread for no benefit when
the destination is stdout, and worker threads are the historical friction point for pino
on Bun. Pretty-print by piping to the `pino-pretty` CLI, as `bun run dev` does.

**LOG-03** 👁 Log the error object as `{ err }`, not `err.message`. pino serializes the
stack; a bare message throws away the diagnosis.

**LOG-04** 👁 Never log secrets, tokens, credentials, request bodies, or full headers. The
`redact` list in `src/lib/logger.ts` is a safety net, not permission.

**LOG-05** 👁 High-frequency endpoints (health, probes) log at `debug` on success. A probe
every few seconds otherwise buries real traffic.

**LOG-06** 👁 One structured record per completed request, emitted by the middleware. Do
not add ad-hoc "entering handler" logs.

---

## CFG — Configuration

**CFG-01** 🤖 All configuration goes through `src/env.ts`. Never read `process.env`
elsewhere.
*Why:* the schema fails the process at boot on bad config, instead of at 3am on the first
request that happens to need the variable.
*Enforced by* Biome's `style/noProcessEnv`, with exemptions in `biome.json` for `env.ts`
itself and `drizzle.config.ts` (which runs under drizzle-kit, outside the app's boot path).

**CFG-02** 🤖 New config gets a Zod type, a sane default where one exists, and an entry in
`.env.example`. Required-with-no-default is correct for anything that has no safe default
(`DATABASE_URL`).
*Enforced by* `bun run check:rules`.

**CFG-03** 👁 Never commit `.env`. It is git-ignored; keep it that way. `.env.example`
carries the shape, never real values.

**CFG-04** 👁 Defaults must be safe for production, not convenient for development. CORS
defaults to *not mounted*; the body limit defaults to 1 MiB.

**CFG-05** 👁 Bun-only assumption is deliberate: `process.env` read once at boot rather
than Hono's portable `c.env`. Revisit if this ever targets Cloudflare Workers.

---

## SEC — Security

**SEC-01** 👁 `secureHeaders()` stays mounted, first. Removing it silently drops CSP,
nosniff, and frame protections.

**SEC-02** 👁 CORS is mounted only when `CORS_ORIGINS` is set, and lists explicit origins.
Never `origin: '*'` with `credentials: true` — the combination is rejected by browsers and
signals a misunderstanding.

**SEC-03** 👁 Keep `bodyLimit()` ahead of any body parsing, so oversized payloads are
rejected before they are buffered.

**SEC-04** 👁 Every request has a deadline (`timeout()`). Keep `Bun.serve`'s `idleTimeout`
above it — its 10s default is shorter than the 30s request timeout and will sever a
slow-but-valid request (see `src/index.ts`).

**SEC-05** 👁 Validate and bound all input — see VAL-04. Trust nothing from the wire.

**SEC-06** 👁 The container runs as non-root (`USER bun`). Do not add `USER root` to make a
permission problem go away.

**SEC-07** 🔭 Authentication is not implemented. When added: authenticate in middleware,
authorize in services (the service knows the domain rules), and register the scheme in the
OpenAPI document so `/docs` reflects reality.

**SEC-08** 🔭 Rate limiting is not implemented. When added, use
[hono-rate-limiter](https://github.com/rhinobase/hono-rate-limiter) with a shared store —
an in-memory limiter is useless across replicas.

**SEC-09** 👁 Never log or serialize `DATABASE_URL`; it contains credentials. It is in the
redact list.

---

## TEST — Testing

**TEST-01** 👁 Unit tests (`src/`) mock the service layer and need no database.
Integration tests (`tests/`) exercise real SQL. New business logic needs an integration
test — a mocked route test proves nothing about the SQL.

**TEST-02** 🤖/👁 The two suites run as **separate processes**. `mock.module` replaces a
module for the whole process, so a single `bun test` feeds the integration tests the mock
and they pass while testing nothing. Never collapse the scripts back into a bare
`bun test`, and never put an integration test under `src/`.
*The `test:unit` / `test:integration` split makes the separation structural, but nothing
catches an integration test filed under `src/` — that part is on review.*

**TEST-03** 🤖 CI asserts integration tests were not skipped. They self-skip when no
database is reachable — without the assertion, an unreachable database looks green.

**TEST-04** 👁 Assert on behaviour, not implementation: status codes, response bodies,
persisted rows. Not "was this function called".

**TEST-05** 👁 Test the failure paths. The conflict, the 404, the malformed input. The
happy path rarely regresses.

**TEST-06** 👁 Tests are order-independent and clean up after themselves (`truncateAll()`
in `beforeEach`). Never rely on another test's rows.

**TEST-07** 👁 When fixing a bug, first write the test that fails. If it passes before the
fix, it does not test the bug — see LAND-02, where a mutation check proved the point.

**TEST-08** 👁 Capture real error shapes in tests rather than inventing them. The fixtures
in `src/db/unique-violation.test.ts` came off a live Postgres.

---

## OPS — Build, CI, deploy

**OPS-01** 👁 `WORKDIR` is `/usr/src/app`, not `/app`, and the database is `appdb`, not
`app`. Both halves are load-bearing — see LAND-01. Do not "tidy" either back.

**OPS-02** 👁 Dependencies install in their own Docker stage so a source change does not
invalidate the install cache. The release stage carries production dependencies only.

**OPS-03** 👁 The image build runs unit tests only — no database exists at build time.
Integration tests belong in CI, which has a Postgres service.

**OPS-04** 👁 Migrations run as a one-shot service before the app starts, gated on
`service_completed_successfully`. Never migrate from inside the app's startup path — with
multiple replicas they race.

**OPS-05** 👁 `/health` must not touch the database; `/health/db` must. An orchestrator
needs to distinguish "process wedged" from "database unreachable", and a liveness probe
that hits the database turns a database blip into a restart loop.

**OPS-06** 👁 Handle SIGTERM: stop the server, then close the pool. Exiting without
draining leaves in-flight requests dead and backends for Postgres to time out.

**OPS-07** 🤖 `bun run check` (lint + typecheck + tests) passes before commit. CI runs the
same plus a containerized end-to-end smoke test.

**OPS-08** 👁 Validate workflow changes with `actionlint` — a broken workflow is only
discovered after it is pushed.

**OPS-09** 👁 `docker compose down` before running the app locally. A stale container
holding port 3000 will serve an old image and produce results that look like your code is
broken.

---

## DEP — Dependencies

**DEP-01** 👁 Bun's built-in Postgres driver (`bun:sql`) is the database client. Do not add
`pg` or `postgres`.

**DEP-02** 👁 Prefer Bun and Hono built-ins over new dependencies. Every dependency is
supply chain, install time, and a Bun-compatibility question.

**DEP-03** 🤖 Remove a dependency the moment it stops being used, and delete the code it
supported. `@hono/zod-validator` and `src/lib/validate.ts` went together.
*Enforced by* `bun run check:rules`.

**DEP-04** 👁 `bun.lock` is committed, and CI installs with `--frozen-lockfile`.

**DEP-05** 👁 Run `bun audit` periodically.
*Note:* it could not be verified from this sandbox (TLS egress is blocked); confirm it
works in your environment before relying on it in CI.

**DEP-06** 👁 Verify a library actually works **on Bun**, in a container, before adopting
it. Node compatibility is not Bun compatibility — pino's worker-thread transports were
checked on both macOS and Linux/arm64 before being ruled out for reasons other than
breakage.

---

## PERF — Performance

**PERF-01** 👁 Optimise on evidence, not instinct. Drizzle's `.prepare()` +
`sql.placeholder()` is the documented tool for hot paths
([perf](https://orm.drizzle.team/docs/perf-queries)) — reach for it when a query is
measurably hot, not preemptively.

**PERF-02** 👁 Select the columns you need on wide tables. `select()` with no argument
fetches everything, including columns added later.

**PERF-03** 👁 Paginate every list endpoint. See VAL-04.

**PERF-04** 👁 Do not hold a transaction open across a network call. It pins a pooled
connection for the duration of something you do not control.

---

## LAND — Known landmines

Both were found the hard way in this repository. Full write-ups in `CLAUDE.md`.

**LAND-01** `bun:sql` refuses to connect over TCP when a directory exists at
`/<database-name>` — it reads the URL path as a Unix-socket directory and fails with a bare
`FailedToOpenSocket`, while the port is open and `Bun.connect` succeeds. The stock
`WORKDIR /app` plus a database named `app` hits this exactly. Mitigated by OPS-01.

**LAND-02** Bun reports the Postgres SQLSTATE on `errno`; its `code` is the generic
`ERR_POSTGRES_SERVER_ERROR`. Drizzle then wraps the driver error in `.cause`. So the
obvious `error.code === '23505'` never matches and a duplicate key surfaces as a 500.
Mitigated by DB-08.

*The lesson generalises, and is the reason both were caught:* **verify against the real
runtime.** Neither was visible to typechecking, unit tests, or reading the code.

---

## Review checklist

For a routine change, in priority order:

1. **Correctness** — does it work, and is there a test that fails without it? (TEST-05,
   TEST-07)
2. **Layering** — logic in the service, not the handler? Imports pointing one way?
   (ARCH-01, ARCH-02)
3. **Contract** — route documented with real status codes, schemas bounded? (API-01,
   API-06, VAL-04)
4. **Errors** — `AppError` with a stable code, failure paths covered? (ERR-01, ERR-02)
5. **Data** — schema change has a migration, queries parameterised, no N+1? (DB-01, DB-04,
   DB-07)
6. **Secrets** — nothing sensitive logged or committed? (LOG-04, CFG-03)
7. **Operability** — will a failure be diagnosable from the logs alone? (LOG-01, LOG-03)

Everything marked 🤖 is already guaranteed by `bun run check` and CI. **Spend review
attention on the 👁 rules** — they are the ones no tool will catch.

### Adding enforcement

When a 👁 rule turns out to be mechanically checkable, automate it and promote the mark:

- **Import and syntax shapes** → a Biome rule in `biome.json`, scoped with `overrides`.
- **Anything needing project knowledge** (file layout, cross-file consistency) → a check in
  `scripts/check-rules.ts`, named after the rule id.
- **The OpenAPI contract** → `redocly lint` already runs in CI.

Then break the rule on purpose and confirm the tool fails. If it does not, the rule is
still 👁 — say so rather than claiming otherwise.
