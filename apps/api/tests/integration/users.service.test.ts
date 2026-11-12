import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'

import { closeDatabase, db } from '../../src/db/index.ts'
import { AppError } from '../../src/lib/errors.ts'
import * as users from '../../src/services/users.ts'
import { isPostgresReachable, setupTestDatabase, truncateAll } from '../helpers/database.ts'

/**
 * Exercises the service layer against a real PostgreSQL instance. The route
 * tests mock this layer out, so without these the SQL, the constraints and the
 * driver's error shapes are never actually executed — which is how a unique
 * violation once surfaced as a 500 instead of a 409.
 *
 * Skips itself when no database is reachable so the suite still passes with
 * nothing running. Start one with `docker compose up -d postgres`.
 *
 * Lives outside `src/` so `bun run test:unit` and `bun run test:integration`
 * are separate processes. `mock.module` in the route tests replaces the service
 * module for the whole process, so running both together would silently feed
 * these tests the mock instead of the real implementation.
 */
const reachable = await isPostgresReachable()

if (!reachable) {
  console.warn(
    '\n  ⚠ skipping integration tests: no PostgreSQL at DATABASE_URL' +
      '\n    start one with `docker compose up -d postgres`\n',
  )
}

describe.skipIf(!reachable)('users service (integration)', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  beforeEach(async () => {
    await truncateAll()
  })

  afterAll(async () => {
    await closeDatabase()
  })

  const input = { email: 'ada@example.com', name: 'Ada Lovelace' }

  describe('createUser', () => {
    it('persists a user and returns it with generated columns', async () => {
      const user = await users.createUser(input)

      expect(user.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(user.email).toBe(input.email)
      expect(user.createdAt).toBeInstanceOf(Date)

      // Round-trips through the database, not just the return value.
      await expect(users.getUser(user.id)).resolves.toMatchObject({
        email: input.email,
      })
    })

    it('maps a duplicate email to a conflict, not a 500', async () => {
      await users.createUser(input)

      // The regression that motivated this suite: Bun reports the SQLSTATE on
      // `errno` and Drizzle wraps the error in `.cause`.
      const error = await users.createUser({ ...input, name: 'Impostor' }).catch((e) => e)

      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe('conflict')
      expect((error as AppError).status).toBe(409)
    })
  })

  describe('getUser', () => {
    it('throws not_found for an unknown id', async () => {
      const error = await users.getUser('00000000-0000-4000-8000-000000000000').catch((e) => e)

      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe('not_found')
    })
  })

  describe('listUsers', () => {
    beforeEach(async () => {
      // Sequential, not Promise.all: createdAt ordering is asserted below.
      for (const n of [1, 2, 3]) {
        await users.createUser({
          email: `user${n}@example.com`,
          name: `User ${n}`,
        })
      }
    })

    it('orders by createdAt ascending', async () => {
      const all = await users.listUsers({ limit: 10, offset: 0 })

      expect(all.map((u) => u.name)).toEqual(['User 1', 'User 2', 'User 3'])
    })

    it('applies limit and offset', async () => {
      const page = await users.listUsers({ limit: 2, offset: 1 })

      expect(page.map((u) => u.name)).toEqual(['User 2', 'User 3'])
    })

    it('returns an empty array past the end', async () => {
      await expect(users.listUsers({ limit: 10, offset: 99 })).resolves.toEqual([])
    })

    it('uses id to break timestamp ties across page boundaries', async () => {
      // Give every row the same timestamp so only the secondary ordering can help.
      await db.$client`update users set created_at = '2026-01-01T00:00:00Z'`
      const expected = (await db.$client`select id from users order by id`).map(
        (row: { id: string }) => row.id,
      )
      const first = await users.listUsers({ limit: 2, offset: 0 })
      const second = await users.listUsers({ limit: 2, offset: 2 })
      expect([...first, ...second].map((row) => row.id)).toEqual(expected)
    })
  })

  it('stops a long query and releases the connection for subsequent work', async () => {
    // A separate process boots the actual app pool with a short deadline, without
    // changing the pool used by the rest of this suite.
    const child = Bun.spawn(
      [
        Bun.argv[0]!,
        '-e',
        `
      import { db, closeDatabase } from './src/db/index.ts'
      try {
        let cancelled = false
        try { await db.$client\`select pg_sleep(1)\` }
        catch (error) { if (error.errno !== '57014') throw error; cancelled = true }
        if (!cancelled) throw new Error('statement was not cancelled')
        const rows = await db.$client\`select 1 as ok\`
        if (rows[0].ok !== 1) throw new Error('pool did not recover')
      } finally { await closeDatabase() }
      `,
      ],
      {
        env: { ...Bun.env, REQUEST_TIMEOUT_MS: '50', DB_POOL_MAX: '1' },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    )
    const output = await new Response(child.stderr).text()
    expect(await child.exited, output).toBe(0)
  })

  describe('updateUser', () => {
    it('applies a partial update and bumps updatedAt', async () => {
      const created = await users.createUser(input)

      // $onUpdate uses a JS timestamp; without a gap the two can be equal.
      await Bun.sleep(5)
      const updated = await users.updateUser(created.id, { name: 'Ada L.' })

      expect(updated.name).toBe('Ada L.')
      expect(updated.email).toBe(input.email)
      expect(updated.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime())
      expect(updated.createdAt.getTime()).toBe(created.createdAt.getTime())
    })

    it('rejects an empty patch', async () => {
      const created = await users.createUser(input)
      const error = await users.updateUser(created.id, {}).catch((e) => e)

      expect((error as AppError).code).toBe('bad_request')
    })

    it('maps a collision with an existing email to a conflict', async () => {
      const first = await users.createUser(input)
      await users.createUser({ email: 'grace@example.com', name: 'Grace' })

      const error = await users.updateUser(first.id, { email: 'grace@example.com' }).catch((e) => e)

      expect((error as AppError).code).toBe('conflict')
    })

    it('throws not_found for an unknown id', async () => {
      const error = await users
        .updateUser('00000000-0000-4000-8000-000000000000', { name: 'Nobody' })
        .catch((e) => e)

      expect((error as AppError).code).toBe('not_found')
    })
  })

  describe('deleteUser', () => {
    it('removes the row', async () => {
      const created = await users.createUser(input)

      await users.deleteUser(created.id)

      await expect(users.listUsers({ limit: 10, offset: 0 })).resolves.toEqual([])
    })

    it('throws not_found when deleting twice', async () => {
      const created = await users.createUser(input)
      await users.deleteUser(created.id)

      const error = await users.deleteUser(created.id).catch((e) => e)

      expect((error as AppError).code).toBe('not_found')
    })
  })
})
