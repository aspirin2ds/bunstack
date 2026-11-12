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
import { editedMigrations } from './lib/migrations.ts'

type Result = { rule: string; what: string; failures: string[] }

const checks: Array<() => Promise<Result>> = []
const check = (fn: () => Promise<Result>) => checks.push(fn)

const API = 'apps/api'
const WEB = 'apps/web'

async function read(path: string) {
  return Bun.file(path).text()
}

async function filesIn(pattern: string, root = '.') {
  const out: string[] = []
  for await (const f of new Glob(pattern).scan({ cwd: root })) out.push(f)
  return out.sort()
}

interface PackageJson {
  name?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  workspaces?: { packages?: string[]; catalog?: Record<string, string> }
}

interface Workspace {
  dir: string
  name: string
  pkg: PackageJson
  /** dependencies + devDependencies, merged. */
  allDeps: Record<string, string>
}

/** Every workspace package. Resolved once; several checks need it. */
async function loadWorkspaces(): Promise<Workspace[]> {
  const manifests = [
    ...(await filesIn('apps/*/package.json')),
    ...(await filesIn('packages/*/package.json')),
  ]

  return Promise.all(
    manifests.map(async (path) => {
      const pkg = (await Bun.file(path).json()) as PackageJson
      const dir = path.replace(/\/package\.json$/, '')

      return {
        dir,
        name: pkg.name ?? dir,
        pkg,
        allDeps: { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) },
      }
    }),
  )
}

const WORKSPACES = await loadWorkspaces()

/** Source files a workspace owns, excluding generated output. */
async function sourcesOf(dir: string, extensions = '{ts,tsx}') {
  const patterns = [`src/**/*.${extensions}`, `tests/**/*.${extensions}`, `*.${extensions}`]
  const found = (await Promise.all(patterns.map((p) => filesIn(p, dir)))).flat()

  return found.filter((f) => !f.endsWith('routeTree.gen.ts'))
}

/** TEST-02 — integration tests must live outside the API's `src/`. */
check(async () => {
  const failures: string[] = []

  for (const f of await filesIn('src/**/*.test.ts', API)) {
    const body = await read(`${API}/${f}`)
    const touchesRealDb =
      /from '.*tests\/helpers/.test(body) ||
      /setupTestDatabase|truncateAll|isPostgresReachable/.test(body)

    if (touchesRealDb) {
      failures.push(`${API}/${f} looks like an integration test but lives under src/`)
    }
  }

  return {
    rule: 'TEST-02',
    what: 'integration tests live outside src/ (mock.module leaks process-wide)',
    failures,
  }
})

/**
 * CFG-02 — every env var declared in a schema is documented in that app's own
 * `.env.example`. Per app, because each process validates only its own
 * environment — and the web app deliberately has no `DATABASE_URL`.
 */
check(async () => {
  const failures: string[] = []

  const pairs: Array<[schema: string, example: string]> = [
    [`${API}/src/env.ts`, `${API}/.env.example`],
    [`${WEB}/src/env.server.ts`, `${WEB}/.env.example`],
  ]

  for (const [schemaPath, examplePath] of pairs) {
    const declared = [
      ...(await read(schemaPath)).matchAll(/^\t?(?: {2})?([A-Z][A-Z0-9_]+):/gm),
    ].map((m) => m[1] as string)
    const example = await read(examplePath)

    for (const v of declared) {
      if (!new RegExp(`^#?\\s*${v}=`, 'm').test(example)) {
        failures.push(`${v} is in ${schemaPath} but not in ${examplePath}`)
      }
    }
  }

  return { rule: 'CFG-02', what: 'every env var is documented in .env.example', failures }
})

/**
 * DEP-03 — no dependency outlives its last import, checked per workspace.
 *
 * CSS counts: shadcn/ui pulls `shadcn`, `tw-animate-css` and the Geist font in
 * through `@import` in `styles.css` and never from TypeScript. A check that read
 * only `.ts` files would report three false positives and get switched off.
 */
