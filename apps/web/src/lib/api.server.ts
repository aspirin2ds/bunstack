import { createApiClient } from '@repo/api-client'

import { env } from '../env.server.ts'

/**
 * The web app's single connection to the API.
 *
 * `.server.ts`, so import protection keeps it out of the browser bundle: the API
 * is reached from loaders and server functions only, and `API_URL` points at an
 * internal hostname (`http://api:3000` in compose) that a browser could not
 * resolve anyway.
 *
 * RULES.md WS-05: this is the whole integration surface. The web app holds no
 * `DATABASE_URL` and never imports the API's runtime code — only the types that
 * make these calls checked at compile time.
 */
export const api = createApiClient({
  baseUrl: env.API_URL,

  /**
   * A per-call deadline. Without one, a wedged API turns every page render into
   * a hung request that holds a connection until the client gives up — the same
   * reasoning as the API's own `timeout()` middleware (RULES.md OPS-05).
   */
  fetch: (input, init) =>
    fetch(input, { ...init, signal: AbortSignal.timeout(env.API_TIMEOUT_MS) }),
})
