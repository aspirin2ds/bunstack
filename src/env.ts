import { z } from 'zod'

/**
 * Validated process environment. Import `env` from here rather than touching
 * `process.env` directly so a missing or malformed variable fails at boot
 * instead of at the first request that happens to need it.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

  // Connection pool. Bun's defaults are max=10 / maxLifetime=0; these are
  // surfaced as env so the pool can be sized per deployment. Keep
  // DB_POOL_MAX * replicas below Postgres `max_connections` (default 100).
  DB_POOL_MAX: z.coerce.number().int().positive().max(1000).default(10),
  DB_IDLE_TIMEOUT: z.coerce.number().int().nonnegative().default(30),
  DB_CONNECTION_TIMEOUT: z.coerce.number().int().nonnegative().default(10),
  DB_MAX_LIFETIME: z.coerce.number().int().nonnegative().default(0),

  // Largest accepted request body, in bytes.
  BODY_LIMIT_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(1024 * 1024),
  // Request deadline; exceeding it returns 504.
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  /**
   * Comma-separated allowed origins, e.g. `https://a.com,https://b.com`.
   * Unset means the CORS middleware is not mounted at all — a same-origin API
   * should not be advertising cross-origin access.
   */
  CORS_ORIGINS: z
    .string()
    .optional()
    .transform((raw) =>
      raw
        ? raw
            .split(',')
            .map((origin) => origin.trim())
            .filter(Boolean)
        : [],
    ),
})

export type Env = z.infer<typeof EnvSchema>

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env)

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