check(async () => {
  const failures: string[] = []

  /**
   * Runtime dependencies nothing imports by name, with the reason each is still
   * required. Keep this short and justified — it is the escape hatch that could
   * quietly make the whole check meaningless.
   */
  const REQUIRED_BUT_UNIMPORTED: Record<string, string> = {
    // `jsx: react-jsx` emits `react/jsx-runtime`, and the DOM renderer is loaded
    // by TanStack Start's own entry, so app code never names react-dom.
    'react-dom': 'loaded by the framework entry, never imported by app code',
  }

  for (const workspace of WORKSPACES) {
    const deps = Object.keys(workspace.pkg.dependencies ?? {})
    if (deps.length === 0) continue

    const sources = await sourcesOf(workspace.dir, '{ts,tsx,css}')
    const all = (await Promise.all(sources.map((f) => read(`${workspace.dir}/${f}`)))).join('\n')

    for (const dep of deps) {
      if (dep in REQUIRED_BUT_UNIMPORTED) continue

      // `from 'dep'`, `from 'dep/sub'`, a side-effect `import 'dep'`, and the CSS
      // `@import 'dep'` / `@import 'dep/file.css'`. Either quote style.
      const escaped = dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const used = new RegExp(`(from|import)\\s+['"]${escaped}(/[^'"]*)?['"]`).test(all)

      if (!used) failures.push(`${dep} is a dependency of ${workspace.name} but never imported`)
    }
  }

  return { rule: 'DEP-03', what: 'no unused runtime dependencies', failures }
})

/** API-01 — resource routers keep route registrations in one chained expression. */
check(async () => {
  const failures: string[] = []

  for (const f of await filesIn('src/routes/**/*.ts', API)) {
    if (f.endsWith('.test.ts')) continue

    const body = await read(`${API}/${f}`)
    const VERBS = 'get|post|put|patch|delete'

    for (const m of body.matchAll(new RegExp(`^\\s*(\\w+)\\.(${VERBS})\\(`, 'gm'))) {
      const [, receiver, verb] = m as unknown as [string, string, string]
      failures.push(
        `${API}/${f} calls ${receiver}.${verb}() after construction; chain it from new Hono()`,
      )
    }
  }

  return { rule: 'API-01', what: 'resource routes stay in the inferred Hono chain', failures }
})

/** DB-02 — applied migrations are immutable. */
check(async () => {
  // `--diff-filter=M` is deliberate: the rule is about *editing* a committed
  // migration. Adding one is the normal workflow, and wholesale removal is what
  // `scripts/init.ts --bare` does when resetting the template — neither is the
  // hazard DB-02 guards against.
  const baseIndex = Bun.argv.indexOf('--base')
  const base = baseIndex === -1 ? 'HEAD' : Bun.argv[baseIndex + 1]
  if (!base) throw new Error('--base requires a Git revision')
  const failures = editedMigrations(base).map(
    (f) => `${f} was edited; generate a new migration instead`,
  )

  return { rule: 'DB-02', what: 'committed migrations are never edited', failures }
})

/**
 * WS-02 — cross-workspace imports go through the package name, never a relative
 * path that climbs out of the package. A relative import bypasses the dependency
 * graph, so `--filter` build ordering silently stops applying to it.
 */
check(async () => {
  const failures: string[] = []

  for (const workspace of WORKSPACES) {
    for (const f of await sourcesOf(workspace.dir)) {
      const body = await read(`${workspace.dir}/${f}`)

      for (const m of body.matchAll(/from\s+['"]((?:\.\.\/)+(?:apps|packages)\/[^'"]+)['"]/g)) {
        failures.push(
          `${workspace.dir}/${f} imports ${m[1]} by relative path; ` +
            'declare the dependency and import it by package name',
        )
      }
    }
  }

  return { rule: 'WS-02', what: 'cross-workspace imports use the package name', failures }
})

/**
 * WS-03 — a dependency used by more than one workspace is pinned once in the root
 * catalog rather than restated with a literal version in each package, which is
 * how two apps end up on different majors of the same library.
 */
check(async () => {
  const root = (await Bun.file('package.json').json()) as PackageJson
  const catalog = root.workspaces?.catalog ?? {}
  const failures: string[] = []

  /** dependency -> packages declaring it with a literal version. */
  const literal = new Map<string, string[]>()

  for (const { name, allDeps } of WORKSPACES) {
    for (const [dep, version] of Object.entries(allDeps)) {
      if (version.startsWith('catalog:') || version.startsWith('workspace:')) continue

      literal.set(dep, [...(literal.get(dep) ?? []), name])
    }
  }

  for (const [dep, holders] of literal) {
    if (holders.length > 1) {
      failures.push(
        `${dep} has a literal version in ${holders.join(' and ')}; ` +
          'move it to workspaces.catalog and reference it as "catalog:"',
      )
    }
  }

  // The mirror-image mistake: a catalog entry nothing references any more.
  for (const dep of Object.keys(catalog)) {
    const referenced = WORKSPACES.some((w) => w.allDeps[dep]?.startsWith('catalog:'))

    if (!referenced) failures.push(`${dep} is in workspaces.catalog but no package references it`)
  }

  return { rule: 'WS-03', what: 'shared dependency versions live in the catalog', failures }
})

