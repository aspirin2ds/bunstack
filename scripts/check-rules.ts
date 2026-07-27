#!/usr/bin/env bun
/**
 * Mechanical checks for RULES.md rules that Biome and `tsc` cannot express.
 *
 * Run by `bun run check` and by CI. Every check names the rule it enforces, so
 * a failure points at the rationale instead of just complaining.
 *
 * Keep this honest: a check that cannot actually fail is worse than no check,
 * because it makes a rule look enforced when it is not.
 */
import { Glob } from 'bun'

type Result = { rule: string; what: string; failures: string[] }

const checks: Array<() => Promise<Result>> = []
const check = (fn: () => Promise<Result>) => checks.push(fn)

async function read(path: string) {
  return Bun.file(path).text()
}

async function filesIn(pattern: string, root = '.') {
  const out: string[] = []
  for await (const f of new Glob(pattern).scan({ cwd: root })) out.push(f)
  return out.sort()
}

/** TEST-02 — integration tests must live outside `src/`. */
check(async () => {
  const failures: string[] = []

  for (const f of await filesIn('src/**/*.test.ts')) {
    const body = await read(f)
    const touchesRealDb =
      /from '.*tests\/helpers/.test(body) ||
      /setupTestDatabase|truncateAll|isPostgresReachable/.test(body)

    if (touchesRealDb) failures.push(`${f} looks like an integration test but lives under src/`)
  }

  return {
    rule: 'TEST-02',
    what: 'integration tests live outside src/ (mock.module leaks process-wide)',
    failures,
  }
})

/** CFG-02 — every env var declared in the schema is documented. */
check(async () => {
  const declared = [...(await read('src/env.ts')).matchAll(/^ {2}([A-Z][A-Z0-9_]+):/gm)].map(
    (m) => m[1] as string,
  )
  const example = await read('.env.example')
  const failures = declared
    .filter((v) => !new RegExp(`^#?\\s*${v}=`, 'm').test(example))
    .map((v) => `${v} is in src/env.ts but not in .env.example`)

  return { rule: 'CFG-02', what: 'every env var is documented in .env.example', failures }
})

/** DEP-03 — no dependency outlives its last import. */
check(async () => {
  const pkg = (await Bun.file('package.json').json()) as {
    dependencies: Record<string, string>
  }

  const sources = [
    ...(await filesIn('src/**/*.ts')),
    ...(await filesIn('tests/**/*.ts')),
    ...(await filesIn('scripts/**/*.ts')),
    'drizzle.config.ts',
  ]
  const all = (await Promise.all(sources.map(read))).join('\n')

  const failures = Object.keys(pkg.dependencies)
    .filter((dep) => !new RegExp(`from '${dep}(/|')`).test(all))
    .map((dep) => `${dep} is a dependency but never imported`)

  return { rule: 'DEP-03', what: 'no unused runtime dependencies', failures }
})

/** API-01 — route modules declare endpoints via createRoute, not app.get. */
check(async () => {
  const failures: string[] = []

  for (const f of await filesIn('src/routes/**/*.ts')) {
    if (f.endsWith('.test.ts')) continue

    const body = await read(f)

    // `.get(` also belongs to Headers, URLSearchParams, Map… so the receiver is
    // checked rather than the method name alone. Two shapes to catch: a chained
    // `.get(` at the start of a line, and an explicit `someRouter.get(`.
    const NON_ROUTER = /^(headers|searchParams|params|query|cookies|map|cache|store|set|env|meta)$/i
    const VERBS = 'get|post|put|patch|delete'

    for (const m of body.matchAll(new RegExp(`^\\s*\\.(${VERBS})\\(`, 'gm'))) {
      failures.push(`${f} chains .${m[1]}() directly; use createRoute() + .openapi()`)
    }

    for (const m of body.matchAll(new RegExp(`(\\w+)\\.(${VERBS})\\(`, 'g'))) {
      const [, receiver, verb] = m as unknown as [string, string, string]
      if (!NON_ROUTER.test(receiver)) {
        failures.push(`${f} calls ${receiver}.${verb}() directly; use createRoute() + .openapi()`)
      }
    }
  }

  return { rule: 'API-01', what: 'routes are declared through createRoute()', failures }
})

/** DB-02 — applied migrations are immutable. */
check(async () => {
  const proc = Bun.spawnSync(['git', 'diff', '--name-only', 'HEAD', '--', 'drizzle'])
  const changed = proc.stdout
    .toString()
    .split('\n')
    .filter((l) => l.endsWith('.sql'))

  // A brand-new migration is fine; editing one that is already committed is not.
  const failures: string[] = []
  for (const f of changed) {
    const tracked = Bun.spawnSync(['git', 'ls-files', '--error-unmatch', f]).exitCode === 0
    if (tracked) failures.push(`${f} was modified; generate a new migration instead`)
  }

  return { rule: 'DB-02', what: 'committed migrations are never edited', failures }
})

const results = await Promise.all(checks.map((c) => c()))
let failed = 0

for (const { rule, what, failures } of results) {
  if (failures.length === 0) {
    console.log(`  ok    ${rule.padEnd(8)} ${what}`)
    continue
  }

  failed += failures.length
  console.log(`  FAIL  ${rule.padEnd(8)} ${what}`)
  for (const f of failures) console.log(`          ${f}`)
}

if (failed > 0) {
  console.log(`\n${failed} rule violation(s). See RULES.md.`)
  process.exit(1)
}

console.log(`\n${results.length} rule checks passed.`)
