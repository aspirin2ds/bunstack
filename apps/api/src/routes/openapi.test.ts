import { describe, expect, it } from 'bun:test'

import { app } from '../app.ts'

/**
 * The spec is generated from the same schemas the routes validate with, so it
 * cannot drift from the implementation — but it *can* silently stop being
 * served, or lose a route that was converted back to a plain `app.get`. These
 * tests pin the contract itself.
 *
 * No `mock.module` here: the spec is built at registration time and never
 * touches the service layer or a database.
 */
type Spec = {
  openapi: string
  info: { title: string; version: string }
  paths: Record<string, Record<string, { responses: Record<string, unknown> }>>
  components?: { schemas?: Record<string, unknown> }
}

async function fetchSpec(): Promise<Spec> {
  const res = await app.request('/openapi.json')

  expect(res.status).toBe(200)

  return (await res.json()) as Spec
}

describe('OpenAPI document', () => {
  it('is served and well-formed', async () => {
    const spec = await fetchSpec()

    expect(spec.openapi).toBe('3.0.0')
    expect(spec.info.title).toBeTruthy()
    expect(spec.info.version).toBeTruthy()
  })

  it('registers every users route with its documented status codes', async () => {
    const { paths } = await fetchSpec()

    const documented = Object.entries(paths).flatMap(([path, ops]) =>
      Object.entries(ops).map(([method, op]) => [
        `${method} ${path}`,
        Object.keys(op.responses).sort(),
      ]),
    )

    expect(Object.fromEntries(documented)).toEqual({
      'get /api/users': ['200', '400'],
      'post /api/users': ['201', '400', '409', '413'],
      'get /api/users/{id}': ['200', '400', '404'],
      'patch /api/users/{id}': ['200', '400', '404', '409'],
      'delete /api/users/{id}': ['204', '400', '404'],
    })
  })

  it('exposes the shared component schemas', async () => {
    const spec = await fetchSpec()

    expect(Object.keys(spec.components?.schemas ?? {}).sort()).toEqual([
      'CreateUser',
      'Error',
      'UpdateUser',
      'User',
    ])
  })

  it('describes timestamps as ISO strings, matching what the API returns', async () => {
    const spec = await fetchSpec()
    const user = spec.components?.schemas?.User as {
      properties: Record<string, { type: string; format?: string }>
    }

    expect(user.properties.createdAt).toMatchObject({
      type: 'string',
      format: 'date-time',
    })
  })

  it('serves the reference UI', async () => {
    const res = await app.request('/docs')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
  })
})
