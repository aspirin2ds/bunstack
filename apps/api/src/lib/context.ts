import type { RequestIdVariables } from 'hono/request-id'

import type { Logger } from './logger.ts'

/**
 * Shared Hono environment. Lives here rather than in `app.ts` so middleware can
 * type its context without importing the app and creating a cycle.
 */
export type AppEnv = {
  Variables: RequestIdVariables & {
    /** Request-scoped logger, pre-bound to this request's id. */
    logger: Logger
  }
}
