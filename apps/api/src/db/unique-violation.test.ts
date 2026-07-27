import { describe, expect, it } from 'bun:test'

import { isUniqueViolation } from './index.ts'

/**
 * Regression tests. The shapes below were captured from a live Postgres 18 via
 * `drizzle-orm/bun-sql`, not invented: Bun reports the SQLSTATE on `errno`
 * (its `code` is the generic `ERR_POSTGRES_SERVER_ERROR`), and Drizzle wraps
 * the driver error in a `DrizzleQueryError` under `cause`.
 */
function bunPostgresError() {
  return Object.assign(
    new Error('duplicate key value violates unique constraint "users_email_key"'),
    {
      name: 'PostgresError',
      code: 'ERR_POSTGRES_SERVER_ERROR',
      errno: '23505',
      constraint: 'users_email_key',
    },
  )
}

describe('isUniqueViolation', () => {
  it('detects the raw Bun driver error', () => {
    expect(isUniqueViolation(bunPostgresError())).toBe(true)
  })

  it('detects it through a Drizzle wrapper', () => {
    const wrapped = Object.assign(new Error('Failed query: insert into "users" ...'), {
      cause: bunPostgresError(),
    })

    expect(isUniqueViolation(wrapped)).toBe(true)
  })

  it('detects a driver that reports the SQLSTATE on `code` instead', () => {
    expect(isUniqueViolation(Object.assign(new Error('nope'), { code: '23505' }))).toBe(true)
  })

  it('ignores unrelated database errors', () => {
    const notNull = Object.assign(new Error('null value in column "email" violates not-null'), {
      name: 'PostgresError',
      code: 'ERR_POSTGRES_SERVER_ERROR',
      errno: '23502',
    })

    expect(isUniqueViolation(notNull)).toBe(false)
  })

  it('handles non-errors and cycles without throwing', () => {
    const cyclic: { cause?: unknown } = {}
    cyclic.cause = cyclic

    expect(isUniqueViolation(cyclic)).toBe(false)
    expect(isUniqueViolation(null)).toBe(false)
    expect(isUniqueViolation('23505')).toBe(false)
  })
})