/** WS-04 — the root package.json is a manifest, not a place to install things. */
check(async () => {
  const root = (await Bun.file('package.json').json()) as PackageJson

  const failures = Object.keys(root.dependencies ?? {}).map(
    (dep) =>
      `${dep} is a runtime dependency of the root package; move it to the workspace ` +
      'that imports it — `--production` prunes root devDependencies',
  )

  return { rule: 'WS-04', what: 'the root package declares no runtime dependencies', failures }
})

/** BUN-01/BUN-02 — application code uses Bun and Web APIs exclusively. */
check(async () => {
  // Every compatibility builtin is forbidden, including ones without a direct
  // Bun equivalent. Prefer Bun APIs, Web APIs, or a small local implementation.
  const BUILTINS = new Set([
    'assert',
    'buffer',
    'child_process',
    'cluster',
    'console',
    'crypto',
    'dns',
    'events',
    'fs',
    'http',
    'http2',
    'https',
    'net',
    'os',
    'path',
    'perf_hooks',
    'process',
    'querystring',
    'readline',
    'stream',
    'string_decoder',
    'timers',
    'tls',
    'tty',
    'url',
    'util',
    'v8',
    'vm',
    'worker_threads',
    'zlib',
  ])
  const FORBIDDEN_GLOBALS = ['process', 'Buffer', 'NodeJS']

  const failures: string[] = []

  const targets: Array<{ dir: string; files: string[] }> = [
    ...(await Promise.all(
      WORKSPACES.map(async (w) => ({ dir: w.dir, files: await sourcesOf(w.dir) })),
    )),
    { dir: '.', files: await filesIn('scripts/**/*.ts') },
  ]

  for (const { dir, files } of targets) {
    for (const f of files) {
      const path = dir === '.' ? f : `${dir}/${f}`
      const body = await read(path)

      for (const m of body.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)) {
        const spec = m[1] as string
        const bare = spec.startsWith('node:') ? spec.slice('node:'.length) : spec

        if (BUILTINS.has(bare)) {
          failures.push(`${path} imports '${spec}'; use a Bun or Web API (BUN-01)`)
        }
      }

      // Remove comments and strings before checking globals so examples and
      // enforcement messages do not report themselves.
      const code = body
        .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, '')
        .replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, '')

      for (const name of FORBIDDEN_GLOBALS) {
        if (new RegExp(`\\b${name}\\b`).test(code)) {
          failures.push(`${path} uses ${name}; use a Bun or Web API (BUN-02)`)
        }
      }
    }
  }

  return { rule: 'BUN-01', what: 'application code contains no Node.js APIs', failures }
})

/** BUN-04 — local JS/TS CLIs run through `bunx --bun`. */
check(async () => {
  const failures: string[] = []

  const manifests = ['package.json', ...WORKSPACES.map((w) => `${w.dir}/package.json`)]

  for (const path of manifests) {
    const pkg = (await Bun.file(path).json()) as PackageJson & {
      scripts?: Record<string, string>
    }
    const dir = path.replace(/\/?package\.json$/, '') || '.'
    const localBins = new Set<string>()

    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
      const dependencyManifest = Bun.file(`${dir}/node_modules/${dep}/package.json`)
      if (!(await dependencyManifest.exists())) continue

      const dependency = (await dependencyManifest.json()) as {
        name?: string
        bin?: string | Record<string, string>
      }

      if (typeof dependency.bin === 'string') {
        localBins.add((dependency.name ?? dep).split('/').pop() as string)
      } else {
        for (const bin of Object.keys(dependency.bin ?? {})) localBins.add(bin)
      }
    }

    for (const [name, script] of Object.entries(pkg.scripts ?? {})) {
      for (const m of script.matchAll(/\bbunx\b((?:\s+--?[\w-]+)*)/g)) {
        const flags = m[1] ?? ''

        if (!/\s--bun\b/.test(flags)) {
          failures.push(
            `${path} script "${name}" runs bunx without --bun; it would execute under Node`,
          )
        }
      }

      for (const m of script.matchAll(
        /(?:^|(?:&&|\|\||[|;])\s*)(?:[A-Z_][A-Z0-9_]*=\S+\s+)*([^\s]+)/g,
      )) {
        const command = m[1] as string

        if (localBins.has(command)) {
          failures.push(
            `${path} script "${name}" runs ${command} directly; use bunx --bun ${command}`,
          )
        }
      }
    }
  }

  return { rule: 'BUN-04', what: 'package scripts run JS/TS CLIs through bunx --bun', failures }
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
  throw new Error('rule checks failed')
}

console.log(`\n${results.length} rule checks passed.`)
