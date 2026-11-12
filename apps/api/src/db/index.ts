import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sql'

import { env } from '../env.ts'
import * as schema from './schema.ts'

/**
 * Drizzle client backed by Bun's built-in Postgres driver (`bun:sql`), so this
 * project needs no `pg` / `postgres` dependency. Connections are opened lazily
 * on first query and pooled thereafter.
 */
export const db = drizzle({
  schema,
  connection: {
    url: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
    idleTimeout: env.DB_IDLE_TIMEOUT,
    connectionTimeout: env.DB_CONNECTION_TIMEOUT,
    maxLifetime: env.DB_MAX_LIFETIME,
    // HTTP timeouts do not cancel SQL. PostgreSQL must stop long-running statements
    // itself so a blocked query cannot keep a pooled connection indefinitely.
    connection: { statement_timeout: env.REQUEST_TIMEOUT_MS },
  },
})

export type Database = typeof db

/**
 * Drains the pool at explicit lifecycle boundaries such as migrations and tests.
 */
export async function closeDatabase(timeoutSeconds = 5): Promise<void> {
  await db.$client.close({ timeout: timeoutSeconds })
}

/** Cheap liveness probe used by the `/health/db` route. */
export async function checkDatabase(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`)
    return true
  } catch {
    return false
  }
}

/** PostgreSQL's statement deadline, including Drizzle's wrapped driver errors. */
export function isStatementTimeout(error: unknown): boolean {
  for (let current = error, depth = 0; current && depth < 5; depth++) {
    if (typeof current !== 'object') break
    const { errno, code, message, cause } = current as {
      errno?: unknown
      code?: unknown
      message?: unknown
      cause?: unknown
    }
    if (
      (errno === '57014' || code === '57014') &&
      typeof message === 'string' &&
      message.includes('statement timeout')
    )
      return true
    current = cause
  }
  return false
}

/** Postgres SQLSTATE for a unique-constraint violation. */
const UNIQUE_VIOLATION = '23505'

/**
 * Detects a unique-constraint violation.
 *
 * Two quirks make this less obvious than it looks, both verified against a live
 * database rather than assumed:
 *   - Drizzle wraps driver errors in a `DrizzleQueryError`, so the real error is
 *     on `.cause`.
 *   - Bun's driver puts the SQLSTATE on `errno`; its `code` is the generic
 *     `"ERR_POSTGRES_SERVER_ERROR"`.
 *
 * The cause chain is walked, and `code` and the message are also checked so this
 * keeps working if either detail changes.
 */
export function isUniqueViolation(error: unknown): boolean {
  for (let current = error, depth = 0; current != null && depth < 5; depth++) {
    if (typeof current !== 'object') break

    const { errno, code, message, cause } = current as {
      errno?: unknown
      code?: unknown
      message?: unknown
      cause?: unknown
    }

    if (errno === UNIQUE_VIOLATION || code === UNIQUE_VIOLATION) return true
    if (typeof message === 'string' && message.includes('duplicate key value')) return true

    current = cause
  }

  return false
}
