# bun + hono + postgres template

A small, opinionated starting point: [Bun](https://bun.com) runtime,
[Hono](https://hono.dev) HTTP, [PostgreSQL](https://www.postgresql.org) via
[Drizzle ORM](https://orm.drizzle.team) on Bun's native `bun:sql` driver, and
[Zod 4](https://zod.dev) validation.

No `pg` or `postgres` package — Bun's built-in Postgres client does the work.

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

## Notes for AI agents

See [CLAUDE.md](./CLAUDE.md) for the `llms.txt` endpoints of every dependency
here, plus the project conventions.
