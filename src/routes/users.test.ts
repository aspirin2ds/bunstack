import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { User } from '../db/schema.ts'
import { AppError } from '../lib/errors.ts'

/**
 * The service layer is mocked, so these tests exercise routing, validation and
 * error rendering without a database. That separation is the payoff of keeping
 * `routes -> services -> db` one-directional.
 *
 * `mock.module` must run before the module under test is imported, hence the
 * dynamic import below.
 */
const sampleUser: User = {
  id: '3f6d1b8e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
}

const listUsers = mock(async () => [sampleUser])
const getUser = mock(async () => sampleUser)
const createUser = mock(async () => sampleUser)
const updateUser = mock(async () => sampleUser)
const deleteUser = mock(async () => {})

mock.module('../services/users.ts', () => ({
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
}))

const { app } = await import('../app.ts')

beforeEach(() => {
  for (const fn of [listUsers, getUser, createUser, updateUser, deleteUser]) {
    fn.mockClear()
  }
})

describe('GET /health', () => {
  it('reports ok', async () => {
    const res = await app.request('/health')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })
})

describe('GET /api/users', () => {
  it('returns users and applies default pagination', async () => {
    const res = await app.request('/api/users')

    expect(res.status).toBe(200)
    expect(listUsers).toHaveBeenCalledWith({ limit: 20, offset: 0 })

    const body = (await res.json()) as { data: unknown[] }
    expect(body.data).toHaveLength(1)
  })

  it('coerces query params from strings', async () => {
    await app.request('/api/users?limit=5&offset=10')

    expect(listUsers).toHaveBeenCalledWith({ limit: 5, offset: 10 })
  })

  it('rejects an out-of-range limit', async () => {
    const res = await app.request('/api/users?limit=500')

    expect(res.status).toBe(400)
    expect(listUsers).not.toHaveBeenCalled()

    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('bad_request')
  })
})

describe('POST /api/users', () => {
  it('creates a user', async () => {
    const res = await app.request('/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ada@example.com', name: 'Ada Lovelace' }),
    })

    expect(res.status).toBe(201)
    expect(createUser).toHaveBeenCalledWith({ email: 'ada@example.com', name: 'Ada Lovelace' })
  })

  it('rejects a malformed email before reaching the service', async () => {
    const res = await app.request('/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', name: 'Ada' }),
    })

    expect(res.status).toBe(400)
    expect(createUser).not.toHaveBeenCalled()

    const body = (await res.json()) as { error: { details: { path: string }[] } }
    expect(body.error.details[0]?.path).toBe('email')
  })

  it('maps a service conflict to 409', async () => {
    createUser.mockImplementationOnce(async () => {
      throw AppError.conflict('A user with email ada@example.com already exists')
    })

    const res = await app.request('/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ada@example.com', name: 'Ada' }),
    })

    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('conflict')
  })
})

describe('GET /api/users/:id', () => {
  it('rejects a non-uuid id', async () => {
    const res = await app.request('/api/users/not-a-uuid')

    expect(res.status).toBe(400)
    expect(getUser).not.toHaveBeenCalled()
  })

  it('maps a service not-found to 404', async () => {
    getUser.mockImplementationOnce(async () => {
      throw AppError.notFound('No user with that id')
    })

    const res = await app.request(`/api/users/${sampleUser.id}`)

    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/users/:id', () => {
  it('returns 204 with no body', async () => {
    const res = await app.request(`/api/users/${sampleUser.id}`, { method: 'DELETE' })

    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    expect(deleteUser).toHaveBeenCalledWith(sampleUser.id)
  })
})

describe('unknown routes', () => {
  it('render the standard error envelope', async () => {
    const res = await app.request('/nope')

    expect(res.status).toBe(404)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('not_found')
  })
})

describe('security middleware', () => {
  it('sets secure headers on responses', async () => {
    const res = await app.request('/health')

    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN')
  })

  it('does not send CORS headers when no origins are configured', async () => {
    const res = await app.request('/health', { headers: { origin: 'https://evil.example' } })

    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('rejects an oversized body with 413 in the standard envelope', async () => {
    // BODY_LIMIT_BYTES defaults to 1 MiB.
    const res = await app.request('/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@example.com', name: 'x'.repeat(2 * 1024 * 1024) }),
    })

    expect(res.status).toBe(413)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('payload_too_large')
    expect(createUser).not.toHaveBeenCalled()
  })
})
