import { describe, expect, it } from 'bun:test'

import { ApiError, type JsonResponse, unwrap, unwrapEmpty } from './index.ts'

/**
 * These run with no database and no API — `unwrap` is typed against a structural
 * response shape, so a real `Response` stands in for an `hc` call.
 *
 * The failure paths are the point. The envelope contract between the two apps is
 * asserted here rather than only in the browser, where a regression would surface
 * as an unhelpful toast.
 */
function respond<T>(body: string | null, status: number): JsonResponse<T> {
  // A real Response, so `.json()` fails on a non-JSON or empty body exactly as it
  // would in production. Only the static type is narrowed, never the behaviour.
  const response = new Response(body, {
    status,
    headers: { 'content-type': 'application/json' },
  })

  return {
    ok: response.ok,
    status: response.status,
    json: () => response.json() as Promise<T>,
  }
}

const json = <T>(body: T, status: number) => respond<T>(JSON.stringify(body), status)

const errorBody = (code: string, message: string, extra: Record<string, unknown> = {}) => ({
  error: { code, message, ...extra },
})

describe('unwrap', () => {
  it('returns the data out of the envelope', async () => {
    const users = [{ id: 'a', name: 'Ada' }]

    expect(await unwrap(json({ data: users }, 200))).toEqual(users)
  })

  it('throws ApiError carrying the code, status and requestId', async () => {
    const response = json(
      errorBody('conflict', 'That email is already taken', { requestId: 'req-123' }),
      409,
    )

    const error = (await unwrap(response).catch((e) => e)) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(409)
    expect(error.code).toBe('conflict')
    expect(error.message).toBe('That email is already taken')
    expect(error.requestId).toBe('req-123')
    expect(error.isClientError).toBe(true)
  })

  it('surfaces validation details so a form can point at a field', async () => {
    const details = [{ path: 'email', message: 'Invalid email' }]
    const response = json(errorBody('bad_request', 'Invalid request json', { details }), 400)

    const error = (await unwrap(response).catch((e) => e)) as ApiError

    expect(error.details).toEqual(details)
  })

  /**
   * A proxy, gateway or crashed process answers with HTML or nothing at all. The
   * status is the only trustworthy signal then, and it must survive — reporting a
   * JSON parse error instead would hide a 502 behind a syntax complaint.
   */
  it('keeps the status when the error body is not our envelope', async () => {
    const response = respond<never>('<html>502 Bad Gateway</html>', 502)

    const error = (await unwrap(response).catch((e) => e)) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(502)
    expect(error.code).toBe('internal')
    expect(error.message).toContain('502')
    expect(error.isClientError).toBe(false)
  })

  it('treats a 5xx as not a client error', async () => {
    const response = json(errorBody('internal', 'Internal server error'), 500)

    const error = (await unwrap(response).catch((e) => e)) as ApiError

    expect(error.isClientError).toBe(false)
  })
})

describe('unwrapEmpty', () => {
  it('resolves for 204, without trying to parse a body', async () => {
    expect(await unwrapEmpty(respond<never>(null, 204))).toBeUndefined()
  })

  it('throws ApiError when a delete fails', async () => {
    const response = json(errorBody('not_found', 'No such user'), 404)

    const error = (await unwrapEmpty(response).catch((e) => e)) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe('not_found')
  })
})
