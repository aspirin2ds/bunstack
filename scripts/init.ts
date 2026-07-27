#!/usr/bin/env bun
/**
 * Turns this template into a new application.
 *
 *   bun scripts/init.ts my-api                 # keep the users example
 *   bun scripts/init.ts my-api --bare          # strip the example resource
 *   bun scripts/init.ts my-api --db my_api_db  # choose the database name
 *
 * Renames the template identifiers, validates the database name against the
 * `bun:sql` landmine documented as LAND-01, and optionally removes the example
 * resource so you start from an empty schema.
 *
 * Safe to read before running: it only touches files in this repository, and
 * refuses to run on a dirty tree so `git diff` shows exactly what it did.
 */
import { Glob } from 'bun'

const TEMPLATE_NAME = 'bun-hono-postgres-template'
const TEMPLATE_DB = 'appdb'

/**
 * LAND-01: `bun:sql` will not connect over TCP when a directory exists at
 * `/<database-name>` — it reads the URL path as a Unix-socket directory. These
 * are the directories present at `/` in the runtime image, so a database named
 * after any of them would fail with a bare `FailedToOpenSocket`.
 */
const RESERVED_DB_NAMES = new Set([
  'bin',
  'boot',
  'dev',
  'etc',
  'home',
  'lib',
  'lib32',
  'lib64',
  'libx32',
  'media',
  'mnt',
  'opt',
  'proc',
  'root',
  'run',
  'sbin',
  'srv',
  'sys',
  'tmp',
  'usr',
  'var',
  'app',
])

function fail(message: string): never {
  throw new Error(message)
}

// ---------------------------------------------------------------- arguments

