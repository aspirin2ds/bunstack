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
  console.error(`\nerror: ${message}\n`)
  process.exit(1)
}

// ---------------------------------------------------------------- arguments

const argv = Bun.argv.slice(2)
const bare = argv.includes('--bare')
const dbFlag = argv.indexOf('--db')
const appName = argv.find((a) => !a.startsWith('--') && argv[dbFlag + 1] !== a)

if (!appName) {
  fail('usage: bun scripts/init.ts <app-name> [--db <database>] [--bare]')
}

if (!/^[a-z][a-z0-9-]*$/.test(appName)) {
  fail(`app name must be lower-case letters, digits and dashes: got "${appName}"`)
}

const dbName = dbFlag !== -1 ? argv[dbFlag + 1] : `${appName.replace(/-/g, '_')}_db`

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

const dirty = Bun.spawnSync(['git', 'status', '--porcelain']).stdout.toString().trim()
if (dirty) {
  fail('working tree is dirty. Commit or stash first so `git diff` shows what this changed.')
}

// ------------------------------------------------------------------ rename

async function filesIn(pattern: string) {
  const out: string[] = []
  for await (const f of new Glob(pattern).scan({ cwd: '.', dot: true })) out.push(f)
  return out
}

const targets = [
  ...(await filesIn('src/**/*.ts')),
  ...(await filesIn('tests/**/*.ts')),
  ...(await filesIn('.github/**/*.yml')),
  'package.json',
  'docker-compose.yml',
  '.env.example',
  '.env.test',
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
    'src/routes/users.ts',
    'src/routes/users.test.ts',
    'src/services/users.ts',
    'tests/integration/users.service.test.ts',
    'src/routes/openapi.test.ts',
  ]

  for (const f of exampleFiles) {
    if (await Bun.file(f).exists()) await Bun.$`rm -f ${f}`.quiet()
  }

  // Drop the route mount and its import from the app.
  const appPath = 'src/app.ts'
  const app = (await Bun.file(appPath).text())
    .replace(/import \{ usersRoutes \}.*\n/, '')
    .replace(
      /export const routes = app\.route\('\/api\/users', usersRoutes\)/,
      "// Mount resources here, e.g. app.route('/api/things', thingsRoutes)\nexport const routes = app",
    )
  await Bun.write(appPath, app)

  // Empty schema, and drop the example's migrations so `db:generate` starts clean.
  await Bun.write(
    'src/db/schema.ts',
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

  await Bun.$`rm -rf drizzle`.quiet()

  console.log('  removed the users example (routes, service, tests, migrations)')
}

// -------------------------------------------------------------- next steps

console.log(`
next:

  cp .env.example .env
  bun install
  ./scripts/fetch-docs.sh          # local copies of the upstream docs${
    bare
      ? `
  bun run db:generate              # first migration from your schema`
      : ''
  }
  docker compose up --build        # postgres -> migrate -> app

  http://localhost:3000/docs       # API reference
  bun run check                    # lint, rules, typecheck, tests

then review RULES.md — it is the rule set this codebase is built to, and
'bun run check:rules' enforces the mechanical parts.

to start your own history:  rm -rf .git && git init && git add -A
`)
