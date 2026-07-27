import { SQL } from 'bun'
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/bun-sql/migrator'
import { db } from '../../src/db/index.ts'
import { env } from '../../src/env.ts'

/**
 * Helpers for integration tests that run against a real PostgreSQL instance.
 * Only imported from `*.integration.test.ts`; nothing here ships in the app.
 */

/** `postgres://…/appdb_test` -> `postgres://…/postgres`, for CREATE DATABASE. */
function adminUrl(): { url: string; database: string } {
  const parsed = new URL(env.DATABASE_URL)
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''))

  parsed.pathname = '/postgres'

  return { url: parsed.toString(), database }
}

/**
 * True if the server is reachable at all. Integration suites skip themselves
 * when it isn't, so `bun test` still works with no database running.
 */
export async function isPostgresReachable(): Promise<boolean> {
  const { url } = adminUrl()
  const admin = new SQL({ url, connectionTimeout: 3, max: 1 })

  try {
    await admin`select 1`
    return true
  } catch {
    return false
  } finally {
    await admin.close({ timeout: 1 }).catch(() => {})
  }
}

/**
 * Creates the test database if absent, then brings it up to date with the
 * committed migrations — the same ones production runs, so a schema drift
 * shows up here rather than at deploy time.
 */
export async function setupTestDatabase(): Promise<void> {
  const { url, database } = adminUrl()
  const admin = new SQL({ url, connectionTimeout: 5, max: 1 })

  try {
    const existing = await admin`select 1 from pg_database where datname = ${database}`

    if (existing.length === 0) {
      // CREATE DATABASE cannot be parameterised or run inside a transaction.
      await admin.unsafe(`create database "${database.replace(/"/g, '""')}"`)
    }
  } finally {
    await admin.close({ timeout: 1 }).catch(() => {})
  }

  await migrate(db, { migrationsFolder: './drizzle' })
}

/**
 * Empties every application table between tests. Discovered from the catalog
 * rather than hard-coded, so new tables are covered automatically; Drizzle's
 * own migration bookkeeping lives in the `drizzle` schema and is left alone.
 */
export async function truncateAll(): Promise<void> {
  const tables = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  )

  const names = Array.from(tables).map((row) => `"public"."${row.tablename}"`)

  if (names.length === 0) return

  await db.execute(sql.raw(`truncate table ${names.join(', ')} restart identity cascade`))
}
