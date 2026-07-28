import { afterAll, describe, expect, it, mock } from 'bun:test'

/**
 * Request id derivation, and its propagation to the API.
 *
 * Both live in one file on purpose. `mock.module` replaces a module for the
 * whole process (RULES.md TEST-02), so splitting these would leave two files
 * mocking `@tanstack/react-start/server` and whichever ran last would win for
 * both — the exact footgun the API's suite is arranged to avoid.
 *
 * `getRequest()` reads Start's `AsyncLocalStorage`, which only exists while the
 * server runtime is handling a request. Mocking it lets the tests choose
 * whether there is an ambient request, including the off-request case, where
 * the real function throws rather than returning undefined.
 */
let ambient: Request | undefined

mock.module('@tanstack/react-start/server', () => ({
  getRequest: () => {
    if (!ambient) {
      // The real message, so the test fails the way production would.
      throw new Error(
        'No StartEvent found in AsyncLocalStorage. Make sure you are using the function within the server runtime.',
      )
    }
    return ambient
  },
}))

const { REQUEST_ID_HEADER, currentRequestId, requestIdFor } = await import('./request-id.server.ts')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const withId = (id: string) =>
  new Request('https://web.test/users', { headers: { [REQUEST_ID_HEADER]: id } })

describe('requestIdFor', () => {
  it('forwards an id an upstream proxy already set', () => {
    expect(requestIdFor(withId('trace-abc123'))).toBe('trace-abc123')
  })

  it('generates a UUID when the request carries no id', () => {
    expect(requestIdFor(new Request('https://web.test/users'))).toMatch(UUID)
  })

  it('returns the same id every time for one request', () => {
    const request = new Request('https://web.test/users')

    expect(requestIdFor(request)).toBe(requestIdFor(request))
  })

  it('gives separate requests separate ids', () => {
    const a = requestIdFor(new Request('https://web.test/users'))
    const b = requestIdFor(new Request('https://web.test/users'))

    expect(a).not.toBe(b)
  })

  /**
   * These mirror Hono's `requestId()` bounds. An id the API rejects is worse
   * than none: it silently generates its own, so both services log a
   * `requestId` and look correlated while holding different values.
   */
  describe('rejects what the API would reject', () => {
    // `\w`, `-` and `=` are the characters Hono allows.
    it.each([
      ['a space', 'bad id'],
      ['punctuation', 'bad!id'],
      ['a slash', 'bad/id'],
      ['an empty string', ''],
    ])('replaces %s with a generated UUID', (_label, value) => {
      expect(requestIdFor(withId(value))).toMatch(UUID)
    })

    /**
     * Header injection is not something `normalize` has to defend against: the
     * `Headers` constructor rejects a value containing CR or LF outright, so it
     * cannot reach us through a real request. Pinned because it explains why the
     * character check above does not need to be a header-safety check.
     */
    it('cannot receive a newline — the platform rejects it first', () => {
      expect(() => withId('bad\nid')).toThrow(TypeError)
    })

    it('accepts the characters Hono allows', () => {
      expect(requestIdFor(withId('Trace_9-a=='))).toBe('Trace_9-a==')
    })

    it('accepts an id of exactly the 255-character limit', () => {
      const id = 'a'.repeat(255)

      expect(requestIdFor(withId(id))).toBe(id)
    })

    it('replaces an id one character over the limit', () => {
      expect(requestIdFor(withId('a'.repeat(256)))).toMatch(UUID)
    })
  })
})

describe('currentRequestId', () => {
  it('is undefined outside a request, rather than inventing an id', () => {
    ambient = undefined

    expect(currentRequestId()).toBeUndefined()
  })

  it('resolves the ambient request while one is being handled', () => {
    ambient = withId('trace-ambient')

    expect(currentRequestId()).toBe('trace-ambient')
  })

  it('agrees with requestIdFor for the same request', () => {
    ambient = new Request('https://web.test/users')

    expect(currentRequestId()).toBe(requestIdFor(ambient))
  })
})

/**
 * The propagation itself, through the real `hc` client.
 *
 * A stub on `API_URL` rather than a mocked `fetch`: the header is set inside the
 * client's own fetch wrapper, so asserting on what actually arrives is the only
 * way to catch it being dropped by Hono's request construction.
 */
describe('api.server forwards the id to the API', () => {
  const received: Array<string | null> = []

  const stub = Bun.serve({
    port: 3097,
    fetch(request) {
      received.push(request.headers.get(REQUEST_ID_HEADER))
      return Response.json({ data: [] })
    },
  })

  afterAll(() => stub.stop(true))

  it('sends the ambient request id', async () => {
    const { api } = await import('./api.server.ts')
    ambient = withId('trace-propagated')

    await api.api.users.$get({ query: {} })

    expect(received.at(-1)).toBe('trace-propagated')
  })

  it('sends a generated id when the browser supplied none', async () => {
    const { api } = await import('./api.server.ts')
    ambient = new Request('https://web.test/users')

    await api.api.users.$get({ query: {} })

    expect(received.at(-1)).toMatch(UUID)
  })

  it('sends no id at all outside a request', async () => {
    const { api } = await import('./api.server.ts')
    ambient = undefined

    await api.api.users.$get({ query: {} })

    expect(received.at(-1)).toBeNull()
  })
})
