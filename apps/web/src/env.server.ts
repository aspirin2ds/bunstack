import { z } from 'zod'

/**
 * Validated server environment for the web app.
 *
 * **The `.server.ts` suffix is load-bearing.** TanStack Start's import
 * protection denies `**\/*.server.*` in the client environment by default, so
 * importing this from a component fails the build instead of inlining the values
 * into the browser bundle.
 *
 * Start's portable guidance is to read the environment per-request rather than at module
 * scope, because on edge runtimes (Cloudflare Workers) the environment does not
 * exist yet at module evaluation time. This template deploys to Bun, where the
 * environment is present before any module runs, so it keeps the API's
 * fail-fast-at-boot behaviour instead (RULES.md CFG-01): a missing `API_URL`
 * stops the process at startup rather than breaking the first page that loads.
 * **If you ever target Workers, this file has to become a per-request read.**
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // 3001 so it does not collide with the API's 3000 during local development.
  PORT: z.coerce.number().int().positive().max(65535).default(3001),

  /**
   * Base URL of the API. Server-side only — the browser never talks to the API
   * directly, so this is not a `VITE_`-prefixed (public) variable.
   * In compose this is the service name: `http://api:3000`.
   */
  API_URL: z.url({ protocol: /^https?$/ }),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  /** Deadline for a single call to the API, in milliseconds. */
  API_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
})

export type Env = z.infer<typeof EnvSchema>

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(Bun.env)

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')

    throw new Error(`Invalid environment configuration:\n${problems}`)
  }

  return parsed.data
}

export const env = loadEnv()

export const isProduction = env.NODE_ENV === 'production'