async function main() {
  const argv = Bun.argv.slice(2)
  const bare = argv.includes('--bare')

  /**
   * Set by the `bun-create` postinstall hook, so `bun create <user>/<repo> my-api`
   * bootstraps without a second command. In that mode the app name comes from the
   * destination directory — the hook runs through `bun run`, which does not expand
   * `$(basename $PWD)`, so the script has to resolve it itself.
   */
  const fromCreate = argv.includes('--from-create')

  // Parse positionally: `--db` consumes the next token, so a value that happens
  // to equal the app name cannot swallow it.
  const positional: string[] = []
  let dbFromFlag: string | undefined

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string

    if (arg === '--db') {
      dbFromFlag = argv[++i]
      continue
    }
    if (arg.startsWith('--')) continue

    positional.push(arg)
  }

  /**
   * Last segment of Bun's working directory. A plain string split keeps the
   * bootstrap script within the Bun-only runtime boundary (RULES.md BUN-01).
   */
  async function currentDirectoryName(): Promise<string | undefined> {
    const cwd = (await Bun.$`pwd`.text()).trim()
    return cwd.split('/').filter(Boolean).pop()
  }

  const appName = positional[0] ?? (fromCreate ? await currentDirectoryName() : undefined)

  if (!appName) {
    fail('usage: bun scripts/init.ts <app-name> [--db <database>] [--bare]')
  }

  if (!/^[a-z][a-z0-9-]*$/.test(appName)) {
    // Under `bun create` this is not worth aborting the scaffold for — the
    // project is otherwise fine, it just keeps the template's names.
    const message = `app name must be lower-case letters, digits and dashes: got "${appName}"`

    if (!fromCreate) fail(message)

    console.log(`  skipped rename: ${message}`)
    console.log('  run `bun run init <app-name>` yourself when you have picked one.')
    return
  }

  const dbName = dbFromFlag ?? `${appName.replace(/-/g, '_')}_db`

  if (!dbName || !/^[a-z_][a-z0-9_]*$/.test(dbName)) {
    fail(`database name must be lower-case letters, digits and underscores: got "${dbName}"`)
  }

  if (RESERVED_DB_NAMES.has(dbName)) {
    fail(
      `database name "${dbName}" collides with a directory at / in the runtime image.\n` +
        "       bun:sql would read the connection URL's path as a Unix-socket directory\n" +
        '       and fail with "FailedToOpenSocket". See LAND-01 in RULES.md.\n' +
        `       Try "${dbName}_db".`,
    )
  }

  // ------------------------------------------------------------- safety check

  // `bun create` has just written the tree and run `git init`, so of course it is
  // dirty — the guard only makes sense for a manual run.
  if (!fromCreate) {
    const dirty = Bun.spawnSync(['git', 'status', '--porcelain']).stdout.toString().trim()

    if (dirty) {
      fail('working tree is dirty. Commit or stash first so `git diff` shows what this changed.')
    }
  }

  // ------------------------------------------------------------------ rename

  async function filesIn(pattern: string) {
    const out: string[] = []
    for await (const f of new Glob(pattern).scan({ cwd: '.', dot: true })) out.push(f)
    return out
  }

  /**
   * The template name appears in both apps' source, in the workspace manifests and
   * in the compose file. `@repo/*` package names are deliberately *not* renamed:
   * they are internal to the workspace and carry no branding.
   */
  const targets = [
    ...(await filesIn('apps/*/src/**/*.{ts,tsx}')),
    ...(await filesIn('apps/*/tests/**/*.ts')),
    ...(await filesIn('packages/*/src/**/*.ts')),
    ...(await filesIn('.github/**/*.yml')),
    ...(await filesIn('apps/*/.env.example')),
    ...(await filesIn('apps/*/.env.test')),
    'package.json',
    'docker-compose.yml',
    'README.md',
  ]

  let renamed = 0

  for (const file of targets) {
    if (!(await Bun.file(file).exists())) continue

    const before = await Bun.file(file).text()
    const after = before.replaceAll(TEMPLATE_NAME, appName).replaceAll(TEMPLATE_DB, dbName)

    if (before !== after) {
      await Bun.write(file, after)
      renamed++
    }
  }

  console.log(`  renamed template identifiers in ${renamed} files`)
  console.log(`    app:      ${appName}`)
  console.log(`    database: ${dbName}`)

  // ------------------------------------------------------- strip the example

  if (bare) {
    const exampleFiles = [
      'apps/api/src/routes/users.ts',
      'apps/api/src/routes/users.test.ts',
      'apps/api/src/services/users.ts',
      'apps/api/tests/integration/users.service.test.ts',
      'apps/api/src/routes/openapi.test.ts',
      // The web page consumes the API's users routes through the typed client, so
      // it cannot outlive them — with the routes gone it would not typecheck.
      'apps/web/src/routes/users.tsx',
    ]

    for (const f of exampleFiles) {
      if (await Bun.file(f).exists()) await Bun.$`rm -f ${f}`.quiet()
    }

    // `/` redirected to `/users`; with that page gone it becomes the landing page.
    await Bun.write(
      'apps/web/src/routes/index.tsx',
      `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

/**
 * Starting point for the web app. Data belongs in a \`loader\`, and the call to the
 * API belongs in a server function that uses \`api\` from \`@/lib/api.server\` —
 * see RULES.md WS-05 for why the browser never calls the API directly.
 */
function Home() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">It works</h1>
      <p className="text-muted-foreground text-sm">
        Add a route under <code>src/routes/</code> to get started.
      </p>
    </div>
  )
}
`,
    )

    /**
     * The layout still links to `/users`. TanStack Router types `to` against the
     * generated route tree, so a link to a route that no longer exists is a
     * typecheck failure, not a dead link discovered later.
     */
    const rootPath = 'apps/web/src/routes/__root.tsx'
    const root = (await Bun.file(rootPath).text())
      .replaceAll('to="/users"', 'to="/"')
      .replace(/(\n\s*)Users(\n\s*<\/Link>)/, '$1Home$2')
    await Bun.write(rootPath, root)

    // Drop the route mount and its import from the app.
    const appPath = 'apps/api/src/app.ts'
    const app = (await Bun.file(appPath).text())
      .replace(/import \{ usersRoutes \}.*\n/, '')
      .replace(
        /export const routes = app\.route\('\/api\/users', usersRoutes\)/,
        "// Mount resources here, e.g. app.route('/api/things', thingsRoutes)\nexport const routes = app",
      )
    await Bun.write(appPath, app)

    // Empty schema, and drop the example's migrations so `db:generate` starts clean.
    await Bun.write(
      'apps/api/src/db/schema.ts',
      `import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * Source of truth for the database shape. Edit here, then run
 * \`bun run db:generate\` to emit a migration into \`drizzle/\`.
 *
 * Example — see RULES.md DB-06 about indexing what you sort or filter on:
 *
 * export const things = pgTable('things', {
 *   id: uuid('id').primaryKey().defaultRandom(),
 *   name: text('name').notNull(),
 *   createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
 * })
 */

// Nothing defined yet — add your first table above.
export const _placeholder = pgTable('_placeholder', {
  id: uuid('id').primaryKey().defaultRandom(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
`,
    )

    await Bun.$`rm -rf apps/api/drizzle`.quiet()

    // `bun test <dir>` exits non-zero when a directory has no test files, so the
    // integration suite needs a starter. This one is also the smallest useful
    // demonstration of the helpers your first real resource test will use.
    await Bun.write(
      'apps/api/tests/integration/database.test.ts',
      `import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

import { closeDatabase, db } from '../../src/db/index.ts'
import { isPostgresReachable, setupTestDatabase } from '../helpers/database.ts'

/**
 * Starter integration test. Copy this shape for your first resource: drive the
 * service layer against real SQL, and let it skip when no database is running
 * (\`docker compose up -d postgres\`).
 *
 * Must live outside \`src/\` — see RULES.md TEST-02.
 */
const reachable = await isPostgresReachable()

if (!reachable) {
  console.warn('\\n  ⚠ skipping integration tests: no PostgreSQL at DATABASE_URL\\n')
}

describe.skipIf(!reachable)('database', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await closeDatabase()
  })

  it('is reachable and migrated', async () => {
    const rows = await db.$client\`select 1 as ok\`

    expect(rows[0]).toEqual({ ok: 1 })
  })
})
`,
    )

    console.log('  removed the users example (API routes, service, tests, migrations, web page)')
    console.log('  wrote apps/api/tests/integration/database.test.ts as a starting point')

    /**
     * The route tree is generated by the Vite plugin and committed, so the copy on
     * disk still references the users page that was just deleted. Rebuilding
     * regenerates it; without this the scaffold would not typecheck until the first
     * manual build.
     */
    const rebuilt = Bun.spawnSync(['bun', 'run', '--filter', '@repo/web', 'build'], {
      stdout: 'ignore',
      stderr: 'ignore',
    })

    console.log(
      rebuilt.exitCode === 0
        ? '  regenerated apps/web/src/routeTree.gen.ts'
        : '  could not regenerate the route tree — run `bun run build` before `bun run check`',
    )
  }

  // -------------------------------------------------------------- next steps

  console.log(`
next:

  cp apps/api/.env.example apps/api/.env
  cp apps/web/.env.example apps/web/.env
  bun install                      # one install for every workspace
  ./scripts/fetch-docs.sh          # local copies of the upstream docs${
    bare
      ? `
  bun run db:generate              # first migration from your schema`
      : ''
  }
  docker compose up --build        # postgres -> migrate -> api -> web

  http://localhost:3001            # the web app
  http://localhost:3000/docs       # API reference
  bun run check                    # lint, rules, typecheck, tests

layout:

  apps/api                Hono + Postgres. Owns the database.
  apps/web                TanStack Start + shadcn/ui. Talks to the API over HTTP.
  packages/api-client     Typed client, inferred from the API's own routes.

then review RULES.md — it is the rule set this codebase is built to, and
'bun run check:rules' enforces the mechanical parts. The WS-* rules cover the
workspace boundaries and BUN-* cover using Bun's APIs rather than Node's.

to start your own history:  rm -rf .git && git init && git add -A
`)
}

await main()
